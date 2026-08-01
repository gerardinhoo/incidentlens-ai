output "lambda_log_group_name" {
  description = "API Lambda CloudWatch log group name."
  value       = aws_cloudwatch_log_group.api.name
}

output "lambda_log_group_arn" {
  description = "API Lambda CloudWatch log group ARN."
  value       = aws_cloudwatch_log_group.api.arn
}

# Backwards-compatible aliases used by IAM / Lambda modules.
output "log_group_name" {
  description = "Alias for lambda_log_group_name."
  value       = aws_cloudwatch_log_group.api.name
}

output "log_group_arn" {
  description = "Alias for lambda_log_group_arn."
  value       = aws_cloudwatch_log_group.api.arn
}

output "access_log_group_name" {
  description = "API Gateway access log group name."
  value       = aws_cloudwatch_log_group.api_access.name
}

output "access_log_group_arn" {
  description = "API Gateway access log group ARN."
  value       = aws_cloudwatch_log_group.api_access.arn
}
