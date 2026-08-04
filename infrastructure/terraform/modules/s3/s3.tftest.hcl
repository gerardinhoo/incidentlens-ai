mock_provider "aws" {
  mock_resource "aws_s3_bucket" {
    defaults = {
      id     = "incidentlens-dev-artifacts-123456789012"
      arn    = "arn:aws:s3:::incidentlens-dev-artifacts-123456789012"
      bucket = "incidentlens-dev-artifacts-123456789012"
    }
  }
}

run "artifact_bucket_hardening" {
  command = plan

  variables {
    bucket_name   = "incidentlens-dev-artifacts-123456789012"
    force_destroy = false
  }

  assert {
    condition = (
      aws_s3_bucket_public_access_block.artifacts.block_public_acls &&
      aws_s3_bucket_public_access_block.artifacts.block_public_policy &&
      aws_s3_bucket_public_access_block.artifacts.ignore_public_acls &&
      aws_s3_bucket_public_access_block.artifacts.restrict_public_buckets
    )
    error_message = "All public access block settings must be enabled"
  }

  assert {
    condition = anytrue([
      for cfg in aws_s3_bucket_versioning.artifacts.versioning_configuration :
      cfg.status == "Enabled"
    ])
    error_message = "Versioning must be enabled"
  }

  assert {
    condition = anytrue([
      for rule in aws_s3_bucket_server_side_encryption_configuration.artifacts.rule :
      anytrue([
        for d in rule.apply_server_side_encryption_by_default : d.sse_algorithm == "AES256"
      ])
    ])
    error_message = "Server-side encryption must use AES256"
  }

  assert {
    condition = anytrue([
      for rule in aws_s3_bucket_ownership_controls.artifacts.rule :
      rule.object_ownership == "BucketOwnerEnforced"
    ])
    error_message = "Ownership controls must be BucketOwnerEnforced"
  }

  assert {
    condition     = aws_s3_bucket.artifacts.force_destroy == false
    error_message = "force_destroy must follow the supplied variable (false in this run)"
  }
}

run "force_destroy_honored" {
  command = plan

  variables {
    bucket_name   = "incidentlens-dev-artifacts-123456789012"
    force_destroy = true
  }

  assert {
    condition     = aws_s3_bucket.artifacts.force_destroy == true
    error_message = "force_destroy must follow the supplied variable (true in this run)"
  }
}
