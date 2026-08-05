variable "role_name" {
  description = "Name of the Lambda execution role (logs-only)."
  type        = string
}

variable "log_group_arn" {
  description = "CloudWatch log group ARN this role may write to."
  type        = string
}

variable "tags" {
  description = "Tags applied to the IAM role."
  type        = map(string)
  default     = {}
}
