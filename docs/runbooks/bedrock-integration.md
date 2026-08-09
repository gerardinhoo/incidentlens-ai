# Bedrock integration runbook

Manual validation and troubleshooting for the Bedrock `IncidentAnalyzer`
(SCRUM-38). Automatic incident pipeline does **not** invoke Bedrock yet.

## Prerequisites

1. AWS credentials with Bedrock model access in the target Region
2. Model (or inference profile) enabled in the Amazon Bedrock console
3. `BEDROCK_MODEL_ID` set to that model / inference-profile identifier
4. Processor IAM includes `bedrock:InvokeModel` on the matching resource ARN(s)

### Verify model availability (before apply / live smoke)

```bash
aws bedrock list-foundation-models --region us-east-1 \
  --query 'modelSummaries[?contains(modelId, `nova`)].modelId' --output text
```

Confirm the chosen ID (or inference-profile ID) is available and access is
granted. Do not assume a default model works in every account/Region.

If Converse requires an inference profile, set Terraform
`bedrock_invoke_resource_arns` to the profile ARN(s) and set
`bedrock_model_id` to the profile identifier used by the SDK.

## Configuration

| Variable            | Local default        | Deployed default (Terraform)           |
| ------------------- | -------------------- | -------------------------------------- |
| `INCIDENT_ANALYZER` | `fake`               | `fake`                                 |
| `BEDROCK_MODEL_ID`  | unset                | `amazon.nova-lite-v1:0` (configurable) |
| `BEDROCK_REGION`    | unset → `AWS_REGION` | unset (uses Lambda `AWS_REGION`)       |

Fake does not require a model ID. Bedrock fails clearly at config time if
`BEDROCK_MODEL_ID` is missing — no silent fallback to fake.

## Manual smoke (opt-in, not CI)

From repo root with credentials:

```bash
nvm use 22
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0 npm run smoke:bedrock
```

Prints only bounded `IncidentAnalysis` fields. Does not modify the automatic
pipeline. Do not commit real incident data into the smoke script.

## Unit tests (no network / no credentials)

```bash
npm test -- --run apps/incident-processor/src/analysis
```

Mocks `BedrockRuntimeClient.send`. Never performs live Converse calls.

## Cost controls

- Small allow-listed prompt only
- `maxTokens=400`, low temperature
- No conversation history, streaming, provisioned throughput, or fallback models
- No Bedrock calls in normal unit tests or PR CI
- Deployed analyzer remains `fake` until you intentionally switch

## Troubleshooting

| Symptom                                | Likely cause                                 | Action                                                                   |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| `AccessDeniedException`                | Missing IAM or model access not enabled      | Confirm `bedrock:InvokeModel` ARN scope; enable model in Bedrock console |
| Model not found / validation exception | Wrong Region or ID                           | Check `AWS_REGION` / `BEDROCK_REGION` and `BEDROCK_MODEL_ID`             |
| Inference-profile requirement          | Some models need profile IDs                 | Use profile ID in `BEDROCK_MODEL_ID` and profile ARN(s) in Terraform     |
| `EMPTY_MODEL_RESPONSE`                 | No text blocks in Converse output            | Retry manually; check model health; do not invent success                |
| Config error at startup                | `INCIDENT_ANALYZER=bedrock` without model ID | Set `BEDROCK_MODEL_ID` or switch back to `fake`                          |

## What is not included yet

- Final production prompt + structured JSON validation (SCRUM-39)
- Persisting analysis on incidents
- SNS / email
- Pipeline invocation of `analyze()` after incident create

Architecture: [docs/architecture/bedrock-integration.md](../architecture/bedrock-integration.md).
