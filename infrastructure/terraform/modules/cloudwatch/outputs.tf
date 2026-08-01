output "log_group_name" {
  description = "API Lambda CloudWatch log group name."
  value       = aws_cloudwatch_log_group.api.name
}

output "log_group_arn" {
  description = "API Lambda CloudWatch log group ARN."
  value       = aws_cloudwatch_log_group.api.arn
}
