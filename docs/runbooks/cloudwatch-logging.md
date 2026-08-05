# CloudWatch logging runbook

IncidentLens AI uses two CloudWatch log groups in the **dev** environment.

| Log group                                     | Source                           | Contents                                                         |
| --------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| `/aws/lambda/incidentlens-dev-api`            | Fastify / Pino in the API Lambda | Application JSON logs (`requestId`, route events, safe errors)   |
| `/aws/apigateway/incidentlens-dev-api-access` | API Gateway `$default` stage     | One JSON access-log object per HTTP request (edge metadata only) |

Retention defaults to **30 days** (`log_retention_days` in Terraform). Bounded retention keeps cost low.

## Safe logging rules

**Logged (safe):**

- API Gateway: request id, method, path, status, latencies, source IP, user agent
- Lambda/Pino: `service`, `version`, `requestId`, method/url, statusCode, `incidentId` / `severity` / `source` for incident ops

**Never logged intentionally:**

- Authorization headers, cookies, tokens, credentials
- Full request/response bodies
- Incident `description` or `metadata`
- Full DynamoDB items

## Request correlation

| Identifier              | Where                                                    | Notes                                                   |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| API Gateway `requestId` | Access logs (`$context.requestId`)                       | Edge-generated; always present for gateway requests     |
| Fastify `requestId`     | Lambda application logs + `x-request-id` response header | From safe inbound `X-Request-Id`, else a generated UUID |

These IDs are **separate** unless a client sends a safe `X-Request-Id` that Fastify accepts (letters, digits, `.`, `_`, `-`; max 128 chars). API Gateway does not automatically overwrite Fastify’s id with `$context.requestId`.

## Locate logs in the AWS Console

1. Region: **us-east-1** (unless overridden)
2. **CloudWatch → Log groups**
3. Open `/aws/apigateway/incidentlens-dev-api-access` for edge access logs
4. Open `/aws/lambda/incidentlens-dev-api` for Fastify/Pino logs
5. **Logs Insights** → select the log group → paste a query below

## Smoke tests (after approved `terraform apply`)

```bash
BASE="$(cd infrastructure/terraform/environments/dev && terraform output -raw api_invoke_url)"

curl -i "$BASE/health"                          # 200
curl -i "$BASE/does-not-exist"                  # 404
curl -i -X POST "$BASE/incidents" \
  -H 'content-type: application/json' \
  -d '{"title":"x"}'                            # 400
curl -i -X POST "$BASE/incidents" \
  -H 'content-type: application/json' \
  -d '{"title":"CW smoke","source":"demo-api","severity":"low","errorType":"Error"}'  # 201
curl -i "$BASE/test-error"                      # 500
```

Then verify:

- Access log group has one entry per request (status matches)
- Lambda log group has application lines for requests that reached the function
- No request bodies / descriptions / metadata appear in either group

## CloudWatch Logs Insights queries

Replace the log group selection in the console as noted.

### A. Recent API Gateway requests

Log group: `/aws/apigateway/incidentlens-dev-api-access`

```
fields @timestamp, requestId, httpMethod, routeKey, path, status, responseLatency, integrationLatency
| sort @timestamp desc
| limit 50
```

### B. API Gateway 4XX and 5XX

```
fields @timestamp, requestId, httpMethod, path, status, integrationErrorMessage, responseLatency
| filter status >= 400
| sort @timestamp desc
| limit 50
```

### C. Slow API requests (responseLatency > 1000 ms)

```
fields @timestamp, requestId, httpMethod, path, status, responseLatency, integrationLatency
| filter responseLatency > 1000
| sort responseLatency desc
| limit 50
```

### D. Recent Lambda / Fastify application errors

Log group: `/aws/lambda/incidentlens-dev-api`

```
fields @timestamp, requestId, msg, statusCode, method, url, err.type, err.message
| filter level = 50 or ispresent(err)
| sort @timestamp desc
| limit 50
```

(`level = 50` is Pino’s numeric **error** level.)

### E. Trace by Fastify requestId

```
fields @timestamp, requestId, msg, method, url, statusCode, incidentId, severity, source
| filter requestId = "PASTE_FASTIFY_REQUEST_ID"
| sort @timestamp asc
```

### F. Events for a specific incidentId

```
fields @timestamp, requestId, msg, incidentId, severity, source, previousStatus, newStatus
| filter incidentId = "PASTE_INCIDENT_ID"
| sort @timestamp asc
```

### G. Incident creation and status-update events

```
fields @timestamp, requestId, msg, incidentId, severity, source, previousStatus, newStatus, requestedStatus
| filter msg in ["incident created", "incident status updated", "incident status transition rejected", "failed to persist incident"]
| sort @timestamp desc
| limit 50
```

## Cost notes

- Pay for log ingestion + storage; **30-day retention** limits storage growth
- Access logs are one compact JSON object per request (no payloads)
- Avoid high-volume error loops when testing

## Subscription to processor (SCRUM-32)

Deliberate `eventType: "incident_candidate"` application logs from the API
Lambda log group are forwarded to `incidentlens-dev-processor`.

See [cloudwatch-subscription.md](./cloudwatch-subscription.md) and
[architecture/cloudwatch-subscription.md](../architecture/cloudwatch-subscription.md).

Still deferred: Base64/gzip decode, log parsing, incident persistence, Bedrock, SNS.

- Metric filters, alarms, dashboards
- X-Ray / OpenTelemetry
- SNS, Bedrock
- Export to S3 / indefinite retention

## Cleanup

```bash
cd infrastructure/terraform/environments/dev
terraform destroy
```
