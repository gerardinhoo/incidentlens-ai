resource "aws_sqs_queue" "candidates" {
  name                       = var.queue_name
  fifo_queue                 = false
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = var.visibility_timeout_seconds

  tags = var.tags
}
