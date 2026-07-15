---
title: Code Review That Ships Skill
category: Other
description: Run reviews that catch real defects without stalling the team — sized PRs, a comment taxonomy that ends stalemates, and the four questions worth asking on every diff. Fixes the two failure modes: the rubber-stamp LGTM that lets a nullable field through, and the 200-comment gauntlet that turns a two-day change into a two-week negotiation.
usage: Load this skill before asking your assistant to review a diff, or before you write the PR description for one. Paste the diff plus what the change is supposed to do, and it will return findings sorted by severity with the blocking/non-blocking prefix attached, instead of an unranked wall of style notes.
platforms: [Claude, Cursor]
priceUsd: 5
timeSavedHours: 10
pocUrl: https://google.github.io/eng-practices/review/
---

# Code Review That Ships Skill

## 1. Philosophy

Review has exactly two products: fewer defects in production, and more people who understand the system. Anything a review does that serves neither — arguing about a ternary, relitigating a decision made in a design doc, holding a diff hostage to a rename — is theatre with a queue attached.

1. **Approve when it improves the codebase, not when it's perfect.** The comparison is the diff against `main`, never the diff against the version you'd have written. A change that is clearly better than the status quo and has no defects gets approved today, with the nits marked as nits. "Perfect" is a moving target that only the reviewer can see.
2. **Latency is a correctness feature.** A PR that sits 36 hours gets rebased, re-tested, re-read from scratch by an author who has forgotten it, and grows in scope while it waits. Fast, imperfect review beats slow, thorough review — because slow review pushes authors toward giant batched PRs, which is exactly where real bugs hide.
3. **Every comment carries its own severity.** Unlabeled comments are all read as blocking, so a reviewer's stray "could use `map` here" costs the author a round trip. One prefix per comment ends that permanently.
4. **The reviewer owns the tone; the author owns the code.** "This is wrong" is about a person. "This returns `undefined` when `items` is empty — is that reachable from the cart page?" is about a line. The second gets fixed faster because nobody has to defend anything.
5. **Facts settle disputes; seniority doesn't.** When a review deadlocks, the resolution is a benchmark, a failing test, a link to the standard, or a decision-maker — never who has been at the company longer.
6. **You cannot review what you can't hold in your head.** Past ~400 lines, defect detection falls off a cliff and reviewers switch to scanning for style, because style is the only thing you *can* judge at that size. A 900-line PR gets an LGTM in four minutes. That's not diligence failing; that's arithmetic.

## 2. Tech Stack

- **Google's Engineering Practices documentation** — https://google.github.io/eng-practices/review/ — published under **CC-BY 3.0**. The public reference for the "approve when it improves the codebase" standard and the author/reviewer split. Worth reading in full; this skill is an opinionated field guide, not a summary of it.
- **Conventional Comments** — https://conventionalcomments.org — the public convention behind the `praise:` / `nit:` / `issue:` / `question:` prefix taxonomy in §3.2. Free to adopt; no tooling required.
- **`git diff --stat` / `git range-diff`** — Git, https://git-scm.com, **GPL-2.0**. `range-diff` is the tool that makes re-reviewing a force-pushed branch survivable.
- **GitHub `CODEOWNERS`** and draft PRs, or the equivalent in GitLab/Gitea — used for routing, not for gatekeeping.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Google Engineering Practices maintainers. All example code, templates, and checklists are original to this skill.

## 3. Patterns

### 3.1 Size the PR before you write it

The single highest-leverage review intervention happens before review: the author splits the work.

```sh
git diff --stat main...HEAD | tail -1
#  47 files changed, 1,918 insertions(+), 402 deletions(-)   ← this will get an LGTM in 4 minutes
```

Rough, honest bands from watching this go wrong repeatedly:

| Diff size | What actually happens |
|---|---|
| < 50 lines | Line-by-line reading. Real defects found. |
| 50–200 | The sweet spot. Reviewer holds the whole change in working memory. |
| 200–400 | Attention drops in the back half. Bugs hide after line 250. |
| 400–1000 | Reviewer reads the first file carefully, skims the rest, comments on naming. |
| > 1000 | LGTM. Possibly with a nit about a comment typo, to prove it was read. |

Split by **mechanism**, not by file count:

1. Pure refactor / rename / move — no behavior change, reviewable in ninety seconds because the reviewer's only job is "is this really behavior-preserving?"
2. New capability, unwired — the code exists, nothing calls it, tests cover it.
3. The wiring — small, and now genuinely readable because the reviewer already understands the pieces.

The generated-code exception: a 4,000-line lockfile or a regenerated API client is fine in one PR *provided it's alone in that PR*. Mixing 40 hand-written lines into a 4,000-line generated diff is how hand-written lines go unreviewed.

### 3.2 The comment taxonomy that ends the round trips

Prefix every comment. Two categories exist: blocking and not. Everything else is decoration on top of that binary.

```
issue (blocking): `user.email` is optional in the schema but this dereferences it
  directly. A Google-federated signup with no email claim will 500 here. Repro:
  POST /profile with the token in fixtures/oauth-no-email.json.

question (blocking): Is the 30s cache TTL intentional? Session data changes on
  logout — I think this serves a stale session for up to 30s after sign-out.
  If I'm wrong, ignore this and I'll approve.

suggestion (non-blocking): This loop could be a `reduce`. Genuinely equivalent;
  take it or leave it.

nit (non-blocking): typo — "recieve" → "receive"

praise: The state machine table in `checkout.ts` is much easier to follow than
  the nested conditionals it replaced. Thank you.

chore (blocking): Needs a CHANGELOG entry before merge — release gate will fail.
```

Three rules make this work:

- **Non-blocking means non-blocking.** If you write `nit:` and then withhold approval over it, you have taught the whole team that the prefixes are meaningless, and they will never trust one again.
- **`question:` is the most powerful prefix you have.** It's how you flag a suspected bug without being wrong in public, and it costs the author nothing to answer if you *are* wrong. Most real defects I've caught started as a question.
- **`praise:` isn't decoration.** It's the only signal that tells authors which of their choices to repeat. A review stream that is 100% criticism teaches people to write defensively, not well.

### 3.3 The four questions

Everything else is a special case of these. Ask them in this order — the order is the point, because the expensive mistakes are at the top.

**1. Is this the right change at all?** Does it solve the stated problem? Is there a smaller change that does? This is the only question that can't be answered later, so it must be answered first — and it's why "is this the right approach?" belongs on the design doc or a draft PR, not on line 340 of a finished implementation. Rewriting someone's architecture in review comments after they've built it is the cruelest thing in this profession.

**2. What breaks at the boundaries?** Empty collection, null/undefined, zero, negative, the maximum, concurrent callers, the second call. Nine of ten defects that reach production live here, and they're invisible in the happy-path test the author wrote.

**3. What happens when it fails?** Network dies mid-write, the process is killed between two writes, the callee throws. Is the error swallowed? Is it retryable? Is the operation idempotent if it's retried? Does the error message contain enough to debug it at 3am, and *not* contain the customer's token?

**4. Will the next person understand it?** Not "is it clever." Can someone who has never seen this file fix a bug in it six months from now, at speed, without archaeology?

Deliberately **not** on the list: formatting, import order, quote style. Those belong to a formatter that runs in CI. A human commenting on whitespace is a broken toolchain wearing a person as a costume.

### 3.4 Reviewing a force-push without re-reading everything

The author addressed feedback, rebased onto `main`, and force-pushed. GitHub now shows you 60 files of other people's commits mixed with their four fixes. This is where reviewers give up and re-approve blind.

```sh
git range-diff main...@{u}@{1} main...@{u}
# shows ONLY what changed between the two versions of the branch,
# with the rebase noise factored out
```

If your platform can't do this, insist that fix-up commits stay unsquashed until approval, then squash at merge. The cost of a slightly messy branch is trivial next to a second review that was never really performed.

### 3.5 Deadlock protocol

Two competent people disagree and the PR has been open five days. Escalate in this fixed order and it resolves within a day, every time:

1. **Move it out of the comment thread.** Threads reward whoever types more. Fifteen minutes on a call resolves what nine comments couldn't.
2. **Convert the opinion into a fact.** "This will be slow" → benchmark it. "This breaks X" → write the failing test. If neither of you will spend twenty minutes producing evidence, neither of you actually believes it matters, and the author's version ships.
3. **Check the standard.** If there's a written convention, it wins, and the argument was really about the convention — take that to the convention.
4. **Name a decider.** Tech lead, module owner, whoever. They decide in a sentence and everyone commits. Not consensus — a decision.
5. **Ship it, file the follow-up.** "I still think this is wrong, here's issue #412, approving." A tracked disagreement is worth more than a blocked queue.

Never step 6: silent non-approval. Letting a PR rot because you don't want to say no is the most corrosive thing a reviewer can do, and everyone can see you doing it.

### 3.6 The PR description is half the review

A reviewer who has to reconstruct intent from the diff will review the diff's internal consistency and nothing else — the code will look fine because it's self-consistent, and they'll miss that it solves the wrong problem.

```md
## What
Cache the resolved tax rate per (country, date) for the duration of one invoice render.

## Why
Invoice rendering called `resolveTaxRate()` once per line item. For a 40-line
invoice that's 40 identical DB round trips — p95 render was 2.4s, ~1.9s of it in
that query. See #388.

## How
Memoize on (country, ISO date) inside the render scope. Cleared per render, so no
cross-request leakage and no TTL to reason about.

## Risk
The rate is date-derived. If an invoice ever spans a rate-change boundary the cache
would serve the wrong rate — impossible today (one invoice, one issue date) but the
cache key includes the date so it degrades to the current behavior if that changes.

## Verified
- Unit: rate change at a boundary date returns two distinct rates (`tax-cache.test.ts`)
- Manual: 40-line DE invoice, p95 2.4s → 210ms, output byte-identical to main
```

The `Risk` section is where you earn your reviewer's attention. An author who names their own worst case gets read generously; an author who writes "small change, should be safe" gets read like a suspect.

## 4. Anti-patterns

- **The 900-line PR.** It will be approved in four minutes with a comment about a typo. You did not get a review; you got a signature.
- **Unlabeled comments.** Every one reads as blocking. The author does six round trips to satisfy three style preferences and learns to dread your name in the reviewer field.
- **Blocking on a `nit:`.** Do this once and your prefixes are noise forever.
- **Design feedback on a finished implementation.** If the approach is wrong, that conversation was owed at the draft. Raising it at line 340 of a complete PR is a demand for a rewrite dressed as a comment.
- **The style bot made of meat.** Import order, quotes, line length: formatter, CI, done. Never a human.
- **"Why didn't you do it my way?"** The bar is *better than main*, not *identical to my mental draft*.
- **Review by test-coverage percentage.** "Needs more tests" without naming the untested behavior sends the author to write tests for getters.
- **Silent non-approval.** The passive-aggressive veto. It's visible, it's corrosive, and it makes people route around you.
- **Rubber-stamping your friend's PRs and gauntleting the new hire's.** Everyone notices this within two weeks, including the new hire.
- **Reviewing a rebased force-push by re-approving without `range-diff`.** You approved 60 files you never read.
- **"Nice work! LGTM 🚀" on a diff you skimmed.** Praise for code you didn't read is worse than no praise; it tells the author their work is beneath examination.

## 5. Usage

1. Load this skill, then paste the diff **and the intent**: "This should make invoice render stop re-querying the tax rate per line. Review it." Without the intent, you get a consistency check, not a review.
2. Ask for output ordered by the four questions of §3.3, with a Conventional Comments prefix on every finding. Explicitly request that non-blocking items be grouped at the bottom so you can read the blockers first.
3. Reject any review whose first three comments are naming, formatting, or import order — that's a review that never got to question 2. Ask it to re-run against boundaries and failure modes.
4. Reject a finding stated as an assertion without a trigger. "This could be null" is noise; "this is null when `items` is empty, which the cart page reaches on first load" is a bug report. Ask for the reachable path or ask it to downgrade to `question:`.
5. As an author, run this on your own diff before you open the PR. Fixing your own boundary bugs costs one edit; fixing them after review costs a round trip and someone else's afternoon.
6. If a review deadlocks, paste both positions and ask which step of §3.5 applies. Usually the answer is "neither of you has benchmarked it."

## 6. Example Output

Prompt with this skill loaded: *"Review this. It's meant to cache the tax rate per invoice render so we stop hitting the DB 40 times."*

```ts
// src/invoices/tax-cache.ts
const cache = new Map<string, number>()

export async function resolveTaxRate(country: string, issuedAt: Date): Promise<number> {
  const key = country
  if (cache.has(key)) return cache.get(key)!
  const row = await db.query('SELECT rate FROM tax_rates WHERE country = $1', [country])
  cache.set(key, row.rate)
  return row.rate
}
```

**Review**

> **issue (blocking) — §3.3 Q2, boundaries.** `cache` is module-level, so it lives for the
> lifetime of the process, not the render. The PR description says "per invoice render";
> this is a permanent process-global. First invoice of the day caches DE at 19%, the rate
> changes in the tax table, and every subsequent invoice on that instance is wrong until
> the next deploy. Reachable today: rates change annually and we don't restart on that.

> **issue (blocking) — §3.3 Q2.** The cache key is `country`, but the rate is a function of
> `(country, issuedAt)` — `issuedAt` is accepted and then never used. Backfilling a
> January invoice after a February rate change silently returns February's rate. Suggest
> `` const key = `${country}:${issuedAt.toISOString().slice(0, 10)}` ``.

> **issue (blocking) — §3.3 Q3, failure modes.** `row.rate` isn't checked. For an unknown
> country `db.query` returns no row and this throws `Cannot read properties of undefined`
> from three frames deep in the render, with no country in the message. Worse: on a
> throw, nothing is cached, so every line item retries the failing query — the exact
> 40x amplification this PR exists to remove, now on the error path.

> **question (blocking).** Concurrent renders share this Map. Two requests for an
> uncached country both miss and both query — harmless here, but if you intended
> single-flight, it isn't. If duplicate queries on a cold key are fine, say so and I'll
> drop this.

> **suggestion (non-blocking) — §3.3 Q4.** A bounded map, or a cache created per render
> and passed in, would make the lifetime obvious from the type instead of from a comment.
> Passing it in also kills the blocking issue above by construction.

> **praise.** The `Verified` section with before/after p95 and the byte-identical output
> check is exactly what makes this reviewable in five minutes. More of that.

> **nit (non-blocking).** `row` reads like a rowset; `rateRow` would be clearer.

Markers of skill-compliant output: every comment carries a prefix and the blockers come first; each `issue` names a *reachable trigger* (rate change, backfill, unknown country) rather than a hypothetical; the review catches that the PR's stated intent ("per render") and the code's actual behavior (process-global) diverge — which is only possible because the intent was supplied; question 3 caught that the error path re-amplifies the very problem the PR fixes; the uncertain concurrency point is a `question:` with an explicit "say so and I'll drop this" rather than a demand; and the two non-blocking items sit at the bottom, clearly labeled, where they cost the author nothing.
