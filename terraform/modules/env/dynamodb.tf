# Single-table design (see CLAUDE.md §3). PAY_PER_REQUEST stays inside the
# permanent free tier at this scale.
#
# Entities:
#   USER#<userId>          / PROFILE                — user profile
#   USERNAME#<username>    / CLAIM                  — uniqueness claim (conditional put)
#   SKILL#<skillId>        / META                   — skill listing
#   SKILL#<skillId>        / REVIEW#<reviewId>      — review
#   PURCHASE#<purchaseId>  / META                   — purchase ledger
#   VERIFY#<applicationId> / META                   — verification application
#   LEADERBOARD            / BUILDERS | SKILLS      — nightly job output
#   STATS                  / GLOBAL                 — nightly job output
#
# GSI1: category browse+sort        (GSI1PK=CAT#<category>,   GSI1SK=downloadsCount)
# GSI2: skills by seller            (GSI2PK=SELLER#<userId>,  GSI2SK=createdAt)
# GSI3: library by buyer            (GSI3PK=BUYER#<userId>,   GSI3SK=purchasedAt)
# GSI4: by status (skills + verification apps, key-prefixed)
#       (GSI4PK=SKILL#<status> | VERIFY#<status>,  GSI4SK=createdAt/submittedAt)
resource "aws_dynamodb_table" "main" {
  name         = "SkillExchange-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI1SK"
    type = "N"
  }
  attribute {
    name = "GSI2PK"
    type = "S"
  }
  attribute {
    name = "GSI2SK"
    type = "S"
  }
  attribute {
    name = "GSI3PK"
    type = "S"
  }
  attribute {
    name = "GSI3SK"
    type = "S"
  }
  attribute {
    name = "GSI4PK"
    type = "S"
  }
  attribute {
    name = "GSI4SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }
  global_secondary_index {
    name            = "GSI2"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }
  global_secondary_index {
    name            = "GSI3"
    hash_key        = "GSI3PK"
    range_key       = "GSI3SK"
    projection_type = "ALL"
  }
  global_secondary_index {
    name            = "GSI4"
    hash_key        = "GSI4PK"
    range_key       = "GSI4SK"
    projection_type = "ALL"
  }
}
