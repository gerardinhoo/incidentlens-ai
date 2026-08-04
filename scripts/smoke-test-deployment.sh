#!/usr/bin/env bash
# Deployed HTTP smoke tests (read-only / invalid-write / controlled failures).
# Usage:
#   ./scripts/smoke-test-deployment.sh https://xxxx.execute-api.us-east-1.amazonaws.com
#   API_URL=https://... ./scripts/smoke-test-deployment.sh
#
# Does NOT create persistent incidents (no delete endpoint).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${1:-${API_URL:-}}"
OUT_DIR="${SMOKE_OUT_DIR:-${ROOT}/artifacts/deployment-tests}"
ORIGIN="${SMOKE_CORS_ORIGIN:-http://localhost:3000}"
MAX_ATTEMPTS="${SMOKE_MAX_ATTEMPTS:-8}"
SLEEP_SECS="${SMOKE_SLEEP_SECS:-5}"

mkdir -p "${OUT_DIR}"
SUMMARY="${OUT_DIR}/smoke-test-summary.md"
REPORT="${OUT_DIR}/smoke-test-status.json"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

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

if [[ -z "${API_URL}" ]]; then
  echo "ERROR: API base URL required (arg or API_URL)" >&2
  exit 1
fi

API_URL="${API_URL%/}"
if [[ ! "${API_URL}" =~ ^https:// ]]; then
  echo "ERROR: Deployed smoke tests require an https:// API_URL (got: ${API_URL})" >&2
  exit 1
fi

# curl helper: capture body + write status code to file. Does not use --fail.
http_call() {
  local method="$1" path="$2" body_file="$3" status_file="$4"
  shift 4
  curl -sS \
    --connect-timeout 5 \
    --max-time 20 \
    -X "${method}" \
    -o "${body_file}" \
    -w '%{http_code}' \
    "$@" \
    "${API_URL}${path}" >"${status_file}"
}

# Wait for API propagation using /health
attempt=0
health_ok=0
while [[ "${attempt}" -lt "${MAX_ATTEMPTS}" ]]; do
  attempt=$((attempt + 1))
  if http_call GET /health "${TMP}/health.json" "${TMP}/health.status" \
    -H 'Accept: application/json'; then
    code="$(cat "${TMP}/health.status")"
    if [[ "${code}" == "200" ]]; then
      health_ok=1
      break
    fi
  fi
  log "Waiting for API propagation (attempt ${attempt}/${MAX_ATTEMPTS})..."
  sleep "${SLEEP_SECS}"
done

if [[ "${health_ok}" -ne 1 ]]; then
  record "health" "FAIL" "did not return HTTP 200 within retries"
else
  code="$(cat "${TMP}/health.status")"
  ctype="$(file -b --mime-type "${TMP}/health.json" 2>/dev/null || echo application/json)"
  if python3 - "${TMP}/health.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert data.get("status") == "ok", data
assert "service" in data, data
sys.exit(0)
PY
  then
    record "health" "PASS" "HTTP ${code}; healthy JSON"
    cp "${TMP}/health.json" "${OUT_DIR}/health.body.json"
  else
    record "health" "FAIL" "HTTP ${code}; body missing expected status/service (${ctype})"
  fi
fi

# GET /incidents — must be 200 JSON array (may be non-empty)
http_call GET /incidents "${TMP}/incidents.json" "${TMP}/incidents.status" \
  -H 'Accept: application/json' || true
code="$(cat "${TMP}/incidents.status" 2>/dev/null || echo 000)"
if [[ "${code}" == "200" ]] && python3 - "${TMP}/incidents.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert isinstance(data, list), type(data)
sys.exit(0)
PY
then
  record "incidents_list" "PASS" "HTTP 200; JSON array"
  cp "${TMP}/incidents.json" "${OUT_DIR}/incidents.body.json"
else
  record "incidents_list" "FAIL" "expected HTTP 200 JSON array; got ${code}"
fi

# GET unknown route — expect 404 JSON
http_call GET /deployment-smoke-test-not-found "${TMP}/notfound.json" "${TMP}/notfound.status" \
  -H 'Accept: application/json' || true
code="$(cat "${TMP}/notfound.status" 2>/dev/null || echo 000)"
if [[ "${code}" == "404" ]] && python3 - "${TMP}/notfound.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert isinstance(data, dict), data
# Safe error shape — no stack traces
blob = json.dumps(data).lower()
assert "stack" not in blob and "traceback" not in blob, data
sys.exit(0)
PY
then
  record "not_found" "PASS" "HTTP 404; safe JSON"
  cp "${TMP}/notfound.json" "${OUT_DIR}/not-found.body.json"
else
  record "not_found" "FAIL" "expected HTTP 404 safe JSON; got ${code}"
fi

# POST invalid body — expect 400
http_call POST /incidents "${TMP}/bad.json" "${TMP}/bad.status" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  --data '{"title":""}' || true
code="$(cat "${TMP}/bad.status" 2>/dev/null || echo 000)"
if [[ "${code}" == "400" ]] && python3 - "${TMP}/bad.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert isinstance(data, dict), data
blob = json.dumps(data).lower()
assert "stack" not in blob and "traceback" not in blob, data
sys.exit(0)
PY
then
  record "validation_400" "PASS" "HTTP 400; safe validation JSON"
  cp "${TMP}/bad.json" "${OUT_DIR}/validation-400.body.json"
else
  record "validation_400" "FAIL" "expected HTTP 400 safe JSON; got ${code}"
fi

# GET /test-error — expect 500 without stack
http_call GET /test-error "${TMP}/error.json" "${TMP}/error.status" \
  -H 'Accept: application/json' || true
code="$(cat "${TMP}/error.status" 2>/dev/null || echo 000)"
if [[ "${code}" == "500" ]] && python3 - "${TMP}/error.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert isinstance(data, dict), data
blob = json.dumps(data).lower()
assert "stack" not in blob and "traceback" not in blob and "at object." not in blob, data
sys.exit(0)
PY
then
  record "controlled_500" "PASS" "HTTP 500; safe error JSON"
  cp "${TMP}/error.json" "${OUT_DIR}/controlled-500.body.json"
else
  record "controlled_500" "FAIL" "expected HTTP 500 safe JSON; got ${code}"
fi

# CORS preflight (best-effort; non-brittle)
http_call OPTIONS /incidents "${TMP}/cors.body" "${TMP}/cors.status" \
  -H "Origin: ${ORIGIN}" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type" \
  -D "${TMP}/cors.headers" -o /dev/null || true
# Re-run capturing headers properly
curl -sS --connect-timeout 5 --max-time 20 -D "${TMP}/cors.headers" -o "${TMP}/cors.body" \
  -X OPTIONS \
  -H "Origin: ${ORIGIN}" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type" \
  "${API_URL}/incidents" >/dev/null || true
code="$(awk 'NR==1 {print $2}' "${TMP}/cors.headers" 2>/dev/null || echo 000)"
allow_origin="$(grep -i '^access-control-allow-origin:' "${TMP}/cors.headers" 2>/dev/null | tr -d '\r' || true)"
allow_methods="$(grep -i '^access-control-allow-methods:' "${TMP}/cors.headers" 2>/dev/null | tr -d '\r' || true)"
if [[ "${code}" =~ ^20[0-9]$|^204$ ]] && echo "${allow_origin}" | grep -qi "${ORIGIN}" && echo "${allow_methods}" | grep -Eqi 'GET'; then
  record "cors_preflight" "PASS" "HTTP ${code}; origin/methods present"
  cp "${TMP}/cors.headers" "${OUT_DIR}/cors.headers.txt"
else
  # Soft-fail documentation: still record FAIL so CI surfaces CORS regressions
  record "cors_preflight" "FAIL" "unexpected preflight (status=${code})"
fi

{
  echo "# Smoke test summary"
  echo ""
  echo "- API: \`${API_URL}\`"
  echo "- Passed: ${pass}"
  echo "- Failed: ${fail}"
  echo ""
  echo "| Test | Result | Detail |"
  echo "| --- | --- | --- |"
  for row in "${RESULTS[@]}"; do
    IFS='|' read -r name status detail <<<"${row}"
    echo "| ${name} | ${status} | ${detail} |"
  done
} >"${SUMMARY}"

{
  echo "{"
  echo "  \"api\": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${API_URL}"),"
  echo "  \"passed\": ${pass},"
  echo "  \"failed\": ${fail},"
  echo "  \"results\": ["
  first=1
  for row in "${RESULTS[@]}"; do
    IFS='|' read -r name status detail <<<"${row}"
    if [[ "${first}" -eq 1 ]]; then first=0; else echo ","; fi
    python3 -c 'import json,sys; print(json.dumps({"name":sys.argv[1],"status":sys.argv[2],"detail":sys.argv[3]}), end="")' "${name}" "${status}" "${detail}"
  done
  echo ""
  echo "  ]"
  echo "}"
} >"${REPORT}"

log ""
log "Summary written to ${SUMMARY}"

if [[ "${fail}" -ne 0 ]]; then
  exit 1
fi
echo "==> All smoke tests passed"
