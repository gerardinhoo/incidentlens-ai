#!/usr/bin/env bash
# Sync Vite build output to the dedicated frontend S3 bucket and invalidate CloudFront.
#
# Required env:
#   FRONTEND_BUCKET              — incidentlens-dev-web-<account> (never artifact/state buckets)
#   CLOUDFRONT_DISTRIBUTION_ID
# Optional:
#   DIST_DIR                     — default: apps/web/dist
#   AWS_REGION                   — default: us-east-1
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${DIST_DIR:-${ROOT_DIR}/apps/web/dist}"
AWS_REGION="${AWS_REGION:-us-east-1}"

: "${FRONTEND_BUCKET:?FRONTEND_BUCKET is required}"
: "${CLOUDFRONT_DISTRIBUTION_ID:?CLOUDFRONT_DISTRIBUTION_ID is required}"

case "${FRONTEND_BUCKET}" in
  *artifacts*|*tfstate*|*"terraform-state"*)
    echo "Refusing to sync to non-frontend bucket: ${FRONTEND_BUCKET}" >&2
    exit 1
    ;;
esac

if [[ ! "${FRONTEND_BUCKET}" =~ -web- ]]; then
  echo "Refusing bucket that does not look like the frontend web bucket: ${FRONTEND_BUCKET}" >&2
  exit 1
fi

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "Missing build output directory: ${DIST_DIR}" >&2
  echo "Run npm run build:web first (with VITE_API_BASE_URL set for production)." >&2
  exit 1
fi

if [[ ! -f "${DIST_DIR}/index.html" ]]; then
  echo "Missing ${DIST_DIR}/index.html — aborting sync." >&2
  exit 1
fi

echo "Syncing hashed assets (long cache) → s3://${FRONTEND_BUCKET}/"
# Exclude index.html so --delete does not remove the live entry document before the no-cache upload.
aws s3 sync "${DIST_DIR}" "s3://${FRONTEND_BUCKET}/" \
  --region "${AWS_REGION}" \
  --delete \
  --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable"

echo "Uploading index.html (no-cache) → s3://${FRONTEND_BUCKET}/index.html"
aws s3 cp "${DIST_DIR}/index.html" "s3://${FRONTEND_BUCKET}/index.html" \
  --region "${AWS_REGION}" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --content-type "text/html"

echo "Creating CloudFront invalidation for distribution ${CLOUDFRONT_DISTRIBUTION_ID}"
INVALIDATION_ID="$(aws cloudfront create-invalidation \
  --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)"

echo "Frontend deploy complete."
echo "  bucket=${FRONTEND_BUCKET}"
echo "  distribution_id=${CLOUDFRONT_DISTRIBUTION_ID}"
echo "  invalidation_id=${INVALIDATION_ID}"
