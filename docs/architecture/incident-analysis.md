# Incident analysis abstraction

SCRUM-37 introduces a **provider-independent** AI boundary for future
Bedrock-assisted incident analysis. This story adds contracts and a
deterministic fake only — **no Amazon Bedrock calls**.

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

Future Bedrock implementation will implement this same interface. Callers
depend on the abstraction and receive the analyzer via composition/DI — never
by constructing a concrete provider inside business logic.

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

## Dependency injection (future)

Processor composition will later accept an analyzer alongside the repository,
for example:

```ts
createProcessor({ repository, analyzer, logger });
```

SCRUM-37 does **not** invoke analysis in the live CloudWatch → DynamoDB path.
Pipeline behavior remains parse → create → idempotent persist.

## Current limitations

- No Bedrock / Converse / InvokeModel
- No prompts or model IDs
- No AI persistence or DynamoDB schema changes
- No SNS / notifications
- No Guardrails / RAG / embeddings
