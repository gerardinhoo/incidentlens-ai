#!/usr/bin/env bash
# Deployed Sprint 4 pipeline integration verification (SCRUM-36).
#
# Flow:
#   1) Optional read-only AWS config verify
#   2) GET /test-error once → processor logs → DynamoDB GetItem
#   3) Deterministic CloudWatch envelope ×2 → create then duplicate
#
# Usage (from anywhere):
#   API_URL=https://....amazonaws.com \
#   AWS_REGION=us-east-1 \
#   INCIDENTS_TABLE_NAME=incidentlens-dev-incidents \
#   PROCESSOR_FUNCTION_NAME=incidentlens-dev-processor \
#   PROCESSOR_LOG_GROUP_NAME=/aws/lambda/incidentlens-dev-processor \
#   API_LOG_GROUP_NAME=/aws/lambda/incidentlens-dev-api \
#   ./scripts/verify-incident-pipeline.sh
#
# Env:
#   API_URL                    Required for live /test-error path
#   AWS_REGION                 Default: us-east-1
#   INCIDENTS_TABLE_NAME       Default: incidentlens-dev-incidents
#   PROCESSOR_FUNCTION_NAME    Default: incidentlens-dev-processor
#   PROCESSOR_LOG_GROUP_NAME   Default: /aws/lambda/<processor>
#   API_LOG_GROUP_NAME         Default: /aws/lambda/incidentlens-dev-api
#   PIPELINE_TIMEOUT_SEC       Default: 120 (subscription delivery poll)
#   PIPELINE_POLL_SEC          Default: 5
#   RUN_CONFIG_VERIFY          Default: true (calls verify-aws-deployment.sh)
#   SKIP_API_TRIGGER           Default: false
#   SKIP_IDEMPOTENCY_REPLAY    Default: false
#   PIPELINE_OUT_DIR           Default: <repo>/artifacts/pipeline-integration
#   GITHUB_SHA                 Optional — used for deterministic replay sourceEventId
#
# Does not run on pull requests. Creates controlled test incidents (no delete).
# Two separate /test-error calls are NOT used for idempotency (different event IDs).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${PIPELINE_OUT_DIR:-${ROOT}/artifacts/pipeline-integration}"
mkdir -p "${OUT_DIR}"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/il-pipeline.XXXXXX")"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

SUMMARY="${OUT_DIR}/pipeline-summary.md"
STATUS_JSON="${OUT_DIR}/pipeline-status.json"
COMMIT_SHA="${GITHUB_SHA:-$(git -C "${ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)}"

API_URL="${API_URL:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"
INCIDENTS_TABLE_NAME="${INCIDENTS_TABLE_NAME:-incidentlens-dev-incidents}"
PROCESSOR_FUNCTION_NAME="${PROCESSOR_FUNCTION_NAME:-incidentlens-dev-processor}"
PROCESSOR_LOG_GROUP_NAME="${PROCESSOR_LOG_GROUP_NAME:-/aws/lambda/${PROCESSOR_FUNCTION_NAME}}"
API_LOG_GROUP_NAME="${API_LOG_GROUP_NAME:-/aws/lambda/incidentlens-dev-api}"
PIPELINE_TIMEOUT_SEC="${PIPELINE_TIMEOUT_SEC:-120}"
PIPELINE_POLL_SEC="${PIPELINE_POLL_SEC:-5}"
RUN_CONFIG_VERIFY="${RUN_CONFIG_VERIFY:-true}"
SKIP_API_TRIGGER="${SKIP_API_TRIGGER:-false}"
SKIP_IDEMPOTENCY_REPLAY="${SKIP_IDEMPOTENCY_REPLAY:-false}"
EXPECTED_SOURCE="${EXPECTED_SOURCE:-incidentlens-demo-api}"
EXPECTED_SEVERITY="${EXPECTED_SEVERITY:-high}"

export AWS_DEFAULT_REGION="${AWS_REGION}"

pass_api="skipped"
pass_delivery="skipped"
pass_persist="skipped"
pass_ddb="skipped"
pass_idem_first="skipped"
pass_idem_second="skipped"
pass_config="skipped"
INCIDENT_ID=""
API_REQUEST_ID=""
REPLAY_INCIDENT_ID=""

fail() {
  local reason="$1"
  {
    echo "# Sprint 4 pipeline integration"
    echo ""
    echo "- Result: **FAIL**"
    echo "- Reason: \`${reason}\`"
    echo "- Commit: \`${COMMIT_SHA}\`"
    echo "- Region: \`${AWS_REGION}\`"
  } >"${SUMMARY}"
  echo "{\"passed\":false,\"reason\":\"${reason}\",\"commitSha\":\"${COMMIT_SHA}\"}" >"${STATUS_JSON}"
  echo "ERROR: ${reason}" >&2
  exit 1
}

for cmd in aws curl python3 node; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    fail "missing_command_${cmd}"
  fi
done

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  fail "aws_credentials_unavailable"
fi

if [[ -z "${API_URL}" && "${SKIP_API_TRIGGER}" != "true" ]]; then
  fail "API_URL_required"
fi
API_URL="${API_URL%/}"

echo "==> Sprint 4 pipeline integration (commit ${COMMIT_SHA})"
echo "    Out: ${OUT_DIR}"

# --- Phase 1: read-only config ---
if [[ "${RUN_CONFIG_VERIFY}" == "true" ]]; then
  echo "==> Phase 1: AWS configuration verification (read-only)"
  VERIFY_OUT_DIR="${OUT_DIR}" \
    AWS_REGION="${AWS_REGION}" \
    LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-incidentlens-dev-api}" \
    PROCESSOR_FUNCTION_NAME="${PROCESSOR_FUNCTION_NAME}" \
    DYNAMODB_TABLE_NAME="${INCIDENTS_TABLE_NAME}" \
    LAMBDA_LOG_GROUP="${API_LOG_GROUP_NAME}" \
    PROCESSOR_LOG_GROUP="${PROCESSOR_LOG_GROUP_NAME}" \
    ACCESS_LOG_GROUP="${ACCESS_LOG_GROUP:-/aws/apigateway/incidentlens-dev-api-access}" \
    "${ROOT}/scripts/verify-aws-deployment.sh" \
    || fail "aws_configuration_verify_failed"
  # Copy summary under pipeline naming if present
  if [[ -f "${OUT_DIR}/aws-verify-summary.md" ]]; then
    cp "${OUT_DIR}/aws-verify-summary.md" "${OUT_DIR}/config-verify-summary.md"
  fi
  pass_config="pass"
else
  echo "==> Phase 1: AWS configuration verification skipped"
  pass_config="skipped"
fi

# --- Phase 2: controlled API trigger + async delivery ---
if [[ "${SKIP_API_TRIGGER}" != "true" ]]; then
  START_MS="$(python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
)"
  echo "==> Phase 2: GET /test-error (expect HTTP 500) [start_ms=${START_MS}]"
  HTTP_CODE="$(curl -sS -o "${TMP_DIR}/test-error.json" -w '%{http_code}' \
    --max-time 30 \
    -H 'accept: application/json' \
    -H "x-request-id: scrum36-pipeline-${COMMIT_SHA}-${START_MS}" \
    "${API_URL}/test-error" || true)"

  API_REQUEST_ID="$(python3 - "${TMP_DIR}/test-error.json" "${OUT_DIR}/api-trigger.sanitized.json" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
try:
    data = json.load(open(src))
except Exception:
    data = {}
safe = {k: data[k] for k in ("statusCode", "error", "message", "requestId") if k in data}
json.dump(safe, open(dst, "w"), indent=2)
print(safe.get("requestId") or "")
PY
)"

  if [[ "${HTTP_CODE}" != "500" ]]; then
    fail "api_trigger_unexpected_status_${HTTP_CODE}"
  fi
  pass_api="pass"
  echo "    API trigger OK (requestId=${API_REQUEST_ID:-n/a})"

  echo "==> Phase 2b: Poll processor logs for persistence (timeout ${PIPELINE_TIMEOUT_SEC}s)"
  DEADLINE=$((SECONDS + PIPELINE_TIMEOUT_SEC))
  FOUND=0
  while (( SECONDS < DEADLINE )); do
    EVENTS_JSON="$(aws logs filter-log-events \
      --log-group-name "${PROCESSOR_LOG_GROUP_NAME}" \
      --start-time "${START_MS}" \
      --filter-pattern '{ $.msg = "cloudwatch data message processed" && $.accepted = true && $.messageType = "DATA_MESSAGE" && $.persistedIncidents > 0 }' \
      --limit 20 \
      --output json 2>/dev/null || echo '{"events":[]}')"

    MATCHED="$(python3 - "${EVENTS_JSON}" "${OUT_DIR}/processor-batch.sanitized.json" <<'PY'
import json, sys
raw = json.loads(sys.argv[1])
out = sys.argv[2]
safe = []
for ev in raw.get("events") or []:
    try:
        p = json.loads(ev.get("message") or "")
    except Exception:
        continue
    if p.get("persistedIncidents", 0) < 1:
        continue
    if p.get("processedRecords", 0) < 1:
        continue
    safe.append({
        "timestamp": ev.get("timestamp"),
        "requestId": p.get("requestId"),
        "eventType": p.get("eventType"),
        "messageType": p.get("messageType"),
        "processedRecords": p.get("processedRecords"),
        "attemptedIncidents": p.get("attemptedIncidents"),
        "persistedIncidents": p.get("persistedIncidents"),
        "duplicateIncidents": p.get("duplicateIncidents"),
        "persistenceFailures": p.get("persistenceFailures"),
        "outcome": p.get("outcome"),
    })
json.dump({"matched": len(safe), "events": safe[:5]}, open(out, "w"), indent=2)
print(len(safe))
PY
)"
    if [[ "${MATCHED}" -gt 0 ]]; then
      FOUND=1
      pass_delivery="pass"
      pass_persist="pass"
      PERSIST_EVENTS="$(aws logs filter-log-events \
        --log-group-name "${PROCESSOR_LOG_GROUP_NAME}" \
        --start-time "${START_MS}" \
        --filter-pattern '{ $.msg = "automatic incident persisted" && $.outcome = "persisted" }' \
        --limit 20 \
        --output json 2>/dev/null || echo '{"events":[]}')"
      INCIDENT_ID="$(python3 - "${PERSIST_EVENTS}" "${OUT_DIR}/processor-persisted.sanitized.json" <<'PY'
import json, sys
raw = json.loads(sys.argv[1])
out = sys.argv[2]
safe = []
iid = ""
for ev in raw.get("events") or []:
    try:
        p = json.loads(ev.get("message") or "")
    except Exception:
        continue
    if p.get("outcome") != "persisted":
        continue
    row = {
        "timestamp": ev.get("timestamp"),
        "incidentId": p.get("incidentId"),
        "sourceEventId": p.get("sourceEventId"),
        "source": p.get("source"),
        "severity": p.get("severity"),
        "outcome": p.get("outcome"),
        "requestId": p.get("requestId"),
    }
    safe.append(row)
    if not iid and row["incidentId"]:
        iid = row["incidentId"]
json.dump({"matched": len(safe), "events": safe[:5]}, open(out, "w"), indent=2)
print(iid)
PY
)"
      break
    fi
    echo "    waiting for processor persistence..."
    sleep "${PIPELINE_POLL_SEC}"
  done

  if [[ "${FOUND}" -ne 1 ]]; then
    fail "processor_persistence_timeout"
  fi
  if [[ -z "${INCIDENT_ID}" ]]; then
    fail "missing_incident_id_from_logs"
  fi

  echo "==> Phase 2c: DynamoDB GetItem for ${INCIDENT_ID}"
  ITEM_JSON="$(aws dynamodb get-item \
    --table-name "${INCIDENTS_TABLE_NAME}" \
    --key "{\"id\":{\"S\":\"${INCIDENT_ID}\"}}" \
    --consistent-read \
    --output json 2>/dev/null || echo '{}')"

  python3 - "${ITEM_JSON}" "${OUT_DIR}/incident.sanitized.json" \
    "${INCIDENT_ID}" "${EXPECTED_SOURCE}" "${EXPECTED_SEVERITY}" "${START_MS}" <<'PY'
import json, sys
from datetime import datetime

raw = json.loads(sys.argv[1])
out = sys.argv[2]
incident_id = sys.argv[3]
expected_source = sys.argv[4]
expected_severity = sys.argv[5]
start_ms = int(sys.argv[6])
item = raw.get("Item") or {}
if not item:
    raise SystemExit("missing_item")

def s(k):
    return (item.get(k) or {}).get("S") or ""

safe = {
    "id": incident_id,
    "status": s("status"),
    "source": s("source"),
    "severity": s("severity"),
    "errorType": s("errorType"),
    "createdAt": s("createdAt"),
    "updatedAt": s("updatedAt"),
}
# sourceEventId may live in metadata map
meta = item.get("metadata") or {}
m = meta.get("M") or {}
if "sourceEventId" in m:
    safe["sourceEventId"] = (m["sourceEventId"].get("S") or "")

json.dump(safe, open(out, "w"), indent=2)
errors = []
if safe["status"] != "open":
    errors.append("status")
if safe["source"] != expected_source:
    errors.append("source")
if safe["severity"] != expected_severity:
    errors.append("severity")
try:
    created_ms = int(datetime.fromisoformat(safe["createdAt"].replace("Z", "+00:00")).timestamp() * 1000)
    if created_ms < start_ms - 120_000:
        errors.append("createdAt")
except Exception:
    errors.append("createdAt_parse")
if errors:
    raise SystemExit(",".join(errors))
PY
  pass_ddb="pass"
  echo "    DynamoDB incident OK"
else
  echo "==> Phase 2: API trigger skipped"
fi

# --- Phase 3: deterministic processor replay (idempotency) ---
if [[ "${SKIP_IDEMPOTENCY_REPLAY}" != "true" ]]; then
  # Same commit SHA → same sourceEventId → reruns dedupe; different commits distinct.
  SOURCE_EVENT_ID="scrum36-replay-${COMMIT_SHA}"
  echo "==> Phase 3: Idempotency replay (sourceEventId=${SOURCE_EVENT_ID})"
  PAYLOAD_PATH="${TMP_DIR}/replay-envelope.json"
  REPLAY_INCIDENT_ID="$(node - "${PAYLOAD_PATH}" "${SOURCE_EVENT_ID}" <<'NODE'
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const outPath = process.argv[1];
const sourceEventId = process.argv[2];
const message = JSON.stringify({
  level: 50,
  time: Date.now(),
  eventType: 'incident_candidate',
  severity: 'error',
  requestId: `req-${sourceEventId}`,
  route: '/test-error',
  statusCode: 500,
  errorType: 'Error',
  errorName: 'Error',
  service: 'incidentlens-demo-api',
  environment: 'test',
  msg: 'controlled pipeline idempotency fixture',
});
const payload = {
  owner: '000000000000',
  logGroup: '/aws/lambda/incidentlens-dev-api',
  logStream: 'scrum36/pipeline-replay',
  subscriptionFilters: ['incidentlens-dev-api-incident-candidate'],
  messageType: 'DATA_MESSAGE',
  logEvents: [{ id: sourceEventId, timestamp: Date.now(), message }],
};
writeFileSync(
  outPath,
  JSON.stringify({
    awslogs: {
      data: gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64'),
    },
  }),
);
process.stdout.write(
  'auto_' + createHash('sha256').update(sourceEventId, 'utf8').digest('hex').slice(0, 32),
);
NODE
)"

  invoke_replay() {
    local label="$1"
    local out="${OUT_DIR}/idempotency-${label}.sanitized.json"
    local raw="${TMP_DIR}/invoke-${label}.json"
    aws lambda invoke \
      --cli-read-timeout 60 \
      --cli-connect-timeout 10 \
      --function-name "${PROCESSOR_FUNCTION_NAME}" \
      --cli-binary-format raw-in-base64-out \
      --payload "fileb://${PAYLOAD_PATH}" \
      "${raw}" >/dev/null
    python3 - "${raw}" "${out}" "${label}" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
out, label = sys.argv[2], sys.argv[3]
safe = {
    "label": label,
    "accepted": data.get("accepted"),
    "messageType": data.get("messageType"),
    "processedRecords": data.get("processedRecords"),
    "attemptedIncidents": data.get("attemptedIncidents"),
    "persistedIncidents": data.get("persistedIncidents"),
    "duplicateIncidents": data.get("duplicateIncidents"),
    "persistenceFailures": data.get("persistenceFailures"),
}
json.dump(safe, open(out, "w"), indent=2)
print(json.dumps(safe))
PY
  }

  FIRST_JSON="$(invoke_replay first)"
  echo "    first: ${FIRST_JSON}"
  SECOND_JSON="$(invoke_replay second)"
  echo "    second: ${SECOND_JSON}"

  python3 - "${FIRST_JSON}" "${SECOND_JSON}" <<'PY'
import json, sys
first = json.loads(sys.argv[1])
second = json.loads(sys.argv[2])
# First invoke may create OR duplicate if this commit already ran.
# Accept: (persisted=1, duplicate=0) OR (persisted=0, duplicate=1) for first,
# and second must be duplicate=1 with persisted=0.
if first.get("accepted") is not True:
    raise SystemExit("first_not_accepted")
if second.get("accepted") is not True:
    raise SystemExit("second_not_accepted")
if second.get("duplicateIncidents") != 1 or second.get("persistedIncidents", 0) != 0:
    raise SystemExit(f"second_not_duplicate:{second}")
if second.get("persistenceFailures", 0) != 0:
    raise SystemExit("second_persistence_failure")
# Prefer first-run create; allow commit-rerun where first is already duplicate.
created = first.get("persistedIncidents") == 1 and first.get("duplicateIncidents", 0) == 0
already = first.get("persistedIncidents", 0) == 0 and first.get("duplicateIncidents") == 1
if not (created or already):
    raise SystemExit(f"first_unexpected:{first}")
print("ok")
PY
  pass_idem_first="pass"
  pass_idem_second="pass"

  REPLAY_ITEM="$(aws dynamodb get-item \
    --table-name "${INCIDENTS_TABLE_NAME}" \
    --key "{\"id\":{\"S\":\"${REPLAY_INCIDENT_ID}\"}}" \
    --consistent-read \
    --output json 2>/dev/null || echo '{}')"
  python3 - "${REPLAY_ITEM}" "${OUT_DIR}/idempotency-item.sanitized.json" "${REPLAY_INCIDENT_ID}" <<'PY'
import json, sys
raw = json.loads(sys.argv[1])
out = sys.argv[2]
iid = sys.argv[3]
item = raw.get("Item") or {}
if not item:
    raise SystemExit("replay_item_missing")
safe = {
    "id": iid,
    "status": (item.get("status") or {}).get("S"),
    "source": (item.get("source") or {}).get("S"),
    "severity": (item.get("severity") or {}).get("S"),
}
json.dump(safe, open(out, "w"), indent=2)
if safe["status"] != "open":
    raise SystemExit("replay_status")
PY
  echo "    Idempotency replay OK (incidentId=${REPLAY_INCIDENT_ID})"
else
  echo "==> Phase 3: Idempotency replay skipped"
fi

# --- Summary ---
{
  echo "# Sprint 4 pipeline integration"
  echo ""
  echo "- Result: **PASS**"
  echo "- Commit: \`${COMMIT_SHA}\`"
  echo "- Region: \`${AWS_REGION}\`"
  echo "- API URL: \`${API_URL:-n/a}\`"
  echo "- Processor: \`${PROCESSOR_FUNCTION_NAME}\`"
  echo "- Table: \`${INCIDENTS_TABLE_NAME}\`"
  echo "- API requestId: \`${API_REQUEST_ID:-n/a}\`"
  echo "- Pipeline incidentId: \`${INCIDENT_ID:-n/a}\`"
  echo "- Replay incidentId: \`${REPLAY_INCIDENT_ID:-n/a}\`"
  echo ""
  echo "| Check | Result |"
  echo "| --- | --- |"
  echo "| Config verify | ${pass_config} |"
  echo "| API trigger | ${pass_api} |"
  echo "| CloudWatch delivery / parse | ${pass_delivery} |"
  echo "| Processor persistence | ${pass_persist} |"
  echo "| DynamoDB incident | ${pass_ddb} |"
  echo "| Idempotency first invoke | ${pass_idem_first} |"
  echo "| Idempotency second invoke | ${pass_idem_second} |"
  echo ""
  echo "Known limitation: controlled test incidents remain in the dev table (no delete endpoint)."
} >"${SUMMARY}"

python3 - "${STATUS_JSON}" "${COMMIT_SHA}" "${pass_config}" "${pass_api}" \
  "${pass_delivery}" "${pass_persist}" "${pass_ddb}" \
  "${pass_idem_first}" "${pass_idem_second}" \
  "${INCIDENT_ID}" "${REPLAY_INCIDENT_ID}" <<'PY'
import json, sys
out = sys.argv[1]
json.dump(
    {
        "passed": True,
        "commitSha": sys.argv[2],
        "configVerify": sys.argv[3],
        "apiTrigger": sys.argv[4],
        "delivery": sys.argv[5],
        "persistence": sys.argv[6],
        "dynamodb": sys.argv[7],
        "idempotencyFirst": sys.argv[8],
        "idempotencySecond": sys.argv[9],
        "pipelineIncidentId": sys.argv[10] or None,
        "replayIncidentId": sys.argv[11] or None,
    },
    open(out, "w"),
    indent=2,
)
PY

echo "==> Pipeline integration PASSED"
cat "${SUMMARY}"
