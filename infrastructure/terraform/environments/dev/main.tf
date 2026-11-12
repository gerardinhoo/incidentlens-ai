data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = "IncidentLensAI"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  incidents_table_name      = "${local.name_prefix}-incidents"
  incidents_topic_name      = "${local.name_prefix}-incidents"
  api_function_name         = "${local.name_prefix}-api"
  processor_function_name   = "${local.name_prefix}-processor"
  ingest_function_name      = "${local.name_prefix}-ingest"
  api_log_group_name        = "/aws/lambda/${local.api_function_name}"
  processor_log_group_name  = "/aws/lambda/${local.processor_function_name}"
  ingest_log_group_name     = "/aws/lambda/${local.ingest_function_name}"
  api_access_log_group_name = "/aws/apigateway/${local.api_function_name}-access"
  api_name                  = "${local.name_prefix}-http-api"
  lambda_role_name          = "${local.name_prefix}-api-lambda-role"
  processor_role_name       = "${local.name_prefix}-processor-role"
  ingest_role_name          = "${local.name_prefix}-ingest-role"
  candidates_queue_name     = "${local.name_prefix}-incident-candidates"
  # Account ID keeps the bucket name globally unique without hardcoding it.
  artifact_bucket_name = "${local.name_prefix}-artifacts-${data.aws_caller_identity.current.account_id}"
  # Dedicated frontend hosting bucket (not the deployment-artifact bucket).
  frontend_bucket_name = "${local.name_prefix}-web-${data.aws_caller_identity.current.account_id}"

  # Browser origins allowed to call the HTTP API (credentials disabled).
  # Shared stack: CloudFront only. Extra origins (localhost) via tfvars, not defaults.
  cors_allow_origins = distinct(concat(
    var.cors_allow_origins,
    [module.frontend.frontend_url],
  ))

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
  operator_user_pool_name               = "${local.name_prefix}-operators"

  # Bedrock Converse IAM scope (SCRUM-38). Inference-profile ARNs can be supplied
  # via var.bedrock_invoke_resource_arns when foundation-model ARN is insufficient.
  bedrock_invoke_resource_arns = length(var.bedrock_invoke_resource_arns) > 0 ? var.bedrock_invoke_resource_arns : (
    trimspace(var.bedrock_model_id) != "" ? [
      "arn:aws:bedrock:${var.aws_region}::foundation-model/${var.bedrock_model_id}",
    ] : []
  )
}

module "dynamodb" {
  source = "../../modules/dynamodb"

  table_name                  = local.incidents_table_name
  deletion_protection_enabled = var.dynamodb_deletion_protection_enabled
  tags                        = local.common_tags
}

module "sns_incidents" {
  source = "../../modules/sns"

  topic_name         = local.incidents_topic_name
  notification_email = var.notification_email
  tags               = local.common_tags
}

module "cloudwatch" {
  source = "../../modules/cloudwatch"

  lambda_log_group_name    = local.api_log_group_name
  access_log_group_name    = local.api_access_log_group_name
  processor_log_group_name = local.processor_log_group_name
  ingest_log_group_name    = local.ingest_log_group_name
  retention_in_days        = var.log_retention_days
  tags                     = local.common_tags
}

module "sqs_candidates" {
  source = "../../modules/sqs"

  queue_name = local.candidates_queue_name
  tags       = local.common_tags
}

module "s3" {
  source = "../../modules/s3"

  bucket_name   = local.artifact_bucket_name
  force_destroy = var.artifact_bucket_force_destroy
  tags          = local.common_tags
}

# SCRUM-54 — private S3 + CloudFront (OAC) for the Vite SPA. Assets are not
# uploaded here; SCRUM-56 owns frontend CI/CD deploy + invalidation.
module "frontend" {
  source = "../../modules/frontend"

  bucket_name   = local.frontend_bucket_name
  force_destroy = var.frontend_bucket_force_destroy
  price_class   = var.frontend_cloudfront_price_class
  comment       = "IncidentLens AI frontend (${var.environment})"
  tags          = local.common_tags
}

module "cognito" {
  source = "../../modules/cognito"

  user_pool_name = local.operator_user_pool_name
  tags           = local.common_tags
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
  incidents_table_arn          = module.dynamodb.table_arn
  bedrock_invoke_resource_arns = local.bedrock_invoke_resource_arns
  sns_incident_topic_arn       = module.sns_incidents.topic_arn
  sqs_consume_queue_arn        = module.sqs_candidates.queue_arn
  tags                         = local.common_tags
}

module "iam_ingest" {
  source = "../../modules/iam_logs"

  role_name = local.ingest_role_name
  log_group_arn = coalesce(
    module.cloudwatch.ingest_log_group_arn,
    "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:${local.ingest_log_group_name}",
  )
  sqs_send_queue_arn = module.sqs_candidates.queue_arn
  tags               = local.common_tags
}

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
    INCIDENT_REPOSITORY        = "dynamodb"
    DYNAMODB_INCIDENTS_TABLE   = module.dynamodb.table_name
    LOG_LEVEL                  = var.lambda_log_level
    ENABLE_TEST_ERROR_ENDPOINT = var.enable_test_error_endpoint ? "true" : "false"
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
  description                    = "IncidentLens AI SQS worker (persist + analyze) (${var.environment})"
  handler                        = "apps/incident-processor/src/handler.handler"
  memory_size                    = 256
  timeout                        = 30
  reserved_concurrent_executions = 2
  tags                           = local.common_tags

  environment_variables = {
    NODE_ENV                 = var.lambda_node_env
    SERVICE_NAME             = "incidentlens-processor"
    LOG_LEVEL                = var.lambda_log_level
    INCIDENT_REPOSITORY      = "dynamodb"
    DYNAMODB_INCIDENTS_TABLE = module.dynamodb.table_name
    # Analyzer selection — default fake so deploy does not enable live AI path.
    INCIDENT_ANALYZER = var.incident_analyzer
    BEDROCK_MODEL_ID  = var.bedrock_model_id
    # SCRUM-41 — SNS notifications after create + enrichment.
    INCIDENT_NOTIFIER      = var.incident_notifier
    SNS_INCIDENT_TOPIC_ARN = module.sns_incidents.topic_arn
  }

  depends_on = [
    module.cloudwatch,
    module.iam_processor,
    module.sns_incidents,
    module.sqs_candidates,
  ]
}

module "ingest_lambda" {
  source = "../../modules/lambda"

  function_name      = local.ingest_function_name
  execution_role_arn = module.iam_ingest.role_arn
  package_source_dir = local.processor_package_dir
  log_group_name = coalesce(
    module.cloudwatch.ingest_log_group_name,
    local.ingest_log_group_name,
  )
  description = "IncidentLens AI CloudWatch ingest (SQS enqueue) (${var.environment})"
  handler     = "apps/incident-processor/src/ingest-handler.handler"
  memory_size = 256
  timeout     = 10
  tags        = local.common_tags

  environment_variables = {
    NODE_ENV                 = var.lambda_node_env
    SERVICE_NAME             = "incidentlens-ingest"
    LOG_LEVEL                = var.lambda_log_level
    SQS_CANDIDATES_QUEUE_URL = module.sqs_candidates.queue_url
  }

  depends_on = [
    module.cloudwatch,
    module.iam_ingest,
    module.sqs_candidates,
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
  # Shared stack: CloudFront only (localhost via personal tfvars, not defaults).
  cors_allow_origins = local.cors_allow_origins
  enable_jwt         = true
  jwt_issuer         = "https://cognito-idp.${var.aws_region}.amazonaws.com/${module.cognito.user_pool_id}"
  jwt_audience       = module.cognito.user_pool_client_id
  tags               = local.common_tags
}

# API Lambda application logs → ingest (decode/parse/enqueue; no Bedrock).
# Source is intentionally NOT the processor or ingest log group (recursion prevention).
module "api_log_subscription" {
  source = "../../modules/log_subscription"

  filter_name                      = local.api_error_subscription_filter_name
  log_group_name                   = module.cloudwatch.lambda_log_group_name
  log_group_arn                    = module.cloudwatch.lambda_log_group_arn
  destination_lambda_function_name = module.ingest_lambda.function_name
  destination_lambda_arn           = module.ingest_lambda.function_arn
  filter_pattern                   = local.api_incident_candidate_filter_pattern
  aws_region                       = var.aws_region

  depends_on = [
    module.cloudwatch,
    module.ingest_lambda,
  ]
}

resource "aws_lambda_event_source_mapping" "processor_candidates" {
  event_source_arn = module.sqs_candidates.queue_arn
  function_name    = module.processor_lambda.function_name
  batch_size       = 5
  enabled          = true

  depends_on = [
    module.processor_lambda,
    module.iam_processor,
    module.sqs_candidates,
  ]
}
