resource "aws_apigatewayv2_api" "http" {
  name          = var.api_name
  protocol_type = "HTTP"
  description   = "IncidentLens AI HTTP API (proxy to Fastify Lambda)."

  # Credentials stay disabled so local origins can be listed explicitly (no '*' + credentials).
  cors_configuration {
    allow_headers = ["content-type", "authorization", "x-request-id"]
    allow_methods = ["GET", "POST", "PATCH", "OPTIONS"]
    allow_origins = var.cors_allow_origins
    max_age       = 300
  }

  tags = var.tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.lambda_invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
  timeout_milliseconds   = var.integration_timeout_milliseconds
}

# Catch-all: Fastify owns path matching and 404s for all application routes.
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

locals {
  # One JSON object per request. Only edge metadata — no bodies, auth headers, or cookies.
  access_log_format = jsonencode({
    requestId               = "$context.requestId"
    extendedRequestId       = "$context.extendedRequestId"
    requestTime             = "$context.requestTime"
    httpMethod              = "$context.httpMethod"
    routeKey                = "$context.routeKey"
    path                    = "$context.path"
    protocol                = "$context.protocol"
    status                  = "$context.status"
    responseLength          = "$context.responseLength"
    responseLatency         = "$context.responseLatency"
    integrationLatency      = "$context.integrationLatency"
    integrationStatus       = "$context.integrationStatus"
    integrationErrorMessage = "$context.integrationErrorMessage"
    sourceIp                = "$context.identity.sourceIp"
    userAgent               = "$context.identity.userAgent"
  })
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  # Explicit throttle limits are required: leaving them unset inside
  # default_route_settings makes the AWS provider send 0/0 → every request 429s.
  default_route_settings {
    detailed_metrics_enabled = false
    throttling_burst_limit   = 100
    throttling_rate_limit    = 50
  }

  access_log_settings {
    destination_arn = var.access_log_group_arn
    format          = local.access_log_format
  }

  tags = var.tags
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  # Scope invoke permission to this API only (not account-wide).
  source_arn = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
