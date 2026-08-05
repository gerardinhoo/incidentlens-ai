output "role_arn" {
  description = "Logs-only Lambda execution role ARN."
  value       = aws_iam_role.lambda.arn
}

output "role_name" {
  description = "Logs-only Lambda execution role name."
  value       = aws_iam_role.lambda.name
}
