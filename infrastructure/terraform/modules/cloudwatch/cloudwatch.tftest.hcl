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
