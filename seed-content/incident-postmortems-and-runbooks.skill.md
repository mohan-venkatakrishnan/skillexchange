---
title: Blameless Postmortems and Runbooks Skill
category: Other
description: Write incident reviews that change the system instead of naming a culprit, and runbooks the on-call can actually execute at 3am. Includes a full postmortem template, a contributing-factors method that survives "human error," and action items with owners, dates, and a bar that stops "be more careful" from ever being filed again.
usage: Load this skill after an incident, before you open the doc. Give your assistant the raw timeline, the alerts, and what people did, and it will draft the postmortem with a real contributing-factors section and action items sorted by whether they prevent, detect, or mitigate — then flag every item that's secretly just "try harder."
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 14
pocUrl: https://sre.google/sre-book/postmortem-culture/
---

# Blameless Postmortems and Runbooks Skill

## 1. Philosophy

A postmortem is a change-management artifact, not a report. If nothing about the system is different a month later, you held a meeting about a bad day.

1. **Blameless is a technique, not a courtesy.** It exists because you need the truth about what the operator was thinking, and people who expect punishment tell you a version of events optimized for their survival. The moment one engineer gets a bad review over an incident, every future postmortem in the org becomes fiction — and you will not get that back. This is the whole ballgame.
2. **"Human error" is where the investigation starts, never where it stops.** An engineer ran a destructive command against prod. Fine: why did a prod shell accept it without confirmation? Why did staging and prod look identical in the prompt? Why was the runbook's copy-pasteable command the destructive one? The interesting system is the one that made a reasonable action catastrophic.
3. **Everyone acted reasonably given what they knew at the time.** Hindsight makes the right move look obvious because you now know the ending. Write about what the responder could see at 02:14 — the dashboard that was green, the alert that hadn't fired — not what you can see today.
4. **An action item without an owner and a date is a wish.** "We should improve monitoring" has never once been done. "@priya adds a synthetic checkout probe alerting on p95 > 2s, by Mar 14, #412" gets done.
5. **Prevent, detect, mitigate — in that order, but never only the first.** You cannot prevent every cause. You can always shrink detection time and blast radius, and those pay off for incidents you haven't imagined yet.
6. **The runbook is the postmortem's product.** Whatever the responder had to figure out live at 3am is exactly what the next responder will have to figure out live at 3am, unless you write it down while it still hurts.

## 2. Tech Stack

- **Google's SRE Book, "Postmortem Culture"** — https://sre.google/sre-book/postmortem-culture/ — published free online under **CC-BY-NC-ND 4.0**. The canonical public statement of the blameless standard. Read it; this skill is a practitioner's field kit, not a restatement of it.
- **Incident severity conventions** (SEV1–SEV4) — an industry-common vocabulary, not any single project's. Define yours in writing; the numbers mean nothing without your own table.
- **Markdown in the same repo as the service.** Postmortems and runbooks belong in version control next to the code, reviewed like code. A wiki page nobody can `grep` from the terminal at 3am is a document that does not exist.
- **Prometheus/Alertmanager** — https://prometheus.io — **Apache-2.0** — referenced in §3.6 only as a concrete alerting target; the runbook pattern is tool-agnostic.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Google SRE Book authors. All templates and example content are original to this skill.

## 3. Patterns

### 3.1 The template

```md
# Postmortem: Checkout 5xx spike, 2026-03-04

**Status:** Final · **Severity:** SEV2 · **Author:** @mohan · **Reviewers:** @priya, @dan
**Duration:** 02:14–03:41 UTC (87m) · **Time to detect:** 26m · **Time to mitigate:** 61m

## Impact
~14,200 checkout attempts failed with a 500 (roughly 31% of attempts in the window).
~$41k in delayed orders; ~$3.8k confirmed abandoned. 22 support tickets. No data loss,
no incorrect charges — the failure was before the payment authorization call.

## Trigger
A config change (#2214) lowered the DB connection pool from 40 to 10 on the checkout
service, to reduce idle connections on the new smaller RDS instance.

## Detection
Not by alert. A support engineer escalated at 02:40 after three tickets in five minutes.
Our pool-saturation alert existed but was scoped to the `api` service only; checkout
was never added when it was split out in November.

## Resolution
Pool raised to 40 (revert of #2214), deployed 03:33, error rate back to baseline 03:41.

## Timeline (UTC)
| Time | Event |
|---|---|
| 01:52 | #2214 deploys. Traffic is low (overnight); pool of 10 is sufficient. No signal. |
| 02:14 | EU morning traffic ramps. Pool saturates. First checkout 500s. |
| 02:14 | `checkout_errors_total` climbs. No alert — threshold is 5% over 10m; we sat at 4.1%. |
| 02:40 | Support escalates. @mohan paged manually. |
| 02:44 | @mohan online. Dashboard shows 500s but not the cause; DB CPU is 12%, RDS looks healthy. |
| 03:02 | Checked slow query log first — a dead end, but a *reasonable* one: the last three DB incidents were slow queries. |
| 03:19 | @priya joins, notices `pool.waiting` at 340 in a panel added last month. |
| 03:24 | #2214 identified as the only recent change touching checkout config. |
| 03:33 | Revert deployed. |
| 03:41 | Error rate at baseline. Incident closed. |

## Contributing factors
(see §3.3 — this is the section that matters)

## What went well
- The `pool.waiting` panel added in February is what cracked it. Nobody had used it yet.
- Revert-first discipline: nobody tried to debug the pool sizing live.

## What we got lucky on
- It was 02:14, not 14:00. At peak this is a SEV1 and ~9x the impact.
- The failure was pre-authorization. A pool exhaustion *between* charge and order-write
  would have taken money without creating orders. Nothing in the design prevents that —
  we were lucky about *where* the pool ran out.

## Action items
(see §3.5)
```

The two sections people delete are the two that matter most. **"What went well"** is how you find out which of your investments are actually working — the `pool.waiting` panel earned its keep and now everyone knows it exists. **"What we got lucky on"** is the highest-value section in the entire document: it's a free list of the incidents you haven't had yet. That pre-authorization observation is worth more than every action item under it.

### 3.2 Timeline discipline

- **UTC. Always.** A timeline mixing IST and PST is unreadable within a week and unusable in a legal or audit context ever.
- **Record what people believed, not just what they did.** "03:02 — checked the slow query log" is a fact with no lesson. "03:02 — checked the slow query log first; the last three DB incidents were slow queries, so it was the obvious hypothesis" tells you the responder was pattern-matching correctly on stale evidence, and points straight at a real fix: the dashboard should have made pool saturation as visible as query latency.
- **Include the dead ends.** A timeline where every step was correct is a lie, and it hides the 18 minutes you actually need to explain.
- **Distinguish detect from mitigate.** They have completely different fixes. 26 minutes to detect is an alerting problem. 61 minutes to mitigate is a tooling and runbook problem. A single "87 minute incident" number hides both.

### 3.3 Contributing factors, not root cause

There is no root cause. There's a chain, and every link is a place to intervene.

Write factors as **conditions**, and give each one a system-level intervention:

```md
## Contributing factors

1. **The pool change was safe at deploy time and unsafe six hours later.**
   #2214 shipped at 01:52 into overnight traffic. A pool of 10 was genuinely sufficient
   then. Our deploy validation asks "is it healthy now?", which is the wrong question for
   any change whose safety depends on load. → *Load-dependent config changes need a
   staged rollout that spans a traffic peak, or a load test that simulates one.*

2. **The saturation alert was scoped to a service that no longer owned the code.**
   Added in 2024 for `api`. Checkout was extracted in November; the alert was not.
   Nothing detects an orphaned alert — we had no inventory tying alerts to services.
   → *Alert rules live in the service's own repo, so an extraction moves them or drops
   them loudly.*

3. **The error threshold was tuned for a different failure shape.**
   5% over 10m catches a total outage fast and a 4% partial failure never. We were at
   4.1% for 26 minutes — thousands of real users, zero pages. → *Add a
   low-and-slow burn-rate alert alongside the fast one.*

4. **The dashboard's information architecture reflected our last three incidents.**
   Query latency was top-left; `pool.waiting` was a panel below the fold added a month
   ago. The responder went where the dashboard pointed. → *Saturation metrics move
   above the fold; this is a layout fix, not a training issue.*

5. **`#2214` was a one-line config change and got a 90-second review.**
   Both reviewer and author read it as "reduce idle connections," which it was. Nobody
   asked "what's the peak concurrent demand?" because nothing in the PR template asks.
   → *Capacity-affecting config gets a required "what's the peak?" field.*
```

Notice: five factors, five interventions, zero people named as causes. #2214's author appears nowhere, because "an engineer approved a reasonable-looking one-line change" is not a finding — it's Tuesday.

**The five-whys trap.** Asked mechanically, five-whys walks a single chain and dead-ends at a person every time: *Why did checkout fail? Pool exhausted. Why? #2214 lowered it. Why? An engineer set it to 10. Why? They didn't check peak load. Why? They were careless.* → action item: "be more careful." That's a fully-formed, completely useless analysis, and it's what the technique produces by default. Real incidents are a lattice, not a chain. Ask "what else had to be true?" at every node, and stop when you have interventions, not when you have five levels.

### 3.4 The war story: the postmortem that named a person

An early one I wrote had a line in it: *"@dev-name deployed the config change without checking peak traffic."* Factually true. Everything after that line was worthless.

The author, entirely reasonably, wrote a rebuttal in the comments. The review meeting became a forty-minute argument about whether the check was documented anywhere (it wasn't). Two of the five real factors above were never discussed, because we spent the whole meeting on the one that was about a person. The action item we shipped was "add peak-load check to the deploy checklist" — a document nobody read then and nobody reads now. The alert stayed orphaned. Nine weeks later we had the same incident on a different service, and that time it was 14:00.

The tell was in the grammar. **Any sentence in a postmortem whose subject is a person's name is a bug in the postmortem.** Rewrite until the subject is a system, a process, or a piece of code. "@dev-name didn't check peak traffic" → "nothing in the change process surfaces peak concurrent demand for capacity-affecting config." Same fact. One of them gets fixed.

### 3.5 Action items with a bar

Every item gets: an owner (a person, never a team), a date, a ticket, and a class.

```md
| # | Class | Action | Owner | Due | Ticket |
|---|---|---|---|---|---|
| 1 | Detect | Burn-rate alert on checkout 5xx: page at 2% over 5m | @priya | Mar 11 | #412 |
| 2 | Detect | Move alert rules into each service repo; audit for orphans | @dan | Mar 25 | #413 |
| 3 | Prevent | PR template: required "peak concurrent demand" field for pool/limit changes | @mohan | Mar 14 | #414 |
| 4 | Mitigate | `pool.waiting` and saturation panels above the fold on the checkout dashboard | @priya | Mar 11 | #415 |
| 5 | Mitigate | Runbook: checkout pool exhaustion (see §3.6) | @mohan | Mar 12 | #416 |
| 6 | Prevent | Load-dependent config changes deploy at 09:00 UTC, never overnight | @dan | Mar 18 | #417 |
```

The bar an item must clear: **could a person who has never read this postmortem execute it, and would it have changed the outcome?**

Items that fail the bar, always:

- "Be more careful with config changes" — not executable, not verifiable, insulting.
- "Improve monitoring" — improve it how, on what signal, alerting at what threshold?
- "Add training on connection pools" — training decays in six weeks; the dashboard layout doesn't.
- "The team will review capacity before deploys" — no owner. A team is not an owner.
- "Document the deploy process" — a document is not a control. Nobody reads it at 3am.

And the rule that gives the whole practice teeth: **if the action items aren't scheduled like real work, stop writing postmortems.** An org with 40 open action items from 12 postmortems is doing incident theatre, and everyone in it knows.

### 3.6 The runbook

The runbook exists for one reader: a tired person who did not build this, at 3am, being paged. Write for them.

```md
# Runbook: checkout pool exhaustion

**Alert:** `CheckoutPoolSaturated` · **Severity:** SEV2 · **Owner:** @mohan
**Fires when:** `pool_waiting_count{service="checkout"} > 50` for 3m

## Is this the real thing? (30 seconds)
1. Dashboard: https://grafana.internal/d/checkout-health
2. Real if: `pool.waiting` > 50 AND `checkout_errors_total` rising AND RDS CPU **normal**.
3. **NOT this** if RDS CPU > 80% → the DB is the bottleneck, not the pool.
   Go to `runbooks/rds-cpu.md`. Raising the pool here makes it strictly worse.
```

Then the part the responder actually came for — mitigation, before understanding:

```sh
# 1. What is the pool actually set to right now?
kubectl -n prod get deploy checkout -o jsonpath='{..env[?(@.name=="DB_POOL_MAX")].value}'

# 2. Was there a recent config change? (this is the answer ~70% of the time)
kubectl -n prod rollout history deploy/checkout
git log --oneline -10 -- services/checkout/config/

# 3. If a recent deploy touched pool/limits — revert. Do not debug forward.
kubectl -n prod rollout undo deploy/checkout
# Recovery is ~90s. Watch: `checkout_errors_total` should fall within 2m of pods ready.

# 4. If NO recent change, this is organic growth. Raise the ceiling temporarily:
kubectl -n prod set env deploy/checkout DB_POOL_MAX=60
# SAFETY: RDS max_connections is 200; checkout runs 3 pods. 60x3 = 180 < 200.
# Do NOT exceed 60 without also checking what api/ and worker/ are holding —
# exhausting max_connections takes down every service, not just this one.
```

And the three sections people leave out, which are the ones that save the night:

```md
## If mitigation doesn't work in 10 minutes
Escalate: @priya (secondary), then @dan (DB owner). Say the words "I've reverted and
errors are still climbing" — that's the phrase that changes the diagnosis.

## Do not
- Do not restart RDS. Never the fix here; costs 5+ minutes of total outage.
- Do not raise the pool above 60 without a `max_connections` check (see safety note).
- Do not "fix it properly" during the incident. Revert, then fix in daylight.

## Related
- Postmortem 2026-03-04 (this alert exists because of it)
- `runbooks/rds-cpu.md` — the lookalike this is most often confused with
```

What makes it a runbook rather than a document: it starts with **how to tell if it's a false alarm**, it names the **lookalike incident** and where to go instead, every command is **copy-pasteable with no placeholders to guess**, the destructive knob carries its **safety limit inline** at the moment you'd turn it, and it has an **explicit give-up condition with a name attached**. A runbook without an escalation trigger produces a responder who flails for ninety minutes rather than admit defeat at ten.

Link the runbook from the alert itself. A runbook the pager doesn't point at will not be found by a person who is 40 seconds awake.

## 4. Anti-patterns

- **A person's name as the subject of a sentence.** The single tell for a blameful postmortem. Rewrite until the subject is a system. Once someone gets punished for an incident, every subsequent postmortem in the company is a work of fiction.
- **"Root cause: human error."** That's the beginning of the analysis, written down as if it were the end.
- **Mechanical five-whys.** Walks one chain, terminates at a person, outputs "be more careful." Ask "what else had to be true?" instead.
- **Action items with no owner or no date.** Never done. A team is not an owner.
- **"Add it to the checklist" / "document the process" / "add training."** Documents and memory decay; guardrails, defaults, and alerts don't. Prefer the fix that works when nobody remembers the incident.
- **Deleting "what we got lucky on."** It's the cheapest list of your next three incidents and it costs ten minutes to write.
- **One "duration" number.** Detect time and mitigate time have unrelated fixes. Report both or you'll fix neither.
- **A timeline with no dead ends.** Nobody believes it, and you've hidden the part where the real lesson lives.
- **Writing it three weeks later.** Everyone's memory has already rewritten itself into a coherent story where they were right. Draft within 48 hours.
- **The postmortem nobody reads.** If the review meeting is the author reading the doc aloud, cancel it and send the doc. The meeting is for disagreement about factors and action items — nothing else.
- **A runbook that explains the architecture.** At 3am nobody wants your design doc. First line is a command or a decision, not context.
- **A runbook with placeholders.** `kubectl -n <namespace> ...` means the responder guesses under stress. Write the real namespace.
- **40 open action items across 12 postmortems.** You've built a system for producing documents. Close the loop or stop.

## 5. Usage

1. Load this skill within 48 hours of the incident, while people still remember what they *believed* at each step. Paste the raw material: alert timestamps, chat log, deploy history, graphs described in words.
2. Ask for the timeline first, on its own, in UTC — and explicitly ask it to include dead ends and the responder's hypothesis at each step. Correct it before going further; every later section depends on this being honest.
3. Ask for contributing factors with the §3.3 constraint stated out loud: "conditions, not events; each one gets a system-level intervention; no person is the subject of any sentence." Then ask it to find two more by asking "what else had to be true?" at each node.
4. Reject any action item that is training, documentation, a checklist entry, or "be more careful." Ask: "what guardrail would have made this incident boring, and what does it cost to build?"
5. Ask for the "what we got lucky on" section explicitly — assistants skip it, and it's the most valuable part. Prompt it: "what would have made this a SEV1, and what stopped it?"
6. Then, in the same session, ask for the runbook. The context is already loaded and this is the only moment in the year when the failure mode is fresh enough to write about accurately. Require: false-alarm check first, lookalike named, no placeholders, safety limits inline, explicit escalation trigger.

## 6. Example Output

Prompt with this skill loaded: *"Rewrite these draft findings from our checkout outage."*

**Draft the team wrote:**
> Root cause: @dev-name reduced the connection pool to 10 without checking peak traffic.
> Action items: (1) be more careful with capacity changes, (2) add pool sizing to the
> deploy checklist, (3) team to review config PRs more thoroughly.

**Rewritten:**

> **Contributing factors**
>
> 1. **The change was correct at deploy time and incorrect at peak.** #2214 shipped at
>    01:52 into overnight traffic where a pool of 10 was genuinely sufficient. Our deploy
>    validation asks "healthy now?" — the wrong question for any load-dependent setting.
>    → *Staged rollout spanning a traffic peak for pool/limit/timeout changes (#417).*
> 2. **Nothing in the change surfaced the number that mattered.** Peak concurrent demand
>    was ~34. It appears on no dashboard, in no PR template, in no code comment near the
>    setting. Both author and reviewer read the diff correctly as "reduce idle
>    connections." → *Required "peak concurrent demand" field on capacity PRs (#414);
>    comment the observed peak next to the default in code.*
> 3. **The saturation alert was orphaned by a service extraction.** Written for `api` in
>    2024; checkout split out in November and the rule didn't follow. Nothing detects an
>    orphaned alert. → *Alert rules live in the service repo (#413).*
> 4. **The threshold was shaped for outages, not partial failures.** 5% over 10m; we sat
>    at 4.1% for 26 minutes. Thousands of failed checkouts, zero pages.
>    → *Burn-rate alert at 2% over 5m (#412).*
>
> **What we got lucky on**
> The pool exhausted *before* the payment authorization call, so no customer was charged
> without an order. Nothing in the design guarantees that ordering — the same exhaustion
> 40ms later takes money and creates no order. That's a bigger finding than the outage.
> → *Filed #418: verify checkout is idempotent across a failure between authorize and
> order-write. Not an action item from this incident's cause; an action item from its
> luck.*
>
> **Dropped from the draft, with reasons**
> - "Be more careful" — not executable, not verifiable, and it's item #1 only because the
>   analysis stopped at a person. Replaced by factors 1 and 2.
> - "Add pool sizing to the deploy checklist" — a checklist is a document; documents decay
>   and nobody reads them under time pressure. Replaced by a required PR field (#414),
>   which is a control that runs whether or not anyone remembers this incident.
> - "Team to review config PRs more thoroughly" — no owner, no bar, no verification. The
>   review *was* thorough for what it could see; the missing input was data (#414), not
>   diligence.
> - "@dev-name reduced the pool without checking peak traffic" — factually true and
>   analytically worthless. The reviewable question is why a prod capacity change can be
>   made without the capacity number in front of you.

Markers of skill-compliant output: no person is the subject of any sentence, and the one that was is explicitly retired with a reason rather than silently deleted; every factor is a *condition* ("correct at deploy, incorrect at peak") with a numbered ticket for its intervention; each dropped action item is dropped against the §3.5 bar and replaced with a control that survives everyone forgetting; detect (26m) and mitigate (61m) are attacked separately by items #412 and #416; and "what we got lucky on" produced #418 — a finding about an incident that hasn't happened yet, which is the entire reason the section exists.
