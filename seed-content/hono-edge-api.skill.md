---
title: Edge APIs with Hono Skill
category: Coding
description: Build a Hono API that runs on Workers, Deno, Bun, and Node without a rewrite — typed bindings, zod validation, RPC clients that infer themselves, and a hard list of what the edge cannot do. Covers middleware order, streaming, the Cache API, HTTPException, and keeping the bundle under the limit that gets your deploy rejected.
usage: Load this skill before asking your AI assistant to build or port an API to Hono. Say "use the Hono edge API skill" and name your runtime and routes; the assistant will produce typed handlers, validators, and app.request() tests that stay portable instead of quietly hardcoding Node APIs that fail at deploy time.
platforms: [Claude, Cursor, Copilot]
priceUsd: 0
timeSavedHours: 10
pocUrl: https://github.com/honojs/hono
---

# Edge APIs with Hono Skill

## 1. Philosophy

Hono is a router and a middleware chain built on Web Standards: `Request`, `Response`, `URL`, `Headers`, `fetch`. Nothing else. That single constraint is why one file runs on Cloudflare Workers, Deno, Bun, Vercel, and Node — and it is why the discipline differs from Express.

Express lets you reach for anything: `fs`, a 40MB SDK, a 12-second CPU loop. The edge does not. Your code is not a long-lived process with a warm heap; it is a function instantiated near the user, given a few dozen milliseconds of CPU and a hard memory ceiling, then discarded.

Four rules follow, and they are the whole skill:

1. **Web Standards only, in every file you write.** A line needing `fs`, `path`, `Buffer`, or `process.env` is not portable and fails at deploy, not at review. `process.env` is the worst of them: it *works* on Node and silently reads `undefined` on Workers, where config arrives as a per-request `Bindings` argument.
2. **Type the environment once, at the `Hono` generic, and never cast again.** `new Hono<{ Bindings: Env; Variables: Vars }>()` makes `c.env.DB` and `c.get('user')` typed at every call site. Skip it and you are writing `as any` within a week.
3. **`await next()` is the seam.** Everything before it runs inbound, everything after runs outbound. Forget the `await` and your response is sent before your middleware finished.
4. **The edge is for I/O and routing, not for work.** Fan out to a database, transform JSON, sign a token, cache the result. Resize an image, parse a 40MB CSV, render a PDF — that goes to a queue or a container. The CPU budget is not a suggestion.

Write as if every request runs in a fresh isolate with no filesystem and 10ms of CPU, because on Workers that is close to true.

## 2. Tech Stack

- **Hono** — https://github.com/honojs/hono — licensed **MIT**. Small standards-based framework with a fast router, typed context, first-party adapters and middleware.
- **@hono/zod-validator** (MIT) + **zod** (MIT) — validation that also narrows types in the handler.
- **Runtime adapters**, all first-party and MIT: `hono/cloudflare-workers`, `hono/deno`, `hono/bun`, `@hono/node-server`. The app object is identical across all four; only the entry file differs.
- **hono/client** — the RPC client, shipped in-package. Types infer from the server's route type: no codegen, no schema file.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Hono maintainers. All example code is original to this skill.

Companions: `wrangler` for Workers dev/deploy, `vitest` (`app.request()` needs no server, so no special environment), `wrangler types` to generate `Env` from your bindings.

## 3. Patterns

### 3.1 Runtime-agnostic layout: the app is not the entry point

The mistake is exporting `app` from `index.ts` and importing runtime APIs there. Then porting means rewriting. Keep the app pure; make each entry three lines.

```
src/
  app.ts            // export const app = new Hono<AppEnv>() — zero runtime imports
  env.ts            // the AppEnv type
  routes/orders.ts  // each exports a Hono sub-app
  lib/db.ts         // takes bindings as arguments, never reads globals
  entry.workers.ts  // export default app
  entry.node.ts     // serve({ fetch: app.fetch, port: 3000 })
```

```ts
// entry.node.ts — the ONLY file in the repo allowed to say process.env
import { serve } from '@hono/node-server'
import { app } from './app'
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) })

// entry.workers.ts
import { app } from './app'
export default app   // an object with a .fetch method — exactly the Workers contract
```

The portability test is mechanical: grep `src/` minus entry files for `node:`, `process.`, `Buffer`, `__dirname`. Zero hits means a port is a new entry file, not a rewrite.

### 3.2 Typed Bindings and Variables

`Bindings` are what the platform injects (secrets, KV, D1, R2). `Variables` are what your own middleware sets. Declare both once.

```ts
// env.ts
export type AppEnv = {
  Bindings: {
    DB: D1Database
    CACHE: KVNamespace
    JWT_SECRET: string        // a secret binding, NOT process.env
  }
  Variables: {
    user: { id: string; orgId: string }
    requestId: string
  }
}

// app.ts
export const app = new Hono<AppEnv>()
```

Now the compiler carries you:

```ts
app.get('/v1/orders/:id', async (c) => {
  const user = c.get('user')      // typed { id, orgId } — not `any`
  const row = await c.env.DB      // typed D1Database
    .prepare('select id, sku, status, buyer_id from orders where id = ?1')
    .bind(c.req.param('id'))
    .first<{ id: string; sku: string; status: string; buyer_id: string }>()

  if (!row) throw new HTTPException(404, { message: 'order not found' })
  if (row.buyer_id !== user.id) throw new HTTPException(403, { message: 'not permitted' })
  return c.json({ id: row.id, sku: row.sku, status: row.status })
})
```

Sub-apps must repeat the generic or they lose the types at the mount point: `export const orders = new Hono<AppEnv>()`, then `app.route('/v1/orders', orders)`.

There is no ambient environment on Workers — bindings arrive per request. So helpers take config as an argument: `export async function fetchOrder(db: D1Database, id: string)`, never a module-level import of the environment.

### 3.3 Middleware order and what `await next()` means

Middleware is an onion. Code before `await next()` runs inbound in registration order; code after runs outbound in reverse.

```ts
app.use('*', async (c, next) => {
  const id = c.req.header('x-request-id') ?? crypto.randomUUID()  // Web Crypto, portable
  c.set('requestId', id)
  const start = Date.now()

  await next()   // the entire rest of the chain, handler included, runs here

  c.header('x-request-id', id)                                     // outbound: response exists now
  c.header('server-timing', `total;dur=${Date.now() - start}`)
})
```

Three things bite:

**Forgetting `await`.** `next()` returns a promise. Drop the `await` and outbound code runs before the handler resolves — headers set against a response that does not exist, timings reading zero. It never throws; it quietly lies.

**Registration order is execution order.** `app.use()` applies only to routes registered *after* it. This is the most common Hono bug in existence:

```ts
app.get('/v1/orders', listOrders)     // NOT protected — registered before the middleware
app.use('/v1/*', auth())
app.get('/v1/invoices', listInvoices) // protected
```

Every `app.use()` goes at the top of the file, above every route.

**A rejecting middleware must not call `next()`:**

```ts
export const auth = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const raw = c.req.header('authorization')?.replace(/^Bearer /, '')
  if (!raw) throw new HTTPException(401, { message: 'missing token' })

  const claims = await verifyJwt(raw, c.env.JWT_SECRET)   // secret from bindings
  if (!claims) throw new HTTPException(401, { message: 'invalid token' })

  c.set('user', { id: claims.sub, orgId: claims.org })
  await next()
}
```

### 3.4 zod-validator: validation that narrows the handler

```ts
const createOrder = z.object({
  sku: z.string().regex(/^[A-Z0-9-]{3,32}$/),
  quantity: z.number().int().positive().max(100),
  currency: z.enum(['USD', 'EUR', 'INR']),
})

// z.coerce is mandatory on query params — everything in a query string is a string
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
})

// One wrapper so every validation failure has the same body shape
const validate = <T extends z.ZodTypeAny>(target: 'json' | 'query' | 'param', schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({
        error: 'validation_failed',
        fields: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      }, 422)
    }
  })

orders.post('/', validate('json', createOrder), async (c) => {
  const body = c.req.valid('json')   // typed AND validated: body.quantity is number
  return c.json(await insertOrder(c.env.DB, c.get('user').id, body), 201)
})
```

`c.req.valid('json')`, never `await c.req.json()` after validating — the latter re-parses, discards the narrowed type, and on some runtimes throws because the body stream is already consumed. A bare `z.number()` on `?limit=20` rejects it, and you will blame Hono for ten minutes.

### 3.5 RPC mode: a typed client with no codegen

Chain routes, export the type. The client infers paths, params, body, and response from it — no OpenAPI file, no generator, no drift.

```ts
// app.ts — chaining is REQUIRED: each .post()/.get() returns a router with a richer type
const routes = app
  .post('/v1/orders', validate('json', createOrder), (c) => c.json({ id: '...', status: 'pending' }, 201))
  .get('/v1/orders/:id', (c) => c.json({ id: c.req.param('id'), status: 'pending' }))

export type AppType = typeof routes
```

```ts
// client — imports the TYPE only, nothing at runtime
import { hc } from 'hono/client'
import type { AppType } from '../server/src/app'

const client = hc<AppType>('https://api.example.com')
const res = await client.v1.orders.$post({
  json: { sku: 'ABC-1', quantity: 2, currency: 'USD' },   // wrong shape = compile error
})
if (res.ok) { const order = await res.json() }             // inferred, not `any`
```

Two non-obvious conditions. **Routes must be chained** — separate `app.post(...)` / `app.get(...)` statements lose the accumulated type and the client degrades to `any`; that is always why. And **`import type`, always** — a value import pulls the whole server into your client bundle, which is how you ship D1 queries to browsers.

### 3.6 Streaming: pass the pointer, handle the abort

Buffering a large response blows the memory ceiling. Streaming also makes time-to-first-byte constant regardless of size.

```ts
import { streamSSE } from 'hono/streaming'

app.get('/v1/orders/:id/events', async (c) => {
  return streamSSE(c, async (stream) => {
    let aborted = false
    stream.onAbort(() => { aborted = true })   // NOT optional — see below

    for await (const evt of watchOrder(c.env.DB, c.req.param('id'))) {
      if (aborted) break
      await stream.writeSSE({ data: JSON.stringify(evt), event: 'order.updated', id: evt.seq })
    }
  })
})
```

A dropped client on a stream with no `onAbort` is a loop billing CPU until the platform kills the isolate, and it is invisible in metrics because the request never "errors."

To proxy an upstream stream, pass the body through: `return new Response(upstream.body, { headers })`. `await upstream.text()` on a 200MB file is an OOM; `upstream.body` is a pointer.

### 3.7 Caching with the Cache API, and work after the response

The Cache API is a Web Standard and is per-datacenter, so a hit near the user never touches your origin.

```ts
app.get('/v1/skills/:id', async (c) => {
  const cache = caches.default
  const key = new Request(c.req.url, { method: 'GET' })

  const hit = await cache.match(key)
  if (hit) return hit

  const skill = await fetchSkill(c.env.DB, c.req.param('id'))
  if (!skill) throw new HTTPException(404, { message: 'skill not found' })

  const res = c.json(skill)
  res.headers.set('cache-control', 'public, max-age=60, s-maxage=300')

  // Do not await: respond now, finish the cache write after.
  c.executionCtx.waitUntil(cache.put(key, res.clone()))
  return res
})
```

`res.clone()` before `cache.put` — a `Response` body is a stream readable once. Cache the original and the client gets an empty body: a bug that looks like a caching bug and is not.

`waitUntil` is the only correct way to do post-response work at the edge; a floating promise is killed the moment the response is sent. It is Workers-specific, so guard it if the code also runs on Node:

```ts
const later = (c: Context<AppEnv>, p: Promise<unknown>) => {
  try { c.executionCtx.waitUntil(p) } catch { void p.catch(() => {}) }
}
```

### 3.8 Error handling: HTTPException plus one onError

Throw `HTTPException` from anywhere — handler, middleware, a deep helper. Catch everything else once.

```ts
app.onError((err, c) => {
  const requestId = c.get('requestId')
  if (err instanceof HTTPException) {
    return c.json({ error: codeFor(err.status), message: err.message, requestId }, err.status)
  }
  // Unknown: log the detail, tell the client nothing.
  console.error(JSON.stringify({ level: 'error', requestId, path: c.req.path, err: String(err) }))
  return c.json({ error: 'internal', message: 'something went wrong', requestId }, 500)
})

app.notFound((c) => c.json({ error: 'not_found', message: 'no such route' }, 404))
```

One JSON string, not a multi-arg `console.error(msg, obj)` — edge log pipelines mangle the second argument, and a single line is queryable in all of them. Never return `String(err)` to a client; at the edge that string routinely contains binding names and upstream URLs.

### 3.9 Testing with app.request()

`app.request()` runs the whole chain in-process against a standard `Request`. No listener, no port, no adapter.

```ts
const env = { DB: makeFakeD1(), CACHE: makeFakeKV(), JWT_SECRET: 'test' }

it('rejects quantity 0 with a field error', async () => {
  const res = await app.request('/v1/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${testToken()}` },
    body: JSON.stringify({ sku: 'ABC-1', quantity: 0, currency: 'USD' }),
  }, env)   // third argument IS Bindings

  expect(res.status).toBe(422)
  const body = await res.json()
  expect(body.error).toBe('validation_failed')   // codes are contract; messages are copy
  expect(body.fields[0].path).toBe('quantity')
})
```

That third argument is the payoff for never touching `process.env` in `src/`: tests inject a whole environment as a plain object, with no mocking library and no global patching.

### 3.10 Bundle size is a deploy-time constraint

Workers enforces a compressed bundle limit (1MB free, 10MB paid). Exceeding it fails the deploy — after the code is written and reviewed. Cold start scales with bundle size, so it matters below the limit too.

- Import narrowly: `import { HTTPException } from 'hono/http-exception'`, not a barrel that pulls in every route module.
- Reach for the platform before a package. `crypto.randomUUID()` over `uuid`. Web Crypto `subtle.sign` over `jsonwebtoken` (which needs Node crypto and will not run at all).
- No ORM carrying a query builder plus a driver plus a migration engine to serve one `select`. A D1 prepared statement is three lines.
- Run `wrangler deploy --dry-run --outdir dist` in CI and fail on a size regression. Finding out at deploy is finding out too late.

Hono itself is a few kilobytes. Everything above that is a decision you made.

## 4. Anti-patterns

- **`process.env` outside the Node entry.** Reads `undefined` on Workers rather than throwing, so your secret is silently empty and auth "works" until it does not.
- **`node:fs`, `node:path`, `Buffer`, `__dirname` in `src/`.** No filesystem exists. Fails at deploy, not review. Grep for it in CI.
- **CPU-bound work in a handler.** Image resizing, PDF rendering, big CSV parsing, high-cost bcrypt. You get milliseconds, not seconds.
- **Middleware registered after the routes it should protect.** Those routes are public.
- **`next()` without `await`.** Outbound code runs before the handler finishes. Silent, load-dependent, never throws.
- **`await c.req.json()` after `zValidator`.** Re-parses, drops the narrowed type, can throw on a consumed stream. Use `c.req.valid('json')`.
- **`z.number()` on a query param.** Query values are strings. `z.coerce.number()`.
- **Unchained route definitions, then wondering why the RPC client types everything `any`.**
- **A value import of the server app in a client bundle.** `import type`, or you ship your database code to the browser.
- **`cache.put(key, res)` without `.clone()`.** The stream is consumed; the client gets an empty body.
- **A floating promise for post-response work.** The isolate is discarded at response time. Use `waitUntil`.
- **Streaming without `onAbort`.** A disconnected client leaves a loop burning CPU, and it never shows up as an error.
- **A heavyweight SDK for one HTTP call.** `fetch` is built in, portable, and costs zero bundle bytes.
- **Returning `String(err)` in a 500.** Leaks binding names and upstream URLs.

## 5. Usage

1. Load this skill into your assistant (project skill in Claude Code, a rule in Cursor, or a Copilot instructions file).
2. **Name the target runtime(s) in your prompt** — "Workers now, Node later" changes whether `waitUntil` and `caches.default` may be used unguarded.
3. Describe routes, auth, and bindings. Example: "Orders API on Hono, Workers + D1. Bearer JWT. POST /v1/orders, GET /v1/orders/:id, GET /v1/orders (paginated). Typed RPC client for our React app."
4. Ask for, in order: (a) `env.ts` with `Bindings`/`Variables`, (b) `app.ts` with middleware above routes and chained route definitions, (c) zod schemas plus the validation hook, (d) handlers, (e) `onError` and `notFound`, (f) entry files per runtime, (g) `app.request()` tests with injected bindings.
5. Run section 4 as a checklist. The ten-second version: grep `src/` for `process.`/`node:`/`Buffer`, confirm every `next()` is awaited, confirm no `app.use()` sits below a route.

The assistant should refuse to import Node built-ins into shared code, refuse to read `process.env` outside the Node entry, and reach for a Web Standard before adding a dependency.

## 6. Example Output

Prompt given with this skill loaded: *"Add DELETE /v1/orders/:id to cancel an order. Only the buyer can cancel, and only while status is 'pending'. Invalidate the cached order."*

Expected shape of the answer:

```ts
orders.delete('/:id', validate('param', z.object({ id: z.string().uuid() })), async (c) => {
  const { id } = c.req.valid('param')
  const user = c.get('user')

  // Guards live in the WHERE clause: two concurrent cancels cannot both succeed.
  const res = await c.env.DB
    .prepare(`update orders set status = 'cancelled', cancelled_at = ?2
              where id = ?1 and buyer_id = ?3 and status = 'pending'`)
    .bind(id, Date.now(), user.id)
    .run()

  if (res.meta.changes === 0) {
    // Zero rows: say precisely why. Cold path, so the extra read costs nothing.
    const row = await c.env.DB.prepare('select buyer_id, status from orders where id = ?1')
      .bind(id).first<{ buyer_id: string; status: string }>()

    if (!row) throw new HTTPException(404, { message: 'order not found' })
    if (row.buyer_id !== user.id) throw new HTTPException(403, { message: 'not permitted' })
    throw new HTTPException(409, { message: `order is ${row.status} and cannot be cancelled` })
  }

  // Purge the read cache after responding — the client should not wait for it.
  later(c, caches.default.delete(new Request(new URL(`/v1/orders/${id}`, c.req.url).toString())))
  return c.body(null, 204)
})
```

Note what the output does *not* contain: no read-then-write race, no `process.env`, no Node crypto, no hand-built error JSON (`onError` renders every `HTTPException` in one shape), and no awaited cache purge on the response path. The handler is I/O and routing. That is all the edge is for.
