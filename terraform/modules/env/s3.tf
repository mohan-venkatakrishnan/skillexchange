# Skill files + POC screenshots. Fully private; access is presigned-URL only.
resource "aws_s3_bucket" "skills" {
  bucket = "skillexchange-${var.env}-${var.account_id}"
}

resource "aws_s3_bucket_public_access_block" "skills" {
  bucket                  = aws_s3_bucket.skills.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "skills" {
  bucket = aws_s3_bucket.skills.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET"]
    allowed_origins = concat([var.site_url], ["http://localhost:5174"])
    max_age_seconds = 3600
  }
}
