---
title: Git-Native Secrets with SOPS Skill
category: DevOps
description: Keep encrypted secrets in the same git repo as the code they configure, with diffs that still review cleanly and keys that rotate when people leave. Covers .sops.yaml creation rules, age versus cloud KMS, CI decryption via OIDC, key rotation, and the plaintext-commit drill.
usage: Load this skill before asking your AI assistant to set up secrets handling, write a .sops.yaml, or wire decryption into CI. Say "use the SOPS secrets skill" and describe your environments and team size; the assistant will produce creation rules, a key backend choice with reasoning, and a CI job that never stores a long-lived decryption key.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 12
pocUrl: https://github.com/getsops/sops
---

# Git-Native Secrets with SOPS Skill

## 1. Philosophy

Every team starts with secrets in a gitignored `.env`, then discovers that gitignored files have no history, no review, no access control, and no answer to "what did staging's config look like in March?" So they paste them into Slack, and now the secrets are in Slack forever.

SOPS proposes something that sounds wrong until it clicks: **put the secrets in git, encrypted, and let git do what git is good at.**

Three rules govern everything below:

1. **Encrypt values, not files.** The structure stays plaintext — keys, nesting, ordering. Only values are ciphertext. That is the whole trick: a PR that changes `DATABASE_URL` shows *that* it changed without showing what it changed to. A GPG-encrypted tarball is a wall of base64 and is unreviewable.
2. **The key is the secret; the repo is just storage.** Once encryption is sound, the ciphertext being public is boring. All of your paranoia belongs on who can decrypt.
3. **Access is revoked by re-encrypting, not by deleting.** Removing someone's key from `.sops.yaml` does nothing to the checkout on their laptop or to git history. You re-encrypt, and then you **rotate the underlying secret values**, because they already read them.

If you are building tooling to sync secrets from a manager into a `.env` at deploy time, ask what that buys over a file in the repo that only the deploy role can decrypt.

## 2. Tech Stack

- **SOPS** — https://github.com/getsops/sops — licensed **MPL-2.0**. A **CNCF-hosted project** (donated by Mozilla, now maintained under the CNCF umbrella), which matters for a stack that cares about governance continuity as much as licence text. It encrypts values inside YAML, JSON, ENV, and INI, and falls back to whole-file binary encryption for anything else.
- **age** — the recommended backend for solo developers and small teams. One keypair, no keyserver, no web of trust.
- **Cloud KMS** (AWS KMS, GCP KMS, Azure Key Vault) — the backend once you need IAM and an audit trail.

**On Vault:** HashiCorp Vault is deliberately avoided in this stack because it moved to the non-permissive **BUSL licence in 2023**. That is a licence decision, not a technical dismissal — Vault solves dynamic secrets and leasing, which SOPS does not attempt. But for static configuration secrets, which is most of what teams actually need, SOPS under MPL-2.0 covers the ground without a licence that constrains commercial use.

This skill is an independent, original guide; it is not affiliated with or endorsed by the SOPS maintainers. All example configuration and code are original to this skill.

## 3. Patterns

### 3.1 The encrypted-values model, and why diffs survive

```yaml
# secrets/production.yaml — committed to git, safe to read in a PR
database:
    url: ENC[AES256_GCM,data:Yk9wZ0xhc3Rzb21lY2lwaGVy...,iv:8f2c...,tag:1a9b...,type:str]
    pool_size: 20                    # unencrypted: not a secret (see 3.8)
stripe:
    secret_key: ENC[AES256_GCM,data:c2tfbGl2ZV9ub3RyZWFsbHk...,iv:3d7e...,tag:44af...,type:str]
sops:
    age:
        - recipient: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
          enc: |
            -----BEGIN AGE ENCRYPTED FILE-----
    lastmodified: "2026-03-14T09:22:41Z"
    mac: ENC[AES256_GCM,data:0Nn...,type:str]
```

A reviewer sees: someone rotated the Stripe key, left the database URL alone, bumped the pool size. That review is possible. It is not possible with an opaque blob, and not possible at all with a secret that lives in Slack.

Under the hood: SOPS generates a random **data key** per file, encrypts each value with it, then encrypts that data key once per recipient. Adding a fifth teammate re-wraps the data key five times; it does not re-encrypt your values. This is why `updatekeys` (3.4) is fast — and why it is *not* a rotation of the secrets themselves. The `sops` block is the file's header; never hand-edit it.

### 3.2 `.sops.yaml`: creation rules per path and environment

This file is the policy. It lives at the repo root, is committed, and is why nobody has to remember an `--age` flag.

```yaml
# .sops.yaml
creation_rules:
  # FIRST match wins. Most specific paths go on top.

  # Production: the deploy KMS key and two humans. No contractors.
  - path_regex: secrets/production/.*\.ya?ml$
    kms: arn:aws:kms:ap-south-1:111122223333:alias/sops-production
    age: >-
      age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p,
      age1lggyhqrw2nlhcxprm67z43rta597azn8gh6t2z9x9wjhx3lqqmsskn2m9r
    encrypted_regex: "^(.*_key|.*_secret|.*password.*|.*token.*|url)$"

  # Staging: whole team, age only. Losing staging is annoying, not fatal.
  - path_regex: secrets/staging/.*\.ya?ml$
    age: >-
      age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p,
      age1x4hu9dmzrpj4vh6qkkfsg63kufk8xkjrqq7wzh3f8vg2hf3f5wnq4hxdvc

  # k8s Secrets: only the data values. Encrypting metadata.name makes the
  # manifest unreadable to kubectl and to humans.
  - path_regex: k8s/.*/secret\.ya?ml$
    encrypted_regex: "^(data|stringData)$"
    age: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
```

Two things earn their keep. **`encrypted_regex`**: without it SOPS encrypts every value including `pool_size: 20`, which destroys exactly the diff readability that made you pick SOPS. **First-match-wins ordering**: a broad `secrets/.*` rule above the production rule silently gives everyone production. Put narrow rules first and re-read top-down when you add one.

Then everything is just `sops secrets/production/app.yaml` — opens `$EDITOR` decrypted, re-encrypts on save. No flags. The policy is in the repo, reviewed like code.

### 3.3 age vs KMS: pick on team size and audit needs

**age — solo and small teams.**

```bash
age-keygen -o ~/.config/sops/age/keys.txt
# Public key (the recipient) goes in .sops.yaml. The private key stays in that
# file, mode 0600, backed up in YOUR password manager. Never in git.
export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt
```

Zero infrastructure, zero cost, works offline. The trade: **no audit trail** — you cannot answer "who decrypted production last Tuesday" — and revocation is entirely manual.

**Cloud KMS — when you need IAM and an audit trail.** Decryption becomes an IAM decision: the CI role gets `kms:Decrypt` on one key alias, a departing employee loses access the moment their IAM user is disabled, and CloudTrail has every `Decrypt` call with caller identity.

The honest rule: **age for staging and anything a solo developer owns. KMS for production the moment more than one person or one CI system needs it.** They coexist — a file can list a KMS ARN *and* age recipients, and any one can decrypt. That combination is also your break-glass: KMS for the machines, one age key in a safe for the day the AWS account is locked out.

### 3.4 Rotation and `updatekeys` when someone leaves

Two operations people constantly conflate:

```bash
# 1. Change WHO can decrypt. Edit .sops.yaml first, then:
sops updatekeys secrets/production/app.yaml
# Re-wraps the data key for the new recipient list. The VALUES are untouched.
# Their old checkout still decrypts. Nothing was revoked retroactively.

# 2. Change the data key itself.
sops rotate --in-place secrets/production/app.yaml
# New data key, values re-encrypted under it. But git history still holds the
# old ciphertext, and their old key still opens THAT.
```

Neither rotates your Stripe key. **Only Stripe rotates your Stripe key.** The offboarding drill, in order:

```bash
# 1. Remove their age recipient / IAM principal from .sops.yaml
# 2. Re-wrap every file for the remaining recipients
find secrets k8s -name '*.yaml' -exec sops updatekeys --yes {} \;
# 3. Rotate data keys so future edits don't reuse a key they saw
find secrets -name '*.yaml' -exec sops rotate --in-place {} \;
# 4. THE STEP THAT MATTERS: rotate the underlying credentials at each provider,
#    for everything they could decrypt. They read the plaintext. Git history is
#    immutable. Assume compromise.
```

Steps 1–3 take four minutes. Step 4 takes an afternoon and is the only one that changes an attacker's capabilities. Do not let a green `updatekeys` convince you that you are done.

### 3.5 `sops exec-env` for local runs

Never write a decrypted file to disk to run the app locally. It ends up in a backup, an editor swap file, or a commit.

```bash
# Decrypt into the process environment. Nothing touches the filesystem, and the
# plaintext dies with the process.
sops exec-env secrets/staging/app.env 'npm run dev'
sops exec-env secrets/staging/app.env 'psql "$DATABASE_URL" -c "select count(*) from users"'

# For tools that insist on a file path: writes a temp file, deletes it on exit.
sops exec-file secrets/staging/config.yaml 'myapp --config {}'
```

`exec-env` expects `KEY=value` shape. Keep a `.env`-format file per environment for local runs and YAML for structured config; SOPS handles both.

### 3.6 CI decryption via OIDC, never a long-lived key

The tempting shortcut is pasting the age private key into a GitHub Actions secret. Now the key that opens *every environment* lives where anyone with write access to a workflow file can exfiltrate it in one line of YAML — and it is long-lived, so it stays valid the day you forget it exists.

Use OIDC. The runner proves its identity, assumes a role scoped to one KMS key, and gets credentials that expire in an hour.

```yaml
# .github/workflows/deploy.yml
permissions:
  id-token: write        # required to mint the OIDC token
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          # No access key, no secret key anywhere in this repo.
          role-to-assume: arn:aws:iam::111122223333:role/ci-sops-decrypt
          aws-region: ap-south-1
      - name: Render config and deploy
        run: sops exec-env secrets/production/app.env './scripts/deploy.sh'
```

The trust policy makes it safe, and the `sub` condition is the load-bearing line:

```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": "repo:acme/api:ref:refs/heads/main"
    }
  }
}
```

Without that `sub` scoped to a specific repo **and ref**, any GitHub Actions workflow on the internet can assume your role. A `StringLike` wildcard on `repo:acme/*` is nearly as bad — a fork or PR branch becomes production. Pin the ref.

### 3.7 MAC failures and what they mean

```
Failed to decrypt: MAC mismatch. File has "a3f1...", computed "9c2e..."
```

The MAC covers all encrypted values plus metadata. A mismatch means the file changed in a way SOPS did not perform. In order of likelihood:

1. **Someone hand-edited the ciphertext** — "fixing a typo" inside an `ENC[...]` string, or a YAML linter reordering keys. This is 90% of cases.
2. **A bad merge.** Two branches touched the same encrypted file; git merged the ciphertext line-by-line into valid YAML that is cryptographic nonsense. Prevent it:

```gitattributes
secrets/**/*.yaml diff=sopsdiffer merge=binary
```

3. **Actual tampering.** Rare, but this is precisely what the MAC exists to catch. If it is not (1) or (2), treat it as an incident.

The fix for (1) and (2) is always: `git checkout` the last good version and redo the edit through `sops <file>`. Never `--ignore-mac` — that flag is for forensic recovery, not for making CI green.

### 3.8 What NOT to encrypt

Encrypting everything is the reflex, and it is wrong. It costs readability and buys nothing.

- **Do not encrypt** hostnames, ports, regions, log levels, feature flags, timeouts, pool sizes, public URLs, bucket names, IAM role ARNs, or k8s `metadata.name`. A PR turning `log_level: debug` into `ENC[AES256_GCM,...]` is unreviewable for zero gain.
- **Do encrypt** API keys, database URLs with embedded passwords, private keys, webhook signing secrets, JWT signing keys, OAuth client secrets.
- **Do not put in the repo at all**, encrypted or otherwise: production customer data, PII dumps, anything with a legal deletion requirement. Git history is append-only. "Delete on request" and "committed to git" are incompatible.

That is what `encrypted_regex` is for. Set it once per rule and stop thinking about it.

### 3.9 The day someone commits a plaintext .env

It will happen — a new hire, a `git add -A`, a `.gitignore` covering `.env` but not `.env.production.local`.

```bash
# 0. START THE CLOCK. From the moment it hit a remote, every value is public.
#    On a public repo, scrapers polling the GitHub events firehose have it in
#    under a minute. That is not hyperbole.

# 1. ROTATE FIRST. Before cleaning history, before the postmortem, before Slack.
#    Every key in that file, at the provider, revoking the old one.
#    Stripe -> roll the key. AWS -> deactivate then delete. DB -> ALTER USER.

# 2. Now clean history. Rewrites every commit SHA — coordinate with the team.
git filter-repo --path .env.production.local --invert-paths
git push --force --all
#    Forks, existing clones, and dangling-commit caches may still serve the blob.
#    Cleaning history is hygiene, NOT remediation. Step 1 is remediation.
```

Then prevent the recurrence with four lines of shell:

```bash
#!/usr/bin/env bash
# scripts/check-sops-encrypted.sh — original; blocks any staged secrets/ file with no sops block.
set -euo pipefail
fail=0
for f in "$@"; do
  if ! grep -q '"sops"\|^sops:' "$f" 2>/dev/null; then
    echo "BLOCKED: $f under secrets/ is not SOPS-encrypted. Run: sops -e -i $f" >&2
    fail=1
  fi
done
exit "$fail"
```

Wire it as a pre-commit hook on `^secrets/.*\.(ya?ml|env|json)$`. It is the only reason this happens once instead of quarterly. It is client-side and therefore bypassable with `--no-verify`, so pair it with server-side secret scanning on the default branch.

## 4. Anti-patterns

- **A long-lived age or GPG private key in a CI secret.** Anyone who can edit a workflow file can print it. Use OIDC and short-lived scoped credentials (3.6).
- **`updatekeys` treated as revocation.** Re-wrapping the data key does nothing about the plaintext on the leaver's laptop or in git history. Rotate at the provider or you have revoked nothing.
- **A broad `path_regex` above a narrow one.** First match wins. A `secrets/.*` rule at the top silently hands production to every recipient on it.
- **Encrypting the whole file.** Ciphertext-only diffs cannot be reviewed, forfeiting the biggest reason to use SOPS. Set `encrypted_regex`.
- **`--ignore-mac` to get past a decrypt error.** You are choosing to trust a file whose integrity check failed. Restore from git and redo the edit.
- **Merging encrypted files without `merge=binary`.** Git line-merges two ciphertexts into valid YAML that decrypts to nothing, and you find out at deploy time on a Friday.
- **Decrypting to a `.env` on disk for local dev.** It survives the process, lands in backups and swap files, and eventually gets committed. Use `sops exec-env`.
- **Cleaning git history and calling the leak handled.** Forks and caches still have the blob; scrapers had it in seconds. Rotation is remediation. Rotate first, always.
- **An OIDC trust policy without `sub` pinned to repo *and* ref.** A wildcard `repo:acme/*` means any PR branch — including from a fork — can assume the production decrypt role.
- **Committing `keys.txt` "just for the team."** That file is the private key. Recipients go in `.sops.yaml`; private keys go in each person's password manager and nowhere else.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe team and environments: "Two developers plus GitHub Actions. Staging and production. Production on AWS in ap-south-1; audit trail needed for production only."
3. Ask for, in order: (a) `.sops.yaml` with per-path rules and an explicit backend choice per environment, (b) the `encrypted_regex` per rule with a justification of what stays plaintext, (c) the CI job using OIDC plus the IAM trust policy, (d) the pre-commit hook.
4. Make the assistant state, for each rule, exactly who and what can decrypt it. If that list is longer than it needs to be, the rule is wrong.
5. Run the offboarding drill (3.4) and the leak drill (3.9) as tabletop exercises *before* you need them. Both have a step people skip under pressure, and it is the same step: rotate the real credential.

The assistant should refuse to put a long-lived private key in CI, always set `encrypted_regex` rather than encrypting whole files, and distinguish `updatekeys` from actual credential rotation whenever offboarding comes up.

## 6. Example Output

Prompt given with this skill loaded: *"Set up secrets for our Django app. Three devs, staging and production on AWS, deployed from GitHub Actions. Devs need staging locally; nobody needs production locally except me."*

Expected shape of the answer:

```yaml
# .sops.yaml — narrow rules first; first match wins.
creation_rules:
  # Production: KMS for IAM + CloudTrail. One age key as break-glass, in a safe.
  # Devs are NOT recipients here — they cannot decrypt production, by design.
  - path_regex: secrets/production/.*\.(ya?ml|env)$
    kms: arn:aws:kms:ap-south-1:111122223333:alias/sops-production
    age: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
    encrypted_regex: "^(SECRET_KEY|DATABASE_URL|.*_API_KEY|.*_TOKEN|.*_PASSWORD)$"

  # Staging: all three devs, age only. No KMS call on a laptop, works offline.
  - path_regex: secrets/staging/.*\.(ya?ml|env)$
    age: >-
      age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p,
      age1lggyhqrw2nlhcxprm67z43rta597azn8gh6t2z9x9wjhx3lqqmsskn2m9r,
      age1x4hu9dmzrpj4vh6qkkfsg63kufk8xkjrqq7wzh3f8vg2hf3f5wnq4hxdvc
    encrypted_regex: "^(SECRET_KEY|DATABASE_URL|.*_API_KEY|.*_TOKEN|.*_PASSWORD)$"
```

```bash
# secrets/staging/app.env after `sops -e -i` — DEBUG and ALLOWED_HOSTS stay readable
DEBUG=True
ALLOWED_HOSTS=staging.example.com
SECRET_KEY=ENC[AES256_GCM,data:9dK2mQ...,iv:c81f...,tag:5b0a...,type:str]
DATABASE_URL=ENC[AES256_GCM,data:pR7xLm...,iv:2e93...,tag:aa41...,type:str]
STRIPE_API_KEY=ENC[AES256_GCM,data:vT4nWs...,iv:7fd0...,tag:31c8...,type:str]
```

```bash
# Local dev — nothing decrypted to disk, ever.
sops exec-env secrets/staging/app.env 'python manage.py runserver'
```

```yaml
# .github/workflows/deploy.yml
permissions:
  id-token: write
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production          # gate on a required reviewer
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::111122223333:role/ci-sops-decrypt
          aws-region: ap-south-1
      - run: sops exec-env secrets/production/app.env './scripts/deploy.sh'
```

Note what the output does *not* contain: no `SOPS_AGE_KEY` in a GitHub secret, no `encrypted_regex` omitted in favour of encrypting `DEBUG=True`, no dev age keys on the production rule "so they can debug prod," and no `.env` written to the working directory — because the only copies of production plaintext should be inside a process that is currently running.
