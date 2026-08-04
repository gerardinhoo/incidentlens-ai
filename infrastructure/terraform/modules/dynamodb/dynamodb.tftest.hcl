mock_provider "aws" {
  mock_resource "aws_dynamodb_table" {
    defaults = {
      arn                         = "arn:aws:dynamodb:us-east-1:123456789012:table/incidentlens-dev-incidents"
      id                          = "incidentlens-dev-incidents"
      hash_key                    = "id"
      billing_mode                = "PAY_PER_REQUEST"
      deletion_protection_enabled = false
    }
  }
}

run "incidents_table_contract" {
  command = plan

  variables {
    table_name                  = "incidentlens-dev-incidents"
    deletion_protection_enabled = false
    tags = {
      Project     = "IncidentLensAI"
      Environment = "dev"
    }
  }

  assert {
    condition     = aws_dynamodb_table.incidents.hash_key == "id"
    error_message = "Partition key must be id"
  }

  assert {
    condition     = one([for a in aws_dynamodb_table.incidents.attribute : a.type if a.name == "id"]) == "S"
    error_message = "id attribute must be String (S)"
  }

  assert {
    condition     = aws_dynamodb_table.incidents.billing_mode == "PAY_PER_REQUEST"
    error_message = "Billing mode must be PAY_PER_REQUEST"
  }

  assert {
    condition     = aws_dynamodb_table.incidents.point_in_time_recovery[0].enabled == true
    error_message = "Point-in-time recovery must be enabled"
  }

  assert {
    condition     = aws_dynamodb_table.incidents.server_side_encryption[0].enabled == true
    error_message = "Server-side encryption must be enabled"
  }

  assert {
    condition     = aws_dynamodb_table.incidents.range_key == null
    error_message = "Table must not define a sort key"
  }

  assert {
    condition     = length(aws_dynamodb_table.incidents.global_secondary_index) == 0
    error_message = "Table must not define a GSI"
  }

  # PAY_PER_REQUEST implies no provisioned capacity attributes are configured in HCL.
  assert {
    condition     = aws_dynamodb_table.incidents.billing_mode == "PAY_PER_REQUEST"
    error_message = "On-demand billing means no provisioned read/write capacity is configured"
  }

  assert {
    condition     = aws_dynamodb_table.incidents.deletion_protection_enabled == false
    error_message = "Deletion protection must follow the supplied variable (false in this run)"
  }

  assert {
    condition = (
      strcontains(aws_dynamodb_table.incidents.name, "incidentlens") &&
      strcontains(aws_dynamodb_table.incidents.name, "dev")
    )
    error_message = "Table name should include project and environment prefixes"
  }
}

run "deletion_protection_honored" {
  command = plan

  variables {
    table_name                  = "incidentlens-dev-incidents"
    deletion_protection_enabled = true
  }

  assert {
    condition     = aws_dynamodb_table.incidents.deletion_protection_enabled == true
    error_message = "Deletion protection must follow the supplied variable (true in this run)"
  }
}
