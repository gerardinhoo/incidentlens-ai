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

## Demo API suite

Location: `apps/demo-api/src/app.test.ts`

Current coverage includes:

| Case              | Expectation                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| `GET /health`     | HTTP 200, JSON health payload, request ID header                          |
| `GET /test-error` | HTTP 500, safe JSON body (no stack), structured error log with request ID |
| Unknown route     | HTTP 404 JSON response from Fastify                                       |

Each describe block builds an app with `buildApp()` and closes it in `afterAll`.

## Approach

- Prefer `inject` over `listen` for HTTP-level route tests.
- Keep logger disabled (`logger: false`) unless a test asserts log output.
- When asserting logs, pass a custom Pino stream into `buildApp({ logger: ... })`.
- Do not mock Fastify routing/plugins for these tests; they are lightweight in-process integrations of the real app factory.
