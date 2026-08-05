#!/usr/bin/env bash
# Validate built Lambda packages under dist/lambda/{api,processor}.
# Usage (from anywhere):
#   ./scripts/validate-lambda-package.sh           # both
#   ./scripts/validate-lambda-package.sh api
#   ./scripts/validate-lambda-package.sh processor
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-all}"
MAX_PACKAGE_MB="${MAX_PACKAGE_MB:-80}"

validate_one() {
  local name="$1"
  local package_dir="$2"
  local handler_rel="$3"

  echo "==> Validating ${name} Lambda package"
  echo "    Package dir: ${package_dir}"

  if [[ ! -d "${package_dir}" ]]; then
    echo "ERROR: Package directory missing. Run: npm run build:lambda" >&2
    exit 1
  fi

  if [[ ! -f "${package_dir}/package.json" ]]; then
    echo "ERROR: ${package_dir}/package.json is missing" >&2
    exit 1
  fi

  if [[ ! -f "${package_dir}/${handler_rel}" ]]; then
    echo "ERROR: Handler entry file missing: ${handler_rel}" >&2
    exit 1
  fi

  local size_human size_kb size_mb
  size_human="$(du -sh "${package_dir}" | awk '{print $1}')"
  size_kb="$(du -sk "${package_dir}" | awk '{print $1}')"
  size_mb=$((size_kb / 1024))

  if [[ "${size_kb}" -le 0 ]]; then
    echo "ERROR: Package appears empty" >&2
    exit 1
  fi

  echo "    Package size: ${size_human} (~${size_mb} MiB)"

  if [[ "${size_mb}" -gt "${MAX_PACKAGE_MB}" ]]; then
    echo "ERROR: Package exceeds ${MAX_PACKAGE_MB} MiB threshold (${size_mb} MiB)" >&2
    exit 1
  fi

  local forbidden_found=0

  while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    echo "ERROR: Forbidden path in Lambda package: ${path}" >&2
    forbidden_found=1
  done < <(
    find "${package_dir}" \( \
      -name '.env' -o \
      -name '.env.*' -o \
      -name '*.tfstate' -o \
      -name '*.tfstate.*' -o \
      -name '.git' -o \
      -path '*/.git/*' \
    \) -print 2>/dev/null || true
  )

  for scope in apps packages; do
    if [[ -d "${package_dir}/${scope}" ]]; then
      while IFS= read -r path; do
        [[ -z "${path}" ]] && continue
        echo "ERROR: Forbidden project test/coverage path in Lambda package: ${path}" >&2
        forbidden_found=1
      done < <(
        find "${package_dir}/${scope}" \( \
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

  if [[ "${forbidden_found}" -ne 0 ]]; then
    exit 1
  fi

  echo "==> ${name} package validation passed"
  echo "    Handler: ${handler_rel}"
  echo "    Size: ${size_human}"
}

case "${TARGET}" in
  all)
    validate_one "api" "${ROOT}/dist/lambda/api" "apps/demo-api/src/lambda.js"
    validate_one "processor" "${ROOT}/dist/lambda/processor" "apps/incident-processor/src/handler.js"
    ;;
  api)
    validate_one "api" "${ROOT}/dist/lambda/api" "apps/demo-api/src/lambda.js"
    ;;
  processor)
    validate_one "processor" "${ROOT}/dist/lambda/processor" "apps/incident-processor/src/handler.js"
    ;;
  *)
    echo "Unknown target '${TARGET}'. Use: api | processor | all" >&2
    exit 1
    ;;
esac
