resource "aws_sns_topic" "incidents" {
  name = var.topic_name

  # SNS-managed AWS key (alias/aws/sns) — no custom KMS key required.
  kms_master_key_id = "alias/aws/sns"

  tags = var.tags
}

resource "aws_sns_topic_subscription" "email" {
  count = var.notification_email != null && trimspace(var.notification_email) != "" ? 1 : 0

  topic_arn = aws_sns_topic.incidents.arn
  protocol  = "email"
  endpoint  = trimspace(var.notification_email)
}
