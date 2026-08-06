# Runbook: Idempotent processing

Ops guide for SCRUM-35. Architecture:
[idempotent-processing.md](../architecture/idempotent-processing.md).

## Local tests (no AWS)

```bash
nvm use 22
npm run test:processor
npm test
```

Key coverage:

- same `sourceEventId` → same `auto_<hash>` id
- `MemoryIncidentRepository.saveIfAbsent` create/duplicate
- handler invoked twice with the same envelope → one stored incident
- DynamoDB mock: conditional `PutCommand`, conditional-check → duplicate

## Deployed verification (manual)

After apply, run once:

```bash
PROCESSOR_FUNCTION_NAME=incidentlens-dev-processor \
DYNAMODB_TABLE_NAME=incidentlens-dev-incidents \
AWS_REGION=us-east-1 \
npm run test:idempotent-processing
```

The script:

1. Builds one CloudWatch DATA_MESSAGE envelope with a unique `sourceEventId`
2. Invokes the processor **twice** with that exact payload
3. Expects first: `persistedIncidents=1`, second: `duplicateIncidents=1`
4. `GetItem` the deterministic `incidentId`
5. Writes sanitized evidence under `artifacts/deployment-tests/`

It creates **one** table row per run and does not delete it.

### Important

Two separate `GET /test-error` calls produce **different** CloudWatch event IDs
and **should** create two incidents. That is not a failure of idempotency.

## Troubleshooting

| Symptom                                        | Likely cause                            | Fix                                                                                             |
| ---------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Duplicate incidents still appear for one event | Old processor code / unconditional save | Redeploy SCRUM-35 processor package                                                             |
| Conditional check treated as error             | Error classification bug                | Confirm `ConditionalCheckFailedException` → duplicate; check logs for `repository_save_failure` |
| Deterministic IDs differ unexpectedly          | Different `sourceEventId` inputs        | Compare metadata `sourceEventId`; confirm envelope log event `id`                               |
| Permission failure                             | Missing PutItem                         | Processor role needs PutItem on incidents table only                                            |
| Hash/input mismatch                            | Trim/encoding difference                | IDs hash trimmed UTF-8 `sourceEventId`                                                          |

## Cost / cleanliness

Default deploy CI still does **not** run this write test on every job (avoids
table pollution; no delete endpoint). Use the manual script when you need proof.

## Related

- [automatic-incident-creation.md](./automatic-incident-creation.md)
- [deployment-testing.md](./deployment-testing.md)
