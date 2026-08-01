output "role_arn" {
  description = "Future API Lambda execution role ARN."
  value       = aws_iam_role.api_lambda.arn
}

output "role_name" {
  description = "Future API Lambda execution role name."
  value       = aws_iam_role.api_lambda.name
}
