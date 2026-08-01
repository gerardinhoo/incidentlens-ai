output "table_name" {
  description = "Incidents DynamoDB table name."
  value       = aws_dynamodb_table.incidents.name
}

output "table_arn" {
  description = "Incidents DynamoDB table ARN."
  value       = aws_dynamodb_table.incidents.arn
}
