# Frontend API client (SCRUM-45)

## API boundary

`apps/web/src/api` is the only place React pages/hooks should use to talk to
the IncidentLens backend. Components must not call `fetch` directly.

```ts
import {
  getIncidents,
  getIncidentById,
  createIncident,
  updateIncidentStatus,
} from '../api';
```

The client uses native `fetch`, typed DTOs under `apps/web/src/types`, and
`config.apiBaseUrl` from `apps/web/src/config.ts`.

## DTOs

Defined in `apps/web/src/types/incident.ts`:

- `IncidentSeverity`, `IncidentStatus`, `IncidentAnalysisStatus`
- `IncidentAnalysisDto`, `IncidentDto`
- `CreateIncidentInput`, `UpdateIncidentStatusInput`

These mirror the HTTP JSON contract. They do not import AWS, Terraform, or
backend packages.

## Endpoint mapping

| Client function        | HTTP                          |
| ---------------------- | ----------------------------- |
| `getIncidents`         | `GET /incidents`              |
| `getIncidentById`      | `GET /incidents/:id`          |
| `createIncident`       | `POST /incidents`             |
| `updateIncidentStatus` | `PATCH /incidents/:id/status` |

Incident ids in paths are always `encodeURIComponent`-encoded.

## `VITE_API_BASE_URL`

| Environment       | Typical value                                        |
| ----------------- | ---------------------------------------------------- |
| Local (Vite)      | `/api` (default; see proxy below)                    |
| Deployed frontend | API Gateway base URL from Terraform `api_invoke_url` |

Example file: `apps/web/.env.example`.

Trailing slashes are normalized by `normalizeApiBaseUrl`. Do not commit a real
production/API Gateway URL into source.

## Local proxy behavior

Vite proxies same-origin `/api/*` to Fastify so the browser avoids CORS:

```
browser http://localhost:5173/api/incidents
  → Vite rewrite → http://localhost:3000/incidents
```

Configured in `apps/web/vite.config.ts`. Backend CORS is unchanged.

## Local API development

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run dev:web
```

- Web: `http://localhost:5173`
- API via proxy: `http://localhost:5173/api/...`
- Direct API: `http://localhost:3000/...`

## Deployed API behavior

Build the SPA with `VITE_API_BASE_URL` set to Terraform output `api_invoke_url`
(API Gateway base URL, no `/api` prefix and no trailing slash). Example:

```bash
cd infrastructure/terraform/environments/dev
export VITE_API_BASE_URL="$(terraform output -raw api_invoke_url)"
cd -
npm run build:web
```

The browser then calls API Gateway directly from the CloudFront origin. Do not
commit a real API Gateway URL into source (`.env*` is gitignored except
`.env.example`).

### CORS (API Gateway HTTP API)

Configured in Terraform (`module.api_gateway` ← `local.cors_allow_origins`):

| Item        | Value                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Origins     | Local Vite (`http://localhost:5173`, etc.) + CloudFront `frontend_url` |
| Methods     | `GET`, `POST`, `PATCH`, `OPTIONS`                                      |
| Headers     | `content-type`, `authorization`, `x-request-id`                        |
| Credentials | disabled                                                               |

`POST` remains allowed because the API/client supports `POST /incidents`
(`createIncident`). The UI currently uses `GET` + `PATCH` for list/details/status.
API Gateway handles OPTIONS preflight for cross-origin PATCH.

Wildcard `*` origins are rejected by Terraform validation.

## Error normalization

Non-2xx responses throw `ApiError` (`status`, optional `code`, safe `message`):

- **400** → `Request validation failed` (no large Ajv dump)
- **404 / 409** → backend safe messages when present
- **5xx / non-JSON** → generic retry message
- Network failure → `Unable to reach the API. Please try again.`

Request/response bodies are not logged by the client.

## Why components should not call fetch directly

- Keeps base URL / headers / encoding in one place
- Guarantees consistent `ApiError` handling for SCRUM-46+ UI
- Prevents accidental credential or body logging in the browser
