---
title: Documentation That Answers the Question Skill
category: Other
description: Stop writing docs nobody finishes — split them into tutorials, how-to guides, reference, and explanation, and each one suddenly becomes easy to write and easy to find. Covers the Diátaxis split, the tests that tell you which quadrant a page belongs in, and how to rescue a README that has quietly become all four at once.
usage: Load this skill before writing or restructuring documentation. Give your assistant the page you have (or the thing you need to document) and it will identify which quadrant each paragraph belongs to, split the mixed ones, and rewrite each part in the mode that quadrant demands.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 18
pocUrl: https://diataxis.fr
---

# Documentation That Answers the Question Skill

## 1. Philosophy

Most bad documentation isn't badly written. It's four documents wearing one trench coat — a tutorial that keeps stopping to explain architecture, a reference that occasionally becomes a lecture, a how-to guide that starts by teaching you concepts. Every paragraph is fine. The page is unusable, because the reader's needs change and the page doesn't.

1. **A reader is doing exactly one of two things: acquiring skill or acquiring information.** And they're either at work or at study. That's a 2x2, and it produces four kinds of document that have almost nothing in common: **tutorial** (study + skill), **how-to** (work + skill), **reference** (work + information), **explanation** (study + information). The insight isn't the grid — it's that a page trying to serve two cells serves neither.
2. **The reader's need decides the form, not the author's convenience.** It's easier to write everything you know about a feature in one place. It's easier to *read* four pages that each answer one question.
3. **You cannot learn while you're solving a problem.** At 3am with prod down, an explanation of the caching model is an obstacle. During onboarding, that explanation is the whole point. Same words, opposite value, because the reader changed.
4. **The tutorial's job is confidence, not coverage.** A beginner needs to succeed at something, quickly, and feel that this thing is learnable. Every choice you offer them, every caveat you insert, every "you could also," is a chance to fail. Take the choices away.
5. **Documentation is a system that gets tended, not a project that gets finished.** Nobody ever documents an entire product in one push. The workable rhythm is: notice a page doing two jobs, split it, improve one half, ship. Compounding beats heroics.
6. **The four types are a diagnostic, not a filing cabinet.** Their value shows up when you're staring at a paragraph asking "why is this so hard to write?" — the answer is almost always that it's two types fighting, and the fix is scissors.

## 2. Tech Stack

- **Diátaxis** — https://diataxis.fr — the documentation framework by Daniele Procida, published free. This skill is a practitioner's application of it: the four-quadrant split is Diátaxis's idea, the templates, tests, and worked rewrites below are mine. Read the original — it's short, and it's the clearest thing written about docs.
- **Markdown in the product repo.** Docs live next to the code, in the same PR as the change. A wiki is a place where documentation goes to become false.
- **A static site generator** — Docusaurus (https://github.com/facebook/docusaurus, **MIT**), MkDocs (https://github.com/mkdocs/mkdocs, **BSD-2-Clause**), or Astro Starlight (https://github.com/withastro/starlight, **MIT**). Any of them. The generator is the least important decision here and teams spend the most time on it.
- **Vale** — https://github.com/errata-ai/vale — **MIT**. Prose linter. Useful for enforcing the *voice* rules per quadrant (§3.7) — imperative in how-tos, no "simply" anywhere.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Diátaxis maintainers. All templates, examples, and rewrites are original to this skill.

## 3. Patterns

### 3.1 The grid, and the test that places a page

```
                    │  SKILL (how to act)   │  INFORMATION (what is)
  ──────────────────┼───────────────────────┼──────────────────────────
   STUDY            │      TUTORIAL         │      EXPLANATION
   (learning)       │  "teach me from zero" │  "help me understand why"
  ──────────────────┼───────────────────────┼──────────────────────────
   WORK             │      HOW-TO GUIDE     │      REFERENCE
   (doing)          │  "I have a goal now"  │  "what are the arguments"
```

You rarely need the grid to place a page. You need one question: **what did the reader type into the search box?**

| They searched | They want | Quadrant |
|---|---|---|
| "getting started with X" | to not feel stupid | Tutorial |
| "how to rotate an X key" | to finish a task and leave | How-to |
| "X config options" | one fact, fast | Reference |
| "why does X use Y" | to stop being confused | Explanation |

And the tell that a page is broken: **it changes tense or mood mid-scroll.** "We'll start by creating a project" (tutorial) … "You can configure the timeout via `--timeout`" (reference) … "The reason for this design is …" (explanation). Three quadrants, one page, and the reader — whoever they are — is skimming past two-thirds of it.

### 3.2 Tutorial: the beginner's page

A tutorial is a lesson. The reader has no goal of their own yet; you give them one, and you are responsible for their success at it. That responsibility drives every rule.

```md
# Publish your first skill

By the end of this tutorial you'll have a published skill on the marketplace and
you'll have seen the whole flow — writing, proof of concept, pricing. It takes
about 15 minutes.

You don't need to know anything about the API. We'll use the web interface.

## What you'll need
- A Skill Exchange account (free — sign up at the link above if you don't have one)
- Any project of yours with a public URL. It doesn't have to be impressive.

## Step 1 — Create the skill file

Create a file called `hello-skill.md` and paste this in exactly:

    ---
    title: My First Skill
    ---
    # My First Skill
    Always greet the user by name before answering.

Don't worry about what the fields mean yet — we'll come back to that.

## Step 2 — Start the publish flow

Click **Publish** in the top bar. You'll see a three-step form. Click **Details**.

Type `My First Skill` in the title field.

Choose `Other` from the category dropdown.

You should now see the Continue button turn blue. If it hasn't, check that both
fields have content — those two are the only required ones on this step.

## Step 3 — Add your proof of concept
...

## What you did

You published a real skill. Along the way you saw the three-step flow, and you saw
that every skill needs a proof of concept — that's the rule that keeps the
marketplace honest.

## Next

- **Want to actually sell something?** → How to price and publish a paid skill
- **Curious why proof of concept is mandatory?** → Why we enforce proof of concept
```

The rules, and each one costs something real when broken:

- **You provide the goal.** "Publish your first skill" — not "learn about the publish flow." A goal has an ending; a topic doesn't.
- **It must work.** Every time, on a clean machine, for someone who types exactly what you wrote. A tutorial that fails at step 4 doesn't teach a step; it teaches that this product is broken and its docs lie. Test them in CI if you can.
- **No choices.** Not "you can use npm or pnpm." Pick one. Every branch is a place to take a wrong turn, and a beginner cannot tell which turn was wrong.
- **No explanation.** "Don't worry about what the fields mean yet" is a complete and correct sentence in a tutorial. The urge to explain is the single strongest force destroying tutorials, and it comes from a good place: you know why it works and you want to share. Don't. Link it at the bottom.
- **Signposts.** "You should now see the Continue button turn blue." This is how a lost reader finds out they're lost at step 2 instead of step 9. Beginners cannot self-diagnose; give them checkpoints.
- **Minimum viable everything.** The tutorial is not the place for best practices, error handling, or your opinions about naming. It's the place for a first success.

### 3.3 How-to: the competent person's page

The reader has a goal, has context, and wants to leave. Respect that they know things.

```md
# How to rotate a compromised API key

Rotate immediately if a key has appeared in a public repo, a log, or a shared
screenshot. This takes about two minutes and does not interrupt live requests.

## Before you start
- You need the `owner` role on the workspace.
- Have your deploy pipeline open — you'll need to update the secret within the
  overlap window.

## Steps

1. Create the replacement first:

       curl -X POST https://api.example.com/v2/keys \
         -H "Authorization: Bearer $ADMIN_TOKEN" \
         -d '{"name": "prod-rotated-2026-03"}'

   Creating before revoking gives you an overlap window. Both keys work during it.

2. Update the secret in your deploy pipeline and roll the service.

3. Confirm the new key is serving traffic:

       curl https://api.example.com/v2/keys/usage?since=5m

   The new key's `requestCount` should be non-zero before you continue.

4. Revoke the old key:

       curl -X DELETE https://api.example.com/v2/keys/key_8Kd2Lm

   Revocation is immediate and irreversible. Any process still using the old key
   gets a 401 on its next request.

## If requests start failing after revocation
Something you forgot was using that key — usually a cron job or a staging
environment pointed at prod. Check the 401 source IPs in the audit log:
`GET /v2/audit?event=auth_failed&since=10m`.

## Related
- Key permissions and scopes (reference)
- How to rotate keys on a schedule
```

- **Title starts with "How to."** Literally. It matches what they searched, and it makes the page's job undeniable to whoever edits it next.
- **The title names a real-world goal, not a feature.** "How to rotate a compromised API key" — not "Using the keys endpoint." Nobody's goal is to use your endpoint.
- **Assume competence.** They know what curl is. Don't teach it.
- **Address the mess.** Tutorials live in a clean world; how-tos live in the real one. Step 1's overlap window and the "if requests start failing" section are the entire value of this page over the reference.
- **No completeness.** This page covers rotation. Not every key operation. A how-to that grows toward covering everything is turning into reference; split it.

### 3.4 Reference: the map

Reference is austere on purpose. The reader is mid-task, scanning, and every sentence of your prose is an obstacle between them and the fact.

```md
## `POST /v2/keys`

Creates an API key. The plaintext key is returned **once**, in this response only.

### Request body

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes | — | 1–64 chars. Shown in the audit log. |
| `scopes` | string[] | no | `["read"]` | See Scopes. Unknown scope → 400. |
| `expiresAt` | string \| null | no | `null` | RFC 3339. `null` = no expiry. Past → 400. |

### Responses

| Status | Meaning |
|---|---|
| `201` | Created. Body includes `key` (plaintext, once). |
| `400` | Validation failed. See `errors[].pointer`. |
| `403` | Caller lacks the `owner` role. |
| `409` | A key with this `name` already exists in the workspace. |

### Notes
- Keys are hashed at rest. A lost key cannot be recovered — only replaced.
- Rate limit: 10 creations per workspace per hour.
```

- **Structure is uniform and boring.** Every endpoint looks identical, so a reader learns the shape once and then scans forever. Creativity in reference layout is a cost paid by every reader.
- **Describe, never instruct.** "Keys are hashed at rest" — not "you should store your key somewhere safe." The moment reference starts advising, it's a how-to, and it's now competing with the actual how-to for search results.
- **Generate what you can.** Reference is the one quadrant that should come from the source of truth — your OpenAPI spec, your type definitions. Hand-written reference drifts, silently, and a wrong reference is worse than no reference because it's trusted.
- **Facts, not context.** The reader will decide what it means. Your job is that the fact is correct and findable.

### 3.5 Explanation: the one everyone skips

Explanation is the quadrant that gets cut for time, and its absence is why your Slack has the same architecture question every six weeks.

```md
# Why proof of concept is mandatory

Every skill on the marketplace must ship with a project URL and a screenshot
showing the skill in real use. There's no way to publish without it, and this
surprises people, so it's worth explaining.

## The problem it solves

A marketplace for instruction files has a verification problem that a marketplace
for, say, photographs does not. A photograph is its own evidence. A skill file is
a claim: "this will teach an AI to do X well." You cannot evaluate that claim by
reading it — well-written prose about a workflow and an actually-effective
workflow look identical on the page.

Without a forcing function, the equilibrium is obvious: skills are cheap to
generate and impossible to assess, so volume floods in, buyers can't tell what
works, and they stop trusting the ratings. The marketplace dies of noise, not
of malice.

## Why this particular rule

Requiring a real URL and a screenshot isn't a quality bar — plenty of real
projects are unimpressive. It's a *cost* bar. To publish, you must have actually
used the skill on something real. That's not hard for someone who did the work,
and it's disproportionately annoying for someone generating skills in bulk.

We chose asymmetric cost over quality review because quality review doesn't
scale to one founder, and automated quality scoring of prose is a research
problem, not a feature.

## What we gave up

Real friction for legitimate sellers. Someone with a genuinely useful skill built
for a private client codebase can't easily prove it, and we lose that listing.
We think that's the right trade at this size — trust is harder to rebuild than
supply — but it's a real cost, not a free win.

## Alternatives we considered

- **Manual review of every skill.** Doesn't scale past one person.
- **Reputation-only.** Cold-start problem: no reputation at launch, which is
  exactly when the flood would arrive.
- **Paid listing fee.** Filters by wealth rather than by effort, and takes money
  from people whose skill we then reject.
```

- **It's the only quadrant allowed to be discursive.** Digressions, history, opinions, alternatives — all fine here, and only here.
- **"What we gave up" is the section that earns trust.** Documentation that only lists benefits reads like marketing, and engineers discount it accordingly.
- **Read it away from the code.** If it only makes sense with the repo open, it's reference wearing an explanation's clothes.
- **Title with "why" or "about."** It sets the reader's expectation that they will not get a command to run.

### 3.6 Rescuing the README that became all four

Almost every real project has this page. It grew one PR at a time, each addition sensible, and it's now 900 lines that nobody reads past the install command.

The procedure — and this is the workhorse of the whole skill:

1. **Print it. Highlight each paragraph in one of four colors.** You'll find the colors are shuffled: install (tutorial-ish), a config table (reference), a paragraph about the architecture (explanation), deploy steps (how-to), back to a config option. That shuffle is the whole disease and now you can see it.
2. **Cut along the color lines.** Don't rewrite yet. Just move each paragraph to `tutorials/`, `how-to/`, `reference/`, `explanation/`.
3. **Notice what's missing.** Nearly always: there are no tutorials and no explanation at all. Almost every organically-grown doc set is 90% reference and how-to, because those get written when someone asks a question. Nobody asks "please explain the design to me" — they just quietly stay confused, or ask in Slack, which is why the same question arrives every six weeks.
4. **Now rewrite each piece in its own mode.** This is when they get easy to write. A paragraph that was hard to write for an hour usually becomes two clear paragraphs in two different files in five minutes, because it was two paragraphs the whole time.
5. **Leave a short README behind.** What this is, one install command, and four links. That's the correct README.

You will resist step 2, because the paragraphs "belong together" — they were written together, they're about the same feature. They belong together for the *author*. They belong apart for the reader, who is only ever one of the four people.

### 3.7 Voice, per quadrant

The mood shift is how a reader knows, subconsciously, what kind of page they're on. Getting it wrong is why a page feels off even when every fact is right.

| | Tutorial | How-to | Reference | Explanation |
|---|---|---|---|---|
| Mood | "we'll" | "do this" | "it is" | "the reason is" |
| Person | first plural | second, imperative | impersonal | first plural |
| Tense | present | present | present | any — history is fine |
| Explains? | **no** | briefly, only where it changes the action | no | that's the job |
| Complete? | no — minimum viable | no — this goal only | **yes** — exhaustive | no |
| Choices? | **never** | yes, that's the point | lists all | discusses trade-offs |
| Can it fail? | never — it must work | assumes competence | n/a | n/a |

The single word to ban everywhere: **"simply."** "Simply run the migration" — if the reader's migration fails, you've told them their problem is simple and they aren't. It adds nothing to any sentence it appears in. Lint it out with Vale and never think about it again. Close behind: "just," "obviously," "of course."

## 4. Anti-patterns

- **The README that is all four documents.** The default state of every project older than a year. §3.6 is the fix and it takes an afternoon.
- **Explaining inside a tutorial.** The strongest and most well-intentioned failure. You know why it works, you want to share, and the beginner drowns. "We'll come back to that" plus a link at the bottom.
- **A tutorial with choices.** "You can use npm or pnpm." The beginner picks wrong, hits an error you never saw, and concludes the product is broken. Pick one.
- **A tutorial that doesn't work.** Not a documentation bug — a trust bug. It's the first page anyone reads, and if it fails at step 4 you've taught them your docs lie.
- **Reference that advises.** "You should keep this secret safe." Now it's a how-to, and it competes with the real how-to in search.
- **How-to guides drifting toward completeness.** A how-to that documents every flag is becoming reference. Split it before it finishes.
- **No explanation quadrant at all.** The most common structural gap, and the reason the same architecture question shows up in Slack every six weeks. Nobody files a ticket for "I don't understand why."
- **How-to titles that name a feature, not a goal.** "Using the keys endpoint" — nobody wants that. "How to rotate a compromised API key" — someone wants that right now, urgently.
- **Hand-written API reference.** It drifts, quietly, and a confidently wrong reference costs more than a missing one. Generate it.
- **Documentation in a wiki, away from the code.** Nothing forces it to change when the code does. It becomes an archaeological record of a system that no longer exists.
- **"Simply," "just," "obviously."** Zero information, and each one tells a struggling reader the problem is them.
- **The big documentation rewrite.** Scheduled, scoped, abandoned at 40% in week three. Split one page, ship it, do it again next week.
- **Screenshots of text.** Unsearchable, unlocalizable, unreadable on a phone, wrong after the next UI change. Paste the text.

## 5. Usage

1. Load this skill and paste the page you have — usually a README or a "getting started" that's become a swamp. Ask first: "which quadrant is each paragraph, and where does it change modes?" Don't ask for a rewrite yet. The diagnosis is most of the value.
2. Ask it to do §3.6 steps 1–3: classify, split into four files, and — importantly — **name what's missing**. Expect it to find you have no tutorial and no explanation. Almost everyone doesn't.
3. Rewrite one quadrant at a time, and state the mode constraints when you ask: "rewrite this as a tutorial — no choices, no explanation, checkpoints after each step, and it must work on a clean machine."
4. Reject a tutorial with a "you can also" or an "under the hood" in it. Reject a how-to whose title doesn't start with "How to" and name a real goal. Reject reference that gives advice. These three rejections do most of the enforcement.
5. Ask for the explanation page explicitly and by name — assistants and humans both skip it, because nobody has ever filed a ticket asking to be un-confused. Prompt it: "why does this design exist, what did we give up, and what did we reject?"
6. For reference, don't ask for prose at all. Ask it to generate from the OpenAPI spec, the type definitions, or the config schema, and to flag any fact it couldn't source — those are the ones that have already drifted.

## 6. Example Output

Prompt with this skill loaded: *"Our README's 'Getting Started' section. Fix it."*

**What we had:**

> ## Getting Started
> Install the CLI with `npm i -g @acme/cli` (or `pnpm add -g`, or grab the binary from
> releases). Then run `acme init`. This creates an `acme.config.js` — the config is
> resolved by walking up from cwd, which is why monorepos work without extra setup.
> You can pass `--config` to override. The available options are `outDir` (string,
> defaults to `dist`), `minify` (boolean, default true in production), and `target`
> (string, default `es2020`). We chose a JS config over JSON because build config
> almost always needs conditionals eventually, and a JSON config with an
> escape hatch is worse than a JS one. Now run `acme build` and you should see your
> output in `dist/`. If you get a permission error, you probably installed globally
> without a Node version manager — see troubleshooting.

**Diagnosis:** four quadrants, 130 words, mode changes at "which is why" (explanation), "The available options" (reference), "We chose a JS config" (explanation again), "Now run" (back to tutorial), "If you get a permission error" (how-to). Every sentence is correct. The page serves nobody: the beginner hits a three-way install choice in sentence one and a design rationale in sentence three; the person who wants `outDir`'s default has to read a paragraph about monorepo resolution to find it.

**Split into four:**

```md
<!-- tutorials/build-your-first-project.md -->
# Build your first project

In 10 minutes you'll build a project and see the output. You don't need any
prior config knowledge.

## Step 1 — Install the CLI

    npm i -g @acme/cli

## Step 2 — Create a project

    acme init

You'll see a new `acme.config.js` in your folder. Open it — it should have three
lines. Don't change anything yet.

## Step 3 — Build

    acme build

You should see `Built 1 entry in 240ms` and a new `dist/` folder. Open
`dist/index.js` to confirm it's there.

That's the whole loop: init, build, output in `dist/`.

## Next
- **Working in a monorepo?** → How to configure a monorepo build
- **Want to know why the config is a .js file?** → About the config format
```

```md
<!-- how-to/configure-a-monorepo-build.md -->
# How to configure a monorepo build

Config resolves by walking up from the working directory, so a package inherits
the nearest `acme.config.js` above it. In most monorepos this means one root
config and nothing per-package.

## Override for one package
Put an `acme.config.js` in the package root. It fully replaces the parent — it
does not merge. This is the part that surprises people.

## Override for one command

    acme build --config ./configs/ci.config.js

## If the wrong config is being picked up
    acme build --print-config
Prints the resolved path and the final values before building.
```

```md
<!-- reference/config-options.md -->
# `acme.config.js`

| Option | Type | Default | Description |
|---|---|---|---|
| `outDir` | string | `dist` | Output directory, relative to the config file. |
| `minify` | boolean | `true` in production, `false` otherwise | Minify output. |
| `target` | string | `es2020` | ECMAScript target. |

Resolution: nearest `acme.config.js` walking up from cwd. `--config` overrides.
Configs do not merge; the resolved file is used in full.
```

```md
<!-- explanation/about-the-config-format.md -->
# About the config format

The config is a JavaScript file, not JSON or YAML. This is a deliberate choice
and it has real costs, so here's the reasoning.

Build configuration reaches for conditionals almost immediately — different
targets per environment, a plugin only in CI. Every declarative config format
we've seen eventually grows an escape hatch: a template language, an `$env`
directive, a string that's secretly evaluated. At that point you have a
programming language with terrible ergonomics and no debugger.

## What we gave up
A JS config can't be statically analyzed or safely edited by a tool. Our own
`acme init` has to do text manipulation rather than parse-and-serialize, and
that's genuinely worse. Editors can't autocomplete against a schema without the
types. And a config file that can execute code is a supply-chain surface a JSON
file isn't.

## Alternatives we rejected
- **JSON + `$env` interpolation** — the escape hatch arrives in month three and
  it's a worse language than JS.
- **TOML** — same conditional problem, plus a format most of our users don't write.
```

**And what's left of the README:** three lines — what this is, `npm i -g @acme/cli`, and four links.

Markers of skill-compliant output: the three-way install choice is gone from the tutorial (npm, picked, no discussion) because a beginner cannot recover from choosing wrong; the tutorial has a checkpoint (`Built 1 entry in 240ms`) so a lost reader knows at step 3 instead of step 9; both explanation fragments were pulled *out* of the tutorial and linked from the bottom, where a curious reader can find them and a hurried one can't trip on them; the config table is now scannable in two seconds instead of embedded mid-paragraph; the how-to's title names a goal ("configure a monorepo build") rather than a feature, and it carries the surprising real-world fact — configs don't merge — that the reference states flatly and the tutorial doesn't mention at all; the explanation has a "what we gave up" section naming a supply-chain surface, which is the part that makes it trustworthy rather than promotional; and the split surfaced that the original had no tutorial and no explanation *as such* — both existed only as fragments trapped inside a page that was mostly reference.
