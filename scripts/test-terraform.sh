#!/usr/bin/env bash
# Run Terraform native tests (mocked AWS) for IncidentLens modules + dev root.
# Usage (from anywhere): ./scripts/test-terraform.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_ROOT="${ROOT}/infrastructure/terraform"

TARGETS=(
  "${TF_ROOT}/modules/dynamodb"
  "${TF_ROOT}/modules/s3"
  "${TF_ROOT}/modules/cloudwatch"
  "${TF_ROOT}/modules/iam"
  "${TF_ROOT}/modules/iam_logs"
  "${TF_ROOT}/modules/api_gateway"
  "${TF_ROOT}/modules/lambda"
  "${TF_ROOT}/environments/dev"
)

echo "==> IncidentLens Terraform tests (mocked providers; no AWS credentials required)"
echo "    Repository root: ${ROOT}"

for dir in "${TARGETS[@]}"; do
  rel="${dir#"${ROOT}/"}"
  echo ""
  echo "==> Testing ${rel}"
  (
    cd "${dir}"
    # Ensure providers are available; do not touch remote state backends.
    terraform init -backend=false -input=false >/dev/null
    terraform test
  )
done

echo ""
echo "==> All Terraform native tests passed"
