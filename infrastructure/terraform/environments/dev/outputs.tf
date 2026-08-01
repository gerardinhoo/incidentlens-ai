output "aws_region" {
  description = "AWS region for the dev environment."
  value       = var.aws_region
}

output "api_id" {
  description = "API Gateway HTTP API ID."
  value       = module.api_gateway.api_id
}

output "api_endpoint" {
  description = "API Gateway HTTP API endpoint."
  value       = module.api_gateway.api_endpoint
}

output "api_execution_arn" {
  description = "API Gateway HTTP API execution ARN."
  value       = module.api_gateway.execution_arn
}

output "lambda_execution_role_arn" {
  description = "API Lambda execution role ARN."
  value       = module.iam.role_arn
}

output "lambda_execution_role_name" {
  description = "API Lambda execution role name."
  value       = module.iam.role_name
}

output "lambda_function_arn" {
  description = "API Lambda function ARN."
  value       = module.lambda.function_arn
}

output "lambda_function_name" {
  description = "API Lambda function name."
  value       = module.lambda.function_name
}

output "lambda_invoke_arn" {
  description = "API Lambda invoke ARN."
  value       = module.lambda.invoke_arn
}

output "lambda_version" {
  description = "Published API Lambda version."
  value       = module.lambda.version
}

output "incidents_table_name" {
  description = "Incidents DynamoDB table name."
  value       = module.dynamodb.table_name
}

output "incidents_table_arn" {
  description = "Incidents DynamoDB table ARN."
  value       = module.dynamodb.table_arn
}

output "artifact_bucket_name" {
  description = "Deployment artifact S3 bucket name."
  value       = module.s3.bucket_name
}

output "artifact_bucket_arn" {
  description = "Deployment artifact S3 bucket ARN."
  value       = module.s3.bucket_arn
}

output "api_log_group_name" {
  description = "Future API Lambda CloudWatch log group name."
  value       = module.cloudwatch.log_group_name
}

output "api_log_group_arn" {
  description = "Future API Lambda CloudWatch log group ARN."
  value       = module.cloudwatch.log_group_arn
}
