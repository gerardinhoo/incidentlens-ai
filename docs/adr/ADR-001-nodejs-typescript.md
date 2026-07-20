# ADR-001: Use Node.js and TypeScript

- Status: Accepted
- Date: 2026-07
- Decision owner: Gerard Eklu

## Context

IncidentLens AI requires REST APIs, AWS Lambda functions, event-driven processing, structured logging, automated tests, and AI-service integration.

The backend technology should align with the project's architecture and strengthen skills relevant to software engineering, cloud, DevOps, and SRE roles.

## Decision

Use Node.js with TypeScript for backend services and event-processing functions.

## Rationale

Node.js provides strong AWS Lambda support, an asynchronous programming model, a mature ecosystem, and alignment with the owner's production experience.

TypeScript adds static checking, safer refactoring, clearer interfaces, and stronger editor support.

## Consequences

### Positive

- Strong alignment with target roles
- Shared language across backend and frontend
- Mature AWS and testing libraries
- Better compile-time safety than plain JavaScript

### Negative

- Requires compilation
- Requires TypeScript configuration
- Type definitions can add complexity around some dependencies
