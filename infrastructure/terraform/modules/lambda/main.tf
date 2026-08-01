data "archive_file" "package" {
  type        = "zip"
  source_dir  = var.package_source_dir
  output_path = "${path.module}/build/${var.function_name}.zip"
}

resource "aws_lambda_function" "api" {
  function_name = var.function_name
  description   = var.description
  role          = var.execution_role_arn
  handler       = var.handler
  runtime       = var.runtime
  architectures = var.architectures
  timeout       = var.timeout
  memory_size   = var.memory_size
  publish       = true

  filename         = data.archive_file.package.output_path
  source_code_hash = data.archive_file.package.output_base64sha256

  environment {
    variables = var.environment_variables
  }

  # Use the log group provisioned in SCRUM-25 instead of letting Lambda invent one.
  logging_config {
    log_format = "Text"
    log_group  = var.log_group_name
  }

  tags = var.tags
}
