output "api_id" {
  description = "HTTP API identifier."
  value       = aws_apigatewayv2_api.http.id
}

output "api_endpoint" {
  description = "HTTP API endpoint URL."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "execution_arn" {
  description = "HTTP API execution ARN (for Lambda permissions later)."
  value       = aws_apigatewayv2_api.http.execution_arn
}
