# Incident analysis abstraction

Provider-independent AI boundary for Bedrock-assisted incident analysis.

- SCRUM-37: contracts + `FakeIncidentAnalyzer`
- SCRUM-38: Bedrock Converse provider wiring
- SCRUM-39: structured JSON Schema outputs + runtime validation

See [bedrock-integration.md](./bedrock-integration.md) for provider details.

## Purpose

`IncidentAnalyzer` accepts a narrow, allow-listed operational context and
returns structured analysis that engineers can review. It describes
capability, not a specific cloud provider.

## Location

```text
packages/analysis/src/
  incident-analysis.ts           # IncidentAnalysisInput + IncidentAnalysis + bounds
  incident-analysis-schema.ts    # JSON Schema (derived from bounds)
  parse-incident-analysis.ts     # runtime validation for untrusted model output
  incident-analyzer.ts
  incident-analysis-error.ts
  fake-incident-analyzer.ts
  index.ts
```

No Fastify, Lambda, DynamoDB, Bedrock, AWS SDK, or CloudWatch imports.

## IncidentAnalyzer

```ts
interface IncidentAnalyzer {
  analyze(input: IncidentAnalysisInput): Promise<IncidentAnalysis>;
}
```

`BedrockIncidentAnalyzer` implements this same interface in
`apps/incident-processor/src/analysis/` (AWS SDK stays out of this package).

## Safe input contract (`IncidentAnalysisInput`)

Allow-listed fields only: `service`, `severity`, `errorType`, optional
`statusCode` / `route` / `environment` / `safeMessage`.

**Not passed to AI:** raw CloudWatch events, raw logs, request bodies, headers,
authorization, cookies, credentials, stacks, arbitrary metadata, DynamoDB items,
or the entire `Incident` object.

## Structured output (`IncidentAnalysis`)

```ts
interface IncidentAnalysis {
  readonly summary: string;
  readonly possibleCause: string;
  readonly recommendedActions: readonly string[];
}
```

- `possibleCause` is a **hypothesis**, not a proven `rootCause`
- Bounds live in `INCIDENT_ANALYSIS_BOUNDS` and drive the JSON Schema
- `parseIncidentAnalysis` validates all model/fake outputs at runtime

## FakeIncidentAnalyzer

Deterministic offline implementation that returns the **same** contract
(validated via `parseIncidentAnalysis`). No network / no AWS credentials.

## Failure behavior

Implementations reject the Promise on failure (`IncidentAnalysisError` with safe
categories). Do not invent successful analysis when the provider fails.

## Dependency injection

- `createIncidentAnalyzer({ provider: 'fake' | 'bedrock', ... })`
- `getProcessorAnalyzer(config)` (cold-start cache; not used by persist path yet)

The live CloudWatch → DynamoDB path still does **not** call `analyze()`.

## Current limitations

- Analysis is **not persisted** yet (SCRUM-40)
- No SNS / notifications
- No Guardrails / RAG / embeddings
- Deployed default analyzer remains `fake` until intentionally enabled
