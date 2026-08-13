# Frontend AWS hosting

> **Authoritative end-to-end architecture:** [overview.md](./overview.md).  
> Hosting module story historically labeled SCRUM-54 in some branches; CI deploy followed in SCRUM-53.

IncidentLens AI serves the React/Vite SPA through CloudFront in front of a
**private** S3 bucket. The API remains a separate path through API Gateway.

## Request paths

```text
Browser
  → CloudFront (HTTPS, default *.cloudfront.net domain)
      → private S3 frontend bucket (REST origin + OAC)

Browser
  → API Gateway HTTP API
      → Fastify Lambda API
```

CloudFront → S3 hosting is provisioned in Terraform. API CORS includes the
CloudFront origin, and production builds set `VITE_API_BASE_URL` to the API
Gateway base URL (see [docs/frontend/api-client.md](../frontend/api-client.md)).
Frontend asset upload + CloudFront invalidation run from GitHub Actions
([frontend-deployment.md](../runbooks/frontend-deployment.md)).

## Why private S3 + CloudFront?

| Choice                              | Reason                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Private S3 (Block Public Access on) | Objects are not anonymously readable; hosting is not a public website bucket            |
| CloudFront                          | HTTPS edge delivery, caching, SPA-friendly error mapping, no public bucket              |
| Origin Access Control (OAC)         | CloudFront signs `s3:GetObject` with SigV4; bucket policy allows only this distribution |
| S3 REST origin                      | Not the legacy S3 website endpoint (no public website hosting mode)                     |

Anonymous `s3:GetObject` is **not** granted.

## Resources (dev)

Naming follows `${project}-${environment}-…-${account_id}`:

| Resource                    | Example                                   |
| --------------------------- | ----------------------------------------- |
| Frontend bucket             | `incidentlens-dev-web-<account-id>`       |
| Artifact bucket (unchanged) | `incidentlens-dev-artifacts-<account-id>` |
| CloudFront                  | default `*.cloudfront.net` domain         |

Terraform module: `infrastructure/terraform/modules/frontend/`  
Wired from: `infrastructure/terraform/environments/dev/`

### Outputs

- `frontend_bucket_name` / `frontend_bucket_arn`
- `cloudfront_distribution_id` / `cloudfront_distribution_arn`
- `cloudfront_domain_name`
- `frontend_url` → `https://<cloudfront-domain>`

## SPA routing

React Router uses paths such as `/incidents` and `/incidents/:incidentId`.
Those paths are not real S3 object keys. With OAC, missing objects typically
surface as **403** (sometimes **404**).

CloudFront `custom_error_response` maps **403** and **404** to `/index.html`
with browser status **200** so deep links and refresh load the SPA.

**Tradeoff:** a typo’d static asset URL can also return `index.html` instead of a
hard 404. Acceptable for this portfolio SPA; CI invalidates CloudFront after deploys.

No Lambda@Edge or CloudFront Functions are used for routing.

## Caching

- Default behavior uses the AWS managed **CachingOptimized** cache policy.
- Compression is enabled.
- Viewer protocol: redirect HTTP → HTTPS.
- Allowed methods: GET, HEAD.
- Price class default: `PriceClass_100` (cost-conscious).
- Hashed Vite assets cache well; `index.html` should be invalidated after
  deploys in SCRUM-56.

## Logging & security headers

- **CloudFront access logging:** intentionally **omitted** for this
  portfolio/dev environment (avoids an extra logging bucket and cost).
  Application and API observability remain on CloudWatch for the API/processor.
- **Response headers / CSP policy:** not added in SCRUM-54 (no existing
  repository pattern; CSP design deferred).

## Status of formerly deferred items

| Item                                                                    | Status                         |
| ----------------------------------------------------------------------- | ------------------------------ |
| API CORS allowlist for CloudFront origin                                | **Done** (dev stack wiring)    |
| Upload `dist/` to S3 + CloudFront invalidation CI                       | **Done** (Deploy Dev workflow) |
| Bootstrap GitHub deploy-role: web bucket + CloudFront manage/deploy IAM | **Done** (bootstrap IAM)       |
| Custom domain / Route 53 / ACM                                          | Deferred                       |
| WAF, Lambda@Edge, CloudFront Functions                                  | Out of portfolio scope         |

## Historical note

Early hosting work landed Terraform before the first asset deploy. The live
`frontend_url` is now populated by the CI frontend deploy path.
