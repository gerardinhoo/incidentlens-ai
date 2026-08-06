# Runbook: Automated incident pipeline

Operational overview of the Sprint 4 path from `/test-error` to DynamoDB.
Architecture: [automated-incident-pipeline.md](../architecture/automated-incident-pipeline.md).

Testing details: [pipeline-integration-testing.md](./pipeline-integration-testing.md).

## Quick status checks

```bash
./scripts/verify-aws-deployment.sh
```

## Full deployed pipeline (after apply)

```bash
API_URL=https://YOUR_API.execute-api.us-east-1.amazonaws.com \
AWS_REGION=us-east-1 \
INCIDENTS_TABLE_NAME=incidentlens-dev-incidents \
PROCESSOR_FUNCTION_NAME=incidentlens-dev-processor \
PROCESSOR_LOG_GROUP_NAME=/aws/lambda/incidentlens-dev-processor \
API_LOG_GROUP_NAME=/aws/lambda/incidentlens-dev-api \
npm run test:incident-pipeline
```

## Asynchronous delivery

Subscription delivery is eventually consistent. The pipeline script polls
processor logs for up to `PIPELINE_TIMEOUT_SEC` (default 120s) every
`PIPELINE_POLL_SEC` (default 5s).

## Test data

Each successful main deployment may create:

1. One incident from `/test-error`
2. At most one additional incident from the commit-SHA replay fixture
   (`scrum36-replay-<sha>`) — reruns of the same commit dedupe

There is **no delete endpoint**. The dev table accumulates controlled test rows.

## Related

- [automatic-incident-creation.md](./automatic-incident-creation.md)
- [idempotent-processing.md](./idempotent-processing.md)
- [deployment-testing.md](./deployment-testing.md)
