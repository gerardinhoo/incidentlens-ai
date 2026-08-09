# Runbook: SNS incident notifications

## Configure notification email safely

1. Copy `infrastructure/terraform/environments/dev/terraform.tfvars.example`
   to a **local** `terraform.tfvars` (gitignored).
2. Set:

   ```hcl
   incident_notifier  = "sns"
   notification_email = "your-team@example.com"
   ```

3. Do **not** commit a personal email into source or a public tfvars file.
4. Apply (outside this story’s implementation constraints).
5. Open the SNS confirmation email and click **Confirm subscription**.

Until confirmed, subscription status is `PendingConfirmation` and email
delivery does not begin. That is expected and is **not** treated as a deploy
failure.

## Verify subscription status

```bash
aws sns list-subscriptions-by-topic \
  --topic-arn "$(cd infrastructure/terraform/environments/dev && terraform output -raw sns_incident_topic_arn)"
```

Look for `SubscriptionArn` = `PendingConfirmation` vs a real ARN.

## Manual topic smoke (no incident)

```bash
SNS_INCIDENT_TOPIC_ARN=arn:aws:sns:... AWS_REGION=us-east-1 \
  npm run smoke:sns
```

Prints `MessageId` only. Not run on PRs.

## Full incident notification check (after deploy + email confirm)

```bash
API_URL=https://....amazonaws.com \
PROCESSOR_FUNCTION_NAME=incidentlens-dev-processor \
  npm run test:incident-notification
```

This:

1. Triggers **one** `GET /test-error`
2. Polls processor logs for `notificationAttempts >= 1` and `notificationsSent >= 1`
3. Does **not** read the inbox — human confirms email delivery

Disable in CI with repository variable `ENABLE_INCIDENT_NOTIFICATION_VERIFY=false`.

## Troubleshooting

| Symptom                     | Likely cause / action                                      |
| --------------------------- | ---------------------------------------------------------- |
| PendingConfirmation         | Confirm the SNS email subscription                         |
| No email received           | Unconfirmed sub, spam folder, or severity not eligible     |
| AccessDenied on Publish     | Processor role missing `sns:Publish` on exact topic ARN    |
| Wrong topic ARN             | Check `SNS_INCIDENT_TOPIC_ARN` on processor Lambda         |
| notificationsSent remains 0 | Check logs: skipped severity, notifier=`none`, or failures |
| Severity not eligible       | Only high/critical notify (low/medium skip)                |
| Duplicate event skipped     | Expected — redelivery must not re-notify                   |

## Manual non-production SNS failure check

Do **not** break IAM/model config in default CI. Locally, inject
`createFailingFakeIncidentNotifier()` and assert the incident + analysis remain.

## Limitations

- No application-level notification retries beyond SNS managed behavior
- No DLQ / SQS / Slack / SMS
- No delivery tracking or acknowledgement workflow

## Cost

High/critical only; one publish per newly created incident. Duplicates skip SNS.
