# Local state is used for SCRUM-25 so this foundation can be developed without
# creating a remote-state bucket in the same configuration that would depend on it.
#
# Future remote state bootstrap (separate one-time setup, outside this stack):
# 1. Create a dedicated S3 bucket for Terraform state (versioning + encryption).
# 2. Optionally create a DynamoDB table for state locking.
# 3. Uncomment and fill in the backend block below.
# 4. Run: terraform init -migrate-state
#
# terraform {
#   backend "s3" {
#     bucket         = "YOUR_ACCOUNT-incidentlens-tfstate"
#     key            = "environments/dev/terraform.tfstate"
#     region         = "us-east-1"
#     encrypt        = true
#     dynamodb_table = "incidentlens-tfstate-lock"
#   }
# }

terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}
