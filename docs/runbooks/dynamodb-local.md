# DynamoDB Local for IncidentLens AI

This runbook covers local DynamoDB persistence for the demo API. Normal `npm test` does **not** require DynamoDB Local — unit tests mock the AWS Document client.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- Node.js 22 (`nvm use`)
- AWS CLI v2 (optional, for table creation helper commands)

## 1. Start DynamoDB Local

From the repository root:

```bash
docker run --rm -p 8000:8000 amazon/dynamodb-local:latest
```

Or with Docker Compose (create `docker-compose.dynamodb.yml` if you prefer):

```yaml
services:
  dynamodb-local:
    image: amazon/dynamodb-local:latest
    ports:
      - '8000:8000'
    command: '-jar DynamoDBLocal.jar -sharedDb -inMemory'
```

```bash
docker compose -f docker-compose.dynamodb.yml up
```

## 2. Create the local incidents table

Partition key only: `id` (String). No sort key / GSI in this phase.

```bash
aws dynamodb create-table \
  --table-name incidents \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url http://127.0.0.1:8000 \
  --region us-east-1
```

Dummy credentials work for DynamoDB Local:

```bash
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
export AWS_REGION=us-east-1
```

## 3. Start the API against DynamoDB Local

```bash
export INCIDENT_REPOSITORY=dynamodb
export DYNAMODB_INCIDENTS_TABLE=incidents
export DYNAMODB_ENDPOINT=http://127.0.0.1:8000
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local

npm run dev
```

Create an incident:

```bash
curl -i -X POST http://127.0.0.1:3000/incidents \
  -H 'content-type: application/json' \
  -d '{
    "title": "API down",
    "source": "demo-api",
    "severity": "high",
    "errorType": "TimeoutError"
  }'
```

## Notes

- Default `INCIDENT_REPOSITORY` is `memory` (no DynamoDB required).
- If `INCIDENT_REPOSITORY=dynamodb` and `DYNAMODB_INCIDENTS_TABLE` is missing, startup fails clearly.
- There is no silent fallback from DynamoDB to memory.
