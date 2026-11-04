variable "user_pool_name" {
  description = "Cognito user pool name for operator console sign-in."
  type        = string
}

variable "tags" {
  description = "Tags applied to the user pool."
  type        = map(string)
  default     = {}
}
