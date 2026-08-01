variable "bucket_name" {
  description = "Globally unique S3 bucket name for deployment artifacts."
  type        = string
}

variable "force_destroy" {
  description = "Whether Terraform can destroy the bucket even if it contains objects."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to the bucket."
  type        = map(string)
  default     = {}
}
