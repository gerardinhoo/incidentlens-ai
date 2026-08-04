output "aws_account_id" {
  description = "AWS account ID where bootstrap resources were created."
  value       = local.account_id
}

output "aws_region" {
  description = "AWS region for bootstrap resources."
  value       = var.aws_region
}

output "terraform_state_bucket_name" {
  description = "S3 bucket name for IncidentLens Terraform remote state. Set as GitHub variable TF_STATE_BUCKET."
  value       = aws_s3_bucket.terraform_state.bucket
}

output "terraform_state_bucket_arn" {
  description = "ARN of the Terraform remote state bucket."
  value       = aws_s3_bucket.terraform_state.arn
}

output "github_oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider used by the deployment role."
  value       = local.oidc_provider_arn
}

output "github_actions_role_arn" {
  description = "Deployment role ARN. Set as GitHub variable AWS_ROLE_TO_ASSUME."
  value       = aws_iam_role.github_deploy.arn
}

output "github_oidc_subject" {
  description = "Exact OIDC subject claim allowed to assume the deployment role."
  value       = local.github_oidc_sub
}

output "artifact_bucket_name_expected" {
  description = "Expected application artifact bucket name (managed by environments/dev, not this stack)."
  value       = local.artifact_bucket_name
}
