# AI incident enrichment runbook

## Local tests (no AWS / no Bedrock)

```bash
nvm use 22
npm test -- --run apps/incident-processor/tests/persist-incident-candidates.test.ts
npm run test:pipeline-local
```

Uses `FakeIncidentAnalyzer`. Pipeline path: parse → create → fake analyze → save.

## Deployed verification

Requires:

- API URL
- DynamoDB incidents table
- Processor log group
- `INCIDENT_ANALYZER=bedrock` (or fake for non-AI assert)
- Bedrock model access when using bedrock

```bash
API_URL=https://....amazonaws.com \
DYNAMODB_TABLE_NAME=incidentlens-dev-incidents \
PROCESSOR_LOG_GROUP=/aws/lambda/incidentlens-dev-processor \
./scripts/verify-ai-incident-enrichment.sh
```

Flow:

1. Record start timestamp
2. Trigger one `GET /test-error` (expect 500)
3. Poll processor logs / DynamoDB for the new incident
4. Assert `status=open`, `analysis.status=completed`, summary/possibleCause/actions/analyzedAt
5. Print sanitized fields only

Latency can include CloudWatch subscription + Bedrock — polling timeout defaults to 180s.

## Troubleshooting

| Symptom                                    | Likely cause                                     | Action                                                     |
| ------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------- |
| Incident exists, `analysis.status=pending` | Enrichment save never finished / crashed mid-way | Check processor logs; no automatic retry yet               |
| `analysis.status=failed`                   | Bedrock/provider/validation failure              | Check safe `errorCategory` in logs; incident remains valid |
| No analysis field                          | Older incident before SCRUM-40                   | Expected; new automatic incidents start pending            |
| AccessDenied Bedrock                       | IAM / model access                               | Confirm `bedrock:InvokeModel` + console model access       |
| Duplicate redelivery re-analyzes           | Bug                                              | Must not call analyzer on `saveIfAbsent=duplicate`         |
| Analysis persistence failed                | DynamoDB PutItem error after AI                  | Incident still present; `analysisPersistenceFailures`      |

## Manual Bedrock failure procedure (non-CI)

Do not change production IAM/model IDs in CI to induce failures. Locally inject
`createFailingFakeIncidentAnalyzer()` in unit tests. For a one-off manual check
in a disposable env only, temporarily point `BEDROCK_MODEL_ID` at an invalid ID
and trigger `/test-error`, then restore — expect `analysis.status=failed` while
the incident remains.

## Cost

One Nova Lite Converse call per newly created automatic incident. Duplicates do
not call Bedrock. Unit/PR CI never call Bedrock.

Architecture: [docs/architecture/ai-incident-enrichment.md](../architecture/ai-incident-enrichment.md).
