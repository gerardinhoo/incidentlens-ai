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

data "aws_iam_policy_document" "processor" {
  statement {
    sid    = "WriteLambdaLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      var.log_group_arn,
      "${var.log_group_arn}:*",
    ]
  }

  dynamic "statement" {
    for_each = var.incidents_table_arn != null ? [var.incidents_table_arn] : []
    content {
      sid    = "PutIncidents"
      effect = "Allow"
      actions = [
        "dynamodb:PutItem",
      ]
      resources = [
        statement.value,
      ]
    }
  }

  dynamic "statement" {
    for_each = length(var.bedrock_invoke_resource_arns) > 0 ? [1] : []
    content {
      sid    = "InvokeBedrockModels"
      effect = "Allow"
      actions = [
        "bedrock:InvokeModel",
      ]
      resources = var.bedrock_invoke_resource_arns
    }
  }

  dynamic "statement" {
    for_each = var.sns_incident_topic_arn != null && trimspace(var.sns_incident_topic_arn) != "" ? [var.sns_incident_topic_arn] : []
    content {
      sid    = "PublishIncidentNotifications"
      effect = "Allow"
      actions = [
        "sns:Publish",
      ]
      resources = [
        statement.value,
      ]
    }
  }
}

# Backwards-compatible alias used by existing tests / docs.
data "aws_iam_policy_document" "logs_only" {
  source_policy_documents = [data.aws_iam_policy_document.processor.json]
}

resource "aws_iam_role" "lambda" {
  name               = var.role_name
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "lambda" {
  name   = "${var.role_name}-policy"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.processor.json
}
