---
title: Hunting Regressions with Git Bisect Skill
category: Other
description: Turn "it worked last month, it's broken now, and nobody knows why" into a named commit in twenty minutes — a scripted, automated bisect with a test that actually reproduces the bug. Covers the traps that make bisects lie: flaky tests, skipped build-broken ranges, merge commits, and the first-bad-commit that turns out to be a revert of a revert.
usage: Load this skill when you have a regression with a known-good and known-bad reference and no idea what caused it. Give your assistant the symptom, the good ref, the bad ref, and how you check the bug, and it will produce a deterministic `git bisect run` script with the right exit codes, plus the follow-up commands to interpret the result.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 12
pocUrl: https://git-scm.com
---

# Hunting Regressions with Git Bisect Skill

## 1. Philosophy

Bisect is binary search over history. That's the whole idea, and it's why it works: 4,000 commits collapse to twelve tests. Everything hard about bisecting is not the search — it's building a test the search can trust.

1. **The reproduction script is the entire skill.** A bisect is only as good as the question you ask at each step. If your check is "run the app and eyeball the dashboard," you will make a judgment error somewhere around step eight, the search will confidently converge on an innocent commit, and you'll spend the afternoon reading a diff that changed a CSS variable.
2. **Automate before the second manual step.** People bisect by hand because writing the script feels like a detour. It isn't: twelve manual iterations of build-run-look is forty minutes of context-switching, and one misclick invalidates all of it. Ten minutes writing `bisect-check.sh` is cheaper and it's *replayable* when you realize your good ref was wrong.
3. **A bisect that yields no reproduction at the bad ref has already failed.** Verify the bad commit reproduces and the good commit doesn't, *before* starting. Half of all "bisect gave a nonsense answer" reports are someone whose "known good" was never good — the bug was there, just latent, or masked by a cache.
4. **Flake is fatal, not annoying.** Binary search assumes a monotone predicate: broken from some point onward, working before. One flaky test result flips a branch of the search and every subsequent step is searching the wrong half. There is no partial credit.
5. **The first bad commit is a lead, not a verdict.** It's the commit that made the symptom visible. Very often the actual defect landed months earlier and this commit merely started calling it. Bisect points at the door; you still have to walk through it.

## 2. Tech Stack

- **Git** — https://git-scm.com — licensed **GPL-2.0**. `git bisect` has shipped in core Git since the early days; `git bisect run` (the automation entry point this skill is built around) and `--first-parent` are the two subcommands that matter most here.
- **POSIX shell** for check scripts. Exit codes are the entire interface, so keep them in plain `sh` rather than a language with a runtime that may not build at every commit in the range.
- **`git replay` / `git rerere`** — same repository, same GPL-2.0 license. `rerere` is optional but pays for itself when a bisect range needs the same conflict resolution repeatedly.
- Examples assume a Node/TypeScript project for concreteness; the mechanics are language-agnostic and the check script is the only part that changes.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Git maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Prove both endpoints before you search

```sh
git switch --detach v4.2.0
npm ci --silent && node scripts/repro.mjs; echo "good ref exit=$?"   # expect 0

git switch --detach main
npm ci --silent && node scripts/repro.mjs; echo "bad ref exit=$?"    # expect non-zero
```

If the good ref fails, your good ref isn't good — walk further back by tags before starting. If the bad ref passes, your reproduction doesn't reproduce, and no amount of bisecting will fix that.

Then narrow the range by hand before you spend machine time. History is cheap to sample:

```sh
git log --oneline --first-parent v4.2.0..main | wc -l     # 812 — that's ~10 steps
git log --oneline --first-parent --since='6 weeks ago' -- src/pricing/
```

### 3.2 The check script, and the exit codes that matter

`git bisect run` reads exit codes, and three of them are special:

| Exit | Meaning |
|---|---|
| `0` | good |
| `1`–`124`, `126`, `127` | bad |
| `125` | **skip** — cannot test this commit (build broken, deps unresolvable) |
| `128`–`255` | abort the whole bisect immediately |

`125` is the one everybody forgets, and it's the difference between a bisect that survives a broken build in the middle of the range and one that marks eleven innocent commits bad.

```sh
#!/bin/sh
# scripts/bisect-check.sh — exits 0 good, 1 bad, 125 untestable
set -u

# Untestable: dependency manifest predates the lockfile format we can install.
npm ci --silent --no-audit --no-fund || exit 125
npm run build --silent || exit 125          # build breakage is NOT the bug we're hunting

# The actual predicate. One assertion. No eyeballs.
node scripts/repro.mjs
case $? in
  0) exit 0 ;;    # bug absent
  1) exit 1 ;;    # bug present
  *) exit 125 ;;  # repro harness itself broke here — don't guess
esac
```

Note what's deliberate: a failed *build* is 125, not 1. If you let build failures count as bad, bisect converges on the commit that broke the build three weeks before your bug — a real, reproducible, completely useless answer.

### 3.3 Run it

```sh
git bisect start
git bisect bad main
git bisect good v4.2.0
git bisect run sh scripts/bisect-check.sh
# ... 10 steps later ...
git bisect log > /tmp/bisect.log   # ALWAYS. This is your undo.
git bisect reset
```

`git bisect log` is the most undervalued command in the set. It's a replayable transcript: if you realize at step nine that your script had a bug, fix the script, then `git bisect replay /tmp/bisect.log` re-establishes every judgment you still trust and you only redo what changed. Without it, a mistake means starting over.

Keep the check script out of the bisected tree, or bisect will check out a revision where your script doesn't exist yet. Two ways:

```sh
cp scripts/bisect-check.sh /tmp/check.sh          # simplest
git bisect run sh /tmp/check.sh

# or keep the harness pinned while the source moves:
git bisect run sh -c 'git checkout main -- tests/repro/ && node tests/repro/run.mjs; rc=$?; git checkout -- tests/repro/; exit $rc'
```

The second form is the one you want when the bug is in `src/` but your reproduction lives in `tests/` and has been improved since the good ref.

### 3.4 `--first-parent`: the merge commit war story

A bisect on a merge-heavy repo landed us on a merge commit. Not a commit *inside* a branch — the merge itself. The diff was 340 files, the message was "Merge pull request #2214," and the team spent two hours convinced bisect had broken.

It hadn't. Both parents were individually fine; the *combination* was broken. A rename on `main` and a new call site on the feature branch merged cleanly at the text level and produced a semantic conflict that no test on either branch could have caught. That's not a bisect failure — it's bisect correctly reporting that the merge introduced the bug. It happens more than people expect, and it's a genuinely valuable result: it tells you your merge gate isn't testing merge results.

When you only care about *which merge / which PR*, and not which line inside somebody's branch, restrict the walk:

```sh
git bisect start --first-parent main v4.2.0
```

This searches only the mainline, so each step is a whole PR. Fewer steps, each with an obvious owner, and no risk of landing on a mid-branch WIP commit that never built. Start here on a squash-and-merge or merge-commit repo; drop `--first-parent` only if you then need to narrow inside the guilty branch.

### 3.5 Flake: measure it, then defeat it

Before trusting the search, quantify the predicate:

```sh
for i in $(seq 1 20); do node scripts/repro.mjs >/dev/null 2>&1; printf '%s' "$?"; done; echo
# 11111111111111111111  → deterministic. Bisect away.
# 10110111011101110111  → ~25% flake. Bisect will lie to you.
```

If it flakes, do not bisect the raw check. Make the predicate deterministic by amplifying and thresholding:

```sh
#!/bin/sh
# The bug is a race, ~1-in-8. Twenty attempts, and we call it bad on any single hit.
set -u
npm ci --silent || exit 125
npm run build --silent || exit 125
i=0
while [ $i -lt 20 ]; do
  node scripts/repro.mjs || exit 1      # any reproduction at all = bad
  i=$((i + 1))
done
exit 0                                   # twenty clean runs = good, at ~93% confidence
```

Asymmetry is the trick: a single failure is strong evidence of "bad," while "good" needs many clean runs. Set the loop count from the observed rate — at a 1-in-8 base rate, twenty runs give you roughly a 7% chance of a false "good" per step, and a false good is the expensive one because it discards the half of history containing your bug.

### 3.6 Terms, skips, and the range that won't build

`good`/`bad` are wrong words for half of real searches. When you're finding where something got *fixed*, or where a performance number crossed a line, rename them:

```sh
git bisect start --term-old=fast --term-new=slow
git bisect slow main
git bisect fast v4.2.0
git bisect run sh -c 'node bench.mjs --max-ms 250'
```

For a range you genuinely cannot test — a two-week window where the dev server didn't start — `git bisect skip` marks it, and Git routes the search around it. Skip too much and you get "The first bad commit could be any of: ..." with a list. That's not a failure, it's an honest answer: bisect narrowed as far as your testable commits allow. Read every candidate in the list; usually one is obviously the culprit.

### 3.7 After the answer

```sh
git show --stat <first-bad>
git log --oneline -5 <first-bad>            # what else landed around it?
git revert --no-commit <first-bad> && npm run build && node scripts/repro.mjs   # confirm
```

Revert-and-verify is the step people skip. It takes ninety seconds and it's the only thing that distinguishes "bisect named this commit" from "this commit causes the bug." If reverting doesn't fix it, your search was wrong somewhere — go read `/tmp/bisect.log`.

And when the answer is a one-line commit that merely *enabled* a code path, keep going. We once bisected a checkout crash to a commit adding a feature flag default. The real defect was fourteen months old, in a currency-rounding helper that had never been reachable in production. Bisect found the door, not the room.

## 4. Anti-patterns

- **Bisecting without verifying the endpoints.** The single most common cause of "bisect gave a nonsense answer." Two commands, thirty seconds, do it every time.
- **Treating a build failure as `bad` (exit 1).** Now you're bisecting build health, not your bug, and the answer is a commit from a different month.
- **Bisecting a flaky predicate.** Binary search on a non-monotone predicate is not a slower search; it's a *wrong* search that still terminates confidently. Measure the flake rate first or don't start.
- **Manual bisecting past step two.** Twelve build-run-eyeball cycles, no transcript, one misjudgment invalidates everything, and you cannot replay. Write the script.
- **Forgetting `git bisect log`.** Your only undo. Redirect it to a file before `reset`, every single time.
- **Keeping the check script inside the bisected tree.** Git checks out a revision from before you wrote it and the run dies with `No such file`. Copy it to `/tmp` first.
- **Not running `git bisect reset`.** You are left on a detached HEAD in the middle of history. The next `npm ci` writes a lockfile against a five-month-old manifest and you commit it on top of a stale tree.
- **Dismissing a merge commit as a bisect bug.** It's usually a real semantic merge conflict — and a real gap in your merge gate.
- **Bisecting a range of 60,000 commits across a vendored-dependency import.** Narrow with `git log -- <path>` and `--since` first. Bisect is fast, but sixteen `npm ci` runs at four minutes each is still an hour.
- **Blaming the author of the first bad commit.** They made a latent bug visible. That's a service. The postmortem question is why the defect was reachable for fourteen months without a test — not who flipped the flag.

## 5. Usage

1. Load this skill, then hand your assistant four things: the symptom in one sentence, a ref you believe is good, a ref you know is bad, and how you currently observe the bug (a failing test, a curl, a screenshot).
2. Ask for the reproduction script *first*, before any bisect commands: "Write `scripts/repro.mjs` that exits 1 when the checkout total is off by a cent for a taxed line item, 0 otherwise, with no network calls." Run it at both endpoints yourself and confirm the exit codes.
3. Then ask for `bisect-check.sh`. Reject any version that doesn't return `125` on install or build failure, or that pipes the reproduction's output anywhere other than the exit code.
4. If the predicate flakes, say so explicitly — "this reproduces about one run in eight" — and ask for the amplified loop form from §3.5 with a run count derived from that rate.
5. On a merge-commit or squash-merge repo, ask for `--first-parent` by default. Drop it only after you have a guilty PR and want to narrow inside it.
6. When you get the answer, ask for the revert-and-verify command before you ask for an explanation of the diff. Confirm causation, then read.

## 6. Example Output

Prompt with this skill loaded: *"Since roughly the 4.2 release, invoice PDFs for EU customers render the VAT line as 0.00. `v4.2.0` is fine, `main` is broken. We reproduce by generating a PDF and grepping the text layer. ~600 commits, we squash-merge PRs."*

```sh
# 0. Prove the endpoints. Never skip this.
git switch --detach v4.2.0 && npm ci --silent && node scripts/repro-vat.mjs; echo "good=$?"   # → good=0
git switch --detach main   && npm ci --silent && node scripts/repro-vat.mjs; echo "bad=$?"    # → bad=1
```

```js
// scripts/repro-vat.mjs — exit 1 iff the VAT line is present but zero.
// Deterministic: fixed fixture, fixed date, no network, no filesystem beyond a temp write.
import { generateInvoicePdf } from '../src/invoices/render.js'
import { extractText } from '../src/invoices/text-layer.js'

const FIXTURE = {
  customer: { country: 'DE', vatId: 'DE123456789' },
  lines: [{ sku: 'SEAT-PRO', qty: 2, unitCents: 4500 }],
  issuedAt: new Date('2026-03-01T00:00:00Z'),   // pinned: VAT rates are date-derived
}

const text = extractText(await generateInvoicePdf(FIXTURE))
const vat = text.match(/VAT\s+\(19%\)\s+([\d.,]+)/)

if (!vat) { console.error('repro harness broken: no VAT line at all'); process.exit(2) }  // → 125
const isBug = Number(vat[1].replace(',', '')) === 0
console.error(`VAT rendered as ${vat[1]} — ${isBug ? 'BUG' : 'ok'}`)
process.exit(isBug ? 1 : 0)
```

```sh
#!/bin/sh
# /tmp/check-vat.sh — lives OUTSIDE the tree so every checkout can see it.
set -u
npm ci --silent --no-audit --no-fund || exit 125   # old lockfile in this range: untestable
npm run build --silent                || exit 125   # build breakage is not our bug
node scripts/repro-vat.mjs
case $? in 0) exit 0 ;; 1) exit 1 ;; *) exit 125 ;; esac
```

```sh
# 1. Flake check — 20 runs, all identical, so the predicate is monotone. Safe to search.
for i in $(seq 1 20); do node scripts/repro-vat.mjs >/dev/null 2>&1; printf '%s' "$?"; done
# 11111111111111111111

# 2. Squash-merge repo → search the mainline only. ~600 commits, ~10 steps, each one a whole PR.
cp scripts/bisect-check.sh /tmp/check-vat.sh
git bisect start --first-parent
git bisect bad main
git bisect good v4.2.0
git bisect run sh /tmp/check-vat.sh

# 3. Preserve the transcript BEFORE resetting.
git bisect log > /tmp/bisect-vat.log
git bisect reset

# 4. Confirm causation. The answer is a lead until a revert proves it.
git show --stat 9f3c1ad
git revert --no-commit 9f3c1ad && npm run build --silent && node scripts/repro-vat.mjs; echo "after revert=$?"
git revert --abort
```

Markers of skill-compliant output: both endpoints are verified with real exit codes before a single bisect step runs; the reproduction pins the clock because VAT rates are date-derived, and returns `2` (not `1`) when the harness itself can't find a VAT line, so the wrapper maps it to `125` instead of falsely marking the commit bad; install and build failures are `125`; the check script is copied to `/tmp` so old checkouts can still find it; the flake rate is measured rather than assumed; `--first-parent` matches the squash-merge workflow so each step is one reviewable PR; the transcript is saved before `reset`; and the run ends with revert-and-verify rather than with a diff to read.
