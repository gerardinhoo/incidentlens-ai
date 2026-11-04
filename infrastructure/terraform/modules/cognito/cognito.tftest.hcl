# Cognito operator pool — dummy AWS provider so CI needs no credentials.
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
}

run "operator_pool_spa_client" {
  command = plan

  variables {
    user_pool_name = "incidentlens-dev-operators"
    tags = {
      Project     = "IncidentLensAI"
      Environment = "dev"
      ManagedBy   = "Terraform"
    }
  }

  assert {
    condition     = aws_cognito_user_pool.operators.name == "incidentlens-dev-operators"
    error_message = "User pool name must follow project/environment convention"
  }

  assert {
    condition     = aws_cognito_user_pool.operators.admin_create_user_config[0].allow_admin_create_user_only == true
    error_message = "Operator pool must not allow public self-sign-up"
  }

  assert {
    condition     = aws_cognito_user_pool_client.spa.generate_secret == false
    error_message = "SPA client must not have a client secret"
  }

  assert {
    condition     = contains(aws_cognito_user_pool_client.spa.explicit_auth_flows, "ALLOW_USER_PASSWORD_AUTH")
    error_message = "SPA client must allow USER_PASSWORD_AUTH"
  }

  assert {
    condition     = contains(aws_cognito_user_pool_client.spa.explicit_auth_flows, "ALLOW_REFRESH_TOKEN_AUTH")
    error_message = "SPA client must allow refresh tokens"
  }
}
