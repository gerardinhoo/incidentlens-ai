# Root wiring tests use mocked AWS so they never contact a real account.
mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:user/terraform-test"
      user_id    = "AIDAEXAMPLE"
      id         = "123456789012"
    }
  }

  # mock_provider replaces local policy-document data sources; supply valid JSON objects.
  mock_data "aws_iam_policy_document" {
    defaults = {
      id   = "mock-policy-document"
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"}}]}"
    }
  }

  mock_resource "aws_dynamodb_table" {
    defaults = {
      arn  = "arn:aws:dynamodb:us-east-1:123456789012:table/incidentlens-dev-incidents"
      id   = "incidentlens-dev-incidents"
      name = "incidentlens-dev-incidents"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/incidentlens-dev-api"
      id  = "/aws/lambda/incidentlens-dev-api"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn  = "arn:aws:iam::123456789012:role/incidentlens-dev-api-lambda-role"
      id   = "incidentlens-dev-api-lambda-role"
      name = "incidentlens-dev-api-lambda-role"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn           = "arn:aws:lambda:us-east-1:123456789012:function:incidentlens-dev-api"
      invoke_arn    = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789012:function:incidentlens-dev-api/invocations"
      function_name = "incidentlens-dev-api"
      version       = "1"
    }
  }

  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      id            = "apiidmock0001"
      api_endpoint  = "https://apiidmock0001.execute-api.us-east-1.amazonaws.com"
      execution_arn = "arn:aws:execute-api:us-east-1:123456789012:apiidmock0001"
    }
  }

  mock_resource "aws_apigatewayv2_integration" {
    defaults = {
      id = "integrationmock01"
    }
  }

  mock_resource "aws_apigatewayv2_stage" {
    defaults = {
      invoke_url = "https://apiidmock0001.execute-api.us-east-1.amazonaws.com"
      name       = "$default"
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      id     = "incidentlens-dev-artifacts-123456789012"
      arn    = "arn:aws:s3:::incidentlens-dev-artifacts-123456789012"
      bucket = "incidentlens-dev-artifacts-123456789012"
    }
  }
}

run "module_wiring_and_outputs" {
  command = plan

  variables {
    project_name              = "incidentlens"
    environment               = "dev"
    aws_region                = "us-east-1"
    lambda_package_source_dir = "./tests/fixtures/lambda-package"
  }

  assert {
    condition     = module.lambda.function_name == "incidentlens-dev-api"
    error_message = "Lambda function name must use project-environment prefix"
  }

  assert {
    condition     = module.dynamodb.table_name == "incidentlens-dev-incidents"
    error_message = "DynamoDB table name must use project-environment prefix"
  }

  assert {
    condition     = module.iam.role_name == "incidentlens-dev-api-lambda-role"
    error_message = "IAM role name must use project-environment prefix"
  }

  assert {
    condition     = module.cloudwatch.lambda_log_group_name == "/aws/lambda/incidentlens-dev-api"
    error_message = "Lambda log group naming must match function"
  }

  assert {
    condition     = module.cloudwatch.access_log_group_name == "/aws/apigateway/incidentlens-dev-api-access"
    error_message = "Access log group naming must match API access convention"
  }

  assert {
    condition     = module.s3.bucket_name == "incidentlens-dev-artifacts-123456789012"
    error_message = "Artifact bucket must include mocked account id suffix"
  }

  assert {
    condition     = module.api_gateway.stage_name == "$default"
    error_message = "API Gateway stage must be $default"
  }

  assert {
    condition     = output.incidents_table_name == "incidentlens-dev-incidents"
    error_message = "Output incidents_table_name must be exposed"
  }

  assert {
    condition     = output.lambda_function_name == "incidentlens-dev-api"
    error_message = "Output lambda_function_name must be exposed"
  }

  assert {
    condition     = output.lambda_execution_role_name == "incidentlens-dev-api-lambda-role"
    error_message = "Output lambda_execution_role_name must be exposed"
  }

  assert {
    condition     = output.api_stage_name == "$default"
    error_message = "Output api_stage_name must be $default"
  }

  assert {
    condition     = output.lambda_log_group_name == "/aws/lambda/incidentlens-dev-api"
    error_message = "Output lambda_log_group_name must be exposed"
  }

  assert {
    condition     = output.api_access_log_group_name == "/aws/apigateway/incidentlens-dev-api-access"
    error_message = "Output api_access_log_group_name must be exposed"
  }

  assert {
    condition     = output.artifact_bucket_name == "incidentlens-dev-artifacts-123456789012"
    error_message = "Output artifact_bucket_name must be exposed"
  }

  assert {
    condition = (
      local.common_tags["Project"] == "IncidentLensAI" &&
      local.common_tags["Environment"] == "dev" &&
      local.common_tags["ManagedBy"] == "Terraform"
    )
    error_message = "Common project/environment tags must be set consistently"
  }
}
