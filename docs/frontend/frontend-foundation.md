# Frontend foundation (SCRUM-43)

## Purpose

`apps/web` is the operator-facing IncidentLens AI SPA shell: routing, layout,
TypeScript tooling, environment configuration, and placeholder pages.

HTTP integration for incidents lives in the [API client](./api-client.md)
(SCRUM-45). List/details UI remains a later story (SCRUM-46+).

## Technology

| Concern   | Choice                                 |
| --------- | -------------------------------------- |
| Framework | React 19 + TypeScript (strict)         |
| Bundler   | Vite                                   |
| Routing   | React Router (client-side SPA)         |
| Styling   | Global CSS design tokens + CSS modules |
| Tests     | Vitest + React Testing Library + jsdom |
| HTTP      | Native fetch via `src/api`             |

Next.js / SSR is not used — this is an authenticated-style engineering dashboard
client; SSR is not required.

## Directory structure

```
apps/web/
  .env.example
  index.html
  package.json          # isolated frontend dependencies
  vite.config.ts        # includes /api → :3000 proxy
  vitest.config.ts
  tsconfig*.json
  src/
    main.tsx
    App.tsx
    config.ts
    index.css
    api/                # typed HTTP client (SCRUM-45)
    components/         # AppLayout, ErrorBoundary
    pages/              # Incidents, Incident details, 404
    types/              # frontend DTO boundary
    hooks/
    utils/
    test/
```

## Routing

| Path                     | Behavior                                |
| ------------------------ | --------------------------------------- |
| `/`                      | Redirects to `/incidents`               |
| `/incidents`             | Placeholder incidents list              |
| `/incidents/:incidentId` | Placeholder incident details (shows id) |
| `*`                      | Simple not-found page                   |

## Environment configuration

Public (non-secret) Vite variable:

```bash
VITE_API_BASE_URL=/api
```

- Example file: `apps/web/.env.example`
- Reader: `src/config.ts` (`getApiBaseUrl` / `normalizeApiBaseUrl` / `config.apiBaseUrl`)
- Default when unset: `/api` (Vite proxy to local Fastify)
- Deployed: set to the API Gateway base URL (do not hardcode in git)
- Trailing slashes are stripped

See [api-client.md](./api-client.md) for proxy and error-handling details.

## Local development

From the repository root (Node 22):

```bash
# Terminal 1 — API
npm install
npm run dev

# Terminal 2 — frontend
npm --prefix apps/web install
npm run dev:web
```

- API: `http://127.0.0.1:3000`
- Web: `http://localhost:5173` (Vite)
- Proxied API: `http://localhost:5173/api/...` → Fastify `/...`

Frontend scripts (root):

- `npm run dev:web`
- `npm run build:web`
- `npm run test:web`
- `npm run typecheck:web`
- `npm run lint:web`

## Frontend / backend boundary

- The browser calls the public API using only `VITE_API_BASE_URL` / `config.apiBaseUrl`.
- Frontend dependencies live in `apps/web/package.json` and are **not** listed
  in the root package used for Lambda packaging.
- Lambda packaging (`scripts/package-lambda.mjs`) only includes
  `apps/demo-api` or `apps/incident-processor` plus `packages/`.
- Validation rejects `react`, `react-dom`, `react-router-dom`, and `apps/web`
  inside Lambda artifacts.

## Why the frontend does not import AWS infrastructure code

Terraform, AWS SDK clients, Lambda handlers, and DynamoDB repositories are
server/runtime concerns. The SPA must remain a thin HTTP client so that:

- browser bundles stay small and free of credentials
- backend deployment packages stay free of React
- API contracts stay explicit via DTOs in `src/types`

## Next stories

| Story    | Focus                                   |
| -------- | --------------------------------------- |
| SCRUM-46 | Incidents list UI (uses API client)     |
| SCRUM-47 | Severity / status presentation          |
| SCRUM-48 | Runtime error / empty states            |
| SCRUM-49 | AWS frontend deployment (S3/CloudFront) |
