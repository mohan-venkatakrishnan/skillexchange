---
title: Two-Sided Matching Engine Skill
category: Coding
description: Build a fair two-sided matching engine on DynamoDB and Lambda — sparse-GSI pool, race-proof transactional assignment, lifecycle states with TTL expiry, and match notifications. Distilled from the production matcher pairing product builders for mutual reviews at peerreview.tapdot.org.
usage: Load this skill when building any system that pairs two sides of a marketplace — reviewers to products, mentors to mentees, drivers to riders, graders to submissions. Describe your two entities and fairness rules; the AI will apply the pool-index, transactional-claim, and lifecycle patterns to your schema and generate the matcher Lambda plus its triggers.
platforms: [Claude, Cursor, ChatGPT]
priceUsd: 8
timeSavedHours: 20
pocUrl: https://peerreview.tapdot.org
---
# Two-Sided Matching Engine Skill

## 1. Philosophy

A matching engine sounds like an algorithm problem. In production it is
a **state-machine and concurrency problem** wearing an algorithm's
clothes. The naive build — scan everything, pick pairs, write them —
fails in four predictable ways: the same item gets assigned twice when
two matcher runs race; assignments silently rot when a reviewer ghosts;
the pool starves at small scale because your constraints are too strict
for a 5-person cold start; and matched users never find out because
notification was "phase 2."

The rules this skill enforces, each paid for in production:

1. **The pool is a sparse GSI, not a filtered scan.** Items *enter* the
   pool by gaining a `poolStatus` attribute and *leave* it by having the
   attribute `REMOVE`d. The GSI then contains only matchable items —
   pool reads stay O(pool), not O(table), forever.
2. **Assignment is one transaction with conditions on every leg.**
   The claim ("this reviewer takes this item") must atomically check
   the item is still queued AND the reviewer is still free. If either
   condition fails, the whole transaction fails, and that is the
   *designed* outcome of a race — the next run retries.
3. **Every assignment is a state machine with a clock.**
   `assigned → submitted → verified | flagged`, plus `expired` driven by
   a deadline. A state that can't time out is a state you'll be clearing
   by hand in the console at 11pm.
4. **Run the matcher twice: on-event and on-schedule.** Event-triggered
   (fire-and-forget invoke when something enters the pool) makes the
   product feel alive; the hourly EventBridge sweep is the safety net
   that also expires deadbeats and self-heals stranded state. Neither
   alone is enough.
5. **Separate hard constraints from preferences, and relax only
   preferences.** "Never review your own product, never the same product
   twice" are hard. "Prefer no reciprocal pairs within 30 days" is a
   preference — relax it when the pool is small, or a two-person pool
   deadlocks and your first users see an empty queue.
6. **Fairness is a sort key, not a lottery.** Oldest-enqueued item
   first; least-recently-assigned reviewer first. Deterministic, cheap,
   and explainable when a user asks "why haven't I been matched?"

## 2. Tech Stack

- **Compute:** one matcher Lambda (Node 20 ESM), invoked two ways:
  `InvocationType: 'Event'` from the verify/enqueue path, and an
  EventBridge rule (`rate(1 hour)`) as the sweep.
- **Data:** DynamoDB, PAY_PER_REQUEST, three tables:
  - `users` — hash `userId`; carries `activeAssignmentId`,
    `lastAssignedAt`, `expiredCount`, `recentPartners` (map of
    partnerId → ISO timestamp), `categories[]`.
  - `products` (the supply side) — hash `userId`, range `productId`;
    carries `poolStatus`, `enqueuedAt`, `reviewerIds[]`. GSI
    `pool-index`: hash `poolStatus`, range `enqueuedAt`. **Sparse**: only
    queued items have the attributes at all.
  - `assignments` (the edge) — hash `assignmentId`; GSIs
    `reviewer-index` (reviewerId, assignedAt) for "my queue",
    `owner-index` (ownerId, assignedAt) for "incoming to verify",
    `state-index` (state, assignedAt) for the expiry sweep. `dueAt` doubles
    as a DynamoDB TTL attribute.
- **Notification:** SES transactional email, wrapped so it can never
  break the core flow.
- **No queue service, no Step Functions.** Conditional writes + a sweep
  give you the same guarantees at this scale for ~$0.

## 3. Patterns

### 3.1 The sparse pool index

```hcl
# terraform — supply-side table
global_secondary_index {
  name            = "pool-index"
  hash_key        = "poolStatus"   # only value ever written: "queued"
  range_key       = "enqueuedAt"   # ISO timestamp → oldest-first fairness
  projection_type = "ALL"
}
```

```js
// ENTER the pool (idempotent — keeps original priority if already queued)
await db.send(new UpdateCommand({
  TableName: PRODUCTS, Key: { userId, productId },
  UpdateExpression: 'SET poolStatus = :q, enqueuedAt = if_not_exists(enqueuedAt, :now)',
  ExpressionAttributeValues: { ':q': 'queued', ':now': nowIso },
}));

// READ the pool — only queued items exist in this index, oldest first
const { Items: pool = [] } = await db.send(new QueryCommand({
  TableName: PRODUCTS, IndexName: 'pool-index',
  KeyConditionExpression: 'poolStatus = :q',
  ExpressionAttributeValues: { ':q': 'queued' },
  ScanIndexForward: true,
  Limit: 25,   // bounded work per run; the next run takes the next slice
}));

// LEAVE the pool = REMOVE the key attributes (this is what makes it sparse)
UpdateExpression: 'REMOVE poolStatus, enqueuedAt'
```

`if_not_exists(enqueuedAt, ...)` matters: when an expired assignment
returns an item to the pool, re-queue it **with its original
`enqueuedAt`** so a flaky reviewer doesn't push the owner to the back of
the line.

### 3.2 Hard constraints vs. relaxable preferences

```js
const cutoff = new Date(now - RECIPROCITY_DAYS * 86400000).toISOString();

// HARD — never relaxed, in any pool size:
const baseEligible = (u) =>
  !String(u.userId).startsWith('pending#') &&        // real person
  u.userId !== product.userId &&                     // never self-review
  !u.activeAssignmentId &&                           // one live job at a time
  (u.expiredCount ?? 0) < MAX_EXPIRIES &&            // 3 strikes → paused
  !(product.reviewerIds ?? []).includes(u.userId) && // never same product twice
  (!requireCategory || (u.categories ?? []).includes(product.category));

// PREFERENCE — relaxed only when nothing else exists:
let candidates = users.filter(u => baseEligible(u) &&
  !((u.recentPartners ?? {})[product.userId] > cutoff)); // no A↔B quid-pro-quo
if (!candidates.length) candidates = users.filter(baseEligible);
if (!candidates.length) continue;   // starved — leave queued for next run

// Fairness: least-recently-assigned reviewer wins.
candidates.sort((a, b) =>
  String(a.lastAssignedAt ?? '').localeCompare(String(b.lastAssignedAt ?? '')));
const reviewer = candidates[0];
```

The two-tier filter is the cold-start fix. A strict matcher with three
users deadlocks on anti-reciprocity alone; a matcher that relaxes the
"never the same product twice" rule re-offers items people already
skipped. Know which bucket each rule is in *before* you write the code.

### 3.3 The race-proof claim: one transaction, conditions on every leg

Two matcher runs (event-triggered + hourly sweep) *will* overlap.
Correctness comes from the transaction, not from scheduling:

```js
await db.send(new TransactWriteCommand({ TransactItems: [
  { Put: { TableName: ASSIGNMENTS, Item: {
      assignmentId: randomUUID(),
      reviewerId: reviewer.userId, ownerId: product.userId,
      productId: product.productId, category: product.category,
      state: 'assigned', assignedAt: nowIso,
      dueAt: new Date(now + DEADLINE_DAYS * 86400000).toISOString(),
  }}},
  { Update: { TableName: USERS, Key: { userId: reviewer.userId },
      UpdateExpression:
        'SET activeAssignmentId = :aid, lastAssignedAt = :now, recentPartners.#o = :now',
      // LEG A: reviewer must still be free — kills reviewer double-booking
      ConditionExpression: 'attribute_not_exists(activeAssignmentId)',
      ExpressionAttributeNames: { '#o': product.userId },
      ExpressionAttributeValues: { ':aid': assignmentId, ':now': nowIso },
  }},
  { Update: { TableName: USERS, Key: { userId: product.userId },
      // mark the edge on the owner too → blocks the reverse B→A match
      UpdateExpression: 'SET recentPartners.#r = :now',
      ExpressionAttributeNames: { '#r': reviewer.userId },
      ExpressionAttributeValues: { ':now': nowIso },
  }},
  { Update: { TableName: PRODUCTS, Key: { userId: product.userId, productId: product.productId },
      UpdateExpression:
        'REMOVE poolStatus, enqueuedAt ' +
        'SET reviewerIds = list_append(if_not_exists(reviewerIds, :e), :r)',
      // LEG B: item must still be queued — kills item double-assignment
      ConditionExpression: 'poolStatus = :q',
      ExpressionAttributeValues: { ':q': 'queued', ':r': [reviewer.userId], ':e': [] },
  }},
]}));
// After success, mark locally so THIS run doesn't reuse the reviewer:
reviewer.activeAssignmentId = assignmentId;
```

```js
} catch {
  // ConditionalCheckFailed = we raced another run. Not an error.
  // Do nothing; the item is either taken (fine) or the next pass retries.
}
```

Note the in-memory `reviewer.activeAssignmentId = ...` after the write:
the users array was loaded once at the top of the run, so without it the
*same run* would happily hand reviewer #1 every product in the pool and
eat a conditional failure on each — wasted transactions.

### 3.4 Lifecycle states + expiry sweep

```
              submit           verify
  assigned ──────────► submitted ──────► verified   (trust ↑, credit ↑)
     │                     │ flag
     │ dueAt passes        └─────────► flagged      (trust ↓)
     ▼
  expired  → item re-queued (original priority) → reviewer expiredCount +1
```

Every state transition is a **conditional update**, so a late sweep can
never trample a just-submitted review:

```js
// Sweep, part 1: expire overdue work
const { Items: active = [] } = await db.send(new QueryCommand({
  TableName: ASSIGNMENTS, IndexName: 'state-index',
  KeyConditionExpression: '#s = :assigned',
  ExpressionAttributeNames: { '#s': 'state' },
  ExpressionAttributeValues: { ':assigned': 'assigned' },
}));
for (const a of active.filter(a => a.dueAt < nowIso)) {
  await db.send(new UpdateCommand({
    TableName: ASSIGNMENTS, Key: { assignmentId: a.assignmentId },
    UpdateExpression: 'SET #s = :expired',
    ConditionExpression: '#s = :assigned',        // lost race with submit? skip.
    ExpressionAttributeNames: { '#s': 'state' },
    ExpressionAttributeValues: { ':expired': 'expired', ':assigned': 'assigned' },
  })).catch(() => null);
  // re-queue at ORIGINAL priority, free the reviewer, count the strike
  // (two more UpdateCommands — pool re-entry as in 3.1, plus:)
  // 'ADD expiredCount :one REMOVE activeAssignmentId'
}
```

```js
// Sweep, part 2: SELF-HEAL. Any active item that fell out of the pool
// (interrupted transaction, legacy state) gets re-queued — an item can
// never be silently stranded and unmatchable.
const { Items: stray = [] } = await db.send(new ScanCommand({
  TableName: PRODUCTS,
  FilterExpression: '#s = :active AND (attribute_not_exists(poolStatus) OR poolStatus <> :q)',
  ExpressionAttributeNames: { '#s': 'status' },
  ExpressionAttributeValues: { ':active': 'active', ':q': 'queued' },
}));
for (const p of stray) { /* re-enqueue as in 3.1 */ }
```

The self-heal pass is the difference between "eventually consistent by
design" and "eventually someone emails support." Budget one scan an
hour for it; it's cheap insurance.

### 3.5 Two triggers, one Lambda

```js
// In the event that adds supply to the pool (e.g. a verified review
// frees up a credit) — fire-and-forget, the schedule is the safety net:
await lambda.send(new InvokeCommand({
  FunctionName: process.env.MATCHER_FUNCTION,
  InvocationType: 'Event',                    // async — never block the API path
  Payload: JSON.stringify({ trigger: 'verify' }),
})).catch(() => {});                          // hourly sweep will catch it
```

```hcl
resource "aws_cloudwatch_event_rule" "matcher_sweep" {
  schedule_expression = "rate(1 hour)"
}
```

The handler itself is trigger-agnostic — same code path for both. Return
a summary object (`{ assigned, expired, requeued }`) so every run's
CloudWatch log line tells you what the engine did.

### 3.6 Notify on match — and never let it break matching

```js
async function notify(to, subject, body) {
  if (process.env.NOTIFY_ENABLED !== 'true' || !to) return;  // env kill-switch
  try {
    await ses.send(new SendEmailCommand({
      Source: process.env.NOTIFY_FROM,
      Destination: { ToAddresses: [to] },
      Message: { Subject: { Data: subject }, Body: { Text: { Data: body } } },
    }));
  } catch (e) { console.log('notify failed for', to, '-', e.message); }
}

// AFTER the transaction commits — a match email for an uncommitted match
// is worse than no email:
await notify(reviewer.email, 'A product is waiting for your review',
  `You've been matched on PeerReview.\n\n${SITE_URL}/app/review\n\nDue in ${DEADLINE_DAYS} days.`);
```

The `NOTIFY_ENABLED` flag lets you deploy the whole engine while SES is
still in sandbox / DKIM-pending, then flip email on with zero code
changes.

## 4. Anti-patterns

- **`Scan` + `FilterExpression` as the pool.** Works in the demo, bills
  and slows as O(table) forever. The sparse GSI costs the same to write
  and stays O(matchable).
- **Two sequential writes instead of one transaction** ("mark reviewer
  busy, then mark item taken"). The crash between them strands one side.
  If a transaction feels heavy, that's the feeling of correctness.
- **A `SET poolStatus = 'taken'` instead of `REMOVE`.** Now the index
  isn't sparse, every pool query filters, and you've rebuilt the scan.
- **Treating `ConditionalCheckFailedException` as an error to alert on.**
  It is the concurrency control *working*. Log at debug, move on.
- **Assignments without `dueAt`.** No deadline → no expiry → supply
  permanently locked to ghosts. Every claimed resource needs a clock and
  a sweep that enforces it.
- **Relaxing hard constraints under starvation.** Relax preferences
  (reciprocity windows, category match for supply-less members) — never
  "not the owner" or "not already reviewed." Decide the split up front.
- **Re-queuing expired items with `enqueuedAt = now`.** Punishes the
  owner for the reviewer's flakiness; they loop to the back of the line
  forever. Preserve original priority.
- **Trusting DynamoDB TTL for time-critical expiry.** TTL deletion can
  lag 48h and *deletes* the record (goodbye audit trail). Use TTL as
  garbage collection at most; the sweep does the state transition.
- **Blocking the user-facing API on a synchronous matcher call.** Invoke
  async; if the invoke is lost, the schedule catches it within the hour.
- **Skipping the pull-model question.** At tiny scale, an *open pool*
  (users browse the queued set and self-select; a conditional
  `NOT contains(reviewerIds, me)` guards double-submit) beats
  push-matching — PeerReview itself shipped push, starved on a two-person
  cold start, and retired it for open-pool. Build the pool and lifecycle
  first; they serve both models unchanged.

## 5. Usage

Say to your assistant:

> "Using the Two-Sided Matching Engine skill, design matching for
> [my domain]. Supply side: [entity + table]. Demand side: [entity].
> Hard constraints: [...]. Preferences: [...]. Deadline: [N days].
> Generate the Terraform for the pool and lifecycle GSIs, the matcher
> Lambda with the transactional claim, the EventBridge sweep, and the
> match notification."

Then verify in this order: (1) enqueue two items, run the matcher twice
concurrently, confirm zero double-assignments and some conditional
failures in the logs; (2) set `DEADLINE_DAYS` to a few minutes in QA and
watch the sweep expire + re-queue at original priority; (3) delete
`poolStatus` from an active item by hand and confirm the self-heal pass
restores it; (4) only then flip `NOTIFY_ENABLED=true`.

## 6. Example Output

One hour of a healthy engine, reconstructed entirely from the sweep's
return values and log lines:

```
run trigger=verify   { assigned: 1, expired: 0, requeued: 0 }
  claim ok: product=prd_84f reviewer=usr_2ab (queue age 3d 4h)
  notify sent: usr_2ab "A product is waiting for your review"
run trigger=schedule { assigned: 2, expired: 1, requeued: 1 }
  expired: asg_c91 (dueAt 2026-07-14T09:00Z) → prd_11e re-queued @ original enqueuedAt
  strike: usr_9fe expiredCount=2 (pauses at 3)
  self-heal: prd_303 was active but unpooled → re-queued
  claim raced: prd_84f condition failed (already taken) — skipped
  claim ok: prd_11e → usr_77c   claim ok: prd_5d0 → usr_31a
```

Every match explainable, every race absorbed, every stranded item
recovered within the hour, and the whole thing runs on two tables, one
Lambda, and one schedule for well under a dollar a month.
