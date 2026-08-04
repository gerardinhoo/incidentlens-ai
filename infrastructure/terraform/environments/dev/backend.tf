# Remote S3 backend with partial configuration.
# Account-specific values (bucket, optionally region) are supplied at init time
# via backend.hcl — see backend.hcl.example.
#
# One-time migration from local state (after bootstrap apply):
#   terraform init -backend-config=backend.hcl -migrate-state
#
# Do not commit backend.hcl or *.tfstate.
# Runbook: docs/runbooks/terraform-remote-state.md

terraform {
  backend "s3" {
    key          = "incidentlens/dev/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}
