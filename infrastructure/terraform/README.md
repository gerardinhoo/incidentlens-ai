# IncidentLens AI — Terraform

Terraform for the **dev** AWS environment (SCRUM-25 foundation + SCRUM-26 Lambda).

## What this provisions

| Resource                                                | Purpose                                                  |
| ------------------------------------------------------- | -------------------------------------------------------- |
| DynamoDB table `incidentlens-dev-incidents`             | Durable incident store (`id` partition key, on-demand)   |
| CloudWatch log group `/aws/lambda/incidentlens-dev-api` | API Lambda logs (30-day retention by default)            |
| S3 artifact bucket                                      | Private versioned bucket for future deployment artifacts |
| API Gateway HTTP API                                    | Empty HTTP API shell (no routes/integrations yet)        |
| IAM Lambda execution role                               | Least-privilege role (CloudWatch logs + DynamoDB)        |
| Lambda `incidentlens-dev-api`                           | Fastify API on Node.js 22 / arm64                        |

## What this intentionally does **not** provision

- API Gateway routes / Lambda integration / stages for traffic (SCRUM-27)
- Lambda Function URL
- CloudWatch alarms, dashboards, subscription filters
- SNS, Bedrock, EventBridge, processor Lambdas
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
    ├── lambda/
    └── s3/
```

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) `>= 1.5`
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) v2
- Node.js 22 (`nvm use`)
- AWS credentials configured
- Permission to create DynamoDB, S3, IAM, CloudWatch Logs, API Gateway, and Lambda resources

Verify identity:

```bash
aws sts get-caller-identity
```

## Package the Lambda (required before plan/apply)

Terraform zips `dist/lambda` via `archive_file`. Build that directory first from the **repo root**:

```bash
nvm use 22
npm run build:lambda
```

This compiles TypeScript, copies runtime JS into `dist/lambda`, and installs production `node_modules` there. You do not create a zip by hand.

## Setup (dev)

```bash
cd infrastructure/terraform/environments/dev

# Optional local overrides (gitignored)
cp terraform.tfvars.example terraform.tfvars

terraform init
terraform fmt -check -recursive ../..
terraform validate
terraform plan
```

Do **not** apply until you intend to create/update billable resources.

Example destroy (only after resources have been applied):

```bash
terraform destroy
```

## Lambda environment variables

| Variable                   | Source                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| `NODE_ENV`                 | Terraform (`production` by default)                                 |
| `INCIDENT_REPOSITORY`      | Set to `dynamodb`                                                   |
| `DYNAMODB_INCIDENTS_TABLE` | DynamoDB module table name                                          |
| `LOG_LEVEL`                | Terraform (`info` by default)                                       |
| `AWS_REGION`               | **Injected by the Lambda runtime** (reserved; not set in Terraform) |

## Example tfvars

See `environments/dev/terraform.tfvars.example`.

## Cost expectations (dev)

Designed to stay low-cost when idle:

- DynamoDB **PAY_PER_REQUEST**
- Lambda charged only on invoke
- No NAT Gateway / always-on compute in this stack

## State management

Local state for now (`backend "local"`). See commented S3 backend template in `environments/dev/backend.tf` for a later remote-state bootstrap.

## Wiring overview

```text
environments/dev
  → module.dynamodb
  → module.cloudwatch
  → module.s3
  → module.api_gateway
  → module.iam          (needs table ARN + log group ARN)
  → module.lambda       (needs role ARN, log group, package dir, table name)
```

## Upcoming stories

- **SCRUM-27** — API Gateway routes + Lambda integration
- Later — alarms, CI/CD, processor Lambda, Bedrock, SNS
