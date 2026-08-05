# Logs-only IAM role — dummy AWS provider so CI needs no credentials.
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
}

run "processor_logs_only_policy" {
  command = plan

  variables {
    role_name     = "incidentlens-dev-processor-role"
    log_group_arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/incidentlens-dev-processor"
  }

  assert {
    condition = (
      strcontains(data.aws_iam_policy_document.logs_only.json, "logs:CreateLogStream") &&
      strcontains(data.aws_iam_policy_document.logs_only.json, "logs:PutLogEvents")
    )
    error_message = "Policy must allow CreateLogStream and PutLogEvents"
  }

  assert {
    condition     = strcontains(data.aws_iam_policy_document.logs_only.json, "/aws/lambda/incidentlens-dev-processor")
    error_message = "Log access must be scoped to the processor log group"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.logs_only.json, "bedrock")
    error_message = "Must not contain Bedrock permissions"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.logs_only.json, "sns:")
    error_message = "Must not contain SNS permissions"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.logs_only.json, "dynamodb:")
    error_message = "Must not contain DynamoDB permissions in this story"
  }

  assert {
    condition     = aws_iam_role.lambda.name == "incidentlens-dev-processor-role"
    error_message = "Role name must match the supplied variable"
  }
}
