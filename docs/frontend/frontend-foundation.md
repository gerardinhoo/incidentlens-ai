# Frontend foundation (SCRUM-43)

## Purpose

`apps/web` is the operator-facing IncidentLens AI SPA shell. This story delivers
routing, layout, TypeScript tooling, environment configuration, and placeholder
pages only. It does **not** load real incident data or deploy to AWS.

## Technology

| Concern   | Choice                                 |
| --------- | -------------------------------------- |
| Framework | React 19 + TypeScript (strict)         |
| Bundler   | Vite                                   |
| Routing   | React Router (client-side SPA)         |
| Styling   | Global CSS design tokens + CSS modules |
| Tests     | Vitest + React Testing Library + jsdom |

Next.js / SSR is not used — this is an authenticated-style engineering dashboard
client; SSR is not required.

## Directory structure

```
apps/web/
  .env.example
  index.html
  package.json          # isolated frontend dependencies
  vite.config.ts
  vitest.config.ts
  tsconfig*.json
  src/
    main.tsx
    App.tsx
    config.ts
    index.css
    api/                # placeholder — SCRUM-44
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
VITE_API_BASE_URL=http://localhost:3000
```

- Example file: `apps/web/.env.example`
- Reader: `src/config.ts` (`getApiBaseUrl` / `normalizeApiBaseUrl`)
- Default when unset: `http://localhost:3000`
- Trailing slashes are stripped

Do not commit production API Gateway URLs or any secrets into source.

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

Frontend scripts (root):

- `npm run dev:web`
- `npm run build:web`
- `npm run test:web`
- `npm run typecheck:web`
- `npm run lint:web`

This story does not make HTTP calls to the API.

## Frontend / backend boundary

- The browser will eventually call the public API (API Gateway / local Fastify)
  using only `VITE_API_BASE_URL`.
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
- API contracts stay explicit (DTO mapping in SCRUM-44)

Domain types in `packages/domain` are browser-safe TypeScript, but this
foundation keeps a local `IncidentDto` boundary so list/details work can map
API responses without bundling domain lifecycle helpers prematurely.

## Next stories

| Story    | Focus                                   |
| -------- | --------------------------------------- |
| SCRUM-44 | API client / DTO mapping                |
| SCRUM-45 | Incidents list UI                       |
| SCRUM-46 | Incident details UI                     |
| SCRUM-47 | Severity / status presentation          |
| SCRUM-48 | Runtime error / empty states            |
| SCRUM-49 | AWS frontend deployment (S3/CloudFront) |
