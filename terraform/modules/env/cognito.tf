# Cognito per environment. Email is the sign-in identifier; the permanent,
# unique marketplace username lives in custom:username (immutable once set).
# Uniqueness is enforced by the PreSignUp Lambda via a conditional put on a
# USERNAME#<name> claim item — Cognito itself can't enforce this.
resource "aws_cognito_user_pool" "users" {
  name = "skillexchange-${var.env}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  schema {
    name                     = "username"
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = false # permanent, no rename endpoint
    required                 = false
    string_attribute_constraints {
      min_length = 3
      max_length = 24
    }
  }

  lambda_config {
    pre_sign_up       = aws_lambda_function.fn["presignup"].arn
    post_confirmation = aws_lambda_function.fn["postconfirm"].arn
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.users.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    email    = "email"
    username = "sub"
    name     = "name"
  }

  lifecycle {
    ignore_changes = [provider_details]
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "skillexchange-${var.env}-web"
  user_pool_id = aws_cognito_user_pool.users.id

  generate_secret = false
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
  ]

  supported_identity_providers = ["COGNITO", aws_cognito_identity_provider.google.provider_name]

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  callback_urls = concat(["${var.site_url}/auth/callback"], var.extra_callback_urls)
  logout_urls   = concat([var.site_url], [for u in var.extra_callback_urls : replace(u, "/auth/callback", "")])

  # Cognito's 1h default logs users out mid-session (LaunchPad lesson) → 24h.
  token_validity_units {
    id_token      = "hours"
    access_token  = "hours"
    refresh_token = "days"
  }
  id_token_validity      = 24
  access_token_validity  = 24
  refresh_token_validity = 30

  read_attributes  = ["email", "name", "custom:username"]
  write_attributes = ["email", "name", "custom:username"]
}

resource "aws_cognito_user_pool_domain" "auth" {
  domain       = "skillexchange-${var.env}-${var.account_id}"
  user_pool_id = aws_cognito_user_pool.users.id
}

resource "aws_lambda_permission" "cognito_presignup" {
  statement_id  = "AllowCognitoPreSignup"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn["presignup"].function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.users.arn
}

resource "aws_lambda_permission" "cognito_postconfirm" {
  statement_id  = "AllowCognitoPostConfirm"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn["postconfirm"].function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.users.arn
}
