variable "queue_name" {
  description = "Name of the standard SQS queue for incident candidates."
  type        = string
}

variable "visibility_timeout_seconds" {
  description = "Must exceed the worker Lambda timeout so in-flight messages are not redelivered early."
  type        = number
  default     = 180
}

variable "max_receive_count" {
  description = "Receives before SQS moves a message to the DLQ. Alarming the DLQ is a later story."
  type        = number
  default     = 3

  validation {
    condition     = var.max_receive_count >= 1 && var.max_receive_count <= 10
    error_message = "max_receive_count must be between 1 and 10."
  }
}

variable "tags" {
  description = "Tags applied to the queue."
  type        = map(string)
  default     = {}
}
