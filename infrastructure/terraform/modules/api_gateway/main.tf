resource "aws_apigatewayv2_api" "http" {
  name          = var.api_name
  protocol_type = "HTTP"
  description   = "IncidentLens AI HTTP API (routes and integrations added in a later story)."

  # Credentials are not enabled with wildcard origins.
  cors_configuration {
    allow_headers = ["content-type", "x-request-id", "authorization"]
    allow_methods = ["GET", "HEAD", "OPTIONS", "PATCH", "POST"]
    allow_origins = ["*"]
    max_age       = 300
  }

  tags = var.tags
}
