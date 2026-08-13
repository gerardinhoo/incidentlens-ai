mock_provider "aws" {
  mock_data "aws_cloudfront_cache_policy" {
    defaults = {
      id   = "658327ea-f89d-4fab-a63d-7e88639e58f6"
      name = "Managed-CachingOptimized"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      id   = "mock-frontend-bucket-policy"
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"s3:GetObject\",\"Resource\":\"*\"}]}"
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      id                          = "incidentlens-dev-web-123456789012"
      arn                         = "arn:aws:s3:::incidentlens-dev-web-123456789012"
      bucket                      = "incidentlens-dev-web-123456789012"
      bucket_regional_domain_name = "incidentlens-dev-web-123456789012.s3.us-east-1.amazonaws.com"
    }
  }

  mock_resource "aws_cloudfront_origin_access_control" {
    defaults = {
      id   = "E2OACMOCK12345"
      name = "incidentlens-dev-web-123456789012-oac"
    }
  }

  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      id          = "E123456789ABCD"
      arn         = "arn:aws:cloudfront::123456789012:distribution/E123456789ABCD"
      domain_name = "d111111abcdef8.cloudfront.net"
      status      = "Deployed"
    }
  }
}

run "frontend_hosting_plan" {
  command = plan

  variables {
    bucket_name   = "incidentlens-dev-web-123456789012"
    force_destroy = false
    price_class   = "PriceClass_100"
    comment       = "IncidentLens AI frontend (dev)"
  }

  assert {
    condition = (
      aws_s3_bucket_public_access_block.frontend.block_public_acls &&
      aws_s3_bucket_public_access_block.frontend.block_public_policy &&
      aws_s3_bucket_public_access_block.frontend.ignore_public_acls &&
      aws_s3_bucket_public_access_block.frontend.restrict_public_buckets
    )
    error_message = "Frontend bucket must block all public access"
  }

  assert {
    condition = anytrue([
      for rule in aws_s3_bucket_ownership_controls.frontend.rule :
      rule.object_ownership == "BucketOwnerEnforced"
    ])
    error_message = "Frontend bucket ownership must be BucketOwnerEnforced"
  }

  assert {
    condition = anytrue([
      for rule in aws_s3_bucket_server_side_encryption_configuration.frontend.rule :
      anytrue([
        for d in rule.apply_server_side_encryption_by_default : d.sse_algorithm == "AES256"
      ])
    ])
    error_message = "Frontend bucket must use AES256 encryption"
  }

  assert {
    condition = (
      aws_cloudfront_origin_access_control.frontend.origin_access_control_origin_type == "s3" &&
      aws_cloudfront_origin_access_control.frontend.signing_behavior == "always" &&
      aws_cloudfront_origin_access_control.frontend.signing_protocol == "sigv4"
    )
    error_message = "OAC must use SigV4 always for S3 origins"
  }

  assert {
    condition     = aws_cloudfront_distribution.frontend.default_root_object == "index.html"
    error_message = "CloudFront default root object must be index.html"
  }

  assert {
    condition     = aws_cloudfront_distribution.frontend.price_class == "PriceClass_100"
    error_message = "CloudFront price class must follow the input (PriceClass_100)"
  }

  assert {
    condition = alltrue([
      for behavior in aws_cloudfront_distribution.frontend.default_cache_behavior :
      behavior.viewer_protocol_policy == "redirect-to-https" &&
      behavior.compress == true &&
      contains(behavior.allowed_methods, "GET") &&
      contains(behavior.allowed_methods, "HEAD")
    ])
    error_message = "Default cache behavior must redirect to HTTPS, compress, and allow GET/HEAD"
  }

  assert {
    condition = length([
      for err in aws_cloudfront_distribution.frontend.custom_error_response :
      err if contains([403, 404], err.error_code) && err.response_page_path == "/index.html" && err.response_code == 200
    ]) == 2
    error_message = "SPA fallback must map 403 and 404 to /index.html with HTTP 200"
  }

  assert {
    condition     = aws_s3_bucket.frontend.force_destroy == false
    error_message = "force_destroy must follow the supplied variable"
  }
}
