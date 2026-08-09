# Incident notifications (SNS)

## Role

After a newly created automatic incident is persisted and AI enrichment has been
attempted, IncidentLens may publish a **safe** notification to Amazon SNS.

SNS is an outbound delivery concern. It is not the system of record.

## Principles

1. **Create → enrich → notify** — notification runs only after
   `saveIfAbsent` returns `created` and enrichment has completed or failed.
2. **Incident durability first** — SNS failure never deletes, rolls back, or
   marks the incident failed.
3. **No duplicate fan-out** — duplicate CloudWatch delivery skips analyzer and
   notifier.
4. **Provider-independent core** — processor depends on `IncidentNotifier`, not
   SNS SDK commands directly.

## Abstraction

```ts
interface IncidentNotifier {
  notify(input: IncidentNotificationInput): Promise<void>;
}
```

Implementations:

- `SnsIncidentNotifier` — `PublishCommand` to a configured topic ARN
- `FakeIncidentNotifier` — tests / local
- `NoopIncidentNotifier` — `INCIDENT_NOTIFIER=none`

Factory: `createIncidentNotifier` / `getProcessorNotifier`.

Modes: `fake` | `sns` | `none`. Deployed dev uses `sns`. There is **no silent
fallback** from SNS to fake when publish fails.

## Allow-listed input

`IncidentNotificationInput` includes only:

- incidentId, title, source, severity, status, createdAt
- optional validated analysis (`summary`, `possibleCause`, `recommendedActions`)

Never: raw logs, metadata wholesale, prompts, Bedrock responses, credentials.

## Eligibility

`shouldNotifyIncident(incident)`:

| Severity | Notify |
| -------- | ------ |
| low      | no     |
| medium   | no     |
| high     | yes    |
| critical | yes    |

Policy is independent of SNS. Threshold may become configurable later.

`/test-error` maps parser severity `error` → domain `high`, so it is eligible.

## Timing and Bedrock failure

Preferred ordering:

```
create → persist → analyze → persist analysis → notify
```

- **Completed analysis** → enriched email body
- **Failed analysis** → factual fallback (“AI analysis was unavailable”) for
  high/critical incidents — never fabricate summary/cause/actions

Serious incidents are not suppressed solely because Bedrock failed.

## Duplicate suppression

```
saveIfAbsent = created → enrichment → notification
saveIfAbsent = duplicate → skip analyzer → skip notifier
```

Duplicates are counted under `duplicateIncidents` only (not
`notificationsSkipped`).

## Counters

| Counter              | Meaning                                             |
| -------------------- | --------------------------------------------------- |
| notificationAttempts | Eligible newly created incidents passed to notifier |
| notificationsSent    | Publish succeeded                                   |
| notificationFailures | Publish failed                                      |
| notificationsSkipped | Newly created but not eligible, or notifier=`none`  |

Batch outcome with notification failures: `partially_completed` (incident and
analysis remain valid). No custom SNS retry framework.

## Message safety

Plain-text subject/body. Subject bounded (SNS 100-byte limit). Logs never
include the full email body — only `incidentId`, severity, notifier, outcome.

## Infrastructure

- Topic: `incidentlens-{env}-incidents` (SSE with `alias/aws/sns`)
- Optional email subscription via `notification_email` (not hardcoded)
- Processor IAM: `sns:Publish` on the exact topic ARN only
- API Lambda: no SNS permission
- No SQS, DLQ, FIFO, SMS, Slack

## Cost

SNS email notifications are low volume for high/critical only. Duplicate
suppression avoids repeated charges on CloudWatch redelivery.
