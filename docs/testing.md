# Testing

IncidentLens AI uses Vitest for automated tests. The demo API suite exercises Fastify through `app.inject()`, so tests never bind a real network port.

## Commands

```bash
# run the suite once
npm test

# watch mode during development
npm run test:watch

# run with V8 coverage
npm run test:coverage

# typecheck + lint + tests
npm run check
```

Coverage output is written to `coverage/` (gitignored). Open `coverage/index.html` for the HTML report.

**Normal automated tests require no AWS credentials and no DynamoDB Local.**

## Test pyramid

| Layer                      | What it proves                                     | Location examples                                                           |
| -------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| Domain unit tests          | Incident creation, defaults, lifecycle transitions | `packages/domain/src/*.test.ts`                                             |
| Repository unit tests      | Memory + DynamoDB adapters, ordering, isolation    | `packages/repository/src/*.test.ts`                                         |
| Schema / config unit tests | JSON Schema validation, repository selection       | `apps/demo-api/src/schemas/*.test.ts`, `apps/demo-api/src/config/*.test.ts` |
| Fastify integration tests  | HTTP routes via `inject` (create/get/list/status)  | `apps/demo-api/src/plugins/*.test.ts`, `apps/demo-api/src/app.test.ts`      |
| Workflow integration       | Full Phase 2 happy path on one shared memory repo  | `apps/demo-api/src/plugins/incident-workflow.test.ts`                       |
| DynamoDB mocked tests      | `DocumentClient.send()` faked; Put/Get/Scan inputs | `packages/repository/src/dynamodb-incident-repository.test.ts`              |
| DynamoDB Local (manual)    | Optional real Local container checks               | `docs/runbooks/dynamodb-local.md`                                           |

### Domain unit tests

Pure TypeScript. No Fastify, no AWS. Cover factory defaults (UUID, `open`, ISO timestamps, metadata) and lifecycle allow/reject rules.

### Repository unit tests

- **Memory:** save, overwrite by id, findById, findAll, newest-first ordering, mutation isolation
- **DynamoDB (mocked):** command construction, table/key/item shape, found/missing, ordering after Scan, wrapped SDK errors
- **Factory:** `memory` vs `dynamodb` selection; document client created at repository construction (not per HTTP request)

### Fastify integration tests

Use `buildApp({ logger: false, incidentRepository })` + `app.inject()`. Close apps in `afterAll` / `finally`. No real listen port.

Covered routes:

| Case                                            | Expectation                                 |
| ----------------------------------------------- | ------------------------------------------- |
| `POST /incidents`                               | 201 + validation 400s                       |
| `GET /incidents/:id`                            | 200 / safe 404                              |
| `GET /incidents`                                | 200 array (possibly empty), newest first    |
| `PATCH /incidents/:id/status`                   | 200 / 400 / 404 / 409                       |
| Phase 2 workflow                                | create → get → list → investigate → resolve |
| `GET /health`, `GET /test-error`, unknown route | foundation smoke                            |

### DynamoDB mocked vs Local

- **Mocked unit tests** fake `send()` so CI never needs credentials or Docker.
- **DynamoDB Local** is optional manual verification only (see the runbook). It is not part of `npm test`.

## Approach

- Prefer `inject` over `listen` for HTTP-level route tests.
- Keep logger disabled (`logger: false`) unless a test asserts log output.
- When asserting logs, pass a custom Pino stream into `buildApp({ logger: ... })`.
- Prefer one repository instance per describe/workflow; avoid order-dependent shared mutation across unrelated cases.
- Do not mock Fastify routing/plugins for route tests; exercise the real app factory.
