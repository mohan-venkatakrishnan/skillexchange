---
title: Onboarding Email Sequences That Get Read Skill
category: Marketing
description: Design a signup-to-activation email sequence around what the user did rather than how many days elapsed — behaviour-triggered branches, one job per send, and plain-text-shaped copy that survives a developer's inbox. Prevents the sequence every SaaS ships first: five timed emails congratulating a user on progress they never made, sent from noreply@, straight into Promotions.
usage: Load this skill with your product's activation moment (the single thing a user must do to get value) and the events you can actually detect. Ask it to map the sequence before writing any copy — it branches on behaviour, and a sequence designed without your event list is fiction. Then request individual emails, one at a time, and hand it your real onboarding drop-off numbers if you have them.
platforms: [Claude, ChatGPT]
priceUsd: 5
timeSavedHours: 14
pocUrl: https://github.com/mjmlio/mjml
---

# Onboarding Email Sequences That Get Read Skill

## 1. Philosophy

The onboarding sequence has exactly one job: get a signed-up stranger to the moment where your product visibly works for them. Every email that doesn't move someone toward that moment is a withdrawal from an account you cannot refill.

1. **Behaviour beats the calendar.** "Day 3" is not a fact about your user. "Created a project but never invited anyone" is. A sequence that fires on elapsed time will, reliably, congratulate someone on a milestone they didn't hit — and that email is where they unsubscribe.
2. **Name the activation moment, then delete everything that doesn't serve it.** For a webhook proxy: *received one real inbound event*. Not "completed profile," not "read the docs." One event, one moment. If you can't state yours in six words you can't write the sequence.
3. **One email, one job, one link.** Two CTAs halve each other. The email with a primary button, a secondary link, a P.S. offer and a footer of social icons is an email that produced no action at all.
4. **For developers, write it like a person typed it.** No hero image, no three-column layout, no gradient button. A short plain message from a real address with a real name outperforms the designed template — reliably, and by a lot — because it looks like mail rather than marketing.
5. **The sequence has an exit.** When the user activates, it stops. A user who set up the thing on Tuesday should not receive "still need help getting set up?" on Thursday. That email tells them nobody's paying attention.
6. **Every send costs trust.** You have maybe six emails of goodwill before the reputation flips from "useful" to "noise," and it never flips back. Spend them like they're finite, because they are.

## 2. Tech Stack

Mostly craft; the tooling is thin and swappable.

- **MJML** — https://github.com/mjmlio/mjml — licensed **MIT**. A markup language that compiles to the table-based HTML email clients actually render. Relevant here mainly for the opinion below: for a developer-tool onboarding sequence you probably shouldn't use it, or any templating language, because your best-performing emails are plain text. Use it for the one email that genuinely needs layout — a receipt, a monthly digest. This skill is an independent, original guide; it is not affiliated with or endorsed by the MJML maintainers.
- **Any transactional sender** — Postmark, Resend, SES, Mailgun. This skill is provider-agnostic. Two things matter: it must send on an event from your backend, and it must separate transactional from marketing streams so a broadcast complaint can't poison your password resets.
- **Your event stream** — whatever you already have. A `events` table with `(user_id, name, ts)` is sufficient. The sequence's quality is capped by the resolution of this list; that is the real constraint, not the copy.
- **Authentication** — SPF, DKIM, DMARC. Not optional and not this skill's subject. If they're not configured, stop reading and go configure them; nothing below matters if you're landing in spam.

All example copy, sequences, and numbers in this file are original to this skill and written for fictional products. No third party's emails are reproduced.

## 3. Patterns

### 3.1 Write the activation moment on the wall first

Before any email exists, one sentence: **"A user is activated when they ___."**

| Product | Weak (a proxy) | Real activation moment |
|---|---|---|
| Webhook replay proxy | Signed up | Received one real inbound event |
| API spec differ | Installed the CLI | Ran a diff that returned a breaking change |
| Cold-start tool | Connected AWS | Saw their own traffic pattern rendered |
| Team analytics | Invited a teammate | Two people viewed the same dashboard in a week |

The left column is what's easy to instrument. The right column is what predicts retention. Every email in the sequence is judged against the right column, and any email that doesn't move someone toward it is cut, no matter how good it is.

Then: **what's the median time to activation, and where do people stall?** Usually a funnel like `signup 100 → installed 41 → connected 22 → first event 14`. That 41→22 cliff is the entire sequence. You're not writing "an onboarding," you're writing to the nineteen people stuck at "installed."

### 3.2 Branch on state, not on days

The timed sequence is the default and it's the reason nobody reads these:

```
Day 0: Welcome!
Day 1: Here are our top features
Day 3: Tips and tricks
Day 5: Case study
Day 7: Your trial is ending
```

Day 3's "tips and tricks" fires at the person who set everything up in nine minutes on day zero and at the person who never opened the app. Both find it useless. One of them finds it insulting.

The behavioural version:

```
signup
  └─ Email 1 (instant): the one next step
       │
       ├─ did `installed` within 48h? ──→ Email 2a: the second step
       │                                    └─ did `first_event`? ──→ EXIT (activated)
       │                                    └─ 72h silence? ──→ Email 3a: the specific blocker
       │
       └─ no `installed` after 48h? ──→ Email 2b: "did the install fail?"
                                          └─ still nothing at 6d? ──→ Email 3b: the exit email
```

Two branches, three emails maximum on any path. Every branch terminates — in activation, or in a graceful last message. Nobody sits in a loop.

**The mandatory rule:** on `activated`, the user leaves the sequence immediately. There is no worse email than "need help getting started?" arriving twelve hours after someone got it working. It reveals that the warmth was automated, and everything you've sent gets retroactively re-read as a machine talking.

### 3.3 The first email: 60 seconds after signup, one step, no welcome

The highest open rate you will ever get is here, and most products spend it on a welcome mat.

**Before** (the one everyone ships):

> **Welcome to Relayd! 🎉**
> We're thrilled to have you on board. Relayd is the modern platform for reliable webhook delivery, trusted by teams who care about their event infrastructure.
> Here's what you can do:
> • Capture webhooks automatically
> • Replay failed events
> • Monitor your delivery health
> [Explore the Dashboard] [Read the Docs] [Join our Discord]
> — The Relayd Team

Every failure in one artifact: it congratulates them for existing, restates the marketing they already read, lists three features with no verbs, offers three CTAs so it offers none, and signs off from a collective noun.

**After:**

> Subject: `your relayd endpoint is live`
>
> Your capture URL: `https://in.relayd.dev/e/8fk2n1`
>
> Point one webhook at it — Stripe test mode is the fastest, takes about 40 seconds — and it'll show up at https://app.relayd.dev/events in real time. That's the whole thing; if you see an event land, it's working.
>
> If nothing shows up in five minutes it's almost always the sender retrying against your *old* URL. Reply to this and I'll look at it with you — this email comes to me directly.
>
> — Mohan
> (I built Relayd. Genuinely reply if it's broken.)

What changed: the subject is lowercase and specific, so it reads as system mail rather than campaign mail. The credential is in the body — no click required to get value. One action. The likeliest failure is pre-empted. It's from a person, at a repliable address. There is no logo, no button, no footer.

**Reply-to is not a formality.** A reply-to that reaches you converts more than any CTA in the email, because the person replying is the person who was about to churn and instead told you why.

### 3.4 Subject lines that survive a developer inbox

Developers have trained filters. The register that works is *system notification*, not campaign.

| Kills the open | Gets the open |
|---|---|
| `Welcome to Relayd! 🎉` | `your relayd endpoint is live` |
| `5 Tips to Get the Most Out of Relayd` | `the capture URL only works with the raw body` |
| `Don't miss out — your trial ends soon!` | `your trial ends friday — here's your data either way` |
| `We noticed you haven't finished setting up` | `did the install fail?` |

The pattern: lowercase, under about 45 characters, no emoji, no exclamation mark, and it describes a *fact* rather than a feeling. `did the install fail?` outperforms every clever alternative because it's the actual question, it's answerable, and it's obviously from someone who noticed.

Never fake a personal thread: `Re:` on an email that has no thread, or `quick question` from a marketing automation, is a trick your audience recognises instantly. It works exactly once and costs the relationship.

### 3.5 The stall email: name the blocker, don't ask about feelings

Someone installed and stopped. The default is "just checking in!" — which is a request for emotional labour from a stranger.

Instead, guess the blocker specifically. You know where the funnel breaks; say the thing:

> Subject: `the signature check, probably`
>
> You installed relayd four days ago and no events have landed, which is almost always one of two things:
>
> 1. Your framework parsed the body before our middleware saw it. Express does this by default with `express.json()` — the raw bytes are gone by then and the signature can't be verified. Fix is one line, it's here: <link to the exact anchor>
> 2. You're pointing at the capture URL but your sender still has the old endpoint registered, so we never see the event.
>
> If it's neither, reply with the sender and I'll tell you what we're seeing on our side — I can look at the raw ingest log.
>
> — Mohan

This is a support email that happens to be automated. It's specific enough that it's *sometimes wrong*, which is fine — being wrong specifically still proves someone looked. "Just checking in" is never wrong and never useful.

### 3.6 The exit email: ask one question, then actually leave

Last email on the dead branch. Its job is not to convert. It's to (a) leave cleanly and (b) buy you the most valuable sentence in your business.

> Subject: `turning these off`
>
> You signed up for relayd two weeks ago and never got an event through, so I'm going to stop emailing you — this is the last one.
>
> If you've got ten seconds: what stopped you? One word is genuinely useful. "docs", "price", "didn't need it", "broke" — any of those tells me something.
>
> The capture URL stays live for 90 days if you come back to it. No account cleanup needed.
>
> — Mohan

Reply rates here are astonishing relative to anything else in the sequence, because you asked one question, gave permission to be blunt, and the person has nothing to lose. Ten one-word replies is a better roadmap than a month of analytics.

And then **actually stop**. If you send another email after "this is the last one," everything you've written becomes a lie retroactively.

### 3.7 What to measure, and what to ignore

- **Open rate: mostly noise now.** Privacy proxies pre-fetch images and inflate opens; a plain-text email with no tracking pixel can't report an open at all. Directionally useful, never a KPI.
- **Reply rate: the real one.** Nobody games it, and every reply is a human telling you something.
- **Activation rate by branch:** of people who got the "did the install fail?" branch, how many activated within seven days? Against a holdout that got nothing. That's the only number that says whether the sequence exists for a reason.
- **Unsubscribe *and* complaint rate.** Unsubscribe is honest feedback. A complaint (spam button) is reputation damage that lands on your password resets too — which is why transactional and marketing must be separate streams.
- **The holdout.** 10% of signups get no sequence at all. Ever. Without it you cannot distinguish "the emails worked" from "people who sign up tend to activate." Most teams never run one, and consequently never know whether their sequence does anything.

## 4. Anti-patterns

- **The day-N drip.** Fires "how's it going?" at a user who activated in nine minutes and at one who never opened the app. Both learn the emails aren't about them.
- **Not exiting on activation.** "Still stuck?" arriving after success. The single most trust-destroying email in SaaS, and it's a one-line fix.
- **`noreply@`.** You spent the subject line earning attention and then announced you won't listen. It also correlates with worse deliverability, because real conversation is a positive signal.
- **Welcome email with no next step.** Highest open rate of the entire sequence, spent restating the homepage. There is no second chance at that open.
- **Three CTAs.** Primary button, secondary link, P.S. offer. Result: zero clicks, because the reader hit a decision and resolved it by closing.
- **The designed HTML template for a developer product.** Hero image, gradient button, three-column feature row. It reads as a campaign, lands in Promotions, and gets filtered by an inbox rule the recipient wrote in 2019.
- **"We noticed you haven't..."** Surveillance framing with no useful content. If you noticed, say what you noticed and what to do about it.
- **Sending marketing on the transactional stream.** One complaint on a "tips" email and your password resets start landing in spam. Separate the streams before anything else.
- **A sequence with no holdout.** You'll report a 34% activation rate and have no idea if it's the emails or the product.
- **Optimising for open rate.** Pixel-based, inflated by proxies, absent on plain text. Chasing it pushes you toward clickbait subjects, which is how you lose the inbox.
- **"Just checking in!"** Zero information, asks the recipient to do the work. Guess the blocker and be wrong; it's strictly better.
- **Never ending.** The sequence with no terminal email is a subscription the user didn't request.

## 5. Usage

1. Load this skill and lead with the two facts it can't infer: your **activation moment** in one sentence, and the **events you can actually detect** (names, verbatim). A sequence designed without your event list is a nice document you can't build.
2. Give it the funnel numbers if you have them — `signup 100 → installed 41 → connected 22 → first event 14`. The sequence is written to the biggest cliff, and without the numbers it will guess at which one that is.
3. Ask for the **branch map before any copy**. A flow diagram with exit conditions on every branch. If you can't see the exits, the copy doesn't matter yet.
4. Then request emails one at a time, with the branch state named: *"Email 2b — installed the CLI four days ago, zero events. They're an Express user."*
5. Reject anything with: `noreply@`, an emoji subject, more than one CTA, a hero image, "we noticed you haven't," or a branch with no terminal email. Ask for a re-derive against section 4.
6. Have it write the **exit email first**. It's the one that generates real information, it's the one everyone omits, and writing it early forces you to decide what "gave up" actually means.
7. Ask explicitly: *"which of these should I not send?"* A three-email sequence that exits properly beats a seven-email one, and the skill should be willing to cut its own drafts.

## 6. Example Output

Prompt with this skill loaded: *"Schemafold — CLI that diffs OpenAPI specs and flags breaking changes. Free CLI, $9/mo GitHub Action. Events I can detect: `signup`, `cli_first_run`, `diff_returned_breaking`, `action_installed`, `action_ran_on_pr`. Funnel: 100 signup → 38 cli_first_run → 11 diff_returned_breaking → 6 action_installed. Design it."*

---

**Activation moment: `diff_returned_breaking`.** Not the install — running the CLI proves nothing. The moment Schemafold tells someone their PR breaks a client, they've *seen it work on their own API*. That's the moment. Everything targets it.

**Your cliff is 38 → 11.** Two-thirds of people who ran the CLI never got a breaking change back. Two possible readings and they need completely different emails: either their specs genuinely have no breaks (great — wrong moment to sell them, they're not in pain), or they ran it once on a toy file and left. **[NEEDS: of the 38, how many ran a diff twice? That single number decides whether email 2a is a nudge or a celebration.]**

**Branch map:**

```
signup
 └─ E1 (instant): the one command
     │
     ├─ cli_first_run within 72h
     │    ├─ diff_returned_breaking ──→ E2a: "here's why that one's breaking"
     │    │      └─ action_installed ──→ EXIT (activated + converted)
     │    │      └─ 5d silence ──→ E3a: the Action, once, then EXIT
     │    └─ no break in 5d ──→ E2b: "run it against a real merged PR"
     │           └─ 7d silence ──→ EXIT (quiet, no email — they're fine)
     │
     └─ no cli_first_run at 72h ──→ E2c: "did it error?"
            └─ 6d silence ──→ E3c: exit email
```

Note the branch that exits **silently**. Someone whose specs have no breaking changes doesn't need me in their inbox. There's no email that improves that situation, so there isn't one.

**E1 — instant, all users:**

> Subject: `one command`
>
> ```
> npx schemafold <old-spec> <new-spec>
> ```
>
> Best first target: your last merged PR that touched the spec. `git show HEAD~1:openapi.yaml > /tmp/old.yaml` and diff it against the current one. Takes about a minute and it's the only way to know whether this is useful to you.
>
> Runs offline. Your spec doesn't leave the machine, no account needed for the CLI. OpenAPI 3.x only — a 2.0 spec errors rather than guessing.
>
> — Mohan (reply here, it reaches me)

**E2c — 72h, never ran it:**

> Subject: `did it error?`
>
> You grabbed Schemafold three days ago and it never ran, which is usually one of these:
>
> - **Node < 18.** `npx` resolves it but it dies on `structuredClone`. Sorry — 18+.
> - **OpenAPI 2.0 / Swagger.** Hard error, no fallback. Not supported and honestly might never be.
> - **Split specs with `$ref` across files.** Works, but you have to pass the entry file, not the directory. Common mistake, my fault for the error message.
>
> If it's none of those, reply with the error text and I'll look. If you just haven't got round to it, ignore me.
>
> — Mohan

**E2a — activated (a break was found). This is the conversion email and it's the only one that mentions money:**

> Subject: `that enum is the one that gets you`
>
> You got a breaking change back — so you've now seen the thing I built this for.
>
> Worth knowing which one bit me: narrowing `status: string` to an enum. Structurally additive, so a normal spec diff says it's fine. Every mobile client still sending the old value gets a 422. Took me nine days to find it because crash-free rate only moved 0.4%.
>
> The CLI catches it locally when you remember to run it. The GitHub Action catches it when you don't — posts the table as a PR comment and blocks the merge. $9/mo per repo, no seats, and the CLI stays free and unlimited regardless: <link>
>
> — Mohan

**E3c — exit:**

> Subject: `turning these off`
>
> This is the last one — you signed up for Schemafold a week ago and never got it running, so I'll stop.
>
> Ten seconds if you've got them: what stopped you? "node version", "wrong format", "didn't need it", "forgot" — one word helps me more than you'd think.
>
> Nothing to cancel. There's no account.
>
> — Mohan

**What I'd cut:** any "here's what else Schemafold does" email. There is no else. It diffs specs. A features email on a single-purpose CLI is filler and it costs you the next open.

**Holdout:** 10% of signups get none of this. In eight weeks compare `diff_returned_breaking` within 7 days, sequence vs holdout. If the gap is under a couple of points, the emails aren't the problem — the 38→11 cliff is a product problem and no subject line fixes it.

---

Markers of skill-compliant output: the activation moment is corrected from the instrumentable proxy (`cli_first_run`) to the one that predicts retention (`diff_returned_breaking`); the sequence is designed against the funnel's actual cliff rather than a generic day-N template; every branch terminates, one of them in deliberate silence because no email would help; the ambiguity in the data is raised as a `[NEEDS: ]` blocker instead of being papered over; subject lines are lowercase, sub-45-character statements of fact with no emoji; the stall email guesses three specific technical blockers rather than asking how it's going; money is mentioned in exactly one email, the one sent to a person who just watched the product work on their own API; the exit email asks a single question and promises to stop; a features email is proposed and then cut by the skill itself; and the holdout is specified up front, including what a null result would mean.
