---
title: End-to-End Chrome Extension (MV3) Skill
category: Extension
description: Build a complete Manifest V3 Chrome extension the way two shipped Web Store products (CommentIQ, Quill) actually do it — service worker lifecycle survival, content-script messaging that doesn't silently drop responses, and a storage schema that outlives worker restarts. Includes the exact keep-alive pattern, message-router shape, and a Web Store submission checklist earned through real reviews.
usage: Load this skill before scaffolding or debugging any MV3 extension. Tell the AI what your extension does (which surfaces it needs — popup, side panel, content script, options) and it will generate the manifest, worker, and messaging skeleton following these patterns. Paste "stuck spinner" or "worker died" symptoms and it will diagnose against the lifecycle rules in section 4.
platforms: [Claude, Cursor]
priceUsd: 6
timeSavedHours: 14
pocUrl: https://tapdot.org
---
# End-to-End Chrome Extension (MV3) Skill

Distilled from two shipped, Web-Store-published extensions: CommentIQ (YouTube comment analytics with a side panel and long-running background jobs) and Quill (writing tools injected into every page). Every pattern here fixed a real bug or passed a real store review.

## 1. Philosophy

- **The service worker is a function, not a server.** Chrome kills it after ~30 seconds of no events. Design every feature assuming the worker just restarted with all in-memory state wiped. Anything that must survive lives in `chrome.storage.local`; anything in a `Map` is a cache with a rehydration path, never the source of truth.
- **Keep the worker thin unless it must be thick.** Quill's worker is ~140 lines: context menus, a flags-page opener, a storage relay. All product logic lives in the content script where the DOM and the user are. CommentIQ's worker is thick because its job (paginated network fetching + coordinating AI) genuinely belongs in the background. Pick deliberately; don't smear logic across both.
- **No build step until you need one.** Both products ship plain ES modules and vanilla JS. `"background": { "service_worker": "background.js", "type": "module" }` gives you `import` in the worker for free. A bundler is a cost you pay when you have a reason (frameworks, TS), not a default.
- **Every message broadcast can be missed.** A closed side panel receives nothing; there is no backlog. Design a pull-based resync (`GET_STATUS`) alongside every push-based broadcast, or your UI will show stale/blank state whenever it reopens mid-operation.
- **Degrade with a sentence, not a spinner.** Every failure path must end in a user-visible reason ("rate-limited", "capped at 1000", "AI unavailable on this device") — a loader that silently vanishes is a bug report waiting to happen.

## 2. Tech Stack

- Manifest V3, `minimum_chrome_version` pinned to the lowest version you actually tested (both products pin `"138"`).
- Vanilla JS, ES modules in the worker (`"type": "module"`), IIFE-wrapped content scripts (`(function () { 'use strict'; ... })()`) so nothing leaks into page scope.
- `chrome.storage.local` as the only persistence layer. No IndexedDB unless you're storing >10MB.
- Surfaces as needed: `action` (popup or click handler — you can't have both), `side_panel`, `options_ui` with `"open_in_tab": true`, content scripts declared in the manifest (not injected programmatically) when they should run on every matching page.
- `chrome.scripting.executeScript` + `host_permissions` for one-off reads from a page (no `"tabs"` permission needed to read a tab you have host permissions for).
- Zero remote code. MV3 forbids it and reviewers check.

## 3. Patterns

### 3.1 Manifest shape (side-panel product)

```json
{
  "manifest_version": 3,
  "name": "MyExt",
  "version": "1.0.0",
  "minimum_chrome_version": "138",
  "permissions": ["sidePanel", "storage", "activeTab", "scripting"],
  "host_permissions": ["https://example.com/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [{
    "matches": ["https://example.com/app/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "side_panel": { "default_path": "sidepanel.html" },
  "action": { "default_title": "Open MyExt" },
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
}
```

Rules that bite:
- `action` with NO `default_popup` fires `chrome.action.onClicked` — use that to open the side panel. If you set `default_popup`, `onClicked` never fires. One or the other.
- `chrome.sidePanel.open({ tabId })` must run inside a user-gesture handler. Pre-fetch the tab id when your popup loads so the click handler stays synchronous.
- Request the narrowest `matches` you can defend in review. `<all_urls>` is fine only when the product genuinely works on every page (Quill), and you should expect the reviewer to ask why.

### 3.2 The message router — one listener, explicit async contract

The single most common MV3 bug: returning `true` (or not) from `onMessage` incorrectly. Return `true` **only** when you will call `sendResponse` asynchronously; the port closes the moment the listener returns otherwise.

```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_JOB':          // fire-and-forget: respond immediately, work continues
      startJob(message.id);
      sendResponse({ started: true });
      return false;
    case 'GET_STATUS':         // async: keep the channel open
      readStatus(message.id).then(sendResponse);
      return true;
    case 'GET_STORAGE':
      chrome.storage.local.get(message.keys, sendResponse);
      return true;
    default:
      return false;
  }
});
```

Fire long jobs and respond `{ started: true }` immediately — never make the sender await a multi-minute promise over `sendMessage`; the channel is not built for that (CommentIQ hard-learned this and switched to broadcast progress + pull resync).

### 3.3 Keep-alive: the port-ping pattern

A long-running background loop (pagination with backoff sleeps, downloads) can outlast the ~30s idle window *between events* and get the worker torn down mid-loop with no error. Receiving a port message is itself an event that resets the idle timer. From the page that cares (side panel, popup):

```js
// sidepanel.js
function startKeepAlivePort() {
  let port;
  const connect = () => {
    port = chrome.runtime.connect({ name: 'keepAlive' });
    port.onDisconnect.addListener(() => { port = null; }); // worker rotated — reconnect on next tick
  };
  connect();
  setInterval(() => {
    try { if (!port) connect(); port.postMessage('ping'); }
    catch { port = null; }
  }, 15000); // comfortably under the ~30s idle window
}
```

```js
// background.js
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'keepAlive') return;
  port.onMessage.addListener(() => {}); // receiving IS the point; no reply needed
});
```

Scope it honestly: this keeps the worker alive **while your UI is open**, which is exactly the window where a background job matters. It is not (and should not be) a way to run a permanent daemon.

### 3.4 State that survives worker death

Keep a per-entity in-memory map for live coordination, but treat it as a cache over storage:

```js
const jobs = new Map(); // id -> { lastStatus, data, cursor } — wiped on every worker restart

async function getJob(id) {
  let job = jobs.get(id);
  if (!job) {
    // Worker restarted between "fetch" and "user clicked next step" — rehydrate.
    const { [`job_${id}`]: blob } = await chrome.storage.local.get(`job_${id}`);
    if (blob) { job = { ...blob, lastStatus: null }; jobs.set(id, job); }
  }
  return job ?? null;
}
```

CommentIQ's version of this bug: fetched comments "disappeared" whenever the worker restarted between fetching and the user clicking Analyse. The fix is always the same — persist the blob at write time, rehydrate lazily at read time, and accept that ephemeral pieces (a pagination continuation token, a live cursor) are lost and must be handled as "resume unavailable, not fatal".

Track live status **per entity, not globally**. A single shared "current job" object corrupts the moment the user starts job B while job A is in flight (switch tabs, start another fetch). Key every status map by entity id and let the UI ask for the one it cares about.

### 3.5 Storage schema — namespaced keys plus a denormalized index

```
theme                 -> 'glass' | 'light' | 'dark'
is_pro                -> boolean
job_<id>              -> { data, fetchedAt, count }      // big blob, one per entity
insights_<id>         -> { ... }                          // derived results, separate key
history               -> [{ id, title, at, expiresAt }]   // small index, newest first
```

Rules:
- Never `chrome.storage.local.get(null)` to "list things" — it drags every big blob (and unrelated settings) into memory. Maintain a small denormalized index array and read only that.
- Expire lazily: prune expired index entries (and remove their blobs) when the list is read, instead of scheduling `chrome.alarms` for cleanup.
- Re-adding an entity replaces its index entry (filter by id, unshift) — no duplicates.
- `chrome.storage.onChanged` is your cross-surface sync bus: options page writes `theme`, content script listens and re-skins. No custom messaging needed for settings.

### 3.6 Content script ↔ worker wiring

Content script pushes events; worker pulls fresh state when asked (SPA pages make push-only stale):

```js
// content.js — detect SPA navigation (no page reload) via MutationObserver
let lastId = readIdFromUrl();
new MutationObserver(() => {
  const id = readIdFromUrl();
  if (id && id !== lastId) { lastId = id; chrome.runtime.sendMessage({ type: 'PAGE_CHANGED', id }); }
}).observe(document.body, { childList: true, subtree: true });
```

```js
// background.js — pull the truth from the live tab on demand; don't trust a cached push
async function detectActivePageId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  const [inj] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => new URLSearchParams(location.search).get('id'),
  });
  return inj?.result ?? null;
}
```

When the worker messages a content script, always swallow the "no receiver" error — the tab may not have your script (chrome://, Web Store, PDF viewer):

```js
chrome.tabs.sendMessage(tabId, msg, () => void chrome.runtime.lastError);
```

### 3.7 Context menus — rebuild wholesale, never patch

```js
chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.is_pro || changes.settings)) createContextMenu();
});

async function createContextMenu() {
  await new Promise((r) => chrome.contextMenus.removeAll(() => { void chrome.runtime.lastError; r(); }));
  const make = (props) => chrome.contextMenus.create(props, () => void chrome.runtime.lastError);
  make({ id: 'root', title: 'MyExt', contexts: ['selection', 'editable'] });
  // ... children, prefixed ids like `act-<actionId>` so the click handler can parse them
}
```

`removeAll` + rebuild is idempotent and immune to "duplicate id" errors on worker restart. Menu items are a projection of state (plan, capabilities) — rebuild on every state change.

## 4. Anti-patterns

- **Returning a Promise (or nothing) from `onMessage` and expecting a response.** Only `return true` + `sendResponse` works across all Chrome versions. Symptom: sender gets `undefined`, `runtime.lastError: message port closed`.
- **A single global `currentThing` variable in the worker.** It's wiped on restart AND wrong the moment two tabs are involved. CommentIQ's `currentVideoId` is explicitly documented as a push-signal cache only — the authoritative read re-detects from the active tab every time.
- **Trusting broadcasts as the only state channel.** The panel that was closed during your `JOB_DONE` broadcast reopens to a blank screen forever. Every broadcast needs a matching pull endpoint, and the pull must compute freshness from live state (not replay a stale "last status" snapshot — CommentIQ's `hasMore` had to be recomputed, not replayed).
- **Letting a background loop `sleep()` without a keep-alive.** A 12-second backoff inside a retry loop is longer than you think relative to a 30s idle window that only resets on *events*. The loop dies silently; the user sees a frozen loader.
- **`setTimeout`-based scheduling for anything beyond ~20s in a worker.** Use `chrome.alarms` for real schedules; use the keep-alive port only to protect an active, user-visible job.
- **Popup + `action.onClicked` together.** Silent conflict; the popup wins and your click handler is dead code.
- **Re-fetching from scratch on retry.** Persist your pagination cursor. CommentIQ resumes from the stored continuation token on manual retry instead of re-downloading 750 comments.
- **Ignoring `chrome.runtime.lastError` in callbacks.** Every ignored one prints an "Unchecked runtime.lastError" to the console — reviewers and users see it. The `() => void chrome.runtime.lastError` idiom acknowledges errors you genuinely don't care about.
- **Assuming the content script can run everywhere.** It can't: `chrome://`, the Chrome Web Store, and PDF viewers are off-limits by policy. Quill ships a side panel specifically as the fallback surface for those pages — plan one.

## 5. Usage

Give the AI this skill plus a one-paragraph product description. Ask for, in order:

1. **Manifest + surface map** — which of popup/side panel/options/content script the product needs, with the manifest generated per §3.1 and permissions minimized.
2. **Message contract** — a typed list of `{ type, direction, sync|async, payload }` messages before any implementation. This forces the push/pull split (§3.2, §3.6) to be designed, not discovered.
3. **Storage schema** — keys per §3.5 with a rehydration note for each in-memory structure.
4. **Worker + one surface end-to-end** — then iterate surface by surface.

For debugging: paste the symptom. "Spinner never resolves after reopening the panel" → missing pull resync (§3.4). "Works for 30 seconds then goes quiet" → worker eviction (§3.3). "sendResponse gives undefined" → async contract (§3.2).

**Web Store submission checklist** (both products went through review):
- [ ] Version bumped in `manifest.json`; zip contains only shipped files (no `node_modules`, no `.git`, no design docs).
- [ ] Every permission and host permission has a one-sentence justification written for the review form. `activeTab` + `scripting` beats `tabs` for reading the active page.
- [ ] No remote code, no `eval`, no `innerHTML` with untrusted strings (build DOM with `createElement`/`createElementNS` — also required under Trusted Types on strict sites).
- [ ] 128px icon looks correct on light AND dark toolbar; 16/48/128 all present.
- [ ] Screenshots at 1280x800, promo tile 440x280; description states clearly what data leaves the browser (say "nothing" if nothing does — it's a selling point).
- [ ] Privacy practices form matches reality: storage = user settings, host permissions = the exact origins used.
- [ ] Test the packed zip via "Load unpacked" on a clean Chrome profile — missing-file and path-case bugs only show up outside your dev profile.
- [ ] `onInstalled` with `details.reason === 'install'` opens your welcome/options page — first-run orientation measurably reduces "how do I use this" reviews.

## 6. Example Output

A request like "MV3 extension that summarizes the article on the current page into a side panel" produced with this skill:

```
myext/
├── manifest.json          # sidePanel, storage, activeTab, scripting; action w/o popup
├── background.js          # router: START_SUMMARY (fire+ack), GET_STATUS (async pull),
│                          # keepAlive port listener, per-tab jobs Map w/ storage rehydration
├── content.js             # IIFE; extracts article text on demand via executeScript func
├── sidepanel.html/js/css  # startKeepAlivePort(), broadcast listener + GET_STATUS resync
│                          # on open, terminal states always render a reason string
└── icons/
```

with a message contract table, a storage schema (`summary_<tabUrlHash>` blobs + `history` index with lazy expiry), and a filled-in submission checklist. Total scaffold-to-loadable time: minutes, with the three classic MV3 lifecycle bugs designed out rather than debugged in.
