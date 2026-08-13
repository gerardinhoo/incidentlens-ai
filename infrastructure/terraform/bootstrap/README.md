# Bootstrap — remote state + GitHub OIDC

One-time, **separate** Terraform root module that creates the foundations for GitHub Actions deployments. It intentionally uses **local state** because it creates the remote-state bucket itself.

Do **not** combine this stack with `environments/dev`.

## What it creates

| Resource                                                  | Purpose                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| S3 state bucket (`incidentlens-tfstate-<account_id>`)     | Encrypted, versioned, public-access blocked remote Terraform state |
| IAM OIDC provider (`token.actions.githubusercontent.com`) | Trust GitHub Actions without long-lived AWS keys                   |
| IAM role `incidentlens-github-actions-deploy`             | Least-privilege role for planning/applying the **dev** app stack   |

The Lambda **artifact** bucket is **not** created here; `environments/dev` still owns it.

## Trust model

The deployment role trusts only the `main` branch of this repository, with audience `sts.amazonaws.com`.

For repositories created on or after **2026-07-15** (this repo), GitHub emits an **immutable** subject:

```text
repo:<owner>@<owner_id>/<repo>@<repo_id>:ref:refs/heads/main
```

Set `github_owner_id` and `github_repository_id` in `terraform.tfvars` (from `gh api repos/<owner>/<repo> --jq '{owner_id: .owner.id, id}'`). Leaving both empty keeps the legacy `repo:owner/repo:ref:refs/heads/main` form for older repos.

Feature branches and pull requests cannot assume this role. That is intentional for the first rollout.

## Apply locally (manual, one-time)

```bash
cd infrastructure/terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars
# edit github_owner / IDs / repository if needed
# (this repo needs github_owner_id + github_repository_id for OIDC)
terraform init
terraform plan
terraform apply
```

Record outputs:

- `terraform_state_bucket_name` → GitHub repository variable `TF_STATE_BUCKET`
- `github_actions_role_arn` → GitHub repository variable `AWS_ROLE_TO_ASSUME`

Then follow [docs/runbooks/terraform-remote-state.md](../../../docs/runbooks/terraform-remote-state.md).

## Deployment IAM permissions (summary)

The inline policy on `incidentlens-github-actions-deploy` is least-privilege for the **dev** app stack only. It does **not** grant `AdministratorAccess`, `iam:*`, or broad `service:*` wildcards.

| Area            | Scope                                                                                   |
| --------------- | --------------------------------------------------------------------------------------- |
| S3 state        | Exact state bucket + objects                                                            |
| S3 artifacts    | Exact `incidentlens-dev-artifacts-<account>` bucket                                     |
| S3 frontend     | Exact `incidentlens-dev-web-<account>` bucket + objects (Terraform + CI asset sync)     |
| CloudFront      | Account distributions/OACs (Create\* where AWS requires `*`; invalidate/manage scoped)  |
| Lambda          | Exact `incidentlens-dev-api` + `incidentlens-dev-processor` (+ versions / invoke)       |
| DynamoDB        | Exact `incidentlens-dev-incidents` table                                                |
| SNS             | Exact `incidentlens-dev-incidents` topic (+ subscription ARN suffix)                    |
| KMS (via SNS)   | Describe/ListAliases + ViaService-scoped use for SNS-managed SSE                        |
| CloudWatch Logs | Exact API + processor + API access log groups (+ subscription filter / FilterLogEvents) |
| IAM             | Exact API + processor execution roles + `PassRole` to Lambda only                       |
| API Gateway     | Account API Gateway HTTP API ARNs in the target region                                  |

### SCRUM-41 / SCRUM-42 note

After SNS was added to the app stack, CI plan failed with
`SNS:GetTopicAttributes` denied for `incidentlens-github-actions-deploy`.
**Re-apply this bootstrap stack** (manually; not from app CI) so the deploy role
gains the SNS topic permissions above before the next `main` apply.

### SCRUM-53 note (frontend CI/CD)

Frontend hosting (private S3 + CloudFront + OAC) and asset sync require the
frontend S3 + CloudFront statements above. Until this bootstrap stack is
**re-applied manually**, `main` CI may fail on CloudFront/S3 frontend actions
(for example `cloudfront:GetOriginAccessControl` or `s3:PutObject` on the web
bucket). Do **not** grant `s3:*`, `cloudfront:*`, or `AdministratorAccess`.

### Why some actions use `Resource "*"`

AWS requires `*` for certain list/describe/account-level APIs that cannot be resource-scoped:

- `sts:GetCallerIdentity`
- `lambda:ListFunctions`, `lambda:GetAccountSettings`
- `dynamodb:ListTables`
- `iam:ListRoles`
- `logs:DescribeLogGroups` / resource-policy APIs (account-level)
- `tag:GetResources` and related tagging reads used by the AWS provider

If the first CI plan fails with `AccessDenied`, tighten or extend **only** the failing action — do not widen to admin.

## Permissions boundary (future hardening)

This repository does not currently use IAM permissions boundaries. A later hardening step can attach a boundary to `incidentlens-github-actions-deploy` and to roles it creates. Not required for the initial SCRUM-29 rollout.

## SHA pinning (future hardening)

Pin third-party GitHub Actions to full commit SHAs in `.github/workflows/deploy-dev.yml` after the workflow is proven.

## Intentionally out of scope

- Application DynamoDB / Lambda / API Gateway
- Production environment
- Long-lived AWS access keys in GitHub
- Automatic apply of this bootstrap from CI
