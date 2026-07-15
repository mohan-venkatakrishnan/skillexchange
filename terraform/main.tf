terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project   = "skillexchange"
      ManagedBy = "terraform"
    }
  }
}

# Amplify lives in us-west-1: this account has a hidden limit of ONE Amplify
# app per region (launchpad holds us-east-1, peerreview holds us-west-2 —
# CreateApp elsewhere fails as "Rate exceeded"/"maximum number of apps").
# Region is irrelevant for a static SPA — Amplify serves through CloudFront.
provider "aws" {
  alias  = "uswest1"
  region = "us-west-1"
  default_tags {
    tags = {
      Project   = "skillexchange"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
}

module "qa" {
  source = "./modules/env"

  env                  = "qa"
  account_id           = local.account_id
  aws_region           = var.aws_region
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  razorpay_key_id      = var.razorpay_key_id
  razorpay_key_secret  = var.razorpay_key_secret
  razorpay_webhook_secret = var.razorpay_webhook_secret
  superadmin_username  = var.superadmin_username
  superadmin_password  = var.superadmin_password
  site_url             = "https://skillexchangeqa.tapdot.org"
  extra_callback_urls  = ["http://localhost:5174/auth/callback"]
  auto_confirm_signups = true # QA: deterministic tests, no email round-trip
}

module "prod" {
  source = "./modules/env"

  env                  = "prod"
  account_id           = local.account_id
  aws_region           = var.aws_region
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  razorpay_key_id      = var.razorpay_key_id
  razorpay_key_secret  = var.razorpay_key_secret
  razorpay_webhook_secret = var.razorpay_webhook_secret
  superadmin_username  = var.superadmin_username
  superadmin_password  = var.superadmin_password
  site_url             = "https://skillexchange.tapdot.org"
  extra_callback_urls  = []
  auto_confirm_signups = false
}
