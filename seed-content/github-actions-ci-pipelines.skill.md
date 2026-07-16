---
title: CI Pipelines that Stay Green with GitHub Actions Skill
category: DevOps
description: Build GitHub Actions pipelines that are fast, cheap, and trustworthy instead of a 14-minute tax on every push. Covers cache keys that actually hit, concurrency groups, matrix strategy, OIDC instead of long-lived cloud keys, SHA-pinned actions, and the `pull_request_target` footgun that leaks your secrets.
usage: Load this skill before asking your AI assistant to write or fix a GitHub Actions workflow. Say "use the CI pipelines skill" and describe your stack and what needs to run; the assistant will produce workflows with lockfile-hashed cache keys, least-privilege job permissions, SHA-pinned third-party actions, and a concurrency group — not a copy of the quickstart.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 0
timeSavedHours: 18
pocUrl: https://github.com/actions/runner
---

# CI Pipelines that Stay Green with GitHub Actions Skill

## 1. Philosophy

A CI pipeline has one job: tell you the truth about your commit, fast enough that you wait for it. Everything that erodes either half — a flaky test, a 14-minute run, a cache that never hits — teaches engineers to merge on red and rerun until green. Once that habit forms you no longer have CI. You have a slow, expensive random number generator that occasionally blocks a deploy.

**Every second of CI is paid for twice.** Once in money — minutes billed per run, per push, per developer, forever — and once in attention, because a developer waiting on a pipeline has context-switched and will come back cold. A 4-minute regression on a repo doing 60 runs a day is 4 hours of machine time daily and a dozen broken flows. Nobody files a ticket for it. It just becomes the cost of working there.

1. **Do the work once.** Build once, test the artifact you built. If your build job and your test job both compile, you pay twice for the same bytes and test something other than what you ship.
2. **Least privilege, no standing credentials.** A workflow's default token permissions are the blast radius of every third-party action it invokes. Declare permissions per job; get cloud credentials from OIDC so there is no long-lived key to leak.
3. **Prove your cache hits.** Nobody notices a cache that misses. The job still passes. It just takes 4 minutes longer, every run, until someone reads the logs — which is roughly never, because green means nobody looks.

## 2. Tech Stack

- **The GitHub Actions runner** — https://github.com/actions/runner — licensed **MIT**. The agent that executes every job below.

An honest note on what is and is not open source here, because it changes your portability calculus: the hosted GitHub Actions service itself — scheduler, hosted runner fleet, UI, billing — is a proprietary product. What is open source is the **runner** (MIT) and the first-party actions used below (`actions/checkout`, `actions/cache`, `actions/upload-artifact`, `actions/setup-node`), all MIT. Self-hosting the runner is what makes this portable: the same workflow YAML and the same runner binary execute on your own hardware, which is your escape hatch if hosted minutes stop making financial sense. Design so the only proprietary dependency is the scheduler and you keep that option.

This skill is an independent, original guide; it is not affiliated with or endorsed by the GitHub Actions runner maintainers. All example code is original to this skill.

Assumed companions: a committed lockfile (the cache keys below need one) and `actionlint` in a pre-commit hook, so bad YAML fails locally rather than 40 seconds into a run.

## 3. Patterns

### 3.1 Cache keys: the one with `github.sha` never hits

The most common expensive bug in CI, and it is invisible because the job stays green.

```yaml
# BROKEN. Read the key.
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ github.sha }}
```

`github.sha` is unique per commit. A cache is restored by **exact key match** (or a `restore-keys` prefix). No future commit will ever have this commit's SHA, so this cache is written once and read never. It also *writes* an entry every run, steadily filling your 10GB repo allowance with entries nobody will read — which evicts, LRU, the caches that *would* have hit. It is worse than having no cache.

The cost is mundane: on a mid-size Node repo a warm `npm ci` is ~**18 seconds**; cold is ~**4m10s**. That is ~4 minutes per run. At 60 runs a day you burn about **4 hours of billed runner time daily** to accomplish nothing.

Key on the thing that determines the contents — the lockfile, not the commit:

```yaml
- uses: actions/cache@v4
  id: npm-cache
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node20-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node20-npm-
```

- `hashFiles(...)` changes only when dependencies change, so two commits touching `src/` share a key and hit.
- `restore-keys` is the partial-credit path: on a lockfile change the exact key misses but yesterday's cache restores, so npm fetches only the delta. Without it, one dependency bump costs a full cold install.
- `runner.os` and `node20` belong in the key — a Linux/Node 20 cache is not valid for macOS/Node 22, and reusing it gives you corruption presenting as an inscrutable native-module error.

**Verify it hits.** Do not assume:

```yaml
- if: steps.npm-cache.outputs.cache-hit != 'true'
  run: echo "::warning::npm cache MISS on ${{ hashFiles('**/package-lock.json') }}"
```

Push twice and read the second run's logs. `cache-hit: true` or it is not working. Note `setup-node`'s built-in `cache: npm` gets this right for free — use it unless you need more.

### 3.2 Concurrency groups: stop paying for commits nobody will merge

Default behavior: push three commits to a PR in five minutes, get three full runs. The first two test code that no longer exists. You pay for all three and the queue is three deep for everyone else.

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Per-workflow, per-ref: a new push kills the superseded run. On a busy repo this is commonly a **30-40% cut in minutes** for a two-line change — the highest-leverage thing in this file.

The one place it is wrong is deploys:

```yaml
concurrency:
  group: deploy-production      # no github.ref: one prod deploy at a time, full stop
  cancel-in-progress: false     # queue; cancelling mid-flight leaves you half-deployed
```

### 3.3 Matrix builds and fail-fast

```yaml
strategy:
  fail-fast: false
  matrix:
    node: [20, 22]
    os: [ubuntu-latest, windows-latest]
    include:
      - { node: 22, os: ubuntu-latest, coverage: true }   # upload coverage from one cell
    exclude:
      - { node: 20, os: windows-latest }                  # unsupported; don't pay for it
runs-on: ${{ matrix.os }}
```

The `fail-fast` decision goes both ways. **`true`** (default) kills every sibling the instant one cell fails — correct on a big matrix where any failure blocks the merge anyway. **`false`** lets every cell finish — correct when you need the full picture: "fails on Windows/Node 20 only" is a diagnosis; "something failed" is a rerun.

My rule: `fail-fast: false` on PRs (the developer wants the whole map in one shot), `true` on main (you already know it is broken; stop spending). Watch the multiplication — 3 Node versions × 3 OSes × 2 suites is 18 jobs per push, and Windows and macOS bill at a multiple of Linux. Most matrices should be one dimension.

### 3.4 Job permissions and OIDC: no long-lived cloud keys

Two problems, one solution. First, `GITHUB_TOKEN` exists in every job and its default permissions apply to every action you invoke — including the transitive dependencies of that action you added last month.

```yaml
permissions: {}      # workflow default: nothing

jobs:
  test:
    permissions:
      contents: read          # checkout, and nothing else
```

Second, cloud credentials. The old way is a key pair in repo secrets: long-lived, valid from anywhere on the internet, never rotated because rotating means coordinating with whatever else uses it, and readable by every workflow in the repo. Every leaked-key incident I have watched has that shape. OIDC mints a short-lived token per job instead:

```yaml
  deploy:
    permissions:
      id-token: write    # required to mint the OIDC token
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502 # v4.0.2
        with:
          role-to-assume: arn:aws:iam::123456789012:role/gha-deploy-prod
          aws-region: ap-south-1
      - run: aws s3 sync ./dist s3://acme-prod-assets --delete
```

No secret in that workflow. Trust lives in the IAM role, whose policy pins the subject to a specific repo, branch, and environment — so a fork, or another branch, cannot assume it. Nothing to leak, nothing to rotate, expires in minutes.

### 3.5 Pin third-party actions to a commit SHA

`uses: some-vendor/deploy-action@v2` resolves a **tag**, and tags are mutable. Whoever controls that repo can repoint `v2` at any commit, at any time, and your next run executes it with whatever secrets and token permissions that job has. Tag-repointing is a live supply-chain technique against CI, not a thought experiment.

```yaml
- uses: some-vendor/deploy-action@v2     # mutable; can move under you
- uses: some-vendor/deploy-action@8f4b7c2e9a1d3f6b0c5e8a2d7f1b4c9e6a3d0f8b # v2.3.1
```

- **Third-party: always SHA-pinned**, version in a trailing comment. Dependabot updates both, so this costs a PR review, not vigilance.
- **First-party `actions/*`: tags acceptable.** Different trust boundary. SHA-pin these too if you are regulated.
- **Audit before adding.** An action is arbitrary code with access to your job's secrets. `curl | bash` you would never merge; `uses:` somehow feels different. It is not.
- Set the org policy to allow only vetted actions. Free, one-time, kills the category.

### 3.6 `pull_request_target` is a credential-leak footgun

You wanted fork PR CI, hit the wall that `pull_request` gives forks a read-only token and no secrets, searched, and found this. It fixes the symptom by removing the safety.

```yaml
# CATASTROPHIC. Do not ship this.
on: pull_request_target
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}   # <-- attacker's code
      - run: npm ci && npm test                            # <-- with write token + secrets
```

`pull_request_target` runs in the context of the **base** repo, with a read-write `GITHUB_TOKEN` and full access to repo secrets. That is by design — it is how a bot labels a fork PR. But the checkout above pulls the **fork's** code into that privileged context and runs it. Any stranger opens a PR whose `package.json` has a `postinstall` script, and `npm ci` executes it with your production secrets in the environment. They never need the PR merged. They never need it reviewed.

- **Never check out untrusted code in a `pull_request_target` workflow.** If you do, you have granted push access to anyone who can open a PR.
- Use it **only** for jobs that touch no PR code: labelling, commenting, API-side size checks.
- For fork CI use plain `on: pull_request` — read-only token, no secrets, because it runs a stranger's code.
- If a fork PR genuinely needs a secret (a deploy preview), split it: `pull_request` builds an artifact with no credentials; a separate `workflow_run` job downloads and deploys it. The privileged job never executes fork code.

### 3.7 Artifacts vs caches

Both "store files between jobs," and that is where it ends.

| | Cache | Artifact |
|---|---|---|
| Purpose | Speed up a rebuild | Hand a **result** to a job or a human |
| Correctness | Reconstructible; a miss is only slow | Must exist; a miss breaks the pipeline |
| Keyed by | Content hash | Name |
| Lifetime | Evicted, ~7 days idle, 10GB cap | Retention you set, downloadable in the UI |

**Cache inputs, upload outputs.** `~/.npm` and `~/.cargo` are caches. Built `dist/`, coverage, a test video — artifacts.

```yaml
  build:
    steps:
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist/, retention-days: 5 }  # 90-day default is billed storage
  test:
    needs: build
    steps:
      - uses: actions/download-artifact@v4
        with: { name: dist }
      - run: npm run test:e2e      # tests the exact bytes that will ship
```

Never cache a build output and hope it is there. Never upload `node_modules` as an artifact — a 400MB round trip to replace an 18-second cache restore.

### 3.8 Path filters

```yaml
on:
  pull_request:
    paths: ['src/**', 'package-lock.json', '.github/workflows/ci.yml']
    paths-ignore: ['**/*.md', 'docs/**']
```

The trap: if a workflow is a **required status check** and a path filter skips it, the PR waits forever for a check that will never report. Fix with a companion workflow using the inverse filter and the same job names that exits 0 immediately. In monorepos, filter at the job level with a change-detection step and gate downstream jobs on its output — a docs PR should not build four services.

### 3.9 Flaky-test quarantine, on a clock

A flaky test is worse than a failing one. A failing test gets fixed. A flaky test teaches the team that red means "click rerun," and that lesson generalizes to real failures.

1. **Detect.** Fails, then passes on rerun with no code change. Log it; don't let it be folklore.
2. **Quarantine same-day** into a non-blocking job. It still runs and reports; it does not block merges.
3. **File an issue with an owner and a two-week expiry.**
4. **Delete at expiry.** If nobody fixed it in two weeks it was not protecting anything anyone valued. A deleted test is honest about your coverage; a test "temporarily" skipped for eight months is a lie in your test count.

```yaml
  tests-quarantine:
    continue-on-error: true      # reports, never blocks
    steps:
      - run: npm run test -- --grep @flaky
```

Step 4 is the non-negotiable. Without an expiry, quarantine is a landfill.

### 3.10 Minutes and cost control

Where the money goes, roughly in order:

- **Superseded runs.** §3.2. Usually the biggest line item; two lines of YAML.
- **Cold caches.** §3.1. Silent, permanent, ~4 minutes a run.
- **Runner OS multiplier.** Windows and macOS bill at a multiple of Linux, macOS worst by a wide margin. Every non-Linux matrix cell costs several times what it looks like. Bulk on Linux; macOS only where required, only on main.
- **Redundant work.** Build in job A, build again in job B. Build once, artifact it.
- **Artifact retention.** 90 days × every run × a 200MB bundle is billed storage doing nothing.
- **Scheduled workflows nobody reads.** A nightly job reporting into a channel muted since March is a subscription you forgot to cancel. Audit `on: schedule` quarterly.
- **Timeouts.** The default is 6 hours; a hung job bills all of it. `timeout-minutes: 15` on every job.

## 4. Anti-patterns

- **`github.sha` in a cache key.** Unique per commit: written once, read never, while evicting the caches that would have hit. Hash the lockfile.
- **No concurrency group.** Full price to test three commits nobody will merge. Two lines, typically 30-40% of your minutes back.
- **`pull_request_target` + a PR-head checkout.** Any stranger's `postinstall` runs with your write token and production secrets. No merge, no review, no defense.
- **Third-party actions on a mutable tag.** `@v2` is a pointer someone else can repoint at any commit, any time. SHA-pin with the version in a comment.
- **Default `GITHUB_TOKEN` permissions.** Every action inherits them. `permissions: {}` at the workflow, grant per job.
- **Long-lived cloud keys in repo secrets.** Valid forever, from anywhere, never rotated, readable by every workflow. Use OIDC, pin the trust policy to repo + branch.
- **Building twice.** You pay twice and test something other than what you shipped. Build once, upload, download.
- **`node_modules` as an artifact.** A 400MB round trip replacing an 18-second cache restore.
- **Living with flakes.** "Just rerun it" is a team habit that generalizes to real failures. Quarantine same-day with a two-week expiry, then delete.
- **No `timeout-minutes`.** The default is 6 hours. A hung job bills every minute.
- **A required check behind a path filter.** The PR waits forever for a check that will never report.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / a Cursor rule).
2. Say "use the CI pipelines skill" and describe: language and package manager, what runs on a PR vs main, where you deploy, whether fork PRs must work.
3. Ask for, in order: (a) the PR workflow with concurrency, lockfile-hashed cache, least-privilege permissions, (b) the deploy workflow with OIDC and a queueing concurrency group, (c) the matrix, justified cell by cell.
4. Before merging any workflow: read every cache key aloud and confirm nothing commit-unique is in it; confirm every third-party `uses:` is a 40-character SHA; confirm no `pull_request_target` checks out PR code.
5. After merging, push twice and read the second run's logs for `cache-hit: true`. An unverified cache is a cache that does not work.

The assistant should refuse to put `github.sha` in a cache key, refuse to combine `pull_request_target` with a PR-head checkout, and default to OIDC over stored cloud keys without being asked.

## 6. Example Output

Prompt given with this skill loaded: *"Node 20 monorepo. On PRs: lint, typecheck, test. On main: build and deploy to S3. Fork PRs must work."*

Expected shape of the answer:

```yaml
name: CI
on:
  pull_request:
    paths: ['src/**', 'package-lock.json', '.github/workflows/ci.yml']
  push:
    branches: [main]

permissions: {}

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    strategy:
      fail-fast: ${{ github.ref == 'refs/heads/main' }}
      matrix:
        task: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm          # lockfile-hashed key, maintained upstream
      - run: npm ci
      - run: npm run ${{ matrix.task }}

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: verify
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: production
    concurrency:
      group: deploy-production
      cancel-in-progress: false      # queue deploys; never cancel mid-flight
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci && npm run build
      - uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502 # v4.0.2
        with:
          role-to-assume: arn:aws:iam::123456789012:role/gha-deploy-prod
          aws-region: ap-south-1
      - run: aws s3 sync ./dist s3://acme-prod-assets --delete
```

Note what the output does *not* contain: no `pull_request_target` (fork PRs run on plain `pull_request` with a read-only token and no secrets — which is exactly why they are safe), no `AWS_SECRET_ACCESS_KEY` in repo secrets, no `github.sha` in any cache key, no unpinned third-party action, no job without a timeout, and no concurrency group that would cancel a deploy halfway through an S3 sync.
