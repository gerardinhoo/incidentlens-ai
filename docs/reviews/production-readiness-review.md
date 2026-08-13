# SCRUM-55 — Production Security, Observability & Cost Review

**Branch:** `feature/scrum55-production-readiness`  
**Date:** 2026-08-13  
**Scope:** Deployed IncidentLens AI portfolio/demo stack (dev environment) after SCRUM-54 E2E PASS  
**Constraint:** Audit/review only. No infrastructure or application changes were made for this story.

> This review describes **production-style engineering practices** on a portfolio/demo system. It does **not** claim enterprise production readiness.

---

## Executive Summary

| Area                                                                             | Verdict                                                                 |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Security controls (OIDC, private S3 + CloudFront OAC, scoped IAM, explicit CORS) | **PASS** (with known demo exposure)                                     |
| Observability (structured logs, IDs, retention)                                  | **PASS** for manual ops; **IMPROVEMENT** for proactive alerting         |
| Cost posture at demo traffic                                                     | **PASS** with **RISK** around Bedrock + always-on frontend invalidation |
| Failure isolation (Bedrock/SNS/DynamoDB/malformed events)                        | **PASS** with one transport-retry **RISK**                              |
| Terraform drift                                                                  | **PASS** — `No changes`                                                 |
| CI/CD (OIDC, gated apply, frontend deploy, smoke)                                | **PASS**                                                                |
| Automated tests                                                                  | **PASS**                                                                |

**Overall SCRUM-55 assessment:** **READY for portfolio/demo demonstration** with documented residual risks. No blocking changes are required to close this review story. Recommended hardenings are optional and ranked below.

---

## Security Review

### Confirmed checklist

| Check                                       | Result                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| No static AWS credentials in GitHub Actions | **PASS** — OIDC via `aws-actions/configure-aws-credentials@v4` + `vars.AWS_ROLE_TO_ASSUME`                                  |
| Secrets not committed                       | **PASS** — no `AKIA`/`ASIA`/PEM matches; `.env` / `*.tfvars` / `*.tfstate` gitignored; only `apps/web/.env.example` tracked |
| Frontend S3 not publicly exposed            | **PASS** — Block Public Access + OAC-only `s3:GetObject` for the CloudFront distribution                                    |
| CloudFront is the frontend entry point      | **PASS** — browser → CloudFront → private S3; API via API Gateway separately                                                |
| IAM reasonably scoped                       | **PASS** — named buckets/functions/table/topic; PassRole limited to Lambda                                                  |
| CORS does not use wildcard origins          | **PASS** — Terraform validation rejects `*`; CloudFront origin appended in `environments/dev`                               |
| Sensitive values not exposed to frontend    | **PASS** — only public `VITE_API_BASE_URL` (API Gateway base URL)                                                           |
| Bootstrap OIDC uses immutable subject IDs   | **PASS** (this deployment) — `github_owner_id` / `github_repository_id` are set locally                                     |

### Findings

| ID  | Class           | Finding                                                                                                                                                                                                                 |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **PASS**        | Workflow permissions limited to `contents: read` + `id-token: write`. PRs cannot assume the deploy role (main-only OIDC trust).                                                                                         |
| S2  | **PASS**        | Deploy role scopes frontend web bucket + CloudFront invalidation separately from artifact/state buckets.                                                                                                                |
| S3  | **PASS**        | API Lambda: logs + table-scoped DynamoDB. Processor: logs + PutItem + `bedrock:InvokeModel` on configured ARNs + `sns:Publish` on exact topic.                                                                          |
| S4  | **RISK**        | HTTP API is **unauthenticated**. Public `GET /test-error`, list/create/update incident routes can be abused for cost (Bedrock/SNS) and data mutation. Acceptable for this demo; **not** acceptable for real production. |
| S5  | **IMPROVEMENT** | Dev CORS defaults still include localhost Vite/Fastify origins alongside CloudFront. Fine for portfolio; strip for a stricter prod profile.                                                                             |
| S6  | **IMPROVEMENT** | GitHub Actions pinned to major tags (`@v4`), not full commit SHAs (already noted in workflow comments).                                                                                                                 |
| S7  | **IMPROVEMENT** | API DynamoDB `Scan` for listing is convenient at demo scale; prefer Query + GSI if volume grows.                                                                                                                        |
| S8  | **IMPROVEMENT** | No WAF / CloudFront access logs / CSP hardening (intentionally deferred for cost/complexity).                                                                                                                           |

**IAM change required for SCRUM-55?** No. No genuine IAM defect requiring immediate change was found. Do not modify IAM unless a real security problem is approved later.

---

## Observability Review

### Can an engineer answer…?

| Question                        | Answerability                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Is the API healthy?             | **Yes** — `GET /health` + API Gateway access logs                                                              |
| Are errors occurring?           | **Yes (manual)** — CloudWatch Insights / access-log 4xx–5xx; **no alarms**                                     |
| Are Lambda executions failing?  | **Partial** — Logs + CI smoke; no Errors/Throttles alarms                                                      |
| Is incident processing failing? | **Yes (manual)** — processor structured outcomes / counters                                                    |
| Is AI enrichment failing?       | **Yes** — `analysis.status=failed` + processor `analysisFailures` / `errorCategory`                            |
| Are notifications failing?      | **Yes** — `notificationFailures` / SNS outcome logs; incident retained                                         |
| Trace by request/incident IDs?  | **Mostly** — Fastify `requestId` + `incidentId`; APIGW edge ID and Lambda `awsRequestId` need separate queries |
| Are logs structured and useful? | **Yes** — JSON/Pino; 30-day retention on API, processor, and access log groups                                 |

### Findings

| ID  | Class           | Finding                                                                                                                 |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| O1  | **PASS**        | Structured logging with `requestId` / `incidentId` correlation in API and processor.                                    |
| O2  | **PASS**        | Managed CloudWatch log groups with retention (default 30 days). Compact API Gateway access log format (no bodies).      |
| O3  | **PASS**        | Runbooks document Insights queries (`docs/runbooks/cloudwatch-logging.md` and related AI/SNS runbooks).                 |
| O4  | **RISK**        | **No CloudWatch metric filters, alarms, or dashboards.** Failures are discoverable only by active log inspection or CI. |
| O5  | **IMPROVEMENT** | Browser/API Gateway request IDs are not end-to-end unified; frontend does not send `x-request-id`.                      |
| O6  | **IMPROVEMENT** | CloudFront access logging omitted (cost tradeoff); CDN issues are harder to diagnose from CloudWatch alone.             |

**Recommendation style:** Prefer 2–3 minimal alarms (API/processor Errors, optional 5xx) over a large monitoring stack.

---

## Cost Review

### Services in use

| Service                  | Role                         | Primary cost driver                             |
| ------------------------ | ---------------------------- | ----------------------------------------------- |
| Lambda (API + processor) | Compute                      | Invocations + duration (processor 256MB / 30s)  |
| API Gateway HTTP API     | Entry                        | Requests                                        |
| DynamoDB                 | Incidents store              | On-demand RCU/WCU + PITR storage                |
| CloudWatch Logs          | Ops visibility               | Ingestion + 30d retention storage               |
| Bedrock                  | AI enrichment                | **Highest variable cost** per new auto-incident |
| SNS                      | High/critical notify         | Publishes (+ email delivery)                    |
| S3                       | Artifacts + private frontend | Storage + sync                                  |
| CloudFront               | Frontend CDN                 | Requests + **invalidations**                    |
| SQS                      | —                            | **Not used**                                    |
| Bootstrap S3/IAM OIDC    | CI foundations               | Negligible when idle                            |

### Findings

| ID  | Class           | Finding                                                                                                                         |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **PASS**        | At portfolio/demo traffic, base hosting (API Gateway, Lambda, DynamoDB, S3, CloudFront PriceClass_100) should remain low.       |
| C2  | **RISK**        | Dev default `INCIDENT_ANALYZER=bedrock`. Each new `/test-error` / pipeline incident incurs model cost.                          |
| C3  | **RISK**        | Frontend S3 sync + CloudFront `/*` invalidation runs on every eligible `main` deploy (independent of `ENABLE_TERRAFORM_APPLY`). |
| C4  | **IMPROVEMENT** | DynamoDB PITR always enabled for a disposable demo table.                                                                       |
| C5  | **IMPROVEMENT** | Docs drift: some README text may still imply analyzer default `fake` while Terraform vars default `bedrock`.                    |
| C6  | **PASS**        | Subscription filter is narrow (`incident_candidate`); idempotency avoids re-analyze/re-notify on duplicates.                    |

### Tear-down guidance (do not execute as part of this story)

1. Optionally set analyzer/notifier to `fake` / `none` if leaving the stack idle briefly.
2. `terraform destroy` the **app** stack (`environments/dev`) when demos end.
3. Note bucket `force_destroy` defaults may block destroy if objects remain.
4. Bootstrap (state bucket + OIDC role) is separate and optional to destroy later.
5. Set `ENABLE_TERRAFORM_APPLY=false`; remember frontend deploy may still run unless workflow/dispatch options are used carefully.

---

## Failure / Resilience Review

| Failure mode                               | Expected behavior                                                                                  | Class                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------- |
| Bedrock fails                              | Incident remains; analysis marked failed; high/critical may still get factual SNS; batch continues | **PASS**                   |
| SNS fails                                  | Incident + analysis retained; notification failure counted; batch continues                        | **PASS**                   |
| DynamoDB create fails                      | Per-candidate failure counted; other candidates continue                                           | **PASS**                   |
| Malformed log event                        | Ignored/failed record counters; batch not aborted                                                  | **PASS**                   |
| Frontend cannot reach API                  | UI surfaces typed unreachable error; CORS includes CloudFront origin                               | **PASS**                   |
| Processor transport/envelope decode throws | Lambda FunctionError → CloudWatch Logs subscription **retries** (poison-envelope risk)             | **RISK**                   |
| Silent degradation without alarms          | Failures isolated but may go unnoticed outside CI/manual checks                                    | **RISK** / **IMPROVEMENT** |

SCRUM-54 already proved the happy path (persist → Bedrock completed → SNS published → API/UI/status). No additional `/test-error` was triggered for this review.

---

## Infrastructure Review

Safe read-only checks (2026-08-13):

| Check                                     | Result                                                |
| ----------------------------------------- | ----------------------------------------------------- |
| `terraform fmt -check -recursive`         | **PASS**                                              |
| `terraform validate` (`environments/dev`) | **PASS**                                              |
| `terraform plan` (remote state)           | **No changes** — infrastructure matches configuration |

No unexpected adds/changes/destroys proposed. **No `terraform apply` was run.**

---

## CI/CD Review

Workflow: `.github/workflows/deploy-dev.yml`

| Check                                | Result                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------ |
| CI checks before deploy              | **PASS** — lint/typecheck/tests/build/lambda package in `ci` job         |
| AWS auth via OIDC                    | **PASS** — no long-lived AWS keys                                        |
| PR safety                            | **PASS** — no AWS plan/apply; no frontend S3 sync/invalidation           |
| Terraform apply gated                | **PASS** — `push` to `main` **and** `ENABLE_TERRAFORM_APPLY=true`        |
| Frontend targets correct S3 bucket   | **PASS** — from Terraform `frontend_bucket_name` with guardrails         |
| CloudFront invalidation after upload | **PASS** — `scripts/deploy-frontend.sh`                                  |
| Production `VITE_API_BASE_URL`       | **PASS** — baked from `api_invoke_url`; refuses localhost/`/api`         |
| Deployment verification              | **PASS** — AWS verify, smoke, Sprint 4/5 scripts (Sprint 5 toggleable)   |
| Frontend deploy vs apply gate        | **IMPROVEMENT** — frontend redeploy/invalidate can run when apply is off |

---

## Test Results

| Suite                                 | Result                                 |
| ------------------------------------- | -------------------------------------- |
| `npm run test:web`                    | **104 passed** (16 files)              |
| `npm run test:sprint5-local`          | **6 passed**                           |
| `npm test`                            | **265 passed** (37 files)              |
| `npm run typecheck` / `typecheck:web` | **PASS**                               |
| Live `/test-error`                    | **Not re-run** (SCRUM-54 already PASS) |

---

## Risks / Improvements (ranked)

### HIGH

1. **Unauthenticated public API + `/test-error`** — abuse/cost vector before any real production use. Gate or authenticate; rate-limit Bedrock/SNS paths.
2. **No CloudWatch alarms** — add minimal Lambda Errors (+ optional API 5xx) alarms.
3. **Bedrock cost while idle/demoing** — set `INCIDENT_ANALYZER=fake` (and optionally notifier `none`) when not actively demonstrating; destroy app stack when done.

### MEDIUM

4. Document/monitor processor **transport-parse → CloudWatch retry** poison-envelope risk.
5. Optionally gate CloudFront invalidation behind apply success or a dedicated flag.
6. Drop localhost CORS origins in a future prod profile (keep CloudFront only).
7. Unify request correlation (`x-request-id` from browser / APIGW edge).
8. Align Terraform README analyzer-default wording with actual `bedrock` default.

### LOW

9. Pin GitHub Actions to full commit SHAs.
10. Revisit DynamoDB PITR / `Scan` for demo cost and scale.
11. Consider processor timeout headroom for multi-candidate Bedrock batches.

---

## Final Production-Readiness Assessment

| Question                                                                                                             | Answer                                   |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Is the system suitable for portfolio/demo demonstration?                                                             | **Yes**                                  |
| Are security fundamentals (OIDC, private frontend origin, scoped IAM, explicit CORS, no committed secrets) in place? | **Yes**                                  |
| Is enterprise production readiness claimed?                                                                          | **No**                                   |
| Must recommendations be implemented before SCRUM-55 is complete?                                                     | **No** — this story is the review itself |
| Any changes implemented in this story?                                                                               | **None** (documentation only)            |

**SCRUM-55 review status: COMPLETE — awaiting stakeholder review of recommendations.**

---

## References

- Workflow: `.github/workflows/deploy-dev.yml`
- Bootstrap IAM/OIDC: `infrastructure/terraform/bootstrap/`
- App stack: `infrastructure/terraform/environments/dev/`
- Frontend hosting: `infrastructure/terraform/modules/frontend/`
- SCRUM-54 evidence: `docs/verification/real-ai-incident-e2e.md`
- Runbooks: `docs/runbooks/github-actions-deployment.md`, `cloudwatch-logging.md`, `frontend-deployment.md`, `sprint5-end-to-end-verification.md`
