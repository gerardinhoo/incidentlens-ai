# CloudWatch event parsing (SCRUM-33)

The processor Lambda decodes CloudWatch Logs subscription envelopes into
**normalized incident-candidate records**. It still does **not** persist
incidents, call Bedrock, or publish SNS.

## Pipeline

```text
awslogs.data (Base64)
  → Buffer.from(data, "base64")
  → zlib.gunzip
  → UTF-8 string
  → JSON.parse
  → runtime payload validation
  → per logEvents[].message parse
  → ParsedIncidentCandidate[] + summary counts
```

Modules:

| File                                     | Role                                                 |
| ---------------------------------------- | ---------------------------------------------------- |
| `cloudwatch/decode-cloudwatch-event.ts`  | Envelope decode + payload validation                 |
| `cloudwatch/parse-log-record.ts`         | One embedded Pino message → candidate/ignored/failed |
| `cloudwatch/parse-cloudwatch-payload.ts` | DATA vs CONTROL batch orchestration                  |
| `handler.ts`                             | Invoke orchestration + safe summary logging          |

## Outer event shape

```json
{
  "awslogs": {
    "data": "<base64-gzip-json>"
  }
}
```

Runtime checks require a non-null object with `awslogs.data` as a string.
Empty / invalid Base64 / non-gzip / bad JSON fail the **invocation**.

## Decompressed payload

Expected fields:

- `owner` (string)
- `logGroup` (string)
- `logStream` (string)
- `subscriptionFilters` (string[])
- `messageType`: `DATA_MESSAGE` | `CONTROL_MESSAGE`
- `logEvents` (required for `DATA_MESSAGE`): `{ id, timestamp, message }[]`

## DATA_MESSAGE vs CONTROL_MESSAGE

| Type              | Behavior                                        |
| ----------------- | ----------------------------------------------- |
| `DATA_MESSAGE`    | Process each `logEvents` item independently     |
| `CONTROL_MESSAGE` | Accept safely; all counts zero; not an incident |

One bad embedded message does **not** fail the batch. A corrupt **outer**
payload **does** fail the invocation (AWS may retry).

## Candidate allow-list

A record is a candidate only when `eventType === "incident_candidate"`.

Copied when valid:

- CloudWatch: `sourceEventId`, `timestamp`, `logGroup`, `logStream`
- App: `requestId`, `service`, `environment`, `severity`, `errorType`,
  `errorName`, `statusCode`, `route`, `url`, `msg` (max 256 chars)

Dropped always: body, headers, auth, cookies, stack, description, metadata,
arbitrary nested objects.

### Severity

Parser allowlist (transport layer, not Incident entity):

`fatal|error|warn|info|debug|trace|low|medium|high|critical`

`/test-error` emits textual `severity: "error"` (Pino level language).

## Handler result

```ts
interface ProcessorResult {
  accepted: boolean;
  messageType: 'DATA_MESSAGE' | 'CONTROL_MESSAGE' | 'unclassified';
  receivedRecords: number;
  processedRecords: number; // successfully parsed candidates
  ignoredRecords: number;
  failedRecords: number;
}
```

Generic direct invoke (no `awslogs`) remains:

`{ accepted: true, messageType: "unclassified", …counts: 0 }`

## Ignored vs failed

| Outcome | Examples                                                |
| ------- | ------------------------------------------------------- |
| ignored | info logs, plain text, wrong `eventType`, empty message |
| failed  | malformed JSON string that looks like JSON              |

## Safe logging

Batch summary only: `messageType`, `logGroup`, `logStream`, counts, `outcome`.
Never log `awslogs.data`, decoded JSON, raw messages, or full candidates.

## Current limitations

No incident creation, DynamoDB writes, idempotency, AI, or notifications.
