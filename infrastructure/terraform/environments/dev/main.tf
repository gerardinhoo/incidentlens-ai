data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = "IncidentLensAI"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  incidents_table_name = "${local.name_prefix}-incidents"
  api_function_name    = "${local.name_prefix}-api"
  api_log_group_name   = "/aws/lambda/${local.api_function_name}"
  api_name             = "${local.name_prefix}-http-api"
  lambda_role_name     = "${local.name_prefix}-api-lambda-role"
  # Account ID keeps the bucket name globally unique without hardcoding it.
  artifact_bucket_name = "${local.name_prefix}-artifacts-${data.aws_caller_identity.current.account_id}"
  # Built by `npm run build:lambda` before terraform plan/apply.
  lambda_package_dir = "${path.module}/../../../../dist/lambda"
}

module "dynamodb" {
  source = "../../modules/dynamodb"

  table_name                  = local.incidents_table_name
  deletion_protection_enabled = var.dynamodb_deletion_protection_enabled
  tags                        = local.common_tags
}

module "cloudwatch" {
  source = "../../modules/cloudwatch"

  log_group_name    = local.api_log_group_name
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

module "s3" {
  source = "../../modules/s3"

  bucket_name   = local.artifact_bucket_name
  force_destroy = var.artifact_bucket_force_destroy
  tags          = local.common_tags
}

module "iam" {
  source = "../../modules/iam"

  role_name           = local.lambda_role_name
  api_log_group_arn   = module.cloudwatch.log_group_arn
  incidents_table_arn = module.dynamodb.table_arn
  tags                = local.common_tags
}

module "lambda" {
  source = "../../modules/lambda"

  function_name      = local.api_function_name
  execution_role_arn = module.iam.role_arn
  package_source_dir = local.lambda_package_dir
  log_group_name     = module.cloudwatch.log_group_name
  description        = "IncidentLens AI Fastify API (${var.environment})"
  tags               = local.common_tags

  environment_variables = {
    NODE_ENV = var.lambda_node_env
    # AWS_REGION is reserved and injected by the Lambda runtime; do not set it here.
    INCIDENT_REPOSITORY      = "dynamodb"
    DYNAMODB_INCIDENTS_TABLE = module.dynamodb.table_name
    LOG_LEVEL                = var.lambda_log_level
  }

  depends_on = [
    module.cloudwatch,
    module.iam,
  ]
}

module "api_gateway" {
  source = "../../modules/api_gateway"

  api_name             = local.api_name
  lambda_invoke_arn    = module.lambda.invoke_arn
  lambda_function_name = module.lambda.function_name
  # HTTP API max is 30000ms; matches the API Lambda timeout from SCRUM-26.
  integration_timeout_milliseconds = 30000
  tags                             = local.common_tags
}
