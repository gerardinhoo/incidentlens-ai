# Runbook: GitHub Actions deployment (dev)

## Architecture

```text
GitHub Actions (deploy-dev.yml)
  → OIDC token (id-token: write)
      → AWS STS AssumeRoleWithWebIdentity
          → IAM role incidentlens-github-actions-deploy
              → Terraform (S3 remote state)
                  → AWS: Lambda, API Gateway, DynamoDB, Logs, IAM, S3 artifacts
```

No long-lived AWS access keys are stored in GitHub.

## Why OIDC

- Short-lived credentials issued per workflow run
- Trust is pinned to this repository and the `main` branch
- No rotating static secrets in GitHub Secrets for AWS auth
- Role permissions are least-privilege for IncidentLens **dev** only

## Bootstrap procedure

1. Apply `infrastructure/terraform/bootstrap` locally (local state)
2. Migrate `environments/dev` to S3 remote state ([terraform-remote-state.md](./terraform-remote-state.md))
3. Set repository variables (below)
4. Keep `ENABLE_TERRAFORM_APPLY=false` until the first remote-state plan is clean
5. Merge CI/CD changes and run the workflow

## Required repository variables

| Variable                 | Sensitive?      | Purpose                              |
| ------------------------ | --------------- | ------------------------------------ |
| `AWS_ROLE_TO_ASSUME`     | No (identifier) | Deployment role ARN from bootstrap   |
| `AWS_REGION`             | No              | e.g. `us-east-1`                     |
| `TF_STATE_BUCKET`        | No (identifier) | Remote state bucket name             |
| `ENABLE_TERRAFORM_APPLY` | No              | Must be `true` for main-branch apply |

Use **GitHub Secrets** only for real secrets. Do not configure `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or `AWS_SESSION_TOKEN`.

## Workflow triggers

File: `.github/workflows/deploy-dev.yml`

| Event                   | Application CI | Terraform                        | Apply                                 |
| ----------------------- | -------------- | -------------------------------- | ------------------------------------- |
| `pull_request` → `main` | Yes            | `fmt` + `validate` (no AWS OIDC) | Never                                 |
| `push` → `main`         | Yes            | Plan via OIDC                    | Only if `ENABLE_TERRAFORM_APPLY=true` |
| `workflow_dispatch`     | Yes            | Plan via OIDC                    | Never (plan-only)                     |

### Why PRs do not run AWS-backed `terraform plan`

OIDC trust is restricted to this repository’s `main` branch. Because the repo was created after 2026-07-15, the subject uses immutable IDs:

```text
repo:gerardinhoo@33221789/incidentlens-ai@1304356739:ref:refs/heads/main
```

Pull-request subjects use `...:pull_request`, which cannot assume the role. Expanding trust is a conscious future change; do not loosen it casually.

## Concurrency

```yaml
concurrency:
  group: incidentlens-dev-deployment
  cancel-in-progress: false
```

Overlapping applies are blocked from racing. New runs wait; in-progress runs are not cancelled mid-apply.

## Saved plans

On `main` / `workflow_dispatch`, Terraform writes a binary `tfplan` in the same job that may apply it. Apply uses that exact file (`terraform apply tfplan`) so the applied change set matches the reviewed plan. Plans are uploaded as artifacts (retention ~7 days) for audit — state and credentials are never uploaded.

**Design choice:** plan and apply stay in one job. Saved plans are not always portable across isolated runners (absolute paths, provider plugin caches). One job is the simpler reliable approach.

## Artifact retention

Uploaded for ~7 days:

- `tfplan` (binary)
- human-readable plan text
- Lambda deployment package (`dist/lambda`)

Not uploaded: Terraform state, `backend.hcl`, AWS credentials, secret tfvars.

## Deployment testing (SCRUM-30)

After a successful main-branch apply the workflow runs:

1. `scripts/verify-aws-deployment.sh` — read-only AWS config checks
2. `scripts/smoke-test-deployment.sh` — HTTP health/list/404/400/500/CORS

Pull requests run Terraform **native** tests and Lambda package validation without
touching live AWS. Details: [deployment-testing.md](./deployment-testing.md).

Smoke tests intentionally never create a valid incident (no delete endpoint).

## Rollback procedure

Honest rollback for infrastructure-as-code:

1. Revert the faulty Git commit on `main` (revert PR)
2. Merge the revert so CI plans the previous desired configuration
3. With `ENABLE_TERRAFORM_APPLY=true`, let main apply the saved plan from that run
4. For urgent recovery: restore `main` to the known-good commit and dispatch/push so Terraform converges

Terraform does **not** automatically “roll back” failed application behavior. A bad Lambda deploy is fixed by applying a good configuration again. State-file surgery is last resort — see the remote-state runbook.

## Troubleshooting

| Symptom                                                   | Likely cause                                                              | Action                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Wrong subject (legacy vs immutable IDs, branch/PR/fork) or wrong role ARN | Confirm run is on `main`; compare bootstrap `github_oidc_subject` to GitHub’s immutable `sub` (`owner@id/repo@id`); check `AWS_ROLE_TO_ASSUME` |
| Backend init fails                                        | Missing/wrong `TF_STATE_BUCKET`                                           | Re-check bootstrap output and repo variable                                                                                                    |
| Provider checksum / lockfile errors on CI                 | Lock file missing Linux runner hashes                                     | From `environments/dev`: `terraform providers lock -platform=linux_amd64 -platform=darwin_arm64` and commit `.terraform.lock.hcl`              |
| Apply skipped on main                                     | `ENABLE_TERRAFORM_APPLY` not `true`                                       | Set variable after clean plan review                                                                                                           |
| Plan wants to replace DynamoDB / API                      | State drift or wrong state key                                            | Stop; compare `terraform state list` with AWS; do not apply                                                                                    |
| Smoke test 429 / timeout                                  | API Gateway throttle or cold start                                        | Retries are built-in; check CloudWatch access logs                                                                                             |
| Lock errors                                               | Overlapping apply or crashed run                                          | Wait; then carefully `force-unlock` only if safe                                                                                               |

## Action versioning

Workflow pins official actions to stable major versions (`actions/checkout@v4`, etc.). Future hardening: pin third-party actions to full commit SHAs.

## Related docs

- [terraform-remote-state.md](./terraform-remote-state.md)
- [../testing.md](../testing.md) (if present)
- [cloudwatch-logging.md](./cloudwatch-logging.md)
- Bootstrap README: `infrastructure/terraform/bootstrap/README.md`
