# CloudWatch Logs → processor subscription

SCRUM-32 connects **deliberate incident-candidate** application logs from the
API Lambda to the independently deployed processor Lambda.

This story proves **delivery only**. The processor recognizes a CloudWatch Logs
envelope and logs a safe receipt. It does **not** decode, parse, persist,
analyze, or notify.

## Request flow

```text
Client
  → GET /test-error (or future deliberate candidate emitters)
      → API Lambda (incidentlens-dev-api)
          → structured Pino JSON log with eventType="incident_candidate"
              → CloudWatch Logs: /aws/lambda/incidentlens-dev-api
                  → subscription filter { $.eventType = "incident_candidate" }
                      → Lambda invoke permission (logs.<region>.amazonaws.com)
                          → Processor Lambda (incidentlens-dev-processor)
                              → classify envelope as cloudwatch_logs
                              → log safe receipt
                              → return { accepted: true, processedRecords: 0 }
```

## Incident-candidate log contract

Emitted only by the controlled `GET /test-error` path in this story.

Required field for the subscription filter:

| Field       | Value                  |
| ----------- | ---------------------- |
| `eventType` | `"incident_candidate"` |

Additional safe fields included when available:

| Field                     | Example                 |
| ------------------------- | ----------------------- |
| `severity`                | `"error"`               |
| `requestId`               | Fastify request id      |
| `route` / `url`           | `/test-error`           |
| `statusCode`              | `500`                   |
| `errorType` / `errorName` | `Error`                 |
| `service`                 | `incidentlens-demo-api` |
| `environment`             | `NODE_ENV`              |

Not logged: request body, auth headers, cookies, secrets, arbitrary metadata,
or full stack traces.

Ordinary 400/404 responses are **not** marked as incident candidates.

## Filter pattern

```text
{ $.eventType = "incident_candidate" }
```

CloudWatch Logs JSON filter syntax. Narrow on purpose to limit cost and noise.
Do not use an empty filter or free-text `ERROR` matching.

## Lambda permission

Resource-based permission on the **processor** function:

- Action: `lambda:InvokeFunction`
- Principal: `logs.<aws-region>.amazonaws.com`
- Source ARN: `<api-log-group-arn>:*`

CloudWatch Logs does **not** assume the processor execution role. The execution
role only needs permission to write the processor’s own log group.

## Recursion prevention

| Role           | Resource                                                      |
| -------------- | ------------------------------------------------------------- |
| Source         | `/aws/lambda/incidentlens-dev-api`                            |
| Destination    | `incidentlens-dev-processor`                                  |
| Processor logs | `/aws/lambda/incidentlens-dev-processor` (**not subscribed**) |

If the processor log group were subscribed to the same processor, every receipt
log could re-invoke the function forever. Keeping the subscription on the API
log group only breaks that loop.

No account-level subscription policy is used.

## Processor behavior (SCRUM-32)

- Detects `awslogs.data` string envelope → `eventType: "cloudwatch_logs"`
- Otherwise → `unclassified`
- Never Base64-decodes or gunzips `awslogs.data`
- Never logs `awslogs.data` or the raw event
- Always returns `{ accepted: true, processedRecords: 0 }`

## Asynchronous delivery

Subscription delivery is eventually consistent. After `GET /test-error`, wait
and poll processor logs (bounded retries). Instant delivery is not guaranteed.

## Terraform

Module: `infrastructure/terraform/modules/log_subscription`

Dev wiring: `module.api_log_subscription` in `environments/dev`.

Outputs:

- `api_error_subscription_filter_name`
- `subscribed_log_group_name`
- `processor_subscription_destination_arn`

## Current limitations

- No Base64 / gzip decode
- No log-event parsing
- No incident creation / DynamoDB writes
- No Bedrock / SNS / SQS / EventBridge / DLQ
- No metric filters, alarms, or dashboards

Next story (SCRUM-33): decode and parse the CloudWatch payload.
