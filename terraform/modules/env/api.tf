resource "aws_api_gateway_rest_api" "api" {
  name = "skillexchange-${var.env}-api"
}

resource "aws_api_gateway_authorizer" "cognito" {
  name          = "skillexchange-${var.env}-cognito"
  rest_api_id   = aws_api_gateway_rest_api.api.id
  type          = "COGNITO_USER_POOLS"
  provider_arns = [aws_cognito_user_pool.users.arn]
}

# ── Resource tree ──
resource "aws_api_gateway_resource" "stats" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "stats"
}
resource "aws_api_gateway_resource" "skills" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "skills"
}
resource "aws_api_gateway_resource" "skill_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.skills.id
  path_part   = "{id}"
}
resource "aws_api_gateway_resource" "skill_reviews" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.skill_id.id
  path_part   = "reviews"
}
resource "aws_api_gateway_resource" "skill_submit" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.skill_id.id
  path_part   = "submit"
}
resource "aws_api_gateway_resource" "skill_buy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.skill_id.id
  path_part   = "buy"
}
resource "aws_api_gateway_resource" "skill_confirm" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.skill_id.id
  path_part   = "confirm"
}
resource "aws_api_gateway_resource" "skill_download" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.skill_id.id
  path_part   = "download"
}
resource "aws_api_gateway_resource" "profiles" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "profiles"
}
resource "aws_api_gateway_resource" "profile_username" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.profiles.id
  path_part   = "{username}"
}
resource "aws_api_gateway_resource" "leaderboard" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "leaderboard"
}
resource "aws_api_gateway_resource" "username_check" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "username-check"
}
resource "aws_api_gateway_resource" "me" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "me"
}
resource "aws_api_gateway_resource" "me_avatar" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.me.id
  path_part   = "avatar"
}
resource "aws_api_gateway_resource" "me_username" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.me.id
  path_part   = "username"
}
resource "aws_api_gateway_resource" "library" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "library"
}
resource "aws_api_gateway_resource" "verify" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "verify"
}
resource "aws_api_gateway_resource" "admin" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "admin"
}
resource "aws_api_gateway_resource" "admin_proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "{proxy+}"
}
resource "aws_api_gateway_resource" "webhook" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "webhook"
}
resource "aws_api_gateway_resource" "webhook_razorpay" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.webhook.id
  path_part   = "razorpay"
}

# ── Routes map: method + resource + lambda + auth ──
locals {
  routes = {
    "GET stats"            = { resource = aws_api_gateway_resource.stats.id, method = "GET", fn = "public", auth = false }
    "GET skills"           = { resource = aws_api_gateway_resource.skills.id, method = "GET", fn = "public", auth = false }
    "GET skill"            = { resource = aws_api_gateway_resource.skill_id.id, method = "GET", fn = "public", auth = false }
    "GET reviews"          = { resource = aws_api_gateway_resource.skill_reviews.id, method = "GET", fn = "public", auth = false }
    "GET profile"          = { resource = aws_api_gateway_resource.profile_username.id, method = "GET", fn = "public", auth = false }
    "GET leaderboard"      = { resource = aws_api_gateway_resource.leaderboard.id, method = "GET", fn = "public", auth = false }
    "GET username-check"   = { resource = aws_api_gateway_resource.username_check.id, method = "GET", fn = "public", auth = false }
    "GET me"               = { resource = aws_api_gateway_resource.me.id, method = "GET", fn = "user", auth = true }
    # These three existed as handlers in user.mjs but had no route. API Gateway
    # answers an undefined method by falling back to IAM auth, so "Save
    # changes" failed with a SigV4 "Authorization header requires 'Credential'"
    # error rather than a 404 — which is why it looked like a token problem.
    "POST me"              = { resource = aws_api_gateway_resource.me.id, method = "POST", fn = "user", auth = true }
    "POST me avatar"       = { resource = aws_api_gateway_resource.me_avatar.id, method = "POST", fn = "user", auth = true }
    "POST me username"     = { resource = aws_api_gateway_resource.me_username.id, method = "POST", fn = "user", auth = true }
    "GET library"          = { resource = aws_api_gateway_resource.library.id, method = "GET", fn = "user", auth = true }
    "POST verify"          = { resource = aws_api_gateway_resource.verify.id, method = "POST", fn = "user", auth = true }
    "POST skills"          = { resource = aws_api_gateway_resource.skills.id, method = "POST", fn = "user", auth = true }
    "POST submit"          = { resource = aws_api_gateway_resource.skill_submit.id, method = "POST", fn = "user", auth = true }
    "POST reviews"         = { resource = aws_api_gateway_resource.skill_reviews.id, method = "POST", fn = "user", auth = true }
    "POST buy"             = { resource = aws_api_gateway_resource.skill_buy.id, method = "POST", fn = "user", auth = true }
    "POST confirm"         = { resource = aws_api_gateway_resource.skill_confirm.id, method = "POST", fn = "user", auth = true }
    "POST download"        = { resource = aws_api_gateway_resource.skill_download.id, method = "POST", fn = "user", auth = true }
    "ANY admin"            = { resource = aws_api_gateway_resource.admin_proxy.id, method = "ANY", fn = "admin", auth = false }
    "POST webhook"         = { resource = aws_api_gateway_resource.webhook_razorpay.id, method = "POST", fn = "webhook", auth = false }
  }

  # Resources that browsers call directly need an OPTIONS preflight.
  cors_resources = {
    stats            = aws_api_gateway_resource.stats.id
    skills           = aws_api_gateway_resource.skills.id
    skill_id         = aws_api_gateway_resource.skill_id.id
    skill_reviews    = aws_api_gateway_resource.skill_reviews.id
    skill_submit     = aws_api_gateway_resource.skill_submit.id
    skill_buy        = aws_api_gateway_resource.skill_buy.id
    skill_confirm    = aws_api_gateway_resource.skill_confirm.id
    skill_download   = aws_api_gateway_resource.skill_download.id
    profile_username = aws_api_gateway_resource.profile_username.id
    leaderboard      = aws_api_gateway_resource.leaderboard.id
    username_check   = aws_api_gateway_resource.username_check.id
    me               = aws_api_gateway_resource.me.id
    me_avatar        = aws_api_gateway_resource.me_avatar.id
    me_username      = aws_api_gateway_resource.me_username.id
    library          = aws_api_gateway_resource.library.id
    verify           = aws_api_gateway_resource.verify.id
    admin_proxy      = aws_api_gateway_resource.admin_proxy.id
  }
}

resource "aws_api_gateway_method" "route" {
  for_each = local.routes

  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = each.value.resource
  http_method   = each.value.method
  authorization = each.value.auth ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = each.value.auth ? aws_api_gateway_authorizer.cognito.id : null
}

resource "aws_api_gateway_integration" "route" {
  for_each = local.routes

  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = each.value.resource
  http_method             = aws_api_gateway_method.route[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.fn[each.value.fn].invoke_arn
}

# ── CORS preflight (MOCK OPTIONS) ──
resource "aws_api_gateway_method" "options" {
  for_each = local.cors_resources

  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = each.value
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options" {
  for_each = local.cors_resources

  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = each.value
  http_method = aws_api_gateway_method.options[each.key].http_method
  type        = "MOCK"
  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "options" {
  for_each = local.cors_resources

  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = each.value
  http_method = "OPTIONS"
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
  depends_on = [aws_api_gateway_method.options]
}

resource "aws_api_gateway_integration_response" "options" {
  for_each = local.cors_resources

  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = each.value
  http_method = "OPTIONS"
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Superadmin-Username,X-Superadmin-Password'"
  }
  depends_on = [aws_api_gateway_integration.options, aws_api_gateway_method_response.options]
}

# API Gateway's OWN error responses (authorizer 401s!) lack CORS by default —
# browsers then report "network error" and the app's 401 handling never fires.
resource "aws_api_gateway_gateway_response" "cors" {
  for_each = toset(["UNAUTHORIZED", "ACCESS_DENIED", "EXPIRED_TOKEN", "DEFAULT_4XX", "DEFAULT_5XX"])

  rest_api_id   = aws_api_gateway_rest_api.api.id
  response_type = each.value
  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Superadmin-Username,X-Superadmin-Password'"
  }
}

resource "aws_lambda_permission" "apigw" {
  for_each = toset(["public", "user", "admin", "webhook"])

  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn[each.value].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*"
}

# Stage snapshots go stale after route changes — redeploy on any change.
resource "aws_api_gateway_deployment" "api" {
  rest_api_id = aws_api_gateway_rest_api.api.id

  triggers = {
    redeployment = sha1(jsonencode([
      local.routes, local.cors_resources,
      aws_api_gateway_integration.route,
      aws_api_gateway_integration_response.options,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration.route,
    aws_api_gateway_integration.options,
    aws_api_gateway_integration_response.options,
  ]
}

resource "aws_api_gateway_stage" "live" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  deployment_id = aws_api_gateway_deployment.api.id
  stage_name    = var.env
}
