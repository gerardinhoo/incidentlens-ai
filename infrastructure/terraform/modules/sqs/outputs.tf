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
