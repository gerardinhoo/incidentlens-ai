#!/usr/bin/env bash
# Deployed verification: /test-error → persist → AI enrichment → DynamoDB.
#
# Usage (from repo root):
#   API_URL=https://....amazonaws.com \
#   DYNAMODB_TABLE_NAME=incidentlens-dev-incidents \
#   ./scripts/verify-ai-incident-enrichment.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${VERIFY_OUT_DIR:-${ROOT}/artifacts/deployment-tests}"
mkdir -p "${OUT_DIR}"
SUMMARY="${OUT_DIR}/ai-incident-enrichment-summary.md"
STATUS_JSON="${OUT_DIR}/ai-incident-enrichment-status.json"

API_URL="${API_URL:-}"
DYNAMODB_TABLE_NAME="${DYNAMODB_TABLE_NAME:-incidentlens-dev-incidents}"
AWS_REGION="${AWS_REGION:-us-east-1}"
EXPECTED_SOURCE="${EXPECTED_SOURCE:-incidentlens-demo-api}"
DELIVERY_TIMEOUT_SEC="${DELIVERY_TIMEOUT_SEC:-180}"
DELIVERY_POLL_SEC="${DELIVERY_POLL_SEC:-5}"
REQUIRE_COMPLETED_ANALYSIS="${REQUIRE_COMPLETED_ANALYSIS:-true}"

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

START_ISO="$(python3 - <<'PY'
from datetime import datetime, timezone, timedelta
print((datetime.now(timezone.utc) - timedelta(seconds=30)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z")
PY
)"
SMOKE_REQUEST_ID="scrum40-enrich-$(date +%s)"

echo "==> Triggering controlled GET /test-error (expect HTTP 500)"
HTTP_CODE="$(curl -sS -o "${OUT_DIR}/ai-enrich-test-error-response.sanitized.json" -w '%{http_code}' \
  -H 'accept: application/json' \
  -H "x-request-id: ${SMOKE_REQUEST_ID}" \
  "${API_URL}/test-error" || true)"

if [[ "${HTTP_CODE}" != "500" ]]; then
  echo "ERROR: expected HTTP 500 from /test-error, got ${HTTP_CODE}" >&2
  exit 1
fi

echo "==> Polling DynamoDB for enriched incident (timeout ${DELIVERY_TIMEOUT_SEC}s)"
DEADLINE=$(( $(date +%s) + DELIVERY_TIMEOUT_SEC ))
FOUND_JSON=""
while (( $(date +%s) < DEADLINE )); do
  SCAN_JSON="$(aws dynamodb scan \
    --table-name "${DYNAMODB_TABLE_NAME}" \
    --filter-expression "attribute_exists(analysis) AND #src = :src AND createdAt >= :start" \
    --expression-attribute-names '{"#src":"source"}' \
    --expression-attribute-values "{\":src\":{\"S\":\"${EXPECTED_SOURCE}\"},\":start\":{\"S\":\"${START_ISO}\"}}" \
    --output json 2>/dev/null || true)"

  FOUND_JSON="$(REQUIRE_COMPLETED_ANALYSIS="${REQUIRE_COMPLETED_ANALYSIS}" SCAN_JSON="${SCAN_JSON}" python3 - <<'PY'
import json, os
raw = json.loads(os.environ.get("SCAN_JSON") or "{}")
require_completed = os.environ.get("REQUIRE_COMPLETED_ANALYSIS", "true").lower() == "true"
for item in raw.get("Items") or []:
    def s(key):
        return (item.get(key) or {}).get("S")
    analysis = item.get("analysis") or {}
    m = analysis.get("M") or {}
    status = (m.get("status") or {}).get("S")
    if require_completed and status != "completed":
        continue
    if status not in ("completed", "failed", "pending"):
        continue
    actions = []
    for a in (m.get("recommendedActions") or {}).get("L") or []:
        if "S" in a and a["S"].strip():
            actions.append(a["S"])
    print(json.dumps({
        "id": s("id"),
        "status": s("status"),
        "source": s("source"),
        "analysisStatus": status,
        "summary": (m.get("summary") or {}).get("S"),
        "possibleCause": (m.get("possibleCause") or {}).get("S"),
        "recommendedActions": actions,
        "analyzedAt": (m.get("analyzedAt") or {}).get("S"),
    }))
    break
PY
)" || true

  if [[ -n "${FOUND_JSON}" ]]; then
    break
  fi
  sleep "${DELIVERY_POLL_SEC}"
done

if [[ -z "${FOUND_JSON}" ]]; then
  echo "ERROR: timed out waiting for enriched incident" >&2
  printf '%s\n' "{\"ok\":false,\"reason\":\"timeout\",\"requestId\":\"${SMOKE_REQUEST_ID}\"}" > "${STATUS_JSON}"
  exit 1
fi

FOUND_JSON="${FOUND_JSON}" SUMMARY="${SUMMARY}" STATUS_JSON="${STATUS_JSON}" \
SMOKE_REQUEST_ID="${SMOKE_REQUEST_ID}" REQUIRE_COMPLETED_ANALYSIS="${REQUIRE_COMPLETED_ANALYSIS}" \
python3 - <<'PY'
import json, os, sys
data = json.loads(os.environ["FOUND_JSON"])
summary_path = os.environ["SUMMARY"]
status_path = os.environ["STATUS_JSON"]
req_id = os.environ["SMOKE_REQUEST_ID"]
require_completed = os.environ.get("REQUIRE_COMPLETED_ANALYSIS", "true").lower() == "true"
ok = True
reasons = []
if data.get("status") != "open":
    ok = False
    reasons.append("incident status not open")
if require_completed:
    if data.get("analysisStatus") != "completed":
        ok = False
        reasons.append("analysis.status not completed")
    if not data.get("summary"):
        ok = False
        reasons.append("missing summary")
    if not data.get("possibleCause"):
        ok = False
        reasons.append("missing possibleCause")
    actions = data.get("recommendedActions") or []
    if not (1 <= len(actions) <= 5):
        ok = False
        reasons.append("recommendedActions not in 1..5")
    if not data.get("analyzedAt"):
        ok = False
        reasons.append("missing analyzedAt")

sanitized = {
    "id": data.get("id"),
    "status": data.get("status"),
    "source": data.get("source"),
    "analysisStatus": data.get("analysisStatus"),
    "summaryPresent": bool(data.get("summary")),
    "possibleCausePresent": bool(data.get("possibleCause")),
    "recommendedActionsCount": len(data.get("recommendedActions") or []),
    "analyzedAt": data.get("analyzedAt"),
}
open(status_path, "w").write(json.dumps({
    "ok": ok,
    "requestId": req_id,
    "incident": sanitized,
    "reasons": reasons,
}, indent=2) + "\n")
lines = [
    "# AI incident enrichment verification",
    "",
    f"- requestId: `{req_id}`",
    f"- incidentId: `{sanitized.get('id')}`",
    f"- incident.status: `{sanitized.get('status')}`",
    f"- analysis.status: `{sanitized.get('analysisStatus')}`",
    f"- summaryPresent: {sanitized.get('summaryPresent')}",
    f"- possibleCausePresent: {sanitized.get('possibleCausePresent')}",
    f"- recommendedActionsCount: {sanitized.get('recommendedActionsCount')}",
    f"- analyzedAt: `{sanitized.get('analyzedAt')}`",
    f"- result: {'PASS' if ok else 'FAIL'}",
]
if reasons:
    lines.append("- reasons: " + ", ".join(reasons))
open(summary_path, "w").write("\n".join(lines) + "\n")
print(json.dumps(sanitized, indent=2))
sys.exit(0 if ok else 1)
PY

echo "==> AI enrichment verification passed"
echo "    Summary: ${SUMMARY}"
