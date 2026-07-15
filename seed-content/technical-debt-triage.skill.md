---
title: Technical Debt Triage Skill
category: Other
description: Decide which mess to fix and which to leave alone, with an argument your product manager will actually accept — interest-rate thinking, a two-axis ranking, and the paydown patterns that ship alongside features instead of competing with them. Kills the two failure modes: the refactor quarter that delivers nothing, and the five-year backlog of "cleanup" tickets nobody will ever pull.
usage: Load this skill when you're staring at a codebase you're afraid of, or writing the case for time to fix it. Describe the messes and where the team is slowing down, and your assistant will rank them by interest rate rather than by ugliness, and draft the pitch in cost-of-delay terms rather than engineering aesthetics.
platforms: [Claude, Cursor]
priceUsd: 6
timeSavedHours: 12
pocUrl: https://martinfowler.com/bliki/TechnicalDebtQuadrant.html
---

# Technical Debt Triage Skill

## 1. Philosophy

The word "debt" is doing real work in the metaphor and almost everyone drops the important half. Debt isn't bad — leverage is how you ship before your competitor. What kills teams is *unpriced* debt: borrowing without ever looking at the interest rate, and then being confused about why every feature takes three months.

1. **Interest rate, not principal.** The question is never "how ugly is this?" It's "what does this cost me per month, and is that going up?" A grotesque module that nobody touches and that never breaks has an interest rate of zero. Leave it alone. It is not a problem; it's just unpleasant to look at, and your discomfort is not a business case.
2. **Only debt you're paying interest on is worth repaying.** Most of the mess in your codebase costs nothing. Fix the mess that's on the path of the next six months of work.
3. **Not all debt is a mistake.** Some was a deliberate, correct trade to hit a window. Some is honest ignorance — you learned something and now the design is wrong. Some is genuine recklessness. These need different responses, and conflating them means the trade you made on purpose gets treated as a moral failing by the next engineer.
4. **Debt compounds through coupling, not through ugliness.** A bad function is a bad function. A bad function that fourteen modules import is an architecture. The multiplier is always the blast radius.
5. **"Refactor sprint" is a phrase that precedes a failure.** Big-bang paydown is a rewrite with a friendlier name: no user-visible progress, no way to stop halfway, and the first business emergency kills it and leaves you *worse* — half-migrated is the most expensive state a system can be in.
6. **You must make the case in their currency.** "This code is bad" is a taste claim, and your PM is right to discount it. "Checkout changes take 3 weeks instead of 4 days, and we have six checkout features queued" is a schedule claim, and it's the same fact.

## 2. Tech Stack

- **Fowler's Technical Debt Quadrant** — https://martinfowler.com/bliki/TechnicalDebtQuadrant.html — published free on martinfowler.com. The deliberate/inadvertent × prudent/reckless split behind §3.2. It's a short read and the framing is the durable part.
- **`git log` as an instrument** — Git, https://git-scm.com, **GPL-2.0**. Change frequency per file is the cheapest and most honest debt signal available, and it's already in your repo.
- **code-maat** — https://github.com/adamtornhill/code-maat — **GPL-3.0**. Mines VCS history for change coupling and hotspots. Optional; §3.3 gets you 80% of the value with two shell commands.
- **A static analyzer you already run** — ESLint, ruff, SonarQube, whatever. Useful for *finding* candidates, useless for *ranking* them, and the difference is this entire skill.
- **Your issue tracker.** Debt items are tickets with sizes, or they're grievances.

This skill is an independent, original guide; it is not affiliated with or endorsed by Martin Fowler. All examples, scoring schemes, and templates are original to this skill.

## 3. Patterns

### 3.1 Interest rate: the only question

For each candidate mess, three numbers. Estimate them badly; badly is fine, because you only need the ranking, not the values.

- **Interest** — hours per month the team loses to it. Slower changes, recurring bugs, onboarding time, the incident every six weeks.
- **Principal** — hours to fix it properly, including migration and the risk of breaking things.
- **Trend** — is the interest rising, flat, or falling? Rising is the whole game.

```
  Monthly interest  │  Principal  │  Trend     │  Payback   │  Verdict
 ───────────────────┼─────────────┼────────────┼────────────┼──────────────
  Auth: 30h/mo      │  80h        │  rising ↑  │  2.7 mo    │  FIX NOW
  Legacy importer:  │  200h       │  falling ↓ │  25 mo     │  never — it's
    8h/mo           │             │  (killing  │            │  being deleted
                    │             │   the      │            │
                    │             │   feature) │            │
  God object,       │  120h       │  flat →    │  60 mo     │  leave it.
    untouched:      │             │            │            │  ugly ≠ costly
    2h/mo           │             │            │            │
  Flaky test suite: │  40h        │  rising ↑  │  1 mo      │  FIX NOW
    40h/mo          │             │            │            │
```

Two of these are counterintuitive and both are correct. The god object — genuinely the worst code in the building, the one everyone complains about at lunch — is a 60-month payback. Leave it. The flaky test suite — which nobody calls "technical debt" because it's not in `src/` — has a one-month payback and is quietly the most expensive thing you own.

That's the pattern, and it repeats: **the debt people talk about is rarely the debt that's charging them.** The expensive stuff is boring. It's the 40-minute CI run, the local setup that takes a new hire two days, the deploy that needs a human at a terminal, the test suite you re-run twice before believing it. None of it looks like debt because none of it is ugly code. All of it is charging you every single day.

How to estimate interest without a research project: at the next retro ask "where did the week go that shouldn't have?" You'll get the real list in ten minutes, and it will not match the list of things people complain about aesthetically.

### 3.2 What kind of debt is it?

Fowler's quadrant, because the response differs per cell and treating them identically is how you get blame:

|  | **Reckless** | **Prudent** |
|---|---|---|
| **Deliberate** | "No time for design" | "Ship now, refactor after the launch" |
| **Inadvertent** | "What's a layered architecture?" | "Now we know what the design should have been" |

- **Deliberate + prudent** — the good kind. You knew the cost and took it to hit a window. The failure isn't taking it; it's never writing down *when* you'd repay it. Record the trade at the moment you make it (§3.6) or it becomes inadvertent debt for whoever inherits it — indistinguishable from a mistake, and defended as if it were a decision.
- **Inadvertent + prudent** — the most common kind in any healthy team, and it isn't a failure at all. You designed it well with what you knew. You now know more. That's called learning, and the design being wrong is the *evidence* of it.
- **Deliberate + reckless** — "we don't have time for tests." Rare in the wild as an honest statement; usually it's deliberate+prudent that never got written down and has since rotted.
- **Inadvertent + reckless** — a skill gap. The fix is mentoring and review, not a refactor ticket. Refactoring the output of a skill gap without addressing the gap regenerates the same debt in a different file by Q3.

The reason to classify at all: it stops the postmortem-style blame spiral. Most debt is inadvertent+prudent, meaning nobody was careless — the world moved. That's a much easier conversation to have with a PM, and it's usually the true one.

### 3.3 Find the real hotspots with git

Static analysis tells you where the complexity is. It cannot tell you where the *cost* is, because it can't see who touches what. Complexity × change frequency is the actual signal, and it's two commands.

```sh
# Most-changed files in the last 6 months — this is where the money goes.
git log --since='6 months ago' --name-only --pretty=format: \
  | grep -v '^$' | sort | uniq -c | sort -rn | head -20

# Files that keep appearing in bug-fix commits specifically:
git log --since='6 months ago' --name-only --pretty=format: \
  --grep='fix\|bug\|hotfix' -i \
  | grep -v '^$' | sort | uniq -c | sort -rn | head -20

# Change coupling: what always changes alongside src/auth/session.ts?
# If two files always move together but don't import each other, you have a
# hidden dependency — and it will be forgotten exactly once, in prod.
for c in $(git log --since='6 months ago' --format=%H -- src/auth/session.ts); do
  git show --name-only --pretty=format: "$c"
done | grep -v '^$' | sort | uniq -c | sort -rn | head -10
```

Read the intersection: **high complexity + high churn + appears in fix commits** is your fix-now list, and it's usually three or four files, not thirty. High complexity + zero churn is the god object — a museum piece. Leave it.

The change-coupling query earns its keep more than the other two. When `session.ts` and `permissions.ts` change together 90% of the time with no import between them, you've found a coupling that exists only in the team's heads. That's the one that produces the incident, because heads leave.

### 3.4 The 2x2 that survives a PM conversation

```
                      COST TO FIX
                  low            high
              ┌──────────────┬──────────────┐
       high   │  DO IT NOW   │  MAKE THE    │
  PAIN        │  (this week) │  CASE        │
  (interest)  ├──────────────┼──────────────┤
       low    │  BOY SCOUT   │  WRITE IT    │
              │  (in passing)│  DOWN, LEAVE │
              └──────────────┴──────────────┘
```

- **Do it now** — don't ask permission, don't make a ticket, it's smaller than the meeting about it.
- **Make the case** — §3.5. This is the only quadrant needing a negotiation, which means you should have at most one or two of these live at a time.
- **Boy scout** — fix it when you're already in the file for another reason. Never as its own PR; a standalone "cleanup" PR is a review cost with no delivery attached.
- **Write it down, leave it** — a comment naming the cost, an accepted-debt entry. This is a real, respectable outcome. Most debt lives here forever and that's *correct*.

The trap in this grid is the bottom-left. "Boy scout" is right, and it decays into "every PR touches 40 unrelated files" if you don't bound it. The rule that works: **cleanup rides along only if it's in the blast radius of the change you're already making, and the PR is still reviewable in twenty minutes.** Otherwise it's a separate PR that will get an LGTM in four minutes, which is the same as not reviewing it.

### 3.5 Making the case

Every failed debt pitch fails the same way: it's an argument about code quality made to someone who is correctly not paid to care about code quality. Translate first.

**Doesn't work:** "The auth module is a mess, we need to refactor it. It has no tests and the abstractions are wrong."

**Works:**

> **The ask:** two engineers, three weeks, starting after the March release.
>
> **What it costs to not do it:** Auth changes take ~3 weeks each right now; comparable
> changes elsewhere take ~4 days. We have six auth-touching features on the H1 roadmap
> (SSO, 2FA, session timeout, the Cognito migration, seller verification, admin
> impersonation). At the current rate that's ~18 weeks of engineering; at the normal
> rate it's ~5. We're going to spend 13 weeks either way — the only question is
> whether we spend it once, now, or six times, spread across every feature you're
> waiting on.
>
> **What we'd do:** Strangler-fig. New `SessionService` behind the existing interface,
> move one caller per week, delete the old path when the last one moves. Every week
> ends shippable and revertible. No branch lives more than five days.
>
> **How you'll know it's working:** auth change lead time (currently 3 weeks) on the
> team dashboard. If it hasn't moved after two weeks, we stop and I'll have been wrong
> in public rather than quietly over a quarter.
>
> **What we're not doing:** not touching the permissions model, not upgrading the
> Cognito SDK, not fixing the god object in billing. Auth session handling only.
>
> **If we defer to Q3:** SSO ships on the old path, which adds a seventh caller to
> migrate. Principal goes up ~30%. This is the last cheap moment.

Five things make this land, and all five are non-negotiable:

- **The cost of delay is in their unit** — weeks of roadmap, not engineering aesthetics.
- **There's an incremental plan** with a stopping point at every step. A PM's real fear is the three-week ask becoming a nine-week hole they can't kill.
- **There's a metric that could prove you wrong.** Volunteering falsifiability buys more credibility than any amount of confidence.
- **The scope is explicitly bounded** — you name what you're *not* doing. This is the single strongest signal that you're not going to disappear into a rewrite.
- **The deferral cost is quantified.** "Later is fine, and here's the price of later" is far more persuasive than "we must do this now," because it hands them the decision instead of a demand.

### 3.6 Record the trade when you make it

Debt you took on purpose becomes debt somebody blames you for, unless it's written down at the moment of borrowing. Thirty seconds, in the code, where the next person is already standing:

```ts
// DEBT (2026-02-14, @mohan): No idempotency on this webhook handler.
// WHY: Razorpay integration had to ship for the March launch; the idempotency
//   store needs a DynamoDB table + TTL design we didn't have time to get right.
// COST: A duplicate webhook double-credits a purchase. Razorpay retries on any
//   non-2xx, so this is reachable on any timeout — not theoretical. Manual
//   reconciliation ~1h/week currently.
// TRIGGER TO FIX: before we exceed ~500 purchases/month (currently ~40), or
//   the first time reconciliation takes more than a day. Whichever first.
// TICKET: #431
```

The `TRIGGER TO FIX` line is the one that matters and it's the one everyone omits. "We'll fix it later" has no truth conditions — it can never become false, so it never fires. "Before 500 purchases/month" is a tripwire someone can actually trip over. Wire it to an alert and it fires without anyone remembering.

And be honest in `COST`. If you write "theoretical, low risk" for something reachable on any timeout, you're not recording a trade, you're building an alibi.

### 3.7 The war story: the quarter of the great refactor

We got the quarter. Genuinely — a real, blessed, "no features, fix the foundation" quarter that engineers dream about. Three of us, twelve weeks, rebuild the data layer properly.

Week 1–7 went well. The new layer was better in every way and I still think the design was right.

Week 8, a competitor shipped a thing, and the quarter ended by executive fiat on a Tuesday. We were roughly 60% migrated: new layer for reads, old layer for most writes, a compatibility shim between them, and a set of invariants that only held if you knew about both. Not half the value — *negative* value. Every subsequent feature paid for two data layers instead of one, plus the shim, plus the tribal knowledge of which was which. The shim outlived two of the three engineers who wrote it. It was still there four years later, and by then nobody could remove it because nobody could enumerate what depended on the coupling.

What I got wrong wasn't the design or the estimate. It was betting on twelve uninterrupted weeks, in an organization where twelve uninterrupted weeks have never once existed. **The plan needed to be correct at every stopping point, and it was only correct at the end.** That's not a plan; that's a wager on institutional attention, and the house always wins.

What works instead, every time I've done it since: strangler-fig with a hard weekly cadence. New implementation behind the old interface. Migrate one caller per week. Delete the old path when the last caller moves. If it gets cancelled at week 3, you've migrated three callers and the system is *strictly better* than when you started. There is no half-migrated state that costs more than not starting, because every week's end state is a shippable, revertible whole.

The uncomfortable corollary: some debt is never worth fixing under this constraint. If it genuinely cannot be done incrementally, and it genuinely needs eight uninterrupted weeks, then in most organizations the honest answer is that it will not be fixed, and you should plan around it rather than pitch it annually. Writing that down and routing new work away from it is a real strategy. Waiting for a quarter that isn't coming is not.

## 4. Anti-patterns

- **Ranking by ugliness.** The code everyone complains about at lunch is usually a museum piece with a 60-month payback. The 40-minute CI run nobody calls debt is charging you daily.
- **"We need a refactor sprint."** Big-bang paydown with a friendlier name. No shippable intermediate, and the first emergency leaves you half-migrated — the most expensive state a system can be in. See §3.7.
- **Making the case in engineering currency.** "The abstractions are wrong" is a taste claim to anyone outside the team, and they're right to discount it. Translate to roadmap weeks or don't pitch.
- **Asking for a debt quarter.** Even if you get it, you're betting on uninterrupted attention that has never existed in your org. Plan that's correct only at the end isn't a plan.
- **The 400-item "tech debt" backlog.** A grievance archive. Nobody has ever pulled from it. If an item's been there a year, close it — that's information, not failure.
- **"We'll fix it later."** No truth conditions, so it can never become false, so it never fires. A trigger with a number is a tripwire; "later" is a feeling.
- **Fixing debt in code you're about to delete.** Check the roadmap before you touch anything. That importer is going away in June.
- **Boy-scouting outside your blast radius.** A PR that touches 40 unrelated files to fix naming is unreviewable, and unreviewable means unreviewed.
- **Standalone cleanup PRs.** All review cost, no delivery. They get an LGTM in four minutes, which is the same as no review, on a diff whose entire premise is "this changes nothing."
- **Treating all debt as failure.** Most of it is inadvertent+prudent: you designed well, then you learned. That's not a mistake, and framing it as one makes people defensive about designs they should be free to abandon.
- **Refactoring the output of a skill gap.** Same debt regenerates in a different file by Q3. The intervention is review and mentoring, not a ticket.
- **A debt comment with no trigger and no ticket.** A confession, not a plan.
- **Refusing to accept debt.** "Write it down and leave it" is where most debt correctly lives forever. A team that fixes everything ships nothing.

## 5. Usage

1. Load this skill and list the messes plainly, with **where the team actually loses time** — not where the code offends you: "auth is a mess, checkout changes take three weeks, CI takes 40 minutes, the importer is horrifying but nobody touches it."
2. Ask for the §3.1 table first: interest per month, principal, trend, payback. Force it to estimate hours even on thin evidence — the ranking survives bad estimates, and you need the ranking, not the numbers.
3. Run the §3.3 git commands and paste the output in. This is the step that changes minds, including yours: the hotspot list rarely matches the complaint list, and the change-coupling query usually finds a dependency nobody knew existed.
4. Reject any recommendation to fix something with a flat trend and low churn, however ugly. Ask: "what does this cost per month, and is that rising?" If the answer is "nothing" and "no," it goes in the write-it-down quadrant and you move on.
5. For the one or two items that need a negotiation, ask for the §3.5 pitch and demand all five elements — cost of delay in roadmap weeks, an incremental plan with weekly stopping points, a metric that could prove you wrong, an explicit *not doing* list, and the quantified cost of deferring.
6. Reject any plan whose value only arrives at the end. Ask: "if this is cancelled at week 3, is the system better or worse than today?" If worse, it's a rewrite in disguise — ask for the strangler-fig version.
7. When you *take* debt deliberately, ask for the §3.6 comment in the same session, while you still remember the real reason. Require a numeric trigger. "Later" is not a trigger.

## 6. Example Output

Prompt with this skill loaded: *"Everyone wants to rewrite our billing god object — it's 2,400 lines and universally hated. But checkout features are also taking forever and CI is 40 minutes. Three engineers. What do we actually do?"*

**Hotspot data first (`git log`, last 6 months):**

```
  Changes  File                          In fix commits
  ───────  ────────────────────────────  ──────────────
      94   src/checkout/session.ts             31
      88   src/checkout/pricing.ts             27
      61   src/checkout/validate.ts            14
       3   src/billing/BillingManager.ts        0   ← the hated god object
```

The god object changed **three times in six months** and appears in **zero** fix commits. It is not costing you anything. It's a museum piece and the team's feelings about it are aesthetic, not economic.

Also: `session.ts` and `pricing.ts` change together in 71 of 94 commits with no import between them. That's a hidden coupling, and it's the thing generating the 31 fix commits.

| Item | Interest/mo | Principal | Trend | Payback | Verdict |
|---|---|---|---|---|---|
| CI at 40 min | ~50h (3 eng × ~5 waits/day × context loss) | 30h | rising ↑ (grows with suite) | **0.6 mo** | **Do it now.** Nobody called this debt. It's your most expensive asset by 3x. |
| checkout session/pricing coupling | ~35h (3-week changes; 31 fix commits) | 90h | rising ↑ (6 checkout features queued) | 2.6 mo | **Make the case.** The only negotiation here. |
| billing god object | ~1h | 200h | flat → | 200 mo | **Write it down. Leave it.** Ugly ≠ costly. |
| legacy importer | ~8h | 150h | falling ↓ (deprecated in June) | n/a | **Never.** Don't fix code you're deleting. |

**Week 1, no permission needed (do-it-now quadrant):** CI. 40 min → target under 10. Parallelize by file, cache the deps layer, move the 6 browser tests to a nightly job. 30 hours of work, ~50 hours/month back, pays for itself in under three weeks, and it makes every subsequent item cheaper to work on because the feedback loop is shorter. Nobody needs to approve this — it's smaller than the meeting would be.

**The one pitch (make-the-case quadrant):**

> **Ask:** two engineers, three weeks, starting after the March release.
>
> **Cost of not doing it:** checkout changes take ~3 weeks; comparable work elsewhere
> takes ~4 days. Six checkout features are on the H1 roadmap. That's ~18 weeks at the
> current rate vs ~5 at a normal one. We spend the 13 weeks either way — once now, or
> six times, spread across every feature you're waiting for. The 31 checkout bug fixes
> in the last six months are the same problem billing you in a different column.
>
> **Plan:** extract pricing behind a `PricingService` interface. One caller per week —
> there are seven. Each week ends shippable and revertible; if we're pulled off at week
> 2, two callers are migrated and the system is better than today, not half-broken.
>
> **Metric:** checkout change lead time, currently ~3 weeks, on the team dashboard. If
> it hasn't moved by week 2, we stop. I'd rather be wrong in public in two weeks than
> quietly over a quarter.
>
> **Not doing:** the billing god object (three changes in six months, zero bugs — it
> costs us nothing and rewriting it is 200 hours), the importer (deprecated in June),
> the Stripe migration.
>
> **If we defer to Q3:** SSO and the two checkout features ship on the coupled path,
> adding two more callers to migrate. Principal goes up ~30%.

**And the thing to say out loud to the team:** we are not rewriting `BillingManager.ts`. It's the worst code we own and it's costing us approximately nothing. We're fixing CI, which nobody hates, because it's costing us 50 hours a month. This will feel wrong, and the git log is why it isn't.

Markers of skill-compliant output: the git data is gathered *before* the opinion, and it inverts the team's priorities — the universally hated god object is 200-month payback and gets explicitly declined, while the 40-minute CI run that nobody classified as debt turns out to be the top item at 0.6-month payback; the deprecated importer is refused on roadmap grounds rather than technical ones; exactly one item goes to negotiation, and its pitch carries all five §3.5 elements — roadmap-week cost of delay, a strangler-fig plan that's correct if cancelled at any week, a falsifiable metric with a stopping rule, an explicit not-doing list, and a quantified deferral cost; the change-coupling query found the hidden `session`/`pricing` dependency that was generating the bug fixes, which no static analyzer would have surfaced; and the summary names the emotional cost of the decision instead of pretending the data makes it painless.
