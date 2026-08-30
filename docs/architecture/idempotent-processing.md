# Idempotent event processing

> Still accurate for persistence. Ticket labels in older prose are historical.

Makes automatic incident persistence idempotent for the same CloudWatch log
event. Manual HTTP `POST /incidents` remains non-idempotent (new UUID each
time).

## Why duplicates happen

CloudWatch Logs subscription delivery can retry or redeliver the same encoded
batch. Without idempotency, each delivery could create multiple incidents for
one log event.

## Idempotency source

`ParsedIncidentCandidate.sourceEventId` is the CloudWatch `logEvents[].id`.

- Stable for a given delivery of that log event
- Not the API `requestId`
- Not a timestamp alone
- Not an in-memory cache

## Deterministic incident ID

```text
auto_ + sha256(sourceEventId).hex.slice(0, 32)
```

| Property   | Choice                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| Prefix     | `auto_` distinguishes automatic incidents from UUID API incidents                                                    |
| Hash       | SHA-256 via Node `crypto`                                                                                            |
| Truncation | **32 hex chars (128 bits)** — short enough for partition keys, negligible collision risk at CloudWatch event volumes |
| Alphabet   | `[0-9a-f]` only — DynamoDB partition-key safe                                                                        |

Empty `sourceEventId` is rejected.

`sourceEventId` is still stored in incident `metadata` for troubleshooting; the
hashed id is the uniqueness mechanism.

## Domain creation

```ts
createIncident(input); // random UUID — public API
createIncident(input, { id }); // trusted internal callers only
```

`id` is **not** on `CreateIncidentInput` and is **not** accepted by the HTTP
schema (`additionalProperties: false`).

## Repository contract

| Method                   | Behavior                                   |
| ------------------------ | ------------------------------------------ |
| `save(incident)`         | Unconditional put/overwrite (status PATCH) |
| `saveIfAbsent(incident)` | Create-only → `"created"` \| `"duplicate"` |

### DynamoDB atomicity

Single conditional write:

```text
PutItem
  ConditionExpression = attribute_not_exists(#id)
  ExpressionAttributeNames = { "#id": "id" }
```

- Success → `created`
- `ConditionalCheckFailedException` → `duplicate` (not a processor failure)
- Any other error → propagates / counts as persistence failure

**No GetItem before PutItem.** Read-before-write is racy under concurrent
redelivery and would require extra IAM. DynamoDB’s conditional write is the
production atomicity guarantee. Memory repository provides process-local
atomicity for tests (`Promise.all` → one created, one duplicate).

## Processor counts

```text
attemptedIncidents =
  persistedIncidents
  + duplicateIncidents
  + mappingFailures
  + persistenceFailures
```

Duplicates do **not** increment `persistenceFailures` or `failedRecords`.
A batch of only creates + duplicates is `outcome: completed`.

## Failure boundaries

| Class                       | Behavior                        |
| --------------------------- | ------------------------------- |
| Corrupt outer envelope      | Fail invocation                 |
| Malformed embedded message  | `failedRecords`, continue       |
| Mapping failure             | `mappingFailures`, continue     |
| Duplicate conditional write | `duplicateIncidents`, continue  |
| Unexpected DynamoDB error   | `persistenceFailures`, continue |

## IAM

Processor still needs only `dynamodb:PutItem` on the incidents table ARN.
Conditional expressions do not add actions. No GetItem / Scan / Update /
transactions / Bedrock / SNS.

## Out of scope

TTL / expiration, separate lock table, GSI, Powertools, DLQ, retries, Bedrock,
SNS, alarms, delete endpoint.
