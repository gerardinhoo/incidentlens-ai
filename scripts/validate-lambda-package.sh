#!/usr/bin/env bash
# Validate the built Lambda package under dist/lambda.
# Usage (from anywhere): ./scripts/validate-lambda-package.sh
# Optional: MAX_PACKAGE_MB=80 (default) — soft upper bound for package size.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="${ROOT}/dist/lambda"
HANDLER_REL="apps/demo-api/src/lambda.js"
MAX_PACKAGE_MB="${MAX_PACKAGE_MB:-80}"

echo "==> Validating Lambda package"
echo "    Package dir: ${PACKAGE_DIR}"

if [[ ! -d "${PACKAGE_DIR}" ]]; then
  echo "ERROR: Package directory missing. Run: npm run build:lambda" >&2
  exit 1
fi

if [[ ! -f "${PACKAGE_DIR}/package.json" ]]; then
  echo "ERROR: ${PACKAGE_DIR}/package.json is missing" >&2
  exit 1
fi

if [[ ! -f "${PACKAGE_DIR}/${HANDLER_REL}" ]]; then
  echo "ERROR: Handler entry file missing: ${HANDLER_REL}" >&2
  exit 1
fi

SIZE_HUMAN="$(du -sh "${PACKAGE_DIR}" | awk '{print $1}')"
SIZE_KB="$(du -sk "${PACKAGE_DIR}" | awk '{print $1}')"
SIZE_MB=$((SIZE_KB / 1024))

if [[ "${SIZE_KB}" -le 0 ]]; then
  echo "ERROR: Package appears empty" >&2
  exit 1
fi

echo "    Package size: ${SIZE_HUMAN} (~${SIZE_MB} MiB)"

if [[ "${SIZE_MB}" -gt "${MAX_PACKAGE_MB}" ]]; then
  echo "ERROR: Package exceeds ${MAX_PACKAGE_MB} MiB threshold (${SIZE_MB} MiB)" >&2
  exit 1
fi

FORBIDDEN_FOUND=0

# Secrets / state / git metadata — forbidden anywhere in the package.
while IFS= read -r path; do
  [[ -z "${path}" ]] && continue
  echo "ERROR: Forbidden path in Lambda package: ${path}" >&2
  FORBIDDEN_FOUND=1
done < <(
  find "${PACKAGE_DIR}" \( \
    -name '.env' -o \
    -name '.env.*' -o \
    -name '*.tfstate' -o \
    -name '*.tfstate.*' -o \
    -name '.git' -o \
    -path '*/.git/*' \
  \) -print 2>/dev/null || true
)

# Project test/coverage artifacts — check apps/ and packages/ only (not dependency node_modules).
for scope in apps packages; do
  if [[ -d "${PACKAGE_DIR}/${scope}" ]]; then
    while IFS= read -r path; do
      [[ -z "${path}" ]] && continue
      echo "ERROR: Forbidden project test/coverage path in Lambda package: ${path}" >&2
      FORBIDDEN_FOUND=1
    done < <(
      find "${PACKAGE_DIR}/${scope}" \( \
        -name '*.test.js' -o \
        -name '*.test.ts' -o \
        -name 'coverage' -o \
        -path '*/coverage/*' -o \
        -name '.nyc_output' -o \
        -path '*/.nyc_output/*' \
      \) -print 2>/dev/null || true
    )
  fi
done

if [[ "${FORBIDDEN_FOUND}" -ne 0 ]]; then
  exit 1
fi

echo "==> Lambda package validation passed"
echo "    Handler: ${HANDLER_REL}"
echo "    Size: ${SIZE_HUMAN}"
