variable "role_name" {
  description = "Name of the future API Lambda execution role."
  type        = string
}

variable "api_log_group_arn" {
  description = "CloudWatch log group ARN for the future API Lambda."
  type        = string
}

variable "incidents_table_arn" {
  description = "DynamoDB incidents table ARN."
  type        = string
}

variable "tags" {
  description = "Tags applied to the IAM role."
  type        = map(string)
  default     = {}
}
