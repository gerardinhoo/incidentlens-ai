# Runbook: Deployment testing

Low-cost automated checks for Terraform contracts, Lambda packaging, deployed AWS
configuration, and public HTTP behavior.

## Testing layers

| Layer                                | What it covers                                              | Where                                                          |
| ------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------- |
| TypeScript unit / domain tests       | Incident rules, sorting, transitions                        | `packages/**`, Vitest                                          |
| Fastify integration tests            | Routes, validation, status codes (in-memory / mocked repo)  | `apps/demo-api`                                                |
| Mocked DynamoDB repository tests     | Persistence adapter behavior                                | repository package tests                                       |
| Terraform native tests               | Infra contracts with `mock_provider "aws"`                  | `modules/*/*.tftest.hcl`, `environments/dev/wiring.tftest.hcl` |
| Lambda artifact validation           | API + processor handlers present; no secrets/tests/state    | `scripts/validate-lambda-package.sh`                           |
| AWS configuration verification       | Live API + processor Lambda/API/DynamoDB/Logs config        | `scripts/verify-aws-deployment.sh`                             |
| Processor direct invoke (main)       | Harmless fixture; asserts `accepted` / `processedRecords`   | workflow step after apply                                      |
| Subscription delivery (main)         | `GET /test-error` → processor `processedRecords >= 1`       | `scripts/verify-log-subscription-delivery.sh`                  |
| Automatic incident creation (manual) | `GET /test-error` → `persistedIncidents` + DynamoDB GetItem | `scripts/verify-automatic-incident-creation.sh`                |
| Idempotent processing (manual)       | Same CW envelope ×2 → create + duplicate                    | `scripts/verify-idempotent-processing.sh`                      |
| Deployed HTTP smoke tests            | Health, list, 404, 400, controlled 500, CORS                | `scripts/smoke-test-deployment.sh`                             |

## What runs where

### Pull requests (`pull_request` → `main`)

- Application lint / format / typecheck / test / coverage / build
- `npm run build:lambda` + `scripts/validate-lambda-package.sh` (API + processor)
- Terraform `fmt` + `validate`
- Terraform native tests (`scripts/test-terraform.sh`) — **mocked AWS, no credentials**
- **No** deployed smoke tests
- **No** AWS configuration verification
- **No** deployed processor invoke
- **No** subscription delivery test (`/test-error` against live AWS)
- **No** Terraform apply
- AWS-backed `terraform plan` still runs only on `main` (OIDC trust is main-only); PR plan coverage is the native mocked tests

### Main after successful apply

Only when `ENABLE_TERRAFORM_APPLY=true` and apply succeeds:

1. Bounded wait for API + processor Lambda `LastUpdateStatus=Successful`
2. `scripts/verify-aws-deployment.sh` (subscription filter, processor policy, no processor-log subscription)
3. Safe processor direct invoke with `tests/fixtures/processor/generic-event.json`
4. `scripts/smoke-test-deployment.sh`
5. `scripts/verify-log-subscription-delivery.sh` (`GET /test-error` → processor receipt)
6. Upload `artifacts/deployment-tests/` (retention ~7 days)
7. Append results to `$GITHUB_STEP_SUMMARY`

**Not** run automatically (table pollution; no delete endpoint):

- `npm run test:automatic-incident-creation`
- `npm run test:idempotent-processing`

Run manually after deploy when a write proof is needed. See
[automatic-incident-creation.md](./automatic-incident-creation.md) and
[idempotent-processing.md](./idempotent-processing.md).

## Why deployed tests avoid persistent writes

There is **no delete endpoint**. After SCRUM-34, `/test-error` used by
subscription delivery **can** create DynamoDB incidents as a side effect.
Full create/retrieve/update flows for application logic stay in Vitest
(in-memory / mocked repository). The dedicated persistence assertion script is
manual to avoid requiring DynamoDB GetItem/Scan on every job and to keep
evidence collection intentional.

Manual end-to-end DynamoDB write checks remain optional outside CI.

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

# Subscription delivery (after apply; calls live /test-error)
API_URL=... PROCESSOR_LOG_GROUP=/aws/lambda/incidentlens-dev-processor \
  npm run test:subscription-delivery
```

Subscription details:
[cloudwatch-subscription.md](./cloudwatch-subscription.md).

## Artifacts

Directory: `artifacts/deployment-tests/` (gitignored)

Typical files:

- `smoke-test-summary.md` / `smoke-test-status.json`
- `aws-verify-summary.md` / `aws-verify-status.json`
- Sanitized response bodies (no credentials / env values)
- `lambda-config.sanitized.json`, `dynamodb.sanitized.json`

GitHub Actions uploads `deployment-tests-dev-<sha>` with ~7 day retention,
including on failure when apply ran (`if: always()` on the upload step).

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
- No persistent write in CI smoke tests
- No auth / custom domain / Bedrock / SNS coverage
- No CloudWatch payload decode / incident persistence yet
- PR does not run AWS-backed `terraform plan` (OIDC main-only)

See also [github-actions-deployment.md](./github-actions-deployment.md).
