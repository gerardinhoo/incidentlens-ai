variable "aws_region" {
  description = "AWS region for the bootstrap resources (state bucket lives here)."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project prefix used in resource names."
  type        = string
  default     = "incidentlens"
}

variable "environment" {
  description = "Application environment the deployment role is allowed to manage."
  type        = string
  default     = "dev"
}

variable "github_owner" {
  description = "GitHub organization or user that owns the repository."
  type        = string
  default     = "gerardinhoo"
}

variable "github_repository" {
  description = "GitHub repository name (without owner)."
  type        = string
  default     = "incidentlens-ai"
}

variable "github_branch" {
  description = "Git branch allowed to assume the deployment role via OIDC."
  type        = string
  default     = "main"
}

variable "github_owner_id" {
  description = <<-EOT
    Numeric GitHub owner/org ID for immutable OIDC subject claims.
    Required for repositories created on or after 2026-07-15 (and opted-in older repos).
    Leave empty only for legacy name-only subjects.
  EOT
  type        = string
  default     = ""
}

variable "github_repository_id" {
  description = <<-EOT
    Numeric GitHub repository ID for immutable OIDC subject claims.
    Required for repositories created on or after 2026-07-15 (and opted-in older repos).
    Leave empty only for legacy name-only subjects.
  EOT
  type        = string
  default     = ""
}

variable "create_oidc_provider" {
  description = <<-EOT
    Create the account-level GitHub OIDC provider.
    Set to false if token.actions.githubusercontent.com already exists in the account
    (only one provider URL is allowed per account).
  EOT
  type        = bool
  default     = true
}

variable "existing_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider ARN when create_oidc_provider is false."
  type        = string
  default     = ""

  validation {
    condition     = var.create_oidc_provider || length(var.existing_oidc_provider_arn) > 0
    error_message = "existing_oidc_provider_arn is required when create_oidc_provider is false."
  }
}
