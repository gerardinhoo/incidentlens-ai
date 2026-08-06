# Processor IAM role — dummy AWS provider so CI needs no credentials.
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
}

run "processor_logs_only_without_table" {
  command = plan

  variables {
    role_name     = "incidentlens-dev-processor-role"
    log_group_arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/incidentlens-dev-processor"
  }

  assert {
    condition = (
      strcontains(data.aws_iam_policy_document.processor.json, "logs:CreateLogStream") &&
      strcontains(data.aws_iam_policy_document.processor.json, "logs:PutLogEvents")
    )
    error_message = "Policy must allow CreateLogStream and PutLogEvents"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.processor.json, "dynamodb:")
    error_message = "Without incidents_table_arn, policy must not contain DynamoDB"
  }
}

run "processor_put_item_when_table_provided" {
  command = plan

  variables {
    role_name           = "incidentlens-dev-processor-role"
    log_group_arn       = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/incidentlens-dev-processor"
    incidents_table_arn = "arn:aws:dynamodb:us-east-1:123456789012:table/incidentlens-dev-incidents"
  }

  assert {
    condition     = strcontains(data.aws_iam_policy_document.processor.json, "dynamodb:PutItem")
    error_message = "Policy must allow dynamodb:PutItem when table ARN is set"
  }

  assert {
    condition     = strcontains(data.aws_iam_policy_document.processor.json, "table/incidentlens-dev-incidents")
    error_message = "PutItem must be scoped to the incidents table ARN"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.processor.json, "dynamodb:*")
    error_message = "Must not grant dynamodb:*"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.processor.json, "dynamodb:GetItem")
    error_message = "Must not grant GetItem"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.processor.json, "dynamodb:Scan")
    error_message = "Must not grant Scan"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.processor.json, "dynamodb:UpdateItem")
    error_message = "Must not grant UpdateItem"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.processor.json, "dynamodb:DeleteItem")
    error_message = "Must not grant DeleteItem"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.processor.json, "bedrock")
    error_message = "Must not contain Bedrock permissions"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.processor.json, "sns:")
    error_message = "Must not contain SNS permissions"
  }
}
