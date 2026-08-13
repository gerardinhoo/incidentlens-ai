# SCRUM-54 — Real AI incident end-to-end verification

## Purpose

Prove the complete **deployed** IncidentLens AI incident pipeline with **one**
controlled `/test-error` event: API → CloudWatch → subscription → processor →
Bedrock enrichment → DynamoDB → SNS → API reads → CloudFront UI → status workflow.

This is a verification record, not a redesign note. No infrastructure changes
were required for this run.

## Architecture path tested

```text
GET /test-error (API Gateway + API Lambda)
        ↓
CloudWatch Logs (eventType = incident_candidate)
        ↓
Subscription filter → Processor Lambda
        ↓
Incident create (DynamoDB) + Bedrock analysis + SNS publish
        ↓
GET /incidents + GET /incidents/:id
        ↓
CloudFront SPA (/incidents + /incidents/:id)
        ↓
PATCH /incidents/:id/status  (open → investigating → resolved)
```

## Environment (non-secret)

| Item             | Value                                                    |
| ---------------- | -------------------------------------------------------- |
| API base         | `https://umkenp6pt1.execute-api.us-east-1.amazonaws.com` |
| Frontend         | `https://d2uo3ldb80w08p.cloudfront.net`                  |
| Region           | `us-east-1`                                              |
| Incidents table  | `incidentlens-dev-incidents`                             |
| API Lambda       | `incidentlens-dev-api`                                   |
| Processor Lambda | `incidentlens-dev-processor`                             |
| Analyzer         | Bedrock (`INCIDENT_ANALYZER=bedrock`)                    |
| Notifier         | SNS (`INCIDENT_NOTIFIER=sns`)                            |

## Test procedure

1. Confirm health: API `/health`, AWS wiring script, DynamoDB ACTIVE, subscription
   filter present, processor Bedrock/SNS env, CloudFront HTML for `/` and `/incidents`.
2. Capture baseline incident count (was **8**).
3. Trigger **one** `GET /test-error` (expected HTTP 500 controlled failure).
4. Wait until a **new** incident appears with `analysis.status = completed`.
5. Verify DynamoDB item fields + AI enrichment fields.
6. Confirm processor logs: persisted → analysis completed → SNS published.
7. Verify API list/detail include the incident.
8. Verify CloudFront list (Analysis = AI Analyzed) and detail (AI panel + metadata).
9. Transition status via API: open → investigating → resolved; confirm UI shows Resolved.
10. Hard-navigate `/incidents/:id` on CloudFront (SPA deep-link).
11. Run automated unit/integration suites locally.

## Expected result

- Exactly one new incident for the controlled error (no intentional duplicates).
- Full AI enrichment completed.
- SNS publish success in processor logs (email inbox check remains a human step).
- Frontend shows the incident and AI analysis.
- Status workflow persists and is visible in the UI.
- SPA deep-link refresh serves the React app.

## Actual result

**Overall: PASS**

### Controlled error

| Field                    | Value                     |
| ------------------------ | ------------------------- |
| Trigger time (UTC)       | `2026-08-13T05:28:43Z`    |
| HTTP status              | `500` (controlled)        |
| Request / API Gateway ID | `CBph-jPsoAMEbkA=`        |
| Response message         | `Controlled test failure` |

### Pipeline evidence

| Stage                    | Result                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| CloudWatch detection     | API log `eventType=incident_candidate` for request `CBph-jPsoAMEbkA=`                                             |
| Subscription → processor | Processor invoked; `sourceEventId` recorded in metadata                                                           |
| Incident creation        | `id=auto_a6374d6d226c74367a09f2ad258867af`, `createdAt=2026-08-13T05:28:54.437Z`                                  |
| Bedrock enrichment       | `analysis.status=completed`, `analyzedAt=2026-08-13T05:28:56.259Z`                                                |
| DynamoDB                 | Item present with id, source, severity, status, errorType, description, requestId, metadata, timestamps, analysis |
| SNS                      | Processor log: `notifier=sns`, `outcome=success`, `msg=incident notification published`                           |
| API list/detail          | New incident returned; detail matches enrichment                                                                  |
| CloudFront / UI          | List: **AI Analyzed** + **Resolved**; Detail: Summary, Possible Cause, Recommended Actions, Metadata              |
| Status workflow          | PATCH investigating `200`, PATCH resolved `200`; UI shows Resolved                                                |
| SPA deep-link            | Direct load of `/incidents/auto_a6374d6d226c74367a09f2ad258867af` serves app + data                               |

### Incident fields verified

- Unique ID, source/service, severity (`high`), status, error type (`Error`),
  description (`controlled test failure`), request ID, metadata
  (`environment`, `logGroup`, `logStream`, `route`, `sourceEventId`, `statusCode`),
  `createdAt`.
- AI: `completed` + summary + possible cause + recommended actions (4) + `analyzedAt`.

### Baseline → after

| Metric               | Before | After |
| -------------------- | ------ | ----- |
| Incident count (API) | 8      | 9     |

## Evidence locations (local artifacts)

Sanitized run artifacts under `artifacts/scrum54-e2e/` (not secrets):

- `01-health.txt`, `02-aws-verify.txt`, `03-config.txt`
- `04-trigger-meta.txt` — request ID / trigger timestamp
- `06-incident-detail-api.json`, `07-incident-dynamodb.json`, `08-field-checks.json`
- `09-processor-logs-sanitized.json`, `10-api-logs-sanitized.txt`
- `11-patch-*.json`, `12-incident-after-status.json`
- `13-ui-detail-text.txt`
- `14-test-*.txt`

Do not publish SNS subscription endpoints, email addresses, or credentials.

## Automated tests (post-verification)

| Suite                        | Result     |
| ---------------------------- | ---------- |
| `npm run test:web`           | 104 passed |
| `npm run test:sprint5-local` | 6 passed   |
| `npm test`                   | 265 passed |

## Defects discovered

None. No Terraform apply and no application code changes were required for this verification.

## Final verdict

**SCRUM-54: PASS**
