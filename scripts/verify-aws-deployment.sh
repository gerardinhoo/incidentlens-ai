#!/usr/bin/env bash
# Read-only verification of deployed AWS resources (requires AWS CLI credentials/OIDC).
# Usage:
#   ./scripts/verify-aws-deployment.sh
# Env (typically from terraform output):
#   AWS_REGION
#   LAMBDA_FUNCTION_NAME (default: incidentlens-dev-api)
#   PROCESSOR_FUNCTION_NAME (default: incidentlens-dev-processor)
#   API_ID or API_NAME (default name: incidentlens-dev-http-api)
#   DYNAMODB_TABLE_NAME (default: incidentlens-dev-incidents)
#   LAMBDA_LOG_GROUP (default: /aws/lambda/<api-function>)
#   PROCESSOR_LOG_GROUP (default: /aws/lambda/<processor-function>)
#   ACCESS_LOG_GROUP (default: /aws/apigateway/<api-function>-access)
#   EXPECTED_TIMEOUT (default: 30)
#   EXPECTED_MEMORY (default: 512)
#   EXPECTED_PROCESSOR_MEMORY (default: 256)
#   EXPECTED_RETENTION_DAYS (default: 30)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${VERIFY_OUT_DIR:-${ROOT}/artifacts/deployment-tests}"
mkdir -p "${OUT_DIR}"
SUMMARY="${OUT_DIR}/aws-verify-summary.md"
REPORT="${OUT_DIR}/aws-verify-status.json"

AWS_REGION="${AWS_REGION:-us-east-1}"
LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-incidentlens-dev-api}"
PROCESSOR_FUNCTION_NAME="${PROCESSOR_FUNCTION_NAME:-incidentlens-dev-processor}"
API_NAME="${API_NAME:-incidentlens-dev-http-api}"
API_ID="${API_ID:-}"
DYNAMODB_TABLE_NAME="${DYNAMODB_TABLE_NAME:-incidentlens-dev-incidents}"
LAMBDA_LOG_GROUP="${LAMBDA_LOG_GROUP:-/aws/lambda/${LAMBDA_FUNCTION_NAME}}"
PROCESSOR_LOG_GROUP="${PROCESSOR_LOG_GROUP:-/aws/lambda/${PROCESSOR_FUNCTION_NAME}}"
ACCESS_LOG_GROUP="${ACCESS_LOG_GROUP:-/aws/apigateway/${LAMBDA_FUNCTION_NAME}-access}"
EXPECTED_TIMEOUT="${EXPECTED_TIMEOUT:-30}"
EXPECTED_MEMORY="${EXPECTED_MEMORY:-512}"
EXPECTED_PROCESSOR_MEMORY="${EXPECTED_PROCESSOR_MEMORY:-256}"
EXPECTED_RETENTION_DAYS="${EXPECTED_RETENTION_DAYS:-30}"

pass=0
fail=0
declare -a RESULTS=()

log() { printf '%s\n' "$*"; }

record() {
  local name="$1" status="$2" detail="$3"
  RESULTS+=("${name}|${status}|${detail}")
  if [[ "${status}" == "PASS" ]]; then
    pass=$((pass + 1))
    log "PASS  ${name} — ${detail}"
  else
    fail=$((fail + 1))
    log "FAIL  ${name} — ${detail}" >&2
  fi
}

export AWS_DEFAULT_REGION="${AWS_REGION}"

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI is required" >&2
  exit 1
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "ERROR: AWS credentials not available (OIDC/session required)" >&2
  exit 1
fi

verify_lambda() {
  local name="$1"
  local expected_memory="$2"
  local prefix="$3"
  local require_api_env="$4"

  if CFG="$(aws lambda get-function-configuration --function-name "${name}" --output json 2>/dev/null)"; then
    local runtime arch timeout memory state last role
    runtime="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["Runtime"])' <<<"${CFG}")"
    arch="$(python3 -c 'import json,sys; print(",".join(json.load(sys.stdin).get("Architectures") or []))' <<<"${CFG}")"
    timeout="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["Timeout"])' <<<"${CFG}")"
    memory="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["MemorySize"])' <<<"${CFG}")"
    state="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("State",""))' <<<"${CFG}")"
    last="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("LastUpdateStatus",""))' <<<"${CFG}")"
    role="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("Role",""))' <<<"${CFG}")"
    env_keys="$(python3 -c 'import json,sys; print(",".join(sorted((json.load(sys.stdin).get("Environment") or {}).get("Variables") or {})))' <<<"${CFG}")"

    [[ "${runtime}" == "nodejs22.x" ]] && record "${prefix}_runtime" "PASS" "${runtime}" || record "${prefix}_runtime" "FAIL" "got ${runtime}"
    [[ "${arch}" == *"arm64"* ]] && record "${prefix}_arch" "PASS" "${arch}" || record "${prefix}_arch" "FAIL" "got ${arch}"
    [[ "${timeout}" == "${EXPECTED_TIMEOUT}" ]] && record "${prefix}_timeout" "PASS" "${timeout}s" || record "${prefix}_timeout" "FAIL" "got ${timeout}"
    [[ "${memory}" == "${expected_memory}" ]] && record "${prefix}_memory" "PASS" "${memory}MB" || record "${prefix}_memory" "FAIL" "got ${memory}"
    [[ "${state}" == "Active" ]] && record "${prefix}_state" "PASS" "${state}" || record "${prefix}_state" "FAIL" "got ${state}"
    [[ "${last}" == "Successful" ]] && record "${prefix}_last_update" "PASS" "${last}" || record "${prefix}_last_update" "FAIL" "got ${last}"

    if [[ "${require_api_env}" == "true" ]]; then
      for key in NODE_ENV INCIDENT_REPOSITORY DYNAMODB_INCIDENTS_TABLE LOG_LEVEL; do
        if ! echo ",${env_keys}," | grep -q ",${key},"; then
          record "${prefix}_env_${key}" "FAIL" "missing env key"
        else
          record "${prefix}_env_${key}" "PASS" "present"
        fi
      done
    else
      for key in NODE_ENV SERVICE_NAME LOG_LEVEL; do
        if ! echo ",${env_keys}," | grep -q ",${key},"; then
          record "${prefix}_env_${key}" "FAIL" "missing env key"
        else
          record "${prefix}_env_${key}" "PASS" "present"
        fi
      done
    fi

    printf '%s\n' "${CFG}" | python3 -c 'import json,sys; d=json.load(sys.stdin); d.get("Environment",{}).pop("Variables",None); json.dump({"FunctionName":d.get("FunctionName"),"Runtime":d.get("Runtime"),"Architectures":d.get("Architectures"),"Timeout":d.get("Timeout"),"MemorySize":d.get("MemorySize"),"State":d.get("State"),"LastUpdateStatus":d.get("LastUpdateStatus"),"Role":d.get("Role"),"EnvironmentKeys":sorted(((d.get("Environment") or {}).get("Variables") or {}).keys())}, open("'"${OUT_DIR}"'/'"${prefix}"'-config.sanitized.json","w"), indent=2)'
    echo "${role}"
  else
    record "${prefix}_exists" "FAIL" "function ${name} not found"
    echo ""
  fi
}

# --- API Lambda ---
API_ROLE="$(verify_lambda "${LAMBDA_FUNCTION_NAME}" "${EXPECTED_MEMORY}" "lambda" "true")"

# --- Processor Lambda ---
PROCESSOR_ROLE="$(verify_lambda "${PROCESSOR_FUNCTION_NAME}" "${EXPECTED_PROCESSOR_MEMORY}" "processor" "false")"

if [[ -n "${API_ROLE}" && -n "${PROCESSOR_ROLE}" && "${API_ROLE}" != "${PROCESSOR_ROLE}" ]]; then
  record "processor_role_distinct" "PASS" "processor role differs from API role"
elif [[ -n "${API_ROLE}" && -n "${PROCESSOR_ROLE}" ]]; then
  record "processor_role_distinct" "FAIL" "processor role matches API role"
fi

# Function URL must not exist for processor
if URL_ERR="$(aws lambda get-function-url-config --function-name "${PROCESSOR_FUNCTION_NAME}" 2>&1)"; then
  record "processor_no_function_url" "FAIL" "unexpected Function URL present"
else
  if echo "${URL_ERR}" | grep -qiE 'ResourceNotFoundException|FunctionUrlConfig|does not have'; then
    record "processor_no_function_url" "PASS" "no Function URL"
  else
    record "processor_no_function_url" "FAIL" "unexpected error checking Function URL"
  fi
fi

# No event source mappings yet (CloudWatch subscription comes later)
ESM_COUNT="$(aws lambda list-event-source-mappings \
  --function-name "${PROCESSOR_FUNCTION_NAME}" \
  --query 'length(EventSourceMappings)' --output text 2>/dev/null || echo error)"
if [[ "${ESM_COUNT}" == "0" ]]; then
  record "processor_no_event_source" "PASS" "no event source mappings"
elif [[ "${ESM_COUNT}" == "error" ]]; then
  record "processor_no_event_source" "FAIL" "could not list event source mappings"
else
  record "processor_no_event_source" "FAIL" "found ${ESM_COUNT} mapping(s)"
fi

# Subscription filters must not exist on API log group yet (next story)
SUB_COUNT="$(aws logs describe-subscription-filters \
  --log-group-name "${LAMBDA_LOG_GROUP}" \
  --query 'length(subscriptionFilters)' --output text 2>/dev/null || echo error)"
if [[ "${SUB_COUNT}" == "0" ]]; then
  record "no_log_subscription_yet" "PASS" "API log group has no subscription filters"
elif [[ "${SUB_COUNT}" == "error" ]]; then
  record "no_log_subscription_yet" "FAIL" "could not describe subscription filters"
else
  record "no_log_subscription_yet" "FAIL" "found ${SUB_COUNT} subscription filter(s)"
fi

# --- API Gateway HTTP API ---
if [[ -z "${API_ID}" ]]; then
  API_ID="$(aws apigatewayv2 get-apis --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text 2>/dev/null || true)"
fi
if [[ -n "${API_ID}" && "${API_ID}" != "None" ]]; then
  record "api_exists" "PASS" "id=${API_ID}"
  STAGE="$(aws apigatewayv2 get-stage --api-id "${API_ID}" --stage-name '$default' --output json 2>/dev/null || true)"
  if [[ -n "${STAGE}" ]]; then
    auto="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("AutoDeploy"))' <<<"${STAGE}")"
    [[ "${auto}" == "True" || "${auto}" == "true" ]] && record "api_autodeploy" "PASS" "true" || record "api_autodeploy" "FAIL" "got ${auto}"
    record "api_stage" "PASS" "\$default exists"
  else
    record "api_stage" "FAIL" "\$default stage missing"
  fi

  ROUTE="$(aws apigatewayv2 get-routes --api-id "${API_ID}" --query "Items[?RouteKey=='\$default'] | [0]" --output json 2>/dev/null || true)"
  if [[ -n "${ROUTE}" && "${ROUTE}" != "null" ]]; then
    record "api_route" "PASS" "\$default route exists"
  else
    record "api_route" "FAIL" "\$default route missing"
  fi

  if aws apigatewayv2 get-integrations --api-id "${API_ID}" --output json >"${OUT_DIR}/.integrations.raw.json" 2>/dev/null \
    && python3 -c 'import json,sys; items=json.load(open(sys.argv[1])).get("Items") or []; assert any(i.get("IntegrationType")=="AWS_PROXY" and str(i.get("PayloadFormatVersion"))=="2.0" for i in items)' "${OUT_DIR}/.integrations.raw.json"; then
    record "api_integration" "PASS" "AWS_PROXY payload 2.0"
  else
    record "api_integration" "FAIL" "expected AWS_PROXY 2.0 integration"
  fi
  rm -f "${OUT_DIR}/.integrations.raw.json"

  ENDPOINT="$(aws apigatewayv2 get-api --api-id "${API_ID}" --query 'ApiEndpoint' --output text 2>/dev/null || true)"
  if [[ -n "${ENDPOINT}" && "${ENDPOINT}" == https://* ]]; then
    record "api_endpoint" "PASS" "available"
    echo "${ENDPOINT}" >"${OUT_DIR}/api-endpoint.txt"
  else
    record "api_endpoint" "FAIL" "missing endpoint"
  fi
else
  record "api_exists" "FAIL" "API ${API_NAME} not found"
fi

# --- CloudWatch log groups ---
for lg_name in "${LAMBDA_LOG_GROUP}" "${PROCESSOR_LOG_GROUP}" "${ACCESS_LOG_GROUP}"; do
  label="log_group_$(echo "${lg_name}" | tr '/-' '_')"
  RET="$(aws logs describe-log-groups --log-group-name-prefix "${lg_name}" \
    --query "logGroups[?logGroupName=='${lg_name}'].retentionInDays | [0]" --output text 2>/dev/null || echo None)"
  if [[ "${RET}" == "None" || -z "${RET}" ]]; then
    EXISTS="$(aws logs describe-log-groups --log-group-name-prefix "${lg_name}" \
      --query "logGroups[?logGroupName=='${lg_name}'].logGroupName | [0]" --output text 2>/dev/null || echo None)"
    if [[ "${EXISTS}" == "${lg_name}" ]]; then
      record "${label}" "FAIL" "exists but retention unset/unexpected"
    else
      record "${label}" "FAIL" "missing ${lg_name}"
    fi
  else
    if [[ "${RET}" == "${EXPECTED_RETENTION_DAYS}" ]]; then
      record "${label}" "PASS" "retention=${RET}"
    else
      record "${label}" "FAIL" "retention=${RET} expected ${EXPECTED_RETENTION_DAYS}"
    fi
  fi
done

# --- DynamoDB ---
if aws dynamodb describe-table --table-name "${DYNAMODB_TABLE_NAME}" --output json >"${OUT_DIR}/.dynamodb.raw.json" 2>/dev/null; then
  status="$(python3 -c 'import json; print(json.load(open("'"${OUT_DIR}"'/.dynamodb.raw.json"))["Table"]["TableStatus"])')"
  billing="$(python3 -c 'import json; t=json.load(open("'"${OUT_DIR}"'/.dynamodb.raw.json"))["Table"]; print((t.get("BillingModeSummary") or {}).get("BillingMode") or t.get("BillingMode") or "")')"
  key="$(python3 -c 'import json; ks=json.load(open("'"${OUT_DIR}"'/.dynamodb.raw.json"))["Table"]["KeySchema"]; print(",".join("%s=%s" % (k["AttributeName"], k["KeyType"]) for k in ks))')"
  [[ "${status}" == "ACTIVE" ]] && record "dynamodb_status" "PASS" "${status}" || record "dynamodb_status" "FAIL" "got ${status}"
  [[ "${billing}" == "PAY_PER_REQUEST" ]] && record "dynamodb_billing" "PASS" "${billing}" || record "dynamodb_billing" "FAIL" "got ${billing}"
  [[ "${key}" == *"id=HASH"* ]] && record "dynamodb_key" "PASS" "${key}" || record "dynamodb_key" "FAIL" "got ${key}"
  python3 -c 'import json; t=json.load(open("'"${OUT_DIR}"'/.dynamodb.raw.json"))["Table"]; json.dump({"TableName":t["TableName"],"TableStatus":t["TableStatus"],"KeySchema":t["KeySchema"],"BillingMode":(t.get("BillingModeSummary") or {}).get("BillingMode")}, open("'"${OUT_DIR}"'/dynamodb.sanitized.json","w"), indent=2)'
  rm -f "${OUT_DIR}/.dynamodb.raw.json"
else
  record "dynamodb_exists" "FAIL" "table ${DYNAMODB_TABLE_NAME} not found"
fi

{
  echo "# AWS deployment verification"
  echo ""
  echo "- Region: \`${AWS_REGION}\`"
  echo "- API Lambda: \`${LAMBDA_FUNCTION_NAME}\`"
  echo "- Processor Lambda: \`${PROCESSOR_FUNCTION_NAME}\`"
  echo "- Passed: ${pass}"
  echo "- Failed: ${fail}"
  echo ""
  echo "| Check | Result | Detail |"
  echo "| --- | --- | --- |"
  for row in "${RESULTS[@]}"; do
    IFS='|' read -r name status detail <<<"${row}"
    echo "| ${name} | ${status} | ${detail} |"
  done
} >"${SUMMARY}"

python3 - "${REPORT}" "${pass}" "${fail}" <<'PY'
import json, sys
out, passed, failed = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
json.dump({"passed": passed, "failed": failed}, open(out, "w"), indent=2)
PY

log "Summary written to ${SUMMARY}"
if [[ "${fail}" -ne 0 ]]; then
  exit 1
fi
echo "==> AWS deployment verification passed"
