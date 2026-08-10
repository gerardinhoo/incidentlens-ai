# AI-assisted incident pipeline (Phase 5 / Sprint 5)

## Sequence

```
Application Error
  → CloudWatch Logs (incident_candidate)
  → Subscription filter
  → Processor Lambda
  → Map + deterministic ID
  → DynamoDB saveIfAbsent
  → IncidentAnalyzer (Bedrock)
  → Persist analysis (completed | failed)
  → IncidentNotifier (SNS) if high/critical
  → Email subscriber (after ConfirmSubscription)
```

## Reliability ordering

1. Persist the incident first (system of record)
2. Enrich with AI (best effort)
3. Notify (outbound, best effort)

AI or SNS failure must not delete or roll back the incident.

## Idempotency

Duplicate CloudWatch delivery with the same source event ID:

- `saveIfAbsent` → `duplicate`
- analyzer not called again
- notifier not called again

Live duplicate tests use **direct Lambda invoke** with a fixed envelope — not a
second `/test-error` (HTTP creates a new log event ID).

## Failure isolation

| Failure              | Incident | Analysis         | Notification                       |
| -------------------- | -------- | ---------------- | ---------------------------------- |
| Bedrock / validation | kept     | `failed`         | factual fallback if high/critical  |
| SNS publish          | kept     | completed/failed | `notificationFailures`++; batch OK |

## Severity policy

Notify only `high` and `critical`. Threshold may become configurable later.

## Test layers

| Layer             | What                                                    |
| ----------------- | ------------------------------------------------------- |
| Unit              | domain, repository, analyzer, notifier, policies        |
| Local integration | handler + memory + fakes (Sprint 5 suite)               |
| AWS               | wiring, `/test-error`, enrichment, SNS counters, replay |
| Manual            | email received                                          |

## Limitations

- No SQS / DLQ / EventBridge retry worker
- No PagerDuty / Slack / SMS
- No autonomous remediation
- Dev environment only
