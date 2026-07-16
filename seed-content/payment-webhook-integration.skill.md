---
title: Bulletproof Payment Webhook Skill
category: Coding
description: Build a payment webhook handler that never grants or revokes an entitlement incorrectly — HMAC-verified, idempotent, email-safe, and testable for $0. Distilled from a shipped production webhook (LemonSqueezy → Lambda → DynamoDB) at peerreview.tapdot.org.
usage: Load this skill before wiring any payment provider webhook (LemonSqueezy, Stripe, Razorpay, Paddle) to a serverless backend. Tell the AI which provider and datastore you use; it will apply these verification, identity-resolution, and idempotency patterns to your handler and generate the zero-spend synthetic test harness.
platforms: [Claude, Cursor, ChatGPT]
priceUsd: 6
timeSavedHours: 12
pocUrl: https://peerreview.tapdot.org
---
# Bulletproof Payment Webhook Skill

## 1. Philosophy

A payment webhook is the single most dangerous endpoint in your app. It is
**unauthenticated by design** (the provider can't log in as a user), it
**mutates entitlements** (the thing people paid for), and it is **retried
aggressively** by every provider (the same event will arrive 2-5 times).
Get it wrong and you either give paid features away or take them from
paying customers. Both are reputation-enders for a solo product.

Six rules, all learned from a shipped webhook in production:

1. **Verify the signature with constant-time comparison, or you have no
   security at all.** A string `===` on HMACs is a timing oracle. Use
   `crypto.timingSafeEqual` — and guard the length first, because
   `timingSafeEqual` *throws* on unequal-length buffers.
2. **Email is NOT a primary key.** The webhook only knows the payer's
   email. One email can map to zero, one, or *many* user identities
   (Google sign-in + email/password sign-up are different Cognito subs
   with the same email). Update **every** match, never `Items[0]`.
3. **Zero matches is a success case, not an error.** People buy before
   they sign up (gift purchases, "pay first, register later" flows,
   checkout links shared in a newsletter). **Park** the entitlement
   under a sentinel identity and claim it at first sign-in.
4. **Every event must be idempotent.** Providers retry on any non-2xx
   and sometimes on 2xx timeouts. Processing `subscription_created`
   twice must be indistinguishable from processing it once.
5. **Read the event lifecycle docs twice — `cancelled` ≠ `expired`.**
   A cancelled subscription is "will not renew"; the customer keeps
   what they paid for until the period ends. Downgrading on `cancelled`
   steals paid time. Downgrade only on `expired`.
6. **Log every event and every mutation.** When a customer emails "I
   paid but I'm still on free," your CloudWatch logs are the only
   forensic record. One line per decision: event name, status, email,
   what you did and to which userId.

## 2. Tech Stack

- **Runtime:** AWS Lambda, Node 20 ESM (`index.mjs`), behind API Gateway
  REST. The webhook route has **no authorizer** — the signature *is* the
  auth.
- **Crypto:** `node:crypto` built-ins only (`createHmac`,
  `timingSafeEqual`). No dependencies to audit.
- **Datastore:** DynamoDB, PAY_PER_REQUEST. Users table keyed on
  `userId` (Cognito sub) with a GSI `email-index` (hash: `email`,
  projection ALL) — this GSI exists *specifically because* the webhook
  only knows the email. Plus a tiny `webhook-events` table for
  idempotency (hash: `eventId`, TTL enabled).
- **Provider:** LemonSqueezy shown throughout (HMAC-SHA256 over the raw
  body, `X-Signature` header). Stripe (`Stripe-Signature`, timestamped
  scheme) and Razorpay (`X-Razorpay-Signature`) differ only in step 1;
  everything after signature verification is provider-agnostic.
- **Testing:** a Node script that signs synthetic payloads with the same
  secret and POSTs them at the deployed endpoint — full end-to-end
  verification with zero real transactions.

## 3. Patterns

### 3.1 Signature verification (constant-time, length-guarded)

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifySignature(rawBody, signatureHeader, secret) {
  const digest = createHmac('sha256', secret).update(rawBody ?? '').digest('hex');
  // Length guard FIRST: timingSafeEqual throws on mismatched lengths,
  // and length itself is not secret.
  return signatureHeader.length === digest.length &&
    timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
}

export const handler = async (event) => {
  const secret = process.env.WEBHOOK_SECRET;
  // Dormant-until-configured: ship the route before payments are live.
  // 503 (not 200!) so the provider keeps retrying and your smoke test
  // can assert "unsigned payloads are rejected" from day one.
  if (!secret) return respond(503, { message: 'Payments not configured' });

  // API Gateway lower-cases nothing for you — check both casings.
  const sig = event.headers?.['X-Signature'] ?? event.headers?.['x-signature'] ?? '';
  if (!verifySignature(event.body, sig, secret)) {
    console.log('webhook: INVALID SIGNATURE');
    return respond(401, { message: 'Invalid signature' });
  }
  // ...
};
```

Two production-earned details hiding in there:

- **Verify against the RAW body string**, exactly as received. If your
  framework parses JSON before you can HMAC it, re-serialization will
  not be byte-identical and every signature fails. On API Gateway
  proxy integration `event.body` is the raw string — HMAC that.
- **Return 503 while unconfigured, 401 on bad signature.** Never 200:
  a 200 tells the provider "delivered", and events sent before you set
  the secret vanish forever. Non-2xx keeps them in the retry queue.

### 3.2 Idempotency: conditional-put an event receipt

```js
async function claimEvent(eventId) {
  try {
    await db.send(new PutCommand({
      TableName: process.env.EVENTS_TABLE,
      Item: {
        eventId,                                     // provider's unique id
        seenAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 90 * 86400, // auto-purge in 90d
      },
      ConditionExpression: 'attribute_not_exists(eventId)',
    }));
    return true;                    // first delivery — process it
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      console.log(`webhook: duplicate event ${eventId} — acking without reprocessing`);
      return false;                 // retry — ACK with 200, do nothing
    }
    throw e;                        // real error — let the provider retry
  }
}
```

Use the provider's event id (`meta.webhook_id` for LemonSqueezy,
`event.id` for Stripe). If the provider doesn't send one, derive
`sha256(rawBody)`. Two subtleties:

- Duplicates get a **200**, not a 409 — you *want* the provider to stop
  retrying a delivery you've already handled.
- Claim the receipt **before** mutating, and design mutations to be
  safe anyway (SET plan to an absolute value, not `ADD months :1`).
  Belt and suspenders: the receipt stops re-processing, absolute SETs
  make accidental re-processing harmless.

### 3.3 Event routing: cancelled ≠ expired

```js
const payload = JSON.parse(event.body);
const eventName = payload.meta?.event_name ?? '';
const attrs = payload.data?.attributes ?? {};
const email = (attrs.user_email ?? '').toLowerCase();   // ALWAYS lowercase
const status = attrs.status ?? '';
console.log(`webhook: event=${eventName} status=${status} email=${email}`);
if (!email) return respond(400, { message: 'No payer email' });

const variant = String(attrs.variant_name ?? attrs.product_name ?? '').toLowerCase();
let plan = null;
if (['subscription_created', 'subscription_updated',
     'subscription_resumed', 'subscription_unpaused'].includes(eventName)) {
  // TRAP: subscription_updated ALSO fires when the user cancels, with
  // status=cancelled. That is a will-not-renew notice, not a downgrade.
  if (status === 'cancelled') {
    console.log('webhook: cancellation notice — tier kept until expiry, no mutation');
    return respond(200, { ok: true, note: 'cancelled = will-not-renew, keeping tier' });
  }
  plan = variant.includes('studio') ? 'studio'
       : variant.includes('pro')    ? 'pro' : null;
} else if (eventName === 'subscription_expired') {
  plan = 'free';                    // the ONLY event that downgrades
} else if (eventName === 'subscription_cancelled') {
  return respond(200, { ok: true, note: 'cancelled = will-not-renew, keeping tier' });
}
if (!plan) return respond(200, { ok: true, ignored: eventName });
```

Match plan by **substring of the variant name**, not variant IDs —
variant IDs differ between the provider's test and live stores, and a
name-match handler works unchanged in both modes.

### 3.4 Resolve email → ALL identities, park the rest

```js
const { Items = [] } = await db.send(new QueryCommand({
  TableName: process.env.USERS_TABLE,
  IndexName: 'email-index',
  KeyConditionExpression: 'email = :e',
  ExpressionAttributeValues: { ':e': email },
}));

const realUsers = Items.filter(u => !String(u.userId).startsWith('pending#'));

if (!realUsers.length) {
  // Nobody with this email yet — PARK the entitlement under a sentinel
  // id. Claimed by the get-me / first-login path when the email signs up.
  await db.send(new PutCommand({
    TableName: process.env.USERS_TABLE,
    Item: { userId: `pending#${email}`, email, plan,
            parkedAt: new Date().toISOString() },
  }));
  console.log(`webhook: no user yet — parked plan=${plan} for ${email}`);
  return respond(200, { ok: true, parked: plan });
}

// One email can be MANY accounts (Google + password sign-ups share an
// email but have different subs). Update EVERY match, never Items[0].
for (const u of realUsers) {
  await db.send(new UpdateCommand({
    TableName: process.env.USERS_TABLE,
    Key: { userId: u.userId },
    UpdateExpression: 'SET #p = :plan',
    ExpressionAttributeNames: { '#p': 'plan' },   // "plan" is a reserved word
    ExpressionAttributeValues: { ':plan': plan },
  }));
  console.log(`webhook: set plan=${plan} on userId=${u.userId}`);
}
return respond(200, { ok: true, plan, updated: realUsers.length });
```

The claim side (in your `get-me` / first-login Lambda): query
`email-index` for `pending#<email>`, copy the parked plan onto the real
user record, delete the sentinel. The `pending#` prefix keeps sentinels
out of every other query with one `startsWith` filter.

### 3.5 Per-mode (test/live) configuration

One handler, two deployments' worth of env vars — never branch on a
"testMode" flag inside the code:

| Env var | QA / test store | Production |
|---|---|---|
| `WEBHOOK_SECRET` | test-store signing secret | live-store signing secret |
| `USERS_TABLE` | `app-users-qa` | `app-users` |
| `EVENTS_TABLE` | `webhook-events-qa` | `webhook-events` |

Point the provider's *test-mode* webhook at the QA API URL and the
*live-mode* webhook at prod. A test-store event signed with the test
secret can never validate against prod (different secret) — the two
worlds cannot cross-contaminate, and there is no `if (testMode)` branch
to rot. If your provider marks mode in the payload (Stripe `livemode`,
LemonSqueezy `test_mode`), log it and reject mismatches as cheap
defense-in-depth.

### 3.6 Synthetic signed-webhook testing — $0 spent

You do not need a real purchase to test any of this. You hold the same
secret the provider signs with, so sign your own payloads:

```js
// scripts/webhook-test.mjs — run: node scripts/webhook-test.mjs <api-url>
import { createHmac, randomUUID } from 'node:crypto';

const API = process.argv[2];
const SECRET = process.env.WEBHOOK_SECRET;   // same value as the Lambda env

async function fire(name, mutate = {}) {
  const body = JSON.stringify({
    meta: { event_name: name, webhook_id: randomUUID() },
    data: { attributes: {
      user_email: 'synthetic-buyer@example.com',
      variant_name: 'Pro Monthly', status: 'active', ...mutate,
    }},
  });
  const sig = createHmac('sha256', SECRET).update(body).digest('hex');
  const res = await fetch(`${API}/webhook/payment`, {
    method: 'POST', body, headers: { 'X-Signature': sig },
  });
  console.log(name, res.status, await res.text());
  return body;
}

await fire('subscription_created');                          // expect: parked or plan=pro
const dup = await fire('subscription_created');              // fresh id → processes
await fire('subscription_updated', { status: 'cancelled' }); // expect: no mutation
await fire('subscription_expired');                          // expect: plan=free
// Tamper check: valid body, garbage signature → must be 401
const bad = await fetch(`${API}/webhook/payment`,
  { method: 'POST', body: dup, headers: { 'X-Signature': 'f'.repeat(64) } });
console.log('tampered', bad.status);                         // MUST print 401
```

And put a permanent sentinel in your post-deploy smoke script — the
webhook must reject unsigned payloads *forever*:

```js
const wh = await fetch(API + '/webhook/payment', { method: 'POST', body: '{}' });
check('unsigned webhook rejected', wh.status === 401 || wh.status === 503);
```

## 4. Anti-patterns

- **`signature === digest`** — timing-oracle. Also crashes hidden in the
  "fix": calling `timingSafeEqual` without a length guard throws on
  short input, turning a probe into a 500.
- **HMAC over `JSON.stringify(JSON.parse(body))`** — re-serialization is
  not byte-stable (key order, unicode, whitespace). Sign the raw body.
- **`Items[0]`** after the email query — silently strands every user who
  signed up twice with the same email. Loop over all matches.
- **404 / error when no user matches the payer email** — the provider
  retries a permanent condition forever, then drops the event; the
  customer who paid pre-signup never gets their plan. Park it, 200.
- **Downgrading on `cancelled`** — you just revoked time the customer
  already paid for. Only `expired` downgrades.
- **Returning 200 before the secret is configured** — swallows real
  events into the void during your launch window. 503 until configured.
- **Relative entitlement math (`ADD credits :n`) in a webhook** — one
  provider retry double-grants. Webhooks SET absolute state; if you must
  increment, the idempotency receipt is mandatory, not optional.
- **Branching on variant IDs** — test and live stores have different
  IDs; your handler works in test and silently ignores live events.
- **Testing by buying with a real card** — you have the secret; sign
  synthetic payloads. Real-money testing is slower, unrepeatable, and
  can't exercise `expired` without waiting a billing cycle.

## 5. Usage

Say to your assistant:

> "Using the Bulletproof Payment Webhook skill, build the
> `webhook-payment` handler for [LemonSqueezy | Stripe | Razorpay].
> Users live in [table/collection], keyed by [userId], with email as a
> secondary index. Plans are [free/pro/...]. Generate the handler, the
> idempotency table definition, the parked-entitlement claim snippet
> for my login path, and the synthetic test script."

Then, in order: (1) deploy with no secret set and confirm the smoke
sentinel sees 503; (2) set the **test-mode** secret, run the synthetic
script against QA, verify parked → claimed → upgraded → cancelled-keeps
→ expired-downgrades in the logs; (3) set the live secret in prod and
re-run only the tamper + unsigned checks (never fire synthetic plan
mutations at prod tables); (4) leave the unsigned-rejection check in
your permanent post-deploy smoke suite.

## 6. Example Output

CloudWatch log of one healthy lifecycle, exactly as the patterns above
produce it — this is what "auditable" looks like:

```
webhook: event=subscription_created status=active email=synthetic-buyer@example.com
webhook: no user yet — parked plan=pro for synthetic-buyer@example.com
--- user signs up; login path claims pending#synthetic-buyer@example.com ---
webhook: event=subscription_updated status=active email=synthetic-buyer@example.com
webhook: set plan=pro on userId=9a1f...c2   (google sub)
webhook: set plan=pro on userId=4be0...77   (password sub, same email)
webhook: duplicate event 5f2c... — acking without reprocessing
webhook: event=subscription_updated status=cancelled email=synthetic-buyer@example.com
webhook: cancellation notice — tier kept until expiry, no mutation
webhook: event=subscription_expired status=expired email=synthetic-buyer@example.com
webhook: set plan=free on userId=9a1f...c2
webhook: set plan=free on userId=4be0...77
webhook: INVALID SIGNATURE
```

Every decision the handler made is reconstructible from logs alone —
which identities were touched, why the cancellation didn't downgrade,
and that the tampered probe bounced. That is the bar.
