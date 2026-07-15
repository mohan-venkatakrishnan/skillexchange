# Skill Exchange

The GitHub for AI skills — buy and sell reusable SKILL.md workflows that power real products.
`skillexchange.tapdot.org` (prod) · `skillexchangeqa.tapdot.org` (QA).

## Stack

React/Vite SPA on AWS Amplify Hosting · Lambda (Node 22) + API Gateway ·
DynamoDB single-table (`SkillExchange-qa` / `SkillExchange-prod`) · S3 presigned
uploads/downloads · Cognito (email/password + Google) · EventBridge nightly
badges job · Razorpay (one-time payments, 10% commission) · Terraform for ALL infra.

## Local development

```bash
cp .env.example .env      # VITE_USE_MOCK=true works with zero backend
npm install
npm run dev               # http://localhost:5174
```

Mock mode serves the prototype dataset through the same `lib/api.js` interface
the live backend uses.

## Tests

| Layer | Command | What it covers |
|---|---|---|
| Unit | `npm run test:unit` | badge/leaderboard computation, commission math, webhook + checkout signature verification, http helpers |
| E2E (mock) | `npm run test:e2e` | full browse/filter/auth-gate flows vs a local preview build |
| Live regression | `npm run test:regression` | deployed env: deep-link 200s, security headers, 390px overflow sentinel, API auth rejections, webhook signature rejection, real sign-in round-trip. `REGRESSION_URL` picks the target (default QA). |

CI runs unit + e2e on every push, deploys, then gates the release on the live
regression suite. A nightly cron re-runs regression against QA and prod.

## Deploy

```bash
bash scripts/deploy.sh qa    # or prod
```

Builds with `.env.deploy.<env>`, refreshes all 7 Lambdas, pushes `dist/` to the
matching Amplify branch (manual deployment API), waits for SUCCEED.

## Operations

- **Seed QA**: `node scripts/seed-qa.mjs <qa-api-url>` (40 sellers, 220 skills, reviews; then runs the badges job).
- **Superadmin** (QA data management + moderation): REST under `/admin/*` with
  `X-Superadmin-Username/-Password` headers — approve/reject/flag skills,
  verification queue, badge grant/revoke, `run-badges-job`, bulk seed.
- **Badges/leaderboard/stats** recompute nightly at 00:30 UTC (EventBridge) and
  on demand via `/admin/run-badges-job`.
- **Payments**: Razorpay keys land in `terraform.tfvars` → `terraform apply`.
  Until then `/buy` returns a friendly 503. The webhook is signature-verified
  and idempotent; commission (10%) is stored per transaction at purchase time.

## Terraform

```bash
cd terraform && terraform apply
```

One reusable `modules/env` instantiated as `qa` + `prod` — the two environments
are structurally identical by construction; only table/bucket/pool names differ.
Amplify lives in us-west-2 (us-east-1 CreateApp is throttled on this account).
