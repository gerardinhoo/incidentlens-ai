# Runbook: Migrate Terraform state to S3

One-time procedure to move `environments/dev` from local state to the bootstrap S3 backend. GitHub Actions must never deploy against local state.

## Prerequisites

- AWS credentials in your shell with permission to apply the bootstrap stack and read/write the new state bucket
- Terraform `>= 1.10` (for `use_lockfile`)
- Bootstrap not yet applied, or already applied successfully

## Sequence

### 1. Review and apply bootstrap (local state)

```bash
cd infrastructure/terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

### 2. Record outputs

```bash
terraform output terraform_state_bucket_name
terraform output github_actions_role_arn
terraform output github_oidc_subject
```

Save:

| Output            | Used for                                            |
| ----------------- | --------------------------------------------------- |
| State bucket name | `backend.hcl` and GitHub variable `TF_STATE_BUCKET` |
| Role ARN          | GitHub variable `AWS_ROLE_TO_ASSUME`                |

### 3. Create local `backend.hcl`

```bash
cd ../environments/dev
cp backend.hcl.example backend.hcl
```

Edit placeholders:

```hcl
bucket = "incidentlens-tfstate-ACCOUNT_ID"
region = "us-east-1"
```

Do not commit `backend.hcl`.

### 4. Back up existing local state

```bash
cp terraform.tfstate "terraform.tfstate.backup.pre-remote-$(date +%Y%m%d%H%M%S)"
cp terraform.tfstate.backup "terraform.tfstate.backup.pre-remote-secondary-$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
```

Store the backup outside the repo if possible (encrypted volume / secure backup). Never commit state files.

### 5. Migrate state

```bash
cd infrastructure/terraform/environments/dev
terraform init -backend-config=backend.hcl -migrate-state
```

Confirm the migration prompt. Do not delete the local state file until you have verified the remote copy.

### 6. Confirm migration

```bash
terraform state list
aws s3 ls "s3://YOUR_STATE_BUCKET/incidentlens/dev/"
```

Expected: the same resource addresses as before migration, and an object at `incidentlens/dev/terraform.tfstate`.

### 7. Plan and review for surprises

```bash
npm run build:lambda
terraform plan -input=false
```

The first plan after migration must be reviewed for:

- unexpected destroy operations
- replacement of Lambda
- replacement of API Gateway
- replacement of DynamoDB table
- replacement of S3 artifact bucket

A clean migration should show no (or only cosmetic) changes. Do not enable CI apply until this plan is clean.

### 8. Add GitHub repository variables

In the repository **Settings → Secrets and variables → Actions → Variables**:

| Name                     | Value                                             |
| ------------------------ | ------------------------------------------------- |
| `AWS_ROLE_TO_ASSUME`     | bootstrap output `github_actions_role_arn`        |
| `AWS_REGION`             | e.g. `us-east-1`                                  |
| `TF_STATE_BUCKET`        | bootstrap output `terraform_state_bucket_name`    |
| `ENABLE_TERRAFORM_APPLY` | `false` until the first clean CI plan is reviewed |

Do not store `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

### 9. Run the workflow manually

Use **Actions → Deploy Dev → Run workflow** (`workflow_dispatch`). First implementation is **plan-only**.

### 10. Stop using local-state init for the app stack

From now on, always initialize with:

```bash
terraform init -backend-config=backend.hcl -lockfile=readonly
```

Do not switch the backend back to `local` for day-to-day work.

## Recovery guidance

### S3 version history

The state bucket has versioning enabled. If a bad state object is written:

```bash
aws s3api list-object-versions \
  --bucket YOUR_STATE_BUCKET \
  --prefix incidentlens/dev/terraform.tfstate
```

Restore a previous version deliberately (download + `terraform state push` only if you understand the risk).

### `terraform state pull`

```bash
terraform state pull > /tmp/incidentlens-dev.tfstate.backup
```

Keep that file out of git.

### Stale lock

With `use_lockfile = true`, Terraform stores a lock object alongside state. If a run dies mid-apply:

1. Confirm no other `terraform` / GitHub Actions apply is running
2. Inspect the lock metadata
3. Only then force-unlock:

```bash
terraform force-unlock LOCK_ID
```

Never unlock while another apply is live.

### Never commit state

`*.tfstate`, `*.tfstate.*`, and `backend.hcl` are gitignored. Treat state as sensitive (resource IDs, ARNs, sometimes secrets in older configs).

## Safety gate before CI apply

Keep `ENABLE_TERRAFORM_APPLY=false` until:

1. Bootstrap is applied
2. Remote-state migration is done
3. A local (or CI) plan shows no unexpected recreates
4. You explicitly set `ENABLE_TERRAFORM_APPLY=true`

See also [github-actions-deployment.md](./github-actions-deployment.md).
