---
title: Launch Day Sequencing Skill (Product Hunt, HN, Reddit)
category: Marketing
description: Run a multi-channel launch that doesn't collapse into a self-inflicted disaster — channel-specific submission copy, the right order and hour for each, and the comment-thread discipline that decides whether a post climbs or dies at rank 40. Encodes the failures that actually kill launches: the 3am timezone miscalculation, the Reddit post removed in four minutes, and the HN thread where the founder argued.
usage: Load this skill with what you built, who it's for, and your timezone, and ask for a launch plan or a single artifact ("write the Show HN title, five options"). It produces per-channel copy that reads native to each place, a timed run-of-show, and a pre-mortem of what will go wrong. Ask it to review your draft submission before you post — that review is where most of the value is.
platforms: [Claude, ChatGPT]
priceUsd: 8
timeSavedHours: 10
pocUrl: https://www.producthunt.com
---

# Launch Day Sequencing Skill (Product Hunt, HN, Reddit)

## 1. Philosophy

A launch is not an announcement. It is four hours of live conversation in three rooms that have nothing in common, and the founders who do well are the ones who understood the rooms before they walked in.

1. **Each channel is a different country.** The post that tops Product Hunt gets flagged on Hacker News and removed from Reddit inside five minutes. There is no universal launch copy. Cross-posting the same paragraph everywhere is the single most reliable way to lose all three.
2. **The comment thread is the launch.** The submission is a door. The first ninety minutes of replies determine whether anyone walks through. A founder who disappears after posting has thrown away the entire day.
3. **Launch is a spike, not a strategy.** The best day of your life gets you a graph with a cliff on the right-hand side. The question is never "how big was the spike" but "what did I keep" — the newsletter, the twelve people in your Discord, the four issues filed by strangers.
4. **You get one first launch per product.** Not per year — per product. You can re-launch a major version, but the "we're live" energy is non-renewable. Do not spend it on a landing page with a waitlist.
5. **Being useful outranks being clever.** Every channel punishes marketing language, but they punish it in different dialects. The safe register everywhere is: here's the thing, here's what it does, here's what's broken about it.
6. **Ship the thing that can be used at the moment you post.** A launch pointing at a waitlist converts curiosity into nothing. The whole value of the spike is that people can try it while they're still interested — which is for about eleven minutes.

## 2. Tech Stack

No dependencies; this is a distribution craft skill. The surfaces it addresses:

- **Product Hunt** — https://www.producthunt.com — a daily leaderboard for consumer-and-prosumer products. Audience: makers, early adopters, other founders.
- **Hacker News** — https://news.ycombinator.com — ranked link aggregator run by Y Combinator. Audience: engineers. `Show HN` is the specific format for things you made. Read the site's own posting guidelines before you submit; they are short and they are enforced.
- **Reddit** — https://www.reddit.com — a federation of independently moderated communities. There is no such thing as "posting to Reddit"; there is only posting to r/specific-place, whose rules are on its sidebar and whose automod is not negotiable.
- **Lobsters, Indie Hackers, dev.to, relevant Discords** — secondary surfaces, mentioned where relevant.

None of these platforms endorse, sponsor, or are affiliated with this skill. All copy, examples, titles and numbers in this file are original to this skill and written for fictional products. Platform mechanics change; verify current rules on each site before you launch.

## 3. Patterns

### 3.1 The four-week clock

Launch day is the last day of the work, not the first.

**T-4 weeks — earn standing.** Not "build an audience." Be a real participant in the two or three places you plan to post. Comment. Answer questions. File issues. An account with no history posting a launch reads as a drive-by, and in the subreddits that matter, automod removes it before a human ever sees it.

**T-2 weeks — build the artifact.** Not the product: the *demo*. A 40-second silent screen recording that shows the thing working, no talking head, no logo animation. This asset does more work on launch day than your landing page.

**T-1 week — the pre-mortem.** Write down the three ways this goes wrong. Usually: (1) the demo server melts, (2) someone points out an existing tool that does this and you have no answer, (3) a rule you didn't read. Fix all three now.

**T-3 days — the honest email.** To the people who asked to know. Not a blast. "You said to tell you when this was ready. It is. Launching Tuesday; if you have four minutes today I'd rather find the bugs before then than after."

**T-1 day — freeze.** No deploys. Every founder who ships a "tiny fix" the night before launches a broken product the next morning. Test the signup flow from a private window on a phone on cellular data. That's the flow half your visitors will use, and it's the one you've never tried.

### 3.2 Channel order, and the one everybody gets wrong

The default sequence, and why:

1. **Product Hunt first**, at the day's start. It's a 24-hour ranked competition, so a post that begins mid-day starts behind and stays there.
2. **Hacker News second**, an hour or two later, *only if* you have a Show HN-worthy artifact: something people can run, look at, or read the source of.
3. **Reddit third or never**, and only into communities where you already have standing and the rules permit self-promotion.

**The mistake:** posting all three simultaneously so you can "handle it in one block." You will be answering thirty comments in three registers at once, and you will paste the PH tone into the HN thread. That comment — cheerful, exclamation-marked — is a visible ejection seat.

**The other mistake, and this is the one that stings:** Product Hunt's day boundary is **Pacific time**. A founder in Mumbai who posts at 9am local is posting at 7:30pm Pacific the previous day — into a 24-hour window with four hours left, against products that have been accumulating since midnight. Rank 40, permanently, from a timezone arithmetic error. If you're in IST, launch day starts at **12:30pm** local. In CET, 9am. Set an alarm, not an intention.

Hacker News has no reset, but the front page is thin between roughly 06:00 and 09:00 Pacific on a weekday — a decent post has a real chance of catching traction there. Fridays and weekends are quieter: less competition, fewer people. That's a genuine trade, not a rule.

### 3.3 Show HN: the title is the whole post

HN titles are the most constrained copy in software marketing. Format: `Show HN: <what it is> – <what makes it different>`. Lowercase energy. No exclamation marks. No adjectives.

Rewritten five ways, one fictional product:

| Title | Verdict |
|---|---|
| `Show HN: Schemafold – The Ultimate API Diffing Platform 🚀` | Dead. Emoji, "ultimate", "platform". Flagged inside a minute. |
| `Show HN: I built a tool to help teams ship better APIs` | Dead. No mechanism, no object. What *is* it? |
| `Show HN: Schemafold – OpenAPI diffing` | Weak. True but boring. Nothing to click. |
| `Show HN: Schemafold – find breaking API changes before you merge` | Good. Job-shaped, plain, falsifiable. |
| `Show HN: I diffed two OpenAPI specs and shipped a break anyway – so I wrote this` | Best on a good day, risky on a bad one. The story earns the click; some readers find first-person titles cute. |

Then the **first comment**, posted by you, immediately after submitting. This is mandatory and it is where the launch is won or lost:

> I've been maintaining a public API for about two years, and last March I changed `status: string` to an enum with three values. Every mobile client still sending `status=trialing` started getting 422s. Took nine days to find, because the crash-free rate only moved 0.4% — under my alert threshold.
>
> Standard spec diffs didn't catch it: at the tree level I only *added* a constraint, so it looks additive. Schemafold walks both specs and asks per-node whether a client written against the old one still works — so enum narrowing, optional→required, and int64→int32 all come back as breaking with the actual client-visible symptom.
>
> It's an npm package, runs offline (~400ms on a 2k-line spec), OpenAPI 3.x only — 2.0 errors out rather than guessing. Doesn't lint (use Spectral) and can't catch semantic drift where the field stays but the meaning changes. The rule engine's the interesting part if anyone wants to tell me where it's wrong: <repo link>
>
> Happy to answer anything.

Note the structure: **the itch, the mechanism, the limits, an invitation to be corrected.** The limits paragraph is not humility theatre — it is pre-empting the top comment. Someone was going to post "this doesn't handle semantic changes." You said it first, so now that person is agreeing with you instead of dunking on you.

### 3.4 Product Hunt: different room, different clothes

PH rewards enthusiasm, visuals, and a maker who shows up. The register that gets you flagged on HN is the correct register here — but the *substance* rule still holds.

- **Tagline** (60 chars): the job. `Find breaking API changes before you merge them` — not "API diffing, reimagined."
- **Gallery**: the first image is a real screenshot showing real output. Not a gradient with your logo on it. The 40-second silent demo goes second.
- **Maker's first comment**: the same story as the HN comment, warmer, shorter, ending in a question. A question converts a page into a thread, and thread activity is what the ranking notices.
- **Do not ask for upvotes.** Not in a DM, not in your newsletter, not in a group. It's against the rules, it's detectable, and the entire day gets voided. Say "we're live today" and link. People know what to do.
- **Answer every comment within about twenty minutes, for eight hours.** That's the job. Block the day. Don't schedule a single meeting.

### 3.5 Reddit: the four-minute removal

Reddit is the highest-yield channel and the one most likely to eject you before anyone reads a word.

**Read the sidebar. Then read the last 50 posts.** If none of them are launches, yours won't be either. Some communities have a self-promo thread, or a specific day, or a strict ratio (nine non-promo contributions per promo post — some automods count).

**The register:** you are not launching, you are sharing something you made because it's relevant to a conversation that's already happening. Title as a statement of substance, not an announcement:

- Bad: `Launching Schemafold today — would love your feedback! 🚀`
- Better: `I built a CLI that flags enum narrowing as a breaking API change — the failure that cost me nine days`
- Best in a specific sub: reply, in an existing thread about breaking changes, with the actual answer and the tool as a footnote.

**Post the content in the post**, not just a link. A link-only submission to your own domain is the shape of spam and is treated as such. Write the story in the body. Put the link at the bottom.

**When the mods remove it:** message them once, politely, ask what rule, accept the answer. Arguing gets you banned, and a subreddit ban is forever. It's their house.

### 3.6 The comment thread: the four replies you'll need

Prepare these before you post. You will need all four.

**"X already does this."** Never say "yes but we're better." Say what's true:
> X is more mature and if you're already on it I wouldn't switch. The difference is it works at the tree level, so narrowing an enum reads as additive — that's the exact case that bit me, and it's why this exists rather than a PR to X.

**"This is trivial, it's 200 lines."** Agree, immediately and cheerfully:
> Honestly, yes — the first version was about 120 lines and I ran it for four months. It's in the post. The long tail is nullable-vs-optional and `allOf` merging, which is where the other 2k lines went.

**Hostility.** One reply, no defence, no second reply:
> Fair enough — appreciate you looking.
> Then leave. Nobody has ever won an argument on HN. The audience is not the person you're replying to; it's the six hundred people reading how you handle it.

**A real bug, publicly.** This is the best thing that can happen to you:
> Confirmed, reproduced. That's the `allOf` merge path. Fixing it now — I'll reply here when it's shipped.
> Then ship it in two hours and reply. That thread converts better than any feature you could have shipped instead.

### 3.7 The 72 hours after

The spike is not the yield. This is:

- **Capture, don't count.** Traffic you don't convert to an email, a star, or a Discord join is traffic that never existed. Have one capture mechanism on the page.
- **Reply to every comment for three days.** The thread keeps working long after the ranking stops.
- **Write down every objection.** By hour six you'll have heard the same three complaints eleven times. That's your roadmap, delivered free, and it's more valuable than the signups.
- **Fix the top complaint within a week and go back to the thread and say so.** Almost nobody does this. It is the cheapest reputation you will ever buy.
- **The graph will crater. That's normal.** Day two is 10% of day one. The success metric is week four's baseline against week zero's.

## 4. Anti-patterns

- **Launching a waitlist.** You spent your one launch converting interest into an unopened email six weeks later. If it isn't usable at the moment you post, don't post.
- **Timezone arithmetic done in your head.** PH's day resets at midnight Pacific. Post at 9am from Mumbai and you've entered a 24-hour race with four hours left. This one error caps more launches than bad copy does.
- **The same paragraph in all three places.** PH's exclamation marks get you flagged on HN; HN's dryness gets ignored on PH; both get removed from Reddit for being an ad. Three rooms, three drafts.
- **Asking for upvotes.** Rule violation on PH, vote-ring detection on HN, instant ban on Reddit. It's also the loudest possible signal that nobody wanted the product on its own.
- **Posting and going to sleep.** A Show HN with an unanswered top comment for five hours is dead at rank 60. If you can't sit with it for eight hours, move the date.
- **Arguing in the thread.** You will not win. Everyone watching decides you're difficult, and that's the memory that survives after the ranking's gone.
- **Deploying on launch morning.** The "tiny fix" is how you launch a 500 page.
- **Link-only Reddit submission to your own domain.** Spam-shaped. Removed in four minutes by a bot that never read it.
- **A 3-minute demo video with a voiceover intro.** Nobody watches past eight seconds. Forty silent seconds of the thing working, autoplay, muted.
- **Launching into a subreddit you've never posted in.** Automod checks account age and karma-in-sub. You lose before a human sees it.
- **Treating rank as the outcome.** #1 with no capture is a nice screenshot. #14 with 300 emails and four contributors is a business.
- **"We're excited to announce."** Nobody has ever been excited by that sentence.

## 5. Usage

1. Load this skill and give it: what it is, who it's for, whether it's usable *right now* by a stranger with no account, your local timezone, and your actual standing in each community (account age, post history). The standing question decides whether Reddit is even on the table.
2. Ask for the pre-mortem before the copy: *"What kills this launch?"* You want the timezone error and the "X already does this" gap surfaced while there's time.
3. Request artifacts one channel at a time. A single "write my launch" prompt produces three drafts in one voice, which is the exact failure this skill exists to prevent.
4. Always ask for the **first comment** alongside the submission — for both HN and PH. The submission gets the click; the first comment does the converting.
5. Paste your own draft in and ask: *"Which rule does this break, and where does this get flagged?"* Blunt review is the highest-value mode here.
6. Reject any output with: an emoji in an HN title, "excited to announce," a request for upvotes, or a competitor comparison you win outright. Ask for the concession version instead.
7. Bring the objections back afterwards. Paste the thread in and ask for the three complaints ranked by frequency — that's your next two weeks of work.

## 6. Example Output

Prompt with this skill loaded: *"Launching Coldline — a CLI that detects and kills cold starts in serverless functions by pre-warming based on your real traffic pattern. Free CLI, $12/mo hosted. I'm in Mumbai (IST). HN account is 4 years old with ~2k karma. No Reddit history anywhere relevant. Give me the plan."*

---

**Pre-mortem — three things that kill this:**

1. **Your timezone.** If you post to PH at a civilised hour in Mumbai, you're posting at 7:30pm Pacific into a race that's 80% over. **Launch window: 12:30pm–2:00pm IST**, which is 00:00–01:30 PT. Yes, that's your lunch. Block the whole afternoon and evening.
2. **"Just use provisioned concurrency."** This is the top comment. It's coming. If you don't have a sharp answer about cost-vs-coverage, the thread ends there.
3. **Reddit is off the table.** No history in the relevant subs means automod removes you before a human reads it. Don't burn the account. Post there in eight weeks, as a participant, if at all.

**Run of show (IST):**

| Time | Action |
|---|---|
| 12:30 | Submit to Product Hunt. Maker's first comment within 60 seconds. |
| 12:35–14:00 | Reply to every PH comment. Nothing else. |
| 14:00 | Submit Show HN (≈00:30 PT — front page is thin, decent odds). |
| 14:01 | Your first comment on the HN thread. Non-negotiable. |
| 14:00–22:00 | Both threads. No meetings. No deploys. Phone on. |
| 22:00 | Write down every objection you heard. Sort by frequency. |
| Day +2 | Reply to overnight comments. Ship the top complaint if it's small. |
| Day +7 | Return to both threads: "fixed the thing you flagged." |

**Show HN title, five options:**

1. `Show HN: Coldline – kill Lambda cold starts using your real traffic pattern` ← ship this
2. `Show HN: Coldline – pre-warm serverless functions from actual invocation logs`
3. `Show HN: I cut our p99 from 2.4s to 180ms by pre-warming on traffic shape`
4. `Show HN: Coldline – provisioned concurrency without paying for 24 idle hours`
5. `Show HN: Coldline – serverless cold start elimination` ← too vague, don't

**Your first HN comment:**

> Our checkout Lambda ran ~40 invocations a day, all clustered between 09:00 and 11:00 local. Cold start was 2.4s of a 2.6s p99, and the first customer of the morning got all of it. Provisioned concurrency fixed it — for about $34/mo to keep capacity warm across 24 hours we used two of.
>
> Coldline reads your CloudWatch invocation history, finds the shape (in our case: a weekday bump, dead by noon, nothing on Sunday), and schedules warming only over the live windows. Ours dropped to ~$3/mo for the same p99. It's an EventBridge rule and a ping — nothing clever. The value is in the pattern detection, which is where the code is.
>
> Where it doesn't help: steady high traffic (you're never cold — don't buy this), anything with a >250ms init where warming only masks the problem, and genuinely spiky unpredictable load, where it guesses wrong and you've paid for nothing. It's AWS-only today.
>
> CLI is MIT and works standalone: `npx coldline analyze <fn-name>` prints the pattern and the schedule without sending me anything. Repo: <link>. Tell me where the detection is wrong — I'd rather know.

**Prepared reply — "just use provisioned concurrency":**

> Yep, and if your traffic's flat you should — this buys you nothing there. The case it addresses is bursty low-volume: we were paying for 24h of warm capacity for a 2-hour window. Same p99, ~10x less spend. It's not a better mechanism, it's the same mechanism on a schedule.

**PH tagline (60 chars):** `Kill cold starts on the hours you actually get traffic`

**PH gallery order:** (1) terminal screenshot of `coldline analyze` printing a real detected pattern with the schedule, (2) 40s silent recording of install→analyze→apply, (3) the p99 before/after graph with the axis labelled and the date visible.

**[NEEDS: your real before/after p99 and the actual monthly bill delta. The 2.4s→180ms and $34→$3 above are placeholders from your prompt — if those aren't measured, cut them. A fabricated benchmark in a Show HN thread gets found within the hour, and that's the only thing anyone will remember.]**

---

Markers of skill-compliant output: the timezone error is caught before any copy is written and converted into a specific IST launch window; Reddit is removed from the plan for lack of standing rather than included for completeness; the HN title is lowercase, job-shaped, and emoji-free while the PH tagline is warmer without becoming an adjective; the first comment leads with the itch, states the mechanism plainly, and spends a full paragraph on where the tool *doesn't* help — pre-empting the top comment; the predicted objection has a prepared reply that concedes the main point instead of fighting it; the run of show blocks eight continuous hours of thread duty and forbids deploys; and every number the founder didn't prove is flagged as a placeholder to cut rather than a claim to ship.
