# Skill Exchange — Build Plan for Claude Code

**Owner:** Mohan (tapdot.org, solo indie developer, Mumbai)
**Domain:** skillexchange.tapdot.org (production) · skillexchangeqa.tapdot.org (QA)
**Infra:** AWS (same account as LaunchPad and PeerReview)
**Design reference:** `skill-exchange.jsx` — the finalized React prototype artifact. Match its visual system, copy, and page behavior exactly. Do not redesign; implement.

---

## 1. Product Summary

Skill Exchange is a marketplace for reusable AI workflow skill files (SKILL.md-style documents). Sellers publish skills — instruction files that teach an AI assistant a specific workflow (PDF generation, Chrome extension scaffolding, copywriting, etc.). Buyers browse, purchase (or download free), rate, and review. Every skill must ship with an enforced proof-of-concept: a real project URL + screenshot showing the skill in actual use.

**Elevator pitch:** "The GitHub for AI skills."
**Hero tagline:** "Where AI builders share their edge."
**Secondary tagline:** "The GitHub for AI skills — buy and sell reusable skills that power real products."

### Core principles (non-negotiable)
- One-time payments only. No subscriptions, no Pro/Studio tiers.
- 10% platform commission on paid sales. Sellers keep 90%.
- Proof of concept (project URL + screenshot) is **mandatory** at publish time — never optional.
- Marketplace, Leaderboard, Create a Skill, and Get Verified pages are browsable **without an account**. Sign-in is required only to buy, publish, review, or apply for verification.
- AI-platform-agnostic: skills can target Claude, ChatGPT, Gemini, Cursor, or Copilot — not Claude-exclusive.
- Verification is manual, performed by the founder via a superadmin tool. No automated approval.

---

## 2. AWS Architecture

This runs on the same AWS account as LaunchPad and PeerReview — do not introduce Cloudflare, Vercel, or other providers.

| Layer | Service | Notes |
|---|---|---|
| Frontend hosting | **AWS Amplify Hosting** | Git-connected CI/CD from GitHub. Two Amplify environments: `main` → prod domain, `qa` branch → QA domain. |
| Compute / API | **AWS Lambda + API Gateway** | REST endpoints for skills, purchases, reviews, verification, badge computation. |
| Database | **Amazon DynamoDB** | Single-table design. Chosen over RDS to stay on DynamoDB's *permanent* free tier (25GB storage, 25 RCU/WCU) rather than RDS's 12-month-then-billed free tier — matches the "spend as little as possible, aim to break even" constraint. |
| File storage | **Amazon S3** | Stores uploaded SKILL.md files and proof-of-concept screenshots. |
| CDN | **Amazon CloudFront** | In front of S3 for fast global delivery of skill files/screenshots, and in front of Amplify if custom caching is needed. |
| Auth | **Amazon Cognito** | Google OAuth federation + email/password. Cognito's free tier (50,000 MAUs) is ongoing, not time-limited — good fit here. Enforces unique, permanent usernames via a Cognito custom attribute + a uniqueness check Lambda (see §5). |
| Scheduled jobs | **Amazon EventBridge Scheduler → Lambda** | Nightly job recomputes skill badges (#1 in Category, Top Rated, Most Downloaded, New & Notable) and seller leaderboard ranks. |
| DNS | **GoDaddy** (existing) | CNAME/ALIAS records pointing `skillexchange.tapdot.org` and `skillexchangeqa.tapdot.org` at their respective CloudFront/Amplify distributions. No DNS migration. |
| Payments | **Stripe Connect** (pending approval) with **Razorpay** as launch fallback | A Lambda function behind API Gateway handles the payment webhook, writes the purchase record, and increments the skill's download count. |
| Monitoring | **CloudWatch Logs** | Standard Lambda logging. |

### Why not Cloudflare
tapdot's other products (LaunchPad, PeerReview, tools.tapdot.org) already run on this AWS account. Skill Exchange should consolidate onto the same infrastructure rather than introducing a second cloud provider — one bill, one place to monitor, one set of credentials to manage as a solo operator.

---

## 3. Data Model (DynamoDB single-table design)

Table name: `SkillExchange`

| PK | SK | Entity | Notes |
|---|---|---|---|
| `USER#<userId>` | `PROFILE` | User profile | username, email, bio, location, isVerified, createdAt |
| `USER#<userId>` | `BADGE#<badgeType>` | Seller badge | verified_creator \| top_seller, awardedAt |
| `SKILL#<skillId>` | `META` | Skill listing | title, category, description, usageInstructions, priceCents, platforms[], pocUrl, pocScreenshotKey, skillFileKey, status, timeSavedHours, downloadsCount, rating, createdAt, sellerId |
| `SKILL#<skillId>` | `REVIEW#<reviewId>` | Review | buyerId, rating, text, createdAt |
| `PURCHASE#<purchaseId>` | `META` | Purchase record | skillId, buyerId, amountCents, commissionCents, provider, providerPaymentId, purchasedAt |
| `VERIFY#<applicationId>` | `META` | Verification application | userId, skillUrl, note, status, submittedAt, reviewedAt |

**Global Secondary Indexes (GSIs):**
- `GSI1`: `category` (PK) + `downloadsCount` (SK) — for "Most Downloaded" and category browse/sort
- `GSI2`: `sellerId` (PK) + `createdAt` (SK) — for "My Skills" on a profile
- `GSI3`: `buyerId` (PK) + `purchasedAt` (SK) — for "My Library"
- `GSI4`: `status` (PK) + `submittedAt` (SK) on verification applications — for the superadmin review queue

Skill badges (#1 in Category, Top Rated, Most Downloaded, New & Notable) and the leaderboard (Top Builders, Top Skills) are **computed by the nightly EventBridge/Lambda job**, not stored as user-editable fields — they're always derived from `downloadsCount`, `rating`, and category ranking at the time of the last run.

---

## 4. Pages (match `skill-exchange.jsx` exactly)

| Page | Auth required? | Notes |
|---|---|---|
| Home | No | Hero, stats bar, featured skills, categories, top-3 builder snippet |
| Marketplace | No | Search, category (searchable dropdown), platform, price, verified filters, sort |
| Skill Detail | No to view, yes to buy | POC section, "how to use," reviews, sidebar buy/download |
| Create a Skill | No | Platform-specific prompt generator, fully client-side, no backend calls needed |
| Publish a Skill | **Yes** | 3-step form: Details → Proof of Concept → Pricing |
| Leaderboard | No | Tabs: Top Builders / Top Skills, both all-time only |
| Get Verified | No to view, yes to apply | Progress stepper, application form |
| My Library | **Yes** | Purchased + free-downloaded skills |
| My Profile | **Yes** | Stats, published skills, Get Verified CTA, Account/logout modal |
| Public Profile | No | Any seller's public page, reached via skill card / leaderboard clicks |

Mobile nav collapses to a hamburger + dropdown panel below 760px, matching the prototype.

---

## 5. Auth Flow (Cognito)

1. Google OAuth federation configured in a Cognito User Pool, plus native email/password sign-up.
2. On sign-up, the user chooses a username. Before completing registration, a Lambda (`checkUsernameUnique`) queries `GSI` on username to confirm availability — Cognito's built-in uniqueness is on email/sub, not on the custom username attribute, so this must be enforced at the application layer.
3. Username is immutable once set — no rename endpoint.
4. Session handled via Cognito Hosted UI or Amplify Auth SDK (React) — whichever integrates more cleanly with the existing Vite setup; Amplify Auth SDK is likely simpler given Amplify Hosting is already in use.

---

## 6. Payments Flow

1. Seller sets price (free or paid) at publish time.
2. Buyer clicks "Buy" → Stripe Connect checkout (or Razorpay checkout if Stripe Connect isn't yet approved) → on success, provider webhook hits an API Gateway endpoint → Lambda writes a `PURCHASE` record and increments `downloadsCount` on the skill.
3. Commission (10%) is calculated and **stored per transaction** at the time of purchase — not recalculated later — so historical commission rates remain accurate even if the platform rate changes in the future.
4. Seller payouts: Stripe Connect (once approved) or Razorpay Route, per the earlier payment provider decision. Track this as a follow-up item — do not block launch on Stripe approval; ship with Razorpay first.

---

## 7. QA / Production Pipeline

- Two Amplify environments from the same repo: `qa` branch → `skillexchangeqa.tapdot.org`, `main` branch → `skillexchange.tapdot.org`.
- Two separate DynamoDB tables (`SkillExchange-qa`, `SkillExchange-prod`) and two S3 buckets, selected via an environment variable — never a shared table between environments.
- QA is protected by a **static superadmin username/password** (hardcoded check in a Lambda authorizer, not a Cognito user) — this is the account used to pre-populate QA with hundreds of dummy skills/users/reviews for regression testing.
- Superadmin tool (QA-only, or a protected route in prod for the founder) can: approve/reject/flag skills, manually grant/revoke the Verified Creator and Top Seller badges, view the verification application queue, and trigger the nightly badge-computation job on demand.
- CI: push to `qa` → Amplify auto-deploys QA → GitHub Actions runs a nightly Playwright regression suite against the QA URL → on green, promote to `main` → Amplify auto-deploys prod.
- **The two environments must be pixel-identical in UI/UX.** Only the data source differs. Never diverge design between QA and prod.

---

## 8. Cold Start Content

Seed the marketplace with real skills before public launch — no fabricated proof of concept:

- PDF Generation Skill (tools.tapdot.org)
- Chrome Extension MV3 Skill (CommentIQ)
- On-device AI / Gemini Nano Skill (CommentIQ)
- Writing Tools Skill (Quill)
- Node Graph UI Skill (LaunchPad)
- Electron Desktop App Skill (tools.tapdot.org)
- Cloudflare KV Prompts Skill (LaunchPad) — *note: this skill's content describes a Cloudflare technique even though Skill Exchange itself runs on AWS; that's fine, the skill is about the technique, not about Skill Exchange's own infra*
- GitHub Pages Deploy Skill (older tapdot products)
- React Anti-patterns Skill (from the ebook's bonus SKILL.md)

Additional seed accounts (5-8 skills each) to be generated separately with real GitHub repos as proof of concept, covering Coding, Design, Marketing, and Data categories.

---

## 9. Build Phases

1. **Foundation** — Cognito user pool + Amplify Hosting + DynamoDB table + GSIs provisioned. Auth flow working end-to-end (sign up, sign in, unique username enforcement).
2. **Skill CRUD** — Publish flow (3-step form → S3 upload for SKILL.md + screenshot → DynamoDB write with `status: pending`). Skill Detail page reading real data.
3. **Marketplace & Search** — Browse, filter, sort, category dropdown, all wired to GSI queries instead of the static array in the prototype.
4. **Payments** — Razorpay checkout integrated first; purchase records; My Library populated from real purchases.
5. **Reviews & Ratings** — Post-purchase review flow; skill rating aggregation.
6. **Badges & Leaderboard** — Nightly EventBridge/Lambda job computing skill badges and the two leaderboard views.
7. **Verification Workflow** — Application form → superadmin queue → manual approval → badge grant.
8. **QA/Prod Pipeline** — Second Amplify environment, second DynamoDB table, nightly regression suite, superadmin QA login.
9. **Stripe Connect Migration** — Once Stripe Connect India approval comes through, swap it in as the primary payment provider, migrating existing purchase records without changing the underlying marketplace logic.

---

## 10. Explicit Non-Goals for v1

- No chat/messaging between buyer and seller (ratings + reviews only, no WebSocket infra).
- No subscription tiers.
- No community-validated "time saved" (v1 is seller-declared estimate only, clearly labeled "seller estimate" in the UI).
- No business/enterprise tier for PeerReview-style B2B expansion — that's a deliberately deferred idea, not part of this build.
