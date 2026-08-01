output "bucket_name" {
  description = "Deployment artifact bucket name."
  value       = aws_s3_bucket.artifacts.bucket
}

output "bucket_arn" {
  description = "Deployment artifact bucket ARN."
  value       = aws_s3_bucket.artifacts.arn
}
