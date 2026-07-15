---
title: Prisma Schema and Migration Discipline Skill
category: Coding
description: Model a Postgres schema in Prisma and evolve it without downtime, data loss, or a migrations folder nobody trusts. Covers relations, expand/contract renames, transaction semantics, connection pooling in serverless, and the query patterns that quietly cost 40 round trips per request.
usage: Load this skill before asking your AI assistant to touch schema.prisma or generate any migration. Say "use the Prisma schema and migration discipline skill", then describe the entity or change you want; the assistant will produce a schema, a migration strategy, and query code that follow these rules rather than the quickstart's happy path.
platforms: [Claude, Cursor, ChatGPT]
priceUsd: 6
timeSavedHours: 16
pocUrl: https://github.com/prisma/prisma
---

# Prisma Schema and Migration Discipline Skill

## 1. Philosophy

Prisma is two products wearing one name, and most teams only respect the first. The client is a typed query builder — pleasant, forgiving, hard to get badly wrong. The migration engine is a deployment system for your most stateful asset, and it is unforgiving in exactly the ways that matter at 2am.

**`schema.prisma` describes the desired state. `migrations/` is the history of how you actually got there. When they disagree, the folder wins, because the folder is what ran in production.**

1. **An applied migration is immutable.** Once it has run anywhere but your laptop, it is history. Prisma keeps a checksum in `_prisma_migrations`; editing the file makes every future `migrate deploy` fail with a drift error, and the fix under time pressure is always worse than the typo you were correcting.
2. **Schema changes are a two-phase problem.** Old code and new schema coexist during every deploy that lasts longer than zero seconds. Design for that window or accept 500s in it.
3. **The client's convenience is not free.** Every `include` is a query. Every loop containing an `await prisma.*` is N queries. Prisma will happily let you ship a request that issues 200 statements and still returns instantly against 12 rows of seed data. If you cannot explain what SQL a call emits, turn on `log: ['query']` until you can.

## 2. Tech Stack

- **Prisma** — https://github.com/prisma/prisma — licensed **Apache-2.0**. Schema DSL, migration engine, and a generated typed client.
- **PostgreSQL 14+** — the target in all examples. MySQL differs on shadow databases and native type handling.
- **Prisma Client 5.x+** — assumed throughout; `Prisma.validator` works from 4.x but is better in 5.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Prisma maintainers. All example code is original to this skill.

Recommended companions: TypeScript strict mode, a dedicated shadow database in CI, and `prisma migrate diff` as a pre-deploy check so drift fails the pipeline rather than the release.

## 3. Patterns

### 3.1 Relations and uniqueness, declared not inferred

```prisma
model Member {
  org    Org        @relation(fields: [orgId], references: [id], onDelete: Cascade)
  orgId  String
  user   User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId String
  role   MemberRole @default(MEMBER)

  @@id([orgId, userId])
  @@index([userId])
}

model Project {
  id        String   @id @default(cuid())
  orgId     String
  slug      String
  createdAt DateTime @default(now())

  @@unique([orgId, slug], name: "project_org_slug")
  @@index([orgId, createdAt(sort: Desc)])
}
```

- **`@@id([orgId, userId])`** — a composite key, not a surrogate `id` plus `@@unique`. A membership *is* the pair; a surrogate key invites two rows for the same pair with different roles.
- **`onDelete: Cascade` declared, not defaulted.** Prisma's default for a required relation is `Restrict`. Silence means deletes fail in production with a foreign key error nobody planned for.
- **`@@index([userId])`** — the composite PK indexes `(orgId, userId)`, which does nothing for "list my orgs." Every reverse lookup needs its own index; Prisma adds none.
- **`@@unique([orgId, slug])` not `slug @unique`** — global uniqueness means every tenant fights over `"website"`. The compound form is also what makes `findUnique({ where: { project_org_slug: { orgId, slug } } })` legal. Name it, or Prisma generates `orgId_slug` and renaming a field silently renames your client API.
- **`role MemberRole` (an `enum { OWNER ADMIN MEMBER }`), never `role String`.** A `String` column accepts `"activ"` and every typo after it.

### 3.2 `migrate dev` is a laptop tool

```bash
npx prisma migrate dev --name add_slug   # diffs, writes SQL, applies, regenerates. Can reset.
npx prisma migrate deploy                # applies pending migrations. Never generates, never resets.
npx prisma migrate dev --name rename --create-only   # writes the SQL, applies nothing. Edit, then apply.
```

If `migrate dev` appears in a deploy script, that script can wipe a database. There is no flag that makes it safe; there is only the other command. `--create-only` is the escape hatch whenever the generated SQL would be wrong — a rename, a backfill, a concurrent index. Edit the file *before* it has ever run; after that it is history.

### 3.3 Expand/contract: renaming without downtime

Prisma's autogenerated rename is `DROP COLUMN` + `ADD COLUMN`. It destroys the data and takes an exclusive lock. Rename in four deploys instead:

```sql
-- 1 (expand): nullable, no rewrite, returns instantly.
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
-- 2 (backfill): batched, outside the migration if the table is large.
UPDATE "User" SET "displayName" = "name" WHERE "displayName" IS NULL;
-- 3: ship code that reads displayName and dual-writes both columns.
-- 4 (contract), only once no running instance references "name":
ALTER TABLE "User" DROP COLUMN "name";
```

The same shape covers making a column `NOT NULL`, splitting a table, and changing a type. The rule: **during any deploy, both the previous and next version of your code must run against the current schema.** If that sentence is false, you have chosen an outage. Adding an index to a hot table gets its own file, alone — Prisma wraps migrations in a transaction, and `CREATE INDEX CONCURRENTLY` cannot run inside one.

### 3.4 The N+1 you will actually write, and `select` over `include`

```ts
// Wrong: 1 + N queries, scales with page size.
const projects = await prisma.project.findMany({ where: { orgId } })
for (const p of projects) p.owner = await prisma.user.findUnique({ where: { id: p.ownerId } })

// Right: 2 queries, regardless of page size.
const projects = await prisma.project.findMany({
  where: { orgId },
  select: { id: true, name: true, owner: { select: { id: true, displayName: true } } },
})
```

Be precise about what the engine does: a nested `select` resolves as **one additional query per relation level, not per parent row** — it collects parent keys and issues a single `IN (...)`. What it cannot rescue is an `await` inside a loop; those arrive separately and there is nothing to batch. Concurrent `findUnique` calls in one tick (`Promise.all`) do coalesce into one `IN`. Sequential `await`s do not. And note the `select`: `include: { owner: true }` is `SELECT *` with nicer syntax — it ships a `passwordHash`, a 40KB `bio`, or the column someone adds next quarter without thinking about this endpoint. `include` is fine in scripts and seeds; `select` is mandatory in anything serving a request.

### 3.5 Transactions: two kinds, one with a timer

```ts
// Sequential: one round trip, one transaction, no application logic in the middle.
// It fits more often than you think — reach for it first.
const [org, member] = await prisma.$transaction([createOrgQuery, createOwnerQuery])

// Interactive: control flow, and a clock.
await prisma.$transaction(async (tx) => {
  const seat = await tx.seat.findFirst({ where: { orgId, userId: null } })
  if (!seat) throw new NoSeatsAvailable()
  await tx.seat.update({ where: { id: seat.id }, data: { userId } })
}, { maxWait: 5_000, timeout: 15_000, isolationLevel: 'Serializable' })
```

Interactive transactions default to a **5s timeout and 2s maxWait**. Every `await` inside runs on that clock; exceeding it rolls back with `P2028`. So: never call an HTTP API, Stripe, or an LLM inside the callback — you are holding a Postgres connection open across the public internet. Never `Promise.all` inside one; it is one connection, one statement at a time. If you are raising `timeout` past ~15s, move work out of the transaction instead of raising it again. Use `Serializable` for read-then-write on contended rows and retry on `P2034`.

### 3.6 One PrismaClient, and the pooling trap

```ts
// lib/prisma.ts — each `new PrismaClient()` opens its own pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
})
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

In dev, every hot reload adds a pool, and around reload 12 Postgres refuses connections. Serverless is the mirror image: 200 warm Lambdas times `connection_limit=5` is 1000 connections against a Postgres allowing 100. Put a pooler in front (PgBouncer transaction mode) with `?pgbouncer=true&connection_limit=1` — `pgbouncer=true` disables prepared statements, which transaction-mode pooling cannot support. Then give the datasource both a pooled `url` (the client) and a `directUrl` (migrate), because `migrate` needs a session connection and fails through a transaction pooler in confusing ways.

### 3.7 Raw SQL: tagged templates only

```ts
// Safe: the tagged template parameterizes every interpolation.
const rows = await prisma.$queryRaw<Array<{ orgId: string; total: bigint }>>`
  SELECT "orgId", COUNT(*) AS total FROM "Project"
  WHERE "createdAt" >= ${since} GROUP BY "orgId" HAVING COUNT(*) > ${threshold}
`
// Unsafe: string concatenation with a longer name.
await prisma.$queryRawUnsafe(`SELECT * FROM "Project" WHERE "orgId" = '${orgId}'`)
```

`$queryRawUnsafe` exists for genuinely dynamic identifiers from a config file; if the value came from a request, compose with `Prisma.sql` and `Prisma.join`. Note `COUNT(*)` returns `bigint`, which `JSON.stringify` throws on — map it before it reaches a response.

### 3.8 Derive types; seed idempotently

```ts
const projectCardSelect = Prisma.validator<Prisma.ProjectSelect>()({
  id: true, name: true, createdAt: true,
  owner: { select: { id: true, displayName: true } },
  _count: { select: { tasks: true } },
})
export type ProjectCard = Prisma.ProjectGetPayload<{ select: typeof projectCardSelect }>

// Seeds are code you run a hundred times: idempotent by construction.
const org = await prisma.org.upsert({
  where: { slug: 'acme' }, update: {}, create: { slug: 'acme', name: 'Acme Inc' },
})
await prisma.project.createMany({ data: projectRows(org.id), skipDuplicates: true })
```

`Prisma.validator` type-checks the selection where it is defined, so a typo is a compile error in one file instead of a silent `undefined` in a component. Export the derived type to the frontend; never redeclare it.

A seed that only works on an empty database is a seed you stop running — everything writes through `upsert` or `skipDuplicates`, wired up under `"prisma": { "seed": "tsx prisma/seed.ts" }` so `migrate reset` runs it.

## 4. Anti-patterns

- **Editing an applied migration.** The checksum stops matching, `migrate deploy` refuses, and you are debugging your migration tool during a release. Write a new one.
- **`prisma db push` in anything with users, or `migrate dev` in CI.** `push` leaves production with a schema that has no history; `migrate dev` can prompt, can reset, and needs a shadow database. Both are laptop tools.
- **Autogenerating a rename.** `DROP` + `ADD` is data loss that Prisma warns about once and then writes. Use `--create-only`.
- **`include: true` on API paths.** You published every column of that table, including the ones added after this review.
- **HTTP calls inside `$transaction`.** A held connection plus a third-party timeout equals `P2028` plus a leak plus a half-written record.
- **`new PrismaClient()` per request or per module.** Pool multiplication: dies at reload 12 in dev, at your first spike in serverless.
- **`$queryRawUnsafe` with request data.** It is spelled "unsafe" on purpose.
- **`String` standing in for an enum, or ordering on `@default(now())` alone.** `status String` accepts `"activ"`; two rows in one transaction share a timestamp. Use `enum`, and order by `(createdAt, id)` when ties matter.

## 5. Usage

1. Paste this skill into your assistant's context, or install it as a project skill (Claude Code) / rule (Cursor).
2. Describe the change in domain terms plus the state of the target: "Add a `status` enum to Project. 4M rows in production, on Vercel behind PgBouncer."
3. Ask for, in order: (a) the `schema.prisma` diff, (b) the migration plan — one file or an expand/contract sequence, with `--create-only` SQL wherever the autogenerated version would lose data, (c) the queries using `select` and a `Prisma.validator` shape.
4. Check the plan against §3.3: can the currently-deployed code run against the new schema? If not, split it.
5. Run §4 as a pre-merge checklist.

The assistant should refuse to autogenerate a column rename, should never emit `migrate dev` or `db push` in a deploy script, and should flag any `$transaction` callback containing a network call.

## 6. Example Output

Prompt given with this skill loaded: *"Projects need owner transfer. Also add an archived flag — the table is large and live."*

```sql
-- Nullable timestamp, not a NOT NULL boolean: adding NOT NULL with a default to a
-- 4M-row table rewrites it under ACCESS EXCLUSIVE. Nullable is a catalog entry.
ALTER TABLE "Project" ADD COLUMN "archivedAt" TIMESTAMP(3);
-- ...and the index goes in its own migration, alone, because of CONCURRENTLY:
CREATE INDEX CONCURRENTLY "Project_org_archived_created_idx"
  ON "Project" ("orgId", "archivedAt", "createdAt" DESC);
```

```ts
export async function transferOwnership(projectId: string, toUserId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const { orgId } = await tx.project.findUniqueOrThrow({
      where: { id: projectId }, select: { orgId: true },
    })
    // The new owner must already belong to the owning org, or you just handed a
    // stranger a project inside someone else's tenant.
    const target = await tx.member.findUnique({
      where: { orgId_userId: { orgId, userId: toUserId } }, select: { role: true },
    })
    if (!target) throw new NotAnOrgMember(toUserId)

    const project = await tx.project.update({
      where: { id: projectId }, data: { ownerId: toUserId },
      select: { id: true, orgId: true, ownerId: true },
    })
    await tx.auditLog.create({ data: { orgId, actorId, action: 'OWNER_TRANSFERRED' } })
    return project
  }, { isolationLevel: 'Serializable', timeout: 10_000 })
}
```

Note what the output does *not* contain: no `archived Boolean @default(false)` (a table rewrite masquerading as a flag), no `include`, and no email notification inside the transaction — that gets enqueued after it commits, because a rolled-back transaction that already sent mail is a bug you cannot take back.
