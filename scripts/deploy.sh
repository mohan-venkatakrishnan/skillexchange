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
# zip may be absent on Windows shells — python zipfile works everywhere
python -c "import shutil; shutil.make_archive('lambda/deploy', 'zip', 'lambda/src')"
for fn in public user admin webhook badgesjob presignup postconfirm; do
  aws lambda update-function-code \
    --function-name "skillexchange-$ENV-$fn" \
    --zip-file "fileb://lambda/deploy.zip" >/dev/null
  echo "  updated skillexchange-$ENV-$fn"
done

echo "── Deploying frontend to Amplify branch $BRANCH ──"
APP_ID="${AMPLIFY_APP_ID:?AMPLIFY_APP_ID must be set (see .env.deploy.$ENV)}"
python -c "import shutil; shutil.make_archive('dist', 'zip', 'dist')"

DEPLOY_JSON=$(aws amplify create-deployment --region us-west-1 --app-id "$APP_ID" --branch-name "$BRANCH")
JOB_ID=$(echo "$DEPLOY_JSON" | python -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
UPLOAD_URL=$(echo "$DEPLOY_JSON" | python -c "import sys,json;print(json.load(sys.stdin)['zipUploadUrl'])")
curl -sf -H "Content-Type: application/zip" --upload-file dist.zip "$UPLOAD_URL"
aws amplify start-deployment --region us-west-1 --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" >/dev/null

echo "── Waiting for Amplify job $JOB_ID ──"
DEPLOYED=""
for i in $(seq 1 40); do
  STATUS=$(aws amplify get-job --region us-west-1 --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" \
    --query 'job.summary.status' --output text)
  [[ "$STATUS" == "SUCCEED" ]] && { echo "amplify job SUCCEED"; DEPLOYED=1; break; }
  [[ "$STATUS" == "FAILED" || "$STATUS" == "CANCELLED" ]] && { echo "deploy $STATUS"; exit 1; }
  sleep 10
done
[[ -n "$DEPLOYED" ]] || { echo "deploy timed out"; exit 1; }

# "Job SUCCEED" is not "the new build is being served" — CloudFront needs a
# moment to pick it up, and the custom security headers arrive with it. The
# release gate must not run against the previous bundle, so wait until the
# live HTML references the hash we just built.
BUNDLE=$(ls dist/assets/index-*.js | head -1 | xargs -n1 basename)
echo "── Waiting for ${VITE_SITE_URL} to serve $BUNDLE ──"
for i in $(seq 1 30); do
  LIVE=$(curl -sS --max-time 15 "${VITE_SITE_URL}/?cachebust=$i" 2>/dev/null || true)
  if grep -q "$BUNDLE" <<<"$LIVE"; then
    if curl -sSI --max-time 15 "${VITE_SITE_URL}/" 2>/dev/null | grep -qi '^strict-transport-security'; then
      echo "live and serving $BUNDLE with security headers"
      exit 0
    fi
  fi
  sleep 10
done
echo "timed out waiting for $BUNDLE to go live"; exit 1
