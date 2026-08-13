variable "bucket_name" {
  description = "Globally unique S3 bucket name for frontend static assets."
  type        = string
}

variable "force_destroy" {
  description = "Whether Terraform can destroy the frontend bucket even if it contains objects."
  type        = bool
  default     = false
}

variable "price_class" {
  description = "CloudFront price class (PriceClass_100 is cheapest for US/EU/Israel)."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition = contains(
      ["PriceClass_All", "PriceClass_200", "PriceClass_100"],
      var.price_class,
    )
    error_message = "price_class must be PriceClass_All, PriceClass_200, or PriceClass_100."
  }
}

variable "comment" {
  description = "Human-readable CloudFront distribution comment."
  type        = string
  default     = "IncidentLens AI frontend"
}

variable "tags" {
  description = "Tags applied to frontend hosting resources."
  type        = map(string)
  default     = {}
}
