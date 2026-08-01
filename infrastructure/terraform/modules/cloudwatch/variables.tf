variable "log_group_name" {
  description = "CloudWatch log group name for the future API Lambda."
  type        = string
}

variable "retention_in_days" {
  description = "Log retention in days."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags applied to the log group."
  type        = map(string)
  default     = {}
}
