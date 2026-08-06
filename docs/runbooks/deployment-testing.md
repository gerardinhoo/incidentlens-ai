# Runbook: Deployment testing

Low-cost automated checks for Terraform contracts, Lambda packaging, deployed AWS
configuration, and public HTTP behavior.

## Testing layers

| Layer                                | What it covers                                             | Where                                                          |
| ------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------- |
| TypeScript unit / domain tests       | Incident rules, sorting, transitions                       | `packages/**`, Vitest                                          |
| Fastify integration tests            | Routes, validation, status codes (in-memory / mocked repo) | `apps/demo-api`                                                |
| Mocked DynamoDB repository tests     | Persistence adapter behavior                               | repository package tests                                       |
| Terraform native tests               | Infra contracts with `mock_provider "aws"`                 | `modules/*/*.tftest.hcl`, `environments/dev/wiring.tftest.hcl` |
| Lambda artifact validation           | API + processor handlers present; no secrets/tests/state   | `scripts/validate-lambda-package.sh`                           |
| AWS configuration verification       | Live API + processor Lambda/API/DynamoDB/Logs config       | `scripts/verify-aws-deployment.sh`                             |
| Processor direct invoke (main)       | Harmless fixture; asserts `accepted` / zero incidents      | workflow step after apply                                      |
| Local pipeline integration           | Real handler + MemoryIncidentRepository (no AWS)           | `npm run test:pipeline-local`                                  |
| Sprint 4 pipeline (main)             | `/test-error` → persist + DynamoDB + idempotency replay    | `scripts/verify-incident-pipeline.sh`                          |
| Automatic incident creation (legacy) | Same as pipeline phase 2                                   | `scripts/verify-automatic-incident-creation.sh`                |
| Idempotent processing (legacy)       | Same as pipeline phase 3                                   | `scripts/verify-idempotent-processing.sh`                      |
| Deployed HTTP smoke tests            | Health, list, 404, 400, controlled 500, CORS               | `scripts/smoke-test-deployment.sh`                             |

## What runs where

### Pull requests (`pull_request` → `main`)

- Application lint / format / typecheck / test / coverage / build
- `npm run test:pipeline-local` + `bash -n` on verify scripts
- `npm run build:lambda` + package validation
- Terraform `fmt` + `validate` + native tests (mocked AWS)
- **No** live `/test-error`, Lambda invoke, DynamoDB, or apply

### Main after successful apply

Only when `ENABLE_TERRAFORM_APPLY=true` and apply succeeds (**once**):

1. AWS configuration verify (read-only)
2. Safe processor direct invoke (empty fixture)
3. HTTP smoke tests
4. `scripts/verify-incident-pipeline.sh` — one `/test-error`, persist assert,
   deterministic idempotency replay
5. Upload `artifacts/deployment-tests/` + `artifacts/pipeline-integration/`
6. Sprint 4 section in `$GITHUB_STEP_SUMMARY`

### Manual pipeline-only (`workflow_dispatch` + `pipeline_test_only`)

Skips plan/apply; reads Terraform outputs from remote state; runs the same
deployed verification steps against the existing stack.

See [pipeline-integration-testing.md](./pipeline-integration-testing.md).

## Test-data note

There is **no delete endpoint**. Each successful pipeline run may add up to two
controlled incidents (API trigger + commit-SHA replay fixture). The replay
sourceEventId is derived from `GITHUB_SHA` so same-commit reruns dedupe.

## Required tools

| Tool                             | Used for                                  |
| -------------------------------- | ----------------------------------------- |
| Node.js 22 + npm                 | App tests / Lambda build                  |
| Terraform ≥ 1.7 (repo uses 1.14) | Native tests + validate                   |
| curl                             | Smoke tests                               |
| python3                          | JSON assertions in shell scripts          |
| AWS CLI v2                       | `verify-aws-deployment.sh` (OIDC session) |
| bash                             | All scripts                               |

`jq` is optional; scripts use `python3` for JSON.

## Local commands

```bash
# Application
npm test
npm run test:coverage
npm run build:lambda
npm run build:processor   # processor only, if needed

# Lambda packages (API + processor under dist/lambda/{api,processor})
./scripts/validate-lambda-package.sh
# or
npm run test:lambda-package

# Terraform native tests (no AWS credentials)
./scripts/test-terraform.sh
# or
npm run test:terraform

# Deployed smoke (HTTPS API only; does not write incidents)
API_URL="$(cd infrastructure/terraform/environments/dev && terraform output -raw api_invoke_url)" \
  ./scripts/smoke-test-deployment.sh

# AWS config verify (requires AWS credentials / OIDC)
export AWS_REGION=us-east-1
export LAMBDA_FUNCTION_NAME=incidentlens-dev-api
export PROCESSOR_FUNCTION_NAME=incidentlens-dev-processor
./scripts/verify-aws-deployment.sh

# Full Sprint 4 pipeline (after apply; one /test-error + idempotency replay)
API_URL=... \
INCIDENTS_TABLE_NAME=incidentlens-dev-incidents \
PROCESSOR_FUNCTION_NAME=incidentlens-dev-processor \
PROCESSOR_LOG_GROUP_NAME=/aws/lambda/incidentlens-dev-processor \
API_LOG_GROUP_NAME=/aws/lambda/incidentlens-dev-api \
  npm run test:incident-pipeline
```

## Artifacts

| Directory                         | Contents                                                  |
| --------------------------------- | --------------------------------------------------------- |
| `artifacts/deployment-tests/`     | Smoke + AWS verify + safe processor invoke                |
| `artifacts/pipeline-integration/` | Pipeline summary, sanitized incident, idempotency results |

Both are gitignored. Workflow uploads `deployment-tests-dev-<sha>` and
`pipeline-integration-dev-<sha>` (~7 day retention), including on failure when
verification ran (`if: always()` on upload steps).

## Interpreting failures

| Failure                        | Likely cause                                               |
| ------------------------------ | ---------------------------------------------------------- |
| Terraform native test assert   | Module contract drift — review `.tftest.hcl` vs module     |
| IAM test: no valid credentials | AWS provider probing real creds in CI                      | IAM `*.tftest.hcl` uses dummy keys + `skip_*` provider flags |
| Lambda package validation      | Forgot `build:lambda`, or forbidden files in `dist/lambda` |
| AWS verify Lambda not Active   | Propagating update; or failed deploy                       |
| Smoke health timeout           | API/Lambda cold start or bad invoke URL                    |
| Smoke 400/404/500 mismatch     | Route/error-handling regression in Fastify                 |
| CORS preflight fail            | API Gateway CORS config drift                              |

## Current limitations

- No browser / UI tests
- No load / chaos / performance suites
- No LocalStack
- No auth / custom domain / Bedrock / SNS / SQS / DLQ coverage
- No automatic incident deletion / cleanup
- Dev DynamoDB retains controlled pipeline test incidents
- PR does not run AWS-backed `terraform plan` (OIDC main-only)

See also [pipeline-integration-testing.md](./pipeline-integration-testing.md) and
[github-actions-deployment.md](./github-actions-deployment.md).
