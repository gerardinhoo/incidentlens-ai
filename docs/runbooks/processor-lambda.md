# Runbook: Processor Lambda foundation

Operational guide for the independently deployable incident processor Lambda
(`incidentlens-dev-processor`). Architecture overview:
[processor-lambda.md](../architecture/processor-lambda.md).

## Direct invocation (after deploy)

Safe fixture: `tests/fixtures/processor/generic-event.json`

```bash
aws lambda invoke \
  --function-name incidentlens-dev-processor \
  --cli-binary-format raw-in-base64-out \
  --payload fileb://tests/fixtures/processor/generic-event.json \
  processor-response.json

cat processor-response.json
```

Expected:

```json
{
  "accepted": true,
  "processedRecords": 0
}
```

Local (no AWS):

```bash
npm run dev:processor
```

Pull requests **must not** invoke the deployed processor. Main deploy may run a
safe fixture invoke after apply.

## CloudWatch logs

Log group: `/aws/lambda/incidentlens-dev-processor`

Retention follows `log_retention_days` (default 30).

Look for structured fields: `service`, `environment`, `requestId`, `eventType`,
`processedRecords`, `outcome`.

## Environment variables

See [architecture doc](../architecture/processor-lambda.md#environment-variables).
Do not print env values in CI logs unnecessarily.

## Packaging

```bash
npm run build:processor
./scripts/validate-lambda-package.sh processor
```

Handler inside the zip: `apps/incident-processor/src/handler.handler`
(compiled file `apps/incident-processor/src/handler.js`).

## Troubleshooting

| Symptom                                         | Likely cause                                      | Fix                                                                           |
| ----------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Failed deployment / CreateFunction AccessDenied | Bootstrap deploy role missing processor ARNs      | Re-apply `infrastructure/terraform/bootstrap` after pulling SCRUM-31          |
| Handler not found                               | Wrong handler string or incomplete package        | Confirm Terraform handler + `validate-lambda-package.sh processor`            |
| Package missing dependencies                    | `pino` not installed into `dist/lambda/processor` | Re-run `npm run build:processor`                                              |
| Lambda runtime error on cold start              | Invalid env (`LOG_LEVEL`, repository mode)        | Check function configuration keys (not values) in AWS console / verify script |
| Missing log stream                              | Role cannot `CreateLogStream` / wrong log group   | Confirm processor role + `/aws/lambda/incidentlens-dev-processor`             |
| Invoke returns FunctionError                    | Uncaught exception in handler                     | Inspect the processor log group for the request ID                            |

## Current limitations

- No CloudWatch Logs subscription filter
- No Base64 / gzip / awslogs parsing
- No DynamoDB writes, Bedrock, SNS, SQS, EventBridge, DLQ
- No Function URL, API Gateway route, or event source mapping
- No alarms / dashboards / X-Ray
- `processedRecords` is always `0`

## Next story

Connect CloudWatch Logs (API Lambda log group → processor) with a subscription
filter and least-privilege invoke permission — still without over-logging event
payloads.
