# Automatic incident creation

SCRUM-34 converts validated CloudWatch `incident_candidate` log records into
domain incidents and persists them through the shared `IncidentRepository`
abstraction. The processor does **not** call the public HTTP API.

## Processing flow

```text
CloudWatch Logs subscription event
  → decode Base64 + gunzip (transport)
  → validate DATA_MESSAGE / CONTROL_MESSAGE
  → parse allow-listed ParsedIncidentCandidate records
  → mapCandidateToIncidentInput()
  → createIncident(input, { id: auto_<hash(sourceEventId)> })
  → IncidentRepository.saveIfAbsent() # conditional PutItem in AWS
  → DynamoDB PutItem (attribute_not_exists id)
```

CONTROL_MESSAGE and unclassified / manual invoke paths skip persistence and
return zero incident counts.

## Candidate → domain mapping

Implemented in
`apps/incident-processor/src/incidents/map-candidate-to-incident-input.ts`.

| CreateIncidentInput field | Source                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `title`                   | `"<errorType> detected in <source>"` (max 200)                                                                     |
| `source`                  | candidate `service`, else `unknown-service`                                                                        |
| `severity`                | explicit parser→domain map (see below)                                                                             |
| `errorType`               | `errorType` \|\| `errorName` \|\| `APPLICATION_ERROR`                                                              |
| `description`             | optional bounded parser `msg` only (max 256)                                                                       |
| `requestId`               | candidate `requestId` when present                                                                                 |
| `metadata`                | allow-listed strings only: `sourceEventId`, `logGroup`, `logStream`, optional `environment`, `route`, `statusCode` |

Never mapped: stacks, headers, authorization, cookies, request bodies, arbitrary
nested CloudWatch fields, or raw log payloads.

### Severity mapping

| Parser value                           | Domain severity                         |
| -------------------------------------- | --------------------------------------- |
| `low` / `medium` / `high` / `critical` | same                                    |
| `error`                                | `high`                                  |
| `fatal`                                | `critical`                              |
| `warn`                                 | `medium`                                |
| `info` / `debug` / `trace`             | `low`                                   |
| missing / unknown                      | **mapping failure** (candidate skipped) |

`/test-error` emits textual `severity: "error"` → domain `high`.

## Domain reuse

The processor calls `createIncident()` from `@incidentlens` domain package
(`packages/domain`). The domain owns:

- generated incident ID
- default `open` status
- `createdAt` / `updatedAt`

The processor must not invent IDs, statuses, or timestamps.

## Repository injection and client lifecycle

- Cold-start: `getProcessorRepository(config)` builds one
  `IncidentRepository` via shared `createIncidentRepository()` (no Fastify).
- DynamoDB DocumentClient is created once with the repository, not per candidate.
- Tests inject `MemoryIncidentRepository` (or a fake) through
  `handleProcessorInvocation(..., { repository })`.

Deployed env:

| Variable                   | Value                         |
| -------------------------- | ----------------------------- |
| `INCIDENT_REPOSITORY`      | `dynamodb`                    |
| `DYNAMODB_INCIDENTS_TABLE` | existing incidents table name |
| `AWS_REGION`               | Lambda runtime                |
| `LOG_LEVEL`                | configured                    |

## Partial-failure behavior

Candidates are processed **sequentially** and independently.

| Failure class                    | Invocation                         | Counters                             |
| -------------------------------- | ---------------------------------- | ------------------------------------ |
| Invalid outer CloudWatch payload | **throw** (AWS may retry delivery) | n/a                                  |
| Malformed embedded log event     | continue                           | `failedRecords`                      |
| Non-candidate log                | continue                           | `ignoredRecords`                     |
| Mapping failure                  | continue                           | `mappingFailures`                    |
| Duplicate conditional write      | continue                           | `duplicateIncidents` (not a failure) |
| Unexpected repository failure    | continue                           | `persistenceFailures`                |

Batch still returns `accepted: true` when the outer payload was valid.
`outcome` is `completed` or `partially_failed`. Creates + duplicates only →
`completed`.

## Processor result contract

```ts
interface ProcessorResult {
  accepted: boolean;
  messageType: 'DATA_MESSAGE' | 'CONTROL_MESSAGE' | 'unclassified';
  receivedRecords: number;
  processedRecords: number; // successfully parsed candidates
  ignoredRecords: number;
  failedRecords: number;
  attemptedIncidents: number;
  persistedIncidents: number;
  duplicateIncidents: number;
  persistenceFailures: number;
}
```

`attemptedIncidents = persisted + duplicate + mappingFailures + persistenceFailures`
(see batch logs for `mappingFailures`).

## IAM

Processor role (`iam_logs` module) gains **only**:

- `dynamodb:PutItem` on the incidents table ARN

No Scan / GetItem / UpdateItem / DeleteItem / `dynamodb:*` / Bedrock / SNS.
Automatic creates use conditional `PutCommand` (`saveIfAbsent`); status updates
still use unconditional `save()`. Both are PutItem — no extra IAM actions.

## Safe logging

Success: `automatic incident persisted` with `incidentId`, `sourceEventId`,
`source`, `severity`, `outcome=persisted`, Lambda `requestId`.

Batch summary: record/incident counters + `outcome`.

Never log full candidates, incidents, descriptions, metadata blobs, raw
CloudWatch payloads, or AWS SDK error bodies.

## Idempotency (SCRUM-35)

Automatic persistence is idempotent via deterministic ids + `saveIfAbsent`.
See [idempotent-processing.md](./idempotent-processing.md).

Manual `POST /incidents` remains non-idempotent (new UUID each request).

## Out of scope (this story)

Bedrock, SNS, SQS, EventBridge, DLQ, custom retries, alarms, dashboards, X-Ray,
delete endpoint, status transitions.
