---
title: Extension Options & Sync Storage Skill
category: Extension
description: Settings architecture for browser extensions that survives the sync quota, the worker restart, and the two-devices-editing-at-once race. Covers the real chrome.storage.sync limits (100KB total, 8KB per item, 512 items, write-rate ceilings), a typed defaults + schema-migration module, and storage.onChanged as the single source of truth across popup, options page, and background.
usage: Load this skill before designing or refactoring an extension's settings layer. Describe your settings — what they are, which must roam across devices, which are secrets — and the AI will produce the typed module, defaults, migration ladder, and onChanged wiring. Paste "settings randomly revert" or a QUOTA_BYTES error and it will diagnose against sections 3.2 and 3.5.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 12
pocUrl: https://github.com/wxt-dev/wxt
---
# Extension Options & Sync Storage Skill

Settings look like the easy part of an extension. They are the part that generates the
one-star review saying "it forgot my API key again." Everything below is what you write
after a quota error, a store reviewer, and a user on a slow Chromebook each teach you
something.

## 1. Philosophy

- **Storage is the only real state.** Popup, options page, and the service worker are
  three JS realms that die at different times. A setting held in a module-level variable
  in the worker is a value that is wrong 30 seconds from now. `chrome.storage` is the
  database; every surface is a view.
- **`sync` is a roaming cache, not a database.** Best-effort, quota-tight, rate-limited,
  eventually consistent. It can silently fail to write and can hand you a value another
  machine wrote half a second ago. Treat every read as untrusted input.
- **Never put a secret in `sync`.** It roams to every device the user is signed into.
  Tokens and API keys go in `local`, full stop — and it is the first question a reviewer
  asks about an options page with a key field.
- **Defaults are code; stored values are patches.** Ship a defaults object in source,
  persist only what changed, merge at read. Adding a setting becomes a one-line diff
  instead of a migration.
- **Version the schema from day one.** The migration you cannot write is the one where you
  don't know which shape is on disk. A `schemaVersion` integer costs four bytes.

## 2. Tech Stack

- **Project referenced:** WXT — https://github.com/wxt-dev/wxt — license: **MIT**. This
  skill is an independent, original guide; it is not affiliated with or endorsed by the
  WXT maintainers.
- `chrome.storage.sync` for roaming preferences (theme, feature flags, small lists).
- `chrome.storage.local` for anything large, secret, or device-specific. ~10MB, or
  effectively unlimited with `unlimitedStorage` — a permission you should have to justify
  to yourself before adding.
- `chrome.storage.session` for worker-lifetime state that must survive a worker restart
  but not a browser restart (decrypted values, nonces). Never written to disk, ~10MB.
- `chrome.storage.onChanged` as the cross-surface bus. No custom messaging for settings.
- TypeScript for the settings shape — even in a vanilla extension, one `.d.ts` pays for
  itself the first time you typo `enableHilights`.
- WXT's `storage` helper and `defineConfig` when already on WXT (§3.8).
- `permissions: ["storage"]` and nothing more. It triggers no warning. Keep it that way.

## 3. Patterns

### 3.1 Pick the area with a decision tree, not a habit

```
Secret (token, key, session)?        → local. Never sync. No exceptions.
> 8KB, or unbounded (history, cache)? → local
Must vanish when the browser closes? → session
Device-specific (panel width)?       → local
Everything else (prefs the user
expects to follow them to a laptop)  → sync
```

The mistake this prevents: dumping one fat `settings` object into `sync` because it was
one line, then discovering at 8KB that the whole object silently stops writing —
including the theme toggle that used to work.

### 3.2 The real quotas, and what failure looks like

| Limit | Value | Symptom when crossed |
|---|---|---|
| `QUOTA_BYTES` | ~102,400 total | Write rejects, `lastError` set |
| `QUOTA_BYTES_PER_ITEM` | ~8,192 per key | That key never persists |
| `MAX_ITEMS` | 512 keys | New keys rejected |
| `MAX_WRITE_OPERATIONS_PER_HOUR` | ~1,800 | Writes rejected for the hour |
| `MAX_WRITE_OPERATIONS_PER_MINUTE` | ~120 | Burst rejected |

Two things bite. The per-item count includes the **key name plus the serialized value** —
long key names are not free. And when you exceed a rate limit, `set()` does not throw: the
promise resolves, `chrome.runtime.lastError` is set, and the data is simply absent on next
read. Never checking means you have shipped a settings page that appears to work and
loses data.

```js
async function writeSync(patch) {
  try {
    await chrome.storage.sync.set(patch);
    if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
    return { ok: true };
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (/QUOTA_BYTES_PER_ITEM/.test(msg)) return { ok: false, reason: 'item-too-large' };
    if (/QUOTA_BYTES/.test(msg))          return { ok: false, reason: 'sync-full' };
    if (/MAX_WRITE_OPERATIONS/.test(msg)) return { ok: false, reason: 'rate-limited' };
    return { ok: false, reason: 'unknown' };
  }
}
```

Surface the reason as a sentence. "Couldn't sync — too many changes in the last minute;
saved on this device" is a support ticket you never receive.

The per-item limit dictates schema: **one key per setting group, never one god key.**
`theme`, `filters`, `shortcuts` as three keys each get their own 8KB. Merged into one
`settings` key they share 8KB, and one runaway list kills the theme.

### 3.3 The typed settings module (defaults + merge + patch)

```ts
export const SCHEMA_VERSION = 3;

export interface Settings {
  schemaVersion: number;
  theme: 'system' | 'light' | 'dark';
  enabledSites: string[];      // origins — bounded, sync-safe
  highlightColor: string;
  maxResults: number;
}

export const DEFAULTS: Settings = {
  schemaVersion: SCHEMA_VERSION, theme: 'system',
  enabledSites: [], highlightColor: '#3b82f6', maxResults: 50,
};

/** Read = defaults merged with the stored patch. Never returns undefined fields. */
export async function readSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(null);
  return { ...DEFAULTS, ...(await migrate(stored)) };
}

/** Write = shallow patch. Callers never construct a whole Settings object. */
export async function patchSettings(patch: Partial<Settings>) {
  return writeSync(patch);
}
```

Three properties fall out, each killing a class of bug. Adding a setting is a line in
`DEFAULTS` — existing users get it with no migration and no `undefined` leaking into a
`<select>`. `patchSettings({theme})` cannot clobber `enabledSites`, which is exactly what
`set(wholeObject)` does when two surfaces are open. And every consumer gets a fully
populated typed object, so `settings.maxResults ?? 50` stops appearing in four files with
three different fallbacks.

### 3.4 Migrations by schema version

Migrations run on read, are pure, and are individually testable. A ladder, not a switch:

```ts
const MIGRATIONS: Record<number, (s: any) => any> = {
  // v1 → v2: `darkMode: boolean` became a three-way `theme`
  2: ({ darkMode, ...rest }) => ({ ...rest, theme: darkMode === true ? 'dark' : 'system' }),
  // v2 → v3: enabledSites stored full URLs; we only ever wanted origins
  3: (s) => ({ ...s, enabledSites: (s.enabledSites ?? [])
      .map((u: string) => { try { return new URL(u).origin; } catch { return null; } })
      .filter(Boolean) }),
};

export async function migrate(stored: Record<string, any>) {
  const from = stored.schemaVersion ?? 0;
  if (from > SCHEMA_VERSION) return stored;      // future data from a newer device — don't touch
  if (from === SCHEMA_VERSION) return stored;
  let out = stored;
  for (let v = from + 1; v <= SCHEMA_VERSION; v++) if (MIGRATIONS[v]) out = MIGRATIONS[v](out);
  out.schemaVersion = SCHEMA_VERSION;
  await chrome.storage.sync.set(out);            // persist once; one-time cost
  return out;
}
```

The subtle part: migrate on **read**, not only in `onInstalled`. A device offline for two
versions receives synced data from a *newer* schema than the code running locally, and
there is no install event for that. Hence the future-version guard on line three — old
code refuses to downgrade rather than corrupt.

### 3.5 `onChanged` as the single source of truth

Every surface subscribes; nobody pushes. The write *is* the broadcast.

```js
let cache = null;

export function watchSettings(onUpdate) {
  readSettings().then((s) => { cache = s; onUpdate(s); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const next = { ...cache };
    for (const [k, { newValue }] of Object.entries(changes)) {
      if (newValue === undefined) delete next[k]; else next[k] = newValue;
    }
    cache = { ...DEFAULTS, ...next };
    onUpdate(cache);
  });
}
```

This is why the settings module owns storage exclusively. Options writes `theme`; the
content script re-skins; the worker rebuilds context menus — zero `sendMessage`, zero
chance a closed popup misses an update. `onChanged` fires in **every** live realm,
including for a change synced in from another device, which is an event you have no other
way to observe.

The trap: it fires in the writing realm too. An options page that writes on `input` and
re-renders on `onChanged` resets its own cursor mid-typing. Skip the echo for the field
you just edited.

### 3.6 Debounced writes

A color picker dragged for two seconds fires ~120 `input` events — your entire per-minute
budget on one gesture.

```js
function debouncedPatcher(delay = 400) {
  let pending = {}, timer = null;
  return (patch) => {
    Object.assign(pending, patch);            // coalesce: last write per key wins
    clearTimeout(timer);
    timer = setTimeout(() => {
      const batch = pending; pending = {}; timer = null;
      patchSettings(batch);                   // ONE write operation, all keys
    }, delay);
  };
}
const savePref = debouncedPatcher();
colorInput.addEventListener('input', (e) => savePref({ highlightColor: e.target.value }));
```

`set({a, b, c})` is **one** write against the quota, not three — batch aggressively. And
flush on `visibilitychange` → `hidden`: the options page can be closed inside your 400ms
window and that pending write is gone.

### 3.7 `options_ui` vs a full options page

```json
{ "options_ui": { "page": "options.html", "open_in_tab": true } }
```

`"open_in_tab": false` is a height-constrained iframe inside `chrome://extensions`: tidy in
a screenshot, miserable in practice — no URL to deep-link, no room for explanatory copy,
and you cannot point a user at a section from a support email. Use a tab for anything
past three toggles; `chrome.runtime.openOptionsPage()` works either way. If your page
requests an optional permission it *must* be tab-based — `permissions.request()` needs a
user gesture in a real window and misbehaves in the embedded frame.

### 3.8 WXT's storage helpers

WXT gives you the versioned-item pattern natively, collapsing §3.3–3.4 into a declaration:

```ts
import { storage } from 'wxt/storage';

export const theme = storage.defineItem<'system' | 'light' | 'dark'>('sync:theme', {
  fallback: 'system',
  version: 2,
  migrations: { 2: (old: any) => (old === true ? 'dark' : 'system') },
});

await theme.setValue('dark');
const unwatch = theme.watch((next) => applyTheme(next));   // onChanged, scoped to one key
```

The `'sync:'` / `'local:'` / `'session:'` prefix selects the area — get it wrong and your
token quietly roams. Keep the manifest declarations next to it in `defineConfig`:

```ts
export default defineConfig({
  manifest: {
    permissions: ['storage'],
    options_ui: { page: 'options.html', open_in_tab: true },
  },
});
```

Per-item `watch` is nicer than filtering a global `onChanged`, but it is the same
mechanism underneath — §3.5's echo caveat still applies.

### 3.9 Testing settings migrations

Migrations are pure functions over plain objects: trivially testable, almost never tested.

```js
test('v1 darkMode:true becomes theme:dark', async () => {
  const out = await migrate({ schemaVersion: 1, darkMode: true });
  expect(out.theme).toBe('dark');
  expect(out.darkMode).toBeUndefined();
  expect(out.schemaVersion).toBe(SCHEMA_VERSION);
});

test('v0 (no version key at all) climbs the whole ladder', async () => {
  const out = await migrate({ enabledSites: ['https://a.test/x?y=1'] });
  expect(out.enabledSites).toEqual(['https://a.test']);
});

test('data from a newer schema is left untouched', async () => {
  const future = { schemaVersion: 99, theme: 'plasma' };
  expect(await migrate(future)).toEqual(future);
});
```

Keep a fixtures folder with one real `chrome.storage.sync.get(null)` dump per shipped
version, taken from a live profile before each release. That folder is the only thing
between you and a migration that passes on your synthetic object and destroys a real
user's config.

## 4. Anti-patterns

- **One god `settings` key in `sync`.** All settings share a single 8KB item quota, so an
  unbounded list inside it silently breaks the theme toggle too. One key per group.
- **Tokens in `sync`.** They roam to every signed-in device inside the account's sync
  payload. `local` only — and a reviewer who spots this will ask, correctly.
- **`set(wholeSettingsObject)` from two surfaces.** Popup and options each read at open,
  then each write everything; last save reverts the other. Patch individual keys.
- **Writing on every `input` event.** ~120 writes/minute is the ceiling, a dragged slider
  blows it in a second, and the rejected writes do not throw. Debounce and coalesce.
- **Ignoring `runtime.lastError` on `storage.set`.** Quota and rate-limit failures resolve
  successfully and lose the data. This is the #1 source of "my settings reverted."
- **Migrating only in `onInstalled`.** Misses the offline-device and synced-from-newer
  cases entirely. Migrate on read, with a future-version guard.
- **`storage.sync.get(null)` per keystroke.** Read once, subscribe to `onChanged`, cache
  the merged object — and rebuild (never trust) that cache on every worker wake.
- **Settings in a module-level variable in the worker.** Wiped on restart, so it is
  `undefined` at exactly the moment an alarm fires.
- **`open_in_tab: false` for a real settings page.** Cramped, undeep-linkable, and
  `permissions.request()` misbehaves inside it.

## 5. Usage

Give the AI this skill plus a list of your settings. Ask for, in order:

1. **Area assignment** — every setting through the §3.1 tree as a table: name, area, why,
   approximate bytes. Secrets called out explicitly.
2. **The settings module** — `DEFAULTS`, the `Settings` interface, `readSettings`,
   `patchSettings`, `writeSync` with §3.2's error mapping. One key per group.
3. **The migration ladder** — one rung per historical shape, plus §3.9's fixture tests.
4. **Surface wiring** — `watchSettings` per realm, debounced patchers, visibility flush.

For debugging, paste the symptom. "Settings revert" → unchecked `lastError` on a
rate-limited write (§3.2). "One setting stopped saving, others fine" → per-item quota on a
god key (§3.2). "Options page fights my typing" → the `onChanged` echo (§3.5). "Fine here,
corrupt on my laptop" → missing future-version guard (§3.4).

## 6. Example Output

A settings layer for a page-annotation extension, built with this skill:

- **Area map:** `theme`, `highlightColor`, `enabledOrigins` (bounded ~40) → `sync`, three
  separate keys. `apiToken` and `annotationCache_<originHash>` → `local`. `decryptedKey`
  → `session`. Written up as a table in the README, which doubled as the answer to the
  Web Store privacy form.
- **`settings.ts`:** ~90 lines — defaults, read, patch, and `writeSync` mapping quota and
  rate-limit reasons to three user-facing sentences in the options status line.
- **Migrations:** three rungs (`darkMode` boolean → `theme` enum; full URLs → origins;
  flat shortcut string → keyed object), each pure, each tested against a real dumped blob
  from the version that shipped it.
- **Wiring:** `watchSettings()` in options, popup, content script, and worker. Zero
  `sendMessage` calls for settings. The content script re-skins live when the theme
  changes — including when the change arrives from the user's other laptop, which is the
  demo that makes the sync story land.
- **Options page:** tab-based, deep-linkable sections, 400ms debounced patcher on every
  control with a `visibilitychange` flush. Dragging the color picker for five seconds
  produces exactly one sync write.
