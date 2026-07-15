output "summary" {
  value = {
    api_url              = "${aws_api_gateway_stage.live.invoke_url}"
    cognito_user_pool_id = aws_cognito_user_pool.users.id
    cognito_client_id    = aws_cognito_user_pool_client.web.id
    cognito_domain       = "${aws_cognito_user_pool_domain.auth.domain}.auth.${var.aws_region}.amazoncognito.com"
    dynamodb_table       = aws_dynamodb_table.main.name
    s3_bucket            = aws_s3_bucket.skills.bucket
    google_redirect_uri  = "https://${aws_cognito_user_pool_domain.auth.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/idpresponse"
  }
}
