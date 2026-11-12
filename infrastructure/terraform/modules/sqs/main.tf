resource "aws_sqs_queue" "dlq" {
  name                    = "${var.queue_name}-dlq"
  fifo_queue              = false
  sqs_managed_sse_enabled = true

  tags = var.tags
}

resource "aws_sqs_queue" "candidates" {
  name                       = var.queue_name
  fifo_queue                 = false
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = var.visibility_timeout_seconds

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count
  })

  tags = var.tags
}
