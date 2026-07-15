#!/usr/bin/env bash
# Generate .env.deploy.qa / .env.deploy.prod from terraform outputs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/terraform"

if [[ -f ../input.env && -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
  export AWS_ACCESS_KEY_ID=$(grep '^AWS_ACCESS_KEY_ID=' ../input.env | cut -d= -f2)
  export AWS_SECRET_ACCESS_KEY=$(grep '^AWS_SECRET_ACCESS_KEY=' ../input.env | cut -d= -f2)
fi

APP_ID=$(terraform output -raw amplify_app_id)

for ENV in qa prod; do
  JSON=$(terraform output -json "$ENV")
  SITE=$([[ "$ENV" == "prod" ]] && echo "https://skillexchange.tapdot.org" || echo "https://skillexchangeqa.tapdot.org")
  python - "$JSON" "$ENV" "$APP_ID" "$SITE" <<'EOF'
import sys, json
o = json.loads(sys.argv[1]); env = sys.argv[2]; app_id = sys.argv[3]; site = sys.argv[4]
lines = [
    f"VITE_AWS_REGION=us-east-1",
    f"VITE_COGNITO_USER_POOL_ID={o['cognito_user_pool_id']}",
    f"VITE_COGNITO_CLIENT_ID={o['cognito_client_id']}",
    f"VITE_COGNITO_DOMAIN={o['cognito_domain']}",
    f"VITE_API_URL={o['api_url']}",
    f"VITE_SITE_URL={site}",
    f"AMPLIFY_APP_ID={app_id}",
    f"DYNAMODB_TABLE={o['dynamodb_table']}",
    f"SKILLS_BUCKET={o['s3_bucket']}",
]
open(f"../.env.deploy.{env}", "w").write("\n".join(lines) + "\n")
print(f".env.deploy.{env} written")
EOF
done
