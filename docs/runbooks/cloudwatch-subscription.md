# Runbook: CloudWatch subscription (API → processor)

Operational guide for the SCRUM-32 log subscription. Architecture:
[cloudwatch-subscription.md](../architecture/cloudwatch-subscription.md).

## Resources

| Item                | Value                                                   |
| ------------------- | ------------------------------------------------------- |
| Source log group    | `/aws/lambda/incidentlens-dev-api`                      |
| Destination         | `incidentlens-dev-processor`                            |
| Filter name         | `incidentlens-dev-api-incident-candidate`               |
| Filter pattern      | `{ $.eventType = "incident_candidate" }`                |
| Processor log group | `/aws/lambda/incidentlens-dev-processor` (not a source) |

## Trigger a controlled delivery test

```bash
API_URL="$(cd infrastructure/terraform/environments/dev && terraform output -raw api_invoke_url)"

curl -i -H 'accept: application/json' "${API_URL%/}/test-error"
# Expect HTTP 500 + safe JSON body
```

Then verify delivery (bounded poll of processor logs):

```bash
API_URL=... \
PROCESSOR_LOG_GROUP=/aws/lambda/incidentlens-dev-processor \
AWS_REGION=us-east-1 \
npm run test:subscription-delivery
```

Or:

```bash
./scripts/verify-log-subscription-delivery.sh
```

Expected processor receipt fields (structured JSON):

- `eventType` = `cloudwatch_logs`
- `messageType` = `DATA_MESSAGE`
- `accepted` = `true`
- `processedRecords` >= `1`

See also [cloudwatch-event-parsing.md](./cloudwatch-event-parsing.md).

## Inspect the subscription

```bash
aws logs describe-subscription-filters \
  --log-group-name /aws/lambda/incidentlens-dev-api
```

```bash
aws lambda get-policy --function-name incidentlens-dev-processor
```

Confirm principal `logs.<region>.amazonaws.com` and source ARN scoped to the
API log group (`...:*`).

## View processor receipt logs

```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/incidentlens-dev-processor \
  --start-time "$(($(date +%s)*1000 - 300000))" \
  --filter-pattern '{ $.eventType = "cloudwatch_logs" }'
```

Do not print or paste `awslogs.data` payloads from invocation events.

## Read-only deployment verification

```bash
./scripts/verify-aws-deployment.sh
```

Checks subscription presence, filter pattern, processor policy, and that the
processor log group has **no** subscription filter.

## Troubleshooting

| Symptom                 | Likely cause                                        | Fix                                                                                      |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| No subscription exists  | Apply not run / wrong log group                     | `terraform plan/apply` for `module.api_log_subscription`                                 |
| AccessDenied on apply   | Bootstrap role missing Put/DeleteSubscriptionFilter | Re-apply `infrastructure/terraform/bootstrap`                                            |
| Invalid destination     | Processor ARN wrong / permission missing            | Ensure processor exists; permission `depends_on` before filter                           |
| No processor invocation | Filter mismatch / permission source ARN mismatch    | Confirm `/test-error` logs `eventType=incident_candidate`; check `get-policy` source ARN |
| Filter does not match   | Logging missing `eventType` or wrong JSON shape     | Redeploy API Lambda with SCRUM-32 test-error logging                                     |
| Unexpected recursion    | Processor log group subscribed                      | Remove any filter on `/aws/lambda/incidentlens-dev-processor`                            |
| Delivery timeout in CI  | Async lag                                           | Increase `DELIVERY_TIMEOUT_SEC`; confirm subscription + permission                       |

## Current limitations

- Delivery only — no decode/parse/persist/AI/notifications
- Narrow filter — only deliberate `incident_candidate` logs
- Pull requests do **not** invoke `/test-error` against deployed AWS

## Related

- [cloudwatch-logging.md](./cloudwatch-logging.md)
- [deployment-testing.md](./deployment-testing.md)
