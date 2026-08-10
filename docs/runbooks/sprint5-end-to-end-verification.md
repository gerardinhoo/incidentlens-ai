# Runbook: Sprint 5 end-to-end verification

## Local (no AWS)

```bash
npm run test:sprint5-local
# or full suite
npm test
```

Covers: happy path, duplicate replay, Bedrock failure isolation, SNS failure
isolation, mixed-batch counters. Uses `FakeIncidentAnalyzer` +
`FakeIncidentNotifier`.

## Deployed (dev)

### Prerequisite: bootstrap IAM (SCRUM-41 fix)

If `main` plan fails with `SNS:GetTopicAttributes` denied for
`incidentlens-github-actions-deploy`, re-apply bootstrap **manually**:

```bash
cd infrastructure/terraform/bootstrap
terraform plan
terraform apply   # bootstrap only — not the app stack from this story
```

App CI does not apply bootstrap.

### Full Sprint 5 script

```bash
API_URL=https://....amazonaws.com \
AWS_REGION=us-east-1 \
INCIDENTS_TABLE_NAME=incidentlens-dev-incidents \
PROCESSOR_FUNCTION_NAME=incidentlens-dev-processor \
PROCESSOR_LOG_GROUP_NAME=/aws/lambda/incidentlens-dev-processor \
SNS_INCIDENT_TOPIC_ARN=arn:aws:sns:... \
  npm run test:ai-pipeline
```

Evidence: `artifacts/deployment-tests/sprint5-ai-pipeline/` (sanitized).

### Why `/test-error` is called once

The consolidated script triggers **one** HTTP `/test-error` for
persist + Bedrock + SNS counters. Duplicate testing uses the **same** generated
CloudWatch envelope invoked twice against the processor Lambda.

### Why duplicate replay uses direct Lambda invoke

Two HTTP `/test-error` calls create two different CloudWatch log event IDs, so
they are not duplicates. Fixed `sourceEventId` + Lambda invoke proves
idempotency.

### Notification email

Automated checks verify `notificationsSent >= 1` in processor logs.
**Human** confirms the email arrived after SNS subscription confirmation.

Note: the direct-replay first invoke may send **one additional** SNS email.

## CI behavior

| Event             | Live Bedrock / SNS / `/test-error` |
| ----------------- | ---------------------------------- |
| Pull request      | No                                 |
| Main after apply  | Yes (Sprint 5 script)              |
| workflow_dispatch | Optional pipeline / Sprint 5       |

Concurrency group `incidentlens-dev-deployment` prevents overlapping deploys.

Disable Sprint 5 live verify with repository variable
`ENABLE_SPRINT5_AI_PIPELINE_VERIFY=false`.

## Troubleshooting

| Symptom                             | Action                                           |
| ----------------------------------- | ------------------------------------------------ |
| SNS:GetTopicAttributes AccessDenied | Re-apply bootstrap IAM                           |
| no CloudWatch delivery              | Check subscription filter + processor permission |
| incident not persisted              | Processor logs / DynamoDB PutItem IAM            |
| analysis stuck pending              | Bedrock invoke / model access                    |
| analysis failed                     | Model output validation; incident should remain  |
| Bedrock AccessDenied                | Processor `bedrock:InvokeModel` + model access   |
| SNS publish failed                  | Processor `sns:Publish` on exact topic           |
| PendingConfirmation                 | Confirm email subscription                       |
| duplicate re-analyzed / re-notified | Bug — check deterministic ID + saveIfAbsent      |
| timeout waiting for processor       | Increase `PIPELINE_TIMEOUT_SEC` (default 210)    |

## Test matrix

| Layer             | Coverage                                               |
| ----------------- | ------------------------------------------------------ |
| Unit              | domain, repository, analyzer, notifier, policies       |
| Local integration | complete flow, duplicate, Bedrock fail, SNS fail       |
| AWS               | wiring, `/test-error`, enrichment, SNS publish, replay |
| Manual            | email actually received                                |

## Limitations

No SQS/DLQ, no automated retries, no PagerDuty/Slack, no autonomous remediation,
no production environment.
