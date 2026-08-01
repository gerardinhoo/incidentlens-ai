variable "api_name" {
  description = "Name of the API Gateway HTTP API."
  type        = string
}

variable "tags" {
  description = "Tags applied to the HTTP API."
  type        = map(string)
  default     = {}
}
