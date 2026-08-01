data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    sid     = "AllowLambdaAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "api_lambda" {
  statement {
    sid    = "WriteApiLambdaLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      var.api_log_group_arn,
      "${var.api_log_group_arn}:*",
    ]
  }

  statement {
    sid    = "IncidentsTableAccess"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:Scan",
    ]
    resources = [
      var.incidents_table_arn,
    ]
  }
}

resource "aws_iam_role" "api_lambda" {
  name               = var.role_name
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = var.tags
}

resource "aws_iam_role_policy" "api_lambda" {
  name   = "${var.role_name}-policy"
  role   = aws_iam_role.api_lambda.id
  policy = data.aws_iam_policy_document.api_lambda.json
}
