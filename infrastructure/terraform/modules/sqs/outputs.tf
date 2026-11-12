output "queue_arn" {
  description = "Incident candidates SQS queue ARN."
  value       = aws_sqs_queue.candidates.arn
}

output "queue_url" {
  description = "Incident candidates SQS queue URL."
  value       = aws_sqs_queue.candidates.url
}

output "queue_name" {
  description = "Incident candidates SQS queue name."
  value       = aws_sqs_queue.candidates.name
}

output "visibility_timeout_seconds" {
  description = "Queue visibility timeout in seconds."
  value       = aws_sqs_queue.candidates.visibility_timeout_seconds
}

output "max_receive_count" {
  description = "Receives before a message is moved to the DLQ."
  value       = var.max_receive_count
}

output "dlq_arn" {
  description = "Dead-letter queue ARN for poison candidate messages."
  value       = aws_sqs_queue.dlq.arn
}

output "dlq_url" {
  description = "Dead-letter queue URL."
  value       = aws_sqs_queue.dlq.url
}

output "dlq_name" {
  description = "Dead-letter queue name."
  value       = aws_sqs_queue.dlq.name
}
