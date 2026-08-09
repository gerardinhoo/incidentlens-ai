# Bedrock integration (SCRUM-38)

Provider-specific Amazon Bedrock implementation of `IncidentAnalyzer` using the
**Converse** API. This story proves SDK/IAM/config wiring only.

## Role of Bedrock

Bedrock is one future AI provider behind the provider-independent
`IncidentAnalyzer` interface (`packages/analysis`). Callers depend on the
abstraction; `BedrockIncidentAnalyzer` lives in the processor app so AWS SDK
imports never enter the shared analysis contracts package.

## Implementations

| Provider | Class                     | Location                                |
| -------- | ------------------------- | --------------------------------------- |
| fake     | `FakeIncidentAnalyzer`    | `packages/analysis`                     |
| bedrock  | `BedrockIncidentAnalyzer` | `apps/incident-processor/src/analysis/` |

Selection via `createIncidentAnalyzer({ provider })` /
`INCIDENT_ANALYZER=fake|bedrock`. No silent fallback from bedrock → fake.

## Converse API

- SDK: `@aws-sdk/client-bedrock-runtime` (`BedrockRuntimeClient`, `ConverseCommand`)
- Client created once at composition/cold-start (injectable for tests)
- Conservative `inferenceConfig`: `maxTokens=400`, `temperature=0.1`
- No streaming, retries, fallback models, Guardrails, Agents, or RAG

## Safe prompt construction

`buildIncidentAnalysisPrompt` builds a deterministic user message from
**allow-listed** `IncidentAnalysisInput` fields only (service, severity,
errorType, optional statusCode/route/environment/safeMessage).

Not sent: raw CloudWatch events, raw logs, request bodies, headers, auth,
cookies, stacks, arbitrary metadata, DynamoDB items, full `Incident` objects.

## Temporary response mapping

SCRUM-39 owns final prompt design and structured JSON validation. Until then:

- `summary` ← bounded extracted Converse text
- `possibleCause` ← fixed placeholder noting SCRUM-39 structured parsing
- `recommendedActions` ← single temporary placeholder action (contract min ≥ 1)

Do not invent root causes from unstructured prose.

## Configuration

| Variable            | Notes                                                       |
| ------------------- | ----------------------------------------------------------- |
| `INCIDENT_ANALYZER` | `fake` (default) or `bedrock`                               |
| `BEDROCK_MODEL_ID`  | Model ID **or** inference-profile ID (required for bedrock) |
| `BEDROCK_REGION`    | Optional; defaults to `AWS_REGION`                          |

Model IDs are configuration, not secrets. Verify model availability in the
target Region (and enable access in the Bedrock console) before live use.

## IAM

Processor role only: `bedrock:InvokeModel` on configured model / inference-profile
ARNs. No `bedrock:*`, Agents, Knowledge Bases, marketplace, or SNS.

Cross-Region inference profiles may require additional resource ARNs later.

## Logging

Success: `analyzer`, `service`, optional `requestId`, `modelId`, `outcome`,
optional token usage (`inputTokens` / `outputTokens` / `totalTokens`).

Failure: `analyzer`, safe `category`, optional `requestId`, `outcome=failed`.

Never log prompts, full model responses, SDK request bodies, credentials, or tokens.

## Pipeline behavior

SCRUM-38 does **not** call `analyze()` from the CloudWatch → parse → create →
idempotent DynamoDB path. Automatic pipeline behavior is unchanged.

## Current limitations

- No analysis persistence / DynamoDB schema changes
- No SNS / notifications
- Temporary unstructured mapping (SCRUM-39 next)
- Deployed default `INCIDENT_ANALYZER=fake` until live access is verified
- No live Bedrock calls in unit tests or PR CI

Ops details: [docs/runbooks/bedrock-integration.md](../runbooks/bedrock-integration.md).
