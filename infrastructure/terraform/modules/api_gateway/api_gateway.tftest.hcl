mock_provider "aws" {
  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      id            = "apiidmock0001"
      api_endpoint  = "https://apiidmock0001.execute-api.us-east-1.amazonaws.com"
      execution_arn = "arn:aws:execute-api:us-east-1:123456789012:apiidmock0001"
      arn           = "arn:aws:apigateway:us-east-1::/apis/apiidmock0001"
    }
  }

  mock_resource "aws_apigatewayv2_integration" {
    defaults = {
      id = "integrationmock01"
    }
  }

  mock_resource "aws_apigatewayv2_route" {
    defaults = {
      id = "routemock000001"
    }
  }

  mock_resource "aws_apigatewayv2_stage" {
    defaults = {
      id         = "stagemock000001"
      invoke_url = "https://apiidmock0001.execute-api.us-east-1.amazonaws.com"
      arn        = "arn:aws:apigateway:us-east-1::/apis/apiidmock0001/stages/$default"
    }
  }

  mock_resource "aws_apigatewayv2_authorizer" {
    defaults = {
      id   = "authorizermock01"
      name = "incidentlens-dev-http-api-jwt"
    }
  }
}

run "http_api_proxy_contract" {
  command = plan

  variables {
    api_name             = "incidentlens-dev-http-api"
    lambda_invoke_arn    = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789012:function:incidentlens-dev-api/invocations"
    lambda_function_name = "incidentlens-dev-api"
    access_log_group_arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/apigateway/incidentlens-dev-api-access"
  }

  assert {
    condition     = aws_apigatewayv2_api.http.protocol_type == "HTTP"
    error_message = "API protocol must be HTTP (not REST)"
  }

  assert {
    condition     = aws_apigatewayv2_integration.lambda.integration_type == "AWS_PROXY"
    error_message = "Integration must be AWS_PROXY"
  }

  assert {
    condition     = aws_apigatewayv2_integration.lambda.payload_format_version == "2.0"
    error_message = "Payload format must be 2.0"
  }

  assert {
    condition     = aws_apigatewayv2_integration.lambda.integration_method == "POST"
    error_message = "Integration method must be POST"
  }

  assert {
    condition     = aws_apigatewayv2_route.default.route_key == "$default"
    error_message = "Catch-all route must be $default"
  }

  assert {
    condition     = startswith(aws_apigatewayv2_route.default.target, "integrations/")
    error_message = "$default route must target the Lambda integration"
  }

  assert {
    condition     = aws_apigatewayv2_stage.default.name == "$default"
    error_message = "Stage name must be $default"
  }

  assert {
    condition     = aws_apigatewayv2_stage.default.auto_deploy == true
    error_message = "Stage auto_deploy must be enabled"
  }

  assert {
    condition     = aws_lambda_permission.api_gateway.principal == "apigateway.amazonaws.com"
    error_message = "Invoke permission principal must be API Gateway"
  }

  assert {
    condition     = aws_lambda_permission.api_gateway.action == "lambda:InvokeFunction"
    error_message = "Invoke permission action must be lambda:InvokeFunction"
  }

  assert {
    condition = (
      contains(aws_apigatewayv2_api.http.cors_configuration[0].allow_methods, "GET") &&
      contains(aws_apigatewayv2_api.http.cors_configuration[0].allow_methods, "POST") &&
      contains(aws_apigatewayv2_api.http.cors_configuration[0].allow_methods, "PATCH") &&
      contains(aws_apigatewayv2_api.http.cors_configuration[0].allow_methods, "OPTIONS")
    )
    error_message = "CORS must allow GET, POST, PATCH, and OPTIONS"
  }

  assert {
    condition = (
      contains(aws_apigatewayv2_api.http.cors_configuration[0].allow_headers, "content-type")
    )
    error_message = "CORS must allow content-type (required for JSON PATCH/POST bodies)"
  }

  assert {
    condition = (
      length(var.cors_allow_origins) == 0 &&
      !contains(var.cors_allow_origins, "*")
    )
    error_message = "Module default CORS origins must be empty (env appends CloudFront); no wildcard"
  }

  assert {
    condition = (
      !contains(aws_apigatewayv2_api.http.cors_configuration[0].allow_origins, "*") ||
      try(aws_apigatewayv2_api.http.cors_configuration[0].allow_credentials, false) == false
    )
    error_message = "Must not combine wildcard origins with credentials"
  }

  assert {
    condition     = aws_apigatewayv2_stage.default.access_log_settings[0].destination_arn == "arn:aws:logs:us-east-1:123456789012:log-group:/aws/apigateway/incidentlens-dev-api-access"
    error_message = "Access logs must point at the access log group ARN"
  }

  assert {
    condition = (
      strcontains(aws_apigatewayv2_stage.default.access_log_settings[0].format, "requestId") &&
      strcontains(aws_apigatewayv2_stage.default.access_log_settings[0].format, "status")
    )
    error_message = "Access log format must include requestId and status"
  }

  assert {
    condition     = aws_apigatewayv2_route.default.authorization_type == "NONE"
    error_message = "Without enable_jwt, $default must remain unauthenticated"
  }
}

run "http_api_jwt_protects_default_health_public" {
  command = plan

  variables {
    api_name             = "incidentlens-dev-http-api"
    lambda_invoke_arn    = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789012:function:incidentlens-dev-api/invocations"
    lambda_function_name = "incidentlens-dev-api"
    access_log_group_arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/apigateway/incidentlens-dev-api-access"
    enable_jwt           = true
    jwt_issuer           = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_MockPool01"
    jwt_audience         = "mockclientid1234567890"
  }

  assert {
    condition     = aws_apigatewayv2_route.default.authorization_type == "JWT"
    error_message = "$default must require JWT when Cognito issuer is configured"
  }

  assert {
    condition     = length(aws_apigatewayv2_authorizer.cognito) == 1
    error_message = "JWT authorizer must be created when enable_jwt is true"
  }

  assert {
    condition     = length(aws_apigatewayv2_route.health) == 1 && aws_apigatewayv2_route.health[0].route_key == "GET /health"
    error_message = "GET /health must stay an explicit public route"
  }

  assert {
    condition     = aws_apigatewayv2_route.health[0].authorization_type == "NONE"
    error_message = "GET /health must not require JWT"
  }

  assert {
    condition = (
      length(aws_apigatewayv2_route.cors_preflight) == 3 &&
      aws_apigatewayv2_route.cors_preflight["OPTIONS /incidents"].authorization_type == "NONE" &&
      aws_apigatewayv2_route.cors_preflight["OPTIONS /incidents/{id}"].authorization_type == "NONE" &&
      aws_apigatewayv2_route.cors_preflight["OPTIONS /incidents/{id}/status"].authorization_type == "NONE" &&
      aws_apigatewayv2_route.cors_preflight["OPTIONS /incidents/{id}/assignee"].authorization_type == "NONE" &&
      startswith(aws_apigatewayv2_route.cors_preflight["OPTIONS /incidents"].target, "integrations/") &&
      startswith(aws_apigatewayv2_route.cors_preflight["OPTIONS /incidents/{id}"].target, "integrations/")
    )
    error_message = "Exact OPTIONS /incidents routes must stay public and target Lambda when JWT is enabled"
  }

  assert {
    condition     = contains(aws_apigatewayv2_api.http.cors_configuration[0].allow_headers, "authorization")
    error_message = "CORS must allow authorization for browser Bearer tokens"
  }
}
