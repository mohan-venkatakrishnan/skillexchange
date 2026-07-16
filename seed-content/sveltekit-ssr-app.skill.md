---
title: Server-Rendered Apps with SvelteKit Skill
category: Website
description: Build genuinely server-rendered apps with SvelteKit instead of a client-side SPA wearing an SSR costume. Covers the load-function contract, form actions, session hooks, streaming, the server-only boundary, and the adapter decisions that bite you at deploy time.
usage: Load this skill before asking your AI assistant to scaffold or extend any SvelteKit app. Say "use the SvelteKit SSR skill" and describe your routes and auth model; the assistant will produce load functions, actions, and hooks that respect the server boundary instead of the useEffect-and-fetch habits carried over from React.
platforms: [Claude, ChatGPT, Cursor, Gemini]
priceUsd: 0
timeSavedHours: 18
pocUrl: https://github.com/sveltejs/kit
---

# Server-Rendered Apps with SvelteKit Skill

## 1. Philosophy

Most SvelteKit code in the wild is React code with different syntax: a component mounts, fires a `fetch` in `onMount`, sets a spinner, renders. That app is not server-rendered. It ships a skeleton first, and you paid the SSR complexity tax for none of the benefit.

**The framework's thesis: the server already knows the answer before HTML leaves the building.** Loading, authorization, and mutations all have first-class server primitives. If you are writing `onMount(fetch)`, you have opted out of the framework.

Three rules govern everything below:
1. **Every byte a `+page.ts` returns is public.** Universal loads run on the server *and again in the browser*, and their return value is serialized into the HTML. If a value must never reach a user, it lives in `+page.server.ts` and nowhere else.
2. **Mutations are form actions, not fetch calls.** A `<form method="POST">` works before hydration, with JS disabled, and on a flaky connection mid-hydration — then `use:enhance` gives you the SPA feel for free. A hand-rolled `fetch('/api/thing')` gives you none of that and adds an endpoint to secure.
3. **Auth resolves once, in `handle`.** Not per-route, not per-component. The hook populates `event.locals`; every server load reads from there. A route that re-derives the session itself is a future bug where one route forgets.

## 2. Tech Stack

- **SvelteKit** — https://github.com/sveltejs/kit — licensed **MIT**. Routing, SSR, load functions, form actions, adapters.
- **Svelte 5** — also **MIT**. Runes (`$state`, `$props`) are assumed below; the patterns work on Svelte 4 with stores, but the ergonomics are worse.
- **Vite** — **MIT** — the underlying dev server and build tool. Worth knowing: half your "SvelteKit" build errors are Vite errors.

This skill is an independent, original guide; it is not affiliated with or endorsed by the SvelteKit maintainers. All example code is original to this skill.

Recommended companions: TypeScript strict mode, Zod for anything crossing the network boundary, and a database client imported *only* from `$lib/server`.

## 3. Patterns

### 3.1 The load-function contract: pick the right file, once

This single decision determines whether your app leaks. Learn the table and stop guessing:
| | `+page.server.ts` | `+page.ts` |
|---|---|---|
| Runs in browser | **no** | **yes, on client navigation** |
| Can read secrets / DB / `locals` | yes | **no** |
| Return value | serialized to client | serialized to client |

The trap: **both** serialize their return into the page payload. `+page.server.ts` is not "private data," it is "private *code*." The query runs server-side; the result still ships.

```ts
// src/routes/invoices/[id]/+page.server.ts
export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.session) throw error(401, 'Sign in to view invoices')
  const invoice = await db.invoice.findFirst({
    where: { id: params.id, orgId: locals.session.orgId },
    // Select explicitly. `include: { customer: true }` ships risk_score to the browser forever.
    select: { id: true, total: true, status: true, issuedAt: true },
  })
  if (!invoice) throw error(404, 'Not found')
  return { invoice } // ← serialized into the HTML. Read this line as "publish".
}
```

Use `+page.ts` only where running in both places helps: a public API, derived view state, `$env/static/public`.

### 3.2 Parallel loads, or you built a waterfall

Sequential `await`s are serial round-trips. Three 80ms queries in a row is 240ms of blank page; `const [user, orgs, plan] = await Promise.all([getUser(id), getOrgs(id), getPlan(id)])` is 80ms.

The subtler waterfall is *across layouts*. `+layout.server.ts` and `+page.server.ts` run in parallel — until a page load calls `await parent()`, which serializes them. Call `parent()` only when the child query truly needs the layout's data, and as late as possible.

### 3.3 Streaming: return the promise, not the awaited value

Top-level keys of a server load are awaited before render. Nested promises stream in.
```ts
export const load: PageServerLoad = async ({ locals }) => ({
  profile: await getProfile(locals.session.userId),               // blocks the shell — keep it fast
  streamed: { activity: getActivityFeed(locals.session.userId) }, // NO await
})
```
```svelte
{#await data.streamed.activity}<ActivitySkeleton />
{:then rows}<ActivityList {rows} />
{:catch}<p class="err">Couldn't load activity.</p>{/await}
```

Two rules: streaming only works in server loads (a universal load has no stream to write into), and an unhandled rejection surfaces as a hard error — always give it a `{:catch}`.

### 3.4 Form actions and progressive enhancement

Named actions, one per verb, validated server-side.
```ts
// src/routes/settings/+page.server.ts
const RenameSchema = z.object({ name: z.string().trim().min(2).max(60) })
export const actions: Actions = {
  rename: async ({ request, locals }) => {
    if (!locals.session) throw redirect(303, '/login')
    const form = Object.fromEntries(await request.formData())
    const parsed = RenameSchema.safeParse(form)
    // Echo the input back so an un-enhanced form doesn't lose it.
    if (!parsed.success) return fail(400, { name: form.name, error: 'Name must be 2-60 chars.' })
    await db.org.update({ where: { id: locals.session.orgId }, data: parsed.data })
    return { ok: true }
  },
}
```
```svelte
<form method="POST" action="?/rename" use:enhance>
  <input name="name" value={form?.name ?? data.org.name} />
  {#if form?.error}<p class="err">{form.error}</p>{/if}<button>Save</button>
</form>
```

Delete `use:enhance` and this still works. That is the whole point.

### 3.5 `handle`: one place where the session exists
```ts
// src/hooks.server.ts
const auth: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get('sid')
  event.locals.session = token ? await verifySession(token) : null
  return resolve(event)
}
const guard: Handle = async ({ event, resolve }) => {
  if (event.route.id?.startsWith('/(app)') && !event.locals.session) throw redirect(303, '/login')
  return resolve(event)
}
export const handle = sequence(auth, guard)
```

Guard on `event.route.id`, not `event.url.pathname` — route ids are the framework's own truth and won't be fooled by a trailing slash or a matcher. Declare `App.Locals` in `src/app.d.ts` so `locals.session` is typed rather than `any`.

### 3.6 The server boundary: `$lib/server` and the four env modules

Anything under `src/lib/server/` throws a **build-time** error if it reaches a client bundle. It is the cheapest security control the framework gives you, and most projects never use it. Rule: if a module reads `$env/static/private` or opens a connection, it goes in `$lib/server`. Then a stray import in a `.svelte` file fails CI instead of shipping your key. The env modules are not interchangeable:

- `$env/static/private` — build-time inlined, server-only. **Default choice for secrets**; unused vars dead-code-eliminate.
- `$env/dynamic/private` — runtime `process.env`, server-only. For one build artifact deployed to many environments.
- `$env/static/public` / `$env/dynamic/public` — `PUBLIC_` prefixed, ships to the browser.

Static-vs-dynamic is a deploy-model question: rebuild per environment, or ship one image everywhere? Pick one convention and put it in the README. Mixing them yields a var that works in dev and is `undefined` in prod.

### 3.7 Invalidation: `depends` beats `invalidateAll`
```ts
export const load = async ({ fetch, depends }) => {
  depends('app:notifications')
  return { notifications: await fetch('/api/notifications').then(r => r.json()) }
}
// elsewhere, after a mutation:
await invalidate('app:notifications') // re-runs only loads that declared this key
```

Use the `fetch` passed into load, never the global one: it forwards cookies server-side, resolves relative URLs, and inlines the response into the HTML so the browser doesn't re-request it during hydration.

### 3.8 Adapters: decide in week one, not at deploy
- `adapter-node` — a long-lived server. Timers, in-process caches, WebSockets are on the table.
- `adapter-static` — prerender everything. **No server loads at runtime**, so `+page.server.ts` and form actions are gone. Different app.
- `adapter-vercel` / `-netlify` / `-cloudflare` — serverless/edge. No shared memory, cold starts, and on edge runtimes no Node built-ins — that `fs` import builds locally and explodes in prod.

The failure mode is always the same: months against `adapter-auto` on your laptop, then discovering at launch that the target has no filesystem.

## 4. Anti-patterns

- **`onMount(() => fetch('/api/...'))` for page data.** You have a spinner where you could have had HTML. Move it to a load function and the data arrives in the first byte.
- **Secrets in a universal `+page.ts`.** It runs in the browser. `API_KEY` there is either `undefined` or, if you fought the bundler into inlining it, published.
- **Returning the whole DB row.** `{data.user.passwordHash}` never renders, but it is sitting in view-source. Loads serialize everything you return, including fields the template ignores.
- **`Date.now()`, `Math.random()`, or `toLocaleString()` in markup.** Server renders one value, client hydrates another: mismatch warning plus a flash of wrong content. Compute in `onMount`, or pass a fixed timestamp from load and format with an explicit locale and timezone.
- **Sequential awaits in load, or `await parent()` at the top "just in case."** Both turn parallel work into a chain. `Promise.all`, and call `parent()` only when the child query needs its data.
- **Hand-rolled `/api/*` endpoints for your own forms.** Now you own CSRF surface, a second validation path, and a form that breaks without JS — replacing something the framework does in eight lines.
- **`invalidateAll()` after every mutation.** Every load re-runs, including the expensive unrelated one in the layout. Tag with `depends`.
- **DB clients imported outside `$lib/server`.** The one import you get wrong is the one that ships your connection string.
- **Choosing the adapter at deploy time.** Static and serverless remove capabilities you have already built on.

## 5. Usage

1. Paste this skill into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. State your deploy target and adapter first — "Node container" vs "Cloudflare Workers" changes the right answer to almost every later question.
3. Describe the route tree and auth model, e.g. "`/(marketing)` public; `/(app)` requires session; `/(app)/admin` requires role=owner; session is an httpOnly cookie."
4. Ask for, in order: (a) `hooks.server.ts` with the session + guard sequence and `app.d.ts` types, (b) route folders with the correct `+page.server.ts` / `+page.ts` split, (c) form actions for every mutation, (d) streaming for any panel slower than ~200ms.
5. Run section 4 as a pre-deploy checklist, then view-source a real page and read the serialized payload — that is the actual test for leaks.

The assistant should refuse to put secrets in a universal load, reach for form actions before custom endpoints, and flag any `onMount` fetch that could have been a load function.

## 6. Example Output

Prompt given with this skill loaded: *"Add a team page at `/(app)/team`. Owners can invite by email and remove members; any signed-in user can view the list. Show pending invites, which are slow to fetch from our email provider."*

Expected shape of the answer:
```ts
// src/routes/(app)/team/+page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
  const { orgId, role } = locals.session! // guard hook already ran
  return {
    role,
    members: await db.member.findMany({
      where: { orgId },
      select: { id: true, role: true, user: { select: { name: true } } },
    }),
    streamed: { invites: fetchPendingInvites(orgId) }, // slow third party — stream it
  }
}
export const actions: Actions = {
  invite: async ({ request, locals }) => {
    if (locals.session?.role !== 'owner') throw error(403, 'Owners only')
    const parsed = InviteSchema.safeParse(Object.fromEntries(await request.formData()))
    if (!parsed.success) return fail(400, { error: 'Enter a valid email.' })
    await sendInvite(locals.session.orgId, parsed.data.email)
    return { ok: true }
  },
  remove: async ({ request, locals }) => {
    if (locals.session?.role !== 'owner') throw error(403, 'Owners only')
    const id = String((await request.formData()).get('id'))
    // Scope by orgId — never trust the id alone.
    await db.member.deleteMany({ where: { id, orgId: locals.session.orgId } })
    return { ok: true }
  },
}
```
```svelte
{#each data.members as m (m.id)}
  <li>{m.user.name}
    {#if data.role === 'owner' && m.role !== 'owner'}
      <form method="POST" action="?/remove" use:enhance>
        <input type="hidden" name="id" value={m.id} /><button>Remove</button>
      </form>{/if}</li>
{/each}
{#await data.streamed.invites}<p class="muted">Checking pending invites…</p>
{:then invites}<ul>{#each invites as i}<li>{i.email}</li>{/each}</ul>
{:catch}<p class="err">Invite provider unavailable.</p>{/await}
```

Note what the output does *not* contain: no `onMount`, no fetch calls, no loading boolean for the member list, and no client-side `if (role === 'owner')` pretending to be authorization. The owner-only markup is UX; the `throw error(403)` in the action is security.
