---
title: Content Clusters and Internal Linking Skill
category: Marketing
description: Plan a content cluster that concentrates authority instead of splitting it — one pillar, a set of non-overlapping spokes, and an internal link graph with anchor text that actually carries meaning. Fixes the two silent killers of a growing blog: forty posts quietly cannibalising each other for the same query, and a link structure where every page points at the homepage and nothing points at the page you need to rank.
usage: Load this skill and give it your product, the job it does, and a list of your existing post titles or URLs. Ask it to map the cluster and audit for cannibalisation first — before commissioning anything new — and it will tell you which posts to merge, which to redirect, and which single spoke is worth writing next. It works from titles alone, but Search Console query data makes the audit far sharper.
platforms: [Claude, ChatGPT]
priceUsd: 0
timeSavedHours: 20
pocUrl: https://search.google.com/search-console/about
---

# Content Clusters and Internal Linking Skill

## 1. Philosophy

A blog with forty scattered posts is not a content strategy; it's forty lottery tickets. A cluster is the opposite bet: a small number of pages that agree with each other, point at each other, and collectively convince a search engine that this site is the place where this topic is understood.

1. **One query, one URL. Always.** The instant two of your pages target the same intent, they split every signal they have and both lose to a site that consolidated. Cannibalisation isn't a subtle tax — it's the reason your best post sits at position 11 forever.
2. **The link graph is the argument.** Which of your pages is most important? You don't get to say. You get to *show*, by pointing at it from everywhere relevant, with anchor text that names what it's about. A site where every internal link says "read more" has made no argument at all.
3. **Depth beats breadth, and it isn't close.** Six pages that exhaustively cover webhook reliability outperform forty pages covering forty unrelated things, because the six accumulate topical authority and the forty accumulate nothing.
4. **Spokes exist to answer, the pillar exists to route.** A pillar that tries to fully answer eight sub-questions is a 6,000-word page that ranks for none of them. It should orient, then hand off.
5. **A cluster is finite, and finishing it is the point.** Eight spokes, done, interlinked, updated. Then you build the next cluster. A cluster that's perpetually 60% built ranks like a cluster that's 0% built.
6. **Publishing is 40% of the work.** The other 60% is the audit six months later — merging the cannibals, updating the dead code, and re-pointing the links at whatever turned out to matter.

## 2. Tech Stack

A craft skill. The tools it assumes:

- **Google Search Console** — https://search.google.com/search-console/about — free, first-party, and the only place you can see which of your URLs the engine is actually showing for which query. The Performance report filtered to a single query, showing two of your URLs alternating, *is* the definition of cannibalisation. Nothing else in this stack is required. This one is.
- **Google Search Central docs** — https://developers.google.com/search/docs — first-party guidance on canonicalisation, redirects, and internal linking. Everything else in the SEO world, this skill included, is inference on top of it.
- **A crawler** — Screaming Frog (free to 500 URLs), or 30 lines of Python with `httpx` + `selectolax`. You need the internal link graph as data: source URL, target URL, anchor text. That table is the whole audit.
- **A spreadsheet.** The cluster map lives here. Columns: query, intent, target URL, status, position, links-in.

All examples, titles, structures and numbers in this file are original to this skill and written for fictional products. No third party's content is reproduced.

## 3. Patterns

### 3.1 Pick a cluster your product sits inside

A cluster is a topic where every reasonable sub-question eventually touches the thing you sell. Get this wrong and you build forty excellent pages that route to nothing.

Test: for each candidate spoke, finish the sentence *"someone with this problem would plausibly want ___."* If the answer isn't your product, in one step, the spoke doesn't belong in this cluster.

Worked example, for a fictional webhook-replay tool:

- ✅ **Cluster: webhook reliability.** Delivery failures, retries, idempotency, signature verification, replay, ordering. Every one of those is somebody having your problem.
- ❌ **Cluster: API design.** Interesting, adjacent, huge — and a person reading about REST vs GraphQL is nowhere near buying a replay proxy. This is the traffic trap that eats a year.

Size: **one pillar, five to nine spokes.** Under five and it isn't a cluster, it's a few posts. Over nine and the spokes start overlapping, which is cannibalisation with a project plan.

### 3.2 The pillar routes; it doesn't answer

The pillar targets the broad, job-shaped query — *"webhook reliability"* — and its job is to be the map. Structure:

```
H1  Webhook reliability: the seven ways delivery fails, and what fixes each

    Intro: 100 words. The failure taxonomy in one paragraph.
    Not "what is a webhook." Anyone searching this knows.

H2  1. Your endpoint 500s and the sender gives up
    Three paragraphs: mechanism, blast radius, the shape of the fix.
    → "Full detail: how retry and backoff policies actually behave
       across the major senders" [links to spoke 1]

H2  2. The same event arrives twice
    Three paragraphs.
    → "Full detail: idempotency keys for webhook consumers" [spoke 2]

H2  3. Signature verification fails after a proxy rewrites the body
    → [spoke 3]

... 4 more, same shape ...

H2  Where to start
    A decision path, not a summary. "If you're losing events, start
    with §1. If you're double-charging, §2."
```

Each section: enough to be genuinely useful standing alone, not enough to satisfy someone who has *that specific* problem. If the pillar section fully answers the spoke's query, you built a competitor to your own spoke and they'll fight.

The pillar rarely ranks first. It ranks *eventually*, once the spokes have accumulated links and it's collecting from all of them. Judging a pillar at week six is judging a tree at week six.

### 3.3 Non-overlapping spokes: the discipline nobody keeps

Every spoke owns exactly one query and its close variants. The test: write each spoke's query as a **question a person asks out loud**. If two spokes produce the same spoken question, they're one spoke.

```
Pillar:  webhook reliability

Spoke 1: "how many times will Stripe retry a failed webhook?"
Spoke 2: "how do I stop processing the same webhook twice?"
Spoke 3: "why does my signature check fail behind Cloudflare?"
Spoke 4: "how do I replay webhooks I dropped during an outage?"
Spoke 5: "do webhooks arrive in order?"        ← spoiler: no
Spoke 6: "should I use a queue or process webhooks inline?"
Spoke 7: "how do I test webhooks locally?"
```

Now the failure mode. Someone proposes spoke 8: *"webhook retry best practices."* Read it against spoke 1. Same spoken question. That post will fight spoke 1 for eighteen months and neither will win. **Kill it at the planning stage** — that costs nothing. Killing it after publication costs a merge, a redirect, and the six months it already wasted.

Nine times in ten, a "new post idea" that feels vaguely familiar is a section of an existing post that hasn't been written yet. Add the section. Don't add the URL.

### 3.4 Internal linking: anchors are the argument

The link graph is the only mechanism you fully control. Rules, in order of how much damage the violation does:

**Anchor text names the target's topic.** `<a href="/webhook-idempotency">idempotency keys for webhook consumers</a>` — not "read more," not "click here," not "this post." The anchor is a label you're applying to that page, and "read more" labels it as nothing. This is the highest-leverage, lowest-effort fix on any blog, and most blogs have never done it.

**Vary the anchors.** Forty identical anchors reads as automated. Rotate naturally: "idempotency keys," "deduplicating repeated deliveries," "how consumer-side idempotency works."

**Link from context, not from a footer.** A link inside a paragraph where the topic is live carries weight and gets clicked. A "Related posts" widget carries almost nothing and gets ignored. Same URL, tenth of the value.

**Link both directions.** Pillar → spoke and spoke → pillar, every time. And spoke → spoke where genuinely relevant — the idempotency post should link the retries post, because retries are *why* you need idempotency. That lateral link is the one that makes a cluster read as a cluster.

**Point new posts at your money page.** Not the homepage — the page you need ranking. New posts have fresh crawl attention. Spending it linking to `/` is spending it on nothing.

**Three to eight internal links per post.** Fewer and you're not building the graph; more and each carries less, and the post reads like a phishing email.

**The audit that finds real money:** crawl the site, group by target URL, count links-in. Sort ascending. The page you most want to rank is somewhere near the bottom with two inbound links — one from the nav, one from a post in 2023. That's ten minutes of work and it's the highest-yield ten minutes available.

### 3.5 Finding cannibalisation in Search Console in four minutes

The procedure, exactly:

1. Performance → **Queries** tab → pick a query you care about.
2. With that query filtered, switch to the **Pages** tab.
3. If two or more of your URLs appear for that one query — that's it. That's cannibalisation. You've found it.

What it looks like when it's bad: `/webhook-retries` at position 12 with 400 impressions, `/webhook-retry-best-practices` at position 14 with 380. Two half-strength pages orbiting the first page. Merged, that's one page with 780 impressions and a real shot at position 6.

The fix, in order:

1. **Pick the winner.** Whichever has more inbound links (internal *and* external) — links are the hard thing to move; text is easy.
2. **Move the good parts across.** The loser has three paragraphs the winner doesn't. Take them.
3. **301 the loser at the winner.** Not a delete. Not a canonical. A redirect — you want the links to arrive.
4. **Fix every internal link that pointed at the loser.** Update the anchors while you're in there.
5. **Wait eight weeks.** Nothing happens in a fortnight. It compounds quietly and then it's just better.

**Do not** solve cannibalisation by adding a canonical tag and leaving both live. It's a hint, not an instruction, and it leaves you with two pages fighting and a note asking them to stop.

### 3.6 Sequence: middle out

Nobody's cluster ever gets finished in the order it was planned. Build in the order that pays:

1. **The two or three highest-intent spokes first.** The debugging queries. They're contested by almost nobody, they rank in weeks, and their readers can buy.
2. **The pillar third or fourth** — once you have real spokes to route to. A pillar published into an empty cluster is a page of dead links to drafts.
3. **The remaining spokes**, in intent order.
4. **The comparison page last** ("X vs Y vs self-hosting"). It's the highest-converting page in the cluster and it needs the cluster's authority behind it to rank at all.
5. **Then stop and audit.** Do not start cluster two with cluster one at 70%.

Timeline honesty, for a low-authority domain: a spoke takes **three to eight months** to settle into its true position. Anyone quoting weeks is selling something. Plan a cluster as two quarters of patience, not a sprint.

## 4. Anti-patterns

- **Two posts, one query.** The default failure of every blog past twenty posts. Both stall at position 11, forever, and the fix — a merge and a 301 — is an hour of work nobody schedules.
- **"Read more" as anchor text.** You had one free chance to tell the engine what that page is about and you used it to say nothing. Across two hundred links, that's the entire argument you failed to make.
- **The homepage as the target of every internal link.** Your homepage doesn't need help. The comparison page you want ranking is sitting on two inbound links, and you've spent every drop of link equity on a page nobody searches for.
- **The 6,000-word pillar that answers everything.** It ranks for nothing because it's about everything, and it cannibalises every spoke you then write.
- **"Related posts" widget as the linking strategy.** Templated, footer-positioned, unclicked. Real links live inside paragraphs.
- **A cluster your product doesn't sit inside.** Beautiful, well-linked, ranking — for people who cannot buy. This is the same trap as chasing volume, just executed with more discipline.
- **Canonical tags instead of merges.** A hint you hope resolves a conflict you could have removed. Merge and redirect.
- **Abandoning a cluster at 60% to start a fresh one.** Two half-clusters have less authority than one finished one. The new topic is exciting because it's new, not because it's better.
- **Judging a spoke at week six.** Three to eight months. Killing a post at week six because it's at position 38 is killing it exactly when it's doing what it should.
- **Publishing spokes with no pillar link.** Orphan posts. The engine finds them via the sitemap, notices nothing on the site considers them important, and treats them accordingly.
- **A "vs" page with no cluster behind it.** The highest-competition page in the set, published first, into a site with no topical standing. It never ranks, and you conclude comparison pages don't work.

## 5. Usage

1. Load this skill and give it your product's job in one sentence, plus your existing post titles or URLs (a plain list is enough). Start with the audit, not the plan: *"Which of these cannibalise each other?"*
2. If you have Search Console access, paste the query→page table for your top 20 queries. That turns the audit from inference into diagnosis. Without it the skill reasons from titles and will say so.
3. Get the cluster proposed as a table — query, spoken question, intent, target URL, status — and read the spoken-question column looking for duplicates. That's the review that matters.
4. Ask *"what should I not write?"* explicitly. The skill is more useful killing your fourth webhook-retry post than outlining it.
5. For the link graph, paste a crawl export (source, target, anchor) and ask for links-in per URL, ascending. Fix the bottom five first.
6. Reject any output that: proposes two spokes answering the same spoken question, suggests canonical tags in place of a merge, promises results in weeks, or plans a cluster whose readers have no path to your product.
7. Come back every quarter with the same list. This skill's real value is on the second and third pass, when it tells you to merge the thing you were proud of.

## 6. Example Output

Prompt with this skill loaded: *"Coldline — a CLI that kills serverless cold starts by pre-warming on real traffic patterns. Here are my nine existing posts: (1) What Is Serverless? (2) Lambda Cold Starts Explained (3) Reducing Lambda Cold Start Time (4) Provisioned Concurrency Guide (5) How We Cut Our p99 by 90% (6) AWS Lambda Best Practices (7) Serverless vs Containers (8) Lambda Cold Start Tips and Tricks (9) EventBridge Scheduling Basics. Audit and plan."*

---

**Audit: you have nine posts and roughly four ideas.**

**Cannibal group A — four posts, one query.** Posts 2, 3, 8 and half of 5 all answer the spoken question *"how do I make Lambda cold starts less bad?"* Four URLs splitting one query four ways is why none of them are on page one.

- **Winner: (3) Reducing Lambda Cold Start Time.** Job-shaped title, most likely to hold external links.
- Merge in: (2)'s mechanism explanation, (8)'s tips list as a section.
- **301:** 2 → 3, 8 → 3.
- **(5) survives** — but only if you rewrite it as a *case study*, not a tips post. The spoken question becomes "what does this actually save, with numbers?" Different question, different page. Strip anything from it that duplicates (3).

**Delete or redirect — no commercial path:**

- **(1) What Is Serverless?** Definitional. Students. Unwinnable against AWS's own docs. `301 → /serverless-cold-starts` (the pillar) and never think about it again.
- **(7) Serverless vs Containers.** Enormous, contested, and a reader mid-way through that decision is nowhere near buying a warming CLI. Leave it up, but it's not in the cluster and it gets no more investment.
- **(6) AWS Lambda Best Practices.** Fatally broad. Owned by AWS. `301 → 3`.
- **(9) EventBridge Scheduling Basics.** Not your cluster. Zero purchase intent. Leave, don't extend.

**Cluster map — one pillar, six spokes, three of them new:**

| # | Spoken question | Target URL | Status | Priority |
|---|---|---|---|---|
| **Pillar** | "why are my Lambdas slow to start and what are my options?" | `/serverless-cold-starts` | **new** | 3rd |
| S1 | "how do I make Lambda cold starts less bad?" | `/reducing-lambda-cold-starts` | merged from 2,3,8 | **1st** |
| S2 | "is provisioned concurrency worth the money?" | `/provisioned-concurrency-cost` | rewrite of (4) | **2nd** |
| S3 | "how do I measure my actual cold start rate?" | `/measuring-cold-start-rate` | **new** | 4th |
| S4 | "why is my Node Lambda's init phase 900ms?" | `/lambda-init-phase-slow` | **new** | 5th |
| S5 | "what did pre-warming actually save you?" | `/coldline-case-study` | rewrite of (5) | 6th |
| S6 | "provisioned concurrency vs scheduled warming vs doing nothing" | `/warming-strategies-compared` | **new** | **last** |

Note S2. Post (4) is currently a *guide* — "how to configure provisioned concurrency" — which AWS's docs own outright, permanently. Rewritten as **cost**, it targets a query with no good incumbent answer and readers who are actively holding a bill. Same subject, completely different commercial reality.

S6 is your money page and it goes last, on purpose. Published today, it never ranks. Published after S1–S5 have accumulated links, it inherits the cluster's standing.

**Internal linking fixes, in the order I'd do them:**

1. **Every one of your nine posts currently links to `/` and nothing else.** That's the whole problem in one sentence. Your homepage does not need help; `/reducing-lambda-cold-starts` does.
2. **Post-merge, S1 gets inbound links from:** pillar (contextual, in the options section), S2 ("if the cost doesn't work for you, the [non-provisioned approaches to cold starts] are here"), S3, S4, S5. Five contextual in-paragraph links, five different anchors.
3. **Kill every "read more."** Rewrite each as the target's topic: "→ what provisioned concurrency actually costs for bursty traffic."
4. **S3 and S4 both link S1 laterally.** Measuring the rate and diagnosing a slow init are both *reasons* someone needs the fix — that's a real relationship, not a link-for-links'-sake.
5. **Product link placement:** one contextual mention per spoke, in the last third, per the blog-post rules. Six spokes, six honest mentions. Not a banner.

**What to do this week:** the merge. 4 → 1 URL, three 301s, one rewritten post, five internal links repointed. That's an afternoon, it costs nothing, and it does more than the next three posts you were planning to write.

**[NEEDS: Search Console query→page data for "lambda cold start" and "provisioned concurrency cost". The merge picks above are inferred from titles alone. If (2) is quietly holding a backlink from a newsletter, (2) is the winner and 3 → 2 instead. Links are the thing you can't recreate — check before you redirect.]**

---

Markers of skill-compliant output: the audit runs before any new content is proposed, and it finds nine posts hiding four ideas; the four-way cannibal group is resolved by naming a winner, merging the salvage, and 301-ing the rest rather than adding canonicals; three posts are cut from the cluster entirely because their readers have no path to the product, even though two of them are perfectly good posts; every row of the map carries a *spoken question*, so overlap is visible at a glance; the provisioned-concurrency post is re-aimed from a query AWS owns to one nobody's answered; the comparison page — the highest-converting page in the set — is scheduled last, deliberately; the linking section names the real disease (every link points at the homepage) and the first fix is a merge that costs an afternoon and nothing else; and the merge decision itself is flagged as provisional pending the one dataset that would settle it.
