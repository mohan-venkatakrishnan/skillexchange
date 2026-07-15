---
title: Installable Offline PWAs with Vite PWA Skill
category: Website
description: Turn a Vite app into a genuinely installable, offline-capable PWA that updates without breaking the session your user is in the middle of. Covers the manifest fields that actually gate the install prompt, Workbox caching strategies per resource type, the update lifecycle, offline write queues, and the iOS divergences nobody warns you about.
usage: Load this skill before asking your AI assistant to add PWA support, fix an install prompt that won't appear, or debug a service worker serving stale assets. Say "use the Vite PWA offline skill" and describe your app and its offline requirements; the assistant will produce plugin config and update UX that follow these patterns instead of copy-pasted defaults.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 6
timeSavedHours: 14
pocUrl: https://github.com/vite-pwa/vite-plugin-pwa
---

# Installable Offline PWAs with Vite PWA Skill

## 1. Philosophy

A service worker is not a feature you add. It is a **proxy you install on your users' devices that outlives your deploy**, and you cannot uninstall it remotely. That asymmetry should terrify you slightly, and that fear is the correct engineering posture.

**You are shipping a cache, and caches are how you ship bugs into the future.** A bad JS bundle is fixed by the next deploy. A bad service worker is fixed by the next deploy *only if the bad service worker lets the next deploy through*. Get that wrong and your only remedy is asking users to clear site data — which, for the ones who churn instead, is not a remedy.

Three rules govern everything below:

1. **Never CacheFirst anything that isn't content-hashed.** Hashed assets (`app-a3f9c1.js`) are immutable by construction — cache them forever, safely. HTML is not hashed. CacheFirst your `index.html` and you have pinned every user to that revision, permanently, and the fix requires shipping a service worker they may never fetch.
2. **The update is a UX problem, not a config flag.** `skipWaiting` is one line and it will swap the assets out from under a running session. The user's lazy-loaded route 404s. Their form state vanishes on the reload you triggered. Decide deliberately whether an update interrupts, and default to asking.
3. **Offline is a state, not an error.** If your app's offline story is "the fetch rejects and a red toast appears," you built a website with extra steps. Real offline means reads come from cache and writes go into a queue that drains later.

If a feature cannot survive the tab being backgrounded for a week on a device that went through three network changes, it isn't offline-ready — it's online with optimism.

## 2. Tech Stack

- **vite-plugin-pwa** — https://github.com/vite-pwa/vite-plugin-pwa — licensed **MIT**. A Vite plugin that generates the web app manifest, wires up a service worker, and handles registration. It is a build-time wrapper around Workbox rather than a runtime of its own.
- **Workbox** — Google's service worker library (**MIT**). This does the actual precaching and routing; the plugin generates its config. That matters: when something breaks, the error text and the docs you need are Workbox's, not the plugin's.
- **Vite 5+** and **idb-keyval** (MIT) for the IndexedDB write queue in section 3.6.

This skill is an independent, original guide; it is not affiliated with or endorsed by the vite-plugin-pwa maintainers. All example code is original to this skill.

Recommended companions: Chrome DevTools' Application panel (the only debugger that exists for this), and a real iPhone — the simulator does not reproduce the install and storage behavior that will bite you.

## 3. Patterns

### 3.1 The manifest fields that actually gate installability

Most "why won't my install prompt show" bugs are one missing field. The criteria are stricter and dumber than the spec reads: HTTPS, a registered SW with a fetch handler, and a manifest with all of the below. Miss one and you get silence — no warning, no prompt.
```ts
// vite.config.ts
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [VitePWA({
    registerType: "prompt", // see 3.3 — the default you want
    manifest: {
      name: "Fieldnote",
      short_name: "Fieldnote",   // home screen label, ~12 chars before truncation
      start_url: "/?source=pwa", // same-origin, inside SW scope
      scope: "/",
      display: "standalone",
      background_color: "#0e1116", theme_color: "#0e1116", // splash + chrome tint
      icons: [
        { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png",
          purpose: "maskable" },
      ],
    },
  })],
});
```
Non-obvious details that cost real hours:

- **192 and 512 are both required.** Not 180, not 256. Android wants exactly these two present.
- **The maskable icon is a different image, not the same file with a different `purpose`.** Android crops to a circle/squircle and keeps only the inner ~80%. Tagging your existing icon as maskable shaves your logo's edges off. Design one with padding.
- **`start_url` with a query string is free analytics.** You cannot retrofit it into installs that already happened.
- **`display: "standalone"` removes the browser chrome — including the back button.** With no in-app back affordance, standalone makes your app a trap. Ship navigation before you ship the manifest.

### 3.2 Caching strategy per resource type

There is no global strategy. There are kinds of resource, and each has exactly one correct answer.
```ts
VitePWA({
  workbox: {
    globPatterns: ["**/*.{js,css,woff2}"], // hashed build output — immutable
    navigateFallback: "/index.html",       // HTML is NOT precached above
    navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
    runtimeCaching: [
      { // Third-party immutable assets: versioned, so CacheFirst is safe.
        urlPattern: /^https:\/\/cdn\.example\.com\/.*/,
        handler: "CacheFirst",
        options: { cacheName: "cdn-assets",
          expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] } } }, // 0 = opaque
      { // API reads: instant from cache, refreshed in background.
        urlPattern: ({ url, request }) =>
          url.pathname.startsWith("/api/") && request.method === "GET",
        handler: "StaleWhileRevalidate",
        options: { cacheName: "api-reads",
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
          cacheableResponse: { statuses: [200] } } }, // never cache a 401
      // Mutations: never cached, never replayed by accident.
      { urlPattern: ({ request }) => request.method !== "GET", handler: "NetworkOnly" },
    ],
  },
});
```
The reasoning, which is the part worth paying for:

- **CacheFirst for content-hashed assets.** The filename changes when the content changes, so a stale entry is unreachable by definition. The only case where "cache forever" is correct rather than reckless.
- **StaleWhileRevalidate for API reads.** The user gets last-known data in ~0ms and the fresh copy lands a moment later. Your UI must re-render when the revalidation resolves — if it renders once and never again, SWR just means "show stale data."
- **NetworkOnly for mutations.** A cached POST is a duplicated order.
- **`statuses: [200]` on API reads.** Cache a 401 during a token blip and your user is logged out until the entry expires.
- **`statuses: [0, 200]` for cross-origin.** Opaque responses report status 0. Omit the 0 and your CDN caching silently does nothing — no error, just misses forever.

### 3.3 The update lifecycle, and why `skipWaiting` is a trap

A new service worker installs, then **waits** — the old one still controls open tabs. `skipWaiting` says "activate now." Here's what that does to a user mid-session:

Your app is a SPA with lazy routes. New SW activates, purges the old precache. User clicks a link needing `settings-a3f9c1.js` — a chunk that no longer exists at that hash. The dynamic import rejects. Your route renders a white screen, in a session the user was in the middle of. Nothing in your logs says "service worker"; it says `Failed to fetch dynamically imported module`, and you will chase that for a day.

Ask instead:
```ts
// src/pwa.ts
import { registerSW } from "virtual:pwa-register";
const updateSW = registerSW({
  onNeedRefresh() {
    // A new version is waiting. Do NOT reload. Ask.
    showUpdateToast({ message: "A new version is ready.", actionLabel: "Reload",
      onAction: () => updateSW(true) }); // skipWaiting + reload, on the user's terms
  },
  onOfflineReady: () => showToast("Ready to work offline."),
  onRegisteredSW(swUrl, registration) {
    // Browsers only check for a new SW on navigation; a dashboard tab open for
    // three days may never check at all. Poll.
    setInterval(() => registration?.update(), 60 * 60 * 1000);
  },
});
```
`registerType: "prompt"` plus this handler is the honest default. Use `autoUpdate` only when you genuinely have no session state worth preserving — a marketing site, a docs site. On anything with a form in it, autoUpdate is a decision to occasionally discard user input.

### 3.4 Navigation fallback: SPA vs MPA

`navigateFallback: "/index.html"` means "any navigation you can't serve, answer with the shell." Correct for a SPA. Actively wrong for an MPA, where each route is a real document — you'd serve the wrong page's HTML offline.
```ts
// MPA: precache each entry document, no blanket fallback.
VitePWA({
  workbox: {
    globPatterns: ["**/*.{js,css,woff2}", "index.html", "about.html", "pricing.html"],
    navigateFallback: undefined,
  },
});
```
The denylist matters more than it looks. Without `navigateFallbackDenylist: [/^\/api\//]`, a navigation to `/api/export.csv` gets your HTML shell instead of the file — a bug that only appears offline, only on direct navigations, and looks like your API returning HTML.

### 3.5 Testing offline properly

DevTools' "Offline" checkbox is a start and it is not enough. It doesn't reproduce the case that actually breaks people: **flaky**, not absent. Requests that hang for 30s and then fail behave nothing like an instant `ERR_INTERNET_DISCONNECTED`.

1. Build and preview — **never test the SW in `vite dev`**.
2. Load, go offline, hard-navigate to a deep route. Does the fallback resolve?
3. Go offline, submit a form. Queued or lost?
4. Deploy a new build while a tab is open and offline. Come back online. Does the update prompt appear, or does the tab sit on a dead precache?
5. Throttle to "Slow 3G" *without* going offline. This is where SWR and hanging mutations reveal themselves.
6. Do all of the above once on a real iPhone, from the home screen icon, not Safari.

### 3.6 Offline writes: Background Sync with an IndexedDB fallback

Background Sync is Chromium-only. Safari has never shipped it. So the queue is yours; Background Sync is only the *wakeup* when available.
```ts
// src/offline-queue.ts
import { get, set } from "idb-keyval";
type QueuedWrite = { id: string; url: string; body: unknown; queuedAt: number };
const KEY = "write-queue";

export async function enqueue(url: string, body: unknown) {
  const queue = (await get<QueuedWrite[]>(KEY)) ?? [];
  queue.push({ id: crypto.randomUUID(), url, body, queuedAt: Date.now() });
  await set(KEY, queue);
  // Chromium only: let the SW wake and drain even if the tab closes.
  const reg = await navigator.serviceWorker.ready;
  if ("sync" in reg) await (reg as any).sync.register("drain-writes");
}

export async function drain() {
  const queue = (await get<QueuedWrite[]>(KEY)) ?? [];
  const remaining: QueuedWrite[] = [];
  for (const item of queue) {
    try {
      const res = await fetch(item.url, { method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": item.id },
        body: JSON.stringify(item.body) });
      if (!res.ok && res.status < 500) continue; // 4xx = permanently bad, drop it
      if (!res.ok) remaining.push(item);         // 5xx = retry later
    } catch { remaining.push(item); }            // network — keep it
  }
  await set(KEY, remaining);
}

window.addEventListener("online", () => void drain());
```
The `idempotency-key` is the whole design. A queued write *will* get replayed — by a reconnect, a Background Sync retry, or two tabs draining at once. Without a server-side idempotency check, "offline support" means "duplicate records." Generate the key when you *enqueue*, never when you send.

### 3.7 The iOS reality

Safari's PWA support is real but diverges in ways that invalidate your Android testing:

- **No `beforeinstallprompt`.** There is no install button you can render. It's Share → Add to Home Screen, and you must teach it — a one-time inline hint gated on `navigator.standalone === false` plus an iOS UA check.
- **Storage is evictable.** Safari clears caches and IndexedDB after roughly seven days without use for non-installed sites; installing exempts you. Your offline queue can silently vanish for a fortnightly browser visitor — never treat IndexedDB as durable storage for anything unsynced.
- **Push requires installation** — iOS 16.4+, home-screen only. `Notification.requestPermission()` in Safari proper no-ops or throws. Feature-detect, never assume.
- **Each home-screen install is its own storage jar.** Data in Safari isn't visible to the installed app. A user who signs in on the website then installs is logged out, and will report that as a bug.

## 4. Anti-patterns

- **`skipWaiting: true` because a blog post said so.** You chose to swap the running app's assets mid-session. The bug surfaces as `Failed to fetch dynamically imported module` and points nowhere near the service worker.
- **CacheFirst on `index.html`.** You permanently pinned every user to today's build. The fix requires shipping a service worker they will never fetch, because the old one is serving the old HTML. This is the closest the web has to bricking a device.
- **Testing the service worker in `vite dev`.** Dev-mode SW caching serves yesterday's module while you edit today's, and you will blame HMR for two hours. Keep it off in dev; test against `vite build && vite preview`.
- **One caching strategy for the whole app.** "Everything StaleWhileRevalidate" caches your login errors. "Everything NetworkFirst" means you built a website. Strategy is per resource type or it's nothing.
- **`Notification.requestPermission()` on page load.** Universally denied, and on iOS it doesn't even work outside an installed app. Ask after the user does something implying they want to be told.
- **Assuming Background Sync exists.** Chromium-only, always has been. If your drain logic lives only in the `sync` handler, iOS users have a queue that never empties — silent, total data loss in your happiest-path feature.
- **Caching a 401 or a 500.** The default `cacheableResponse` behaviour is more permissive than you think. One token blip during a deploy and users are stuck logged out until the entry ages out.
- **No update prompt at all.** Users sit on a build from six weeks ago and report bugs you fixed in May. If you won't build the prompt, at least poll `registration.update()` and use autoUpdate — but know what you traded.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe your app and specifically its offline contract: "Field inspection app, SPA, users go offline for hours in basements, must queue photo uploads and form submissions, iOS is 60% of traffic."
3. Ask for, in order: (a) the `VitePWA` block with manifest and per-resource `runtimeCaching`, (b) the `registerSW` wiring plus the update-prompt component, (c) the offline queue with idempotency keys, (d) the iOS install hint if iOS matters to you.
4. Audit every `runtimeCaching` entry against one question: *what happens if this response is served an hour after it stopped being true?* If the answer is bad, the strategy is wrong.
5. Run section 4 as a checklist, then walk section 3.5's test list on a real device before shipping. The service worker you deploy is the one you're stuck with.

The assistant should refuse to CacheFirst any non-hashed resource, should never set `skipWaiting` without an accompanying prompt UX, and should flag any offline write path lacking an idempotency key.

## 6. Example Output

Prompt given with this skill loaded: *"Add offline support to our notes app. Notes list should load offline, new notes should save offline and sync later, and users shouldn't get logged out when their token blips."*

Expected shape of the answer:
```ts
// vite.config.ts — only the notes-specific parts; manifest as in 3.1
VitePWA({
  registerType: "prompt", // never autoUpdate — the editor holds unsaved state
  workbox: {
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      { urlPattern: ({ url, request }) =>
          url.pathname.startsWith("/api/notes") && request.method === "GET",
        handler: "StaleWhileRevalidate",
        options: { cacheName: "notes-reads",
          // 200 only: a 401 during a token refresh must never be cached, or the
          // user is "logged out" until this entry expires.
          cacheableResponse: { statuses: [200] },
          expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 } } },
      { urlPattern: ({ request }) => request.method !== "GET", handler: "NetworkOnly" },
    ],
  },
});
```
```ts
// src/notes.ts — the write path never blocks on the network
export async function createNote(body: { title: string; text: string }) {
  const optimistic = { id: crypto.randomUUID(), ...body, pending: true };
  renderNote(optimistic);                  // UI updates immediately
  await enqueue("/api/notes", { ...body, clientId: optimistic.id });
  if (navigator.onLine) await drain();     // online: drains in ~0ms
}
```
Note what the output does *not* contain: no `skipWaiting`, no CacheFirst on HTML or on the API, no `try/fetch/catch/toast("You are offline")`. The read path is a cache with a background refresh, the write path is a queue with an idempotency key, and the update path asks the user first. Offline isn't the error branch — it's just the slow branch of the same code.
