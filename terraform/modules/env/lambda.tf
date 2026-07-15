# One zip, many handlers — shared lib/ code ships once, functions differ by
# handler path. CI re-pushes code with update-function-code on every deploy.
data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/src"
  output_path = "${path.module}/../../../lambda/skillexchange-${var.env}.zip"
}

locals {
  common_env = {
    TABLE        = aws_dynamodb_table.main.name
    BUCKET       = aws_s3_bucket.skills.bucket
    ENV_NAME     = var.env
    SITE_URL     = var.site_url
  }

  functions = {
    public = {
      handler = "public.handler"
      timeout = 10
      env     = local.common_env
    }
    user = {
      handler = "user.handler"
      timeout = 20
      env = merge(local.common_env, {
        RAZORPAY_KEY_ID     = var.razorpay_key_id
        RAZORPAY_KEY_SECRET = var.razorpay_key_secret
      })
    }
    admin = {
      handler = "admin.handler"
      timeout = 30
      env = merge(local.common_env, {
        SUPERADMIN_USERNAME = var.superadmin_username
        SUPERADMIN_PASSWORD = var.superadmin_password
        BADGES_JOB_FN       = "skillexchange-${var.env}-badgesjob"
      })
    }
    webhook = {
      handler = "webhook.handler"
      timeout = 20
      env = merge(local.common_env, {
        RAZORPAY_WEBHOOK_SECRET = var.razorpay_webhook_secret
      })
    }
    badgesjob = {
      handler = "badges-job.handler"
      timeout = 120
      env     = local.common_env
    }
    presignup = {
      handler = "presignup.handler"
      timeout = 10
      env = merge(local.common_env, {
        AUTO_CONFIRM = var.auto_confirm_signups ? "true" : "false"
      })
    }
    postconfirm = {
      handler = "postconfirm.handler"
      timeout = 10
      env     = local.common_env
    }
  }
}

resource "aws_lambda_function" "fn" {
  for_each = local.functions

  function_name    = "skillexchange-${var.env}-${each.key}"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  handler          = each.value.handler
  timeout          = each.value.timeout
  memory_size      = 256
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  environment {
    variables = each.value.env
  }
}

# Nightly badge + leaderboard computation (00:30 UTC).
resource "aws_scheduler_schedule" "badges_nightly" {
  name                         = "skillexchange-${var.env}-badges-nightly"
  schedule_expression          = "cron(30 0 * * ? *)"
  schedule_expression_timezone = "UTC"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.fn["badgesjob"].arn
    role_arn = aws_iam_role.lambda.arn
  }
}
