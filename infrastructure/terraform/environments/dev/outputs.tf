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

output "api_stage_name" {
  description = "API Gateway HTTP API stage name."
  value       = module.api_gateway.stage_name
}

output "api_invoke_url" {
  description = "Public HTTPS base URL for smoke testing the Fastify API."
  value       = module.api_gateway.invoke_url
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

output "lambda_log_group_name" {
  description = "API Lambda / Fastify application CloudWatch log group name."
  value       = module.cloudwatch.lambda_log_group_name
}

output "lambda_log_group_arn" {
  description = "API Lambda / Fastify application CloudWatch log group ARN."
  value       = module.cloudwatch.lambda_log_group_arn
}

output "api_access_log_group_name" {
  description = "API Gateway HTTP API access log group name."
  value       = module.cloudwatch.access_log_group_name
}

output "api_access_log_group_arn" {
  description = "API Gateway HTTP API access log group ARN."
  value       = module.cloudwatch.access_log_group_arn
}

# Backwards-compatible aliases (same as lambda log group).
output "api_log_group_name" {
  description = "Alias for lambda_log_group_name."
  value       = module.cloudwatch.lambda_log_group_name
}

output "api_log_group_arn" {
  description = "Alias for lambda_log_group_arn."
  value       = module.cloudwatch.lambda_log_group_arn
}

output "processor_lambda_function_name" {
  description = "Incident processor Lambda function name."
  value       = module.processor_lambda.function_name
}

output "processor_lambda_function_arn" {
  description = "Incident processor Lambda function ARN."
  value       = module.processor_lambda.function_arn
}

output "processor_lambda_invoke_arn" {
  description = "Incident processor Lambda invoke ARN."
  value       = module.processor_lambda.invoke_arn
}

output "processor_log_group_name" {
  description = "Processor Lambda CloudWatch log group name."
  value       = module.cloudwatch.processor_log_group_name
}

output "processor_log_group_arn" {
  description = "Processor Lambda CloudWatch log group ARN."
  value       = module.cloudwatch.processor_log_group_arn
}

output "processor_execution_role_arn" {
  description = "Processor Lambda execution role ARN."
  value       = module.iam_processor.role_arn
}

output "processor_execution_role_name" {
  description = "Processor Lambda execution role name."
  value       = module.iam_processor.role_name
}

output "api_error_subscription_filter_name" {
  description = "CloudWatch Logs subscription filter name (API → processor)."
  value       = module.api_log_subscription.filter_name
}

output "subscribed_log_group_name" {
  description = "Source log group for the API → processor subscription."
  value       = module.api_log_subscription.log_group_name
}

output "processor_subscription_destination_arn" {
  description = "Processor Lambda ARN used as the subscription destination."
  value       = module.api_log_subscription.destination_arn
}

output "sns_incident_topic_arn" {
  description = "SNS topic ARN for high/critical incident notifications."
  value       = module.sns_incidents.topic_arn
}

output "sns_incident_topic_name" {
  description = "SNS topic name for incident notifications."
  value       = module.sns_incidents.topic_name
}

output "sns_notification_email_subscription_arn" {
  description = "Optional email subscription ARN (PendingConfirmation until confirmed)."
  value       = module.sns_incidents.email_subscription_arn
}
