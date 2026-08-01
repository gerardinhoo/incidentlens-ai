# IncidentLens AI — Terraform

Terraform foundation for the **dev** AWS environment (SCRUM-25).

## What this provisions

| Resource                                                | Purpose                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| DynamoDB table `incidentlens-dev-incidents`             | Durable incident store (`id` partition key, on-demand)            |
| CloudWatch log group `/aws/lambda/incidentlens-dev-api` | Future API Lambda logs (30-day retention by default)              |
| S3 artifact bucket                                      | Future Lambda/deployment packages (private, versioned, encrypted) |
| API Gateway HTTP API                                    | Empty HTTP API shell (no routes/integrations yet)                 |
| IAM Lambda execution role                               | Least-privilege role for future API Lambda (logs + DynamoDB)      |

## What this intentionally does **not** provision

- Lambda function (SCRUM-26)
- API Gateway routes / Lambda integration / stages for traffic (SCRUM-27)
- CloudWatch alarms, dashboards, subscription filters
- SNS, Bedrock, processor Lambdas
- VPC, NAT, EC2, RDS, OpenSearch, custom KMS keys
- GitHub Actions / CI/CD (SCRUM-29)
- Production environment
- Remote state bucket (bootstrapped separately later)

## Directory structure

```text
infrastructure/terraform/
├── environments/
│   └── dev/                 # Root module for the dev environment
└── modules/
    ├── api_gateway/
    ├── cloudwatch/
    ├── dynamodb/
    ├── iam/
    └── s3/
```

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) `>= 1.5`
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) v2
- AWS credentials configured (`aws configure`, SSO, or environment variables)
- Permission to create DynamoDB, S3, IAM, CloudWatch Logs, and API Gateway resources in the target account

Verify identity:

```bash
aws sts get-caller-identity
```

## Setup (dev)

From the repository root:

```bash
cd infrastructure/terraform/environments/dev

# Optional local overrides (gitignored)
cp terraform.tfvars.example terraform.tfvars

terraform init
terraform fmt -check -recursive ../..
terraform validate
terraform plan
```

Do **not** apply from CI or casually in shared accounts until you intend to create billable resources.

Example destroy (only after resources have been applied and you want them removed):

```bash
terraform destroy
```

## Example tfvars

See `environments/dev/terraform.tfvars.example`.

```hcl
project_name                         = "incidentlens"
environment                          = "dev"
aws_region                           = "us-east-1"
log_retention_days                   = 30
artifact_bucket_force_destroy        = false
dynamodb_deletion_protection_enabled = false
```

## Cost expectations (dev)

Designed to stay low-cost when idle:

- DynamoDB **PAY_PER_REQUEST** (no provisioned capacity)
- S3 / CloudWatch Logs / API Gateway / IAM incur little or no cost with no traffic
- No NAT Gateway, VPC endpoints, or always-on compute in this story

You still pay for stored log data, S3 object storage (once artifacts exist), and DynamoDB usage when the API runs against the table.

## State management

SCRUM-25 uses **local state** (`backend "local"`) so this stack does not depend on a remote-state bucket that would need to exist first.

Limitations of local state:

- State lives on the machine that runs Terraform
- Not ideal for team collaboration or CI
- Easy to lose if the working directory is deleted

Future remote-state plan (outside this stack):

1. Create a dedicated encrypted, versioned S3 bucket for state
2. Optionally create a DynamoDB lock table
3. Uncomment the S3 backend template in `environments/dev/backend.tf`
4. Run `terraform init -migrate-state`

## Wiring overview

```text
environments/dev
  → module.dynamodb      (incidents table)
  → module.cloudwatch    (API Lambda log group)
  → module.s3            (artifact bucket)
  → module.api_gateway   (HTTP API shell)
  → module.iam           (role; needs table ARN + log group ARN)
```

IAM receives ARNs from DynamoDB and CloudWatch outputs to avoid wildcards and circular dependencies. No Lambda is created yet, so the role is prepared ahead of SCRUM-26.

## Upcoming stories

- **SCRUM-26** — API Lambda packaging/deployment
- **SCRUM-27** — API Gateway routes + Lambda integration
- Later — alarms, CI/CD, processor Lambda, Bedrock, SNS
