# IncidentLens AI Project Closeout

## Project Objective

Build a polished, interview-ready flagship portfolio project that demonstrates
production-style engineering: serverless AWS architecture, event-driven processing,
AI-assisted investigation, Infrastructure as Code, OIDC-based CI/CD, automated
testing, operational documentation, and an honest production-readiness review.

## Delivered Capabilities

- Fastify demo API on Lambda behind API Gateway (health, incidents CRUD-style reads, status transitions, controlled test failure)
- CloudWatch structured `incident_candidate` logging + subscription filter
- Processor Lambda with parse → idempotent create → Bedrock enrichment → SNS notify
- DynamoDB incident persistence with AI analysis fields
- React/Vite operator UI (list, details, AI panel, status workflow) on CloudFront + private S3
- Terraform modules and `environments/dev` stack + bootstrap (remote state, GitHub OIDC role)
- GitHub Actions Deploy Dev workflow (PR safety, gated apply, frontend sync/invalidation, smoke verification)
- Runbooks, architecture docs, E2E verification evidence, production-readiness review

## Final Architecture

See the authoritative overview: [architecture/overview.md](./architecture/overview.md).

```text
Browser → CloudFront → private S3 (SPA)
Browser → API Gateway → API Lambda → DynamoDB / CloudWatch
CloudWatch → subscription → Processor → Bedrock + DynamoDB + SNS
```

IaC: Terraform. CI/CD: GitHub Actions + AWS IAM OIDC.

## Engineering Practices Demonstrated

- Scrum / Jira story workflow with focused feature branches and pull requests
- Automated testing (unit, local integration, Terraform tests, deployment verify scripts)
- CI/CD with PR validation separated from AWS mutation
- Infrastructure as Code (Terraform modules + environments)
- GitHub OIDC authentication to AWS (no long-lived CI access keys)
- Least-privilege IAM for deploy and execution roles
- Observability via structured logs, request/incident IDs, CloudWatch retention
- Production-readiness review (security, observability, cost, resilience)
- Documentation and operational runbooks
- Responsible AI integration (advisory analysis; engineer verification required)

## End-to-End Verification

Evidence: [verification/real-ai-incident-e2e.md](./verification/real-ai-incident-e2e.md) (SCRUM-54).

Proven with **one** controlled deployed error:

```text
controlled error
  → CloudWatch
  → processor
  → Bedrock
  → DynamoDB
  → SNS
  → API
  → CloudFront React UI
  → lifecycle status update (open → investigating → resolved)
```

## Production Readiness Review

Evidence: [reviews/production-readiness-review.md](./reviews/production-readiness-review.md) (SCRUM-55).

Result: suitable for portfolio/demo demonstration with documented residual risks.
Not claimed as enterprise production-ready.

## Known Limitations

- Unauthenticated public API
- Controlled `/test-error` reachable on the demo API
- No CloudWatch alarms/dashboards
- No SQS/DLQ/EventBridge retry worker
- No Slack/SMS/PagerDuty integrations
- No custom domain / WAF / CloudFront access logs
- Dev/demo environment focus (not a multi-tenant SaaS)

## Future Improvements

Prioritized in the SCRUM-55 review, including:

- Authentication / authorization
- Protect or remove `/test-error` in shared environments
- Minimal alarms
- Stronger request correlation
- Tighter production CORS and Bedrock cost controls

## Project Status

**Planned portfolio scope: COMPLETE.**

IncidentLens AI is ready to present as a flagship engineering project, with working
deployed architecture, verified end-to-end flow, CI/CD, IaC, tests, and honest
closeout documentation.
