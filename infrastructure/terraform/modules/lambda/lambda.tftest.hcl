mock_provider "aws" {
  mock_resource "aws_lambda_function" {
    defaults = {
      arn              = "arn:aws:lambda:us-east-1:123456789012:function:incidentlens-dev-api"
      invoke_arn       = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789012:function:incidentlens-dev-api/invocations"
      qualified_arn    = "arn:aws:lambda:us-east-1:123456789012:function:incidentlens-dev-api:1"
      version          = "1"
      last_modified    = "2026-01-01T00:00:00.000+0000"
      source_code_hash = "dGVzdGhhc2g="
      source_code_size = 1024
    }
  }
}

run "lambda_runtime_contract" {
  command = plan

  variables {
    function_name      = "incidentlens-dev-api"
    execution_role_arn = "arn:aws:iam::123456789012:role/incidentlens-dev-api-lambda-role"
    package_source_dir = "./tests/fixtures/lambda-package"
    log_group_name     = "/aws/lambda/incidentlens-dev-api"
    environment_variables = {
      NODE_ENV                 = "production"
      INCIDENT_REPOSITORY      = "dynamodb"
      DYNAMODB_INCIDENTS_TABLE = "incidentlens-dev-incidents"
      LOG_LEVEL                = "info"
    }
  }

  assert {
    condition     = aws_lambda_function.api.runtime == "nodejs22.x"
    error_message = "Lambda runtime must be nodejs22.x"
  }

  assert {
    condition     = contains(aws_lambda_function.api.architectures, "arm64")
    error_message = "Lambda architecture must include arm64"
  }

  assert {
    condition     = aws_lambda_function.api.handler == "apps/demo-api/src/lambda.handler"
    error_message = "Lambda handler must be apps/demo-api/src/lambda.handler"
  }

  assert {
    condition     = aws_lambda_function.api.timeout == 30
    error_message = "Lambda timeout must be 30 seconds"
  }

  assert {
    condition     = aws_lambda_function.api.memory_size == 512
    error_message = "Lambda memory must be 512 MB"
  }

  assert {
    condition     = aws_lambda_function.api.role == "arn:aws:iam::123456789012:role/incidentlens-dev-api-lambda-role"
    error_message = "Lambda must use the provided execution role ARN"
  }

  assert {
    condition = (
      contains(keys(aws_lambda_function.api.environment[0].variables), "NODE_ENV") &&
      contains(keys(aws_lambda_function.api.environment[0].variables), "INCIDENT_REPOSITORY") &&
      contains(keys(aws_lambda_function.api.environment[0].variables), "DYNAMODB_INCIDENTS_TABLE") &&
      contains(keys(aws_lambda_function.api.environment[0].variables), "LOG_LEVEL")
    )
    error_message = "Lambda must set NODE_ENV, INCIDENT_REPOSITORY, DYNAMODB_INCIDENTS_TABLE, and LOG_LEVEL"
  }

  assert {
    condition     = aws_lambda_function.api.environment[0].variables["INCIDENT_REPOSITORY"] == "dynamodb"
    error_message = "Deployed repository mode must be dynamodb"
  }

  assert {
    condition     = aws_lambda_function.api.filename != null && aws_lambda_function.api.filename != ""
    error_message = "Lambda must reference a packaged artifact filename"
  }

  assert {
    condition     = aws_lambda_function.api.source_code_hash != null && aws_lambda_function.api.source_code_hash != ""
    error_message = "Lambda must set source_code_hash from the package"
  }

  assert {
    condition     = aws_lambda_function.api.publish == true
    error_message = "Lambda publish should be enabled for versioned deploys"
  }
}
