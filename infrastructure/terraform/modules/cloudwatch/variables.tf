variable "lambda_log_group_name" {
  description = "CloudWatch log group name for the API Lambda application logs."
  type        = string
}

variable "access_log_group_name" {
  description = "CloudWatch log group name for API Gateway HTTP API access logs."
  type        = string
}

variable "processor_log_group_name" {
  description = "CloudWatch log group name for the incident processor Lambda. Null skips creation."
  type        = string
  default     = null
  nullable    = true
}

variable "retention_in_days" {
  description = "Log retention in days for managed log groups."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags applied to the log groups."
  type        = map(string)
  default     = {}
}
