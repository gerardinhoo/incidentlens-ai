# Frontend integration testing (SCRUM-50)

This document covers automated and manual QA for the Sprint 6 IncidentLens
frontend against the existing Fastify API.

## Automated integration strategy

Suite: `apps/web/src/App.integration.test.tsx`

Layers under test:

```
MemoryRouter
  → App routes / pages
  → typed API client (`getIncidents` / `getIncidentById`)
  → httpRequest
  → mocked `fetch` (HTTP boundary only)
```

Fixtures in `apps/web/src/test/fixtures/incidents.ts` match the real backend
`Incident` JSON contract. Page-level unit tests that mock `getIncidents` /
`getIncidentById` remain; this suite does **not** replace them.

Run:

```bash
npm run test:web
```

## Manual local QA

### Start services

```bash
# Terminal 1 — API (Node 22)
npm run dev

# Terminal 2 — frontend
npm --prefix apps/web install   # once
npm run dev:web
```

- API: `http://127.0.0.1:3000`
- Web: `http://localhost:5173`
- Proxied API: `http://localhost:5173/api/...` → Fastify

Local default persistence is **in-memory**. Incidents created while the API is
running disappear when the API process restarts.

### Checklist

| Step | Action                                                      | Expected                                       |
| ---- | ----------------------------------------------------------- | ---------------------------------------------- |
| A    | Open `/incidents`                                           | List loads (or empty state if none)            |
| B    | Click an incident title                                     | Details page for that id                       |
| C    | Click **Back to incidents**                                 | Returns to list                                |
| D    | Stop the API (`Ctrl+C` in Terminal 1) and reload/retry list | **Unable to load incidents** + **Retry**       |
| E    | Start API again (`npm run dev`), click **Retry**            | List loads without a full browser refresh      |
| F    | Open `/incidents/nonexistent-id`                            | **Incident not found** + **Back to incidents** |

Optional: create a local incident via API for a populated list:

```bash
curl -sS -X POST http://127.0.0.1:3000/incidents \
  -H 'content-type: application/json' \
  -d '{
    "title":"Manual QA incident",
    "source":"qa-client",
    "severity":"high",
    "errorType":"TimeoutError",
    "description":"Created for SCRUM-50 manual QA"
  }'
```

Then refresh `/incidents` and open the new row.

## AI-enriched incident verification

The local in-memory API does **not** invent AI analysis on manual creates.

**Option A (preferred for this story):** use the automated integration fixture
`authIncidentWithAnalysis` in `App.integration.test.tsx` (completed analysis
JSON matching the backend contract).

**Option B:** point a local frontend build at the deployed **dev** API Gateway
URL via `VITE_API_BASE_URL`. CloudFront hosting and CORS for the CloudFront
origin are already configured in the deployed stack.

## Responsive QA

Resize the browser (or DevTools device mode) to approximately:

| Width                    | Checks                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Desktop (~1280px)        | Table columns align; badges readable                                                              |
| Tablet / narrow (~768px) | No horizontal overflow of chrome; list usable                                                     |
| Mobile (~375px)          | Stacked list rows; details sections readable; badges don’t overlap; Retry / Back remain clickable |

Do not redesign layout unless a real defect appears.

## Accessibility QA

| Check                            | Expected                              |
| -------------------------------- | ------------------------------------- |
| Tab through incident title links | Focus visible; Enter opens details    |
| Tab to **Retry** on error        | Focus visible; Enter/Space retries    |
| Loading                          | `role="status"` message               |
| Errors                           | `role="alert"` with clear text        |
| Headings                         | Logical `h1` → section `h2` hierarchy |
| Severity / status badges         | Text labels present (not color-only)  |

## Isolation checks

- Pages call `getIncidents` / `getIncidentById` only — no direct `fetch` in page components.
- No runtime demo/mock incident data in the app bundle (fixtures are test-only).
- Frontend deps stay in `apps/web/package.json` (Lambda packaging unchanged).
