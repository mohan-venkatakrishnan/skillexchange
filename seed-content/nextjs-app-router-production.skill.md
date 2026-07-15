---
title: Production Next.js App Router Skill
category: Coding
description: Build App Router applications that stay static where they should, stream where it matters, and never leak a secret into the client bundle. Covers the server/client boundary, the fetch cache and revalidation, Server Actions with Zod, streaming Suspense, middleware limits, and the dynamic-rendering traps that silently kill your cache hit rate.
usage: Load this skill before asking your AI assistant to scaffold or refactor any App Router route. Say "use the Production Next.js App Router skill" and describe the page or feature; the assistant will place the client boundary correctly, pick the right caching strategy, and flag anything that would force the route dynamic.
platforms: [Claude, Cursor, Copilot]
priceUsd: 7
timeSavedHours: 24
pocUrl: https://github.com/vercel/next.js
---

# Production Next.js App Router Skill

## 1. Philosophy

Most App Router code in the wild is Pages Router code in a different folder: `'use client'` at the top of `page.tsx`, a `useEffect` fetching from a route handler that queries the database, and a build output where every route is dynamic. That app pays for server rendering and gets none of it.

The mental model that actually works:

**Server Components are the default and the destination. Client Components are leaves you attach for interactivity.** Data goes down into the client boundary as props. Nothing comes back up except through Server Actions. If your tree is a client shell wrapping data fetched over HTTP, you rebuilt an SPA inside a framework that was trying to save you from one.

Three rules govern everything below:

1. **Push `use client` down, never up.** The directive is contagious downward: every module a Client Component imports joins the client bundle. One `'use client'` in a layout drags the whole subtree across the network. It belongs on the smallest component that owns a hook, an event handler, or browser state.
2. **Static until proven otherwise.** Every route starts statically renderable. Reading `cookies()`, `headers()`, or `searchParams` opts that route into dynamic rendering permanently. That must be a decision, not something you discover in a build table.
3. **The network boundary is a serialization boundary.** Props crossing into a Client Component must be serializable. A Date is fine; an ORM client, a class instance, or a plain function is a runtime error waiting for 2am.

## 2. Tech Stack

- **Next.js** — https://github.com/vercel/next.js — licensed **MIT**. Provides the App Router, Server Components, Server Actions, and the build pipeline. Examples target 14.2+ and 15.x; caching defaults changed between those majors and this skill says where.
- **React 18.3 / 19** — `Suspense`, `useOptimistic`, `useActionState` (renamed from `useFormState` in 19, which ships with Next 15).
- **Zod 3.23+** (MIT) for anything arriving as FormData, and **TypeScript 5.4+ strict** — non-negotiable when props cross a serialization boundary.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Next.js maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 The client boundary: leaf, not root

The version every tutorial produces — `'use client'` on the page, `useState` for the rows, a `useEffect` calling `/api/invoices` — ships the table, the formatter, and a fetch waterfall to the browser, then renders an empty shell first. The correct shape keeps the page on the server and isolates the one interactive piece:

```tsx
// app/dashboard/page.tsx — server component, no directive
export default async function Dashboard() {
  const invoices = await getInvoices()        // in-process, no HTTP hop
  return (
    <table><tbody>
      {invoices.map((inv) => (
        <tr key={inv.id}>
          <td>{inv.number}</td>
          <td>{formatMoney(inv.amountCents)}</td>
          <td><MarkPaidButton invoiceId={inv.id} /></td>   {/* the only client module */}
        </tr>
      ))}
    </tbody></table>
  )
}
```

Only `mark-paid-button.tsx` carries `'use client'`. The table, the formatter, and the query never reach the browser.

### 3.2 Composition: pass server content through client shells

When you genuinely need a client wrapper (tabs, accordion, drag container), do not let it swallow its subtree. Client Components can render server-rendered children when those children arrive as props:

```tsx
// app/settings/page.tsx — server
export default async function Settings() {
  return <Tabs billing={<BillingPanel />} team={<TeamPanel />} />
}
```

`Tabs` holds `useState` and renders `{billing}` or `{team}`. Because the elements were created in a Server Component, `BillingPanel`'s code — and its database import — never enter the client bundle. Highest-leverage pattern in the App Router; almost nobody uses it.

### 3.3 Data fetching and the fetch cache

Fetch in the component that needs the data. Do not prop-drill "to avoid duplicate requests" — React dedupes identical `fetch` calls within a render pass.

```tsx
// Next 14: cached by default. Next 15: uncached by default. State intent every time.
const res = await fetch(`${API}/plans`, { cache: 'force-cache', next: { revalidate: 3600, tags: ['plans'] } })
```

For non-`fetch` sources — Prisma, Drizzle, the AWS SDK — fetch caching does nothing. Wrap them:

```ts
export const getPublishedSkills = unstable_cache(
  async (category: string) => db.skill.findMany({ where: { category, status: 'live' } }),
  ['published-skills'],                       // a key PREFIX, not the whole key
  { revalidate: 300, tags: ['skills'] },
)
```

Two gotchas that cost real hours: arguments are serialized into the key for you, but **closed-over variables are not** — a cached function reading an outer-scope variable serves stale results across different values of it, so pass everything as an argument. And the callback cannot read `cookies()`/`headers()`, which is the point: an entry shared across users must not depend on one user's request.

### 3.4 Revalidation: tags for facts, paths for pages

```ts
'use server'
export async function publishSkill(id: string) {
  await db.skill.update({ where: { id }, data: { status: 'live' } })
  revalidateTag('skills')             // every entry tagged 'skills', anywhere
  revalidatePath(`/skills/${id}`)     // this specific rendered route
}
```

Tag the data, path the page. `revalidateTag` is the right default because it doesn't require knowing which routes read that data. `revalidatePath('/', 'layout')` demolishes everything and is what people reach for when their tags are wrong. Both are **no-ops outside a request context** — from a plain script they fail silently.

### 3.5 Dynamic vs static, and the cookies() trap

The bug that eats the most time in real App Router apps:

```tsx
// app/layout.tsx
export default async function RootLayout({ children }) {
  const theme = (await cookies()).get('theme')?.value ?? 'light'   // every route is now dynamic
  return <html data-theme={theme}><body>{children}</body></html>
}
```

One read in the root layout makes **every page in the application** dynamic. Marketing page, docs, pricing: all rendered per request, none on the CDN. The build output shows `ƒ` beside every route and nobody notices, because the site still works — just slower and more expensively.

Fix it by isolating the read behind a Suspense boundary, reading the cookie client-side, or keeping public routes in a separate route group and accepting the cost for authenticated ones only. Then be explicit per route:

```ts
export const dynamic = 'force-static'   // build-time only; throws if you read cookies()
export const revalidate = 3600          // ISR
```

Read `next build` output and its legend: `○` static, `●` SSG with params, `ƒ` dynamic. If a route you expected static shows `ƒ`, find the read that did it before shipping. `export const dynamic = 'force-dynamic'` is a real escape hatch for per-request pages; reaching for it "to fix stale data" turns an ISR site into an SSR site with no CDN.

### 3.6 Server Actions: validate, mutate, revalidate, return

Server Actions are public HTTP endpoints with a generated URL. `'use server'` authenticates nothing. Every action re-checks auth and re-validates input, exactly like a REST handler.

```ts
// app/skills/actions.ts
'use server'
import { z } from 'zod'
import { revalidateTag } from 'next/cache'

const SkillInput = z.object({
  title: z.string().min(8).max(80),
  priceCents: z.coerce.number().int().min(0).max(50_000),
  pocUrl: z.string().url(),
})

export type ActionState = { error?: string; fieldErrors?: Record<string, string[]> }

export async function createSkill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession()
  if (!session) return { error: 'Sign in to publish.' }          // auth first, always

  const parsed = SkillInput.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

  await db.skill.create({ data: { ...parsed.data, sellerId: session.userId, status: 'pending' } })
  revalidateTag('skills')
  return {}
}
```

```tsx
'use client'
export function SkillForm() {
  const [state, action] = useActionState(createSkill, {})
  return (
    <form action={action}>
      <input name="title" />
      {state.fieldErrors?.title && <p role="alert">{state.fieldErrors.title[0]}</p>}
      <Submit />        {/* useFormStatus() lives here — it must be a CHILD of <form> */}
    </form>
  )
}
```

Return serializable state; never throw for expected failures. An uncaught throw gives the user a generic error digest and you a production log to grep. Reserve `throw` for genuine bugs. And `useFormStatus` reads the nearest parent form — call it in a sibling of `<form>` and `pending` is always false.

### 3.7 Streaming: Suspense around the slow part only

`loading.tsx` wraps a whole route segment — useful, but coarse. Better: render the shell immediately, stream the slow region.

```tsx
export default async function SkillPage({ params }) {
  const { id } = await params
  return (
    <>
      <SkillHeader id={id} />                     {/* fast, cached */}
      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews id={id} />                       {/* slow; async component INSIDE the boundary */}
      </Suspense>
    </>
  )
}
```

Do not `await` the slow query in the page and wrap the result — awaiting above the boundary blocks the shell and the Suspense does nothing. This is the "why isn't my streaming working" cause, every time.

### 3.8 Route Handlers vs Server Actions

Use a **Server Action** when your own UI mutates your own data. Use a **Route Handler** when something that is not your React tree needs an endpoint: third-party webhooks, public APIs for mobile clients, file streaming, OG images, RSS, custom headers — and any `GET`, since actions are always POST.

```ts
// app/api/webhooks/razorpay/route.ts
export const runtime = 'nodejs'          // crypto verification needs Node, not Edge

export async function POST(req: Request) {
  const raw = await req.text()           // RAW body, before any parsing
  if (!verifySignature(raw, req.headers.get('x-razorpay-signature'))) {
    return new Response('bad signature', { status: 400 })
  }
  return Response.json({ ok: true })
}
```

Read the raw text first — `await req.json()` consumes the stream, and your signature check then fails against a re-serialized body with different whitespace.

### 3.9 Images, fonts, and middleware limits

```tsx
<Image src={skill.screenshotUrl} alt="" width={1200} height={630}
       sizes="(max-width: 760px) 100vw, 720px" />
```

`sizes` is not optional on responsive images — without it phones download the desktop asset. Add `priority` to the LCP image only; on every image it means nothing. Remote hosts must be in `images.remotePatterns` or the optimizer 400s in production while working locally. `next/font` downloads and self-hosts at build time — declare fonts once in the root layout, since calling the loader inside a component re-evaluates per render.

Middleware runs on the **Edge runtime** on every matched request. No `fs`, no Node `crypto`, no TCP database drivers, no heavy packages. Keep it to reading a cookie, checking a token's shape, and rewriting or redirecting. Verifying a JWT there needs `jose`, not `jsonwebtoken`. And middleware is not an authorization layer — a mis-scoped `matcher` silently exempts routes, so check the session again in the page or action.

### 3.10 Keeping secrets out of the bundle

Any `NEXT_PUBLIC_` variable is **inlined into the client JavaScript at build time** — not read at runtime, inlined as a string literal. Renaming it later does not remove it from a bundle you already shipped; rotate the key instead.

```ts
// lib/env.ts
import 'server-only'          // an accidental client import is now a BUILD error, not a leak

export const serverEnv = z.object({
  DATABASE_URL: z.string().url(),
  RAZORPAY_SECRET: z.string().min(1),
}).parse(process.env)
```

## 4. Anti-patterns

- **`'use client'` at the top of `page.tsx` or `layout.tsx`.** You opted the whole subtree out of server rendering. Move it to the button.
- **`useEffect` + `fetch('/api/...')` for page data.** You added a round trip, a loading state, and a waterfall to fetch what the server already had in-process.
- **Reading `cookies()`/`headers()` in the root layout.** Every route becomes dynamic. Diff `next build` output before and after.
- **`force-dynamic` as a stale-data fix.** The bug is a missing `revalidateTag`. You disabled the feature you pay for.
- **`revalidatePath('/', 'layout')` after every mutation.** Invalidation by demolition. Tag your data.
- **Server Action with no auth check.** A public POST endpoint with a stable ID. The directive is a compiler hint, not a guard.
- **Awaiting the slow query above the Suspense boundary.** No streaming occurs.
- **Non-serializable props into a Client Component.** ORM clients, class instances, callbacks. Runtime failure, unhelpful message.
- **Secrets in `NEXT_PUBLIC_*`.** Inlined into downloaded JS. Deleting the var doesn't help; rotate. Node APIs in middleware fail the same way — fine in `next dev`, broken on Edge.
- **Barrel files imported by Client Components, and `sizes` omitted on responsive `next/image`.** Two silent bundle/LCP regressions: one drags the whole barrel across the wire, the other ships desktop assets to phones.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / a Cursor rule).
2. Describe the route: what it renders, what data it needs, how fresh that data must be, which parts are interactive. Example: "Skill detail page. Title/description/POC from the DB, rarely changes. Reviews, hourly. A Buy button and a review form."
3. Ask for, in order: (a) the server component tree with the client boundary marked, (b) the caching and revalidation strategy per data source with reasoning, (c) Server Actions with Zod schemas, (d) the expected `next build` symbol for the route.
4. Challenge any `'use client'` above a leaf, and any dynamic route — make the assistant name the specific API call that forced it. Run section 4 as a pre-merge checklist.

The assistant should refuse to put `'use client'` on a page or layout, should never fetch its own API routes from `useEffect` for initial data, and should flag any dynamic read that cascades to the whole app.

## 6. Example Output

Prompt given with this skill loaded: *"Add a review form to the skill detail page. Only buyers can review. Reviews should be cached but appear immediately after posting."*

Expected shape of the answer:

```ts
// app/skills/[id]/actions.ts
'use server'
export async function postReview(_prev: State, formData: FormData): Promise<State> {
  const session = await getSession()
  if (!session) return { error: 'Sign in to review.' }

  const parsed = ReviewInput.safeParse(Object.fromEntries(formData))   // rating 1-5, text 10-2000
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

  const owned = await db.purchase.findFirst({
    where: { skillId: parsed.data.skillId, buyerId: session.userId },
  })
  if (!owned) return { error: 'Only buyers can review this skill.' }   // authz, server-side

  await db.review.create({ data: { ...parsed.data, buyerId: session.userId } })
  revalidateTag(`reviews:${parsed.data.skillId}`)
  return { ok: true }
}
```

```tsx
// app/skills/[id]/page.tsx — stays static; only reviews stream
export const revalidate = 3600

export default async function SkillPage({ params }) {
  const { id } = await params
  const skill = await getSkill(id)              // unstable_cache, tag: `skill:${id}`
  return (
    <>
      <SkillHeader skill={skill} />
      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews skillId={id} />                {/* async, inside the boundary */}
      </Suspense>
      <ReviewForm skillId={id} />               {/* 'use client', the only client module */}
    </>
  )
}
```

Expected `next build` symbol: `●`, not `ƒ`. Note what the output does *not* contain: no `'use client'` on the page, no `/api/reviews` handler, no `useEffect` fetch, no `force-dynamic`. The page is still static; one tagged cache entry gets invalidated on write.
