#!/usr/bin/env bash
# Smoke-check a deployed IncidentLens frontend (CloudFront) and optional API reachability.
#
# Required env:
#   FRONTEND_URL   — e.g. https://d2uo3ldb80w08p.cloudfront.net
# Optional:
#   API_BASE_URL   — if set, GET ${API_BASE_URL}/health (or /) must return HTTP 2xx/3xx
#   EXPECT_MARKER  — substring expected in HTML (default: IncidentLens)
set -euo pipefail

: "${FRONTEND_URL:?FRONTEND_URL is required}"

FRONTEND_URL="${FRONTEND_URL%/}"
EXPECT_MARKER="${EXPECT_MARKER:-IncidentLens}"
FAIL=0

check_spa_path() {
  local path="$1"
  local url="${FRONTEND_URL}${path}"
  local tmp
  tmp="$(mktemp)"
  local code
  code="$(curl -sS -L -o "${tmp}" -w "%{http_code}" --max-time 30 "${url}" || true)"

  if [[ "${code}" != "200" ]]; then
    echo "FAIL ${path}: expected HTTP 200, got ${code} (${url})" >&2
    FAIL=1
    rm -f "${tmp}"
    return
  fi

  local ctype
  ctype="$(file -b --mime-type "${tmp}" 2>/dev/null || echo unknown)"
  if ! grep -qiE 'text/html|application/xhtml' <<<"${ctype}" && ! grep -qi '<!doctype html\|<html' "${tmp}"; then
    echo "FAIL ${path}: response does not look like HTML (${ctype}) (${url})" >&2
    FAIL=1
    rm -f "${tmp}"
    return
  fi

  if ! grep -q "${EXPECT_MARKER}" "${tmp}"; then
    echo "FAIL ${path}: missing expected marker '${EXPECT_MARKER}' (${url})" >&2
    FAIL=1
    rm -f "${tmp}"
    return
  fi

  echo "OK   ${path}: HTTP ${code}, HTML with marker '${EXPECT_MARKER}'"
  rm -f "${tmp}"
}

echo "Verifying frontend deployment at ${FRONTEND_URL}"
check_spa_path "/"
check_spa_path "/incidents"

if [[ -n "${API_BASE_URL:-}" ]]; then
  API_BASE_URL="${API_BASE_URL%/}"
  api_code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 "${API_BASE_URL}/health" \
    || curl -sS -o /dev/null -w "%{http_code}" --max-time 30 "${API_BASE_URL}/" \
    || echo "000")"
  if [[ "${api_code}" =~ ^[23] ]]; then
    echo "OK   API: HTTP ${api_code} at ${API_BASE_URL}"
  else
    echo "FAIL API: expected 2xx/3xx, got ${api_code} (${API_BASE_URL})" >&2
    FAIL=1
  fi
fi

if [[ "${FAIL}" -ne 0 ]]; then
  echo "Frontend deployment verification failed." >&2
  exit 1
fi

echo "Frontend deployment verification passed."
