# Security Policy

IncidentLens AI is a **public demonstration / reference implementation** of an
AI-assisted, event-driven incident workflow on AWS. It is not offered as a
hosted multi-tenant production service.

## Do not commit credentials

Never commit:

- AWS access keys or session tokens
- GitHub tokens
- `.env` files with secrets
- `terraform.tfvars` with personal emails or private values
- Terraform state files

Use gitignored local files and GitHub Actions **OIDC** (no long-lived AWS keys
in CI). Frontend `VITE_*` values must remain public configuration only
(e.g. API base URL).

## Reporting a vulnerability

If you believe you have found a security issue in this repository:

1. Open a GitHub Security Advisory for this repository if available, **or**
2. Contact the repository owner via their GitHub profile contact options.

Please include a clear description and reproduction steps. Do not file public
issues that include exploit details for live endpoints until coordinated.

## Controlled test-error endpoint

`GET /test-error` emits a structured `incident_candidate` log for pipeline
demos. It is **disabled by default** (`ENABLE_TEST_ERROR_ENDPOINT` unset/false).
Public/shared API deployments should keep it disabled unless briefly enabled
for an intentional controlled demonstration.

## AI / Bedrock data handling

Incident analysis sends an **allow-listed** operational subset to Amazon Bedrock
(service, severity, error type, and optional route/status/environment/safe
message). Raw log payloads, stack traces, request bodies, headers, and
credentials are not included. Model output is validated before persistence.
AI text is a hypothesis for engineers—not confirmed root cause.

## Known limitations

The HTTP API is unauthenticated in this reference stack. Do not treat this
repository as enterprise production-hardened. See
[docs/reviews/production-readiness-review.md](docs/reviews/production-readiness-review.md).
