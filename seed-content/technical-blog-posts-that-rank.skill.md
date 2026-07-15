---
title: Technical Blog Posts That Actually Rank Skill
category: Marketing
description: Write engineering posts that earn a top-five position and bring people who convert — intent-matched topic selection, a structure that survives a skim, and the specificity that separates a post someone bookmarks from the 900th "Getting Started With" tutorial. Built around the failure nobody talks about: the post that hit #1 for a term with buyers who were never going to buy.
usage: Load this skill and give it a topic candidate, a working title, or a rough draft plus what your product actually does. Ask it to qualify the topic first ("is this worth writing, and who lands on it?") before asking for an outline or a rewrite — it will push back on terms with no commercial path. It marks every unverifiable claim as [NEEDS: benchmark] rather than inventing numbers.
platforms: [Claude, ChatGPT]
priceUsd: 6
timeSavedHours: 12
pocUrl: https://developers.google.com/search/docs
---

# Technical Blog Posts That Actually Rank Skill

## 1. Philosophy

Most engineering blogs are a graveyard of posts that nobody searched for, written to a template, published on a Thursday, and never touched again. The ones that work do three things: pick a query someone actually types, answer it better than the current top result, and stay updated. Everything below is downstream of those three.

1. **Ranking is a means, not the goal.** A post at #1 for "what is an API" brings ten thousand students and zero customers. A post at #4 for "openapi diff breaking changes ci" brings sixty people, eight of whom have your exact problem right now. Optimise for the second one and stop looking at the traffic graph.
2. **You beat the incumbent by being more specific, not longer.** The current #1 is generic because it was written by someone who has never run the thing in production. Your edge is the failure mode, the version number, the actual error string. That's not a "content strategy" — it's the only durable one available to a person who ships code.
3. **The searcher is in a hurry and in pain.** They pasted an error into a search box. They will skim for the code block, and if it isn't there in two seconds they're gone. Write for the skim first and the read second.
4. **Every claim carries its version.** "Works with Postgres" is worthless in eighteen months. "Tested on Postgres 16.2; the `NULLS NOT DISTINCT` syntax below needs 15+" ages honestly and tells the reader whether to trust you *today*.
5. **A published post is not finished.** The post that ranks is the post that got updated when the API changed. The single highest-leverage hour in content marketing is spent on a post you published fourteen months ago, not the one you haven't started.
6. **Publish the ugly detail.** The paragraph you're slightly embarrassed by — the workaround, the thing that cost you two days — is the paragraph that gets linked to. Polish removes exactly the substance that earns the link.

## 2. Tech Stack

A craft skill; no runtime dependencies. The tools it assumes you can reach:

- **Google Search Central documentation** — https://developers.google.com/search/docs — Google's own published guidance on how indexing and ranking signals work. The only first-party source; treat everything else in the SEO industry, including this skill's heuristics, as inference.
- **Google Search Console** — free, and the only place you can see the queries you *already* rank for on positions 5-20. That list is your editorial calendar and it costs nothing.
- **Any keyword volume tool** — Ahrefs, Semrush, or the free `keywords everywhere`-class browser plugins. Volume numbers across all of them are modeled estimates with wide error bars. Use them for *relative* comparison only; a tool reporting "70/mo" and "90/mo" is telling you those two terms are indistinguishable.
- **The search box itself.** Type the query. Read the top five. That's the competitive analysis, and it's more useful than any dashboard.

All example titles, copy, outlines, and metrics in this file are original to this skill and written for fictional products. No third party's published content is reproduced here.

## 3. Patterns

### 3.1 Qualify the topic before you write a word

Three questions, in order. Fail any one and don't write it.

1. **Does anyone type this?** Not "is this interesting" — does the string exist in a search box. If Search Console shows you at position 14 for something, that's proof of existence and proof of demand.
2. **Can the person typing it buy from you?** This is the question that gets skipped, and skipping it is how you end up with 40k monthly readers and no revenue.
3. **Can you beat what's there?** Search it. If the top five are the official docs plus four Stack Overflow answers, you are not going to win with a tutorial. If the top five are 2019 Medium posts with deprecated code, you win by Tuesday.

**The intent ladder**, from useless to lucrative for a developer tool:

| Rung | Example query | Who lands | Worth writing? |
|---|---|---|---|
| Definitional | "what is a webhook" | Students, curiosity | No. Ever. |
| Learning | "webhook tutorial node" | Learners, maybe future users | Only if you're a teaching product |
| Debugging | "stripe webhook signature verification failed" | Someone in pain, has a budget | **Yes** |
| Comparison | "svix vs hookdeck vs self-hosted" | Someone with a purchase in progress | **Yes** |
| Job-shaped | "replay failed webhooks in production" | Someone shopping for your exact thing | **Yes, first** |

**The failure story this table exists to prevent:** a team writes "What Is Rate Limiting?", lands #2, and celebrates 22,000 monthly sessions. Eighteen months of that traffic produces four trials. Meanwhile "429 retry-after header nginx" — 90 searches a month, contested by nobody — would have delivered people already holding the credit card. Volume is a vanity metric with a really good disguise.

### 3.2 The title is a query, not a headline

Journalism titles ("The Hidden Cost of Microservices") are for people who already read you. Search titles contain the words the searcher typed.

Before / after, written fresh:

- Before: *"Taming the Chaos of Distributed Tracing"* → After: *"Why your OpenTelemetry spans have no parent (and the context propagation fix)"*
- Before: *"A Deep Dive Into Our Migration"* → After: *"Migrating 400GB from RDS to Aurora with 40 seconds of downtime"*
- Before: *"Thoughts on API Versioning"* → After: *"URL vs header API versioning: what breaks for your clients in each"*

The pattern: **the term, plus the specific outcome or number.** The parenthetical carries the differentiator. The number ("400GB", "40 seconds") is the thing that makes someone click yours over the four identical titles above it.

Length: keep the load-bearing words in the first ~60 characters, because that's roughly where the SERP truncates. Everything after is for the person who's already reading.

### 3.3 Structure for the skim, then the read

The searcher scrolls. Give them a landing pad every screen.

```
H1: the query, plus the differentiator
↓
Answer box (2-4 sentences): the fix, immediately. No preamble.
   "If your spans have no parent, you're almost certainly creating the
   tracer before the context propagator is registered. Move the
   registration above your first import of the instrumented library.
   Full explanation below; the three-line fix is in the next block."
↓
The code block that fixes it. Above the fold. Before the explanation.
↓
H2: Why this happens  ← the mechanism, for the person who stayed
H2: The three variants of this bug  ← where the real value lives
H2: How to verify you fixed it  ← the block everyone skips
H2: What still doesn't work  ← the block that earns links
```

The **answer box** is the whole game. Give away the answer in the first 80 words. The instinct to withhold it — to make them read your journey first — costs you the reader and, because they bounce back to the results page in four seconds, costs you the ranking too.

The **"what still doesn't work"** section is the most valuable block on the page and it appears on almost no company blog, because admitting a limit feels like losing. It's the section that gets your post quoted in a Slack thread with "this one's actually honest."

### 3.4 Specificity is the only moat

Every generic sentence in your draft is a sentence a hundred other posts already have. Trade each one for the version only you can write:

| Generic (delete) | Specific (keep) |
|---|---|
| "This can cause performance issues." | "p99 went from 40ms to 2.1s once the table passed ~800k rows, because the planner switched to a seq scan." |
| "Make sure to handle errors." | "The SDK throws `ApiError` on 4xx but returns `{ok:false}` on 5xx — so a `try/catch` alone silently swallows every outage." |
| "Configure your environment appropriately." | "Set `NODE_OPTIONS=--max-old-space-size=4096`. The default 2GB heap OOMs on any spec over ~9k lines." |
| "Results may vary." | "On a 4-vCPU GitHub runner: 410ms. On my M2: 180ms. Harness in the repo." |

The right-hand column is unfakeable. It is the exact reason a post written by someone who ran the thing beats a post written by someone who researched the thing — and it's why "content teams" lose to engineers who write badly but truthfully.

### 3.5 The product mention: one paragraph, near the end, honest

You're writing this because you sell something. Pretending otherwise reads worse than saying it.

The rule: **the post must be complete and useful for someone who never buys.** The fix works, fully, with no product. Then, once, near the end:

> This is a fiddly thing to keep working, which is why I ended up building Relayd — it does the capture-and-replay described above as a proxy, so you don't hand-roll the storage layer. Everything in this post works fine without it; the manual version is what I ran for eight months.

One paragraph. It names the product, states what it does, and concedes the manual path works. What kills a post is the alternative: three CTAs, a mid-article banner, and a conclusion that turns out to be a pitch. Readers notice the bait-and-switch, and the post stops getting linked — which was the entire point of writing it.

### 3.6 Update, don't republish

Ranking decays. Code rots. The intervention:

- **Every 6 months on your top 10 posts:** re-run the code. Update version numbers. Add anything that changed. Note the update date *in the post* with what changed — "Updated March 2026: the `--legacy-peer-deps` workaround is no longer needed as of npm 10.4."
- **Read the Search Console query list for that URL.** You are ranking for things you didn't write about. If a post about span parenting is getting impressions for "otel context lost async_hooks," that's not a keyword to add — that's the next post, pre-validated.
- **Merge cannibals.** Three thin posts about the same query fight each other and all lose. One deep post that absorbs all three, with redirects, will outrank the sum.
- **Kill your darlings by 301.** A post with zero impressions in 12 months isn't neutral — it's dead weight. Redirect it into a live post or delete it.

### 3.7 Distribution: ranking takes months, so seed it

A new post on a low-authority domain does not rank on Tuesday. It ranks in three to eight months, if at all, and only if something points at it.

- Post it where the problem lives: the relevant subreddit, a Discord, the GitHub issue where forty people describe the exact bug you just solved. Answering an old issue with "wrote up the full fix here" is legitimate, welcome, and the highest-yield link you'll get.
- The HN front page is a lottery ticket with a real prize: the traffic spike is meaningless, the durable links are not.
- Do not "syndicate to five platforms." A canonical-less copy on three aggregators competes with your own URL.
- Write the post, then go back to the four Stack Overflow answers about this error and improve them, honestly, with a link. That's not a growth hack, that's how the ecosystem is supposed to work — and it outperforms every scheduled tweet you'll ever send.

## 4. Anti-patterns

- **Chasing volume over intent.** #1 for "what is CI/CD" and no pipeline. Twenty thousand readers, zero of them buying. This is the single most expensive mistake in developer content and it looks exactly like success on a dashboard.
- **The 3,000-word "ultimate guide" nobody asked for.** Length was never a ranking factor — it's a correlation people cargo-culted into a rule. A 700-word post that solves the problem beats a 3,000-word post that pads to hit a target.
- **Burying the answer.** Eight paragraphs of context before the code block. The searcher is gone by paragraph two, and the bounce tells the engine your page didn't answer the query.
- **AI-generated filler with no lived detail.** A post with no version numbers, no error strings, no "this took me two days" is indistinguishable from the forty others generated the same week. Nothing links to it, so nothing ranks it.
- **"Getting Started With <Popular Library>."** The official docs own that query and always will. You cannot outrank the maintainers on their own tutorial. Write "getting started with X *when you already have a Y-shaped legacy schema*" — the intersection nobody covers.
- **No dates, no versions.** A reader who can't tell if a post is from 2019 assumes it is.
- **Product injected into paragraph two.** The reader came for a fix and found an ad. They leave, and they remember.
- **A "blog" that's a changelog wearing a wig.** "We're excited to announce..." posts have zero search demand. Nobody searches for your announcements. That content belongs in release notes.
- **Cannibalising yourself.** Four posts targeting "webhook retry" split every signal four ways. Pick one, merge, redirect.
- **Publish and abandon.** The post that ranked for eleven months and then died because the library hit v3 was a maintenance failure, not a writing failure.
- **Comparison posts where you win every row.** A "vs" table with green checkmarks down your column and red X's down theirs is read as marketing and trusted by nobody. Concede two rows honestly and the other eight become believable.

## 5. Usage

1. Load this skill and start with qualification, not writing: *"I'm considering 'Postgres connection pooling with PgBouncer in Lambda'. Qualify it."* Expect pushback with reasoning about intent and who lands there.
2. Give it your product's actual job in one sentence so it can judge commercial path. Without that, it can't tell you a topic is a traffic trap.
3. Give it your real material: the incident, the error string, the fix, the versions, the numbers you measured. It cannot invent the specificity from section 3.4, and it will mark gaps `[NEEDS: p99 before/after]`. Treat any number you didn't supply as a defect.
4. Ask for the answer box first, alone. If the fix can't survive four sentences, you don't understand it well enough to write 1,200.
5. Reject drafts that: withhold the answer past the first screen, mention the product before the last third, contain a version-free claim, or include a "vs" table you win 10-0.
6. Six months later, paste the post plus its Search Console query list back in and ask for an update pass. This is the highest-yield use of this skill and the one everyone skips.

## 6. Example Output

Prompt with this skill loaded: *"I want to write 'A Complete Guide to Database Migrations.' My product is Schemafold — it diffs OpenAPI specs and flags breaking changes for API clients. Qualify it, then give me the real title and the answer box."*

---

**Qualification: don't write it.**

Three failures:

1. **Intent is definitional-to-learning.** People searching "database migrations guide" are learning a concept. They are months from a purchase and most of them are students.
2. **No commercial path.** Schemafold doesn't touch databases. It diffs API specs. Someone who lands on your migrations guide has *no reason* to look at your product, so even a #1 costs you money to serve.
3. **Unwinnable.** The top five will be Prisma's docs, Rails' guides, and two Stack Overflow threads with 900 upvotes. You have no authority on that query and no differentiated experience.

This is the exact trap from §3.1: you'd win a term whose searchers can't buy from you.

**What to write instead** — you have unfakeable material: you shipped a narrowed enum that silently broke a mobile client for nine days.

**Title:** `Narrowing an enum is a breaking API change (and your spec diff won't catch it)`

Why this one: "breaking api change enum" is debugging/job-shaped intent — the person typing it is mid-review, arguing with a colleague, or cleaning up an incident. They can buy. The top results are generic versioning essays with no enum-specific detail. You have a nine-day outage nobody else can claim.

**Answer box (first 80 words, above any explanation):**

> Changing `status: string` to `status: enum[active, paused, churned]` looks additive — the field is still there, still a string. It isn't. Every client sending `status=trialing` now gets a 422, and no JSON-patch-based diff will flag it, because structurally you only *added* a constraint. Any change that shrinks the set of accepted inputs, or the set of possible outputs, is breaking. The three-line check is in the next block; the nine-day version of this story is below it.

**Outline:**

```
H1  Narrowing an enum is a breaking API change (and your spec diff won't catch it)
    → answer box (above)
    → the check, as a code block, before any prose

H2  Why structural diffs miss it
    Mechanism: JSON Patch sees `add /enum`. Additive at the tree level,
    subtractive at the value level. Include the actual patch output.

H2  The four narrowings that break clients
    enum added/shrunk · optional → required · type widened→narrowed
    (int64 → int32) · format tightened (string → uuid)
    One real request/response pair per case. Real status codes.

H2  The nine days                          ← the unfakeable section
    Deployed Tue. Mobile clients on the old build sent `status=trialing`.
    422s. Crash-free rate dropped 0.4% — under the alert threshold.
    Found it via a support ticket. What the dashboards did not show and why.

H2  How to check this in CI
    The full manual version: parse both specs, compare enum sets per node,
    fail on shrink. ~30 lines, works with zero products.

H2  What this still won't catch          ← the link-earning honesty section
    Semantic drift: field stays, meaning changes. Nothing detects that.
    Client-side assumptions about ordering. Undocumented behaviour clients
    depend on anyway.

H2  [product paragraph, one only]
    This is what Schemafold does — the 30-line check above, generalised to
    every node type, as a CI step. The manual version above is what I ran
    for four months and it's genuinely fine for one spec.
```

**[NEEDS: the actual 422 body your API returned, and the crash-free-rate numbers from that week — I will not approximate these.]**

---

Markers of skill-compliant output: the requested topic is refused, with the intent ladder and the missing commercial path as the reason, rather than politely outlined anyway; the replacement title contains the searchable term plus a differentiator that fits inside the SERP truncation; the answer box gives the entire fix away in the first 80 words instead of withholding it; the outline puts the code block above the explanation; the strongest section is the incident nobody else can write; a "what this won't catch" section concedes real limits; the product appears exactly once, at the end, conceding the manual path works; and every number the author didn't supply is a `[NEEDS: ]` marker rather than a plausible invention.
