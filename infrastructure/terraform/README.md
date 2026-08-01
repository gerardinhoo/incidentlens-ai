# IncidentLens AI — Terraform

Terraform for the **dev** AWS environment:

- SCRUM-25 — foundation (DynamoDB, IAM, S3, log group, HTTP API shell)
- SCRUM-26 — Fastify API Lambda
- SCRUM-27 — API Gateway → Lambda proxy (public HTTPS)
- SCRUM-28 — CloudWatch access + application logging

## Request flow

```text
Client (curl / browser)
  → API Gateway HTTP API ($default stage)
      → AWS_PROXY integration (payload format 2.0)
          → Lambda incidentlens-dev-api
              → @fastify/aws-lambda adapter
                  → buildApp() / Fastify routes
                      → IncidentRepository (DynamoDB)
```

### Why a catch-all `$default` route?

Fastify already owns routing (`/health`, `/incidents`, `/incidents/:id`, status PATCH, 404s). One `$default` API Gateway route forwards **all** methods/paths to the same Lambda so Terraform does not duplicate every Fastify route.

### Payload format version 2.0

HTTP API Lambda proxy uses **payload format 2.0**. `@fastify/aws-lambda` supports `event.version === "2.0"` (query/cookie handling). REST API v1 / format 1.0 is not used.

### Default stage

Stage name `$default` with `auto_deploy = true`. For HTTP APIs, the invoke URL is the API endpoint with **no stage path prefix**.

## What this provisions

| Resource                                                 | Purpose                                       |
| -------------------------------------------------------- | --------------------------------------------- |
| DynamoDB `incidentlens-dev-incidents`                    | Incident persistence                          |
| CloudWatch `/aws/lambda/incidentlens-dev-api`            | Lambda / Fastify application logs (Pino JSON) |
| CloudWatch `/aws/apigateway/incidentlens-dev-api-access` | API Gateway HTTP API access logs              |
| S3 artifact bucket                                       | Future deployment packages                    |
| IAM Lambda execution role                                | Logs + DynamoDB access                        |
| Lambda `incidentlens-dev-api`                            | Fastify API (Node 22 / arm64)                 |
| HTTP API + `$default` route/stage                        | Public HTTPS front door + access logging      |
| Lambda invoke permission                                 | API Gateway → this function only              |

## Logging (SCRUM-28)

Two log streams of truth:

1. **API Gateway access logs** — one compact JSON object per request at the edge (method, path, status, latencies). No bodies or auth headers.
2. **Lambda application logs** — Pino structured JSON from Fastify (`LOG_LEVEL` via Terraform). Lambda `logging_config` uses **Text** so Pino lines are not double-wrapped as Lambda JSON.

Retention defaults to **30 days**. Details, Insights queries, and smoke checks: [docs/runbooks/cloudwatch-logging.md](../../docs/runbooks/cloudwatch-logging.md).

## Intentionally not provisioned yet

- Authentication (Cognito / JWT / API keys)
- Custom domain / Route 53 / CloudFront / WAF
- Subscription filters, metric filters, alarms, dashboards
- X-Ray / OpenTelemetry
- GitHub Actions deploy (**SCRUM-29**)
- SNS, Bedrock, processor Lambda
- Separate prod environment / stages
- Per-route API Gateway definitions for every Fastify path

## Directory structure

```text
infrastructure/terraform/
├── environments/dev/
└── modules/
    ├── api_gateway/
    ├── cloudwatch/
    ├── dynamodb/
    ├── iam/
    ├── lambda/
    └── s3/
```

## Prerequisites

- Terraform `>= 1.5`
- AWS CLI v2 + credentials
- Node.js 22 (`nvm use`)

```bash
aws sts get-caller-identity
```

## Package Lambda (before plan/apply)

```bash
nvm use 22
npm run build:lambda
```

## Plan / apply (dev)

```bash
cd infrastructure/terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars   # optional

terraform init
terraform fmt -check -recursive ../..
terraform validate
terraform plan
# terraform apply   # only when explicitly approved
```

### Useful outputs

| Output                                                   | Use                      |
| -------------------------------------------------------- | ------------------------ |
| `api_invoke_url`                                         | Base URL for smoke tests |
| `api_endpoint`                                           | Same base endpoint       |
| `api_stage_name`                                         | `$default`               |
| `lambda_function_name`                                   | Ops / console            |
| `lambda_log_group_name` / `lambda_log_group_arn`         | Fastify application logs |
| `api_access_log_group_name` / `api_access_log_group_arn` | API Gateway access logs  |

```bash
terraform output api_invoke_url
```

## Deployed smoke tests

Replace `BASE` with `terraform output -raw api_invoke_url`.

```bash
BASE="$(terraform output -raw api_invoke_url)"

# Health
curl -i "$BASE/health"

# Create
curl -i -X POST "$BASE/incidents" \
  -H 'content-type: application/json' \
  -d '{"title":"Gateway smoke","source":"demo-api","severity":"high","errorType":"TimeoutError"}'

# List
curl -i "$BASE/incidents"

# Get by id (paste id from create response)
curl -i "$BASE/incidents/PASTE_ID"

# Status update
curl -i -X PATCH "$BASE/incidents/PASTE_ID/status" \
  -H 'content-type: application/json' \
  -d '{"status":"investigating"}'
```

## CORS (dev)

Configured on the HTTP API (credentials **disabled**):

- Origins: `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5173`, `http://127.0.0.1:5173`
- Methods: `GET`, `POST`, `PATCH`, `OPTIONS`
- Headers: `content-type`, `authorization`, `x-request-id`

No wildcard origin with credentials.

## Cleanup

```bash
cd infrastructure/terraform/environments/dev
terraform destroy
```

## Lambda environment variables

| Variable                   | Source                                |
| -------------------------- | ------------------------------------- |
| `NODE_ENV`                 | Terraform                             |
| `INCIDENT_REPOSITORY`      | `dynamodb`                            |
| `DYNAMODB_INCIDENTS_TABLE` | Table name                            |
| `LOG_LEVEL`                | Terraform                             |
| `AWS_REGION`               | Injected by Lambda runtime (reserved) |
