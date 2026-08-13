# Frontend deployment (CloudFront + S3)

Automated SPA deployment for IncidentLens AI via GitHub Actions OIDC.

Default live URL (dev):

`https://d2uo3ldb80w08p.cloudfront.net`

## Build process

From the repository root (Node 22):

```bash
npm ci
npm --prefix apps/web ci
npm run typecheck:web
npm run test:web
npm run lint:web
VITE_API_BASE_URL="$(cd infrastructure/terraform/environments/dev && terraform output -raw api_invoke_url)" \
  npm run build:web
```

Vite writes static assets to `apps/web/dist`.

`VITE_*` values are compiled into the bundle at build time. The production API
Gateway base URL is **public configuration**, not a secret. Do not point
production builds at `/api`, `localhost`, or `127.0.0.1`.

## Main deployment trigger

Workflow: `.github/workflows/deploy-dev.yml`

| Event                                      | Frontend validation | S3 sync + CloudFront invalidation     |
| ------------------------------------------ | ------------------- | ------------------------------------- |
| `pull_request` → `main`                    | Yes (`ci` job)      | **No**                                |
| `push` → `main`                            | Yes                 | **Yes** (after OIDC + Terraform init) |
| `workflow_dispatch` (normal)               | Yes                 | **Yes**                               |
| `workflow_dispatch` (`pipeline_test_only`) | Yes                 | **No** (verification-only)            |

Frontend asset deploy does **not** require `ENABLE_TERRAFORM_APPLY=true`. It
reads identifiers from remote Terraform state after `terraform init`.

Backend Terraform apply remains separately gated by `ENABLE_TERRAFORM_APPLY`.

## OIDC authentication

Same role as backend CI: `incidentlens-github-actions-deploy`, assumed via
`aws-actions/configure-aws-credentials` with `id-token: write`. No static AWS
access keys in GitHub Secrets.

OIDC trust is limited to this repository’s `main` branch. Pull requests cannot
assume the role and never mutate frontend hosting.

## Where identifiers come from

Preferred source: **Terraform outputs** from `environments/dev` remote state
(already initialized in the deploy job):

| Value                              | Terraform output             |
| ---------------------------------- | ---------------------------- |
| API base URL (`VITE_API_BASE_URL`) | `api_invoke_url`             |
| Frontend S3 bucket                 | `frontend_bucket_name`       |
| CloudFront distribution ID         | `cloudfront_distribution_id` |
| Frontend URL                       | `frontend_url`               |

The workflow does not hardcode AWS URLs or bucket names. `scripts/deploy-frontend.sh`
also refuses buckets that look like artifact or Terraform state buckets.

## S3 destination

Dedicated private SPA bucket only, for example:

`incidentlens-dev-web-<account_id>`

Never sync to:

- `incidentlens-dev-artifacts-*`
- `incidentlens-tfstate-*`

Deploy script behavior (`scripts/deploy-frontend.sh`):

1. `aws s3 sync apps/web/dist s3://<frontend-bucket>/ --delete` for hashed assets
   with long cache (`public,max-age=31536000,immutable`), excluding `index.html`
2. `aws s3 cp` `index.html` with `Cache-Control: no-cache,no-store,must-revalidate`
3. Fail the job if sync/upload fails (no invalidation on failure)

`--delete` removes remote objects absent from the new build. Safe because the
target is the dedicated frontend bucket only.

## CloudFront invalidation

After a successful upload:

```bash
aws cloudfront create-invalidation \
  --distribution-id "<cloudfront_distribution_id>" \
  --paths "/*"
```

Acceptable for this small portfolio app. Invalidation runs only after S3 upload
succeeds and only for the IncidentLens frontend distribution ID from Terraform.

## Manual verification

```bash
export FRONTEND_URL="$(cd infrastructure/terraform/environments/dev && terraform output -raw frontend_url)"
export API_BASE_URL="$(cd infrastructure/terraform/environments/dev && terraform output -raw api_invoke_url)"
./scripts/verify-frontend-deployment.sh
```

Checks:

- `GET /` → HTTP 200 HTML containing an IncidentLens marker
- `GET /incidents` → same (SPA deep-link / refresh via CloudFront error responses)
- optional API reachability when `API_BASE_URL` is set

Full AI end-to-end verification is owned by a separate story (SCRUM-54), not this
frontend deploy path.

## Rollback / redeploy

Practical options for this portfolio environment:

1. **Redeploy a known-good commit** — revert or cherry-pick on `main`, or re-run
   `workflow_dispatch` after restoring the good commit on `main`. The workflow
   rebuilds `apps/web/dist` and syncs with `--delete`.
2. **Re-run the workflow** on the current good `main` SHA if only the S3
   contents were corrupted.

There is no blue/green frontend fleet. Previous objects are replaced by sync.
Lambda zip audit artifacts are unrelated to SPA rollback; keep git history as
the source of truth for frontend source.

## IAM note

The GitHub Actions deploy role must allow least-privilege S3 object operations
on the frontend web bucket and `cloudfront:CreateInvalidation` on the frontend
distribution (plus Terraform manage permissions for the hosting module). Those
permissions live in `infrastructure/terraform/bootstrap` and are applied
**manually** (never by app CI). See that module’s README.

## Related

- [github-actions-deployment.md](./github-actions-deployment.md)
- [terraform-remote-state.md](./terraform-remote-state.md)
- Frontend hosting module: `infrastructure/terraform/modules/frontend/`
