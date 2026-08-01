output "api_id" {
  description = "HTTP API identifier."
  value       = aws_apigatewayv2_api.http.id
}

output "api_endpoint" {
  description = "HTTP API endpoint URL."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "execution_arn" {
  description = "HTTP API execution ARN."
  value       = aws_apigatewayv2_api.http.execution_arn
}

output "stage_name" {
  description = "Deployed HTTP API stage name."
  value       = aws_apigatewayv2_stage.default.name
}

output "invoke_url" {
  description = "Base HTTPS URL for smoke testing ($default stage has no path prefix)."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "integration_id" {
  description = "Lambda proxy integration ID."
  value       = aws_apigatewayv2_integration.lambda.id
}

output "route_key" {
  description = "Catch-all route key."
  value       = aws_apigatewayv2_route.default.route_key
}
