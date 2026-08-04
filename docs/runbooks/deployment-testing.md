# Runbook: Deployment testing

Low-cost automated checks for Terraform contracts, Lambda packaging, deployed AWS
configuration, and public HTTP behavior.

## Testing layers

| Layer                            | What it covers                                             | Where                                                          |
| -------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| TypeScript unit / domain tests   | Incident rules, sorting, transitions                       | `packages/**`, Vitest                                          |
| Fastify integration tests        | Routes, validation, status codes (in-memory / mocked repo) | `apps/demo-api`                                                |
| Mocked DynamoDB repository tests | Persistence adapter behavior                               | repository package tests                                       |
| Terraform native tests           | Infra contracts with `mock_provider "aws"`                 | `modules/*/*.tftest.hcl`, `environments/dev/wiring.tftest.hcl` |
| Lambda artifact validation       | Handler present, no secrets/tests/state in package         | `scripts/validate-lambda-package.sh`                           |
| AWS configuration verification   | Live Lambda/API/DynamoDB/Logs match intended config        | `scripts/verify-aws-deployment.sh`                             |
| Deployed HTTP smoke tests        | Health, list, 404, 400, controlled 500, CORS               | `scripts/smoke-test-deployment.sh`                             |

## What runs where

### Pull requests (`pull_request` → `main`)

- Application lint / format / typecheck / test / coverage / build
- `npm run build:lambda` + `scripts/validate-lambda-package.sh`
- Terraform `fmt` + `validate`
- Terraform native tests (`scripts/test-terraform.sh`) — **mocked AWS, no credentials**
- **No** deployed smoke tests
- **No** AWS configuration verification
- **No** Terraform apply
- AWS-backed `terraform plan` still runs only on `main` (OIDC trust is main-only); PR plan coverage is the native mocked tests

### Main after successful apply

Only when `ENABLE_TERRAFORM_APPLY=true` and apply succeeds:

1. Bounded wait for Lambda `LastUpdateStatus=Successful`
2. `scripts/verify-aws-deployment.sh`
3. `scripts/smoke-test-deployment.sh`
4. Upload `artifacts/deployment-tests/` (retention ~7 days)
5. Append results to `$GITHUB_STEP_SUMMARY`

## Why deployed tests avoid persistent writes

There is **no delete endpoint**. Creating a valid incident on every deploy would
pollute DynamoDB forever. Full create/retrieve/update flows stay in the Vitest
suite (in-memory / mocked repository).

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

# Lambda package
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
./scripts/verify-aws-deployment.sh
```

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

| Failure                      | Likely cause                                               |
| ---------------------------- | ---------------------------------------------------------- |
| Terraform native test assert | Module contract drift — review `.tftest.hcl` vs module     |
| Lambda package validation    | Forgot `build:lambda`, or forbidden files in `dist/lambda` |
| AWS verify Lambda not Active | Propagating update; or failed deploy                       |
| Smoke health timeout         | API/Lambda cold start or bad invoke URL                    |
| Smoke 400/404/500 mismatch   | Route/error-handling regression in Fastify                 |
| CORS preflight fail          | API Gateway CORS config drift                              |

## Current limitations

- No browser / UI tests
- No load / chaos / performance suites
- No LocalStack
- No persistent write in CI smoke tests
- No auth / custom domain / Bedrock / SNS coverage
- PR does not run AWS-backed `terraform plan` (OIDC main-only)

See also [github-actions-deployment.md](./github-actions-deployment.md).
