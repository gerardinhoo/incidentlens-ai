#!/usr/bin/env bash
# Verify CloudWatch Logs → processor delivery using the controlled GET /test-error path.
#
# Usage (from repo root):
#   API_URL=https://....amazonaws.com \
#   PROCESSOR_LOG_GROUP=/aws/lambda/incidentlens-dev-processor \
#   ./scripts/verify-log-subscription-delivery.sh
#
# Env:
#   API_URL                 Required. Deployed API base URL (no trailing slash preferred).
#   PROCESSOR_LOG_GROUP     Default: /aws/lambda/incidentlens-dev-processor
#   AWS_REGION              Default: us-east-1
#   DELIVERY_TIMEOUT_SEC    Default: 90
#   DELIVERY_POLL_SEC       Default: 5
#   VERIFY_OUT_DIR          Default: artifacts/deployment-tests
#
# Does NOT create DynamoDB records, decode payloads, or call Bedrock/SNS.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${VERIFY_OUT_DIR:-${ROOT}/artifacts/deployment-tests}"
mkdir -p "${OUT_DIR}"
SUMMARY="${OUT_DIR}/subscription-delivery-summary.md"
STATUS_JSON="${OUT_DIR}/subscription-delivery-status.json"

API_URL="${API_URL:-}"
PROCESSOR_LOG_GROUP="${PROCESSOR_LOG_GROUP:-/aws/lambda/incidentlens-dev-processor}"
AWS_REGION="${AWS_REGION:-us-east-1}"
DELIVERY_TIMEOUT_SEC="${DELIVERY_TIMEOUT_SEC:-90}"
DELIVERY_POLL_SEC="${DELIVERY_POLL_SEC:-5}"

export AWS_DEFAULT_REGION="${AWS_REGION}"

if [[ -z "${API_URL}" ]]; then
  echo "ERROR: API_URL is required" >&2
  exit 1
fi

# Trim trailing slash
API_URL="${API_URL%/}"

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI is required" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required" >&2
  exit 1
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "ERROR: AWS credentials not available" >&2
  exit 1
fi

START_MS="$(python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
)"

echo "==> Triggering controlled GET /test-error (expect HTTP 500)"
HTTP_CODE="$(curl -sS -o "${OUT_DIR}/test-error-response.sanitized.json" -w '%{http_code}' \
  -H 'accept: application/json' \
  -H "x-request-id: scrum32-delivery-${START_MS}" \
  "${API_URL}/test-error" || true)"

python3 - "${OUT_DIR}/test-error-response.sanitized.json" <<'PY'
import json, sys
path = sys.argv[1]
try:
    data = json.load(open(path))
except Exception:
    open(path, "w").write("{}")
    raise SystemExit(0)
# Keep only safe contract fields.
safe = {
    k: data[k]
    for k in ("statusCode", "error", "message", "requestId")
    if k in data
}
json.dump(safe, open(path, "w"), indent=2)
PY

if [[ "${HTTP_CODE}" != "500" ]]; then
  echo "ERROR: expected HTTP 500 from /test-error, got ${HTTP_CODE}" >&2
  echo '{"passed":false,"reason":"unexpected_http_status","httpCode":"'"${HTTP_CODE}"'"}' >"${STATUS_JSON}"
  exit 1
fi

echo "==> Polling processor log group for cloudwatch_logs receipt (timeout ${DELIVERY_TIMEOUT_SEC}s)"
DEADLINE=$((SECONDS + DELIVERY_TIMEOUT_SEC))
FOUND=0

while (( SECONDS < DEADLINE )); do
  # filter-log-events returns matching log messages after START_MS.
  # Search for structured receipt fields from the processor handler.
  EVENTS_JSON="$(aws logs filter-log-events \
    --log-group-name "${PROCESSOR_LOG_GROUP}" \
    --start-time "${START_MS}" \
    --filter-pattern '{ $.eventType = "cloudwatch_logs" && $.accepted = true && $.processedRecords = 0 }' \
    --limit 20 \
    --output json 2>/dev/null || echo '{"events":[]}')"

  COUNT="$(python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("events") or []))' <<<"${EVENTS_JSON}")"
  if [[ "${COUNT}" -gt 0 ]]; then
    FOUND=1
    # Sanitize: store only safe receipt metadata, never raw awslogs payloads.
    python3 - "${EVENTS_JSON}" "${OUT_DIR}/subscription-delivery-events.sanitized.json" <<'PY'
import json, sys
raw = json.loads(sys.argv[1])
out_path = sys.argv[2]
safe_events = []
for ev in raw.get("events") or []:
    msg = ev.get("message") or ""
    try:
        parsed = json.loads(msg)
    except Exception:
        continue
    safe_events.append({
        "timestamp": ev.get("timestamp"),
        "eventType": parsed.get("eventType"),
        "accepted": parsed.get("accepted"),
        "processedRecords": parsed.get("processedRecords"),
        "hasAwsLogsData": parsed.get("hasAwsLogsData"),
        "requestId": parsed.get("requestId"),
        "outcome": parsed.get("outcome"),
    })
json.dump({"matched": len(safe_events), "events": safe_events[:5]}, open(out_path, "w"), indent=2)
PY
    break
  fi
  echo "    waiting for processor receipt logs..."
  sleep "${DELIVERY_POLL_SEC}"
done

if [[ "${FOUND}" -ne 1 ]]; then
  {
    echo "# Subscription delivery verification"
    echo ""
    echo "- Result: **FAIL** (timeout)"
    echo "- API URL: \`${API_URL}\`"
    echo "- Processor log group: \`${PROCESSOR_LOG_GROUP}\`"
    echo "- HTTP /test-error: \`${HTTP_CODE}\`"
    echo "- Timeout: ${DELIVERY_TIMEOUT_SEC}s"
  } >"${SUMMARY}"
  echo '{"passed":false,"reason":"timeout","httpCode":"'"${HTTP_CODE}"'"}' >"${STATUS_JSON}"
  echo "ERROR: no matching processor receipt log within ${DELIVERY_TIMEOUT_SEC}s" >&2
  exit 1
fi

{
  echo "# Subscription delivery verification"
  echo ""
  echo "- Result: **PASS**"
  echo "- API URL: \`${API_URL}\`"
  echo "- Processor log group: \`${PROCESSOR_LOG_GROUP}\`"
  echo "- HTTP /test-error: \`${HTTP_CODE}\`"
  echo "- Matched processor receipt: \`eventType=cloudwatch_logs\`, \`accepted=true\`, \`processedRecords=0\`"
} >"${SUMMARY}"

echo '{"passed":true,"httpCode":"'"${HTTP_CODE}"'"}' >"${STATUS_JSON}"
echo "==> Subscription delivery verification passed"
cat "${SUMMARY}"
