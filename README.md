# IncidentLens AI

IncidentLens AI is a serverless, AI-assisted incident intelligence platform designed to help software engineers and Site Reliability Engineers detect, understand, and respond to application failures faster.

## Problem

Engineers often spend valuable time searching through logs before they can understand a production failure. This increases investigation time, operational effort, and Mean Time to Resolution.

## Proposed Solution

IncidentLens AI will:

1. Detect high-severity application failures.
2. Extract and validate relevant log context.
3. Generate a structured AI-assisted incident analysis.
4. Store the incident for investigation.
5. Notify engineers.
6. Display incidents in a web dashboard.

The system assists engineers with investigation. It does not replace human judgment or guarantee root-cause accuracy.

## Planned Technology Stack

- Node.js
- TypeScript
- Fastify
- React
- AWS Lambda
- Amazon API Gateway
- Amazon CloudWatch
- Amazon DynamoDB
- Amazon SNS
- Amazon Bedrock
- Terraform
- GitHub Actions
- Vitest

## Project Phases

1. Foundation and development environment
2. Incident processing engine
3. AWS cloud integration
4. React incident dashboard
5. DevOps, observability, and SRE

## Prerequisites

- Node.js 22
- npm

If you use `nvm`:

```bash
nvm use
```

## Testing

See [docs/testing.md](docs/testing.md) for the demo API suite, inject-based testing approach, and coverage guidance.

```bash
npm test
npm run test:watch
npm run test:coverage
```

## Current Status

**Phase 1 — Foundation**

Current work includes repository setup, Node.js and TypeScript configuration, developer tooling, structured logging, controlled failure simulation, automated testing, and documentation.

## Repository Structure

```text
apps/             Deployable applications and Lambda functions
packages/         Shared TypeScript packages
infrastructure/   Terraform infrastructure
docs/             Architecture, ADRs, SRE documents, and runbooks
scripts/          Development and operational scripts
tests/            Cross-application and integration tests
.github/          GitHub workflows and repository templates
```
