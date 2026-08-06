data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = "IncidentLensAI"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  incidents_table_name      = "${local.name_prefix}-incidents"
  api_function_name         = "${local.name_prefix}-api"
  processor_function_name   = "${local.name_prefix}-processor"
  api_log_group_name        = "/aws/lambda/${local.api_function_name}"
  processor_log_group_name  = "/aws/lambda/${local.processor_function_name}"
  api_access_log_group_name = "/aws/apigateway/${local.api_function_name}-access"
  api_name                  = "${local.name_prefix}-http-api"
  lambda_role_name          = "${local.name_prefix}-api-lambda-role"
  processor_role_name       = "${local.name_prefix}-processor-role"
  # Account ID keeps the bucket name globally unique without hardcoding it.
  artifact_bucket_name = "${local.name_prefix}-artifacts-${data.aws_caller_identity.current.account_id}"
  # Built by `npm run build:lambda` before terraform plan/apply.
  # Tests may override via var.lambda_package_source_dir / processor_package_source_dir.
  lambda_package_dir = coalesce(
    var.lambda_package_source_dir,
    "${path.module}/../../../../dist/lambda/api",
  )
  processor_package_dir = coalesce(
    var.processor_package_source_dir,
    "${path.module}/../../../../dist/lambda/processor",
  )

  # Structured JSON filter for deliberate /test-error incident-candidate logs.
  # See docs/architecture/cloudwatch-subscription.md
  api_incident_candidate_filter_pattern = "{ $.eventType = \"incident_candidate\" }"
  api_error_subscription_filter_name    = "${local.name_prefix}-api-incident-candidate"
}

module "dynamodb" {
  source = "../../modules/dynamodb"

  table_name                  = local.incidents_table_name
  deletion_protection_enabled = var.dynamodb_deletion_protection_enabled
  tags                        = local.common_tags
}

module "cloudwatch" {
  source = "../../modules/cloudwatch"

  lambda_log_group_name    = local.api_log_group_name
  access_log_group_name    = local.api_access_log_group_name
  processor_log_group_name = local.processor_log_group_name
  retention_in_days        = var.log_retention_days
  tags                     = local.common_tags
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
  api_log_group_arn   = module.cloudwatch.lambda_log_group_arn
  incidents_table_arn = module.dynamodb.table_arn
  tags                = local.common_tags
}

module "iam_processor" {
  source = "../../modules/iam_logs"

  role_name = local.processor_role_name
  # coalesce keeps a non-null string type for the IAM module when outputs are nullable.
  log_group_arn = coalesce(
    module.cloudwatch.processor_log_group_arn,
    "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:${local.processor_log_group_name}",
  )
  incidents_table_arn = module.dynamodb.table_arn
  tags                = local.common_tags
}

# Processor Lambda has no API Gateway route, Function URL, or event source in this story.

module "lambda" {
  source = "../../modules/lambda"

  function_name      = local.api_function_name
  execution_role_arn = module.iam.role_arn
  package_source_dir = local.lambda_package_dir
  log_group_name     = module.cloudwatch.lambda_log_group_name
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

module "processor_lambda" {
  source = "../../modules/lambda"

  function_name      = local.processor_function_name
  execution_role_arn = module.iam_processor.role_arn
  package_source_dir = local.processor_package_dir
  log_group_name = coalesce(
    module.cloudwatch.processor_log_group_name,
    local.processor_log_group_name,
  )
  description = "IncidentLens AI incident processor foundation (${var.environment})"
  handler     = "apps/incident-processor/src/handler.handler"
  memory_size = 256
  timeout     = 30
  tags        = local.common_tags

  environment_variables = {
    NODE_ENV                 = var.lambda_node_env
    SERVICE_NAME             = "incidentlens-processor"
    LOG_LEVEL                = var.lambda_log_level
    INCIDENT_REPOSITORY      = "dynamodb"
    DYNAMODB_INCIDENTS_TABLE = module.dynamodb.table_name
  }

  depends_on = [
    module.cloudwatch,
    module.iam_processor,
  ]
}

module "api_gateway" {
  source = "../../modules/api_gateway"

  api_name             = local.api_name
  lambda_invoke_arn    = module.lambda.invoke_arn
  lambda_function_name = module.lambda.function_name
  access_log_group_arn = module.cloudwatch.access_log_group_arn
  # HTTP API max is 30000ms; matches the API Lambda timeout from SCRUM-26.
  integration_timeout_milliseconds = 30000
  tags                             = local.common_tags
}

# API Lambda application logs → processor (delivery only; no decode in SCRUM-32).
# Source is intentionally NOT the processor log group (recursion prevention).
module "api_log_subscription" {
  source = "../../modules/log_subscription"

  filter_name                      = local.api_error_subscription_filter_name
  log_group_name                   = module.cloudwatch.lambda_log_group_name
  log_group_arn                    = module.cloudwatch.lambda_log_group_arn
  destination_lambda_function_name = module.processor_lambda.function_name
  destination_lambda_arn           = module.processor_lambda.function_arn
  filter_pattern                   = local.api_incident_candidate_filter_pattern
  aws_region                       = var.aws_region

  depends_on = [
    module.cloudwatch,
    module.processor_lambda,
  ]
}
