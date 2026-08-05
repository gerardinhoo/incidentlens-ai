data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id  = data.aws_caller_identity.current.account_id
  partition   = data.aws_partition.current.partition
  name_prefix = "${var.project_name}-${var.environment}"

  # Globally unique, separate from the Lambda artifact bucket.
  state_bucket_name = "${var.project_name}-tfstate-${local.account_id}"

  artifact_bucket_name = "${local.name_prefix}-artifacts-${local.account_id}"

  # Repos created on/after 2026-07-15 emit immutable sub claims with owner/repo IDs.
  # Legacy (name-only) format is used only when both IDs are left empty.
  github_oidc_sub = (
    var.github_owner_id != "" && var.github_repository_id != ""
    ? "repo:${var.github_owner}@${var.github_owner_id}/${var.github_repository}@${var.github_repository_id}:ref:refs/heads/${var.github_branch}"
    : "repo:${var.github_owner}/${var.github_repository}:ref:refs/heads/${var.github_branch}"
  )

  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : var.existing_oidc_provider_arn

  # Known resource names / ARNs for the IncidentLens dev application stack.
  incidents_table_name      = "${local.name_prefix}-incidents"
  api_function_name         = "${local.name_prefix}-api"
  processor_function_name   = "${local.name_prefix}-processor"
  lambda_role_name          = "${local.name_prefix}-api-lambda-role"
  processor_role_name       = "${local.name_prefix}-processor-role"
  api_log_group_name        = "/aws/lambda/${local.api_function_name}"
  processor_log_group_name  = "/aws/lambda/${local.processor_function_name}"
  api_access_log_group_name = "/aws/apigateway/${local.api_function_name}-access"

  state_bucket_arn    = "arn:${local.partition}:s3:::${local.state_bucket_name}"
  artifact_bucket_arn = "arn:${local.partition}:s3:::${local.artifact_bucket_name}"

  lambda_arn_prefix           = "arn:${local.partition}:lambda:${var.aws_region}:${local.account_id}:function:${local.api_function_name}"
  processor_lambda_arn_prefix = "arn:${local.partition}:lambda:${var.aws_region}:${local.account_id}:function:${local.processor_function_name}"
  table_arn                   = "arn:${local.partition}:dynamodb:${var.aws_region}:${local.account_id}:table/${local.incidents_table_name}"
  lambda_role_arn             = "arn:${local.partition}:iam::${local.account_id}:role/${local.lambda_role_name}"
  processor_role_arn          = "arn:${local.partition}:iam::${local.account_id}:role/${local.processor_role_name}"

  log_group_arns = [
    "arn:${local.partition}:logs:${var.aws_region}:${local.account_id}:log-group:${local.api_log_group_name}",
    "arn:${local.partition}:logs:${var.aws_region}:${local.account_id}:log-group:${local.api_log_group_name}:*",
    "arn:${local.partition}:logs:${var.aws_region}:${local.account_id}:log-group:${local.processor_log_group_name}",
    "arn:${local.partition}:logs:${var.aws_region}:${local.account_id}:log-group:${local.processor_log_group_name}:*",
    "arn:${local.partition}:logs:${var.aws_region}:${local.account_id}:log-group:${local.api_access_log_group_name}",
    "arn:${local.partition}:logs:${var.aws_region}:${local.account_id}:log-group:${local.api_access_log_group_name}:*",
  ]
}

# -----------------------------------------------------------------------------
# A. Terraform remote state bucket
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "terraform_state" {
  bucket        = local.state_bucket_name
  force_destroy = false

  tags = {
    Name    = local.state_bucket_name
    Purpose = "terraform-remote-state"
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# -----------------------------------------------------------------------------
# B. GitHub Actions OIDC provider (account-level; at most one per URL)
# -----------------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com",
  ]

  # GitHub-published thumbprints commonly used with AWS IAM OIDC.
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

# -----------------------------------------------------------------------------
# C. GitHub Actions deployment role (main branch only)
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "github_deploy_trust" {
  statement {
    sid     = "GitHubActionsOidc"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.github_oidc_sub]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "${var.project_name}-github-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_trust.json
  description        = "Least-privilege role assumed by GitHub Actions via OIDC to plan/apply IncidentLens ${var.environment}."

  tags = {
    Name = "${var.project_name}-github-actions-deploy"
  }
}

data "aws_iam_policy_document" "github_deploy_permissions" {
  # -------------------------------------------------------------------------
  # STS identity lookup (Resource must be "*")
  # -------------------------------------------------------------------------
  statement {
    sid       = "StsIdentity"
    effect    = "Allow"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }

  # -------------------------------------------------------------------------
  # Terraform state bucket (exact bucket)
  # -------------------------------------------------------------------------
  statement {
    sid    = "TerraformStateBucketList"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketVersioning",
      "s3:GetBucketLocation",
      "s3:GetEncryptionConfiguration",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetBucketOwnershipControls",
    ]
    resources = [local.state_bucket_arn]
  }

  statement {
    sid    = "TerraformStateObjects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${local.state_bucket_arn}/*"]
  }

  # -------------------------------------------------------------------------
  # Artifact bucket (exact name pattern used by environments/dev)
  # -------------------------------------------------------------------------
  statement {
    sid    = "ArtifactBucketManage"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
      "s3:PutBucketVersioning",
      "s3:GetEncryptionConfiguration",
      "s3:PutEncryptionConfiguration",
      "s3:GetBucketPublicAccessBlock",
      "s3:PutBucketPublicAccessBlock",
      "s3:GetBucketOwnershipControls",
      "s3:PutBucketOwnershipControls",
      "s3:GetBucketTagging",
      "s3:PutBucketTagging",
      "s3:GetBucketPolicy",
      "s3:PutBucketPolicy",
      "s3:DeleteBucketPolicy",
      "s3:GetBucketAcl",
      "s3:PutBucketAcl",
      "s3:GetBucketCors",
      "s3:GetLifecycleConfiguration",
      "s3:PutLifecycleConfiguration",
      # Extra reads the AWS provider performs while refreshing aws_s3_bucket.
      "s3:GetBucketWebsite",
      "s3:GetBucketLogging",
      "s3:GetAccelerateConfiguration",
      "s3:GetBucketRequestPayment",
      "s3:GetBucketObjectLockConfiguration",
      "s3:GetReplicationConfiguration",
      "s3:GetBucketNotification",
      "s3:GetBucketIntelligentTieringConfiguration",
      "s3:ListBucketMultipartUploads",
    ]
    resources = [local.artifact_bucket_arn]
  }

  statement {
    sid    = "ArtifactObjects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:GetObjectVersion",
      "s3:DeleteObjectVersion",
      "s3:GetObjectTagging",
      "s3:PutObjectTagging",
    ]
    resources = ["${local.artifact_bucket_arn}/*"]
  }

  # -------------------------------------------------------------------------
  # Lambda (exact API + processor functions)
  # -------------------------------------------------------------------------
  statement {
    sid    = "LambdaFunction"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction",
      "lambda:DeleteFunction",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:GetFunctionCodeSigningConfig",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:ListVersionsByFunction",
      "lambda:PublishVersion",
      "lambda:GetPolicy",
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:TagResource",
      "lambda:UntagResource",
      "lambda:ListTags",
      "lambda:GetFunctionEventInvokeConfig",
      "lambda:GetRuntimeManagementConfig",
      "lambda:GetFunctionUrlConfig",
      "lambda:ListEventSourceMappings",
      "lambda:InvokeFunction",
    ]
    resources = [
      local.lambda_arn_prefix,
      "${local.lambda_arn_prefix}:*",
      local.processor_lambda_arn_prefix,
      "${local.processor_lambda_arn_prefix}:*",
    ]
  }

  # List/Get layer / account settings style reads often require "*".
  statement {
    sid    = "LambdaListDescribe"
    effect = "Allow"
    actions = [
      "lambda:ListFunctions",
      "lambda:GetAccountSettings",
      "lambda:ListEventSourceMappings",
    ]
    resources = ["*"]
  }

  # -------------------------------------------------------------------------
  # API Gateway HTTP API (v2). APIs are account-scoped; create needs "*".
  # Mutations after create are constrained by tags / ID where AWS allows.
  # -------------------------------------------------------------------------
  statement {
    sid    = "ApiGatewayV2Manage"
    effect = "Allow"
    actions = [
      "apigateway:GET",
      "apigateway:POST",
      "apigateway:PUT",
      "apigateway:PATCH",
      "apigateway:DELETE",
      "apigateway:TagResource",
      "apigateway:UntagResource",
    ]
    # API Gateway v2 IAM uses execute-api / apigateway ARNs; Terraform AWS
    # provider often needs broad apigateway actions for HTTP APIs. Scoped to
    # this account's API Gateway resources rather than AdministratorAccess.
    resources = [
      "arn:${local.partition}:apigateway:${var.aws_region}::/apis",
      "arn:${local.partition}:apigateway:${var.aws_region}::/apis/*",
      "arn:${local.partition}:apigateway:${var.aws_region}::/tags",
      "arn:${local.partition}:apigateway:${var.aws_region}::/tags/*",
      "arn:${local.partition}:apigateway:${var.aws_region}::/account",
    ]
  }

  # -------------------------------------------------------------------------
  # DynamoDB (exact table)
  # -------------------------------------------------------------------------
  statement {
    sid    = "DynamoDbTable"
    effect = "Allow"
    actions = [
      "dynamodb:CreateTable",
      "dynamodb:DeleteTable",
      "dynamodb:DescribeTable",
      "dynamodb:UpdateTable",
      "dynamodb:DescribeContinuousBackups",
      "dynamodb:DescribeTimeToLive",
      "dynamodb:UpdateTimeToLive",
      "dynamodb:DescribeDeletionProtection",
      "dynamodb:UpdateDeletionProtection",
      "dynamodb:ListTagsOfResource",
      "dynamodb:TagResource",
      "dynamodb:UntagResource",
      "dynamodb:DescribeKinesisStreamingDestination",
      "dynamodb:ListStreams",
    ]
    resources = [
      local.table_arn,
      "${local.table_arn}/index/*",
      "${local.table_arn}/stream/*",
    ]
  }

  statement {
    sid       = "DynamoDbList"
    effect    = "Allow"
    actions   = ["dynamodb:ListTables"]
    resources = ["*"]
  }

  # -------------------------------------------------------------------------
  # CloudWatch Logs (exact log groups + account resource policies)
  # -------------------------------------------------------------------------
  statement {
    sid    = "CloudWatchLogGroups"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:DescribeLogGroups",
      "logs:DescribeSubscriptionFilters",
      "logs:PutRetentionPolicy",
      "logs:DeleteRetentionPolicy",
      "logs:TagLogGroup",
      "logs:UntagLogGroup",
      "logs:ListTagsLogGroup",
      "logs:TagResource",
      "logs:UntagResource",
      "logs:ListTagsForResource",
      "logs:AssociateKmsKey",
      "logs:DisassociateKmsKey",
    ]
    resources = local.log_group_arns
  }

  # Describe* and account-level resource policies require Resource "*".
  statement {
    sid    = "CloudWatchLogsAccount"
    effect = "Allow"
    actions = [
      "logs:DescribeLogGroups",
      "logs:DescribeResourcePolicies",
      "logs:PutResourcePolicy",
      "logs:DeleteResourcePolicy",
    ]
    resources = ["*"]
  }

  # -------------------------------------------------------------------------
  # IAM — API + processor Lambda execution roles (+ PassRole to Lambda)
  # -------------------------------------------------------------------------
  statement {
    sid    = "IamLambdaExecutionRole"
    effect = "Allow"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:ListRoleTags",
    ]
    resources = [
      local.lambda_role_arn,
      local.processor_role_arn,
    ]
  }

  statement {
    sid     = "IamPassLambdaRole"
    effect  = "Allow"
    actions = ["iam:PassRole"]
    resources = [
      local.lambda_role_arn,
      local.processor_role_arn,
    ]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  # Role existence checks / listings during plan.
  statement {
    sid       = "IamListRoles"
    effect    = "Allow"
    actions   = ["iam:ListRoles"]
    resources = ["*"]
  }

  # -------------------------------------------------------------------------
  # Tagging helpers used by the AWS provider during create/update
  # -------------------------------------------------------------------------
  statement {
    sid    = "ResourceGroupsTaggingRead"
    effect = "Allow"
    actions = [
      "tag:GetResources",
      "tag:TagResources",
      "tag:UntagResources",
      "tag:GetTagKeys",
      "tag:GetTagValues",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${var.project_name}-github-actions-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy_permissions.json
}
