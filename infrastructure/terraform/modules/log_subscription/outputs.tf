output "filter_name" {
  description = "Subscription filter name."
  value       = aws_cloudwatch_log_subscription_filter.api_to_processor.name
}

output "log_group_name" {
  description = "Source log group name."
  value       = aws_cloudwatch_log_subscription_filter.api_to_processor.log_group_name
}

output "destination_arn" {
  description = "Subscription destination Lambda ARN."
  value       = aws_cloudwatch_log_subscription_filter.api_to_processor.destination_arn
}

output "filter_pattern" {
  description = "Subscription filter pattern."
  value       = aws_cloudwatch_log_subscription_filter.api_to_processor.filter_pattern
}

output "lambda_permission_statement_id" {
  description = "Lambda permission statement ID for CloudWatch Logs invoke."
  value       = aws_lambda_permission.allow_cloudwatch_logs.statement_id
}
