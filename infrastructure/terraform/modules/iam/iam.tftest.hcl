# aws_iam_policy_document is evaluated locally (no AWS API). Avoid mocking it
# so assertions validate the real least-privilege document.
# Resources are planned only; no apply / no live AWS calls.

run "lambda_execution_policy_least_privilege" {
  command = plan

  variables {
    role_name           = "incidentlens-dev-api-lambda-role"
    api_log_group_arn   = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/incidentlens-dev-api"
    incidents_table_arn = "arn:aws:dynamodb:us-east-1:123456789012:table/incidentlens-dev-incidents"
  }

  assert {
    condition = (
      strcontains(data.aws_iam_policy_document.api_lambda.json, "logs:CreateLogStream") &&
      strcontains(data.aws_iam_policy_document.api_lambda.json, "logs:PutLogEvents")
    )
    error_message = "Policy must allow logs:CreateLogStream and logs:PutLogEvents"
  }

  assert {
    condition = (
      strcontains(data.aws_iam_policy_document.api_lambda.json, "dynamodb:PutItem") &&
      strcontains(data.aws_iam_policy_document.api_lambda.json, "dynamodb:GetItem") &&
      strcontains(data.aws_iam_policy_document.api_lambda.json, "dynamodb:Scan")
    )
    error_message = "Policy must allow dynamodb PutItem, GetItem, and Scan"
  }

  assert {
    condition     = strcontains(data.aws_iam_policy_document.api_lambda.json, "arn:aws:dynamodb:us-east-1:123456789012:table/incidentlens-dev-incidents")
    error_message = "DynamoDB access must be scoped to the incidents table ARN"
  }

  assert {
    condition     = strcontains(data.aws_iam_policy_document.api_lambda.json, "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/incidentlens-dev-api")
    error_message = "Log access must be scoped to the API Lambda log group"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.api_lambda.json, "AdministratorAccess")
    error_message = "Must not reference AdministratorAccess"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.api_lambda.json, "\"iam:*\"")
    error_message = "Must not grant iam:*"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.api_lambda.json, "\"dynamodb:*\"")
    error_message = "Must not grant dynamodb:*"
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.api_lambda.json, "\"logs:*\"")
    error_message = "Must not grant logs:*"
  }

  assert {
    condition = anytrue([
      for s in jsondecode(data.aws_iam_policy_document.api_lambda.json).Statement :
      contains(flatten([s.Action]), "dynamodb:PutItem")
    ])
    error_message = "Decoded policy must include dynamodb:PutItem action"
  }

  assert {
    condition     = strcontains(data.aws_iam_policy_document.lambda_assume_role.json, "lambda.amazonaws.com")
    error_message = "Assume-role policy must trust lambda.amazonaws.com"
  }

  assert {
    condition     = aws_iam_role.api_lambda.name == "incidentlens-dev-api-lambda-role"
    error_message = "Role name must match the supplied variable"
  }
}
