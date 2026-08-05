# Resource address kept as "api" so existing Terraform state is not replaced.
resource "aws_cloudwatch_log_group" "api" {
  name              = var.lambda_log_group_name
  retention_in_days = var.retention_in_days

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = var.access_log_group_name
  retention_in_days = var.retention_in_days

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "processor" {
  count = var.processor_log_group_name != null ? 1 : 0

  name              = var.processor_log_group_name
  retention_in_days = var.retention_in_days

  tags = var.tags
}

# Allow API Gateway to write access logs to the dedicated log group.
data "aws_iam_policy_document" "api_gateway_access_logs" {
  statement {
    sid    = "AllowAPIGatewayAccessLogs"
    effect = "Allow"

    principals {
      type = "Service"
      identifiers = [
        "apigateway.amazonaws.com",
        "delivery.logs.amazonaws.com",
      ]
    }

    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = [
      "${aws_cloudwatch_log_group.api_access.arn}:*",
    ]
  }
}

resource "aws_cloudwatch_log_resource_policy" "api_gateway_access" {
  # Policy names: alphanumeric and [_+=,.@-] — derive a stable short name.
  policy_name     = "incidentlens-apigw-access-logs"
  policy_document = data.aws_iam_policy_document.api_gateway_access_logs.json
}
