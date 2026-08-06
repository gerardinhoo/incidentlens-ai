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

output "handler" {
  description = "Lambda handler entrypoint."
  value       = aws_lambda_function.api.handler
}

output "runtime" {
  description = "Lambda runtime."
  value       = aws_lambda_function.api.runtime
}

output "architectures" {
  description = "Lambda architectures."
  value       = aws_lambda_function.api.architectures
}

output "memory_size" {
  description = "Lambda memory size in MB."
  value       = aws_lambda_function.api.memory_size
}

output "timeout" {
  description = "Lambda timeout in seconds."
  value       = aws_lambda_function.api.timeout
}

output "execution_role_arn" {
  description = "IAM role ARN attached to the Lambda function."
  value       = aws_lambda_function.api.role
}

output "environment_variables" {
  description = "Lambda environment variables (non-secret config)."
  value       = aws_lambda_function.api.environment[0].variables
}
