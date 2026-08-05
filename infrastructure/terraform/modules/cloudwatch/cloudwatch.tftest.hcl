mock_provider "aws" {
  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/incidentlens-dev-api"
      id  = "/aws/lambda/incidentlens-dev-api"
    }
  }
}

run "log_groups_contract" {
  command = plan

  variables {
    lambda_log_group_name = "/aws/lambda/incidentlens-dev-api"
    access_log_group_name = "/aws/apigateway/incidentlens-dev-api-access"
    retention_in_days     = 30
  }

  assert {
    condition     = aws_cloudwatch_log_group.api.name == "/aws/lambda/incidentlens-dev-api"
    error_message = "Lambda log group must follow /aws/lambda/<function> naming"
  }

  assert {
    condition     = aws_cloudwatch_log_group.api_access.name == "/aws/apigateway/incidentlens-dev-api-access"
    error_message = "API Gateway access log group must be separate and follow /aws/apigateway/... naming"
  }

  assert {
    condition     = aws_cloudwatch_log_group.api.name != aws_cloudwatch_log_group.api_access.name
    error_message = "Lambda and API access log groups must be distinct"
  }

  assert {
    condition     = aws_cloudwatch_log_group.api.retention_in_days == 30
    error_message = "Retention must honor the configured value"
  }

  assert {
    condition     = aws_cloudwatch_log_group.api.retention_in_days > 0 && aws_cloudwatch_log_group.api.retention_in_days <= 365
    error_message = "Default retention must be bounded (not indefinite)"
  }

  assert {
    condition     = aws_cloudwatch_log_group.api_access.retention_in_days == aws_cloudwatch_log_group.api.retention_in_days
    error_message = "Both log groups should share the configured retention"
  }

  assert {
    condition     = length(aws_cloudwatch_log_group.processor) == 0
    error_message = "Processor log group must not be created when processor_log_group_name is null"
  }
}

run "processor_log_group_optional" {
  command = plan

  variables {
    lambda_log_group_name    = "/aws/lambda/incidentlens-dev-api"
    access_log_group_name    = "/aws/apigateway/incidentlens-dev-api-access"
    processor_log_group_name = "/aws/lambda/incidentlens-dev-processor"
    retention_in_days        = 30
  }

  assert {
    condition     = length(aws_cloudwatch_log_group.processor) == 1
    error_message = "Processor log group must be created when name is provided"
  }

  assert {
    condition     = aws_cloudwatch_log_group.processor[0].name == "/aws/lambda/incidentlens-dev-processor"
    error_message = "Processor log group naming must match /aws/lambda/<function>"
  }

  assert {
    condition     = aws_cloudwatch_log_group.processor[0].name != aws_cloudwatch_log_group.api.name
    error_message = "Processor log group must be distinct from the API log group"
  }
}

run "retention_is_configurable" {
  command = plan

  variables {
    lambda_log_group_name = "/aws/lambda/incidentlens-dev-api"
    access_log_group_name = "/aws/apigateway/incidentlens-dev-api-access"
    retention_in_days     = 14
  }

  assert {
    condition     = aws_cloudwatch_log_group.api.retention_in_days == 14
    error_message = "Retention must be configurable via retention_in_days"
  }
}
