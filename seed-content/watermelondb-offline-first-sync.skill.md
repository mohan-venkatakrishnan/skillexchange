---
title: Offline-First Sync with WatermelonDB Skill
category: Mobile
description: Build a mobile app that reads instantly on a dead train and reconciles cleanly when signal returns — a lazy SQLite model layer, an idempotent pull/push protocol, and the server contract that makes the client's optimism safe. Focused on the parts the docs leave to you: clock skew, conflict rules you can defend, and migrations that don't wipe a user's unsynced work.
usage: Load this skill before asking your assistant to add offline storage or sync to a React Native app. Describe your entities, which side owns which field, and your conflict rule ("server wins on price, client wins on notes") and it will produce the schema, models, migrations, and both halves of the sync contract rather than a naive replace-everything pull.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 30
pocUrl: https://github.com/Nozbe/WatermelonDB
---

# Offline-First Sync with WatermelonDB Skill

## 1. Philosophy

Offline-first is not caching. Caching is an optimisation you can turn off; offline-first is a claim that the local database is the app's real database and the network is a background reconciliation detail. Once you make that claim, every hard problem becomes a data-modelling problem you must answer explicitly.

1. **The UI reads local, always.** No spinner, no `isLoading`, no network in the render path. If a screen can't render from SQLite alone, the model is wrong, not the screen.
2. **Sync is a protocol, not a function call.** Pull-since-timestamp, push-local-changes, mark-synced. Every step must be idempotent, because the process gets killed mid-flight and the whole thing runs again from a half-applied state.
3. **Conflict resolution is a product decision.** "Last write wins" is a decision — usually a bad one, silently made. Decide per field who owns the truth, and write it down before you write the resolver.
4. **The server's clock is the only clock.** Device time is user-editable, drifts, and jumps across timezones. Every sync watermark comes from the server or your windowing is subtly, permanently broken.
5. **Unsynced local work is sacred.** A migration, a logout, or a schema bump that discards records the user created on a plane is not a bug report — it's a one-star review and a refund.

## 2. Tech Stack

- **WatermelonDB** — https://github.com/Nozbe/WatermelonDB — licensed **MIT**. Lazy, observable model layer over SQLite with a built-in sync engine.
- **React Native** — https://github.com/facebook/react-native — **MIT**. Host runtime; the JSI SQLite adapter binds directly into it.
- **@nozbe/with-observables** — ships alongside WatermelonDB, **MIT**. Connects observable queries to React components.
- Server side is deliberately unopinionated — the contract below is plain HTTP and works against any backend that can filter by timestamp.
- TypeScript throughout; decorators require `experimentalDecorators`.

This skill is an independent, original guide; it is not affiliated with or endorsed by the WatermelonDB maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Schema: flat, indexed, sync-aware

```ts
// model/schema.ts
import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const schema = appSchema({
  version: 4,                                    // bump with EVERY structural change
  tables: [
    tableSchema({
      name: 'reports',
      columns: [
        { name: 'site_id', type: 'string', isIndexed: true },   // index every FK you query on
        { name: 'title', type: 'string' },
        { name: 'body', type: 'string' },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'severity', type: 'number' },
        { name: 'server_updated_at', type: 'number' },          // server's clock, not ours
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sites',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'lat', type: 'number', isOptional: true },
        { name: 'lng', type: 'number', isOptional: true },
      ],
    }),
  ],
})
```

Columns are typed `string | number | boolean` and nothing else. No JSON column type, no date type — store epoch milliseconds and convert at the model. Every field you'll ever filter or sort on needs `isIndexed: true`; a 20,000-row unindexed scan on a mid-range Android is a visible stall, not a micro-optimisation.

`server_updated_at` sitting beside Watermelon's own `updated_at` is deliberate. Watermelon's is local, touched on local writes; the server's is the one you compare for conflicts. Conflating them is how you get resolvers that appear correct and are wrong under skew.

### 3.2 The adapter: JSI on, and the fallback that will surprise you

```ts
// model/database.ts
import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { schema } from './schema'
import { migrations } from './migrations'
import { Report, Site } from './models'

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,                       // synchronous JSI path; the async fallback is ~2-5x slower
  dbName: 'fieldnote',
  onSetUpError: (error) => {
    // Fires when the DB can't open or migrate. Do NOT silently reset — you'd delete
    // unsynced work. Report it, show a repair screen, let the user decide.
    reportFatal('watermelon_setup_failed', error)
  },
})

export const database = new Database({ adapter, modelClasses: [Report, Site] })
```

`jsi: true` requires the New Architecture (or the JSI-enabled old-arch setup) on both platforms; if the native side isn't wired, Watermelon quietly falls back to the async bridge adapter and everything still works — just slower, with no error. That silence is the trap: teams ship the fallback for a year and blame SQLite for the jank.

Never wire `onSetUpError` to "delete the database and start fresh." It's the most tempting three lines in this file and it discards exactly the data the user cared about most.

### 3.3 Sync: the client half is small; the contract is the work

```ts
// sync/sync.ts
import { synchronize } from '@nozbe/watermelondb/sync'
import { database } from '../model/database'

let inFlight: Promise<void> | null = null

export function syncNow(): Promise<void> {
  // Concurrent syncs corrupt the watermark: two pulls, one lastPulledAt, lost changes.
  if (inFlight) return inFlight
  inFlight = runSync().finally(() => { inFlight = null })
  return inFlight
}

async function runSync() {
  await synchronize({
    database,
    sendCreatedAsUpdated: true,     // server upserts; removes a whole class of 409 handling

    pullChanges: async ({ lastPulledAt, schemaVersion, migration }) => {
      const params = new URLSearchParams({
        since: String(lastPulledAt ?? 0),
        schemaVersion: String(schemaVersion),
      })
      // `migration` is non-null right after a schema bump: it names the tables/columns
      // added since the client's last sync so the server can backfill them.
      if (migration) params.set('migration', JSON.stringify(migration))

      const res = await fetch(`${API}/sync?${params}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`pull failed: ${res.status}`)

      // timestamp MUST be the server's clock, echoed back, or windows drift with device time.
      const { changes, timestamp } = await res.json()
      return { changes, timestamp }
    },

    pushChanges: async ({ changes, lastPulledAt }) => {
      const res = await fetch(`${API}/sync`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ changes, lastPulledAt }),
      })
      // 409 means the server saw newer data than our watermark: abort, pull, retry.
      if (res.status === 409) throw new Error('stale_watermark')
      if (!res.ok) throw new Error(`push failed: ${res.status}`)
    },

    migrationsEnabledAtVersion: 1,   // lets the server backfill instead of forcing a full resync
  })
}
```

The server contract, stated plainly, because this is where the project actually succeeds or fails:

- **Pull** returns everything changed strictly after `since`, per table, shaped `{ created, updated, deleted }` where `deleted` is an array of ids. It returns `timestamp` from the server's own clock — taken *before* the query runs, never after, or records written during the query are lost forever.
- **Pull must exclude nothing based on who wrote it.** Tempting to filter out the caller's own pushes; don't. Echoing them back is how the client learns the server's canonical values.
- **Push applies changes in one transaction** and rejects with 409 if any record's server timestamp is newer than `lastPulledAt`. Without that check, a client with a stale watermark silently overwrites another device's work.
- **Ids are client-generated.** Watermelon creates the id locally so an offline record is referenceable immediately. A server that assigns its own ids breaks every relation created offline.

### 3.4 Conflict resolution you can defend

Watermelon's default is column-level last-write-wins: on pull, the server value overwrites the local one *except* for columns the local record has marked as changed. That's a reasonable default and a poor policy for anything a human typed.

```ts
await synchronize({
  database,
  pullChanges,
  pushChanges,
  conflictResolver: (table, local, remote, resolved) => {
    if (table === 'reports') {
      // Server owns lifecycle. If it says approved, the local draft edit is stale.
      if (remote.status === 'approved') return

      // The client owns free text the user typed. Never let a background pull
      // silently eat a paragraph someone wrote in a tunnel.
      if (local._changed?.includes('body')) resolved.body = local.body
    }
  },
})
```

Ownership per field, decided once, is the entire discipline. "Whoever wrote last" means a user's field notes vanish because a colleague touched an unrelated column two minutes later — and no error appears anywhere.

### 3.5 Migrations, or the reset you can never take back

```ts
// model/migrations.ts
import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema/migrations'

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 4,
      steps: [addColumns({ table: 'reports', columns: [{ name: 'severity', type: 'number' }] })],
    },
    {
      toVersion: 3,
      steps: [createTable({ name: 'sites', columns: [{ name: 'name', type: 'string' }] })],
    },
  ],
})
```

Bump `schema.version` without a matching migration step and Watermelon does the only thing it can: drops the database and rebuilds it. Every unsynced record on that device is gone, permanently, with no warning in the UI. This is the single most expensive mistake in the library and it looks exactly like a normal schema edit in code review.

Watermelon's migration steps cannot rename or drop columns. To rename, add the new column, backfill it in a migration-adjacent write, and leave the old one as dead weight. Ugly, and cheaper than the alternative.

### 3.6 Reading: observables, not fetches

```tsx
// screens/ReportList.tsx
import { withObservables } from '@nozbe/watermelondb/react'
import { Q } from '@nozbe/watermelondb'

const enhance = withObservables(['siteId'], ({ siteId }: { siteId: string }) => ({
  // Lazy: this query is not run until observed, and re-emits only on relevant writes.
  reports: database.get<Report>('reports')
    .query(Q.where('site_id', siteId), Q.where('status', Q.notEq('archived')), Q.sortBy('created_at', Q.desc))
    .observeWithColumns(['title', 'status']),   // re-render only when these columns change
}))

export const ReportList = enhance(({ reports }: { reports: Report[] }) => (
  <FlatList data={reports} keyExtractor={(r) => r.id} renderItem={({ item }) => <Row report={item} />} />
))
```

`observe()` re-emits when the result *set* changes — add, remove, reorder. `observeWithColumns([...])` also re-emits when a listed column changes on a member. Use plain `observe()` for a list of ids, `observeWithColumns` for a list showing fields. Passing every column to `observeWithColumns` re-renders the list on every unrelated write and is the usual cause of "Watermelon is slow."

## 4. Anti-patterns

- **Bumping `schema.version` without a migration.** The database resets and unsynced work is destroyed. There is no recovery and no notification.
- **Trusting the device clock.** `Date.now()` as a sync watermark breaks the moment a user changes their timezone or their clock drifts. The server's timestamp, echoed through pull, is the only correct source.
- **Concurrent syncs.** Two `synchronize()` calls racing produce a watermark that skips a window; the missing records never come back because they're older than `since` forever after. Serialise with a single in-flight promise.
- **A server timestamp taken after the query.** Records written during the query fall between the window edges and are permanently invisible to that client.
- **Filtering the caller's own writes out of pull.** The client never learns the server's canonical values — normalisation, defaults, computed fields — and the two diverge silently.
- **Server-assigned ids.** Every offline-created relation points at nothing until sync. Watermelon generates ids locally for exactly this reason.
- **`onSetUpError` that deletes the database.** The most tempting recovery path in the codebase, and it eats the user's most valuable data.
- **Default last-write-wins on human-authored text.** Someone's notes disappear because a colleague edited a status. Own the field explicitly in `conflictResolver`.
- **Shipping without checking `jsi: true` took effect.** The async fallback is silent and several times slower. Verify on device rather than assuming.
- **`observeWithColumns` with every column.** Every write anywhere re-renders the whole list, and you conclude the library is at fault.

## 5. Usage

1. Load this skill with your entity list and, for each field, who owns it — client, server, or "immutable once set." That table is the actual design; the code follows from it.
2. Ask for the contract, not just the client: "Reports and sites, offline-editable, server owns `status`. Give me schema, migrations, sync client, and the endpoint spec my backend must satisfy."
3. Expect output in this order: schema, models, migrations, `synchronize` wiring, then the server contract in prose. If migrations aren't in the answer, the assistant has already set you up for a data-loss bug.
4. Reject any output that uses `Date.now()` as a watermark, calls `synchronize` without an in-flight guard, or bumps `schema.version` without a corresponding migration step.
5. When records "come back from the dead" or go missing after a sync, hand over your pull handler and the server's timestamp query. It's a window boundary — timestamp taken after the query, or a `>=` where you needed `>` — in most cases.

## 6. Example Output

Prompt with this skill loaded: *"Add offline sync for `reports`. Server owns `status` and `assigned_to`; the user owns `body`. Show me what the backend must return."*

```ts
// sync/sync.ts
import { synchronize, hasUnsyncedChanges } from '@nozbe/watermelondb/sync'
import NetInfo from '@react-native-community/netinfo'

let inFlight: Promise<void> | null = null

export function syncNow(reason: 'boot' | 'foreground' | 'reconnect' | 'manual'): Promise<void> {
  if (inFlight) return inFlight                 // one sync at a time; the watermark is not reentrant
  inFlight = run(reason).finally(() => { inFlight = null })
  return inFlight
}

async function run(reason: string) {
  const net = await NetInfo.fetch()
  // Don't burn battery retrying on a captive portal that claims to be connected.
  if (!net.isInternetReachable) return

  await synchronize({
    database,
    sendCreatedAsUpdated: true,
    pullChanges: async ({ lastPulledAt, schemaVersion, migration }) => {
      const qs = new URLSearchParams({ since: String(lastPulledAt ?? 0), schemaVersion: String(schemaVersion) })
      if (migration) qs.set('migration', JSON.stringify(migration))
      const res = await fetch(`${API}/sync?${qs}`, { headers: authHeaders() })
      if (res.status === 401) throw new AuthExpiredError()   // do not retry-loop on a dead token
      if (!res.ok) throw new Error(`pull ${res.status}`)
      const body = await res.json()
      return { changes: body.changes, timestamp: body.timestamp }   // server clock, echoed
    },
    pushChanges: async ({ changes, lastPulledAt }) => {
      const res = await fetch(`${API}/sync`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ changes, lastPulledAt }),
      })
      if (res.status === 409) throw new Error('stale_watermark')   // next run pulls first
      if (!res.ok) throw new Error(`push ${res.status}`)
    },
    conflictResolver: (table, local, remote, resolved) => {
      if (table !== 'reports') return
      // Server-owned lifecycle fields always land as-is (they're already in `resolved`).
      // User-owned prose is protected: a pull must never overwrite a local edit.
      if (local._changed?.includes('body')) resolved.body = local.body
    },
    migrationsEnabledAtVersion: 1,
  })
}

export const hasPendingWork = () => hasUnsyncedChanges({ database })   // gate logout on this
```

The backend must satisfy exactly this:

```
GET /sync?since=<ms>&schemaVersion=<n>[&migration=<json>]
  → 200 {
      "changes": {
        "reports": { "created": [...], "updated": [...], "deleted": ["id1","id2"] },
        "sites":   { "created": [...], "updated": [...], "deleted": [] }
      },
      "timestamp": 1773500000123          // SELECT server clock BEFORE running the queries
    }
  Rules: strictly `> since`. Include the caller's own prior writes. Never paginate silently —
  if you must page, keep `timestamp` at the oldest unsent boundary, not the newest.

POST /sync   body: { changes, lastPulledAt }
  → 200 on success (single transaction; upsert by client-supplied id)
  → 409 if any touched row's server_updated_at > lastPulledAt   (client pulls, then retries)
  Rules: never mint ids. Ignore client `created_at`/`updated_at`; stamp `server_updated_at` yourself.
```

Markers of skill-compliant output: one in-flight sync guard, so two triggers can't shred the watermark; the timestamp is the server's and taken before the query, so no record falls between windows; 401 raises a typed error instead of joining a retry loop that drains a battery; `_changed` protects the user's prose while server-owned fields land untouched, per a stated ownership table rather than a default; `migrationsEnabledAtVersion` lets a schema bump backfill instead of forcing a full resync; `hasUnsyncedChanges` gives logout something to block on; and the server contract is spelled out — including the 409 rule — because the client half is the easy half.
