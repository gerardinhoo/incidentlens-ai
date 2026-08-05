# Processor Lambda architecture

The IncidentLens **incident processor** is an independently deployable AWS Lambda
function that will eventually turn CloudWatch log events into incidents. This
story (SCRUM-31) ships only the foundation: handler, packaging, IAM, logging,
and Terraform wiring — **without** a CloudWatch Logs subscription.

## API Lambda vs processor Lambda

| Concern       | API Lambda (`incidentlens-dev-api`) | Processor Lambda (`incidentlens-dev-processor`) |
| ------------- | ----------------------------------- | ----------------------------------------------- |
| Trigger today | API Gateway HTTP API                | Direct invoke (manual / CI smoke)               |
| Role          | Public Fastify HTTP API             | Async incident processing foundation            |
| Framework     | Fastify + `@fastify/aws-lambda`     | Plain Lambda handler (no HTTP server)           |
| Persistence   | DynamoDB via `IncidentRepository`   | Not wired yet                                   |
| IAM           | Logs + DynamoDB                     | Logs only                                       |
| Package       | `dist/lambda/api`                   | `dist/lambda/processor`                         |

```text
Client → API Gateway → API Lambda → DynamoDB

Processor Lambda (foundation)
  ← direct invoke / future CloudWatch Logs subscription (next story)
```

## Why deploy the processor before the subscription?

Deploying the function, role, log group, and packaging pipeline first lets us:

1. Prove the artifact and handler contract independently
2. Keep blast radius small (no recursive log ingestion yet)
3. Add the CloudWatch subscription filter in a focused follow-up story

## Current request flow

1. Something invokes `incidentlens-dev-processor` (CLI, CI, or console)
2. Handler reads cold-start config and creates a Pino child logger with `requestId`
3. Event is classified at a **structural** level only (`unclassified` or `awslogs`)
4. Handler logs safe fields and returns `{ accepted: true, processedRecords: 0 }`

It does **not** decode Base64, decompress gzip, parse log events, write DynamoDB,
call Bedrock, or publish SNS.

## Handler contract

Entrypoint: `apps/incident-processor/src/handler.handler`

```ts
interface ProcessorResult {
  accepted: boolean;
  processedRecords: number;
}
```

Foundation response is always:

```json
{ "accepted": true, "processedRecords": 0 }
```

## Environment variables

| Variable                   | Default                  | Notes                                       |
| -------------------------- | ------------------------ | ------------------------------------------- |
| `NODE_ENV`                 | `development`            | Set by Terraform for deployed env           |
| `SERVICE_NAME`             | `incidentlens-processor` | Logger `service` field                      |
| `LOG_LEVEL`                | `info`                   | Pino level                                  |
| `INCIDENT_REPOSITORY`      | `memory`                 | Reserved; unused by handler today           |
| `DYNAMODB_INCIDENTS_TABLE` | —                        | Required only if repository=`dynamodb`      |
| `AWS_REGION`               | runtime                  | Injected by Lambda; do not set in Terraform |

## Logging

- Pino structured JSON to stdout
- Base fields: `service`, `environment`
- Per-invocation child: `requestId`
- Safe log fields: `eventType`, `processedRecords`, `outcome`
- **Never** log the full event payload (may contain secrets / PII / stack traces)
- Lambda `logging_config.log_format = Text` avoids double-encoding JSON (same as API)

## Packaging

```bash
npm run build:lambda            # both API + processor
npm run build:processor         # processor only
npm run test:lambda-package     # validate both
```

Artifacts:

- `dist/lambda/api/` — Fastify API
- `dist/lambda/processor/` — processor (handler + `pino` only)

## IAM

Dedicated role `incidentlens-dev-processor-role`:

- Trust: `lambda.amazonaws.com`
- Allow: `logs:CreateLogStream`, `logs:PutLogEvents` on the processor log group
- No Bedrock, SNS, DynamoDB, or admin permissions

## Terraform resources (dev)

- Second `modules/lambda` instance → `incidentlens-dev-processor`
- `modules/iam_logs` → processor execution role
- CloudWatch log group `/aws/lambda/incidentlens-dev-processor`
- Root outputs for function/role/log group identifiers

See [processor-lambda runbook](../runbooks/processor-lambda.md) for invoke and
troubleshooting steps.
