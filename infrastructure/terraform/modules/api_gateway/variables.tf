variable "api_name" {
  description = "Name of the API Gateway HTTP API."
  type        = string
}

variable "lambda_invoke_arn" {
  description = "Invoke ARN of the Fastify API Lambda (AWS_PROXY integration URI)."
  type        = string
}

variable "lambda_function_name" {
  description = "Name of the Fastify API Lambda (for invoke permission)."
  type        = string
}

variable "integration_timeout_milliseconds" {
  description = "API Gateway HTTP API integration timeout (max 30000; must not exceed Lambda timeout)."
  type        = number
  default     = 30000

  validation {
    condition     = var.integration_timeout_milliseconds >= 50 && var.integration_timeout_milliseconds <= 30000
    error_message = "integration_timeout_milliseconds must be between 50 and 30000 for HTTP APIs."
  }
}

variable "cors_allow_origins" {
  description = "Allowed CORS origins for browser frontends (credentials disabled on the HTTP API)."
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
    error_message = "cors_allow_origins must not include wildcard '*'; use explicit origins (e.g. CloudFront URL)."
  }
}

variable "access_log_group_arn" {
  description = "CloudWatch log group ARN for HTTP API access logs."
  type        = string
}

variable "enable_jwt" {
  description = "When true, attach a JWT authorizer to $default and keep GET /health public. Must be a literal bool (not derived from Cognito IDs) so plan can compute count."
  type        = bool
  default     = false
}

variable "jwt_issuer" {
  description = "JWT issuer URL (Cognito: https://cognito-idp.<region>.amazonaws.com/<userPoolId>). Used when enable_jwt is true."
  type        = string
  default     = null
  nullable    = true
}

variable "jwt_audience" {
  description = "JWT audience (Cognito SPA client ID). Used when enable_jwt is true."
  type        = string
  default     = null
  nullable    = true
}

variable "tags" {
  description = "Tags applied to the HTTP API."
  type        = map(string)
  default     = {}
}
