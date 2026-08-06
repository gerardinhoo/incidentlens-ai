#!/usr/bin/env bash
# Manual end-to-end verification: /test-error → processor persist → DynamoDB incident.
#
# Creates a real DynamoDB row. Prefer running intentionally after deploy, not on
# every CI job. There is no delete endpoint yet (SCRUM-34).
#
# Usage (from repo root):
#   API_URL=https://....amazonaws.com \
#   DYNAMODB_TABLE_NAME=incidentlens-dev-incidents \
#   PROCESSOR_LOG_GROUP=/aws/lambda/incidentlens-dev-processor \
#   ./scripts/verify-automatic-incident-creation.sh
#
# Env:
#   API_URL                 Required.
#   DYNAMODB_TABLE_NAME     Default: incidentlens-dev-incidents
#   PROCESSOR_LOG_GROUP     Default: /aws/lambda/incidentlens-dev-processor
#   AWS_REGION              Default: us-east-1
#   EXPECTED_SOURCE         Default: incidentlens-demo-api
#   EXPECTED_SEVERITY       Default: high  (parser "error" → domain high)
#   DELIVERY_TIMEOUT_SEC    Default: 120
#   DELIVERY_POLL_SEC       Default: 5
#   VERIFY_OUT_DIR          Default: artifacts/deployment-tests
#
# Known limitation: duplicate CloudWatch deliveries may create duplicate incidents
# until SCRUM-35 (idempotency). This script does not delete created incidents.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${VERIFY_OUT_DIR:-${ROOT}/artifacts/deployment-tests}"
mkdir -p "${OUT_DIR}"
SUMMARY="${OUT_DIR}/automatic-incident-creation-summary.md"
STATUS_JSON="${OUT_DIR}/automatic-incident-creation-status.json"

API_URL="${API_URL:-}"
DYNAMODB_TABLE_NAME="${DYNAMODB_TABLE_NAME:-incidentlens-dev-incidents}"
PROCESSOR_LOG_GROUP="${PROCESSOR_LOG_GROUP:-/aws/lambda/incidentlens-dev-processor}"
AWS_REGION="${AWS_REGION:-us-east-1}"
EXPECTED_SOURCE="${EXPECTED_SOURCE:-incidentlens-demo-api}"
EXPECTED_SEVERITY="${EXPECTED_SEVERITY:-high}"
DELIVERY_TIMEOUT_SEC="${DELIVERY_TIMEOUT_SEC:-120}"
DELIVERY_POLL_SEC="${DELIVERY_POLL_SEC:-5}"

export AWS_DEFAULT_REGION="${AWS_REGION}"

if [[ -z "${API_URL}" ]]; then
  echo "ERROR: API_URL is required" >&2
  exit 1
fi
API_URL="${API_URL%/}"

for cmd in aws curl python3; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "ERROR: ${cmd} is required" >&2
    exit 1
  fi
done

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "ERROR: AWS credentials not available" >&2
  exit 1
fi

START_MS="$(python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
)"
SMOKE_REQUEST_ID="scrum34-persist-${START_MS}"

echo "==> Triggering controlled GET /test-error (expect HTTP 500)"
HTTP_CODE="$(curl -sS -o "${OUT_DIR}/test-error-response.sanitized.json" -w '%{http_code}' \
  -H 'accept: application/json' \
  -H "x-request-id: ${SMOKE_REQUEST_ID}" \
  "${API_URL}/test-error" || true)"

API_REQUEST_ID="$(python3 - "${OUT_DIR}/test-error-response.sanitized.json" <<'PY'
import json, sys
path = sys.argv[1]
try:
    data = json.load(open(path))
except Exception:
    data = {}
safe = {k: data[k] for k in ("statusCode", "error", "message", "requestId") if k in data}
json.dump(safe, open(path, "w"), indent=2)
print(safe.get("requestId") or "")
PY
)"

if [[ "${HTTP_CODE}" != "500" ]]; then
  echo "ERROR: expected HTTP 500 from /test-error, got ${HTTP_CODE}" >&2
  echo '{"passed":false,"reason":"unexpected_http_status","httpCode":"'"${HTTP_CODE}"'"}' >"${STATUS_JSON}"
  exit 1
fi

echo "==> Polling processor logs for persisted summary (timeout ${DELIVERY_TIMEOUT_SEC}s)"
DEADLINE=$((SECONDS + DELIVERY_TIMEOUT_SEC))
FOUND=0
INCIDENT_ID=""

while (( SECONDS < DEADLINE )); do
  EVENTS_JSON="$(aws logs filter-log-events \
    --log-group-name "${PROCESSOR_LOG_GROUP}" \
    --start-time "${START_MS}" \
    --filter-pattern '{ $.msg = "cloudwatch data message processed" && $.accepted = true && $.persistedIncidents > 0 }' \
    --limit 20 \
    --output json 2>/dev/null || echo '{"events":[]}')"

  COUNT="$(python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("events") or []))' <<<"${EVENTS_JSON}")"
  if [[ "${COUNT}" -gt 0 ]]; then
    python3 - "${EVENTS_JSON}" "${OUT_DIR}/automatic-incident-batch.sanitized.json" <<'PY'
import json, sys
raw = json.loads(sys.argv[1])
out_path = sys.argv[2]
safe = []
for ev in raw.get("events") or []:
    try:
        parsed = json.loads(ev.get("message") or "")
    except Exception:
        continue
    persisted = parsed.get("persistedIncidents")
    if not isinstance(persisted, (int, float)) or persisted < 1:
        continue
    safe.append({
        "timestamp": ev.get("timestamp"),
        "requestId": parsed.get("requestId"),
        "messageType": parsed.get("messageType"),
        "receivedRecords": parsed.get("receivedRecords"),
        "processedRecords": parsed.get("processedRecords"),
        "ignoredRecords": parsed.get("ignoredRecords"),
        "failedRecords": parsed.get("failedRecords"),
        "attemptedIncidents": parsed.get("attemptedIncidents"),
        "persistedIncidents": persisted,
        "persistenceFailures": parsed.get("persistenceFailures"),
        "outcome": parsed.get("outcome"),
    })
json.dump({"matched": len(safe), "events": safe[:5]}, open(out_path, "w"), indent=2)
open("/tmp/il_persist_matched", "w").write(str(len(safe)))
PY
    MATCHED="$(cat /tmp/il_persist_matched 2>/dev/null || echo 0)"
    rm -f /tmp/il_persist_matched
    if [[ "${MATCHED}" -gt 0 ]]; then
      FOUND=1
      # Prefer a concrete incidentId from the per-candidate persisted log.
      PERSIST_EVENTS="$(aws logs filter-log-events \
        --log-group-name "${PROCESSOR_LOG_GROUP}" \
        --start-time "${START_MS}" \
        --filter-pattern '{ $.msg = "automatic incident persisted" && $.outcome = "persisted" }' \
        --limit 20 \
        --output json 2>/dev/null || echo '{"events":[]}')"
      INCIDENT_ID="$(python3 - "${PERSIST_EVENTS}" "${OUT_DIR}/automatic-incident-persisted.sanitized.json" <<'PY'
import json, sys
raw = json.loads(sys.argv[1])
out_path = sys.argv[2]
safe = []
incident_id = ""
for ev in raw.get("events") or []:
    try:
        parsed = json.loads(ev.get("message") or "")
    except Exception:
        continue
    if parsed.get("outcome") != "persisted":
        continue
    iid = parsed.get("incidentId") or ""
    row = {
        "timestamp": ev.get("timestamp"),
        "incidentId": iid,
        "sourceEventId": parsed.get("sourceEventId"),
        "source": parsed.get("source"),
        "severity": parsed.get("severity"),
        "outcome": parsed.get("outcome"),
        "requestId": parsed.get("requestId"),
    }
    safe.append(row)
    if not incident_id and iid:
        incident_id = iid
json.dump({"matched": len(safe), "events": safe[:5]}, open(out_path, "w"), indent=2)
print(incident_id)
PY
)"
      break
    fi
  fi
  echo "    waiting for processor persistence logs..."
  sleep "${DELIVERY_POLL_SEC}"
done

if [[ "${FOUND}" -ne 1 ]]; then
  {
    echo "# Automatic incident creation verification"
    echo ""
    echo "- Result: **FAIL** (timeout waiting for persistedIncidents >= 1)"
    echo "- API URL: \`${API_URL}\`"
    echo "- Processor log group: \`${PROCESSOR_LOG_GROUP}\`"
    echo "- Table: \`${DYNAMODB_TABLE_NAME}\`"
    echo "- HTTP /test-error: \`${HTTP_CODE}\`"
    echo "- API requestId: \`${API_REQUEST_ID:-n/a}\`"
  } >"${SUMMARY}"
  echo '{"passed":false,"reason":"timeout"}' >"${STATUS_JSON}"
  echo "ERROR: no processor persistence summary within ${DELIVERY_TIMEOUT_SEC}s" >&2
  exit 1
fi

echo "==> Verifying DynamoDB incident (read-only)"
if [[ -z "${INCIDENT_ID}" ]]; then
  echo "ERROR: could not extract incidentId from processor logs" >&2
  echo '{"passed":false,"reason":"missing_incident_id"}' >"${STATUS_JSON}"
  exit 1
fi

ITEM_JSON="$(aws dynamodb get-item \
  --table-name "${DYNAMODB_TABLE_NAME}" \
  --key "{\"id\":{\"S\":\"${INCIDENT_ID}\"}}" \
  --consistent-read \
  --output json 2>/dev/null || echo '{}')"

python3 - "${ITEM_JSON}" "${OUT_DIR}/automatic-incident-item.sanitized.json" \
  "${INCIDENT_ID}" "${EXPECTED_SOURCE}" "${EXPECTED_SEVERITY}" "${START_MS}" <<'PY'
import json, sys
from datetime import datetime, timezone

raw = json.loads(sys.argv[1])
out_path = sys.argv[2]
incident_id = sys.argv[3]
expected_source = sys.argv[4]
expected_severity = sys.argv[5]
start_ms = int(sys.argv[6])

item = raw.get("Item") or {}
if not item:
    raise SystemExit("missing_item")

def s(key):
    v = item.get(key) or {}
    return v.get("S") or ""

status = s("status")
source = s("source")
severity = s("severity")
created_at = s("createdAt")
error_type = s("errorType")

# createdAt must parse and be at/after roughly start (allow 2 minutes clock skew).
created_ok = False
try:
    created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    created_ms = int(created_dt.timestamp() * 1000)
    created_ok = created_ms >= (start_ms - 120_000)
except Exception:
    created_ok = False

safe = {
    "id": incident_id,
    "status": status,
    "source": source,
    "severity": severity,
    "errorType": error_type,
    "createdAt": created_at,
}
json.dump(safe, open(out_path, "w"), indent=2)

errors = []
if status != "open":
    errors.append(f"status={status}")
if source != expected_source:
    errors.append(f"source={source}")
if severity != expected_severity:
    errors.append(f"severity={severity}")
if not created_ok:
    errors.append("createdAt_out_of_window")

if errors:
    open("/tmp/il_ddb_ok", "w").write("0:" + ",".join(errors))
    raise SystemExit(1)
open("/tmp/il_ddb_ok", "w").write("1")
PY

DDB_OK="$(cat /tmp/il_ddb_ok 2>/dev/null || echo 0)"
rm -f /tmp/il_ddb_ok
if [[ "${DDB_OK}" != "1" ]]; then
  {
    echo "# Automatic incident creation verification"
    echo ""
    echo "- Result: **FAIL** (DynamoDB item mismatch: ${DDB_OK})"
    echo "- incidentId: \`${INCIDENT_ID}\`"
  } >"${SUMMARY}"
  echo '{"passed":false,"reason":"dynamodb_mismatch","incidentId":"'"${INCIDENT_ID}"'"}' >"${STATUS_JSON}"
  exit 1
fi

{
  echo "# Automatic incident creation verification"
  echo ""
  echo "- Result: **PASS**"
  echo "- API URL: \`${API_URL}\`"
  echo "- Processor log group: \`${PROCESSOR_LOG_GROUP}\`"
  echo "- Table: \`${DYNAMODB_TABLE_NAME}\`"
  echo "- HTTP /test-error: \`${HTTP_CODE}\`"
  echo "- API requestId: \`${API_REQUEST_ID:-n/a}\`"
  echo "- incidentId: \`${INCIDENT_ID}\`"
  echo "- Checked safe fields: status=open, source=\`${EXPECTED_SOURCE}\`, severity=\`${EXPECTED_SEVERITY}\`"
  echo "- Note: duplicate deliveries may create duplicate incidents until SCRUM-35"
  echo "- Note: this script does not delete the created incident"
} >"${SUMMARY}"

echo "{\"passed\":true,\"httpCode\":\"${HTTP_CODE}\",\"incidentId\":\"${INCIDENT_ID}\"}" >"${STATUS_JSON}"
echo "==> Automatic incident creation verification passed"
cat "${SUMMARY}"
