variable "role_name" {
  description = "Name of the processor Lambda execution role."
  type        = string
}

variable "log_group_arn" {
  description = "CloudWatch log group ARN this role may write to."
  type        = string
}

variable "incidents_table_arn" {
  description = "Optional DynamoDB incidents table ARN for PutItem. Null keeps logs-only."
  type        = string
  default     = null
  nullable    = true
}

variable "tags" {
  description = "Tags applied to the IAM role."
  type        = map(string)
  default     = {}
}
