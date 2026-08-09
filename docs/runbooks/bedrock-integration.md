# Bedrock integration runbook

Manual validation and troubleshooting for the Bedrock `IncidentAnalyzer`
(structured analysis). Automatic incident pipeline does **not** invoke Bedrock
yet.

## Prerequisites

1. AWS credentials with Bedrock model access in the target Region
2. Model (or inference profile) enabled in the Amazon Bedrock console
3. `BEDROCK_MODEL_ID` set to that model / inference-profile identifier
4. Processor IAM includes `bedrock:InvokeModel` on the matching resource ARN(s)

### Verify model availability

```bash
aws bedrock list-foundation-models --region us-east-1 \
  --query 'modelSummaries[?contains(modelId, `nova`)].modelId' --output text
```

## Configuration

| Variable            | Local default        | Deployed default (Terraform)     |
| ------------------- | -------------------- | -------------------------------- |
| `INCIDENT_ANALYZER` | `fake`               | `fake`                           |
| `BEDROCK_MODEL_ID`  | unset                | configurable model / profile ID  |
| `BEDROCK_REGION`    | unset → `AWS_REGION` | unset (uses Lambda `AWS_REGION`) |

Fake does not require a model ID. Bedrock fails clearly at config time if
`BEDROCK_MODEL_ID` is missing — no silent fallback to fake.

## Manual smoke (opt-in, not CI)

```bash
nvm use 22
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0 npm run smoke:bedrock
```

Nova Lite does **not** support Converse `outputConfig`; the smoke path uses
prompt-enforced JSON + runtime validation (`structuredOutputMode=prompt`).

Expect safe operational logs (tokens / stopReason) on stderr and structured JSON
on stdout:

```json
{
  "summary": "...",
  "possibleCause": "A possible cause is ...",
  "recommendedActions": ["...", "..."]
}
```

Exit non-zero on malformed, truncated, or invalid schema responses.

## Unit tests (no network / no credentials)

```bash
npm test -- --run apps/incident-processor/src/analysis packages/analysis
```

Mocks `BedrockRuntimeClient.send`. Never performs live Converse calls.

## Troubleshooting

| Symptom                       | Likely cause                                           | Action                                                                     |
| ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `AccessDeniedException`       | Missing IAM or model access                            | Confirm `bedrock:InvokeModel` ARN scope; enable model access               |
| Model / validation exception  | Wrong Region/ID or unsupported structured-output shape | Check Region + `BEDROCK_MODEL_ID`; confirm Converse `outputConfig` support |
| Inference-profile requirement | Some models need profile IDs                           | Use profile ID + profile ARN(s) in Terraform                               |
| `EMPTY_MODEL_RESPONSE`        | No text blocks                                         | Retry manually; do not invent success                                      |
| `MODEL_OUTPUT_TRUNCATED`      | `stopReason=max_tokens`                                | Fail closed; do not persist truncated analysis                             |
| `INVALID_MODEL_RESPONSE`      | Malformed / out-of-bounds JSON                         | Inspect category only; do not log raw body                                 |
| Config error at startup       | `INCIDENT_ANALYZER=bedrock` without model ID           | Set `BEDROCK_MODEL_ID` or switch to `fake`                                 |

## Cost controls

- Allow-listed prompt only
- `maxTokens=350`, low temperature
- Native structured JSON (smaller than free-form prose)
- No conversation history, streaming, provisioned throughput, or fallback models
- No Bedrock calls in normal unit tests or PR CI

## What is not included yet

- Persisting analysis on incidents (SCRUM-40)
- Calling `analyze()` from the live CloudWatch processor path
- SNS / email
- Guardrails / RAG / Agents

Architecture: [docs/architecture/bedrock-integration.md](../architecture/bedrock-integration.md).
