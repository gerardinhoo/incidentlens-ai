resource "aws_apigatewayv2_api" "http" {
  name          = var.api_name
  protocol_type = "HTTP"
  description   = "IncidentLens AI HTTP API (proxy to Fastify Lambda)."

  # Credentials stay disabled (no '*' + credentials). Shared stack is CloudFront-only.
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

resource "aws_apigatewayv2_authorizer" "cognito" {
  count = var.enable_jwt ? 1 : 0

  api_id           = aws_apigatewayv2_api.http.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.api_name}-jwt"

  jwt_configuration {
    audience = compact([var.jwt_audience])
    issuer   = var.jwt_issuer
  }
}

# Public liveness path so smoke tests and load balancers do not need a token.
resource "aws_apigatewayv2_route" "health" {
  count = var.enable_jwt ? 1 : 0

  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /health"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "NONE"
}

# Catch-all: Fastify owns path matching and 404s. JWT when Cognito is wired.
resource "aws_apigatewayv2_route" "default" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "$default"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = var.enable_jwt ? "JWT" : "NONE"
  authorizer_id      = var.enable_jwt ? aws_apigatewayv2_authorizer.cognito[0].id : null
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
