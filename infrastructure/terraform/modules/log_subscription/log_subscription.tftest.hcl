# Dummy AWS provider so CI runners without credentials can still terraform test.
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
}

run "subscription_filter_contract" {
  command = plan

  variables {
    filter_name                      = "incidentlens-dev-api-incident-candidate"
    log_group_name                   = "/aws/lambda/incidentlens-dev-api"
    log_group_arn                    = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/incidentlens-dev-api"
    destination_lambda_function_name = "incidentlens-dev-processor"
    destination_lambda_arn           = "arn:aws:lambda:us-east-1:123456789012:function:incidentlens-dev-processor"
    filter_pattern                   = "{ $.eventType = \"incident_candidate\" }"
    aws_region                       = "us-east-1"
  }

  assert {
    condition     = aws_cloudwatch_log_subscription_filter.api_to_processor.log_group_name == "/aws/lambda/incidentlens-dev-api"
    error_message = "Subscription source must be the API Lambda log group"
  }

  assert {
    condition     = aws_cloudwatch_log_subscription_filter.api_to_processor.log_group_name != "/aws/lambda/incidentlens-dev-processor"
    error_message = "Must not subscribe the processor log group"
  }

  assert {
    condition     = aws_cloudwatch_log_subscription_filter.api_to_processor.log_group_name != "/aws/apigateway/incidentlens-dev-api-access"
    error_message = "Must not subscribe the API Gateway access log group"
  }

  assert {
    condition     = aws_cloudwatch_log_subscription_filter.api_to_processor.destination_arn == "arn:aws:lambda:us-east-1:123456789012:function:incidentlens-dev-processor"
    error_message = "Destination must be the processor Lambda ARN"
  }

  assert {
    condition = (
      aws_cloudwatch_log_subscription_filter.api_to_processor.filter_pattern != "" &&
      strcontains(aws_cloudwatch_log_subscription_filter.api_to_processor.filter_pattern, "incident_candidate")
    )
    error_message = "Filter pattern must be non-empty and match incident_candidate"
  }

  assert {
    condition     = aws_lambda_permission.allow_cloudwatch_logs.action == "lambda:InvokeFunction"
    error_message = "Permission action must be lambda:InvokeFunction"
  }

  assert {
    condition     = aws_lambda_permission.allow_cloudwatch_logs.principal == "logs.us-east-1.amazonaws.com"
    error_message = "Principal must be the regional CloudWatch Logs service"
  }

  assert {
    condition     = aws_lambda_permission.allow_cloudwatch_logs.function_name == "incidentlens-dev-processor"
    error_message = "Permission must target the processor function"
  }

  assert {
    condition = (
      aws_lambda_permission.allow_cloudwatch_logs.source_arn == "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/incidentlens-dev-api:*"
    )
    error_message = "source_arn must be scoped to the API log group with stream wildcard"
  }

  assert {
    condition     = aws_lambda_permission.allow_cloudwatch_logs.source_arn != "*"
    error_message = "Permission must not use a wildcard source ARN"
  }

  assert {
    condition     = aws_lambda_permission.allow_cloudwatch_logs.principal != "*"
    error_message = "Permission must not use a wildcard principal"
  }
}
