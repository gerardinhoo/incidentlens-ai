# AI incident enrichment (SCRUM-40)

After a newly created automatic incident is persisted, the processor analyzes it
through `IncidentAnalyzer` and saves the validated analysis on the same incident.

## Reliability principle: create-before-analyze

Incident detection and persistence are more important than AI enrichment.

1. Map candidate → create deterministic `Incident`
2. `markIncidentAnalysisPending`
3. `repository.saveIfAbsent` (conditional create)
4. **Only if `created`:** call `analyzer.analyze`
5. Persist `completed` or `failed` analysis via `repository.save`

If Bedrock fails after create succeeds:

- the incident **remains stored**
- `analysis.status = failed` (no fabricated fields)
- no rollback / delete
- batch continues

Initial create and AI enrichment are **not** one all-or-nothing transaction.

## Analysis domain shape

```ts
type IncidentAnalysisStatus = 'pending' | 'completed' | 'failed';

interface IncidentAnalysisRecord {
  status: IncidentAnalysisStatus;
  summary?: string;
  possibleCause?: string;
  recommendedActions?: string[];
  analyzedAt?: string;
}
```

- Automatic creates start as **`pending`** (observability).
- Manual `POST /incidents` omits analysis (clients cannot supply it).
- Analysis status is separate from lifecycle status (`open` / `investigating` / `resolved`).

Helpers: `markIncidentAnalysisPending`, `completeIncidentAnalysis`, `failIncidentAnalysis`.

## Analyzer input mapping

`mapIncidentToAnalysisInput(incident, candidate)` builds allow-listed
`IncidentAnalysisInput` only (service/source, severity, errorType, optional
statusCode/route/environment/safeMessage). Never the full Incident or raw logs.

## Duplicate behavior

Duplicate CloudWatch deliveries return `saveIfAbsent → duplicate` and **do not**
invoke the analyzer. This avoids repeated Bedrock cost on redelivery.

## Batch outcome

| Situation                 | Outcome               |
| ------------------------- | --------------------- |
| Persistence failures      | `partially_failed`    |
| Incidents OK, AI failures | `partially_completed` |
| Otherwise                 | `completed`           |

AI failure alone must not fail/retry the CloudWatch batch (retries would re-run AI).

## Counters

| Counter                       | Meaning                                        |
| ----------------------------- | ---------------------------------------------- |
| `analysisAttempts`            | Newly created incidents sent to analyzer       |
| `analyzedIncidents`           | Completed analysis successfully persisted      |
| `analysisFailures`            | Analyzer failed (failed status save attempted) |
| `analysisPersistenceFailures` | Could not save completed/failed analysis state |

## Current limitations

- No automatic AI retries / SQS / DLQ
- SNS notifications are a separate step after enrichment (see
  [incident-notifications.md](./incident-notifications.md))
- No manual re-analysis endpoint

Ops: [docs/runbooks/ai-incident-enrichment.md](../runbooks/ai-incident-enrichment.md).
