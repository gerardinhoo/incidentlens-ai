# Root wiring tests use mocked AWS so they never contact a real account.
mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:user/terraform-test"
      user_id    = "AIDAEXAMPLE"
      id         = "123456789012"
    }
  }

  # mock_provider replaces local policy-document data sources; supply valid JSON objects.
  mock_data "aws_iam_policy_document" {
    defaults = {
      id   = "mock-policy-document"
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"}}]}"
    }
  }

  mock_resource "aws_dynamodb_table" {
    defaults = {
      arn  = "arn:aws:dynamodb:us-east-1:123456789012:table/incidentlens-dev-incidents"
      id   = "incidentlens-dev-incidents"
      name = "incidentlens-dev-incidents"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/incidentlens-dev-api"
      id  = "/aws/lambda/incidentlens-dev-api"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn  = "arn:aws:iam::123456789012:role/incidentlens-dev-api-lambda-role"
      id   = "incidentlens-dev-api-lambda-role"
      name = "incidentlens-dev-api-lambda-role"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn           = "arn:aws:lambda:us-east-1:123456789012:function:incidentlens-dev-api"
      invoke_arn    = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789012:function:incidentlens-dev-api/invocations"
      function_name = "incidentlens-dev-api"
      version       = "1"
    }
  }

  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      id            = "apiidmock0001"
      api_endpoint  = "https://apiidmock0001.execute-api.us-east-1.amazonaws.com"
      execution_arn = "arn:aws:execute-api:us-east-1:123456789012:apiidmock0001"
    }
  }

  mock_resource "aws_apigatewayv2_integration" {
    defaults = {
      id = "integrationmock01"
    }
  }

  mock_resource "aws_apigatewayv2_stage" {
    defaults = {
      invoke_url = "https://apiidmock0001.execute-api.us-east-1.amazonaws.com"
      name       = "$default"
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      id                          = "incidentlens-dev-artifacts-123456789012"
      arn                         = "arn:aws:s3:::incidentlens-dev-artifacts-123456789012"
      bucket                      = "incidentlens-dev-artifacts-123456789012"
      bucket_regional_domain_name = "incidentlens-dev-artifacts-123456789012.s3.us-east-1.amazonaws.com"
    }
  }

  mock_data "aws_cloudfront_cache_policy" {
    defaults = {
      id   = "658327ea-f89d-4fab-a63d-7e88639e58f6"
      name = "Managed-CachingOptimized"
    }
  }

  mock_resource "aws_cloudfront_origin_access_control" {
    defaults = {
      id   = "E2OACMOCK12345"
      name = "incidentlens-dev-web-123456789012-oac"
    }
    override_during = plan
  }

  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      id          = "E123456789ABCD"
      arn         = "arn:aws:cloudfront::123456789012:distribution/E123456789ABCD"
      domain_name = "d111111abcdef8.cloudfront.net"
      status      = "Deployed"
    }
    override_during = plan
  }

  mock_resource "aws_sns_topic" {
    defaults = {
      id   = "arn:aws:sns:us-east-1:123456789012:incidentlens-dev-incidents"
      arn  = "arn:aws:sns:us-east-1:123456789012:incidentlens-dev-incidents"
      name = "incidentlens-dev-incidents"
    }
    override_during = plan
  }
}

run "module_wiring_and_outputs" {
  command = plan

  variables {
    project_name                 = "incidentlens"
    environment                  = "dev"
    aws_region                   = "us-east-1"
    lambda_package_source_dir    = "./tests/fixtures/lambda-package"
    processor_package_source_dir = "./tests/fixtures/processor-package"
  }

  assert {
    condition     = module.lambda.function_name == "incidentlens-dev-api"
    error_message = "Lambda function name must use project-environment prefix"
  }

  assert {
    condition     = module.processor_lambda.function_name == "incidentlens-dev-processor"
    error_message = "Processor Lambda function name must be incidentlens-dev-processor"
  }

  assert {
    condition     = module.processor_lambda.function_name != module.lambda.function_name
    error_message = "Processor function name must be distinct from the API function name"
  }

  assert {
    condition     = module.processor_lambda.runtime == "nodejs22.x"
    error_message = "Processor runtime must be nodejs22.x"
  }

  assert {
    condition     = contains(module.processor_lambda.architectures, "arm64")
    error_message = "Processor architecture must include arm64"
  }

  assert {
    condition     = module.processor_lambda.handler == "apps/incident-processor/src/handler.handler"
    error_message = "Processor handler must match the packaged entrypoint"
  }

  assert {
    condition     = module.processor_lambda.memory_size == 256
    error_message = "Processor memory must be 256 MB for the foundation"
  }

  assert {
    condition     = module.processor_lambda.timeout == 30
    error_message = "Processor timeout must be 30 seconds"
  }

  assert {
    condition     = module.iam_processor.role_name == "incidentlens-dev-processor-role"
    error_message = "Processor IAM role name must use project-environment prefix"
  }

  assert {
    condition     = local.processor_role_name == module.iam_processor.role_name
    error_message = "Processor Lambda wiring must use the dedicated processor IAM role name"
  }

  assert {
    condition     = module.iam_processor.role_name != module.iam.role_name
    error_message = "Processor IAM role must be distinct from the API role"
  }

  assert {
    condition     = module.cloudwatch.processor_log_group_name == "/aws/lambda/incidentlens-dev-processor"
    error_message = "Processor must have a dedicated CloudWatch log group"
  }

  assert {
    condition     = module.cloudwatch.processor_log_group_name != module.cloudwatch.lambda_log_group_name
    error_message = "Processor log group must be distinct from the API log group"
  }

  assert {
    condition     = module.dynamodb.table_name == "incidentlens-dev-incidents"
    error_message = "DynamoDB table name must use project-environment prefix"
  }

  assert {
    condition     = module.iam.role_name == "incidentlens-dev-api-lambda-role"
    error_message = "IAM role name must use project-environment prefix"
  }

  assert {
    condition     = module.cloudwatch.lambda_log_group_name == "/aws/lambda/incidentlens-dev-api"
    error_message = "Lambda log group naming must match function"
  }

  assert {
    condition     = module.cloudwatch.access_log_group_name == "/aws/apigateway/incidentlens-dev-api-access"
    error_message = "Access log group naming must match API access convention"
  }

  assert {
    condition     = module.s3.bucket_name == "incidentlens-dev-artifacts-123456789012"
    error_message = "Artifact bucket must include mocked account id suffix"
  }

  assert {
    condition     = module.api_gateway.stage_name == "$default"
    error_message = "API Gateway stage must be $default"
  }

  assert {
    condition     = output.incidents_table_name == "incidentlens-dev-incidents"
    error_message = "Output incidents_table_name must be exposed"
  }

  assert {
    condition     = output.lambda_function_name == "incidentlens-dev-api"
    error_message = "Output lambda_function_name must be exposed"
  }

  assert {
    condition     = output.lambda_execution_role_name == "incidentlens-dev-api-lambda-role"
    error_message = "Output lambda_execution_role_name must be exposed"
  }

  assert {
    condition     = output.api_stage_name == "$default"
    error_message = "Output api_stage_name must be $default"
  }

  assert {
    condition     = output.lambda_log_group_name == "/aws/lambda/incidentlens-dev-api"
    error_message = "Output lambda_log_group_name must be exposed"
  }

  assert {
    condition     = output.api_access_log_group_name == "/aws/apigateway/incidentlens-dev-api-access"
    error_message = "Output api_access_log_group_name must be exposed"
  }

  assert {
    condition     = output.artifact_bucket_name == "incidentlens-dev-artifacts-123456789012"
    error_message = "Output artifact_bucket_name must be exposed"
  }

  assert {
    condition     = module.frontend.bucket_name == "incidentlens-dev-web-123456789012"
    error_message = "Frontend bucket must include mocked account id suffix and web segment"
  }

  assert {
    condition     = output.frontend_bucket_name == "incidentlens-dev-web-123456789012"
    error_message = "Output frontend_bucket_name must be exposed"
  }

  assert {
    condition     = output.frontend_url == "https://d111111abcdef8.cloudfront.net"
    error_message = "Output frontend_url must use the CloudFront HTTPS domain"
  }

  assert {
    condition     = contains(local.cors_allow_origins, "https://d111111abcdef8.cloudfront.net")
    error_message = "CORS allow list must include the CloudFront frontend_url"
  }

  assert {
    condition = (
      contains(local.cors_allow_origins, "http://localhost:5173") &&
      !contains(local.cors_allow_origins, "*")
    )
    error_message = "CORS must keep local Vite origins and must not use wildcard *"
  }

  assert {
    condition     = contains(module.api_gateway.cors_allow_origins, "https://d111111abcdef8.cloudfront.net")
    error_message = "API Gateway module must receive the CloudFront origin"
  }

  assert {
    condition     = output.api_cors_allow_origins == module.api_gateway.cors_allow_origins
    error_message = "Output api_cors_allow_origins must match the API Gateway CORS list"
  }

  assert {
    condition     = output.cloudfront_distribution_id == module.frontend.cloudfront_distribution_id
    error_message = "Output cloudfront_distribution_id must match the frontend module"
  }

  assert {
    condition     = output.processor_lambda_function_name == "incidentlens-dev-processor"
    error_message = "Output processor_lambda_function_name must be exposed"
  }

  assert {
    condition     = output.processor_log_group_name == "/aws/lambda/incidentlens-dev-processor"
    error_message = "Output processor_log_group_name must be exposed"
  }

  assert {
    condition     = output.processor_execution_role_name == "incidentlens-dev-processor-role"
    error_message = "Output processor_execution_role_name must be exposed"
  }

  assert {
    condition = (
      local.common_tags["Project"] == "IncidentLensAI" &&
      local.common_tags["Environment"] == "dev" &&
      local.common_tags["ManagedBy"] == "Terraform"
    )
    error_message = "Common project/environment tags must be set consistently"
  }

  # API Gateway is wired only to the API Lambda (no processor route / Function URL / event source in this story).
  assert {
    condition     = module.api_gateway.lambda_function_name == module.lambda.function_name
    error_message = "API Gateway must integrate with the API Lambda, not the processor"
  }

  assert {
    condition     = module.api_log_subscription.filter_name == "incidentlens-dev-api-incident-candidate"
    error_message = "Exactly one named API→processor subscription filter must be wired"
  }

  assert {
    condition     = module.api_log_subscription.log_group_name == "/aws/lambda/incidentlens-dev-api"
    error_message = "Subscription source must be the API Lambda log group"
  }

  assert {
    condition     = module.api_log_subscription.log_group_name != module.cloudwatch.processor_log_group_name
    error_message = "Processor log group must not be the subscription source (recursion prevention)"
  }

  assert {
    condition     = module.api_log_subscription.log_group_name != module.cloudwatch.access_log_group_name
    error_message = "API Gateway access log group must not be the subscription source"
  }

  assert {
    condition = (
      module.api_log_subscription.filter_pattern != "" &&
      strcontains(module.api_log_subscription.filter_pattern, "incident_candidate")
    )
    error_message = "Filter pattern must be non-empty and contain incident_candidate"
  }

  assert {
    condition     = local.api_incident_candidate_filter_pattern == "{ $.eventType = \"incident_candidate\" }"
    error_message = "Filter pattern must match the structured eventType contract"
  }

  assert {
    condition     = output.api_error_subscription_filter_name == "incidentlens-dev-api-incident-candidate"
    error_message = "Output api_error_subscription_filter_name must be exposed"
  }

  assert {
    condition     = output.subscribed_log_group_name == "/aws/lambda/incidentlens-dev-api"
    error_message = "Output subscribed_log_group_name must be the API log group"
  }

  assert {
    condition     = module.api_log_subscription.lambda_permission_statement_id == "AllowCloudWatchLogsInvoke"
    error_message = "CloudWatch Logs invoke permission must be wired for the processor"
  }

  # SCRUM-34: processor persists via DynamoDB (env + PutItem IAM covered in iam_logs.tftest.hcl).
  assert {
    condition     = module.processor_lambda.environment_variables["INCIDENT_REPOSITORY"] == "dynamodb"
    error_message = "Processor must use INCIDENT_REPOSITORY=dynamodb"
  }

  assert {
    condition     = module.processor_lambda.environment_variables["DYNAMODB_INCIDENTS_TABLE"] == module.dynamodb.table_name
    error_message = "Processor DYNAMODB_INCIDENTS_TABLE must match the incidents table name"
  }

  assert {
    condition     = contains(keys(module.processor_lambda.environment_variables), "LOG_LEVEL")
    error_message = "Processor must set LOG_LEVEL"
  }

  # SCRUM-38/40: Bedrock analyzer configuration on processor only.
  assert {
    condition     = contains(keys(module.processor_lambda.environment_variables), "INCIDENT_ANALYZER")
    error_message = "Processor must set INCIDENT_ANALYZER"
  }

  assert {
    condition     = module.processor_lambda.environment_variables["INCIDENT_ANALYZER"] == "bedrock"
    error_message = "Dev processor INCIDENT_ANALYZER must default to bedrock"
  }

  assert {
    condition     = contains(keys(module.processor_lambda.environment_variables), "BEDROCK_MODEL_ID")
    error_message = "Processor must set BEDROCK_MODEL_ID"
  }

  assert {
    condition     = !contains(keys(module.lambda.environment_variables), "INCIDENT_ANALYZER")
    error_message = "API Lambda must not receive INCIDENT_ANALYZER"
  }

  assert {
    condition     = !contains(keys(module.lambda.environment_variables), "BEDROCK_MODEL_ID")
    error_message = "API Lambda must not receive BEDROCK_MODEL_ID"
  }

  # SCRUM-41: SNS notifications on processor only.
  assert {
    condition     = module.sns_incidents.topic_name == "incidentlens-dev-incidents"
    error_message = "SNS topic name must follow project/environment convention"
  }

  assert {
    condition     = module.processor_lambda.environment_variables["INCIDENT_NOTIFIER"] == "sns"
    error_message = "Dev processor INCIDENT_NOTIFIER must default to sns"
  }

  assert {
    condition     = module.processor_lambda.environment_variables["SNS_INCIDENT_TOPIC_ARN"] == module.sns_incidents.topic_arn
    error_message = "Processor SNS_INCIDENT_TOPIC_ARN must match the incidents topic"
  }

  assert {
    condition     = !contains(keys(module.lambda.environment_variables), "INCIDENT_NOTIFIER")
    error_message = "API Lambda must not receive INCIDENT_NOTIFIER"
  }

  assert {
    condition     = !contains(keys(module.lambda.environment_variables), "SNS_INCIDENT_TOPIC_ARN")
    error_message = "API Lambda must not receive SNS_INCIDENT_TOPIC_ARN"
  }

  assert {
    condition     = output.sns_incident_topic_name == "incidentlens-dev-incidents"
    error_message = "Output sns_incident_topic_name must be exposed"
  }

  assert {
    condition     = output.sns_incident_topic_arn == module.sns_incidents.topic_arn
    error_message = "Output sns_incident_topic_arn must be exposed"
  }

  # API Lambda DynamoDB env/IAM contract remains unchanged.
  assert {
    condition     = module.lambda.environment_variables["INCIDENT_REPOSITORY"] == "dynamodb"
    error_message = "API Lambda INCIDENT_REPOSITORY must remain dynamodb"
  }

  assert {
    condition     = module.lambda.environment_variables["DYNAMODB_INCIDENTS_TABLE"] == module.dynamodb.table_name
    error_message = "API Lambda must keep DYNAMODB_INCIDENTS_TABLE wired to the incidents table"
  }

  assert {
    condition     = module.lambda.environment_variables["ENABLE_TEST_ERROR_ENDPOINT"] == "false"
    error_message = "API Lambda ENABLE_TEST_ERROR_ENDPOINT must default to false"
  }
}
