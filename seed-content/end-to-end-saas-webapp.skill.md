---
title: End-to-End SaaS Web App Skill (AWS Serverless)
category: Coding
description: Build a complete production SaaS — React/Vite SPA, Cognito auth, API Gateway + Lambda + DynamoDB, all in Terraform — with the exact gotcha fixes (24h tokens, CORS on error responses, SPA rewrites, billing alarms) that cost real debugging days on a shipped product. Distilled from launch.tapdot.org, a live solo-built SaaS running on this exact stack for under $5/month.
usage: Load this skill at the start of any session where you're building or extending a serverless SaaS. Tell the AI your product name and entities, then work through Section 5's steps in order — infrastructure first, auth second, features third. Every pattern here maps to a real file the AI should generate.
platforms: [Claude, Cursor]
priceUsd: 6
timeSavedHours: 40
pocUrl: https://launch.tapdot.org
---
# End-to-End SaaS Web App Skill (AWS Serverless)

## 1. Philosophy

This skill encodes how a solo developer ships a real SaaS on AWS for pocket change, learned by shipping one (launch.tapdot.org). The core beliefs:

- **Billing alarms before the first resource.** The first `terraform apply` of the project creates an AWS Budget and two CloudWatch billing alarms. Not after auth. Not after MVP. First. A runaway Lambda loop discovered by an email at $2.50 is an anecdote; discovered by an invoice at $400 it's a crisis.
- **Everything is Terraform.** Every console click you make will be silently reverted by the next `apply`. If you must experiment in the console, mirror it into `.tf` files the same hour.
- **Local state is the source of truth.** Server responses never replace client state wholesale. A slow GET landing after a local edit will wipe the edit — guard every fetch-then-set with a version counter or a merge.
- **Pay-per-request everything.** DynamoDB `PAY_PER_REQUEST`, Lambda, API Gateway REST. Zero idle cost. A SaaS with 50 users on this stack costs under $5/month, and the budget alarm proves it.
- **The unhappy path is the product.** Expired tokens, 401s without CORS headers, deep links serving 404 to crawlers — users judge you on exactly the paths you didn't test.

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite SPA | Instant dev server, trivial static hosting |
| Hosting | AWS Amplify Hosting (static artifact deploy) | CDN + custom domain + custom headers, no servers |
| Auth | Cognito User Pool + Hosted UI (Google federation, code flow) | Free to 50k MAU, no auth code to own |
| API | API Gateway REST + Cognito authorizer | Authorizer validates JWTs before your code runs |
| Compute | Lambda (Node 20, ESM `index.mjs`) | Zero idle cost |
| Data | DynamoDB, `PAY_PER_REQUEST` | Permanent free tier, no connection pools |
| IaC | Terraform, one directory, one state | `cognito.tf`, `api_gateway.tf`, `lambda.tf`, `dynamodb.tf`, `amplify.tf`, `billing.tf` |
| State | Zustand (one store) | No provider pyramid, `getState()` escape hatch |

## 3. Patterns

### 3.1 Billing alarms first (the file you write before anything else)

```hcl
# billing.tf — apply this before any product infrastructure exists
resource "aws_sns_topic" "billing_alerts" { name = "myapp-billing-alerts" }

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.billing_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_budgets_budget" "monthly" {
  name         = "myapp-monthly-budget"
  budget_type  = "COST"
  limit_amount = "5"          # yes, five dollars — raise it when revenue does
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 70
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
    subscriber_sns_topic_arns  = [aws_sns_topic.billing_alerts.arn]
  }
}

# Gotcha: AWS/Billing metrics ONLY exist in us-east-1, and ONLY after you
# manually enable "Receive Billing Alerts" in account billing preferences.
# That checkbox cannot be set via Terraform or API — do it by hand, once.
resource "aws_cloudwatch_metric_alarm" "bill_warning" {
  alarm_name          = "myapp-bill-warning"
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  statistic           = "Maximum"
  period              = 21600
  evaluation_periods  = 1
  threshold           = 2.50
  comparison_operator = "GreaterThanThreshold"
  dimensions          = { Currency = "USD" }
  alarm_actions       = [aws_sns_topic.billing_alerts.arn]
}
```

### 3.2 Cognito — the 24-hour token fix

Cognito's default 1-hour ID token silently logs users out mid-session. They type for 61 minutes, hit save, and every request 401s. Set validity explicitly, always:

```hcl
resource "aws_cognito_user_pool_client" "web" {
  name         = "myapp-web"
  user_pool_id = aws_cognito_user_pool.main.id

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]     # never "implicit"
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  generate_secret                      = false        # SPA = public client

  callback_urls = [
    "http://localhost:5173/auth/callback",            # keep localhost forever
    "https://app.example.com/auth/callback",
  ]

  # THE FIX: default 1h id token logged users out mid-session — stretch to 24h
  id_token_validity      = 24
  access_token_validity  = 24
  refresh_token_validity = 30
  token_validity_units {
    id_token      = "hours"
    access_token  = "hours"
    refresh_token = "days"
  }
}
```

Two more Cognito facts learned empirically: it strips `prompt=select_account` when forwarding to Google (so account switching needs a guided flow, not a URL param), and a Google-federated user and a native email/password user with the same email are **two different subs** — email is never a primary key.

### 3.3 API Gateway — CORS on ERROR responses (the one everyone misses)

You added an OPTIONS mock and CORS headers to your Lambda responses. Then a token expires, the Cognito authorizer returns 401 — **without CORS headers**, because gateway-generated responses don't pass through your integration. The browser reports it as a network failure, `fetch` throws, and your carefully-written 401→sign-in redirect never fires. Users see "can't reach server" instead of a login screen.

```hcl
# Gateway responses ship without CORS by default. Cover the defaults AND the
# specific authorizer types — DEFAULT_4XX alone did NOT cover UNAUTHORIZED.
resource "aws_api_gateway_gateway_response" "default_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_4XX"
  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
  }
}

resource "aws_api_gateway_gateway_response" "unauthorized" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "UNAUTHORIZED"          # the Cognito authorizer's own 401
  status_code   = "401"
  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
  }
}
# Repeat for EXPIRED_TOKEN (401), ACCESS_DENIED (403), and DEFAULT_5XX.
```

### 3.4 API Gateway — routes as a `for_each` table

Ten routes hand-written is ~400 lines of method/integration/permission boilerplate. As a table it's one block each:

```hcl
locals {
  routes = {
    list_items  = { resource_id = aws_api_gateway_resource.items.id,   method = "GET",    lambda = aws_lambda_function.list_items,  auth = true }
    save_item   = { resource_id = aws_api_gateway_resource.items.id,   method = "POST",   lambda = aws_lambda_function.save_item,   auth = true }
    delete_item = { resource_id = aws_api_gateway_resource.item_id.id, method = "DELETE", lambda = aws_lambda_function.delete_item, auth = true }
    webhook     = { resource_id = aws_api_gateway_resource.webhook.id, method = "POST",   lambda = aws_lambda_function.webhook,     auth = false }
  }
}

resource "aws_api_gateway_method" "route" {
  for_each      = local.routes
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = each.value.resource_id
  http_method   = each.value.method
  authorization = each.value.auth ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = each.value.auth ? aws_api_gateway_authorizer.cognito.id : null
}
# ... matching for_each integration + lambda_permission blocks
```

Two deploy gotchas: (1) the stage snapshot goes stale after route changes — put a `sha1(jsonencode([...all route resources...]))` in the deployment's `triggers` so Terraform redeploys the stage; (2) in `aws_lambda_permission`, use `source_arn = "${execution_arn}/*/*"` — the exact method/path ARN format is easy to get subtly wrong and then it silently never matches.

### 3.5 Amplify SPA rewrites — 200, not just 404-200

The common advice ("add a 404 → /index.html rule") *renders* fine but serves **HTTP 404** on every deep link — crawlers, link unfurlers, and uptime checks all see a broken site. You need an explicit 200 rewrite for extensionless paths, with the 404-200 rule as a second-line fallback:

```hcl
resource "aws_amplify_app" "app" {
  name = "myapp"
  # extensionless routes (/docs, /billing, /project/abc) must be real 200s
  custom_rule {
    source = "</^[^.]+$/>"
    status = "200"
    target = "/index.html"
  }
  custom_rule {
    source = "/<*>"
    status = "404-200"
    target = "/index.html"
  }
}
```

Security headers ship **inside the artifact** as `customHttp.yml` in `dist/` (HSTS, X-Frame-Options DENY, nosniff, CSP with an explicit `connect-src` allow-list of your API Gateway and Cognito domains). Then write a regression test that asserts each header — see the companion Playwright skill.

### 3.6 One API layer — every status code becomes a human sentence

```js
// api.js — the ONLY place fetch() is called
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const FRIENDLY = {
  400: 'That request looked malformed — try again.',
  403: "You don't have access to that.",
  404: "That doesn't exist any more.",
  409: 'Someone else changed this — reload and retry.',
  429: 'Too many requests — take a breath and retry.',
};

async function apiFetch(path, options = {}) {
  const auth = getAuthHeaders();          // { Authorization: `Bearer ${idToken}` } or {}
  let resp;
  try {
    resp = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...auth, ...(options.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server — check your connection and retry.");
  }
  if (!resp.ok) {
    // expired session: clear it and broadcast ONCE — every page listens for
    // this one event instead of each implementing its own dead-token handling
    if (resp.status === 401 && auth.Authorization) {
      localStorage.removeItem('myapp_id_token');
      window.dispatchEvent(new CustomEvent('myapp:auth-expired'));
    }
    const err = await resp.json().catch(() => ({}));
    throw new ApiError(resp.status,
      err.message ?? FRIENDLY[resp.status]
      ?? (resp.status >= 500 ? 'The server hiccuped — try again in a moment.'
                             : `Request failed (${resp.status}).`));
  }
  return resp.json();
}
```

### 3.7 Stale-response guards in the store

The bug class that appeared twice in the source product (projects, then prefs): a GET starts, the user makes a local edit, the GET resolves and overwrites the edit. Two cures:

```js
// Cure A — merge, never replace (for collections):
loadItems: async () => {
  const fetched = await api.getItems();
  set((state) => {
    const byId = new Map(fetched.map((it) => [it.id, it]));
    state.items.forEach((it) => { if (!byId.has(it.id)) byId.set(it.id, it); });
    return { items: [...byId.values()] };
  });
},

// Cure B — version counter (for single documents like prefs):
_prefsVer: 0,
loadPrefs: async () => {
  const ver = get()._prefsVer;
  const prefs = await api.getPrefs();
  if (get()._prefsVer !== ver) return;   // a local write won the race — discard
  set((s) => ({ prefs: { ...s.prefs, ...prefs } }));
},
updatePrefs: (fields) => {
  set((s) => ({ _prefsVer: s._prefsVer + 1, prefs: { ...s.prefs, ...fields } }));
  api.savePrefs({ ...get().prefs, ...fields }).catch(() => {}); // fire-and-forget
},
```

### 3.8 Payment webhooks (any provider) — the four rules

```js
// 1. Verify HMAC with timingSafeEqual, on the RAW body, before parsing.
const digest = crypto.createHmac('sha256', secret).update(event.body).digest('hex');
const ok = Buffer.from(digest).length === Buffer.from(sig).length
        && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig));
if (!ok) return { statusCode: 401, body: 'Invalid signature' };
```

2. The webhook only knows the payer's **email**, not your user ID — resolve via a DynamoDB GSI on email, and update **every** matching identity (federated + native subs can share one email).
3. Cancellation ≠ expiry: `cancelled` means will-not-renew — keep the paid tier until the `expired` event arrives.
4. Log every event name/status/email and every mutation. The first "my payment didn't work" support ticket pays for that logging forever. Test the whole path with synthetic signed webhooks — you hold the secret, so you can exercise production for $0.

## 4. Anti-patterns

- **Provisioning product infra before billing alarms.** Alarm config is 40 lines; the alternative is an open-ended invoice.
- **Trusting Cognito's default token validity.** 1 hour = mid-session logouts = "your app randomly loses my work."
- **CORS on integrations only.** Authorizer 401s bypass your integration and arrive header-less; browsers mask them as network errors. Configure gateway responses (§3.3) or your auth-expiry UX is unreachable code.
- **Relying on the 404-200 fallback alone.** The app renders, so it looks fixed — but every deep link is an HTTP 404 to anything that isn't a browser. Assert real status codes in a regression test.
- **Replacing client state with fetch responses.** The wipe only happens under latency, so it survives all your fast-network dev testing and ships. Merge or version-guard (§3.7).
- **Email as a user key.** One human = potentially many Cognito subs. Webhooks and admin tools must fan out to all matches.
- **Console-only infra changes.** The next `terraform apply` reverts them without a diff you'll read. Mirror immediately.
- **Raw status codes in the UI.** "API error 500" is a defect. One FRIENDLY map, one ApiError type, one auth-expired event.
- **A UI-only paywall.** Client checks are suggestions. Enforce caps in the Lambda; the UI merely explains them.

## 5. Usage

In an AI coding session, work in this exact order — each step is independently deployable and verifiable:

1. **Scaffold**: "Create a Terraform directory with `variables.tf` (region, alert_email, domain), `main.tf` (provider, us-east-1), and `billing.tf` per §3.1. Then `terraform init && apply`." Manually tick "Receive Billing Alerts" in the console.
2. **Auth**: "Write `cognito.tf` per §3.2 with the 24h token block, Google IdP, hosted UI domain, and localhost + production callback URLs. Then a React `aws-config.js` with getLoginUrl/exchangeCodeForTokens/getAuthHeaders and an `/auth/callback` route." Verify: sign in locally, token in localStorage.
3. **Data + API**: "Write `dynamodb.tf` (PAY_PER_REQUEST, userId hash key, plus an email GSI on the users table), one Lambda per route as ESM `index.mjs`, and `api_gateway.tf` using the §3.4 route table, the §3.3 gateway responses, and a sha1-triggered deployment." Verify with curl: unauthenticated calls return 401 *with* CORS headers.
4. **Frontend plumbing**: "Write `api.js` per §3.6 and a Zustand store per §3.7. Every page renders loading/empty/error states — no blank flashes."
5. **Hosting**: "Write `amplify.tf` per §3.5 with both custom_rules, and `customHttp.yml` with HSTS/XFO/nosniff/CSP copied into `dist/` at build time. Deploy the built artifact via `aws amplify create-deployment` + `start-deployment` from CI."
6. **Payments** (when ready): webhook Lambda per §3.8, unauth route, email-GSI fan-out, synthetic-webhook test.
7. **Smoke check before any launch link goes out**: curl every route's real HTTP status (no redirects), verify security headers, hit the API unauthenticated, send a bad-signature webhook, run the full test suites.

## 6. Example Output

A session following this skill produces a repo shaped like:

```
myapp/
├── terraform/
│   ├── billing.tf        # budget + 2 alarms (applied FIRST)
│   ├── cognito.tf        # pool, Google IdP, client with 24h tokens
│   ├── api_gateway.tf    # route table, CORS mocks, 5 gateway responses
│   ├── dynamodb.tf       # PAY_PER_REQUEST tables, email GSI
│   ├── lambda.tf         # one function per route, zipped from lambda/
│   └── amplify.tf        # app + 200-rewrite + 404-200 + domain
├── lambda/
│   ├── list-items/index.mjs
│   └── webhook-payment/index.mjs   # timingSafeEqual + email fan-out
├── src/
│   ├── api.js            # ApiError, FRIENDLY map, auth-expired event
│   ├── aws-config.js     # hosted-UI URLs, code exchange
│   └── store.js          # merge-not-replace, _prefsVer guard
├── customHttp.yml        # security headers, shipped inside dist/
└── .github/workflows/deploy.yml
```

Verification transcript the AI should be able to produce:

```
$ curl -s -o /dev/null -w "%{http_code}" https://app.example.com/billing   → 200   (not 404)
$ curl -sI https://app.example.com | grep -i x-frame-options              → DENY
$ curl -s https://xyz.execute-api.us-east-1.amazonaws.com/prod/items      → 401
  ...and that 401 carries Access-Control-Allow-Origin: *
$ aws budgets describe-budgets --account-id … | jq '.Budgets[0].BudgetLimit'
  → { "Amount": "5", "Unit": "USD" }
```

If all four lines check out, you have the same production skeleton that runs launch.tapdot.org.
