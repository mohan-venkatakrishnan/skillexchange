---
title: Typed SQL with Drizzle ORM Skill
category: Coding
description: Use Drizzle as what it is — SQL with a type checker attached — instead of pretending it is an object mapper. Covers schema-in-TypeScript, insert vs select inference, relations() versus real joins, prepared statements, the drizzle-kit workflow, and the serverless pooling traps.
usage: Load this skill before asking your AI assistant to write Drizzle schema or queries. Say "use the typed SQL with Drizzle skill" and describe the table or query you need; the assistant will produce schema, migrations, and queries that stay close to the SQL you would have written by hand, with types derived rather than declared.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 12
pocUrl: https://github.com/drizzle-team/drizzle-orm
---

# Typed SQL with Drizzle ORM Skill

## 1. Philosophy

Every ORM eventually asks you to learn its opinions about your database. Drizzle's bet is to skip that step: the query builder is a thin typed surface over SQL, and the schema file is a TypeScript description of DDL you could have written yourself.

**It is SQL, not magic. If you cannot picture the statement, you are writing the query wrong.**

This cuts both ways, and both directions matter:

1. **Nothing is lazy, nothing is hidden.** No lazy-loading, no dirty-checking, no identity map, no session flush. A query happens when you `await` it, it is one statement, and it is the statement you described. That is the whole value proposition — do not go looking for the magic and be disappointed it is absent.
2. **Types are inferred from the schema, never declared beside it.** The instant you hand-write an `interface User` next to your `users` table you own two sources of truth, and one is already wrong. `$inferSelect` and `$inferInsert` exist so a schema change becomes a compile error instead of a runtime `undefined`.
3. **Your SQL knowledge is the skill; Drizzle is the keyboard.** If you do not know why a query is slow, Drizzle will faithfully send your slow query. The upside: `EXPLAIN ANALYZE` on the output is always intelligible, because the output is always something a human could have typed.

Choose Drizzle when you want SQL with guardrails. If you want an ORM that decides things for you, that is a legitimate want — but do not fight this one into being it.

## 2. Tech Stack

- **Drizzle ORM** — https://github.com/drizzle-team/drizzle-orm — licensed **Apache-2.0**. Typed query builder, TypeScript-native schema DSL, and the `drizzle-kit` migration CLI.
- **PostgreSQL 14+** via `drizzle-orm/pg-core` — the dialect in every example. MySQL and SQLite share the shape but differ on `returning()` and index syntax.
- **drizzle-kit 0.20+** — `generate` and `migrate`, per §3.4.
- **drizzle-zod** (MIT) — optional, §3.8, for deriving request validators from the same tables.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Drizzle ORM maintainers. All example code is original to this skill.

Recommended companions: TypeScript strict mode (inference degrades to `any`-shaped noise without it) and a driver chosen deliberately per §3.9.

## 3. Patterns

### 3.1 The schema file is your DDL

Indexes live here too — an index that exists only in a migration is an index nobody knows about.

```ts
export const memberRole = pgEnum('member_role', ['owner', 'admin', 'member'])

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const members = pgTable('members', {
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: memberRole('role').notNull().default('member'),
}, (t) => ({
  pk: primaryKey({ columns: [t.orgId, t.userId] }),
  // The PK indexes (org_id, user_id). "List my orgs" scans without this one.
  byUser: index('members_user_idx').on(t.userId),
}))

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Scoped to the tenant. A global unique slug means tenants fight over "website".
  orgSlug: uniqueIndex('projects_org_slug_idx').on(t.orgId, t.slug),
  feed: index('projects_feed_idx').on(t.orgId, t.createdAt.desc()),
}))
```

Two habits to form immediately: name columns explicitly (`uuid('org_id')`) so TS stays camelCase while the database stays snake_case, and always pass `{ withTimezone: true }` — a `timestamp` without it is a lie you discover during a daylight-saving transition.

### 3.2 Insert and select are different types

```ts
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
```

These are not the same shape, and the difference is the point. On `Project`, `id` and `createdAt` are always present because the database always returns them. On `NewProject` they are **optional**, because they have defaults. `archivedAt` is nullable on select and optional on insert. `name` is required on both.

That distinction is exactly what a hand-written interface gets wrong. Derive both, and let signatures say which they mean:

```ts
export async function createProject(input: NewProject): Promise<Project> {
  const [row] = await db.insert(projects).values(input).returning()
  return row
}
```

Forget `orgId` and it is a red squiggle. Add a `NOT NULL` column with no default next month and every call site breaks at compile time — which is the entire reason you pay the TypeScript tax.

### 3.3 `relations()` and joins solve different problems

```ts
// Emits no SQL, creates no foreign key. It teaches db.query to assemble trees.
export const projectsRelations = relations(projects, ({ one }) => ({
  org: one(orgs, { fields: [projects.orgId], references: [orgs.id] }),
}))
export const orgsRelations = relations(orgs, ({ many }) => ({ projects: many(projects) }))
```

```ts
// db.query: you want a nested object back and the shape is the point.
const org = await db.query.orgs.findFirst({
  where: eq(orgs.slug, slug),
  columns: { id: true, name: true },
  with: {
    projects: {
      columns: { id: true, name: true },
      where: isNull(projects.archivedAt),
      orderBy: desc(projects.createdAt),
      limit: 20,
    },
  },
}) // -> { id, name, projects: [...] }, one query, lateral join.
```

```ts
// A real join: flat rows, aggregates, filters spanning tables. The relational
// API cannot express this cleanly; SQL can.
const rows = await db
  .select({ orgName: orgs.name, projectCount: count(projects.id) })
  .from(orgs)
  .leftJoin(projects, eq(projects.orgId, orgs.id))
  .where(isNull(projects.archivedAt))
  .groupBy(orgs.id, orgs.name)
  .having(gt(count(projects.id), 3))
```

The rule: **`db.query` for reads feeding a UI tree; `db.select` for anything with an aggregate, a window function, or a `having`.** Note the join result shape — a `leftJoin` without a `select()` projection returns `{ orgs: {...}, projects: {...} | null }`, nested by table name. That `| null` is real and TypeScript will make you handle it.

### 3.4 Partial selects are the default, not an optimization

```ts
const bad  = await db.select().from(users).where(eq(users.orgId, orgId))  // SELECT *
const good = await db.select({ id: users.id, displayName: users.displayName })
  .from(users).where(eq(users.orgId, orgId))
```

`db.select()` with no argument ships every column, including the password hash and the 40KB bio. The same applies to `db.query` — pass `columns: {...}` or you get the whole row. There is also `columns: { passwordHash: false }` as a denylist, which is strictly worse: the next sensitive column defaults to exposed.

### 3.5 drizzle-kit: generate SQL, read it, commit it

```ts
export default defineConfig({
  schema: './db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DIRECT_URL! }, // unpooled: migrations need a session
  strict: true,
  verbose: true,
})
```

```bash
npx drizzle-kit generate --name add_project_archived   # writes SQL, applies nothing
# READ drizzle/0007_add_project_archived.sql. Every time. It is four lines.
npx drizzle-kit migrate                                # applies pending migrations
```

The generated `.sql` files and the `drizzle/meta/` snapshots **go into git and get reviewed like code**. This is the highest-leverage habit in the toolchain: the diff shows a reviewer `DROP COLUMN "name"` in plain SQL, before it runs, while it is still cheap. An ORM that hides its DDL cannot offer you that.

`drizzle-kit push` skips the file and syncs directly. It is for prototypes and throwaway branch databases. If a database has users, it has migrations.

When the generator guesses wrong — most often a rename, rendered as drop-plus-add — edit the file before it has ever run:

```sql
ALTER TABLE "users" RENAME COLUMN "name" TO "display_name";
--> statement-breakpoint
CREATE INDEX CONCURRENTLY "users_display_name_idx" ON "users" ("display_name");
```

Once a migration has run anywhere but your laptop, it is history. Write a new one.

### 3.6 Prepared statements for the hot path

Drizzle builds the SQL string on every call. For a per-request query, build it once at module load:

```ts
const projectsByOrg = db
  .select({ id: projects.id, name: projects.name })
  .from(projects)
  .where(and(eq(projects.orgId, sql.placeholder('orgId')), isNull(projects.archivedAt)))
  .orderBy(desc(projects.createdAt))
  .limit(sql.placeholder('limit'))
  .prepare('projects_by_org')

const rows = await projectsByOrg.execute({ orgId, limit: 20 })
```

Two caveats that bite. The shape is frozen — you cannot conditionally add a `where`, because that is a different statement; dynamic filters need `$dynamic()` and a builder, and those do not prepare. And prepared statements are per-connection: behind a transaction-mode pooler the connection under you changes between calls and the plan is not there. See §3.9.

### 3.7 Transactions, and the `sql` template's escaping rules

```ts
await db.transaction(async (tx) => {
  const [org] = await tx.insert(orgs).values({ slug, name }).returning()
  await tx.insert(members).values({ orgId: org.id, userId, role: 'owner' })
})
```

`tx` is a full database handle. The rule people break: **use `tx`, never the outer `db`, inside the callback.** A stray `db.insert(...)` runs on a different connection, outside the transaction, and survives the rollback. It type-checks perfectly and it is the hardest Drizzle bug to spot in review. Roll back explicitly with `tx.rollback()`, which throws — and keep network calls out entirely.

```ts
// Values interpolate as bound parameters. Safe.
sql`SELECT id FROM projects WHERE org_id = ${orgId} AND created_at > ${since}`
// Identifiers do NOT parameterize. This is concatenation in a costume.
sql`SELECT * FROM projects ORDER BY ${sortColumn}` // wrong
```

Bound parameters can only ever be values. A column name or a sort direction is part of the statement's structure, so you allowlist it yourself:

```ts
const SORTABLE = { createdAt: projects.createdAt, name: projects.name } as const
function sortBy(key: string, dir: 'asc' | 'desc') {
  const col = SORTABLE[key as keyof typeof SORTABLE]
  if (!col) throw new BadRequest(`unsortable: ${key}`)
  return dir === 'asc' ? asc(col) : desc(col)
}
```

`sql.raw()` is only for strings you wrote in the source file. If it arrived in a request, it goes through a map like that one.

### 3.8 drizzle-zod: one source of truth to the edge

```ts
export const insertProjectSchema = createInsertSchema(projects, {
  // Refine only where the product rule is tighter than the database constraint.
  slug: (s) => s.regex(/^[a-z0-9-]{3,40}$/, 'lowercase, dashes, 3-40 chars'),
  name: (s) => s.min(1).max(120),
}).omit({ id: true, createdAt: true, archivedAt: true })

export type CreateProjectInput = z.infer<typeof insertProjectSchema>
```

Schema, type, and runtime validator now move together: add a `NOT NULL` column and the validator demands it without you editing the validator. The `.omit()` matters — server-controlled columns must never be settable from a request body, or you have built mass assignment with excellent types.

### 3.9 Drivers and pooling: pick deliberately

```ts
// Long-lived Node server: a real pool, module-scoped, reused across requests.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
export const db = drizzle(pool, { schema })

// Edge / serverless: HTTP driver. No sockets, no pool, no cold-start handshake.
export const db = drizzle(process.env.DATABASE_URL!, { schema }) // drizzle-orm/neon-http
```

Drizzle is driver-agnostic, which quietly makes the driver choice yours to get wrong:

- **Never create the pool inside a request handler.** One pool per process. Module scope survives warm invocations; a per-request pool exhausts `max_connections` on your first spike.
- **Behind a transaction-mode pooler, disable prepared statements** — `postgres(url, { prepare: false })`. Skip it and you get intermittent "prepared statement does not exist" errors that never reproduce locally.
- **HTTP drivers cannot do interactive transactions.** Each statement is its own request. Check this before you architect around the edge runtime, not after.

## 4. Anti-patterns

- **Hand-writing an interface next to the table.** Two sources of truth; the schema is the one that ships. Use `$inferSelect` / `$inferInsert`.
- **Reaching for `db.query` because joins feel scary.** It cannot do aggregates, windows, or `having`. Learning `leftJoin` takes an afternoon; working around it takes quarters.
- **`db.select()` with no projection on an API route.** `SELECT *` forever, including the column added after this review.
- **`drizzle-kit push` against a database with users.** No file means no history, no review, no rollback story.
- **Merging a generated migration unread.** The generator renders a rename as `DROP` + `ADD`. It is four lines in the diff.
- **Editing a migration that has already run.** The hash no longer matches the journal and `migrate` refuses.
- **`db` instead of `tx` inside a transaction callback.** Type-checks, commits outside the transaction, survives the rollback. Grep for it.
- **`sql.raw()` on a request value.** Bound parameters cover values only; identifiers get an allowlist.
- **A pool per request in serverless.** Connection exhaustion under load, always at the worst moment.
- **Prepared statements through a transaction pooler.** Set `prepare: false` or accept phantom errors.
- **Indexes declared only in migration SQL.** They drift, and the next `generate` may propose dropping them. Declare them in `pgTable`.
- **`timestamp` without `withTimezone: true`.** You stored a wall clock and called it an instant.

## 5. Usage

1. Paste this skill into your assistant's context, or install it as a project skill (Claude Code) / rule (Cursor).
2. State the runtime and driver with the task: "Add a projects feed. Node server, `postgres` driver behind PgBouncer transaction mode, ~2M rows."
3. Ask for, in order: (a) the `pgTable` definitions with indexes inline, (b) the `drizzle-kit generate` SQL to review before it runs, (c) the queries — `db.query` or `db.select` per §3.3 — with explicit projections, prepared if hot.
4. Read the generated SQL. If you cannot picture the statement a query emits, ask for `.toSQL()` before you merge it.
5. Run §4 as a pre-merge checklist.

The assistant should refuse to emit `drizzle-kit push` for a production database, should never project with a bare `select()` on a request path, and should flag any `sql.raw()` carrying user input.

## 6. Example Output

Prompt given with this skill loaded: *"Paginated, searchable project list for an org. Serverless, Neon HTTP driver."*

```ts
const listSchema = z.object({
  q: z.string().trim().max(80).optional(),
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

export async function listProjects(orgId: string, raw: unknown) {
  const { q, cursor, limit } = listSchema.parse(raw)

  const filters = [eq(projects.orgId, orgId), isNull(projects.archivedAt)]
  if (q) filters.push(ilike(projects.name, `%${q}%`))
  if (cursor) filters.push(lt(projects.createdAt, new Date(cursor)))

  const rows = await db
    .select({ id: projects.id, name: projects.name, createdAt: projects.createdAt })
    .from(projects)
    .where(and(...filters))
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return { items: page, nextCursor: hasMore ? page.at(-1)!.createdAt.toISOString() : null }
}
```

Note what the output does *not* contain: no bare `select()`, no `OFFSET` (keyset pagination, because offset 10000 reads 10020 rows and the page shifts under a concurrent insert), no `.prepare()` (the filter list is dynamic, so a prepared statement cannot express it), and no transaction — the HTTP driver could not run an interactive one anyway. The `q` value interpolates as a bound parameter; the sort order is fixed in the source, never taken from the request.
