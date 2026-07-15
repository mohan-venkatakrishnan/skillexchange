---
title: DevTools Panel Extensions Skill
category: Extension
description: Build a real Chrome DevTools panel — the surface with four JavaScript contexts, none of which can talk to each other directly. Covers the devtools_page bootstrap, message routing through the background keyed by inspectedWindow.tabId, escaping the eval sandbox to reach page globals, surviving navigation and panel-close, theme detection, and keeping a high-frequency event stream from melting the panel.
usage: Load this skill before building any DevTools panel or debugging one that goes blank on reload. Describe what your panel inspects and the AI will produce the manifest, devtools page, background router, and page bridge with the tabId plumbing already correct. Paste "my panel is empty after refresh" or "sendMessage from the panel does nothing" and it will diagnose against sections 3.3 and 3.6.
platforms: [Claude, Cursor]
priceUsd: 6
timeSavedHours: 14
pocUrl: https://github.com/reduxjs/redux-devtools
---
# DevTools Panel Extensions Skill

A DevTools panel is the least-documented surface on the extension platform and the one
with the most moving parts. Everything here was learned by building one, watching it go
blank on every page reload, and finding out the reason is architectural rather than a bug.

## 1. Philosophy

- **There are four realms and none of them are neighbors.** The devtools page, the panel,
  the content script, and the service worker are separate JS contexts. The panel cannot
  call `chrome.tabs`. The content script cannot see the panel. Every feature is a message
  crossing at least two boundaries. Design the routing first; discover it on day three
  and you rewrite.
- **The background is a switchboard, not a brain.** In this architecture it exists to hold
  the map from `tabId` → panel port. Put logic anywhere else.
- **`tabId` is the primary key of everything.** DevTools is per-inspected-tab. A user with
  three DevTools windows has three panels and one shared worker. State not keyed by
  `inspectedWindow.tabId` is state that leaks between their tabs.
- **The panel does not exist until the user clicks the tab.** Your devtools page runs when
  DevTools opens; the panel's JS runs the first time it is shown, and never if it never
  is. Anything that must capture from page-load onward cannot live in the panel.
- **Frequency kills.** A panel rendering every event is fine at 10/sec and unusable at
  2,000/sec. Batching is a requirement, not an optimization, and it belongs in the design.

## 2. Tech Stack

- **Project referenced:** Redux DevTools — https://github.com/reduxjs/redux-devtools —
  license: **MIT**. This skill is an independent, original guide; it is not affiliated with
  or endorsed by the Redux DevTools maintainers.
- MV3, `"devtools_page": "devtools.html"` — a top-level manifest key, not a permission,
  and it shows no warning.
- `chrome.devtools.panels.create`, `chrome.devtools.inspectedWindow`,
  `chrome.devtools.network.onNavigated`.
- `chrome.runtime.connect` long-lived ports for panel ↔ worker. Not `sendMessage`.
- A `document_start` content script plus a page-injected script when you need real page
  globals (§3.5).
- `chrome.devtools.panels.themeName` + `matchMedia` for theming.
- Permissions: usually just `["scripting"]` plus host permissions if you inject.

## 3. Patterns

### 3.1 Manifest and the devtools page bootstrap

```json
{
  "devtools_page": "devtools.html",
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"],
                        "run_at": "document_start" }],
  "web_accessible_resources": [
    { "resources": ["page-bridge.js"], "matches": ["<all_urls>"] }
  ]
}
```

`devtools.html` has no UI — nobody ever sees it. Its only job is to run one script:

```html
<!doctype html><meta charset="utf-8"><script src="devtools.js"></script>
```

```js
// devtools.js — runs once per DevTools window, for one inspected tab.
chrome.devtools.panels.create('My Panel', 'icons/panel-16.png', 'panel.html', (panel) => {
  panel.onShown.addListener((win) => resume(win));   // win = the panel's window object
  panel.onHidden.addListener(() => pause());         // nobody is looking; stop paying
});
```

The callback fires when the panel is **created**, not shown. `onShown` fires the first
time the user clicks your tab and every return after. `create` is your only
guaranteed-early hook — but it runs in the devtools page, which has `chrome.devtools.*`
and *not* `chrome.tabs`.

### 3.2 The four-context problem, drawn

```
┌─ devtools.html/js ─────────┐  has: chrome.devtools.* (inspectedWindow.tabId)
│  no UI; alive while        │  lacks: visible DOM, most chrome.* APIs
│  DevTools is open          │
└──────────┬─────────────────┘
           │ separate windows — cannot share variables
┌──────────▼─────────────────┐  has: chrome.devtools.*, full DOM, chrome.runtime
│  panel.html/js  (lazy)     │  lacks: chrome.tabs, any access to the page
└──────────┬─────────────────┘
           │ chrome.runtime.connect (port)
┌──────────▼─────────────────┐  has: everything
│  background.js             │  lacks: persistence (dies at ~30s idle)
└──────────┬─────────────────┘
           │ chrome.tabs.sendMessage(tabId, …)
┌──────────▼─────────────────┐  has: page DOM, chrome.runtime
│  content.js (isolated)     │  lacks: the page's JS globals — different world
└──────────┬─────────────────┘
           │ window.postMessage
┌──────────▼─────────────────┐  has: the page's real globals
│  page-bridge.js (main)     │  lacks: every chrome.* API
└────────────────────────────┘
```

Five realms, once you need anything the page put on `window`. Every arrow is a
serialization boundary: structured clone at best, JSON at worst. No functions, no DOM
nodes, no class instances cross any of them.

### 3.3 Routing through the background, keyed by tabId

The panel knows its tab id. The content script knows nothing about panels. The background
is the only place that can hold the map. This is the pattern; the rest is detail.

```js
// panel.js — connect once, announce the tab id as the first message.
const port = chrome.runtime.connect({ name: 'devtools-panel' });
port.postMessage({ type: 'INIT', tabId: chrome.devtools.inspectedWindow.tabId });
port.onMessage.addListener((msg) => { if (msg.type === 'EVENT_BATCH') renderBatch(msg.events); });
port.onDisconnect.addListener(() => setTimeout(reconnect, 250));  // worker was evicted
```

```js
// background.js — the switchboard. Nothing else lives here.
const panels = new Map();   // tabId -> port
const tell = (id, msg) => chrome.tabs.sendMessage(id, msg, () => void chrome.runtime.lastError);

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'devtools-panel') return;
  let tabId = null;
  port.onMessage.addListener((msg) => {
    if (msg.type === 'INIT') {
      tabId = msg.tabId;
      panels.set(tabId, port);
      tell(tabId, { type: 'PANEL_OPEN' });      // someone is finally listening
      return;
    }
    if (tabId != null) tell(tabId, msg);
  });
  port.onDisconnect.addListener(() => {
    if (tabId == null) return;
    panels.delete(tabId);
    tell(tabId, { type: 'PANEL_CLOSED' });      // stop producing
  });
});

// Content script → panel. sender.tab.id is the key; never trust a tabId in the body.
chrome.runtime.onMessage.addListener((msg, sender) => {
  const id = sender.tab?.id;
  if (id != null) panels.get(id)?.postMessage(msg);
});
```

Three things this gets right that a first attempt gets wrong. **`sendMessage` from the
panel does not work the way you hope** — there is no `sender.tab` for a DevTools context,
so the worker cannot tell which tab you mean; hence the port and the announced `tabId`.
**The port's `onDisconnect` is your only panel-closed signal** — DevTools closing gives you
no other event. And `panels.get(id)?.postMessage(...)` **silently drops when no panel is
open**, which is correct; do not queue in the worker, it is going to die anyway.

The worker dying mid-session is normal. `onDisconnect` fires in the panel, you reconnect,
and `connect()` itself wakes the worker. Because the panel re-sends `INIT` every time, the
map rebuilds itself with no extra machinery.

### 3.4 `inspectedWindow.eval` and its sandbox

```js
chrome.devtools.inspectedWindow.eval(
  'document.querySelectorAll("[data-component]").length',
  (result, exceptionInfo) => {
    if (exceptionInfo) {
      // isException: the PAGE's code threw. isError: the eval machinery failed.
      return warn(exceptionInfo.isException ? exceptionInfo.value : exceptionInfo.description);
    }
    render(result);
  }
);
```

`eval` runs in the **main world** of the inspected page — the one place a panel can see
`window.__MY_APP__` with no injection. The limits are sharp:

- **The return value is JSON-serialized.** Functions, DOM nodes, `Map`s, class instances,
  anything cyclic come back as `undefined` or `{}`. Extract primitives *inside* the
  expression; never try to hand back a live object.
- **The expression is a string.** No closures, no captured variables. You are
  string-templating code, with the injection hazards that implies — never interpolate raw
  user input.
- **The code runs as page code** and can be observed or monkey-patched by the page.
- **`useContentScriptContext: true`** flips it to your isolated world: gains
  `chrome.runtime`, loses page globals. Rarely what you want.

Honest guidance: `eval` is for cheap, one-shot, primitive-returning reads. Anything
recurring, high-volume, or structured goes through the bridge. A panel built on a polling
`eval` loop fights the JSON boundary forever *and* burns the main thread of the page it is
supposed to be measuring.

### 3.5 Reaching page globals properly (the bridge)

Content scripts share the DOM but not `window`. To read the page's real objects, inject
into the main world and talk over `postMessage`.

```js
// content.js — isolated world, document_start.
const s = document.createElement('script');
s.src = chrome.runtime.getURL('page-bridge.js');    // must be web_accessible_resources
s.onload = () => s.remove();                        // the code has already run
(document.head || document.documentElement).prepend(s);

window.addEventListener('message', (e) => {         // page → content → background → panel
  if (e.source !== window || e.data?.__src !== 'my-bridge') return;
  chrome.runtime.sendMessage({ type: 'PAGE_EVENT', payload: e.data.payload });
});
```

```js
// page-bridge.js — MAIN world. No chrome.* here at all.
(() => {
  const send = (payload) => window.postMessage({ __src: 'my-bridge', payload }, '*');
  const hook = window.__MY_APP_HOOK__;
  if (!hook) return send({ type: 'NO_APP' });
  hook.subscribe((e) => send({ type: 'APP_EVENT', event: serialize(e) }));
  function serialize(e) { return { name: e.name, at: e.timestamp, size: e.items?.length ?? 0 }; }
})();
```

The details that cost time:

- **`document_start` + `prepend`** — inject before the page's own scripts run, or your hook
  arrives after the app booted and you miss everything.
- **`web_accessible_resources` with `matches`** — omit it and `getURL` returns a URL the
  page may not load. The script tag silently does nothing.
- **Serialize in the bridge**, the last place the real object exists. `postMessage` uses
  structured clone, which throws `DataCloneError` on functions and DOM nodes — into the
  *page's* console, not yours.
- **Namespace, and check `e.source !== window`.** Every extension and every page on the
  internet posts to that same channel.
- **A page with a strict CSP can block your injected `<script src>`.** No clean workaround:
  fall back to `eval` and degrade with a sentence.

### 3.6 Surviving navigation and reload

The bug everyone hits: user presses F5, panel goes permanently blank, zero console errors
in any realm.

What happens: the page reloads, so the content script and bridge are destroyed and
recreated fresh. The panel and devtools page are **not** reloaded — they persist across
navigation. So the panel holds state for a page that no longer exists, and the new content
script has never heard of your panel.

```js
// panel.js
chrome.devtools.network.onNavigated.addListener((url) => {
  clearState();                                  // old page is gone; its data is stale
  port.postMessage({ type: 'PANEL_OPEN' });      // re-announce to the NEW content script
  renderEmpty(`Waiting for ${new URL(url).host}…`);
});
```

```js
// content.js — a fresh script must PULL, because the broadcast may have been sent to nobody.
chrome.runtime.sendMessage({ type: 'IS_PANEL_OPEN' }, (res) => {
  void chrome.runtime.lastError;
  if (res?.open) startProducing();
});
```

Push plus pull — the same rule as everywhere else in extensions. Any broadcast a receiver
can miss needs a matching pull, or your UI is blank forever with no error.

### 3.7 Theme detection

```js
function applyTheme() {
  const dark = chrome.devtools.panels.themeName === 'dark'
    || window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
```

`themeName` reflects the DevTools theme specifically — a user with dark DevTools on a light
OS should get a dark panel. It is read at creation and does not update live, hence the
`matchMedia` pairing. Use DevTools' own CSS variables (`--color-background`,
`--color-text-primary`) where you can; a panel that ignores the host theme looks broken
next to Elements no matter how nice it is on its own.

### 3.8 High-frequency streams

A panel taking one message per page event dies on any real app. Batch at the **producer**,
before the messages exist:

```js
// page-bridge.js — coalesce in the page, flush on a frame boundary.
let queue = [], scheduled = false;
function emit(event) {
  queue.push(serialize(event));
  if (queue.length > 5000) queue.splice(0, queue.length - 5000);   // hard cap, drop oldest
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const batch = queue; queue = [];
    window.postMessage({ __src: 'my-bridge', payload: { type: 'BATCH', batch } }, '*');
  });
}
```

The isolated-world hop now happens ~60 times a second instead of ~2,000. Three more rules.
**Pause when hidden** — `panel.onHidden` tells the bridge to stop emitting entirely;
`onShown` re-enables and pulls current state. **Cap and drop visibly** — an unbounded array
is a memory leak with a UI; render "showing last 5,000 of 41,203", because a user who sees
the cap trusts the tool more than one who silently loses data. **Virtualize the list** —
5,000 real DOM rows is 5,000 rows of jank, and this is the single largest perf win in any
log-style panel.

## 4. Anti-patterns

- **`chrome.runtime.sendMessage` from the panel, expecting the worker to know the tab.**
  There is no `sender.tab` for a DevTools context. Use a port and announce `tabId`.
- **Global state in the background keyed by nothing.** Two DevTools windows both write
  `currentData` and each sees the other's page. Key by `tabId`, always.
- **Sharing variables between `devtools.js` and `panel.js`.** Separate windows. It looks
  like one extension; it is two realms.
- **Doing the work in `panels.create`'s callback.** That fires on creation, not on show —
  expensive setup runs for users who never open your tab.
- **Building the panel on a polling `inspectedWindow.eval` loop.** JSON-only returns, no
  closures, string-templated code, and it burns the page's main thread.
- **Returning a DOM node or a `Map` from `eval`.** Comes back as `{}` and you blame your
  selector for an hour.
- **Ignoring `onNavigated`.** The panel outlives the page. Every reload leaves you holding
  dead state and talking to a content script that no longer exists.
- **Broadcasting `PANEL_OPEN` with no matching `IS_PANEL_OPEN` pull.** A content script
  that loads after the broadcast never starts producing — forever, silently.
- **One postMessage per page event.** Fine in your demo app, unusable on a real one.

## 5. Usage

Give the AI this skill plus a description of what your panel inspects. Ask for, in order:

1. **Realm map** — which of the five contexts (§3.2) you actually need. If
   `inspectedWindow.eval` alone covers it, say so and skip the bridge entirely.
2. **Message contract** — a table of `{ type, from, to, payload, batched? }` before any
   implementation, with `tabId` routing explicit. This solves the four-context problem on
   paper instead of in a debugger.
3. **Manifest + devtools page + background router** — §3.1 and §3.3, with
   `web_accessible_resources` correct if a bridge is involved.
4. **Bridge + content script** — `document_start`, prepend injection, serialize-at-source,
   namespaced postMessage.
5. **Lifecycle wiring** — `onNavigated` reset, `IS_PANEL_OPEN` pull, `onShown`/`onHidden`
   produce/pause, port `onDisconnect` reconnect.

For debugging: "panel blank after F5" → §3.6. "sendMessage from panel does nothing" →
§3.3. "eval returns `{}`" → §3.4. "Injected script never runs" → `web_accessible_resources`
or page CSP (§3.5). "Panel freezes on a busy page" → §3.8.

One thing that makes panel development tolerable: undock DevTools into its own window,
then press `Ctrl/Cmd+Shift+I` **on the DevTools window**. You get a second DevTools
inspecting your panel.

## 6. Example Output

A "Render Timeline" panel for a component framework, built with this skill:

- **Realms:** all five. `page-bridge.js` installs a hook on the framework's dev global at
  `document_start`, serializes each commit to `{ id, name, ms, depth }`, and coalesces on
  `requestAnimationFrame` with a 5,000-entry cap.
- **Router:** `background.js` is 41 lines — a `Map<tabId, port>`, an `INIT` handler, two
  forwarders, no product logic. Worker eviction mid-session is invisible because the panel
  re-`INIT`s on reconnect.
- **Panel:** a virtualized flame list rendering one batch per frame, `onHidden` pausing the
  bridge outright, `onNavigated` clearing to "Waiting for app.example.com…". Theme from
  `panels.themeName` plus a `matchMedia` listener, using DevTools' own CSS variables so it
  sits next to Elements without looking bolted on.
- **Fallback:** on a page whose CSP blocks the injected script, the panel notices the
  missing bridge within 500ms and falls back to a one-shot `eval` summary count —
  degraded, labeled with a sentence explaining why, not a dead spinner.
- The bug that justifies §3.6 on its own: reloading the page left the panel permanently
  empty with zero errors in any of the five realms, because the new content script had
  missed a broadcast sent to nobody.
