#!/usr/bin/env bash
# Deployed verification: /test-error → persist → enrich → SNS notification counters.
#
# Prerequisites:
# - Processor INCIDENT_NOTIFIER=sns
# - Optional email subscription Confirmed (human inbox check is separate)
#
# Usage:
#   API_URL=https://....amazonaws.com \
#   PROCESSOR_FUNCTION_NAME=incidentlens-dev-processor \
#   ./scripts/verify-incident-notification.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${VERIFY_OUT_DIR:-${ROOT}/artifacts/deployment-tests}"
mkdir -p "${OUT_DIR}"
SUMMARY="${OUT_DIR}/incident-notification-summary.md"
STATUS_JSON="${OUT_DIR}/incident-notification-status.json"

API_URL="${API_URL:-}"
PROCESSOR_FUNCTION_NAME="${PROCESSOR_FUNCTION_NAME:-incidentlens-dev-processor}"
AWS_REGION="${AWS_REGION:-us-east-1}"
DELIVERY_TIMEOUT_SEC="${DELIVERY_TIMEOUT_SEC:-180}"
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
print(int((time.time() - 30) * 1000))
PY
)"
SMOKE_REQUEST_ID="scrum41-notify-$(date +%s)"

echo "==> Triggering controlled GET /test-error (expect HTTP 500)"
HTTP_CODE="$(curl -sS -o "${OUT_DIR}/notify-test-error-response.sanitized.json" -w '%{http_code}' \
  -H 'accept: application/json' \
  -H "x-request-id: ${SMOKE_REQUEST_ID}" \
  "${API_URL}/test-error" || true)"

if [[ "${HTTP_CODE}" != "500" ]]; then
  echo "ERROR: expected HTTP 500 from /test-error, got ${HTTP_CODE}" >&2
  exit 1
fi

echo "==> Polling processor logs for notification counters (timeout ${DELIVERY_TIMEOUT_SEC}s)"
DEADLINE=$(( $(date +%s) + DELIVERY_TIMEOUT_SEC ))
FOUND=""
while (( $(date +%s) < DEADLINE )); do
  LOGS_JSON="$(aws logs filter-log-events \
    --log-group-name "/aws/lambda/${PROCESSOR_FUNCTION_NAME}" \
    --start-time "${START_MS}" \
    --filter-pattern '"cloudwatch data message processed"' \
    --limit 20 \
    --output json 2>/dev/null || true)"

  FOUND="$(LOGS_JSON="${LOGS_JSON}" python3 - <<'PY'
import json, os, re
raw = json.loads(os.environ.get("LOGS_JSON") or "{}")
for ev in raw.get("events") or []:
    msg = ev.get("message") or ""
    # Prefer structured JSON log lines.
    try:
        obj = json.loads(msg)
    except Exception:
        # Fall back to scanning key=value style if present.
        m_att = re.search(r'"?notificationAttempts"?\s*[:=]\s*(\d+)', msg)
        m_sent = re.search(r'"?notificationsSent"?\s*[:=]\s*(\d+)', msg)
        if m_att and m_sent and int(m_att.group(1)) >= 1 and int(m_sent.group(1)) >= 1:
            print(json.dumps({
                "notificationAttempts": int(m_att.group(1)),
                "notificationsSent": int(m_sent.group(1)),
                "notificationFailures": 0,
            }))
            break
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
)"
  if [[ -n "${FOUND}" ]]; then
    break
  fi
  sleep "${DELIVERY_POLL_SEC}"
done

if [[ -z "${FOUND}" ]]; then
  cat > "${SUMMARY}" <<EOF
# Incident notification verification

**Status:** FAIL

No processor log line with notificationAttempts >= 1 and notificationsSent >= 1
within ${DELIVERY_TIMEOUT_SEC}s.

Check:
- INCIDENT_NOTIFIER=sns
- SNS_INCIDENT_TOPIC_ARN
- processor sns:Publish IAM
- severity eligibility (high/critical; /test-error maps to high)
EOF
  echo '{"ok":false}' > "${STATUS_JSON}"
  echo "ERROR: notification counters not observed" >&2
  exit 1
fi

python3 - "${FOUND}" "${SUMMARY}" "${STATUS_JSON}" <<'PY'
import json, sys
found = json.loads(sys.argv[1])
summary_path, status_path = sys.argv[2], sys.argv[3]
ok = (
    found.get("notificationAttempts", 0) >= 1
    and found.get("notificationsSent", 0) >= 1
)
status = {
    "ok": ok,
    "notificationAttempts": found.get("notificationAttempts"),
    "notificationsSent": found.get("notificationsSent"),
    "notificationFailures": found.get("notificationFailures"),
    "persistedIncidents": found.get("persistedIncidents"),
    "analyzedIncidents": found.get("analyzedIncidents"),
    "outcome": found.get("outcome"),
}
open(status_path, "w").write(json.dumps(status, indent=2) + "\n")
open(summary_path, "w").write(
    "# Incident notification verification\n\n"
    f"**Status:** {'PASS' if ok else 'FAIL'}\n\n"
    f"- notificationAttempts: {found.get('notificationAttempts')}\n"
    f"- notificationsSent: {found.get('notificationsSent')}\n"
    f"- notificationFailures: {found.get('notificationFailures')}\n"
    f"- persistedIncidents: {found.get('persistedIncidents')}\n"
    f"- analyzedIncidents: {found.get('analyzedIncidents')}\n"
    f"- outcome: {found.get('outcome')}\n\n"
    "Human check: confirm SNS email delivery only if the subscription is Confirmed.\n"
    "This script does not inspect the recipient inbox.\n"
)
raise SystemExit(0 if ok else 1)
PY

echo "OK: notification counters observed (see ${SUMMARY})"
echo "Reminder: confirm the SNS email subscription and check the inbox manually."
