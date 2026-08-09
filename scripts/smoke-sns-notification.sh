#!/usr/bin/env bash
# Manual SNS topic smoke test (not run on PR).
# Publishes one clearly labeled TEST message and prints MessageId only.
#
# Usage:
#   SNS_INCIDENT_TOPIC_ARN=arn:aws:sns:... AWS_REGION=us-east-1 \
#     ./scripts/smoke-sns-notification.sh
#
set -euo pipefail

TOPIC_ARN="${SNS_INCIDENT_TOPIC_ARN:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="${AWS_REGION}"

if [[ -z "${TOPIC_ARN}" ]]; then
  echo "ERROR: SNS_INCIDENT_TOPIC_ARN is required" >&2
  exit 1
fi

for cmd in aws; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "ERROR: ${cmd} is required" >&2
    exit 1
  fi
done

SUBJECT='[IncidentLens][TEST] SNS smoke notification'
BODY="$(cat <<EOF
IncidentLens AI SNS smoke test.

This is a deliberate TEST message to verify the topic accepts Publish.
It is not an incident notification.

Topic: ${TOPIC_ARN}
Region: ${AWS_REGION}
EOF
)"

echo "==> Publishing one TEST message to SNS topic"
MESSAGE_ID="$(aws sns publish \
  --topic-arn "${TOPIC_ARN}" \
  --subject "${SUBJECT}" \
  --message "${BODY}" \
  --query 'MessageId' \
  --output text)"

echo "MessageId: ${MESSAGE_ID}"
echo "OK: SNS publish succeeded (check email only if subscription is Confirmed)."
