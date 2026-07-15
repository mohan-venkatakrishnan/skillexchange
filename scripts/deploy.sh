#!/usr/bin/env bash
# Deploy Skill Exchange to an Amplify branch + refresh Lambda code.
# Usage: ./scripts/deploy.sh qa|prod
# Reads env/secrets from input.env (local) or the environment (CI).
set -euo pipefail

ENV="${1:?usage: deploy.sh qa|prod}"
[[ "$ENV" == "qa" || "$ENV" == "prod" ]] || { echo "env must be qa or prod"; exit 1; }
BRANCH=$([[ "$ENV" == "prod" ]] && echo main || echo qa)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Local convenience: load AWS creds from input.env if not already set.
if [[ -f input.env && -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
  export AWS_ACCESS_KEY_ID=$(grep '^AWS_ACCESS_KEY_ID=' input.env | cut -d= -f2)
  export AWS_SECRET_ACCESS_KEY=$(grep '^AWS_SECRET_ACCESS_KEY=' input.env | cut -d= -f2)
fi
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

# Per-env frontend config comes from .env.deploy.<env> (written by terraform outputs).
ENV_FILE=".env.deploy.$ENV"
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE — run scripts/write-env.sh first"; exit 1; }

echo "── Building frontend ($ENV) ──"
set -a; source "$ENV_FILE"; set +a
export VITE_USE_MOCK=false
npm run build
cp customHttp.yml dist/

echo "── Deploying Lambdas ($ENV) ──"
cd lambda/src && zip -qr ../deploy.zip . && cd "$ROOT"
for fn in public user admin webhook badgesjob presignup postconfirm; do
  aws lambda update-function-code \
    --function-name "skillexchange-$ENV-$fn" \
    --zip-file "fileb://lambda/deploy.zip" --no-cli-pager >/dev/null
  echo "  updated skillexchange-$ENV-$fn"
done

echo "── Deploying frontend to Amplify branch $BRANCH ──"
APP_ID="${AMPLIFY_APP_ID:?AMPLIFY_APP_ID must be set (see .env.deploy.$ENV)}"
cd dist && zip -qr ../dist.zip . && cd "$ROOT"

DEPLOY_JSON=$(aws amplify create-deployment --region us-west-2 --app-id "$APP_ID" --branch-name "$BRANCH" --no-cli-pager)
JOB_ID=$(echo "$DEPLOY_JSON" | python -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
UPLOAD_URL=$(echo "$DEPLOY_JSON" | python -c "import sys,json;print(json.load(sys.stdin)['zipUploadUrl'])")
curl -sf -H "Content-Type: application/zip" --upload-file dist.zip "$UPLOAD_URL"
aws amplify start-deployment --region us-west-2 --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" --no-cli-pager >/dev/null

echo "── Waiting for Amplify job $JOB_ID ──"
for i in $(seq 1 40); do
  STATUS=$(aws amplify get-job --region us-west-2 --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" \
    --query 'job.summary.status' --output text --no-cli-pager)
  [[ "$STATUS" == "SUCCEED" ]] && { echo "deploy SUCCEED"; exit 0; }
  [[ "$STATUS" == "FAILED" || "$STATUS" == "CANCELLED" ]] && { echo "deploy $STATUS"; exit 1; }
  sleep 10
done
echo "deploy timed out"; exit 1
