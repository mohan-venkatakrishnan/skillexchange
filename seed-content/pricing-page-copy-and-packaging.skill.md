---
title: Pricing Page Copy and Packaging Skill
category: Marketing
description: Package and price a developer tool so the page answers "what will this cost me" in one screen — a metric that tracks value instead of punishing success, tier boundaries drawn where real usage splits, and copy that names the limits before the reader has to hunt for them. Kills the pricing page every founder ships: three columns of feature checkmarks, a middle tier nobody can justify, and "Contact us" on a product that costs less than a team lunch.
usage: Load this skill with what your product does, who pays, what the marginal cost of a customer actually is, and any usage distribution you have. Ask it to interrogate the pricing metric before it writes a single tier — most bad pricing pages are bad packaging wearing good copy. It will refuse to invent conversion or willingness-to-pay numbers and will name the experiment you'd need instead.
platforms: [Claude, ChatGPT]
priceUsd: 0
timeSavedHours: 12
pocUrl: https://stripe.com/docs/billing
---

# Pricing Page Copy and Packaging Skill

## 1. Philosophy

A pricing page is a page where someone tries to work out what happens to their credit card. Everything else — the design, the toggle, the checkmarks — is in the way of that.

1. **Bad copy is usually good copy on bad packaging.** If your tiers are drawn in the wrong place, no headline saves them. Fix the metric and the boundaries first; the words take an hour after that.
2. **The metric should go up when the customer wins.** Price on something that grows as they get more value — events processed, seats that are actually using it. Price on something that grows when they *suffer* — API errors, storage of logs they didn't want — and every invoice is a small insult.
3. **The page must be readable by one person in thirty seconds.** They are not comparing you to a competitor. They are working out whether this fits in a budget they may not control, and whether it will surprise them in month four.
4. **Say the limit out loud.** The number that kills your deal is the one they find in the docs after signing up. Print the ceiling, print the overage, print what happens when they hit it. A reader who trusts your page reads more of it.
5. **A tier exists to be *chosen*, not to make another tier look good.** If you designed a middle tier to anchor the top one, your customers will feel it. The decoy is a real technique and it's also how you become a company people talk about in past tense.
6. **You are almost certainly too cheap.** The single most common error in solo developer tools is a $5/mo price on a product saving a team four hours a month. The instinct that low prices reduce friction is right for consumers and wrong for a company expensing it.

## 2. Tech Stack

A craft skill about words and boundaries; the tooling is incidental.

- **Stripe Billing documentation** — https://stripe.com/docs/billing — a first-party reference for what's mechanically possible: metered usage, tiered rates, proration, trials. Useful because pricing that your billing system can't express is a plan, not a price. This skill is provider-neutral and names Stripe only as an implementation reference; Paddle, Lemon Squeezy, and Razorpay all cover this ground with different merchant-of-record and tax implications, which is a real decision but not this skill's subject.
- **Your own usage distribution.** The single most valuable input, and it isn't a tool: a histogram of whatever you might price on, across your existing users. Tier boundaries are read off that histogram. Without it you're guessing, and the skill will say so.
- **A checkout you've tested from a phone.** Not this skill's subject either, but half your pricing failures are a card form that doesn't work on Safari.

All example tiers, prices, copy, and distributions in this file are original to this skill and written for fictional products. No real company's pricing is reproduced or referenced.

## 3. Patterns

### 3.1 Interrogate the metric before you draw a single tier

Four questions. A metric that fails any one of them will produce a page you rewrite in six months.

1. **Does it rise with value received?** Events replayed: yes. Seats: usually. Storage of error logs: no — that rises with their bad week.
2. **Can the buyer predict it before they buy?** "Per API call" on a product whose call volume they can't estimate is a page that generates a support question instead of a purchase.
3. **Does it punish good behaviour?** Priced per project, and now they cram six services into one project to save $9. You've made your product worse and taught them to game it.
4. **Can you actually count it, in real time, and show them?** A metered price with no usage dashboard is a page asking for blind trust.

Worked example — a fictional webhook proxy, four candidate metrics:

| Metric | Rises with value? | Predictable? | Verdict |
|---|---|---|---|
| Per seat | No — one engineer sets it up, forever | Yes | Caps you at $9/customer regardless of scale |
| Per endpoint | Weakly | Yes | Punishes microservices, which is your best segment |
| Per event captured | **Yes** | Roughly | **This one** |
| Per event *replayed* | Yes, but only when things break | No — spikes on their worst day | Bills them for their outage |

The last row is the trap that looks clever. Replays are where the value lands, so pricing on replays feels right — and it means a customer's invoice triples during an incident, which is the exact moment they're deciding whether you're a friend.

### 3.2 Draw boundaries off the histogram, not off round numbers

Tier boundaries usually get chosen because 10,000 is a nice number. Plot your users instead:

```
events/mo across 180 users, log buckets:

  <1k     ████████████████████████████ 71   ← hobby, side projects
  1k-10k  ██████████████ 38               ← one real service
  10k-50k █████ 14                        ← a small company
  50k-250k ██ 6                           ← the real customers
  >250k   █ 2                             ← talk to these two personally
```

The gaps are the boundaries. That distribution says: **free to 1k** (the 71 were never going to pay and they're your word of mouth), **one paid tier at 50k** covering the 38+14 who are the business, and a **usage-based tier above** for the 6. That's two prices and a free tier. Not three columns because three columns is what pricing pages look like.

The corollary nobody likes: if 71 of your 180 users are in the free bucket and always will be, you don't have a pricing problem, you have a positioning problem. No boundary converts a hobbyist.

**The failure this prevents:** a founder sets the free tier at 10,000 events because it's round. It happens to sit above the 1k–10k bucket, so all 38 users with one real service in production — the ones who'd have paid — are permanently free. The free tier ate the business, and it took eleven months to see it because signups looked great the whole time.

### 3.3 Two tiers and a floor, not three columns

The three-column grid is a convention, not a finding. Most developer tools want:

- **A free tier that is genuinely useful and clearly bounded.** Not a trial. Not "free for 14 days." A permanent, real thing with a ceiling you print. Its job is adoption and honesty, not conversion.
- **One paid tier.** One price, one number, no seats. "$29/mo, up to 50k events, unlimited endpoints and users."
- **A usage tier or a real conversation** for the top 3%, priced with a formula you print: "$29 + $0.40 per 1k events over 50k."

Why not three: the middle tier of a three-column page exists to be chosen by default, which means you've built a product whose price is a psychological effect. It also doubles your copy, doubles your feature-matrix maintenance, and creates the single worst artifact in software marketing — **the checkmark grid** — where the reader must diff two columns to learn that Pro has "Advanced Analytics" and Starter has "Analytics."

The honest version of a feature difference is a sentence: *"Team adds SSO and audit logs. If you don't know whether you need those, you don't."*

### 3.4 Every limit, printed, next to the price

The reader's real question isn't "how much" — it's "how much *later*, when I'm dependent on this."

> **Pro — $29/mo**
> Up to 50,000 events a month. Unlimited endpoints, unlimited users, 30-day retention.
> **Over 50k:** $0.40 per additional 1,000. No throttling, no surprise upgrade — we bill the overage and email you at 80%.
> **If you stop paying:** capture stops. Your stored events stay downloadable for 90 days. `relayd export` gives you NDJSON of everything, always, on every tier including free.

That last block converts people. Not because leaving is appealing — because a vendor who tells you how to leave is a vendor who doesn't expect to need the lock-in. It's the single most under-used paragraph on developer pricing pages.

Contrast with the standard: `Pro — $29/mo — Generous limits ✓`. "Generous" means "we'll decide later," and every engineer who's been throttled at 2am reads it that way.

### 3.5 The five words that cost you money

| On the page | What the reader hears | Write instead |
|---|---|---|
| "Contact us" (on a <$100 product) | "They'll price me off my logo" | The number |
| "Unlimited*" | "There's a footnote and it's the real limit" | "50k/mo, $0.40 per 1k after" |
| "Generous limits" | "Undefined limits" | The limit |
| "Starting at $29" | "It's not $29" | What it is at the median |
| "Most popular" on the tier you want sold | "This is a nudge" | Nothing. Delete the badge. |

**"Contact us for pricing"** deserves its own note. On a genuine six-figure enterprise product it's normal. On a $29/mo developer tool it does three things: it removes you from consideration by everyone who won't book a call (most of them), it signals value-based pricing to the ones who do, and it tells engineers that the price depends on who's asking. If you have a number, print the number. If you don't have a number, you don't have a product yet — you have a consulting practice.

### 3.6 The free tier is a decision about who you're for

Free is not a marketing tactic; it's a segmentation. Three shapes, and you must pick on purpose:

- **Free forever, bounded by usage** (1k events/mo). Right when marginal cost is near zero and free users generate word of mouth, bug reports, and blog posts. The hobbyist who never pays writes the Stack Overflow answer that brings the customer who does.
- **Free forever, bounded by capability** (CLI free, CI integration paid). Right when the free thing is genuinely useful alone and the paid thing is the automation. This is often the best shape for developer tools: the individual keeps the CLI, the company pays for the thing that runs unattended.
- **No free tier, real trial.** Right when marginal cost is real (you're running GPUs) or the value is instant.

What is not a shape: **free with a limit low enough to be useless.** 100 events/mo, on a product where a test suite generates 100 events in a minute. That's a demo you've called free, and it costs you the goodwill of free without buying the adoption of free.

The capability split has one specific advantage worth naming: it puts the price on the surface that has a budget. An engineer expensing $9/mo is a conversation with their manager. A GitHub Action their team depends on is a line item. Same money, completely different friction.

### 3.7 Raise the price; grandfather the early users

You are too cheap. The evidence is usually sitting right there: nobody has ever pushed back on the price, your churn is low, and support volume is manageable. Zero price objections means the price is not a constraint — it's a gift.

When you raise:

- **Grandfather existing customers indefinitely, and tell them you did.** "You're on the $9 plan. You'll stay on it as long as you keep the subscription. New signups pay $29 from Monday." It costs you almost nothing — they're a small cohort — and it buys you a group of people who now tell others they got in early. The alternative (a 30-day notice migration) buys you a churn spike and a Reddit thread.
- **Change the *packaging* when you change the price.** A 3x on the same page is a slap. A 3x alongside a new capability boundary is a repositioning.
- **Announce it to your list before you change the page.** The people who find out from the pricing page feel found out.

The one thing you cannot do is raise the price on the free tier's replacement and pretend the old thing never existed. Someone has a screenshot. Someone always has a screenshot.

## 4. Anti-patterns

- **The checkmark grid.** Three columns, eighteen rows, and the reader must diff two lists to find the difference. Nobody has ever bought because of row twelve. A sentence per tier does the whole job.
- **"Contact us" on a sub-$100 product.** You have eliminated everyone who won't book a call, which is nearly everyone, and told the rest that price depends on their logo.
- **Pricing on a metric that spikes during an incident.** Per error, per retry, per replay. The invoice triples on their worst day and you become the vendor who profits from outages.
- **A decoy middle tier.** Built to make Pro look reasonable. Customers can feel the manipulation even when they can't name it, and it doubles your maintenance forever.
- **"Unlimited*".** The asterisk is the actual price and everyone knows it.
- **Per-seat pricing on a tool one engineer configures.** You've capped revenue at one seat and simultaneously created an incentive to share a login.
- **A free tier so generous it eats the paying segment.** 10k free events when your entire "one real service in production" cohort sits at 8k. Great signup graph, no revenue, eleven months to notice.
- **A free tier so mean it's a demo.** 100 events. You paid the cost of free and bought none of the adoption.
- **Per-project pricing.** Customers respond by cramming everything into one project, which makes your product worse for them and your revenue worse for you.
- **Hiding the overage.** The reader will hit it, at scale, in month four, and the first they'll hear about it is an invoice. That's a refund, a churn, and a tweet.
- **No exit story.** Nobody says how to get their data out, so the careful buyer — your best buyer — assumes there isn't a way.
- **Never raising it.** Two years at $5/mo because a price rise feels rude. You're not being generous; you're funding your customers' margins with your evenings.

## 5. Usage

1. Load this skill and lead with packaging inputs, not copy requests: what the thing does, who signs the invoice, what a customer costs you at the margin, and — if you have it — your usage histogram. The last one is worth more than everything else combined.
2. Ask it to **interrogate the metric first**: *"I'm thinking per-seat. Attack it."* Expect the four questions from §3.1 and expect it to name what your metric punishes.
3. Give it the distribution as raw buckets. Ask for boundaries read off the gaps. If you don't have the data, ask what to instrument and wait a month — a guessed boundary is a rewrite you've scheduled.
4. Request the tier block and the limits block as separate artifacts. The limits block is the one that converts, and asking for it separately stops it being compressed into a checkmark.
5. Reject any output containing: a checkmark grid, "unlimited" with an asterisk, "generous," "contact us" on a sub-$100 tier, a "most popular" badge, or three tiers where the middle one's job is to make the third look sane.
6. It will not invent willingness-to-pay, conversion rates, or "typical" market prices. Where a number is load-bearing you'll get `[NEEDS: what do your top 10 users actually process?]` — that's the skill working, not failing.
7. For a price rise, hand it your current price, your churn, and how many objections you've had. Zero objections is a finding, and it should say so bluntly.

## 6. Example Output

Prompt with this skill loaded: *"Coldline — CLI that kills serverless cold starts by pre-warming on real traffic patterns. Currently $12/mo flat, hosted scheduler. 140 paying, 900 free CLI users, ~2% monthly churn, nobody has ever complained about the price. My cost is about $0.30/customer/mo in Lambda + EventBridge. Distribution of warmed functions per account: 620 accounts have 1-3, 290 have 4-15, 110 have 16-60, 20 have 60+. Fix my pricing."*

---

**Three findings before any copy.**

**1. Your metric is wrong, but not in the obvious way.** Per-account flat pricing means the account warming 80 functions and the account warming 2 pay identically — and the 80-function account is where the value is *and* where your cost is. Functions-warmed rises with value, is perfectly predictable (they know how many functions they have), doesn't punish anything, and you already count it. It's the metric.

**2. Zero price objections in 140 customers is not good news.** It's the clearest signal in your prompt. Nobody has ever pushed back, churn is 2%, and you're saving people a real AWS bill. $12 is a rounding error to anyone with 16+ functions in production — those 110 accounts are expensing this without reading the invoice. You are leaving most of your revenue on the table and calling it product-market fit.

**3. Your histogram has two clean gaps, at 3 and at 15.** They're doing the tier design for you.

**Packaging — free floor, one price, one formula:**

```
Free — the CLI, forever
  coldline analyze runs locally, unlimited, no account.
  It reads your CloudWatch history, prints the pattern and the
  schedule it would apply. You can implement that schedule yourself
  with an EventBridge rule and a ping — it's about 20 lines and
  the docs show you how.
  This is a real thing, not a demo. If you have three functions,
  do this and don't pay me.

Pro — $39/mo
  Hosted scheduling for up to 15 functions.
  Re-detects your traffic pattern weekly. Maintenance windows,
  multi-region, DST-correct schedules.
  No seats. Your whole team, one price.

Scale — $39 + $2/function beyond 15
  Same product. Nothing gated, nothing extra to unlock.
  At 60 functions that's $129/mo.
  Print the formula. No "contact us" until someone's over 200,
  and even then it's a discount conversation, not a mystery.
```

**Why the boundaries sit there:** free at "the CLI, unbounded" rather than "3 functions" because your marginal cost is $0.30 and the 620 small accounts are your distribution — they write the blog posts and file the bugs. Paid starts at hosted scheduling, which is the **capability split from §3.6**: the individual keeps the local tool, the company pays for the thing that runs unattended at 6am. That's the surface with a budget.

15 is the gap in your histogram. It also means your 290 mid accounts pay $39 and your 110 large accounts pay $50–$129 — the segment that gets the most value pays the most, which is what the metric is for.

**The limits block — put this directly under the price:**

> **Over 15 functions:** $2 each per month, billed on the count at the end of the cycle. We email at 14. Nothing throttles, nothing stops warming, and we never auto-upgrade you into a tier you didn't pick.
> **If you cancel:** scheduling stops at the end of the cycle. Your EventBridge rules are yours — they're in your account, we don't hold them. `coldline eject` prints the raw Terraform for your current schedules so you can keep running it without us. The CLI stays free.

`coldline eject` may be the highest-converting feature on this page and it's four hours of work. A tool that hands you the Terraform to replace it is a tool people trust with production.

**On the price rise from $12 → $39:**

Grandfather all 140. Indefinitely, in writing, this week, before the page changes:

> Subject: `you're staying on $12`
>
> Coldline goes to $39 for new signups on Monday, with a per-function rate above 15.
>
> You're on $12 and you're staying on $12 for as long as you keep the subscription — including if you add functions. No migration, no date, nothing to do.
>
> Why the rise: 2.0 does multi-region and DST-correct scheduling, and the honest reason is $12 was too low to fund the thing you depend on. I'd rather charge properly than quietly stop maintaining it.
>
> — Mohan

Those 140 cost you $50/mo in lost revenue at the new price and buy you 140 people who got in early and know it. That's the cheapest goodwill available to you.

**[NEEDS, and these are load-bearing: (1) of your 110 accounts with 16+ functions, what's their AWS bill for provisioned concurrency today? If Coldline saves them $400/mo, $129 isn't aggressive, it's still cheap, and the whole formula should move. (2) What's your free→paid conversion currently? I've assumed the free CLI is distribution, not a leak, but if 900 free users include a hundred who'd pay, the capability split is drawn in the wrong place. I'm not going to guess either of these — the first one is one email to three customers.]**

---

Markers of skill-compliant output: the metric is attacked before any tier is drawn, and the fix (per-function) is justified against all four tests rather than asserted; "zero price objections" is read as a finding — that the price is not a constraint — instead of as validation; boundaries are read off the gaps in the supplied histogram rather than rounded to 10 and 50; the result is a free tier, one price, and a printed formula rather than three columns and a checkmark grid; the free tier is a capability split that deliberately keeps the local CLI unbounded because the 620 small accounts are distribution, and it explicitly tells some readers not to pay; the limits block states the overage, the notification threshold, and refuses auto-upgrade; the exit story hands the customer the Terraform to replace the product; the price rise grandfathers every existing customer in writing with a plainly stated reason; and the two numbers that would change the answer are named as blockers with the exact way to go get one of them.
