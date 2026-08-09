output "topic_arn" {
  description = "Incident notification SNS topic ARN."
  value       = aws_sns_topic.incidents.arn
}

output "topic_name" {
  description = "Incident notification SNS topic name."
  value       = aws_sns_topic.incidents.name
}

output "email_subscription_arn" {
  description = "Email subscription ARN when configured; null otherwise."
  value       = length(aws_sns_topic_subscription.email) > 0 ? aws_sns_topic_subscription.email[0].arn : null
}
