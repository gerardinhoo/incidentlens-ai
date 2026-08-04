provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "IncidentLensAI"
      Environment = "bootstrap"
      ManagedBy   = "Terraform"
      Purpose     = "ci-cd-bootstrap"
    }
  }
}
