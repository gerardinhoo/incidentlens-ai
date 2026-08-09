# Incident analysis abstraction

SCRUM-37 introduced a **provider-independent** AI boundary for Bedrock-assisted
incident analysis (contracts + `FakeIncidentAnalyzer`). SCRUM-38 adds the
Bedrock Converse implementation in the processor app — see
[bedrock-integration.md](./bedrock-integration.md).

## Purpose

`IncidentAnalyzer` accepts a narrow, allow-listed operational context and
returns structured analysis that engineers can review. It describes
capability, not a specific cloud provider.

## Location

```text
packages/analysis/src/
  incident-analysis.ts      # IncidentAnalysisInput + IncidentAnalysis
  incident-analyzer.ts      # IncidentAnalyzer interface
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
Callers depend on the abstraction and receive the analyzer via composition/DI —
never by constructing a concrete provider inside business logic.

## Safe input contract (`IncidentAnalysisInput`)

Allow-listed fields only:

| Field          | Notes                                                 |
| -------------- | ----------------------------------------------------- |
| `service`      | Service name / source                                 |
| `severity`     | Domain severity                                       |
| `errorType`    | Error classification                                  |
| `statusCode?`  | HTTP status when known                                |
| `route?`       | Request route when known                              |
| `environment?` | Deploy environment when known                         |
| `safeMessage?` | Bounded safe message already retained by the pipeline |

**Not passed to AI:**

- raw CloudWatch events / log payloads
- request bodies, headers, authorization, cookies, credentials
- stack traces
- arbitrary metadata bags
- DynamoDB items
- the entire `Incident` object

Principle: **AI receives an allow-list, not the whole incident/log object.**

## Structured output (`IncidentAnalysis`)

```ts
interface IncidentAnalysis {
  readonly summary: string;
  readonly possibleCause: string;
  readonly recommendedActions: readonly string[];
}
```

- `possibleCause` is a **hypothesis**, not a proven `rootCause`
- No confidence score, Markdown dump, or remediation execution in v1

Application-level text bounds are documented in `INCIDENT_ANALYSIS_BOUNDS`.
**Runtime validation of external model JSON** is deferred to the Bedrock
response-validation story; the fake respects the documented bounds.

## FakeIncidentAnalyzer

Deterministic, offline implementation for tests and local composition:

- no network / no AWS credentials
- predictable summary / possibleCause / actions
- optional injected result or failure (`IncidentAnalysisError`)

It does **not** pretend to perform AI reasoning.

## Failure behavior

Implementations reject the Promise on failure (e.g. `IncidentAnalysisError`).
Do not invent successful analysis when the provider fails. Error messages must
not include prompts, provider bodies, credentials, or raw incident context.

## Dependency injection

Factory helpers:

- `createIncidentAnalyzer({ provider: 'fake' | 'bedrock', ... })`
- `getProcessorAnalyzer(config)` (cold-start cache; not used by persist path yet)

The live CloudWatch → DynamoDB path still does **not** call `analyze()`.
Pipeline behavior remains parse → create → idempotent persist.

## Current limitations

- Temporary unstructured Bedrock response mapping (SCRUM-39 next)
- No AI persistence or DynamoDB schema changes
- No SNS / notifications
- No Guardrails / RAG / embeddings
- Deployed default analyzer remains `fake` until live access is verified
