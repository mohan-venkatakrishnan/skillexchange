---
title: Landing Page Copy for Developer Tools Skill
category: Marketing
description: Turn a developer tool into a landing page that a skeptical engineer reads to the bottom — a hero that names the job instead of the category, proof above the fold, and objection handling ordered the way doubt actually arrives. Kills the four pages every solo founder ships first: the adjective salad, the feature grid with no verbs, the page that never says what the thing is, and the one that asks for a demo call from someone who wanted a curl command.
usage: Load this skill, then paste your README, your changelog, or a two-paragraph description of what you built and who keeps asking for it. Ask for a full page pass or a single block ("rewrite the hero, three options, different angles each") and it will return copy with the claim, the proof, and the next action attached to every section. Give it real numbers if you have them; it will refuse to invent them and will mark every gap as [NEEDS: ...] instead.
platforms: [Claude, ChatGPT]
priceUsd: 0
timeSavedHours: 8
pocUrl: https://tapdot.org
---

# Landing Page Copy for Developer Tools Skill

## 1. Philosophy

A developer landing page has about eleven seconds to answer one question: *what is this and does it do the thing I'm currently annoyed by?* Everything below defends those eleven seconds.

1. **Name the job, not the category.** "Developer productivity platform" tells a reader nothing they can act on. "Turn a Postman collection into typed API clients" tells them whether to keep reading. The category is what you are at a conference; the job is what you are at 11pm on a Tuesday.
2. **The reader arrived mid-problem, not mid-funnel.** Nobody wakes up wanting your product. They wake up with a broken CI pipeline and a search box. Copy that opens with "In today's fast-moving world" is copy written for the founder's ego, not the searcher's tab.
3. **Proof beats adjectives, and code beats proof.** For an engineering audience, a fifteen-line snippet that visibly does the thing outperforms every testimonial you will ever collect. Show the input, show the output, and let them do the extrapolation.
4. **Every claim carries its receipt or gets deleted.** "Blazing fast" is noise. "1.8s cold start, measured on a 4-vCPU runner, benchmark in the repo" is a claim someone can attack — which is exactly why it lands.
5. **Write the objections down before the features.** The page is not an argument you win; it's a conversation where the reader gets the last word in their head. If you don't answer "what happens when I outgrow this," they'll answer it themselves, badly.
6. **One page, one action.** A hero with "Get started," "Book a demo," and "Read the docs" is three pages wearing a trenchcoat. Pick the action that matches how this specific product actually gets adopted.

## 2. Tech Stack

This is a craft skill — no libraries required. It assumes you can put text on a page somehow. The frameworks referenced below are named honestly:

- **The copy structures in section 3 are original to this skill.** They are not licensed frameworks; they are patterns distilled from writing and rewriting pages for small developer tools.
- **Measurement** — any analytics that can report scroll depth and section-level click-through. Plausible, PostHog, GA4, or a `?ref=` query param and a log grep. The skill cares that you measure section-level dropoff, not which tool does it.
- **Rendering** — irrelevant to this skill. Astro, Next.js, a single `index.html`. The words are portable.
- All example copy in this file is original, written for fictional products (`Relayd`, `Schemafold`, `Coldline`). No real company's marketing copy appears here.

## 3. Patterns

### 3.1 The hero, in four lines and no more

The hero is not a mood. It is four slots, and every one has a job:

1. **Headline** — the job, in the reader's words, under 10 words.
2. **Subhead** — the mechanism, one sentence, answering "how is that possible."
3. **Proof strip** — a number, a logo-free credential, or a snippet.
4. **Action** — one verb, matched to reality.

Before (a real pattern, written fresh here — this is the page every solo founder ships first):

> **Relayd — The modern platform for event-driven teams**
> Relayd empowers engineering organisations to build reliable, scalable, real-time experiences with a developer-first approach.
> [Get Started] [Book a Demo] [Learn More]

Diagnosis: "platform," "empowers," "developer-first" — three words that survive if you paste them onto any of four hundred other products. The subhead has no mechanism. Three CTAs means no CTA. Nothing here is falsifiable, which means nothing here is believable.

After:

> **Replay any webhook you failed to process**
> Relayd stores every inbound webhook for 30 days and gives you a `relayd replay --since=2h` that re-fires them at your endpoint, in order, with the original signatures intact.
> `npm i -g relayd` · 4,100 replays/day across 60 teams · no account needed for the first 500 events
> [Read the 3-minute quickstart]

The second version is attackable — someone can check whether signatures really survive, whether ordering really holds. That's the point. Falsifiable claims are the only kind engineers believe.

**The 10-word test:** if you delete your product name from the headline and it could belong to a competitor, the headline is describing a category. Rewrite until it can't be transplanted.

### 3.2 The mechanism paragraph — the block most pages skip

Between the hero and the features sits the block nobody writes: *how does this actually work?* Skipping it is why a page feels like a brochure.

Structure: **when X happens → we do Y → so you get Z.** Concrete nouns only.

> When your endpoint 500s, Relayd doesn't drop the event — it writes the raw body, headers, and signature to durable storage before your handler ever runs. The proxy sits in front of your route, so the capture happens even if your service is fully down. That means a Friday-night outage costs you a `replay` command on Monday, not an apology email to a customer asking why their invoice never synced.

Three sentences. A mechanism (proxy captures before the handler), a consequence (works during total outage), and a scene the reader has personally lived (the apology email). The scene is what makes it stick; the mechanism is what makes it credible.

### 3.3 Features as verbs with receipts

The feature grid is where pages go to die. Three columns, three nouns, three icons, zero information. Fix: every feature gets a **verb headline**, a **one-line consequence**, and a **receipt**.

Before:

> **Reliability** — Enterprise-grade reliability you can count on.

After:

> **Replays preserve signature headers**
> Your existing `verifyStripeSignature()` middleware passes on a replayed event with no code changes — we forward the original `Stripe-Signature` byte-for-byte rather than re-signing.
> `relayd replay evt_1QZx --dry-run` prints the exact bytes we'll send.

The receipt line is doing most of the work. It converts a promise into something the reader can run in 30 seconds. A feature without a receipt is an adjective with better formatting.

**Rule of three:** a page can carry three features above the fold-and-a-half. The fourth one costs you the third one's attention. Everything else goes in the docs, and the docs are a *different* marketing surface with different rules.

### 3.4 Order objections by when doubt arrives

Doubt arrives in a predictable sequence. Answer it in that sequence or you're answering questions the reader hasn't asked yet.

| Scroll position | The thought | What goes here |
|---|---|---|
| Hero | "What is this?" | Job + mechanism |
| ~25% | "Does it work on *my* stack?" | Concrete integration line: "Works with any HTTP endpoint. Node, Go, Rails, a Lambda URL — we don't care, we're a proxy." |
| ~45% | "What's the catch?" | Limits, plainly: "30-day retention. Not an event bus — we don't fan out, we replay." |
| ~65% | "Who else trusts this?" | Proof, or an honest substitute (see 3.5) |
| ~80% | "What does it cost, really?" | Price with the actual boundary, not "contact us" |
| ~90% | "How do I leave?" | Export/eject story |

That "how do I leave" row is the single most under-written block on developer landing pages, and answering it converts the exact reader you want — the one who's been burned. One honest sentence: *"Every stored event is downloadable as NDJSON with `relayd export`. If you delete your account, that endpoint stays live for 30 days."*

### 3.5 Proof when you have no logos

You have no customers. You cannot say "trusted by teams at" and list four companies. Here's what actually works instead, in descending order:

1. **A runnable artifact.** A public playground, a CodeSandbox, a `npx` one-liner that produces visible output in under 20 seconds.
2. **A number you own.** "Handled 61,000 events last month." Small numbers are fine — specific beats big. "61,000" reads as true; "millions of events" reads as a lie even when it isn't.
3. **The build in public receipt.** "Built this after a Stripe webhook outage cost us four days of invoice reconciliation — full postmortem here." The story of the itch is credible in a way that borrowed authority is not.
4. **The open repo.** If it's open source, the star count is fine to show above ~200. Below that, show the commit cadence instead, or nothing.

What does not work: stock photos of people at laptops, "as seen in" for a newsletter that mentioned you once, a testimonial from your co-founder's cousin with a first name and an initial. Engineers pattern-match fake social proof faster than any other audience on earth, and one fake signal poisons every real one on the page.

### 3.6 The CTA is a verb the reader can already picture

"Get Started" is not an action. It's a door with no label. Match the CTA to the actual first thing that happens:

| Product reality | Wrong CTA | Right CTA |
|---|---|---|
| It's an npm package | Get Started | `npm i relayd` (with a click-to-copy) |
| It's a hosted service, free tier | Sign Up Free | Start with 500 free events — no card |
| It's complex, genuinely needs a call | Get Started | See a 6-minute walkthrough (no call) |
| It's open source, self-host | Download | Deploy with one command |

And the sub-CTA line matters more than the button. Under the button, one sentence removing the last friction: *"No account for the first 500 events. We don't email you."* That second sentence — "we don't email you" — is the highest-converting six words available to a developer tool, and almost nobody writes it.

### 3.7 Length: the page is as long as the doubt

Short pages don't convert better. *Pages that resolve doubt* convert better, and sometimes that's 300 words and sometimes it's 1,400.

- **Cheap, obvious, self-serve** (a CLI, a free tool) → short. The page's job is to get out of the way of the install command.
- **Expensive, novel, or replacing something** → long. Every paragraph is a reason not to close the tab.

The failure mode isn't length, it's **padding** — sections that exist because a template had a slot. If a section doesn't answer a row from the 3.4 table, it's padding. Delete it and watch nothing happen.

## 4. Anti-patterns

- **The adjective hero.** "Powerful, simple, and flexible." Three words, zero information, and a reader who now knows you couldn't describe the product. If your headline survives a find-and-replace of your product name with a competitor's, it isn't your headline.
- **Feature grid with noun headlines.** "Reliability. Scalability. Security." A grid of nouns is a table of contents for a page you didn't write.
- **The mystery-meat hero.** A gorgeous gradient, a screenshot of a dashboard, and the word "Introducing." Two hundred visitors bounce because nobody told them what it is. Screenshot-first heroes work only when the screenshot is self-explanatory in one second — and yours isn't, because you've been staring at it for six months.
- **"Contact us for pricing" on a $30/mo product.** For a developer tool, this converts approximately nobody and signals "we'll price you based on your logo." If you have a number, print the number.
- **Three CTAs in the hero.** Every additional CTA divides attention and adds a decision. The reader resolves the decision by leaving.
- **Testimonials with no company, no role, no face.** "This changed everything! — Sarah K." reads as fabricated and retroactively discredits your real numbers.
- **Benchmarks without a methodology link.** "10x faster" with no repo, no hardware, no baseline is a claim your audience is professionally trained to distrust. Either publish the harness or drop the number.
- **The demo-call gate on a self-serve product.** Someone came to run a command. Asking for their calendar converts the 2% who were going to buy anyway and repels the 98% who would have installed it.
- **Copy written for the investor, on the page meant for the user.** "The platform layer for the AI-native enterprise" is a deck slide. It has wandered onto your landing page and it is scaring the engineers.
- **Never shipping a second version.** The first page is a hypothesis. If you haven't rewritten the hero after 500 visitors and a look at scroll depth, you're not marketing, you're decorating.

## 5. Usage

1. Load this skill, then give the assistant raw material, not a brief: your README, a support thread, the Slack message where you explained the product to a friend. The friend explanation is usually the best hero you'll ever write — it just needs finding.
2. State the reality constraints up front: "no customers yet," "it's an npm package," "free tier is 500 events," "self-serve only, I don't want calls." The skill picks CTA and proof strategy from these.
3. Ask for one block at a time with variants: *"Hero, three versions — one leading with the mechanism, one with the pain, one with the number."* Whole-page requests produce whole-page mush.
4. Reject anything containing: "empowers," "seamless," "revolutionary," "next-generation," "in today's world," or a benchmark you didn't supply. Ask for a re-derive against section 4 rather than a patch.
5. Every gap must come back as `[NEEDS: monthly event volume]` — not as a plausible-looking invented number. If the assistant produces a statistic you never gave it, treat the whole draft as contaminated and restart.
6. After it drafts, run the transplant test yourself: swap in a competitor's name. Anything that still reads fine is a section you have to rewrite.

## 6. Example Output

Prompt with this skill loaded: *"Landing page for Schemafold. It diffs two OpenAPI specs and tells you which changes are breaking for existing clients. Solo project, npm package, free CLI, paid GitHub Action at $9/mo. No customers yet, but it's caught 40-odd real breakages in my own two repos."*

---

**Hero**

> **Know which API change breaks your clients — before you merge**
> Schemafold diffs two OpenAPI specs and classifies every change as breaking, additive, or cosmetic, using the rules your consumers actually care about: removed fields, narrowed enums, newly-required params, tightened types.
> `npx schemafold main.yaml pr.yaml` · runs offline in ~400ms on a 2,000-line spec · caught 41 breakages across my own two repos before they shipped
> [Run it on your spec — no install, no account]

**Mechanism block**

> Most spec diffs give you a JSON patch and let you figure out the consequences. Schemafold walks both trees and asks one question per node: *would a client written against the old spec still work against the new one?* Removing a response field is breaking. Adding an optional query param isn't. Changing `status: string` to `status: enum[active, churned]` is breaking, and it's the one that gets missed in review every single time. You get a table, an exit code, and no opinion about your API design.

**Three features, verbs and receipts**

> **Fails your PR on a breaking change**
> Exit code 2 on breaking, 0 on additive — so `schemafold` is a one-line CI step with no wrapper script.
> `schemafold old.yaml new.yaml --fail-on=breaking`
>
> **Explains the break in client terms**
> Not "removed node at `#/paths/~1users/get/responses/200`" but "`GET /users` no longer returns `email`; any client reading it gets `undefined`."
> Sample output is in the README, unedited.
>
> **Runs entirely offline**
> No spec upload, no account, no telemetry. Your unreleased API never leaves the machine.
> The npm package has three dependencies. `npm ls` is short enough to read.

**Objection block (~45% scroll)**

> **What it doesn't do.** It doesn't lint your spec — use Spectral. It doesn't generate clients. It won't catch a *semantic* break where the field stays but the meaning changes; nothing can. And it's OpenAPI 3.x only: 2.0 specs get an error, not a guess.

**Proof block, no logos**

> No customer logos, because there are no customers yet — this is a tool I built because a narrowed enum in my own API silently broke a mobile client for nine days. Here's what there is instead: the [full diff engine is open source](#), the 41 breakages it caught in my repos are listed in the changelog with dates, and you can run it on your own spec right now without giving me an email address.

**Pricing / CTA**

> **The CLI is free forever, MIT, no limits.** The GitHub Action — which posts the breaking-change table as a PR comment and blocks the merge — is $9/mo per repo, one price, no seats.
> [Copy `npx schemafold`] · [See the Action on a live PR]
> No card for the CLI. No emails. If you delete the Action, your specs were never on my server to begin with.

---

Markers of skill-compliant output: the headline names the job ("know which API change breaks your clients") and won't transplant to a competitor; the proof strip carries a small specific number (41, not "hundreds") that the founder actually supplied; the mechanism block explains *how* the classification works before any feature is claimed; every feature headline is a verb with a runnable receipt underneath; the "what it doesn't do" block names two competitors and one hard limit rather than hiding them; the no-logos problem is solved with an origin story and an open repo instead of a fake testimonial; pricing is a number, not a form; and the last line answers "how do I leave" before the reader has to ask.
