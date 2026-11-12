variable "queue_name" {
  description = "Name of the standard SQS queue for incident candidates."
  type        = string
}

variable "visibility_timeout_seconds" {
  description = "Must exceed the worker Lambda timeout so in-flight messages are not redelivered early."
  type        = number
  default     = 180
}

variable "tags" {
  description = "Tags applied to the queue."
  type        = map(string)
  default     = {}
}
