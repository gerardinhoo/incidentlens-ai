# SNS topic module — dummy AWS provider so CI needs no credentials.
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
}

run "topic_without_email_subscription" {
  command = plan

  variables {
    topic_name = "incidentlens-dev-incidents"
    tags = {
      Project     = "IncidentLensAI"
      Environment = "dev"
      ManagedBy   = "Terraform"
    }
  }

  assert {
    condition     = aws_sns_topic.incidents.name == "incidentlens-dev-incidents"
    error_message = "Topic name must follow project/environment convention"
  }

  assert {
    condition     = aws_sns_topic.incidents.kms_master_key_id == "alias/aws/sns"
    error_message = "Topic must use SNS-managed KMS key"
  }

  assert {
    condition     = length(aws_sns_topic_subscription.email) == 0
    error_message = "Without notification_email, no email subscription must be created"
  }

  assert {
    condition     = !strcontains(aws_sns_topic.incidents.name, ".fifo")
    error_message = "Must not create a FIFO topic"
  }
}

run "topic_with_email_subscription" {
  command = plan

  variables {
    topic_name         = "incidentlens-dev-incidents"
    notification_email = "ops@example.com"
  }

  assert {
    condition     = length(aws_sns_topic_subscription.email) == 1
    error_message = "Configured notification_email must create one email subscription"
  }

  assert {
    condition     = aws_sns_topic_subscription.email[0].protocol == "email"
    error_message = "Subscription protocol must be email"
  }

  assert {
    condition     = aws_sns_topic_subscription.email[0].endpoint == "ops@example.com"
    error_message = "Subscription endpoint must match notification_email"
  }
}
