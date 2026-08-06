# Runbook: Automatic incident creation

Ops guide for SCRUM-34 processor persistence. Architecture:
[automatic-incident-creation.md](../architecture/automatic-incident-creation.md).

## Local validation

```bash
nvm use 22
npm run test:processor
npm test
npm run build:processor
npm run test:lambda-package -- processor
```

Inject `MemoryIncidentRepository` in unit tests — no AWS credentials required.

## Deployed configuration checklist

| Check                                    | Expected                                       |
| ---------------------------------------- | ---------------------------------------------- |
| Processor env `INCIDENT_REPOSITORY`      | `dynamodb`                                     |
| Processor env `DYNAMODB_INCIDENTS_TABLE` | incidents table name                           |
| Processor IAM                            | `dynamodb:PutItem` on incidents table ARN only |
| API IAM                                  | unchanged (PutItem/GetItem/Scan)               |
| Subscription                             | API log group → processor                      |
| Processor log group                      | **not** subscribed                             |

```bash
./scripts/verify-aws-deployment.sh
```

## Manual persistence verification

Default deploy verification confirms processor Active + subscription delivery
(`processedRecords >= 1`). It does **not** assert DynamoDB writes on every job,
to limit table pollution (no delete endpoint yet).

After a successful deploy, run once when you need a write proof:

```bash
API_URL=https://....execute-api....amazonaws.com \
DYNAMODB_TABLE_NAME=incidentlens-dev-incidents \
PROCESSOR_LOG_GROUP=/aws/lambda/incidentlens-dev-processor \
AWS_REGION=us-east-1 \
npm run test:automatic-incident-creation
```

The script:

1. Records a start timestamp
2. Triggers `GET /test-error` once
3. Captures the API `requestId` from the safe 500 body
4. Polls processor logs for `persistedIncidents > 0`
5. Reads the incident via DynamoDB `GetItem` using `incidentId` from logs
6. Checks `status=open`, source, severity (`error` → `high`)
7. Writes sanitized evidence under `artifacts/deployment-tests/`

It does **not** delete the created incident.

### Cost / cleanliness tradeoff

| Path                                    | When                 | Writes DynamoDB?                                      |
| --------------------------------------- | -------------------- | ----------------------------------------------------- |
| `verify-aws-deployment.sh`              | every deploy         | no                                                    |
| `verify-log-subscription-delivery.sh`   | every deploy         | **yes** (side effect of `/test-error` after SCRUM-34) |
| `verify-automatic-incident-creation.sh` | manual / intentional | yes + asserts item                                    |

Subscription delivery still calls `/test-error`, so deploy smoke can create
incidents as a side effect. The dedicated script is the only step that asserts
`persistedIncidents` and DynamoDB fields.

## DynamoDB inspection (safe)

Prefer GetItem by `incidentId` from processor logs:

```bash
aws dynamodb get-item \
  --table-name incidentlens-dev-incidents \
  --key '{"id":{"S":"<incidentId>"}}' \
  --consistent-read
```

Print only `id`, `status`, `source`, `severity`, `errorType`, `createdAt`.
Do not dump full metadata or descriptions in shared channels.

## Troubleshooting

| Symptom                                    | Likely cause                                    | Fix                                                                          |
| ------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| No incident created                        | Subscription/filter/parse issue                 | Confirm delivery with `test:subscription-delivery`; check `processedRecords` |
| Processor AccessDeniedException on PutItem | IAM missing PutItem or wrong table ARN          | Redeploy Terraform IAM; confirm role policy                                  |
| Table name incorrect                       | Env mismatch                                    | Compare Lambda env to `incidents_table_name` output                          |
| Mapping failures in logs                   | Unsupported/missing severity                    | Confirm `/test-error` emits allow-listed `severity`                          |
| Repository save failures                   | DynamoDB throttle / permissions / table missing | Check CloudWatch processor error category `repository_save_failure`          |
| Partial batch failure                      | One bad candidate or one save error             | Expected; check counters; remaining candidates still attempted               |
| Duplicate incidents                        | CloudWatch retry / redelivery                   | Known until SCRUM-35; do not add ad-hoc dedupe in processor                  |

## Failure boundaries (quick reference)

1. **Transport** (bad outer envelope) → Lambda errors → AWS may retry
2. **Parse** (bad embedded message) → `failedRecords`, continue
3. **Mapping** → `persistenceFailures`, continue
4. **Save** → `persistenceFailures`, continue

## Related

- [processor-lambda.md](./processor-lambda.md)
- [cloudwatch-event-parsing.md](./cloudwatch-event-parsing.md)
- [cloudwatch-subscription.md](./cloudwatch-subscription.md)
- [deployment-testing.md](./deployment-testing.md)
