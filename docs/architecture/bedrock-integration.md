# Bedrock integration

Provider-specific Amazon Bedrock implementation of `IncidentAnalyzer` using the
**Converse** API with a JSON Schema contract and application-level runtime
validation. For Amazon Nova Lite, native Converse `outputConfig` is unsupported,
so JSON is requested via prompt (with optional native mode for future models).

## Role of Bedrock

Bedrock is one AI provider behind the provider-independent `IncidentAnalyzer`
interface (`packages/analysis`). Callers depend on the abstraction;
`BedrockIncidentAnalyzer` lives in the processor app so AWS SDK imports never
enter the shared analysis contracts package.

## Implementations

| Provider | Class                     | Location                                |
| -------- | ------------------------- | --------------------------------------- |
| fake     | `FakeIncidentAnalyzer`    | `packages/analysis`                     |
| bedrock  | `BedrockIncidentAnalyzer` | `apps/incident-processor/src/analysis/` |

Selection via `createIncidentAnalyzer({ provider })` /
`INCIDENT_ANALYZER=fake|bedrock`. No silent fallback from bedrock → fake.

## Final analysis contract

```json
{
  "summary": "...",
  "possibleCause": "...",
  "recommendedActions": ["...", "..."]
}
```

- `summary` — concise description based only on supplied facts
- `possibleCause` — **hypothesis**, never a proven root cause
- `recommendedActions` — 1–5 investigation steps (not autonomous remediation)

Bounds (source of truth: `INCIDENT_ANALYSIS_BOUNDS`):

| Field              | Limit                       |
| ------------------ | --------------------------- |
| summary            | 1–500 chars                 |
| possibleCause      | 1–500 chars                 |
| recommendedActions | 1–5 items, each 1–200 chars |

No `rootCause`, confidence, remediation commands, raw reasoning, or provider
metadata fields.

## JSON Schema + structured outputs

Schema definition: `packages/analysis/src/incident-analysis-schema.ts`
(derived from `INCIDENT_ANALYSIS_BOUNDS`).

### Current model: Amazon Nova Lite (`amazon.nova-lite-v1:0`)

Converse returns:

> This model doesn't support the outputConfig field.

Therefore SCRUM-39 uses the **prompt + runtime validation** fallback by default:

1. System prompt includes the JSON Schema and requires a single JSON object
2. `parseIncidentAnalysisJsonText` validates every response
3. Native `outputConfig.textFormat.json_schema` is **not** sent (would fail)

Optional opt-in for models that support native Converse structured outputs:

```ts
new BedrockIncidentAnalyzer({
  client,
  modelId,
  nativeStructuredOutput: true, // sends outputConfig
});
```

Do **not** claim Bedrock natively enforces the schema for Nova Lite.

**Model output remains untrusted** in both modes.
`parseIncidentAnalysis` / `parseIncidentAnalysisJsonText` always validate at
runtime before returning `IncidentAnalysis`.

A narrow full-document Markdown fence unwrap is supported if a provider wraps
JSON in fences; malformed JSON is rejected (no repair heuristics).

## Production prompt

- **System:** SRE assistant role + safety/hypothesis/investigation rules
- **User:** allow-listed operational facts only (`buildIncidentAnalysisUserContent`)

Not sent: raw CloudWatch events, raw logs, request bodies, headers, auth,
cookies, stacks, arbitrary metadata, DynamoDB items, full `Incident` objects.

## stopReason handling

| stopReason   | Behavior                                      |
| ------------ | --------------------------------------------- |
| `end_turn`   | Normal completion; parse + validate           |
| `max_tokens` | Fail as `MODEL_OUTPUT_TRUNCATED` (no persist) |
| other        | Fail as `INVALID_MODEL_RESPONSE`              |

## Inference / cost controls

- `maxTokens=350`, `temperature=0.1`
- No streaming, retries, fallback models, conversation history, Guardrails,
  Agents, or RAG

## Logging

Success: `analyzer`, `modelId`, `outcome`, optional `requestId`, `stopReason`,
token usage.

Failure: `analyzer`, safe `category`, optional `requestId` / `stopReason`,
`outcome=failed`.

Never log analysis text, recommendedActions, prompts, or raw Bedrock bodies.

## Configuration

| Variable            | Notes                                                       |
| ------------------- | ----------------------------------------------------------- |
| `INCIDENT_ANALYZER` | `fake` (default) or `bedrock`                               |
| `BEDROCK_MODEL_ID`  | Model ID **or** inference-profile ID (required for bedrock) |
| `BEDROCK_REGION`    | Optional; defaults to `AWS_REGION`                          |

## IAM

Processor role only: `bedrock:InvokeModel` on configured model/inference-profile
ARNs. No `bedrock:*`, Agents, Knowledge Bases, marketplace, or SNS.

## Pipeline behavior

SCRUM-40 wires create-before-analyze: after `saveIfAbsent` returns `created`,
the processor calls `IncidentAnalyzer` and saves completed/failed analysis.
Duplicates skip the analyzer. See
[ai-incident-enrichment.md](./ai-incident-enrichment.md).

## Current limitations

- No AI analysis retries
- SNS notifications are wired separately after enrichment (SCRUM-41)
- Dev default `INCIDENT_ANALYZER=bedrock` (local/tests use fake)
- No live Bedrock calls in unit tests or PR CI

Ops details: [docs/runbooks/bedrock-integration.md](../runbooks/bedrock-integration.md).
