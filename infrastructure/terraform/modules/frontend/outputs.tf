output "bucket_name" {
  description = "Frontend static asset S3 bucket name."
  value       = aws_s3_bucket.frontend.bucket
}

output "bucket_arn" {
  description = "Frontend static asset S3 bucket ARN."
  value       = aws_s3_bucket.frontend.arn
}

output "bucket_regional_domain_name" {
  description = "Regional S3 REST endpoint used as the CloudFront origin."
  value       = aws_s3_bucket.frontend.bucket_regional_domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID."
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN."
  value       = aws_cloudfront_distribution.frontend.arn
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name (*.cloudfront.net)."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_url" {
  description = "HTTPS URL for the frontend (default CloudFront domain)."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "origin_access_control_id" {
  description = "CloudFront Origin Access Control ID."
  value       = aws_cloudfront_origin_access_control.frontend.id
}
