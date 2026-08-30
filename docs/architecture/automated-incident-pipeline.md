# Automated incident pipeline (historical Sprint 4 snapshot)

> **Historical document.** Captures the persistence-focused pipeline before
> Bedrock enrichment and SNS notifications were added. For the current
> end-to-end architecture (DynamoDB → Bedrock → SNS), see
> [overview.md](./overview.md) and [ai-assisted-incident-pipeline.md](./ai-assisted-incident-pipeline.md).

End-to-end architecture from controlled API failure through idempotent DynamoDB
persistence at the Sprint 4 milestone.

## Request and event flow

```text
Client
  → GET /test-error (API Gateway → API Lambda)
  → structured Pino log: eventType=incident_candidate
  → CloudWatch Logs (API log group)
  → subscription filter { $.eventType = "incident_candidate" }
  → processor Lambda
  → decode Base64 + gunzip
  → parse allow-listed candidates
  → map → createIncident({ id: auto_<hash(sourceEventId)> })
  → saveIfAbsent (conditional PutItem)
  → DynamoDB incidents table
```

CONTROL_MESSAGE and manual empty invokes do not create incidents.

## Components

| Piece                   | Role                                              |
| ----------------------- | ------------------------------------------------- |
| API Lambda              | Emits controlled candidate logs via `/test-error` |
| CloudWatch subscription | Delivers matching API logs to the processor       |
| Processor Lambda        | Parse → map → idempotent create                   |
| DynamoDB                | Single table, partition key `id`                  |
| GitHub Actions          | Local tests on PR; live pipeline after main apply |

## Local vs deployed verification

| Layer                       | Where                                 | AWS? |
| --------------------------- | ------------------------------------- | ---- |
| Local processor integration | Vitest `pipeline-integration.test.ts` | No   |
| Deployed pipeline           | `scripts/verify-incident-pipeline.sh` | Yes  |

See [pipeline-integration-testing.md](../runbooks/pipeline-integration-testing.md).

## Idempotency

Same CloudWatch `logEvents[].id` (`sourceEventId`) → same `auto_<sha256…>`
incident id → conditional `attribute_not_exists(id)`.

Two separate HTTP `/test-error` calls produce **different** event IDs and create
two incidents by design. Deployed idempotency uses a generated envelope replayed
twice via `aws lambda invoke`.

## Out of scope (Sprint 4)

Bedrock, SNS, SQS, DLQ, EventBridge, alarms, dashboards, X-Ray, delete endpoint,
automatic cleanup, authentication, custom domain.
