variable "topic_name" {
  description = "Name of the SNS topic for incident notifications."
  type        = string
}

variable "notification_email" {
  description = "Optional email endpoint for SNS subscription. Empty/null creates no subscription."
  type        = string
  default     = null
  nullable    = true
}

variable "tags" {
  description = "Tags applied to the SNS topic."
  type        = map(string)
  default     = {}
}
