---
title: Infrastructure as Code with OpenTofu Skill
category: DevOps
description: Run real infrastructure as code with OpenTofu without the 3am state-lock panic or the plan that silently destroys your database. Covers remote state and locking, plan/apply discipline in CI, module interfaces, for_each vs count, moved blocks, drift, and provider pinning.
usage: Load this skill before asking your AI assistant to write, refactor, or review any OpenTofu configuration. Say "use the OpenTofu IaC skill" and describe the infrastructure you want; the assistant will produce HCL that pins providers, uses for_each, guards stateful resources, and never hands you a `state mv` where a `moved` block belongs.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 8
timeSavedHours: 30
pocUrl: https://github.com/opentofu/opentofu
---

# Infrastructure as Code with OpenTofu Skill

## 1. Philosophy

The dangerous thing about IaC is that it looks like programming. It is not. Refactor application code wrong and a test goes red. Refactor infrastructure code wrong and a production database goes away, and you find out from a customer.

**State is a target, not a log.** It is not a history of what you did — it is OpenTofu's belief about what exists and which config block owns it. Every incident I have been paged for reduces to state and reality disagreeing about that mapping: a resource renamed in code, a thing deleted by hand in the console, an apply that died halfway.

1. **The plan you review is the plan you apply.** Not "a plan re-run at apply time on the same commit." The literal binary artifact. Anything else means the diff you approved is not the diff that ran.
2. **Identity is forever.** A resource's address in state *is* its identity. Change the address and you have told OpenTofu to destroy one thing and create another. `for_each` keys and `moved` blocks exist entirely to protect identity across refactors.
3. **Stateful resources get a seatbelt.** `prevent_destroy` on anything holding data. It annoys you twice a year and saves you once.

## 2. Tech Stack

- **OpenTofu** — https://github.com/opentofu/opentofu — licensed **MPL-2.0**. The engine used in every example below.

Why this skill targets OpenTofu specifically: OpenTofu is the community fork of Terraform, created after Terraform moved to the non-permissive BUSL licence at v1.6. This skill targets OpenTofu precisely because it stays open source under MPL-2.0. HCL is compatible, so the patterns transfer — the code here is the code you would write either way. The reason to pick OpenTofu is licensing and governance, not syntax.

This skill is an independent, original guide; it is not affiliated with or endorsed by the OpenTofu maintainers. All example code is original to this skill.

Assumed companions: any backend with native locking, a CI runner that can hold an artifact between two jobs, and `tofu fmt` + `tofu validate` in a pre-commit hook.

## 3. Patterns

### 3.1 Remote state, locked, from the first commit

Local state is a single-developer illusion that ends the day a second person runs apply.

```hcl
terraform {
  required_version = ">= 1.6.0"
  backend "s3" {
    bucket         = "acme-tofu-state"
    key            = "prod/network/terraform.tfstate"   # environment + component
    dynamodb_table = "acme-tofu-locks"
    encrypt        = true
  }
}
```

**Versioning on the state bucket, always.** Corruption is recoverable in 90 seconds if you can restore the previous object version, and is a resume-generating event if you cannot. Encryption is not optional: state holds every attribute of every resource, including ones you would never print.

### 3.2 The stuck lock at 3am

A CI runner gets killed mid-apply, or a laptop lid closes on a 12-minute RDS change. The lock row outlives the process that owned it, the next apply hangs, and `Error acquiring the state lock` names an ID, a `Who`, and a `Created`. The instinct is to force-unlock immediately. Don't:

1. **Prove the holder is dead.** Find the run or human named in `Who`. If that apply is still going, force-unlocking gives you two concurrent applies against one state file — that is how you get duplicate resources and corrupted state.
2. **Assume mid-flight damage.** An apply killed at minute 6 of 12 may have created resources it never recorded; the next plan will try to create them again.
3. **Only then, with the exact ID:** `tofu force-unlock 8f2a1c6e-4b3d-4e77-9a10-2c5b1f0d9e33`
4. **Plan and read every line. Do not apply.** Look for creates of things you suspect exist. Reconcile orphans with `import` blocks, not by deleting them in the console.

The ID requirement is a safety interlock. Treat it as one.

### 3.3 Plan/apply discipline in CI: the artifact is the contract

Most pipelines plan on the PR, then re-plan at apply on merge. In between, someone merged, a provider shipped a patch, an AMI lookup changed. You approved diff A and applied diff B. Save the plan; apply the plan.

```yaml
  plan:
    steps:
      - run: tofu plan -input=false -lock-timeout=5m -out=tfplan
      - run: tofu show -no-color tfplan > plan.txt      # human-readable for the PR
      - uses: actions/upload-artifact@v4
        with: { name: tfplan, path: tfplan }
  apply:
    needs: plan
    environment: production                             # manual approval gate
    steps:
      - uses: actions/download-artifact@v4
        with: { name: tfplan }
      - run: tofu apply -input=false -lock-timeout=5m tfplan   # the file IS the approval
```

`tofu apply tfplan` takes no `-auto-approve` and asks nothing — approval happened when a human read `plan.txt`. A **plan artifact is a secret**: it holds resolved attribute values, so short retention and never raw in a public PR comment. A stale plan refusing to apply is a *feature*.

### 3.4 Modules with narrow interfaces

A module is an API. The test: could a teammate use it correctly from the variable names alone?

```hcl
variable "environment" {
  description = "Deployment environment. Drives sizing and deletion protection."
  type        = string
  validation {
    condition     = contains(["qa", "prod"], var.environment)
    error_message = "environment must be one of: qa, prod."
  }
}
```

- **Twenty flat variables is not a module** — it is a function call with extra syntax. Take a small typed object, or split it.
- **No provider blocks inside modules.** The root configures; modules inherit. A module configuring its own provider cannot be instantiated twice.
- **Outputs are the public surface.** Ids and ARNs, never the whole resource object — that promises every attribute forever.
- **Pin module sources by tag**: `?ref=v1.4.0`, never `?ref=main`.

### 3.5 `for_each` over `count` — not a style preference

The most expensive lesson here. `count` addresses instances by **integer index**: `b[0]`, `[1]`, `[2]`. Remove the middle element and everything after shifts down — and because the address *is* the identity, OpenTofu reads that shift as destroy-and-recreate.

```hcl
variable "buckets" { default = ["logs", "assets", "backups"] }

resource "aws_s3_bucket" "b" {                       # BROKEN
  count  = length(var.buckets)
  bucket = "acme-${var.buckets[count.index]}"
}
```

Delete `"assets"`. You wanted one destroy. The plan destroys **two** and recreates **one**: `b[1]` becomes `acme-backups` (replace), `b[2]` disappears. Your backups bucket gets recreated. On S3 that is a bad afternoon; on RDS it is an outage. With `for_each = toset(var.buckets)` and `bucket = "acme-${each.key}"`, the same deletion produces exactly one destroy — `b["assets"]` — because `b["backups"]`'s identity was never positional.

**The rule: `count` is for zero-or-one, `for_each` is for collections.** Key on something intrinsic and stable — never on another resource's attribute, or the key set is not computable before apply and you get "Invalid for_each argument."

### 3.6 `moved` blocks, not `state mv`

You renamed `aws_instance.web` to `.api`. To OpenTofu that is destroy + create. The reflex is `tofu state mv` — imperative, run once, from a laptop, recorded nowhere, invisible to review, and unavailable to the teammate whose apply now wants to destroy the instance. Put the refactor in the code:

```hcl
moved { from = aws_instance.web,   to = aws_instance.api }
moved { from = aws_s3_bucket.b[0], to = aws_s3_bucket.b["logs"] }    # count → for_each
moved { from = aws_s3_bucket.b[1], to = aws_s3_bucket.b["assets"] }
```

Declarative, in the diff, runs for everyone, works in CI. Plan it and you should see **"N moved, 0 to add, 0 to destroy."** A destroy there means your mapping is wrong — fix the block, do not apply. Same for adoption: an `import` block in code beats `tofu import` on a laptop. Keep `moved` blocks a release or two, then delete them; they are migrations, not fixtures.

### 3.7 Drift: detect on a schedule, fix in code

Drift is reality changing without the config changing — someone widened a security group during an incident and never came back. You find out months later when an unrelated apply proposes to close it. Run `tofu plan -detailed-exitcode` on a schedule (0 = no changes, 1 = error, 2 = drift) and alert on exit 2.

Two honest resolutions: **change the code to match reality** (the console change was right — codify it), or **apply to make reality match the code** (it was a mistake — revert it). There is no third option where you note it in a ticket. That is how nobody ends up trusting apply, which is how you get an org doing IaC in name only.

### 3.8 `prevent_destroy` on anything holding data

```hcl
resource "aws_db_instance" "primary" {
  identifier          = "acme-prod-primary"
  engine_version      = "16.3"
  storage_encrypted   = true
  deletion_protection = true                    # provider-side
  lifecycle {
    prevent_destroy = true                      # OpenTofu-side
    ignore_changes  = [engine_version]          # patched via managed upgrade windows
  }
}
```

Two layers, deliberately: `prevent_destroy` hard-fails the plan; `deletion_protection` stops the destroy even if someone bypasses OpenTofu entirely. Different failure modes, different people. It blocks *replacement* too — the point, because it catches the innocuous-looking attribute change that turns out to be `ForceNew`. When you genuinely need to replace the database you edit the lifecycle block in a PR a human reads: the dangerous thing requires a code change, not a keystroke. `ignore_changes` is a scalpel, not a mute button — every entry needs a comment naming who else owns that field.

### 3.9 Provider pinning and the lockfile

An unpinned provider means your infrastructure changes when a stranger publishes, on a Tuesday. `version = "~> 5.60"` permits patch and minor (5.60.x → 5.99.x) and refuses the major bump that rewrites half your resources. Commit `.terraform.lock.hcl` — it pins exact versions *and* checksums, the supply-chain half. Generate hashes for every platform in use (`tofu providers lock -platform=linux_amd64 -platform=darwin_arm64`) or the Mac laptop and the Linux runner will disagree. In CI, `init` should fail rather than silently upgrade; provider bumps are a PR with a plan attached.

### 3.10 Secrets: state reads everything

**Anything OpenTofu manages, it stores in state, in plaintext.** `sensitive = true` redacts a value from *console output*. It does nothing to the file. A `sensitive` password in state is a plaintext password in state.

- **Never `output` a secret.** Outputs are the most-read part of state and get consumed by other configs; `sensitive` hides them from the terminal, not from `tofu output -json`.
- **Treat the state bucket as a secrets store**, because it is one: encrypted, versioned, access-logged, readable by a short list of principals. Data sources land in state too.
- **Let the provider generate what it can.** `manage_master_user_password = true` on RDS keeps the password out of your config *and* your plan diffs.
- **Rotate outside OpenTofu.** In the apply path, every rotation becomes a plan someone must approve.

### 3.11 Workspaces vs separate state files: prefer separate

- **One backend, one bucket, one lock table.** Prod state shares a blast radius with QA, and credentials reaching one reach both.
- **`tofu workspace select` is invisible.** Nothing in the code says which workspace you are in. The number of people who have applied a QA change to prod because another tab was on the wrong workspace is not small. I have been one.
- **`terraform.workspace` ternaries metastasize.** Every resource carries an environment conditional and no file describes any single environment.
- **You cannot diverge.** Prod eventually needs a read replica QA does not. With separate state that is a file, not another conditional.

So: `envs/qa/` and `envs/prod/`, each with its own `backend.tf` key, both calling a shared `modules/service/`. `cd envs/prod` is a thing you can see in your scrollback — that is the whole argument. Workspaces are genuinely fine for a throwaway per-developer sandbox off one config.

## 4. Anti-patterns

- **`count` on a collection.** Index-addressed identity: remove the middle element and OpenTofu destroys and recreates everything after it. `for_each` with stable string keys.
- **`tofu state mv` on a laptop.** Imperative, unreviewed, unrepeatable, invisible to the teammate whose next apply proposes a destroy. Use a `moved` block.
- **`force-unlock` as a reflex.** Prove the holder is dead first. Two concurrent applies against one state file is strictly worse than a hung pipeline.
- **Re-planning at apply time.** The diff a human approved and the diff that ran are then two different diffs. Apply the saved artifact verbatim.
- **`-auto-approve` in a pipeline.** You have not automated approval, you have deleted it.
- **Unpinned providers, ignored lockfile.** Your infrastructure changes when a stranger publishes. Pin with `~>`, commit `.terraform.lock.hcl`.
- **Secrets in outputs.** `sensitive = true` hides a value from the terminal, not from state or `tofu output -json`. Nothing about it encrypts anything.
- **Workspaces for prod/qa.** Shared backend, invisible selection, ternaries in every resource. Separate state files, shared modules.
- **Ignoring drift because "the plan is noisy."** A plan nobody reads is a plan nobody trusts, and apply becomes the thing you do with your eyes closed.
- **No `prevent_destroy` on stateful resources.** Two annoyed minutes a year against one lost database. The asymmetry is not close.

## 5. Usage

1. Paste this skill into your AI assistant's context (or install it as a project skill in Claude Code / a Cursor rule).
2. Say "use the OpenTofu IaC skill" and describe the infrastructure plainly: what runs, what stores data, what environments exist, what must never be destroyed.
3. Ask for, in order: (a) the module with its variable interface and validations, (b) per-environment root configs with distinct backend keys, (c) the CI workflow handing a plan artifact to apply.
4. For any refactor — renames, `count` → `for_each`, moving resources between modules — demand `moved` blocks and a plan reading "N moved, 0 to destroy" before applying.
5. Run section 4 as a review checklist before every apply that touches prod.

The assistant should refuse to use `count` for a collection, refuse to put a secret in an output, and attach `prevent_destroy` to data-holding resources without being asked.

## 6. Example Output

Prompt given with this skill loaded: *"Three services (api, worker, scheduler) currently defined with `count` over a list. Move them to for_each and add a prod-only Postgres database."*

Expected shape of the answer:

```hcl
locals {
  services = {
    api       = { desired_count = 3 }
    worker    = { desired_count = 2 }
    scheduler = { desired_count = 1 }
  }
}

resource "aws_ecs_service" "svc" {
  for_each      = local.services
  name          = "acme-${var.environment}-${each.key}"
  desired_count = each.value.desired_count
}

# Migration: old list order was ["api", "worker", "scheduler"].
# Without these, the plan destroys and recreates all three.
moved { from = aws_ecs_service.svc[0], to = aws_ecs_service.svc["api"] }
moved { from = aws_ecs_service.svc[1], to = aws_ecs_service.svc["worker"] }
moved { from = aws_ecs_service.svc[2], to = aws_ecs_service.svc["scheduler"] }

resource "aws_db_instance" "primary" {
  count = var.environment == "prod" ? 1 : 0   # zero-or-one: count is correct here

  identifier                  = "acme-prod-primary"
  engine_version              = "16.3"
  storage_encrypted           = true
  deletion_protection         = true
  manage_master_user_password = true   # password never enters config, plan, or outputs
  final_snapshot_identifier   = "acme-prod-primary-final"

  lifecycle { prevent_destroy = true }
}
```

Expected plan before you touch anything: `Plan: 1 to add, 0 to change, 0 to destroy.` with `3 resources moved.`

Note what the output does *not* contain: no `count` over the service collection, no `tofu state mv` in a README for everyone to run by hand, no `output "db_password"`, no `-auto-approve`, and no workspace ternary deciding what environment you are in. The refactor is in the code, the seatbelt is on the database, and the password never leaves the secrets manager.
