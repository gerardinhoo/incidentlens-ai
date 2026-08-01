variable "table_name" {
  description = "Name of the incidents DynamoDB table."
  type        = string
}

variable "deletion_protection_enabled" {
  description = "Whether deletion protection is enabled on the table."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to the table."
  type        = map(string)
  default     = {}
}
