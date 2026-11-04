output "user_pool_id" {
  description = "Operator Cognito user pool ID (public SPA configuration)."
  value       = aws_cognito_user_pool.operators.id
}

output "user_pool_arn" {
  description = "Operator Cognito user pool ARN."
  value       = aws_cognito_user_pool.operators.arn
}

output "user_pool_client_id" {
  description = "Public SPA app client ID (no secret)."
  value       = aws_cognito_user_pool_client.spa.id
}

output "user_pool_endpoint" {
  description = "Cognito IdP endpoint hostname for the pool."
  value       = aws_cognito_user_pool.operators.endpoint
}
