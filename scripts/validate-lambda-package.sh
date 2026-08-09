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

validate_processor_modules() {
  local package_dir="$1"
  local required=(
    "apps/incident-processor/src/handler.js"
    "apps/incident-processor/src/cloudwatch/decode-cloudwatch-event.js"
    "apps/incident-processor/src/cloudwatch/parse-cloudwatch-payload.js"
    "apps/incident-processor/src/cloudwatch/parse-log-record.js"
    "apps/incident-processor/src/cloudwatch/types.js"
    "apps/incident-processor/src/incidents/map-candidate-to-incident-input.js"
    "apps/incident-processor/src/incidents/build-automatic-incident-id.js"
    "apps/incident-processor/src/incidents/persist-incident-candidates.js"
    "apps/incident-processor/src/incidents/create-processor-repository.js"
    "apps/incident-processor/src/analysis/bedrock-incident-analyzer.js"
    "apps/incident-processor/src/analysis/build-incident-analysis-prompt.js"
    "apps/incident-processor/src/analysis/create-incident-analyzer.js"
    "apps/incident-processor/src/analysis/create-processor-analyzer.js"
    "apps/incident-processor/src/analysis/map-incident-to-analysis-input.js"
    "apps/incident-processor/src/notifications/sns-incident-notifier.js"
    "apps/incident-processor/src/notifications/create-incident-notifier.js"
    "apps/incident-processor/src/notifications/create-processor-notifier.js"
    "packages/analysis/src/parse-incident-analysis.js"
    "packages/analysis/src/incident-analysis-schema.js"
    "packages/domain/src/incident-analysis-lifecycle.js"
    "packages/domain/src/index.js"
    "packages/domain/src/create-incident.js"
    "packages/repository/src/index.js"
    "packages/repository/src/dynamodb-incident-repository.js"
    "packages/repository/src/create-incident-repository.js"
    "packages/analysis/src/index.js"
    "packages/notifications/src/index.js"
    "packages/notifications/src/should-notify-incident.js"
    "packages/notifications/src/build-incident-notification-message.js"
  )
  for rel in "${required[@]}"; do
    if [[ ! -f "${package_dir}/${rel}" ]]; then
      echo "ERROR: Processor package missing required module: ${rel}" >&2
      exit 1
    fi
  done

  # Domain + DynamoDB SDK must be present for automatic incident persistence.
  if [[ ! -d "${package_dir}/node_modules/@aws-sdk/client-dynamodb" ]]; then
    echo "ERROR: Processor package missing @aws-sdk/client-dynamodb" >&2
    exit 1
  fi
  if [[ ! -d "${package_dir}/node_modules/@aws-sdk/lib-dynamodb" ]]; then
    echo "ERROR: Processor package missing @aws-sdk/lib-dynamodb" >&2
    exit 1
  fi
  if [[ ! -d "${package_dir}/node_modules/@aws-sdk/client-bedrock-runtime" ]]; then
    echo "ERROR: Processor package missing @aws-sdk/client-bedrock-runtime" >&2
    exit 1
  fi
  if [[ ! -d "${package_dir}/node_modules/@aws-sdk/client-sns" ]]; then
    echo "ERROR: Processor package missing @aws-sdk/client-sns" >&2
    exit 1
  fi

  # Test fixtures must not ship in the runtime artifact.
  if [[ -d "${package_dir}/apps/incident-processor/tests" ]]; then
    echo "ERROR: Processor package must not include tests/" >&2
    exit 1
  fi
  echo "    Processor parse + persistence modules present"
}

case "${TARGET}" in
  all)
    validate_one "api" "${ROOT}/dist/lambda/api" "apps/demo-api/src/lambda.js"
    validate_one "processor" "${ROOT}/dist/lambda/processor" "apps/incident-processor/src/handler.js"
    validate_processor_modules "${ROOT}/dist/lambda/processor"
    ;;
  api)
    validate_one "api" "${ROOT}/dist/lambda/api" "apps/demo-api/src/lambda.js"
    ;;
  processor)
    validate_one "processor" "${ROOT}/dist/lambda/processor" "apps/incident-processor/src/handler.js"
    validate_processor_modules "${ROOT}/dist/lambda/processor"
    ;;
  *)
    echo "Unknown target '${TARGET}'. Use: api | processor | all" >&2
    exit 1
    ;;
esac
