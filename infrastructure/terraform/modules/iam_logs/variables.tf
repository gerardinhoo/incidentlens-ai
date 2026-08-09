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

variable "bedrock_invoke_resource_arns" {
  description = "Optional Bedrock model or inference-profile ARNs for Converse (bedrock:InvokeModel). Empty keeps Bedrock out of the policy."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to the IAM role."
  type        = map(string)
  default     = {}
}
