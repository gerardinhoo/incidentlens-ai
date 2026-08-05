# CloudWatch Logs invokes Lambda via a resource-based permission on the function.
# The processor execution role trust policy is NOT involved.
resource "aws_lambda_permission" "allow_cloudwatch_logs" {
  statement_id  = "AllowCloudWatchLogsInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.destination_lambda_function_name
  principal     = "logs.${var.aws_region}.amazonaws.com"
  # Scope to this log group (and its streams). Wildcard ARN is required by AWS.
  source_arn = "${var.log_group_arn}:*"
}

resource "aws_cloudwatch_log_subscription_filter" "api_to_processor" {
  name            = var.filter_name
  log_group_name  = var.log_group_name
  filter_pattern  = var.filter_pattern
  destination_arn = var.destination_lambda_arn

  # Subscription create validates destination permission; create permission first.
  depends_on = [aws_lambda_permission.allow_cloudwatch_logs]
}
