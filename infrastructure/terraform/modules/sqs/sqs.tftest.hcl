provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
}

run "standard_queue_contract" {
  command = plan

  variables {
    queue_name = "incidentlens-dev-incident-candidates"
    tags = {
      Project     = "IncidentLensAI"
      Environment = "dev"
      ManagedBy   = "Terraform"
    }
  }

  assert {
    condition     = aws_sqs_queue.candidates.name == "incidentlens-dev-incident-candidates"
    error_message = "Queue name must follow project-environment convention"
  }

  assert {
    condition     = aws_sqs_queue.candidates.fifo_queue == false
    error_message = "Candidates queue must be standard SQS, not FIFO"
  }

  assert {
    condition     = aws_sqs_queue.candidates.visibility_timeout_seconds == 180
    error_message = "Visibility timeout must default to 180 seconds"
  }

  assert {
    condition     = aws_sqs_queue.candidates.sqs_managed_sse_enabled == true
    error_message = "Queue must use SQS-managed encryption"
  }
}
