variable "project_name" {
  description = "Short project name used in resource naming."
  type        = string
  default     = "incidentlens"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for all resources in this environment."
  type        = string
  default     = "us-east-1"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days for the future API Lambda."
  type        = number
  default     = 30
}

variable "artifact_bucket_force_destroy" {
  description = "Allow Terraform to destroy the artifact bucket even if objects remain."
  type        = bool
  default     = false
}

variable "dynamodb_deletion_protection_enabled" {
  description = "Enable DynamoDB deletion protection (usually false for disposable dev)."
  type        = bool
  default     = false
}

variable "lambda_log_level" {
  description = "LOG_LEVEL environment variable for the API Lambda."
  type        = string
  default     = "info"
}

variable "lambda_node_env" {
  description = "NODE_ENV environment variable for the API Lambda."
  type        = string
  default     = "production"
}
