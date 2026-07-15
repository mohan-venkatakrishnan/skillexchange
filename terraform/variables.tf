variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "google_client_id" {
  type      = string
  sensitive = true
}

variable "google_client_secret" {
  type      = string
  sensitive = true
}

variable "razorpay_key_id" {
  type      = string
  sensitive = true
  default   = "" # blank until Razorpay onboarding completes; buy endpoint returns 503
}

variable "razorpay_key_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "razorpay_webhook_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "superadmin_username" {
  type      = string
  sensitive = true
}

variable "superadmin_password" {
  type      = string
  sensitive = true
}

variable "alert_email" {
  type = string
}
