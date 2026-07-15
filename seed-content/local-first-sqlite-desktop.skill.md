---
title: Local-First SQLite Desktop Skill
category: Desktop
description: Use SQLite as the actual backbone of a desktop app — not a toy key-value store — with the pragmas, transaction patterns, and migration scheme that survive a year of real user data. Includes FTS5 search, online backups, the native-module rebuild errors that eat an afternoon in Electron, and what to change now if you might add sync later.
usage: Load this skill when a desktop app (Electron, Tauri, or a plain Node CLI) needs local persistent storage. Apply section 3.1's connection setup verbatim as the first code you write — those pragmas are not tunables. Use section 4 as a review checklist over every write path before shipping.
platforms: [Claude, Cursor]
priceUsd: 7
timeSavedHours: 20
pocUrl: https://github.com/WiseLibs/better-sqlite3
---
# Local-First SQLite Desktop Skill

## 1. Philosophy

Most desktop apps that "need a database" reach for a JSON file, then a JSON file with a
debounced write, then a JSON file with a lock, then a corrupted JSON file. SQLite is the
correct answer at file number one: a single file, zero configuration, in-process, and
battle-tested under conditions more hostile than anything you'll write for it.

1. **Local-first means the local copy is the truth.** The app must be fully functional
   with the network unplugged, forever. Sync is an accessory that reconciles two truths
   later — it is never the source of one.
2. **Synchronous is correct on the desktop.** The counterintuitive one. A server goes
   async because one thread serves 5,000 users. You have one user, a local disk, and
   prepared SELECTs that return in microseconds. Async here buys nothing and costs you
   Promise plumbing, ordering bugs, and transactions that silently interleave.
3. **Pragmas are configuration, not optimisation.** WAL and `busy_timeout` aren't things
   you add when it gets slow — their absence produces *correctness* failures.
4. **The database belongs in the OS app-data directory.** Not next to the binary. This
   is invisible until the day it makes the app unshippable (§3.6).
5. **Migrations exist from v1.** `user_version` is four lines of code; the alternative is
   a support thread titled "app won't open after update."

## 2. Tech Stack

- **Project:** better-sqlite3 — https://github.com/WiseLibs/better-sqlite3 — **MIT**
  licensed. This skill is an independent, original guide; it is not affiliated with or
  endorsed by the better-sqlite3 maintainers.
- **Why this driver:** synchronous API, prepared-statement caching, bundled SQLite, a
  transaction helper, and the online backup API. `node-sqlite3` is async-callback based
  and a worse fit for desktop, per §1.2.
- **Runtime:** Node ≥18. It is a **native module** compiled against a specific Node ABI
  (§3.7) — the single biggest source of setup pain.
- **In Electron:** add `@electron/rebuild` (dev). Runs in the **main process** only; the
  renderer talks to it over IPC.
- **In Tauri:** don't — use `rusqlite` on the Rust side. Same SQLite, same pragmas, same
  patterns below; only the syntax changes.

## 3. Patterns

### 3.1 Connection setup: the pragmas that actually matter

This is the first code you write, and it is not negotiable.

```js
const db = new Database(dbPath);            // creates the file if absent
db.pragma('journal_mode = WAL');            // readers don't block the writer
db.pragma('synchronous = NORMAL');          // safe under WAL; FULL is ~2x slower for no gain
db.pragma('foreign_keys = ON');             // OFF by default. Yes, really. Per-connection.
db.pragma('busy_timeout = 5000');           // wait 5s for a lock instead of throwing instantly
```

- **`journal_mode = WAL`** — the default (`DELETE`) takes an exclusive lock on every
  write, so a background indexer blocks your UI's reads. WAL lets readers proceed during
  a write. It's persistent in the file, but set it every open anyway: idempotent and
  self-documenting. Side effect: you now have three files (`app.db`, `-wal`, `-shm`), and
  your backup logic must know that (§3.8).
- **`synchronous = NORMAL`** — under WAL this risks losing only the *last transaction* on
  an OS crash, not corruption, in exchange for not fsyncing every commit. `FULL` is right
  for a bank. `OFF` is never right.
- **`foreign_keys = ON`** — SQLite ships FK enforcement **off** for backwards
  compatibility, and it resets per connection. Every dangling-reference bug you've seen
  in a SQLite app is this line missing. It is not stored in the file.
- **`busy_timeout = 5000`** — without it a concurrent writer gets
  `SqliteError: database is locked` immediately, no retry. With it SQLite blocks and
  retries internally. Any second process at all (helper, updater) needs this.

### 3.2 Prepared statements and caching

```js
// WRONG: parses the same SQL 10,000 times
for (const r of rows) db.prepare('INSERT INTO notes (id, body) VALUES (?, ?)').run(r.id, r.body);

// RIGHT: prepare once, reuse
const insertNote = db.prepare('INSERT INTO notes (id, body) VALUES (?, ?)');
for (const r of rows) insertNote.run(r.id, r.body);
```

better-sqlite3 caches internally, so re-preparing identical SQL is cheaper than it looks
— but hoist statements to a `statements` object built once at startup anyway. It
documents your entire query surface in one place, which is worth more than the
microseconds. Named parameters beat positional past three columns:

```js
const upsert = db.prepare(`
  INSERT INTO notes (id, title, body, updated_at) VALUES (@id, @title, @body, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET title=@title, body=@body, updated_at=@updatedAt`);
upsert.run({ id, title, body, updatedAt: Date.now() });
```

Method choice: `.run()` for writes (returns `{ changes, lastInsertRowid }`), `.get()` for
one row, `.all()` for an array, `.iterate()` when materialising the result set would
spike memory.

### 3.3 Transactions: the 100x number is not hyperbole

Every bare `INSERT` is its own implicit transaction — its own commit, its own real work
per row. Wrap the loop:

```js
const insertMany = db.transaction((notes) => { for (const n of notes) insertNote.run(n); });
insertMany(tenThousandNotes);   // one transaction, one commit
```

Measured on an ordinary SSD, importing 10,000 rows: **~9–12 seconds unwrapped, ~80–120ms
wrapped.** That is the 100x, and it is the highest-leverage line in this skill.

`db.transaction()` also rolls back automatically if the function throws, and it is
**re-entrant** — calling a transaction function from inside another uses a savepoint
rather than erroring. Exactly what you want when `importFolder()` calls a transactional
`saveNote()`.

The rule that catches people: **the function must be synchronous.** An `async` function
returns a Promise immediately, so SQLite commits an empty transaction while your awaits
run outside it. better-sqlite3 throws `Transaction function cannot return a promise` —
thank it, because the silent version of this bug in other drivers is data loss.

### 3.4 Schema migrations with `user_version`

`user_version` is a 32-bit int SQLite stores in the file header for exactly this.

```js
const MIGRATIONS = [
  (db) => db.exec(`
    CREATE TABLE notes (
      id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL);
    CREATE INDEX idx_notes_updated ON notes(updated_at DESC);`),          // v0 → v1
  (db) => db.exec(`ALTER TABLE notes ADD COLUMN folder_id TEXT REFERENCES folders(id)`), // v1 → v2
];

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  if (current > MIGRATIONS.length)
    throw new Error(`DB is v${current}, app knows v${MIGRATIONS.length}. Downgrade blocked.`);
  db.transaction(() => {
    for (let v = current; v < MIGRATIONS.length; v++) {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    }
  })();
}
```

Learned the hard way: migrations are **append-only** — editing migration 3 after shipping
means users who ran old-3 and new-3 have different schemas under the same version number
and nothing will ever tell you. The downgrade guard matters: a beta user reverting to
stable otherwise gets a `no such column: folder_id` crash loop with no explanation.
`PRAGMA foreign_keys` cannot change inside a transaction, so the 12-step table rebuild
(SQLite's `ALTER TABLE` can't drop constraints) toggles it **outside**, rebuilds, then
verifies with `PRAGMA foreign_key_check`. And back up before migrating (§3.8) — a failed
migration on a user's only copy of their data is the worst bug you can ship.

### 3.5 Full-text search with FTS5

Don't `LIKE '%term%'` your way through this — it can't use an index and it's a table scan
on every keystroke.

```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, body,
  content='notes', content_rowid='rowid',      -- external content: no duplicated text
  tokenize='unicode61 remove_diacritics 2');

-- External-content tables do NOT auto-sync. You own these triggers.
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body)
    VALUES ('delete', old.rowid, old.title, old.body);
END;
-- notes_au = the delete row followed by the insert row.
```

```js
const search = db.prepare(`
  SELECT n.id, n.title, snippet(notes_fts, 1, '<mark>', '</mark>', '…', 12) AS excerpt
  FROM notes_fts f JOIN notes n ON n.rowid = f.rowid
  WHERE notes_fts MATCH ? ORDER BY rank LIMIT 50`);

// User input is FTS5 query syntax, not a plain string. Quote it, or a stray '"' / '*'
// throws: fts5: syntax error near "..."
search.all(`"${userInput.replace(/"/g, '""')}"*`);      // phrase + prefix match
```

`content=''` external mode keeps the file small (no second copy of every note) at the
cost of owning those triggers. `ORDER BY rank` is BM25 for free; `snippet()` gives you
the highlighted excerpt your UI wants without a line of JS.

### 3.6 Where the database file lives

Never `./app.db`. Never `path.join(__dirname, 'data.db')`. On macOS your app runs from a
read-only signed bundle and the write fails with `SQLITE_CANTOPEN` — after shipping,
because in dev you ran from a writable folder. On Windows, `Program Files` is
UAC-protected and you get a silent virtual-store redirect that makes the data vanish on
uninstall.

```js
function appDataDir(appName) {
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  if (process.platform === 'win32')
    return path.join(process.env.APPDATA, appName);
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), appName);
}
fs.mkdirSync(dir, { recursive: true });
```

In Electron, `app.getPath('userData')` gives you this for free — use it. The above is for
Node CLIs and Tauri sidecars.

**Corruption on network drives is real.** SQLite's locking relies on the filesystem
honouring advisory locks; SMB, NFS, Dropbox and Google Drive folders do not, reliably. A
user whose home dir is a network mount — or who "helpfully" moves the app-data folder
into Dropbox to sync it between machines — produces `database disk image is malformed`,
unrecoverable without a backup. Hence: the OS app-data dir (not synced by default), and
never build sync by putting the .db in a sync folder (§3.9).

### 3.7 Native module rebuild pain (the Electron tax)

better-sqlite3 is compiled C++, linked against a specific **ABI version**. Node 20 and
Electron 28 have different ABIs even though both "are Node."

```
Error: The module '/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 115. This version of Node.js requires NODE_MODULE_VERSION 119.
```

`npm install` built it for your *Node*; Electron needs it built for *Electron*:

```jsonc
"devDependencies": { "@electron/rebuild": "^3.6.0" },
"scripts": { "postinstall": "electron-rebuild -f -w better-sqlite3" }
```

electron-builder rebuilds during `dist` automatically; the `postinstall` hook is what
makes `npm start` work in dev. The rest of the field guide:

- **It must be a `dependency`, not a `devDependency`,** or electron-builder prunes it out
  and the packaged app throws `Cannot find module 'better-sqlite3'` while dev is perfect.
- **asar:** `.node` files can't load from inside an asar. electron-builder unpacks them,
  but hand-rolled `files` globs need `"asarUnpack": ["**/*.node"]`.
- **CI must rebuild per-OS.** A macOS runner cannot produce the Windows binary. Don't try
  to cross-compile a native module to save a job.
- **Prebuilt binaries** cover common ABI combos; when yours isn't covered npm silently
  compiles from source, needing Python and a C++ toolchain — that's the Windows
  contributor reporting `gyp ERR! find VS` on a fresh clone. Document it in the README.
- **In plain Node, none of this exists.** `npm i better-sqlite3` and it works. Ninety
  percent of this section is the Electron ABI mismatch specifically.

### 3.8 Backups with the online backup API

Do not `fs.copyFileSync` the .db. Under WAL, committed data is split across `app.db` and
`app.db-wal`; copying one mid-write gives you a plausible-looking file missing the last N
transactions, or a torn one.

```js
await db.backup(path.join(dir, `backup-${Date.now()}.db`));   // consistent, non-blocking
await db.backup(dest, {                                        // with progress, for a big DB
  progress({ totalPages, remainingPages }) {
    emitProgress(1 - remainingPages / totalPages);
    return 100;                                                // pages per step; 0 aborts
  },
});
```

The backup API reads pages under SQLite's own locking and emits one consistent file, no
sidecars needed. Use it before every migration, on a rolling schedule (keep the last 5 —
a corrupt DB backed up 5 times is 5 corrupt backups, so depth beats frequency), and
behind an "Export my data" button, because local-first without an export button is just
data jail. `PRAGMA integrity_check` (returns `ok` or a problem list) is cheap enough to
run on startup for small DBs.

### 3.9 What changes if you later want sync

Three decisions made today determine whether sync is a feature or a rewrite:

1. **Opaque string IDs, not `INTEGER PRIMARY KEY AUTOINCREMENT`.** UUIDv7 or ULID gives
   globally unique, roughly time-ordered keys. Two offline devices both creating "note
   47" is the canonical merge disaster, and autoincrement guarantees it.
2. **Every row gets `updated_at` and a soft-delete `deleted_at`.** A hard `DELETE` is
   invisible to a sync engine — the other device sees "row absent" and can't distinguish
   deletion from not-yet-received, so it resurrects the note. Adding tombstones later
   means the pre-migration deletes are simply lost.
3. **Keep an oplog table if you can afford it.** Append `(entity, id, op, ts)` on every
   write from inside the same transaction. That turns "diff two whole databases" into
   "send rows since cursor X."

And the thing not to do: **syncing the .db file via Dropbox/iCloud/Drive.** It sounds
like free sync. It is §3.6's corruption scenario with a scheduler — file sync services
resolve conflicts by picking a winner or writing `notebook (conflicted copy).db`, neither
of which is a merge, and both can hand you a torn file mid-checkpoint. Sync rows over a
protocol, use a purpose-built engine, or ship without sync and say so.

## 4. Anti-patterns

- **A JSON file as the datastore** because "it's only settings." It grows, corrupts on a
  mid-write power loss, then you write a lock file. SQLite from line one.
- **Omitting `foreign_keys = ON`.** Off by default, per-connection. Your constraints are
  decorative until you set it.
- **Per-row inserts outside a transaction.** 100x slower, and a failed import leaves half
  the data in.
- **`async` functions passed to `db.transaction()`.** Commits empty while your awaits run
  outside it. better-sqlite3 throws; other drivers lose data quietly.
- **Preparing SQL inside a loop.** Hoist statements to startup.
- **`LIKE '%term%'` for search.** Table scan per keystroke. FTS5 gives ranking and
  snippets for free.
- **Storing the DB next to the binary** (`__dirname`, `process.cwd()`). Fine in dev,
  `SQLITE_CANTOPEN` in a signed macOS bundle, virtualised away under Program Files.
- **`fs.copyFileSync` for backups** under WAL. Use `db.backup()` — the sidecar files are
  not optional state.
- **better-sqlite3 as a `devDependency`,** or no `electron-rebuild`. The first ships an
  app that can't find its database driver; the second is `NODE_MODULE_VERSION` within
  the hour.
- **Putting the .db in a Drive/Dropbox folder to get sync.** That's `database disk image
  is malformed`, on a schedule.

## 5. Usage

1. Open one connection at startup, in the main process, with §3.1's four pragmas
   verbatim. Never open a connection per operation.
2. Resolve `dbPath` from the OS app-data dir (§3.6 / `app.getPath('userData')`) before the
   first write. Fix this before anything else — it's the one that only fails in prod.
3. Make migration 0 the full initial schema; run `migrate(db)` every boot (§3.4), backing
   up first (§3.8). Migrations are append-only from that moment.
4. Hoist every statement into a `statements` object at startup; wrap every multi-row
   write in `db.transaction()` (§3.3).
5. Add FTS5 + triggers (§3.5) when search enters the requirements, not after users call
   it slow — retrofitting the triggers means a full reindex migration.
6. If Electron: `dependency` (not dev), `electron-rebuild` postinstall, `asarUnpack` for
   `.node`, per-OS CI runners (§3.7).
7. If sync is even plausible later: UUIDv7 IDs and `updated_at` + `deleted_at` on every
   table, from v1 (§3.9).
8. Review every write path against §4 before shipping.

## 6. Example Output

Applying this skill to a research-notes desktop app (Electron, ~30k notes, four years of
one user's data):

- One `better-sqlite3` connection opened in the main process at boot with WAL,
  `synchronous = NORMAL`, `foreign_keys = ON`, `busy_timeout = 5000`; the renderer never
  touches the driver and talks to 9 IPC handlers instead.
- DB at `app.getPath('userData')/notebook.db`. `migrate()` runs on boot against
  `user_version`, takes a `db.backup()` snapshot first, and refuses to open a v5 file with
  a v4 binary — a readable message instead of a crash loop.
- `importFolder()` ingests 12,400 markdown files in a single `db.transaction()` — measured
  at 140ms versus 11s for the naive per-row version that shipped in the first prototype —
  emitting progress every 100 rows.
- Search backed by an external-content FTS5 table with the three sync triggers,
  `unicode61 remove_diacritics 2`, `ORDER BY rank`, and `snippet()` producing the
  highlighted excerpts in the results list. Typeahead over 30k notes stays under 8ms.
- Rolling backups (last 5) via the online backup API plus an "Export database" menu item;
  `PRAGMA integrity_check` on boot; `deleted_at` tombstones and UUIDv7 IDs on every table,
  so next year's sync feature is a protocol problem rather than a schema rewrite.
