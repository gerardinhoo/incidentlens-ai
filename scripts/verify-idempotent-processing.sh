#!/usr/bin/env bash
# Manual verification: same CloudWatch envelope invoked twice → one create, one duplicate.
#
# Does NOT use two /test-error HTTP calls (those produce different CloudWatch event IDs).
# Instead: generate one valid DATA_MESSAGE envelope and invoke the processor Lambda twice.
#
# Usage (from repo root, after deploy):
#   PROCESSOR_FUNCTION_NAME=incidentlens-dev-processor \
#   DYNAMODB_TABLE_NAME=incidentlens-dev-incidents \
#   AWS_REGION=us-east-1 \
#   ./scripts/verify-idempotent-processing.sh
#
# Env:
#   PROCESSOR_FUNCTION_NAME  Default: incidentlens-dev-processor
#   DYNAMODB_TABLE_NAME      Default: incidentlens-dev-incidents
#   AWS_REGION               Default: us-east-1
#   VERIFY_OUT_DIR           Default: artifacts/deployment-tests
#
# Creates at most one new DynamoDB incident per run (unique sourceEventId).
# Does not delete data. Not intended for every PR.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${VERIFY_OUT_DIR:-${ROOT}/artifacts/deployment-tests}"
mkdir -p "${OUT_DIR}"
SUMMARY="${OUT_DIR}/idempotent-processing-summary.md"
STATUS_JSON="${OUT_DIR}/idempotent-processing-status.json"

PROCESSOR_FUNCTION_NAME="${PROCESSOR_FUNCTION_NAME:-incidentlens-dev-processor}"
DYNAMODB_TABLE_NAME="${DYNAMODB_TABLE_NAME:-incidentlens-dev-incidents}"
AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="${AWS_REGION}"

for cmd in aws python3 node; do
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
SOURCE_EVENT_ID="scrum35-idempotency-${START_MS}"

echo "==> Generating controlled CloudWatch DATA_MESSAGE envelope"
PAYLOAD_PATH="${OUT_DIR}/idempotency-envelope.json"
INCIDENT_ID="$(node - "${PAYLOAD_PATH}" "${SOURCE_EVENT_ID}" <<'NODE'
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
  msg: 'controlled idempotency fixture',
});
const payload = {
  owner: '000000000000',
  logGroup: '/aws/lambda/incidentlens-dev-api',
  logStream: 'scrum35/idempotency',
  subscriptionFilters: ['incidentlens-dev-api-incident-candidate'],
  messageType: 'DATA_MESSAGE',
  logEvents: [{ id: sourceEventId, timestamp: Date.now(), message }],
};
const envelope = {
  awslogs: {
    data: gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64'),
  },
};
writeFileSync(outPath, JSON.stringify(envelope));
const id =
  'auto_' +
  createHash('sha256').update(sourceEventId, 'utf8').digest('hex').slice(0, 32);
process.stdout.write(id);
NODE
)"

invoke_once() {
  local label="$1"
  local out="${OUT_DIR}/idempotency-invoke-${label}.json"
  aws lambda invoke \
    --function-name "${PROCESSOR_FUNCTION_NAME}" \
    --cli-binary-format raw-in-base64-out \
    --payload "fileb://${PAYLOAD_PATH}" \
    "${out}" >/dev/null
  python3 - "${out}" "${label}" <<'PY'
import json, sys
path, label = sys.argv[1], sys.argv[2]
data = json.load(open(path))
safe = {
    "label": label,
    "accepted": data.get("accepted"),
    "messageType": data.get("messageType"),
    "processedRecords": data.get("processedRecords"),
    "attemptedIncidents": data.get("attemptedIncidents"),
    "persistedIncidents": data.get("persistedIncidents"),
    "duplicateIncidents": data.get("duplicateIncidents"),
    "persistenceFailures": data.get("persistenceFailures"),
    "failedRecords": data.get("failedRecords"),
}
json.dump(safe, open(path, "w"), indent=2)
print(json.dumps(safe))
PY
}

echo "==> First processor invoke (expect persistedIncidents=1)"
FIRST_JSON="$(invoke_once first)"
echo "    ${FIRST_JSON}"

echo "==> Second processor invoke with identical envelope (expect duplicateIncidents=1)"
SECOND_JSON="$(invoke_once second)"
echo "    ${SECOND_JSON}"

python3 - "${FIRST_JSON}" "${SECOND_JSON}" "${INCIDENT_ID}" <<'PY'
import json, sys
first = json.loads(sys.argv[1])
second = json.loads(sys.argv[2])
incident_id = sys.argv[3]
errors = []
if first.get("accepted") is not True or first.get("persistedIncidents") != 1:
    errors.append(f"first={first}")
if first.get("duplicateIncidents", 0) != 0:
    errors.append("first unexpectedly duplicated")
if second.get("accepted") is not True or second.get("duplicateIncidents") != 1:
    errors.append(f"second={second}")
if second.get("persistedIncidents", 0) != 0:
    errors.append("second unexpectedly persisted")
if second.get("persistenceFailures", 0) != 0:
    errors.append("second persistenceFailures")
if errors:
    raise SystemExit("; ".join(errors))
print(incident_id)
PY

echo "==> Verifying single DynamoDB item for deterministic id"
ITEM_JSON="$(aws dynamodb get-item \
  --table-name "${DYNAMODB_TABLE_NAME}" \
  --key "{\"id\":{\"S\":\"${INCIDENT_ID}\"}}" \
  --consistent-read \
  --output json 2>/dev/null || echo '{}')"

python3 - "${ITEM_JSON}" "${OUT_DIR}/idempotency-item.sanitized.json" "${INCIDENT_ID}" <<'PY'
import json, sys
raw = json.loads(sys.argv[1])
out_path = sys.argv[2]
incident_id = sys.argv[3]
item = raw.get("Item") or {}
if not item:
    raise SystemExit("missing_item")

def s(key):
    return (item.get(key) or {}).get("S") or ""

safe = {
    "id": incident_id,
    "status": s("status"),
    "source": s("source"),
    "severity": s("severity"),
    "errorType": s("errorType"),
    "createdAt": s("createdAt"),
}
json.dump(safe, open(out_path, "w"), indent=2)
if safe["status"] != "open":
    raise SystemExit(f"status={safe['status']}")
if safe["source"] != "incidentlens-demo-api":
    raise SystemExit(f"source={safe['source']}")
if safe["severity"] != "high":
    raise SystemExit(f"severity={safe['severity']}")
PY

{
  echo "# Idempotent processing verification"
  echo ""
  echo "- Result: **PASS**"
  echo "- Processor: \`${PROCESSOR_FUNCTION_NAME}\`"
  echo "- Table: \`${DYNAMODB_TABLE_NAME}\`"
  echo "- sourceEventId: \`${SOURCE_EVENT_ID}\`"
  echo "- incidentId: \`${INCIDENT_ID}\`"
  echo "- First invoke: persistedIncidents=1"
  echo "- Second invoke: duplicateIncidents=1"
  echo "- Note: two separate /test-error calls are NOT expected to dedupe"
} >"${SUMMARY}"

echo "{\"passed\":true,\"incidentId\":\"${INCIDENT_ID}\",\"sourceEventId\":\"${SOURCE_EVENT_ID}\"}" >"${STATUS_JSON}"
echo "==> Idempotent processing verification passed"
cat "${SUMMARY}"
