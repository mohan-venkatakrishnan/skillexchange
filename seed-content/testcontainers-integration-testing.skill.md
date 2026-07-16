---
title: Integration Testing with Testcontainers Skill
category: Testing
description: Test against a real Postgres, Redis, or Kafka in Docker instead of a mock that lies — one container per suite, deterministic wait strategies, and truncation between tests so the suite finishes in seconds rather than minutes. Prevents the two failures that kill integration suites: a mock that silently drifted from the real database's behavior, and a container-per-test design that made the suite 40x slower than it needed to be.
usage: Load this skill before asking your AI assistant to add integration tests or a container harness to a Node/TypeScript repo. Tell it which real dependency to stand up and what to cover ("Postgres, test the migration and the unique-constraint path"), and it will produce a globalSetup that boots one container, a wait strategy tied to an observable readiness signal, and per-test truncation rather than recreation.
platforms: [Claude, Cursor, ChatGPT]
priceUsd: 0
timeSavedHours: 16
pocUrl: https://github.com/testcontainers/testcontainers-node
---

# Integration Testing with Testcontainers Skill

## 1. Philosophy

The integration layer answers one question unit tests structurally cannot: does this code work against the actual thing? Every rule here keeps that answer both true and cheap enough that you keep asking it.

1. **A mock of your database is a theory about your database.** Your fake repository returns `null` for a missing row. Real Postgres, under `READ COMMITTED`, with a partial unique index and a trigger, does something you did not predict. Every in-memory substitute — sqlite standing in for Postgres, a Map for Redis — is a hypothesis that rots silently. Boot the real image.
2. **Container startup is the budget; test execution is rounding error.** Postgres takes 800ms-2s to become ready. That cost is paid once per suite or once per test, and the difference between those sentences is a 9-second suite versus a 6-minute one.
3. **Readiness is an observable event, never a duration.** `sleep(3000)` is a bet that CI is never slower than your laptop. It loses about once a week, at 4pm, on someone else's PR.
4. **Isolate with truncation, not construction.** You need a clean database between tests, not a new one. Truncating twelve tables takes 3-8ms; booting Postgres takes 1,200ms. Both give isolation; one lets people run the suite.
5. **The container is disposable, the schema is not.** Run your real migrations against it on boot. If migrations only ever execute against a database that already has the schema, you have never tested them — and you'll learn that during a deploy.

## 2. Tech Stack

- **Testcontainers for Node** — https://github.com/testcontainers/testcontainers-node — licensed **MIT**. Programmatic API for throwaway Docker containers, with wait strategies, dynamic port mapping, and automatic cleanup.
- **@testcontainers/postgresql**, **@testcontainers/redis**, **@testcontainers/kafka** — predefined modules in the same repo, same **MIT** license. Thin wrappers with sane defaults; drop to `GenericContainer` whenever they get in the way.
- **Ryuk** (`testcontainers/moby-ryuk`) — https://github.com/testcontainers/moby-ryuk — **MIT**. The sidecar reaper that removes containers when the test process dies.
- Vitest as the runner in examples; Jest works the same. Docker or a compatible runtime (Podman, Colima, Rancher Desktop) on the host.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Testcontainers maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 One container per suite via globalSetup

The highest-leverage decision in this skill. A team put `beforeEach(async () => { pg = await new PostgreSqlContainer().start() })` in a 90-test suite: ninety boots, ninety migration runs, 11 minutes. Moved to one container in `globalSetup` with truncation between tests: 16 seconds. Same tests, same isolation, 40x.

```ts
// test/global-setup.ts
let container: StartedPostgreSqlContainer

export async function setup() {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('app_test').withUsername('app').withPassword('app')
    // This database dies in 20 seconds. fsync off is ~2-3x faster writes, zero risk.
    .withCommand(['postgres', '-c', 'fsync=off', '-c', 'full_page_writes=off'])
    .start()

  process.env.DATABASE_URL = container.getConnectionUri()
  await migrate(container.getConnectionUri())   // real migrations, once, against a real empty db
}

export async function teardown() { await container?.stop() }
```

Wire it up with `globalSetup: ['./test/global-setup.ts']`, `pool: 'forks'` (pg's native bindings are happier in forks), `poolOptions: { forks: { singleFork: true } }`, and `hookTimeout: 120_000` so the first run can pull the image.

`singleFork` earns a note. With several workers writing to one database, test A's `TRUNCATE` wipes rows test B just inserted — a failure that reproduces on 1 run in 6. Two ways out: serialize on one worker (simple, correct, usually fast enough), or give each worker its own schema inside the one container via `search_path`. Start with `singleFork`; reach for per-worker schemas when the suite crosses ~60 seconds.

### 3.2 Wait strategies: the readiness contract

"Started" means Docker created it, not that Postgres accepts connections — and Postgres specifically *lies*: the entrypoint starts the server, runs init scripts, then **restarts it**. A naive "port 5432 is open" check passes during that first temporary startup, your test connects, and the connection dies mid-suite. Hence the log strategy expecting the ready line **twice**.

```ts
// Log-based: precise, when the image emits a clear signal. Note the count of 2.
const pg = await new GenericContainer('postgres:16-alpine')
  .withEnvironment({ POSTGRES_PASSWORD: 'app', POSTGRES_DB: 'app_test' })
  .withExposedPorts(5432)
  .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
  .withStartupTimeout(120_000)
  .start()

// HTTP-based: assert the body, not just the 200 — the app itself declares readiness.
const api = await new GenericContainer('ghcr.io/acme/api:1.4.2')
  .withExposedPorts(8080)
  .withWaitStrategy(Wait.forHttp('/healthz', 8080).forStatusCode(200)
    .forResponsePredicate((body) => JSON.parse(body).db === 'connected'))
  .start()
```

Ranked by trustworthiness: **HTTP health predicate** > **log message** (precise, but couples you to a string a minor bump can change) > **listening ports** (weakest — a socket accepting TCP is not a service that loaded its config) > **`sleep`** (not a strategy, a wish). When neither signal alone suffices, compose them: `Wait.forAll([Wait.forListeningPorts(), Wait.forLogMessage(/started/)])`.

Pin image tags. `postgres:latest` means your readiness contract can change under you on a Tuesday, in CI, with no commit to blame.

### 3.3 Truncation between tests, and why not transaction rollback

```ts
// test/db-reset.ts — wire `beforeEach(resetDb)` into vitest's setupFiles
let tables: string[] | null = null

export async function resetDb() {
  if (!tables) {                                  // discovered once per worker, then cached
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`)
    tables = rows.map((r) => `"public"."${r.tablename}"`)
  }
  if (!tables.length) return
  // CASCADE handles FK order; RESTART IDENTITY makes ids deterministic per test. ~4ms.
  await pool.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`)
}
```

The tempting alternative — wrap each test in a transaction, roll back — is faster (~0.5ms) and a trap. Your production code can no longer use its own transactions without nesting into savepoints, `ON COMMIT` triggers never fire, `LISTEN/NOTIFY` never delivers, deferred constraints never check, and any code path that opens its own pool connection sees none of your test's data. The rollback trick tests your ORM. Truncation tests your application. Pay the 4ms.

Seed *inside* the test, not in a shared `beforeAll`. A shared seed becomes a load-bearing global, and deleting one row from it breaks nine unrelated tests two years later.

### 3.4 Testing migrations for real — the check nobody runs until it's 2am

Migrations are production code that executes once, in the highest-stakes moment. A disposable container is the only cheap place to actually run them.

```ts
// test/migrations.test.ts
describe('migrations', () => {
  let pg: StartedPostgreSqlContainer, pool: Pool

  beforeAll(async () => {
    // Its own container: this suite mutates schema, which would poison the shared one.
    pg = await new PostgreSqlContainer('postgres:16-alpine').start()
    pool = new Pool({ connectionString: pg.getConnectionUri() })
  }, 120_000)
  afterAll(async () => { await pool.end(); await pg.stop() })

  it('backfills existing rows rather than dropping them', async () => {
    // The check that matters. An empty-database migration test proves almost nothing.
    await migrateTo(pg.getConnectionUri(), '0007_pre_currency_split')
    await pool.query(`INSERT INTO invoices (id, amount_cents) VALUES ('inv_1', 4200)`)

    await migrateLatest(pg.getConnectionUri())

    const { rows } = await pool.query(`SELECT id, amount_cents, currency FROM invoices`)
    expect(rows).toEqual([{ id: 'inv_1', amount_cents: 4200, currency: 'USD' }])  // backfilled
  })
})
```

Migrate to N-1, insert real rows, migrate forward, assert they survived. Migrations that pass against an empty database and destroy data against a populated one are the standard production incident.

### 3.5 Reuse locally, cold in CI; Ryuk; docker-in-docker

**Ryuk** is the reaper sidecar. It holds a connection to your test process; when that dies — including `SIGKILL`, including a crashed worker — Ryuk removes everything labelled with your session. That's why a killed run doesn't leave a Postgres eating 400MB until you notice next Thursday. Don't disable it unless your CI genuinely forbids the socket mount, and if you do, own the cleanup in a `finally`.

**Reuse** keeps a container alive between runs and re-attaches by config hash, turning a 1.5s boot into ~0ms locally. Gate it — `const c = new PostgreSqlContainer('postgres:16-alpine'); if (!process.env.CI) c.withReuse()` — because reuse in CI is actively wrong: a reused container carries state from the previous run, so a test depending on leftover rows passes in CI and fails for the developer with a clean machine. That's the worst polarity of flake, because CI is the thing you trust. Reuse also bypasses Ryuk by design, so `docker rm -f` becomes your job.

**In CI**, Testcontainers needs a daemon. Three shapes, ranked: a **host runner with Docker installed** (`ubuntu-latest`) is simplest and needs no configuration. A **socket mount** makes containers siblings of your job rather than children — fast, no nested storage driver, but siblings live on the host's network namespace, so `getHost()` may not be `localhost` from inside your job container; trust `getHost()` and never hardcode. **True docker-in-docker** (privileged `dind`) is the last resort for Kubernetes-backed runners: nested overlayfs is slower, you must wire `DOCKER_HOST=tcp://docker:2376` plus TLS certs, and image pulls don't share the host cache.

Cache the pull. A cold `docker pull postgres:16-alpine` is 3-8 seconds of every run; pre-pulling in an earlier step is free money.

## 4. Anti-patterns

- **A container per test.** The 40x. `beforeEach(start)` looks like hygiene and is the most expensive line you can write here.
- **`await sleep(3000)` instead of a wait strategy.** A duration tuned to the machine that wrote it. Your CI box is slower under load, your laptop is faster, and the test fails on exactly one of them.
- **`Wait.forListeningPorts()` on Postgres.** The entrypoint starts, inits, and restarts the server; your connection lands in the gap. `Wait.forLogMessage(/ready to accept connections/, 2)`.
- **Hardcoding `localhost:5432`.** Testcontainers maps to a random free host port precisely so four suites can share a CI box. Use `getHost()` + `getMappedPort(5432)`; a fixed host port works alone and collides the moment two suites overlap, surfacing as a bewildering `EADDRINUSE` in a test that has nothing to do with ports.
- **`getMappedPort()` for container-to-container traffic.** The host port doesn't exist on the container network. Put both on a `Network`, give the dependency an alias, and use the *internal* port — `postgresql://app:app@db:5432/app_test`.
- **`withReuse()` unconditionally.** Ships stale state into CI. Passes there, fails on a clean checkout, and you spend a day distrusting the test instead of the config.
- **Disabling Ryuk to "speed things up".** Saves ~150ms once, leaks a container per killed run. Two weeks later a laptop has eleven orphaned Postgres instances and no memory.
- **Transaction-rollback isolation.** Kills `ON COMMIT` triggers, `LISTEN/NOTIFY`, deferred constraints, and any path that grabs its own pool connection. You're testing your ORM's transaction wrapper.
- **`:latest` image tags.** The readiness log line, the default auth method, the config defaults — any can change with no commit of yours to bisect.
- **Parallel workers against one database with no schema separation.** Worker A truncates mid-flight through worker B. Fails 1 run in 6, always in CI.

## 5. Usage

1. Load this skill in a repo with `testcontainers` installed and a reachable daemon — `docker info` must succeed before you debug anything else.
2. State the dependency, the image tag, and the behavior: "Postgres 16. Cover the partial unique index on `invoices(customer_id) WHERE status='open'` — the duplicate insert must raise, not upsert." Say whether the code under test opens its own connections.
3. Expect output in this order: the `globalSetup` booting one container and running real migrations, the `resetDb` truncation helper wired into `setupFiles`, then the tests.
4. Reject output containing `sleep`, a hardcoded host port, `beforeEach`-level container starts, `withReuse()` without a `CI` guard, or `:latest`. Ask it to re-derive readiness from an observable signal.
5. For a slow suite, ask for a startup budget first: how many container boots per run, how many image pulls. The answer is almost always "N boots, should be 1" — fix that before touching the tests.

## 6. Example Output

Prompt with this skill loaded: *"Integration-test the outbox publisher: it should claim pending rows with `FOR UPDATE SKIP LOCKED`, publish to Redis, mark them sent, and leave rows alone if the publish fails."*

```ts
// test/outbox-publisher.test.ts
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis'
import { publishOutboxBatch } from '../src/outbox/publisher'

// Postgres comes from globalSetup (one container, whole suite).
// Redis is suite-local because only these tests need it.
let redis: StartedRedisContainer, client: Redis, pool: Pool

beforeAll(async () => {
  redis = await new RedisContainer('redis:7-alpine').start()
  client = new Redis(redis.getConnectionUrl())     // dynamic host + port, never hardcoded
  pool = new Pool({ connectionString: process.env.DATABASE_URL })
}, 120_000)

afterAll(async () => { client.disconnect(); await pool.end(); await redis.stop() })
beforeEach(async () => { await client.flushall() })   // db truncation lives in setupFiles

async function seedPending(count: number) {
  const values = Array.from({ length: count }, (_, i) =>
    `('evt_${i}', 'invoice.paid', '{"id":"inv_${i}"}'::jsonb, 'pending')`).join(',')
  await pool.query(`INSERT INTO outbox (id, topic, payload, status) VALUES ${values}`)
}

describe('publishOutboxBatch', () => {
  it('publishes pending rows and marks them sent in one transaction', async () => {
    await seedPending(3)
    expect(await publishOutboxBatch({ pool, redis: client, batchSize: 10 })).toBe(3)

    const { rows } = await pool.query(`SELECT status FROM outbox ORDER BY id`)
    expect(rows.map((r) => r.status)).toEqual(['sent', 'sent', 'sent'])
    expect(await client.llen('stream:invoice.paid')).toBe(3)
  })

  it('concurrent publishers never double-publish a row (SKIP LOCKED)', async () => {
    // Why this suite exists: no mock of pg reproduces row-level lock semantics.
    await seedPending(6)
    const [a, b] = await Promise.all([
      publishOutboxBatch({ pool, redis: client, batchSize: 6 }),
      publishOutboxBatch({ pool, redis: client, batchSize: 6 }),
    ])
    expect(a + b).toBe(6)                                     // each row claimed exactly once
    expect(await client.llen('stream:invoice.paid')).toBe(6)  // no duplicates on the wire
  })

  it('rolls back the status update when the publish throws', async () => {
    await seedPending(2)
    client.disconnect()   // real failure: the broker vanishes mid-batch

    await expect(publishOutboxBatch({ pool, redis: client, batchSize: 10 })).rejects.toThrow()
    const { rows } = await pool.query(`SELECT status FROM outbox`)
    expect(rows.every((r) => r.status === 'pending')).toBe(true)   // nothing silently lost
  })
})
```

Markers of skill-compliant output: Postgres arrives from the shared `globalSetup` while only Redis — needed by this file alone — starts locally; both connections are built from `getConnectionUrl()`/`getHost()` rather than a fixed port; per-test cleanup is `flushall` plus the suite-wide `TRUNCATE` instead of a container restart; image tags are pinned; seeding happens inside each test through a factory rather than a shared global; and the third test asserts a `SKIP LOCKED` concurrency guarantee no in-memory fake could reproduce — which is precisely the reason to pay for a real container at all.
