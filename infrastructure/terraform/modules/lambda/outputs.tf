output "function_arn" {
  description = "Lambda function ARN."
  value       = aws_lambda_function.api.arn
}

output "function_name" {
  description = "Lambda function name."
  value       = aws_lambda_function.api.function_name
}

output "invoke_arn" {
  description = "Lambda invoke ARN (for API Gateway integration later)."
  value       = aws_lambda_function.api.invoke_arn
}

output "version" {
  description = "Published Lambda version."
  value       = aws_lambda_function.api.version
}
