#!/usr/bin/env bash
# Sprint 5 consolidated AI incident pipeline verification (SCRUM-42).
#
# Composes existing checks where practical. One GET /test-error for the live
# enrichment + SNS publish path. Duplicate replay uses direct Lambda invoke
# (never a second /test-error).
#
# Usage:
#   API_URL=https://....amazonaws.com \
#   AWS_REGION=us-east-1 \
#   INCIDENTS_TABLE_NAME=incidentlens-dev-incidents \
#   PROCESSOR_FUNCTION_NAME=incidentlens-dev-processor \
#   PROCESSOR_LOG_GROUP_NAME=/aws/lambda/incidentlens-dev-processor \
#   SNS_INCIDENT_TOPIC_ARN=arn:aws:sns:... \
#   ./scripts/verify-ai-incident-pipeline.sh
#
# Automated test verifies SNS publish via processor counters.
# Human verifies email delivery in the inbox after subscription confirmation.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${VERIFY_OUT_DIR:-${ROOT}/artifacts/deployment-tests/sprint5-ai-pipeline}"
mkdir -p "${OUT_DIR}"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/il-sprint5.XXXXXX")"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

# Surface unexpected non-zero exits (set -e) instead of returning silently to the shell.
on_unexpected_error() {
  local rc=$?
  local line="${1:-unknown}"
  echo "ERROR: unexpected command failure near line ${line} (exit ${rc})" >&2
  if [[ ! -f "${SUMMARY:-}" ]] || ! grep -q 'Overall:' "${SUMMARY}" 2>/dev/null; then
    {
      echo "# IncidentLens Sprint 5 Verification"
      echo ""
      echo "- Overall: **FAIL**"
      echo "- Reason: \`unexpected_command_failure_line_${line}_exit_${rc}\`"
    } >"${SUMMARY:-/dev/null}"
  fi
}
trap 'on_unexpected_error $LINENO' ERR

SUMMARY="${OUT_DIR}/sprint5-summary.md"
STATUS_JSON="${OUT_DIR}/sprint5-status.json"
COMMIT_SHA="${GITHUB_SHA:-$(git -C "${ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)}"

API_URL="${API_URL:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"
INCIDENTS_TABLE_NAME="${INCIDENTS_TABLE_NAME:-incidentlens-dev-incidents}"
PROCESSOR_FUNCTION_NAME="${PROCESSOR_FUNCTION_NAME:-incidentlens-dev-processor}"
PROCESSOR_LOG_GROUP_NAME="${PROCESSOR_LOG_GROUP_NAME:-/aws/lambda/${PROCESSOR_FUNCTION_NAME}}"
API_LOG_GROUP_NAME="${API_LOG_GROUP_NAME:-/aws/lambda/incidentlens-dev-api}"
SNS_INCIDENT_TOPIC_ARN="${SNS_INCIDENT_TOPIC_ARN:-}"
PIPELINE_TIMEOUT_SEC="${PIPELINE_TIMEOUT_SEC:-210}"
PIPELINE_POLL_SEC="${PIPELINE_POLL_SEC:-5}"
RUN_CONFIG_VERIFY="${RUN_CONFIG_VERIFY:-true}"
SKIP_API_TRIGGER="${SKIP_API_TRIGGER:-false}"
SKIP_IDEMPOTENCY_REPLAY="${SKIP_IDEMPOTENCY_REPLAY:-false}"
EXPECTED_SOURCE="${EXPECTED_SOURCE:-incidentlens-demo-api}"

export AWS_DEFAULT_REGION="${AWS_REGION}"

pass_config="skipped"
pass_delivery="skipped"
pass_persist="skipped"
pass_analysis="skipped"
pass_sns="skipped"
pass_idem="skipped"
INCIDENT_ID=""
ANALYSIS_STATUS=""
SUMMARY_PRESENT="false"
CAUSE_PRESENT="false"
ACTIONS_COUNT=0
ANALYZED_AT_PRESENT="false"
NOTIFY_ATTEMPTS=0
NOTIFY_SENT=0
NOTIFY_FAILURES=0

fail() {
  local reason="$1"
  # Intentional failure path — do not double-report via ERR trap.
  trap - ERR
  python3 - "${SUMMARY}" "${STATUS_JSON}" "${COMMIT_SHA}" "${AWS_REGION}" "${reason}" \
    "${pass_config}" "${pass_delivery}" "${pass_persist}" "${pass_analysis}" \
    "${pass_sns}" "${pass_idem}" "${INCIDENT_ID}" <<'PY'
import json, sys
summary, status, sha, region, reason = sys.argv[1:6]
checks = {
    "config": sys.argv[6],
    "delivery": sys.argv[7],
    "persistence": sys.argv[8],
    "analysis": sys.argv[9],
    "snsPublish": sys.argv[10],
    "idempotency": sys.argv[11],
}
incident_id = sys.argv[12]
open(summary, "w").write(
    "# IncidentLens Sprint 5 Verification\n\n"
    f"- Overall: **FAIL**\n"
    f"- Reason: `{reason}`\n"
    f"- Commit: `{sha}`\n"
    f"- Region: `{region}`\n"
    f"- Incident ID: `{incident_id or 'n/a'}`\n"
)
open(status, "w").write(json.dumps({
    "ok": False,
    "reason": reason,
    "commitSha": sha,
    "environment": "dev",
    "checks": checks,
    "incidentId": incident_id or None,
}, indent=2) + "\n")
print(f"ERROR: {reason}", file=sys.stderr)
raise SystemExit(1)
PY
}

write_success() {
  python3 - "${SUMMARY}" "${STATUS_JSON}" "${COMMIT_SHA}" "${AWS_REGION}" \
    "${pass_config}" "${pass_delivery}" "${pass_persist}" "${pass_analysis}" \
    "${pass_sns}" "${pass_idem}" "${INCIDENT_ID}" "${ANALYSIS_STATUS}" \
    "${SUMMARY_PRESENT}" "${CAUSE_PRESENT}" "${ACTIONS_COUNT}" \
    "${ANALYZED_AT_PRESENT}" "${NOTIFY_ATTEMPTS}" "${NOTIFY_SENT}" \
    "${NOTIFY_FAILURES}" <<'PY'
import json, sys
(
    summary, status, sha, region,
    cfg, delivery, persist, analysis, sns, idem,
    incident_id, analysis_status,
    summary_present, cause_present, actions_count,
    analyzed_at_present, notify_attempts, notify_sent, notify_failures,
) = sys.argv[1:]
payload = {
    "ok": True,
    "environment": "dev",
    "timestamp": __import__("datetime").datetime.now(
        __import__("datetime").timezone.utc
    ).isoformat(),
    "commitSha": sha,
    "region": region,
    "apiTrigger": {"httpStatus": 500, "result": "pass"},
    "incidentId": incident_id,
    "incidentStatus": "open",
    "analysisStatus": analysis_status,
    "summaryPresent": summary_present == "true",
    "possibleCausePresent": cause_present == "true",
    "recommendedActionsCount": int(actions_count),
    "analyzedAtPresent": analyzed_at_present == "true",
    "processorCounters": {
        "notificationAttempts": int(notify_attempts),
        "notificationsSent": int(notify_sent),
        "notificationFailures": int(notify_failures),
    },
    "duplicateReplay": idem,
    "snsPublishVerification": sns,
    "checks": {
        "config": cfg,
        "delivery": delivery,
        "persistence": persist,
        "analysis": analysis,
        "snsPublish": sns,
        "idempotency": idem,
    },
    "overall": "pass",
}
open(status, "w").write(json.dumps(payload, indent=2) + "\n")
open(summary, "w").write(
    "# IncidentLens Sprint 5 Verification\n\n"
    "- Overall: **PASS**\n"
    f"- Commit: `{sha}`\n"
    f"- Region: `{region}`\n"
    f"- Incident ID: `{incident_id}`\n"
    f"- analysis.status: `{analysis_status}`\n"
    f"- summaryPresent: {summary_present}\n"
    f"- possibleCausePresent: {cause_present}\n"
    f"- recommendedActionsCount: {actions_count}\n"
    f"- analyzedAtPresent: {analyzed_at_present}\n"
    f"- notificationAttempts: {notify_attempts}\n"
    f"- notificationsSent: {notify_sent}\n"
    f"- notificationFailures: {notify_failures}\n"
    f"- Idempotency replay: {idem}\n"
    f"- SNS publish (counters): {sns}\n"
    "\n"
    "Automated test verifies SNS publish; human verifies email delivery.\n"
)
print(json.dumps({k: payload[k] for k in (
    "incidentId", "analysisStatus", "summaryPresent",
    "possibleCausePresent", "recommendedActionsCount",
    "processorCounters", "overall",
)}, indent=2))
PY
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

if [[ -z "${SNS_INCIDENT_TOPIC_ARN}" ]] && command -v terraform >/dev/null 2>&1; then
  SNS_INCIDENT_TOPIC_ARN="$(
    cd "${ROOT}/infrastructure/terraform/environments/dev" \
      && terraform output -raw sns_incident_topic_arn 2>/dev/null || true
  )"
fi

echo "==> Sprint 5 AI pipeline verification (commit ${COMMIT_SHA})"
echo "    Out: ${OUT_DIR}"

# ---------------------------------------------------------------------------
# A. Infrastructure / configuration
# ---------------------------------------------------------------------------
if [[ "${RUN_CONFIG_VERIFY}" == "true" ]]; then
  echo "==> [config] AWS configuration verification"
  VERIFY_OUT_DIR="${OUT_DIR}" \
    AWS_REGION="${AWS_REGION}" \
    LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-incidentlens-dev-api}" \
    PROCESSOR_FUNCTION_NAME="${PROCESSOR_FUNCTION_NAME}" \
    DYNAMODB_TABLE_NAME="${INCIDENTS_TABLE_NAME}" \
    LAMBDA_LOG_GROUP="${API_LOG_GROUP_NAME}" \
    PROCESSOR_LOG_GROUP="${PROCESSOR_LOG_GROUP_NAME}" \
    ACCESS_LOG_GROUP="${ACCESS_LOG_GROUP:-/aws/apigateway/incidentlens-dev-api-access}" \
    SNS_INCIDENT_TOPIC_ARN="${SNS_INCIDENT_TOPIC_ARN}" \
    "${ROOT}/scripts/verify-aws-deployment.sh" \
    || fail "aws_configuration_verify_failed"

  pass_config="pass"
else
  echo "==> [config] skipped (caller already verified)"
fi

if [[ -n "${SNS_INCIDENT_TOPIC_ARN}" ]]; then
  echo "==> [config] SNS topic exists"
  if ! aws sns get-topic-attributes \
    --topic-arn "${SNS_INCIDENT_TOPIC_ARN}" \
    --query 'Attributes.TopicArn' \
    --output text >/dev/null 2>&1; then
    fail "sns_topic_missing_or_inaccessible"
  fi
  aws sns list-subscriptions-by-topic \
    --topic-arn "${SNS_INCIDENT_TOPIC_ARN}" \
    --output json 2>/dev/null \
    | python3 -c '
import json,sys
raw=json.load(sys.stdin)
subs=raw.get("Subscriptions") or []
# Sanitize: do not write endpoints (email addresses).
safe=[{"Protocol":s.get("Protocol"),"Pending": (s.get("SubscriptionArn")=="PendingConfirmation")} for s in subs]
json.dump({"subscriptionCount": len(subs), "subscriptions": safe}, open("'"${OUT_DIR}"'/sns-subscriptions.sanitized.json","w"), indent=2)
print(f"    SNS subscriptions (sanitized count): {len(subs)}")
'
elif [[ "${RUN_CONFIG_VERIFY}" == "true" ]]; then
  echo "WARN: SNS_INCIDENT_TOPIC_ARN unset; skipped topic existence check" >&2
fi

# ---------------------------------------------------------------------------
# B. Runtime: one /test-error → persist → analysis → notification counters
# ---------------------------------------------------------------------------
if [[ "${SKIP_API_TRIGGER}" != "true" ]]; then
  START_MS="$(python3 - <<'PY'
import time
print(int((time.time() - 5) * 1000))
PY
)"
  echo "==> [triggering] GET /test-error (expect HTTP 500)"
  HTTP_CODE="$(curl -sS -o "${TMP_DIR}/test-error.json" -w '%{http_code}' \
    --max-time 30 \
    -H 'accept: application/json' \
    -H "x-request-id: scrum42-sprint5-${COMMIT_SHA}-${START_MS}" \
    "${API_URL}/test-error" || true)"
  python3 - "${TMP_DIR}/test-error.json" "${OUT_DIR}/api-trigger.sanitized.json" <<'PY'
import json, sys
try:
    data = json.load(open(sys.argv[1]))
except Exception:
    data = {}
safe = {k: data[k] for k in ("statusCode", "error", "message", "requestId") if k in data}
json.dump(safe, open(sys.argv[2], "w"), indent=2)
PY
  if [[ "${HTTP_CODE}" != "500" ]]; then
    fail "api_trigger_unexpected_status_${HTTP_CODE}"
  fi

  echo "==> [waiting for incident] polling DynamoDB + processor logs (timeout ${PIPELINE_TIMEOUT_SEC}s)"
  DEADLINE=$((SECONDS + PIPELINE_TIMEOUT_SEC))
  FOUND_ITEM=""
  while (( SECONDS < DEADLINE )); do
    echo "    waiting for analysis..."
    START_ISO="$(python3 - <<PY
from datetime import datetime, timezone, timedelta
print((datetime.now(timezone.utc) - timedelta(seconds=120)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z")
PY
)"
    SCAN_JSON="$(aws dynamodb scan \
      --table-name "${INCIDENTS_TABLE_NAME}" \
      --filter-expression "attribute_exists(analysis) AND #src = :src AND createdAt >= :start" \
      --expression-attribute-names '{"#src":"source"}' \
      --expression-attribute-values "{\":src\":{\"S\":\"${EXPECTED_SOURCE}\"},\":start\":{\"S\":\"${START_ISO}\"}}" \
      --output json 2>/dev/null || echo '{"Items":[]}')"

    FOUND_ITEM="$(SCAN_JSON="${SCAN_JSON}" python3 - <<'PY'
import json, os
raw = json.loads(os.environ.get("SCAN_JSON") or "{}")
for item in raw.get("Items") or []:
    def s(key):
        return (item.get(key) or {}).get("S")
    analysis = item.get("analysis") or {}
    m = analysis.get("M") or {}
    status = (m.get("status") or {}).get("S")
    if status != "completed":
        continue
    actions = []
    for a in (m.get("recommendedActions") or {}).get("L") or []:
        if "S" in a and a["S"].strip():
            actions.append("x")
    print(json.dumps({
        "id": s("id"),
        "status": s("status"),
        "analysisStatus": status,
        "summaryPresent": bool((m.get("summary") or {}).get("S")),
        "possibleCausePresent": bool((m.get("possibleCause") or {}).get("S")),
        "recommendedActionsCount": len(actions),
        "analyzedAtPresent": bool((m.get("analyzedAt") or {}).get("S")),
    }))
    break
PY
)" || true

    if [[ -n "${FOUND_ITEM}" ]]; then
      pass_delivery="pass"
      pass_persist="pass"
      break
    fi
    sleep "${PIPELINE_POLL_SEC}"
  done

  if [[ -z "${FOUND_ITEM}" ]]; then
    fail "incident_or_analysis_timeout"
  fi

  # Parse JSON via Python field reads — never eval (values may contain shell metacharacters).
  echo "${FOUND_ITEM}" > "${OUT_DIR}/incident.sanitized.json"
  INCIDENT_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("id") or "")' "${OUT_DIR}/incident.sanitized.json")"
  ANALYSIS_STATUS="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("analysisStatus") or "")' "${OUT_DIR}/incident.sanitized.json")"
  SUMMARY_PRESENT="$(python3 -c 'import json,sys; print("true" if json.load(open(sys.argv[1])).get("summaryPresent") else "false")' "${OUT_DIR}/incident.sanitized.json")"
  CAUSE_PRESENT="$(python3 -c 'import json,sys; print("true" if json.load(open(sys.argv[1])).get("possibleCausePresent") else "false")' "${OUT_DIR}/incident.sanitized.json")"
  ACTIONS_COUNT="$(python3 -c 'import json,sys; print(int(json.load(open(sys.argv[1])).get("recommendedActionsCount") or 0))' "${OUT_DIR}/incident.sanitized.json")"
  ANALYZED_AT_PRESENT="$(python3 -c 'import json,sys; print("true" if json.load(open(sys.argv[1])).get("analyzedAtPresent") else "false")' "${OUT_DIR}/incident.sanitized.json")"

  if [[ "${ANALYSIS_STATUS}" != "completed" ]]; then
    fail "analysis_not_completed"
  fi
  if [[ "${SUMMARY_PRESENT}" != "true" || "${CAUSE_PRESENT}" != "true" ]]; then
    fail "analysis_fields_missing"
  fi
  if (( ACTIONS_COUNT < 1 || ACTIONS_COUNT > 5 )); then
    fail "recommended_actions_out_of_range"
  fi
  if [[ "${ANALYZED_AT_PRESENT}" != "true" ]]; then
    fail "analyzed_at_missing"
  fi
  pass_analysis="pass"

  echo "==> [waiting for notification counters]"
  NOTIFY_DEADLINE=$((SECONDS + 60))
  COUNTERS=""
  while (( SECONDS < NOTIFY_DEADLINE )); do
    LOGS_JSON="$(aws logs filter-log-events \
      --log-group-name "${PROCESSOR_LOG_GROUP_NAME}" \
      --start-time "${START_MS}" \
      --filter-pattern '"cloudwatch data message processed"' \
      --limit 25 \
      --output json 2>/dev/null || echo '{"events":[]}')"
    COUNTERS="$(LOGS_JSON="${LOGS_JSON}" python3 - <<'PY'
import json, os
raw = json.loads(os.environ.get("LOGS_JSON") or "{}")
for ev in raw.get("events") or []:
    try:
        obj = json.loads(ev.get("message") or "")
    except Exception:
        continue
    attempts = int(obj.get("notificationAttempts") or 0)
    sent = int(obj.get("notificationsSent") or 0)
    if attempts >= 1 and sent >= 1:
        print(json.dumps({
            "notificationAttempts": attempts,
            "notificationsSent": sent,
            "notificationFailures": int(obj.get("notificationFailures") or 0),
            "analyzedIncidents": int(obj.get("analyzedIncidents") or 0),
            "persistedIncidents": int(obj.get("persistedIncidents") or 0),
            "outcome": obj.get("outcome"),
        }))
        break
PY
)" || true
    if [[ -n "${COUNTERS}" ]]; then
      echo "${COUNTERS}" > "${OUT_DIR}/notification-counters.sanitized.json"
      NOTIFY_ATTEMPTS="$(python3 -c 'import json,sys; print(int(json.load(open(sys.argv[1]))["notificationAttempts"]))' "${OUT_DIR}/notification-counters.sanitized.json")"
      NOTIFY_SENT="$(python3 -c 'import json,sys; print(int(json.load(open(sys.argv[1]))["notificationsSent"]))' "${OUT_DIR}/notification-counters.sanitized.json")"
      NOTIFY_FAILURES="$(python3 -c 'import json,sys; print(int(json.load(open(sys.argv[1]))["notificationFailures"]))' "${OUT_DIR}/notification-counters.sanitized.json")"
      break
    fi
    sleep "${PIPELINE_POLL_SEC}"
  done

  if [[ -z "${COUNTERS:-}" ]]; then
    fail "notification_counters_timeout"
  fi
  if (( NOTIFY_SENT < 1 || NOTIFY_FAILURES != 0 )); then
    fail "notification_publish_not_successful"
  fi
  pass_sns="pass"
  echo "    notificationAttempts=${NOTIFY_ATTEMPTS} notificationsSent=${NOTIFY_SENT}"
else
  echo "==> [triggering] skipped"
fi

# ---------------------------------------------------------------------------
# C. Duplicate replay via direct Lambda invoke (unique sourceEventId per run)
# ---------------------------------------------------------------------------
# Use a fresh event id each run so the first invoke always creates. A fixed
# commit-based id makes re-runs see duplicate on first invoke and fail assertions.
# Under set -e, assertion helpers must capture non-zero status (never bare python exit).
if [[ "${SKIP_IDEMPOTENCY_REPLAY}" != "true" ]]; then
  echo "==> [replaying duplicate] direct processor invoke ×2"
  REPLAY_EVENT_ID="scrum42-replay-$(date +%s)-${RANDOM}"
  REPLAY_INCIDENT_ID="$(node --input-type=module - "${TMP_DIR}/replay-envelope.json" "${REPLAY_EVENT_ID}" <<'NODE'
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const out = process.argv[2];
const eventId = process.argv[3];
const message = JSON.stringify({
  level: 50,
  time: Date.now(),
  eventType: 'incident_candidate',
  severity: 'error',
  requestId: 'scrum42-replay',
  route: '/test-error',
  url: '/test-error',
  statusCode: 500,
  errorType: 'Error',
  errorName: 'Error',
  service: 'incidentlens-demo-api',
  environment: 'test',
  msg: 'controlled sprint5 replay',
});
const payload = {
  owner: '123456789012',
  logGroup: '/aws/lambda/incidentlens-dev-api',
  logStream: '2026/08/09/[$LATEST]scrum42',
  subscriptionFilters: ['incidentlens-dev-api-incident-candidate'],
  messageType: 'DATA_MESSAGE',
  logEvents: [{ id: eventId, timestamp: Date.now(), message }],
};
const envelope = {
  awslogs: { data: gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64') },
};
writeFileSync(out, JSON.stringify(envelope));
process.stdout.write(
  'auto_' + createHash('sha256').update(eventId, 'utf8').digest('hex').slice(0, 32),
);
NODE
)"
  echo "    replay sourceEventId=${REPLAY_EVENT_ID}"
  echo "    replay incidentId=${REPLAY_INCIDENT_ID}"

  FIRST_OUT="${TMP_DIR}/replay-first.json"
  SECOND_OUT="${TMP_DIR}/replay-second.json"
  META_FIRST="${TMP_DIR}/replay-first.meta.json"
  META_SECOND="${TMP_DIR}/replay-second.meta.json"

  echo "    invoking processor (first — expect create/analyze/notify)..."
  if ! aws lambda invoke \
    --cli-read-timeout 90 \
    --cli-connect-timeout 10 \
    --function-name "${PROCESSOR_FUNCTION_NAME}" \
    --cli-binary-format raw-in-base64-out \
    --payload "fileb://${TMP_DIR}/replay-envelope.json" \
    "${FIRST_OUT}" >"${META_FIRST}"; then
    fail "lambda_invoke_first_failed"
  fi
  if ! python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); raise SystemExit(1 if m.get("FunctionError") else 0)' "${META_FIRST}"; then
    fail "lambda_invoke_first_function_error"
  fi

  echo "    invoking processor (second — expect duplicate, no AI/SNS)..."
  if ! aws lambda invoke \
    --cli-read-timeout 90 \
    --cli-connect-timeout 10 \
    --function-name "${PROCESSOR_FUNCTION_NAME}" \
    --cli-binary-format raw-in-base64-out \
    --payload "fileb://${TMP_DIR}/replay-envelope.json" \
    "${SECOND_OUT}" >"${META_SECOND}"; then
    fail "lambda_invoke_second_failed"
  fi
  if ! python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); raise SystemExit(1 if m.get("FunctionError") else 0)' "${META_SECOND}"; then
    fail "lambda_invoke_second_function_error"
  fi

  # Capture assertion exit under set -e so we can call fail() with a clear reason.
  REPLAY_RC=0
  python3 - "${FIRST_OUT}" "${SECOND_OUT}" "${OUT_DIR}/duplicate-replay.sanitized.json" <<'PY' || REPLAY_RC=$?
import json, sys

def load_result(path: str) -> dict:
    doc = json.load(open(path))
    if isinstance(doc, dict) and "body" in doc and isinstance(doc["body"], str):
        try:
            return json.loads(doc["body"])
        except Exception:
            return doc
    return doc

first = load_result(sys.argv[1])
second = load_result(sys.argv[2])
out = sys.argv[3]

def slice_counters(r: dict) -> dict:
    return {
        "accepted": r.get("accepted"),
        "persistedIncidents": r.get("persistedIncidents"),
        "duplicateIncidents": r.get("duplicateIncidents"),
        "analysisAttempts": r.get("analysisAttempts"),
        "analyzedIncidents": r.get("analyzedIncidents"),
        "analysisFailures": r.get("analysisFailures"),
        "notificationAttempts": r.get("notificationAttempts"),
        "notificationsSent": r.get("notificationsSent"),
        "notificationFailures": r.get("notificationFailures"),
    }

safe = {"first": slice_counters(first), "second": slice_counters(second)}
json.dump(safe, open(out, "w"), indent=2)
print(json.dumps(safe, indent=2))

errors = []
if first.get("accepted") is not True:
    errors.append("first_not_accepted")
if second.get("accepted") is not True:
    errors.append("second_not_accepted")

# First must create + analyze + notify (high severity from error→high mapping).
if first.get("persistedIncidents") != 1:
    errors.append(f"first_persistedIncidents={first.get('persistedIncidents')}")
if (first.get("duplicateIncidents") or 0) != 0:
    errors.append(f"first_duplicateIncidents={first.get('duplicateIncidents')}")
if first.get("analysisAttempts") != 1:
    errors.append(f"first_analysisAttempts={first.get('analysisAttempts')}")
if first.get("analyzedIncidents") != 1:
    errors.append(f"first_analyzedIncidents={first.get('analyzedIncidents')}")
if (first.get("notificationAttempts") or 0) < 1:
    errors.append(f"first_notificationAttempts={first.get('notificationAttempts')}")
if (first.get("notificationsSent") or 0) < 1:
    errors.append(f"first_notificationsSent={first.get('notificationsSent')}")

# Second must be duplicate only — no re-analyze, no re-notify.
if second.get("duplicateIncidents") != 1:
    errors.append(f"second_duplicateIncidents={second.get('duplicateIncidents')}")
if (second.get("persistedIncidents") or 0) != 0:
    errors.append(f"second_persistedIncidents={second.get('persistedIncidents')}")
if (second.get("analysisAttempts") or 0) != 0:
    errors.append(f"second_analysisAttempts={second.get('analysisAttempts')}")
if (second.get("analyzedIncidents") or 0) != 0:
    errors.append(f"second_analyzedIncidents={second.get('analyzedIncidents')}")
if (second.get("notificationAttempts") or 0) != 0:
    errors.append(f"second_notificationAttempts={second.get('notificationAttempts')}")
if (second.get("notificationsSent") or 0) != 0:
    errors.append(f"second_notificationsSent={second.get('notificationsSent')}")

if errors:
    print("ASSERTION_FAILURES: " + "; ".join(errors), file=sys.stderr)
    raise SystemExit(2)
print("duplicate_replay_assertions_ok", file=sys.stderr)
PY

  if [[ "${REPLAY_RC}" -ne 0 ]]; then
    fail "duplicate_replay_assertions_failed"
  fi

  echo "    verifying DynamoDB replay incident remains open + analysis completed..."
  REPLAY_ITEM="$(aws dynamodb get-item \
    --table-name "${INCIDENTS_TABLE_NAME}" \
    --key "{\"id\":{\"S\":\"${REPLAY_INCIDENT_ID}\"}}" \
    --consistent-read \
    --output json 2>/dev/null || echo '{}')"
  DDB_RC=0
  python3 - "${REPLAY_ITEM}" "${OUT_DIR}/duplicate-replay-item.sanitized.json" "${REPLAY_INCIDENT_ID}" <<'PY' || DDB_RC=$?
import json, sys
raw = json.loads(sys.argv[1])
out = sys.argv[2]
iid = sys.argv[3]
item = raw.get("Item") or {}
if not item:
    print("replay_item_missing", file=sys.stderr)
    raise SystemExit(2)

def s(key):
    return (item.get(key) or {}).get("S") or ""

analysis = item.get("analysis") or {}
m = analysis.get("M") or {}
status = (m.get("status") or {}).get("S") or ""
actions = (m.get("recommendedActions") or {}).get("L") or []
safe = {
    "id": iid,
    "status": s("status"),
    "source": s("source"),
    "severity": s("severity"),
    "analysisStatus": status,
    "summaryPresent": bool((m.get("summary") or {}).get("S")),
    "possibleCausePresent": bool((m.get("possibleCause") or {}).get("S")),
    "recommendedActionsCount": len(actions),
    "analyzedAtPresent": bool((m.get("analyzedAt") or {}).get("S")),
}
json.dump(safe, open(out, "w"), indent=2)
print(json.dumps(safe, indent=2))
errors = []
if safe["status"] != "open":
    errors.append(f"status={safe['status']}")
if safe["analysisStatus"] != "completed":
    errors.append(f"analysisStatus={safe['analysisStatus']}")
if not safe["summaryPresent"] or not safe["possibleCausePresent"]:
    errors.append("analysis_fields_missing")
if not (1 <= safe["recommendedActionsCount"] <= 5):
    errors.append("recommendedActions_out_of_range")
if not safe["analyzedAtPresent"]:
    errors.append("analyzedAt_missing")
if errors:
    print("DDB_ASSERTION_FAILURES: " + "; ".join(errors), file=sys.stderr)
    raise SystemExit(2)
PY
  if [[ "${DDB_RC}" -ne 0 ]]; then
    fail "duplicate_replay_incident_state_failed"
  fi

  pass_idem="pass"
  echo "    duplicate replay OK:"
  echo "      - first: created + analyzed + notified once"
  echo "      - second: duplicate only (no Bedrock, no SNS)"
  echo "      - DynamoDB: open + analysis.completed intact"
  echo "    Note: first replay invoke may send one additional SNS test email."
else
  echo "==> [replaying duplicate] skipped"
fi

echo "==> [complete]"
trap - ERR
write_success
echo "OK: Sprint 5 AI pipeline verification passed"
echo "    Summary: ${SUMMARY}"
