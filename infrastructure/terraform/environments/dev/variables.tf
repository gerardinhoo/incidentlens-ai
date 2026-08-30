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

variable "frontend_bucket_force_destroy" {
  description = "Allow Terraform to destroy the frontend hosting bucket even if objects remain."
  type        = bool
  default     = false
}

variable "frontend_cloudfront_price_class" {
  description = "CloudFront price class for the frontend distribution (PriceClass_100 is cheapest)."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition = contains(
      ["PriceClass_All", "PriceClass_200", "PriceClass_100"],
      var.frontend_cloudfront_price_class,
    )
    error_message = "frontend_cloudfront_price_class must be PriceClass_All, PriceClass_200, or PriceClass_100."
  }
}

variable "cors_allow_origins" {
  description = "Local/dev browser origins allowed by API Gateway CORS (CloudFront origin is appended automatically)."
  type        = list(string)
  default = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]

  validation {
    condition = alltrue([
      for origin in var.cors_allow_origins :
      origin != "*"
    ])
    error_message = "cors_allow_origins must not include wildcard '*'."
  }
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

variable "enable_test_error_endpoint" {
  description = "When true, API Lambda registers GET /test-error for controlled incident-candidate demos. Default false for public/shared deployments."
  type        = bool
  default     = false
}

variable "lambda_package_source_dir" {
  description = "Optional override for the API Lambda package directory (used by Terraform tests)."
  type        = string
  default     = null
  nullable    = true
}

variable "processor_package_source_dir" {
  description = "Optional override for the processor Lambda package directory (used by Terraform tests)."
  type        = string
  default     = null
  nullable    = true
}

variable "incident_analyzer" {
  description = "Processor INCIDENT_ANALYZER: fake or bedrock (dev default bedrock for AI enrichment)."
  type        = string
  default     = "bedrock"

  validation {
    condition     = contains(["fake", "bedrock"], var.incident_analyzer)
    error_message = "incident_analyzer must be fake or bedrock."
  }
}

variable "bedrock_model_id" {
  description = "Bedrock model ID or inference-profile ID for Converse (configuration, not a secret)."
  type        = string
  default     = "amazon.nova-lite-v1:0"
}

variable "bedrock_invoke_resource_arns" {
  description = "Optional explicit Bedrock InvokeModel resource ARNs. Empty derives a foundation-model ARN from bedrock_model_id."
  type        = list(string)
  default     = []
}

variable "incident_notifier" {
  description = "Processor INCIDENT_NOTIFIER: fake, sns, or none (dev default sns)."
  type        = string
  default     = "sns"

  validation {
    condition     = contains(["fake", "sns", "none"], var.incident_notifier)
    error_message = "incident_notifier must be fake, sns, or none."
  }
}

variable "notification_email" {
  description = "Optional SNS email subscription endpoint. Leave null/empty for topic-only. Do not commit personal emails."
  type        = string
  default     = null
  nullable    = true
}
