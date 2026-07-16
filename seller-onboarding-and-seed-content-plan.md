# Skill Exchange — Seller Onboarding + Seed Content Plan

Handoff doc for Claude Code. Builds on CLAUDE.md — same AWS stack, same data model conventions.

---

## Part 1: Invite-Only Seller Onboarding

### New page: `/become-a-seller`
Reachable from a "Want to sell?" card on My Profile, and a banner/link on the Marketplace page. Requires sign-in to submit (browsing stays public).

**Form fields:**
- Country of residence
- One-line pitch — what do you want to sell? (quality/intent filter, not a real listing yet)
- Payment method preference — free text (e.g. "UPI," "Wise account," "bank transfer") — not a rigid form, just enough for you to know how to pay them later
- Category interest (multi-select from existing CATEGORIES list)

**On submit:** status set to `pending`. Confirmation screen: *"Thanks — we review applications personally. We'll email you when there's a spot open."*

### Data model addition (DynamoDB, same table as CLAUDE.md §3)

Add to `USER#<userId>` / `PROFILE` item:
```
sellerStatus: "none" | "pending" | "approved" | "waitlisted"
sellerAppliedAt: timestamp
sellerReviewedAt: timestamp
sellerCountry: string
sellerPitch: string
sellerPayoutMethod: string (free text)
sellerCategories: string[]
```

### Gating logic
- "Publish a Skill" nav item / button only renders if `sellerStatus === "approved"`
- `pending` or `waitlisted` users see: *"You're on the waitlist — we'll notify you when a spot opens"* instead of the publish form
- Free skill downloading, buying, browsing — all unaffected, no gating there

### Superadmin review queue
Add to the existing superadmin tool (per CLAUDE.md §7):
- List of `pending` applications — pitch, country, categories requested
- One-click **Approve** or **Waitlist** — updates `sellerStatus` and `sellerReviewedAt`
- Approving triggers an email: *"You're approved! Here's how to publish your first skill."*

### Build order
1. `/become-a-seller` page + form + DynamoDB write
2. Gate the existing Publish flow behind `sellerStatus === "approved"`
3. Superadmin queue view + approve/waitlist action
4. Approval email trigger

---

## Part 2: Four House Seller Profiles

All four are **real, transparently-labeled seller accounts** — not hidden aliases. Each profile bio states plainly what it is. This matters: buyers should never wonder if these are independent third parties pretending to be something else.

Each gets approved as a seller immediately (you're the superadmin) and publishes real skills with real proof of concept from tapdot's actual shipped products.

### Profile: `launchpad`
**Bio:** *"LaunchPad is tapdot's multi-channel launch content generator. These are real patterns from building it."*
**POC:** launch.tapdot.org

Skill ideas:
- **Multi-Channel Launch Copy Skill** (Marketing) — generating platform-native launch posts (HN, PH, X, Reddit, app stores) from one brief, each respecting real character limits and tone
- **Node Graph UI Skill** (Design) — building a visual node-based builder UI with React Flow (@xyflow/react)
- **Prompts-in-KV Skill** (DevOps) — storing AI prompts in Cloudflare KV so behavior updates ship without a code release

### Profile: `peerreview`
**Bio:** *"PeerReview is tapdot's review exchange for indie developers. These skills come from building its trust and verification system."*
**POC:** peerreview.tapdot.org

Skill ideas:
- **Trust Score / Reputation System Skill** (Data) — designing a reputation scoring system resistant to gaming
- **Verified Review Lifecycle Skill** (Testing) — state machine pattern for Submitted → Pending → Verified/Flagged workflows
- **Stamp-In Micro-interaction Skill** (Design) — the seal/stamp animation pattern in Framer Motion

### Profile: `tapdot`
**Bio:** *"tapdot is the parent studio behind LaunchPad, PeerReview, CommentIQ, Quill, and this marketplace. These are cross-product patterns we reuse everywhere."*
**POC:** tapdot.org or tools.tapdot.org

Skill ideas:
- **Privacy-by-Architecture Skill** (Coding) — local-first, no-accounts, zero-server-data design pattern
- **Electron Desktop Packaging Skill** (Desktop) — electron-builder + electron-updater + GitHub Releases auto-update
- **Chrome Extension MV3 Skill** (Extension) — service worker patterns, offscreen docs, on-device AI
- **GitHub Pages + Cloudflare Deploy Skill** (DevOps) — the deploy pipeline used across older tapdot products

### Profile: `mohan` (you, personally)
**Bio:** your real founder bio — solo indie dev, Mumbai, building tapdot
**POC:** whichever product fits each specific skill

Skill ideas:
- **PDF Generation Skill** (Document) — already planned in CLAUDE.md cold-start list
- **React Anti-patterns Skill** (Coding) — from the ebook's bonus SKILL.md
- **Payment Architecture Decision Skill** (Other) — genuinely unique: a skill teaching how to evaluate Stripe/Razorpay/Dodo/Tazapay tradeoffs for a marketplace, informed by everything we just worked through this conversation
- **Design System (Charcoal/Gold/Ivory) Skill** (Design) — the actual Skill Exchange visual system as a reusable pattern

### Quality bar for every seed skill
Match the standard real sellers will be held to:
- Real proof-of-concept URL (a live tapdot product) + real screenshot
- Honest "How to use this skill" section
- Honest time-saved estimate — don't inflate it just because it's a seed listing
- Spread across categories so the marketplace doesn't look Coding-only

### Build order for Part 2
1. Create the four profiles (approve as sellers via superadmin)
2. Write and publish 3-4 skills per alias — 12-16 real seed skills total
3. Spread launch across a few days rather than all at once, so the marketplace doesn't look artificially populated overnight
