variable "function_name" {
  description = "Lambda function name (should match the pre-created log group suffix)."
  type        = string
}

variable "description" {
  description = "Human-readable Lambda description."
  type        = string
  default     = "IncidentLens AI Fastify API"
}

variable "execution_role_arn" {
  description = "IAM role ARN for the Lambda execution role (from the IAM module)."
  type        = string
}

variable "package_source_dir" {
  description = "Directory containing the built Lambda package (apps/, packages/, node_modules/, package.json)."
  type        = string
}

variable "handler" {
  description = "Lambda handler entrypoint."
  type        = string
  default     = "apps/demo-api/src/lambda.handler"
}

variable "runtime" {
  description = "Lambda runtime."
  type        = string
  default     = "nodejs22.x"
}

variable "architectures" {
  description = "Lambda instruction set architecture."
  type        = list(string)
  default     = ["arm64"]
}

variable "timeout" {
  description = "Lambda timeout in seconds."
  type        = number
  default     = 30
}

variable "memory_size" {
  description = "Lambda memory in MB."
  type        = number
  default     = 512
}

variable "log_group_name" {
  description = "Existing CloudWatch log group name for this function."
  type        = string
}

variable "environment_variables" {
  description = "Environment variables for the Lambda function."
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags applied to the Lambda function."
  type        = map(string)
  default     = {}
}
