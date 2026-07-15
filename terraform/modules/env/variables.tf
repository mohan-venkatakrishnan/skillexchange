variable "env" { type = string }
variable "account_id" { type = string }
variable "aws_region" { type = string }
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
  default   = ""
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
variable "site_url" { type = string }
variable "extra_callback_urls" {
  type    = list(string)
  default = []
}
variable "auto_confirm_signups" {
  type    = bool
  default = false
}
