---
title: Type-Safe API Layer with tRPC Skill
category: Coding
description: Build a tRPC layer where auth is enforced by middleware, inputs are validated by Zod, and the client gets end-to-end types with no codegen step. Covers router composition, context, TRPCError to HTTP mapping, superjson, React Query invalidation and optimistic updates, and the cases where tRPC is the wrong tool entirely.
usage: Load this skill before asking your AI assistant to add or refactor a tRPC procedure. Say "use the type-safe tRPC skill" and describe the endpoint and who may call it; the assistant will pick the right base procedure, write the Zod schemas, and produce the matching React Query call with correct invalidation instead of a generic mutation.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 18
pocUrl: https://github.com/trpc/trpc
---

# Type-Safe API Layer with tRPC Skill

## 1. Philosophy

tRPC is not a framework. It is a function-call transport with a type inference trick attached. Once that lands, the confusion evaporates: there is no schema file, no code generation, no OpenAPI document. The client imports a **type** from the server and TypeScript does the rest at compile time. At runtime it is JSON over HTTP and nothing more.

That trick buys one enormous thing and costs one. **Buys:** renaming a server field breaks the client build — not a 500 in staging, not a Monday Sentry alert, a red squiggle before you commit. **Costs:** the contract exists only in TypeScript. There is no artifact anyone outside your repo can consume.

Three rules govern everything below:

1. **Procedures are the authorization unit.** Auth is not an `if (!ctx.user) throw` at the top of each resolver — it is middleware baked into a base procedure. `publicProcedure` and `protectedProcedure` are different types, and the second narrows `ctx.user` from `User | null` to `User`. Forgetting the check becomes impossible rather than merely unlikely.
2. **Zod is the runtime boundary; TypeScript is the compile-time one.** Input arrives as untrusted JSON, long after types were erased. A procedure that takes input and has no `.input(z...)` is unvalidated, whatever the editor says.
3. **The router is a module boundary, not a dumping ground.** `appRouter` composes feature routers. When a router file passes ~200 lines or mixes two nouns, split it.

If your client is not TypeScript, or your API is consumed by anyone outside your repo, skip to section 4 — you are about to make a mistake this skill can only help you avoid, not survive.

## 2. Tech Stack

- **tRPC** — https://github.com/trpc/trpc — licensed **MIT**. End-to-end typesafe RPC for TypeScript. Examples target v11 (`@trpc/server`, `@trpc/client`, `@trpc/react-query`); v10 differs mainly in the client bindings, noted where relevant.
- **Zod 3.23+** (MIT) — input and output validation.
- **@tanstack/react-query v5** (MIT) — the cache tRPC's React bindings wrap. You are using it whether you think about it or not; think about it.
- **superjson** (MIT) — serializing `Date`, `Map`, `Set`, `BigInt`, `undefined` across the wire.
- **TypeScript 5.4+, `strict: true`** — inference is the product. Without strict mode you bought nothing.

This skill is an independent, original guide; it is not affiliated with or endorsed by the tRPC maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Context: request-scoped facts, resolved once

```ts
// server/context.ts
export async function createContext({ req, res }: CreateNextContextOptions) {
  const session = await getSessionFromRequest(req)     // may be null; that's fine here
  return { db, session, ip: req.headers['x-forwarded-for'] as string | undefined, res }
}
export type Context = Awaited<ReturnType<typeof createContext>>
```

Two rules learned the hard way. **Do not throw in `createContext`** — a throw fails every batched procedure in the request with the same opaque error, including the public ones. Return `session: null` and let middleware decide. **Do not do unconditional expensive work** — it runs for every request including public ones; if a user lookup costs a round trip, make it a memoized lazy getter.

### 3.2 Base procedures: auth as a type, not a habit

```ts
// server/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { ZodError } from 'zod'

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return { ...shape, data: { ...shape.data,
      zod: error.cause instanceof ZodError ? error.cause.flatten().fieldErrors : null,
    } }
  },
})

export const router = t.router
export const publicProcedure = t.procedure

const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.session.user } })   // narrowed: User, not User | null
})

export const protectedProcedure = t.procedure.use(enforceAuth)
```

The `next({ ctx })` call is where the magic lives: everything downstream sees `ctx.user: User` — non-nullable, no optional chaining, no `!`. If you write `ctx.user!` in a resolver, you skipped this pattern.

Layering composes, and is not commutative:

```ts
const enforceVerified = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user.isVerified) throw new TRPCError({ code: 'FORBIDDEN', message: 'Verified sellers only.' })
  return next()
})
export const verifiedProcedure = protectedProcedure.use(enforceVerified)
```

`enforceVerified` reads `ctx.user`, which exists only because `enforceAuth` ran first. Compose from the base; never re-order arbitrarily.

### 3.3 Cross-cutting middleware

```ts
const timed = t.middleware(async ({ path, type, next }) => {
  const start = Date.now()
  const result = await next()                     // next() returns the RESULT — inspect outcomes here
  const ms = Date.now() - start
  if (ms > 500) console.warn(`[trpc] slow ${type} ${path} ${ms}ms`)
  return result
})

const rateLimited = t.middleware(async ({ ctx, path, next }) => {
  const { allowed, retryAfter } = await consumeToken(`rl:${path}:${ctx.user?.id ?? ctx.ip}`,
    { limit: 20, windowSec: 60 })
  if (!allowed) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: `Retry in ${retryAfter}s.` })
  return next()
})
```

Attach `timed` to the base `t.procedure` and everything inherits it.

### 3.4 Input and output validation

```ts
// server/routers/skill.ts
const SkillPublic = z.object({
  id: z.string().uuid(), title: z.string(), priceCents: z.number().int(),
  sellerId: z.string().uuid(), createdAt: z.date(),
})

export const skillRouter = router({
  byId: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(SkillPublic)                              // strips anything not listed — see below
    .query(async ({ ctx, input }) => {
      const skill = await ctx.db.skill.findUnique({ where: { id: input.id } })
      if (!skill) throw new TRPCError({ code: 'NOT_FOUND', message: 'Skill not found.' })
      return skill
    }),

  list: publicProcedure
    .input(z.object({
      category: z.string().optional(),
      cursor: z.string().nullish(),
      limit: z.number().int().min(1).max(50).default(20),   // cap it, or someone asks for 10 million
    }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.skill.findMany({
        where: { status: 'live', category: input.category },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
      })
      const nextCursor = rows.length > input.limit ? rows.pop()!.id : null
      return { items: rows, nextCursor }
    }),

  publish: protectedProcedure
    .input(z.object({
      title: z.string().min(8).max(80),
      priceCents: z.number().int().min(0).max(50_000),
      pocUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.skill.create({ data: { ...input, sellerId: ctx.user.id, status: 'pending' } })),
})
```

`.output()` is the underrated one. It is not about types — inference already gave you those. It is a **runtime guarantee that you don't leak columns**. Without it, adding `stripeAccountId` to the skill table silently ships it to every browser on the next deploy. Use it on anything returning a database row. And always bound `limit`: an unbounded `take` is a denial-of-service endpoint with type safety.

### 3.5 Errors: TRPCError codes map to HTTP for free

| Code | HTTP | Use for |
|---|---|---|
| `BAD_REQUEST` | 400 | Zod failures (thrown for you) |
| `UNAUTHORIZED` | 401 | Not signed in |
| `FORBIDDEN` | 403 | Signed in, not allowed |
| `NOT_FOUND` | 404 | Missing row |
| `CONFLICT` | 409 | Unique constraint, duplicate username |
| `TOO_MANY_REQUESTS` | 429 | Rate limit |
| `INTERNAL_SERVER_ERROR` | 500 | Anything you didn't anticipate |

```ts
try {
  await ctx.db.user.create({ data: { username: input.username } })
} catch (e) {
  if (isUniqueViolation(e)) throw new TRPCError({ code: 'CONFLICT', message: 'That username is taken.', cause: e })
  throw e     // let it become a 500 — an unexpected error should look unexpected
}
```

The `message` **is sent to the client**. Never interpolate a database error, a file path, or a stack into it — pass the original as `cause`, where it stays server-side and reaches your logger. An uncaught non-tRPC throw becomes a 500 with a generic message in production. That is correct. Do not "improve" it by catching everything and returning `{ ok: false }`; you would be discarding the status codes you get for free.

### 3.6 superjson: the Date problem

Plain JSON has no `Date`. Without a transformer, a procedure returning `createdAt: new Date()` types as `Date` on the client and *is* a string at runtime. `skill.createdAt.getTime()` compiles, then throws `getTime is not a function` in production. This is the most reported tRPC bug and it is entirely a serialization gap.

```ts
// v11: the transformer goes on the LINK, not on createTRPCClient
export const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
})
```

Both sides or neither — a mismatch produces deserialization errors that read like corrupted payloads. The cost is a `{ json, meta }` envelope and a little CPU. Worth it; if you ship payloads where that matters, your problem is the payload.

### 3.7 React Query: invalidate the query you actually changed

The bindings are React Query underneath. Mutations refresh nothing by themselves.

```tsx
const utils = api.useUtils()
const publish = api.skill.publish.useMutation({
  onSuccess: async () => {
    await utils.skill.list.invalidate()          // the browse list
    await utils.user.mySkills.invalidate()       // the profile list
  },
})
```

Scope honestly: `utils.invalidate()` refetches everything (a storm, almost never right); `utils.skill.invalidate()` hits the whole router; `utils.skill.byId.invalidate({ id })` hits one entry — prefer that. `onSuccess` returns before the refetch settles unless you `await` the invalidate; the `await` above is what keeps the button pending until fresh data lands, and it is not incidental.

### 3.8 Optimistic updates that roll back correctly

```tsx
const toggleFavorite = api.skill.toggleFavorite.useMutation({
  onMutate: async ({ skillId }) => {
    await utils.skill.byId.cancel({ id: skillId })      // stop an in-flight refetch clobbering us
    const previous = utils.skill.byId.getData({ id: skillId })
    utils.skill.byId.setData({ id: skillId }, (old) => old ? { ...old, isFavorited: !old.isFavorited } : old)
    return { previous }                                  // context for onError
  },
  onError: (_e, { skillId }, ctx) => {
    if (ctx?.previous) utils.skill.byId.setData({ id: skillId }, ctx.previous)     // roll back
  },
  onSettled: (_d, _e, { skillId }) => utils.skill.byId.invalidate({ id: skillId }), // reconcile, always
})
```

All four hooks are load-bearing. Skip `cancel` and a refetch that started before your optimistic write lands after it and undoes it — the "toggle flips back randomly" bug you will spend an afternoon on. Skip `onSettled` and the UI shows a guess forever.

### 3.9 Batching: one HTTP request, many procedures

`httpBatchLink` collects calls in the same tick into one POST. Three components each calling `useQuery` on mount produce one request. Consequences people discover late:

- **The batch is as slow as its slowest member.** One 2s procedure delays two 20ms ones. Split genuinely slow endpoints onto a separate `httpLink` via `splitLink` if they block fast UI.
- **Batched GETs get long URLs.** Large inputs can exceed proxy limits; move heavy inputs into a mutation or force POST.
- **A `createContext` throw kills the whole batch.** See 3.1.

### 3.10 Inferring types on the client without duplicating them

```ts
import type { inferRouterOutputs, inferRouterInputs } from '@trpc/server'
import type { AppRouter } from '@/server/routers/_app'      // import TYPE — see below

type RouterOutputs = inferRouterOutputs<AppRouter>
export type SkillListItem = RouterOutputs['skill']['list']['items'][number]
export type PublishInput = inferRouterInputs<AppRouter>['skill']['publish']

export function SkillCard({ skill }: { skill: SkillListItem }) { /* rename a column, this goes red */ }
```

Never hand-write an interface mirroring a procedure's return. And import the router as `import type` — a value import drags your database client, secrets module, and Node built-ins into the client bundle. Some bundlers tree-shake it. Do not rely on that.

### 3.11 Keeping routers from becoming a swamp

```ts
// server/routers/_app.ts — composition only. No resolvers live here.
export const appRouter = router({
  skill: skillRouter, review: reviewRouter, purchase: purchaseRouter,
  user: userRouter, admin: adminRouter,        // every procedure inside built on adminProcedure
})
export type AppRouter = typeof appRouter
```

Rules that hold at 200 procedures: one router per noun, one file per router, resolvers thin. **Business logic lives in `server/services/`, not in resolvers** — a resolver validates, calls a service, maps errors, so the cron job, the webhook handler, and the procedure all share one implementation. Nest by domain, not verb: `skill.review.list`, never `listSkillReviews`. When editor TS latency creeps past a second, you have too much inference in one router; split it and check `tsc --diagnostics`.

## 4. Anti-patterns

- **`publicProcedure` with a manual `if (!ctx.session) throw` inside.** Works until someone forgets. Use `protectedProcedure`; make it unforgettable.
- **`ctx.user!` in a resolver.** The `!` is proof you skipped the middleware narrowing.
- **A procedure with input and no `.input()` schema.** It is `unknown` at runtime regardless of what TypeScript believes.
- **No `.output()` on procedures returning DB rows.** The next column someone adds ships to the browser. Silent, and cached.
- **Unbounded `limit`.** `take: input.limit` with no `.max()` is an outage you wrote yourself.
- **Database error text in `TRPCError.message`.** That string reaches the client. Use `cause`.
- **No transformer, then `.getTime()` on a Date.** Compiles clean, throws in production.
- **`utils.invalidate()` after every mutation.** Refetches the entire cache. Invalidate the key you touched.
- **Optimistic update without `cancel` + rollback.** Intermittent flicker that never reproduces locally.
- **Value-importing `AppRouter` on the client.** Your server module graph is now in the browser bundle.
- **tRPC for a public API.** No OpenAPI spec, no stable URL contract, no versioning story. External consumers cannot use it. Ship REST or GraphQL and let tRPC serve your own frontend.
- **tRPC for non-TypeScript clients.** A Swift or Kotlin app gets zero benefit and inherits a bespoke JSON envelope.
- **tRPC across team boundaries.** It needs a monorepo and one `tsc` version. Two repos, two deploy cadences: the type link breaks and you have RPC with extra steps.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill / Cursor rule).
2. State the procedure in one sentence: name, who may call it, input, output, side effects. Example: "`skill.publish` — signed-in verified sellers only; takes title/price/pocUrl; creates a pending skill; the marketplace list and profile list must refresh."
3. Ask for, in order: (a) the base procedure it builds on and why, (b) the Zod input and output schemas, (c) the resolver calling a service function, (d) the React Query hook with exact invalidations.
4. Push back on any `publicProcedure` with an inline auth check, any missing `.output()` on a row-returning query, and any `utils.invalidate()` with no arguments.
5. Before adding tRPC at all, confirm the consumer is TypeScript in the same repo. If not, section 4's last three bullets apply.

The assistant should refuse to write a procedure taking unvalidated input, should never put a raw error message into `TRPCError.message`, and should name which cache keys a mutation invalidates.

## 6. Example Output

Prompt given with this skill loaded: *"Add `review.create`. Only buyers of the skill can review, one review per buyer per skill. The skill's rating and the review list should update."*

Expected shape of the answer:

```ts
// server/routers/review.ts
export const reviewRouter = router({
  create: protectedProcedure
    .input(z.object({
      skillId: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
      text: z.string().min(10).max(2000),
    }))
    .output(z.object({ id: z.string().uuid(), createdAt: z.date() }))
    .mutation(async ({ ctx, input }) => {
      const purchase = await ctx.db.purchase.findFirst({
        where: { skillId: input.skillId, buyerId: ctx.user.id }, select: { id: true },
      })
      if (!purchase) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only buyers can review this skill.' })

      try {
        return await reviewService.create({ ...input, buyerId: ctx.user.id })   // recomputes rating in a tx
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'You already reviewed this skill.', cause: e })
        }
        throw e
      }
    }),
})
```

```tsx
const create = api.review.create.useMutation({
  onSuccess: async (_res, { skillId }) => {
    await Promise.all([
      utils.review.listBySkill.invalidate({ skillId }),   // the list gained a row
      utils.skill.byId.invalidate({ id: skillId }),       // the aggregate rating changed
    ])
  },
})
```

Note what the output does *not* contain: no inline session check (`protectedProcedure` did it), no `ctx.user!`, no leaked constraint name in the 409, no blanket `utils.invalidate()`. The uniqueness rule is a database constraint mapped to `CONFLICT`, not a read-then-write race in the resolver.
