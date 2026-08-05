# Runbook: CloudWatch event parsing

Ops guide for SCRUM-33 decode/parse behavior. Architecture:
[cloudwatch-event-parsing.md](../architecture/cloudwatch-event-parsing.md).

## Local test commands

```bash
nvm use 22
npm run test:processor
npm test
npm run build:processor
npm run test:lambda-package -- processor
```

Generate an envelope in tests via
`apps/incident-processor/tests/helpers/cloudwatch-fixtures.ts`
(`encodeCloudWatchEnvelope` + readable payload JSON).

## Deployed verification

After processor code is deployed:

```bash
API_URL=... \
PROCESSOR_LOG_GROUP=/aws/lambda/incidentlens-dev-processor \
npm run test:subscription-delivery
```

Expect a processor log summary with:

- `eventType` = `cloudwatch_logs`
- `messageType` = `DATA_MESSAGE`
- `accepted` = `true`
- `processedRecords` >= `1`

Direct generic invoke still returns `messageType: "unclassified"` and
`processedRecords: 0`.

## Troubleshooting

| Symptom                    | Likely cause                               | Fix                                                                                |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| invalid_base64             | Corrupt / truncated `awslogs.data`         | Inspect subscription destination; do not log raw data                              |
| gzip_failed                | Data is Base64 but not gzip                | Confirm CloudWatch subscription delivery (not a handmade envelope)                 |
| json_parse_failed          | Decompressed bytes are not JSON            | Same as above                                                                      |
| unsupported_message_type   | Unexpected `messageType`                   | Check CloudWatch payload version                                                   |
| malformed Pino message     | Bad embedded `logEvents[].message`         | Counted in `failedRecords`; batch still succeeds                                   |
| processedRecords remains 0 | Filter mismatch or non-candidate logs only | Confirm `/test-error` emits `eventType=incident_candidate`; redeploy API if needed |

## Related

- [cloudwatch-subscription.md](./cloudwatch-subscription.md)
- [cloudwatch-logging.md](./cloudwatch-logging.md)
