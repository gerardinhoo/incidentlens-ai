# Runbook: Pipeline integration testing

SCRUM-36 adds reliable, low-cost verification of the full incident-processing
pipeline. **No new product features** — tests, scripts, CI, and docs only.

## Two layers

### A. Local integration (no AWS)

```bash
nvm use 22
npm run test:pipeline-local
# also included in: npm test / npm run test:processor
```

Uses:

- generated CloudWatch DATA_MESSAGE envelopes
- real `handleProcessorInvocation`
- injected `MemoryIncidentRepository`

Covers:

- mixed batch (candidate + info + malformed) → one persist
- exact envelope replay → one duplicate, unchanged stored incident
- partial failure batch (mapping / repo / duplicate / later success)
- CONTROL_MESSAGE and corrupt outer payload

### B. Deployed AWS integration

```bash
npm run test:incident-pipeline
```

Runs **only** after successful main apply (or manually / `workflow_dispatch`
with `pipeline_test_only=true`). **Never on pull requests.**

Phases:

1. Optional config verify (`verify-aws-deployment.sh`) — skipped in CI when
   already run as a prior step
2. One `GET /test-error` → poll processor logs → DynamoDB `GetItem` by
   `incidentId` from structured persist logs
3. Deterministic envelope ×2 via `aws lambda invoke` → create then duplicate

Evidence: `artifacts/pipeline-integration/` (sanitized only).

## How the created incident is identified

Prefer **processor log field** `incidentId` from:

```text
msg = "automatic incident persisted", outcome = "persisted"
```

Then `aws dynamodb get-item` with that id. No table scan.

Replay uses deterministic `auto_<sha256(sourceEventId)[:32]>` with
`sourceEventId = scrum36-replay-<GITHUB_SHA>`.

## Polling / timeouts

| Setting                 | Default | Purpose                            |
| ----------------------- | ------- | ---------------------------------- |
| `PIPELINE_TIMEOUT_SEC`  | 120     | Max wait for subscription delivery |
| `PIPELINE_POLL_SEC`     | 5       | Poll interval                      |
| curl `--max-time`       | 30      | HTTP trigger                       |
| Lambda CLI read timeout | 60      | Direct invoke                      |

## PR vs main

| Event                                      | Local pipeline tests                         | Live AWS pipeline  |
| ------------------------------------------ | -------------------------------------------- | ------------------ |
| `pull_request`                             | yes (`test:pipeline-local`, shell `bash -n`) | **no**             |
| `push` main + apply                        | yes (ci job)                                 | **yes** (one run)  |
| `workflow_dispatch` + `pipeline_test_only` | yes                                          | **yes** (no apply) |

Concurrency group `incidentlens-dev-deployment` prevents overlapping runs.

## Required tools

- Node 22, npm
- AWS CLI v2 + credentials (deployed tests only)
- curl, python3, bash
- `jq` not required

## Troubleshooting

| Symptom                                            | Likely cause                          | Fix                                                           |
| -------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| No subscription delivery                           | Filter / permission / wrong log group | `verify-aws-deployment.sh`                                    |
| Processor does not parse                           | Payload / code hash stale             | Redeploy processor                                            |
| No incident created                                | Persist/IAM/mapping                   | Check processor logs for `persistenceFailures` / AccessDenied |
| Second HTTP `/test-error` creates another incident | Different CloudWatch event IDs        | Expected; use replay invoke for idempotency                   |
| Processor AccessDenied                             | Missing PutItem                       | Fix processor IAM                                             |
| DynamoDB polling timeout                           | Slow delivery or wrong table          | Increase timeout; confirm table name                          |
| Unexpected batch counts                            | CloudWatch batching                   | Assert `>= 1`, not exact receivedRecords                      |

## Cost / cleanliness

- One controlled API error per successful main deployment
- One replay fixture per commit SHA (dedupes on rerun)
- Dev table retains test incidents (no automatic cleanup)

## Scope exclusions

No Bedrock, SNS, SQS, DLQ, alarms, dashboards, X-Ray, delete endpoint, load
tests, browser tests, or auth.
