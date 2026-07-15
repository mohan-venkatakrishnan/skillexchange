# One Amplify app, two branches (manual deployments — the proven LaunchPad/
# PeerReview pattern; CI pushes dist/ zips via create-deployment).
# main → skillexchange.tapdot.org, qa → skillexchangeqa.tapdot.org.
resource "aws_amplify_app" "skillexchange" {
  provider = aws.uswest1
  name = "skillexchange"

  # SPA rewrites: extensionless routes must return real HTTP 200 (not 404-200
  # fallback alone) so crawlers/unfurlers see 200s.
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|svg|txt|map|json|webmanifest)$)([^.]+$)/>"
    status = "200"
    target = "/index.html"
  }
  custom_rule {
    source = "/<*>"
    status = "404-200"
    target = "/index.html"
  }
}

resource "aws_amplify_branch" "main" {
  provider = aws.uswest1
  app_id      = aws_amplify_app.skillexchange.id
  branch_name = "main"
  stage       = "PRODUCTION"
}

resource "aws_amplify_branch" "qa" {
  provider = aws.uswest1
  app_id      = aws_amplify_app.skillexchange.id
  branch_name = "qa"
  stage       = "DEVELOPMENT"
}

resource "aws_amplify_domain_association" "tapdot" {
  provider = aws.uswest1
  app_id                = aws_amplify_app.skillexchange.id
  domain_name           = "tapdot.org"
  wait_for_verification = false

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = "skillexchange"
  }
  sub_domain {
    branch_name = aws_amplify_branch.qa.branch_name
    prefix      = "skillexchangeqa"
  }
}
