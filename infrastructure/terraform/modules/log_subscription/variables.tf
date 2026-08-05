variable "filter_name" {
  description = "CloudWatch Logs subscription filter name."
  type        = string
}

variable "log_group_name" {
  description = "Source CloudWatch log group name (API Lambda application logs)."
  type        = string
}

variable "log_group_arn" {
  description = "Source CloudWatch log group ARN (used to scope Lambda permission)."
  type        = string
}

variable "destination_lambda_function_name" {
  description = "Processor Lambda function name."
  type        = string
}

variable "destination_lambda_arn" {
  description = "Processor Lambda function ARN (subscription destination)."
  type        = string
}

variable "filter_pattern" {
  description = "CloudWatch Logs filter pattern (JSON field match for incident candidates)."
  type        = string
}

variable "aws_region" {
  description = "AWS region used to build the CloudWatch Logs service principal."
  type        = string
}
