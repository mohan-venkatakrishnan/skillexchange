---
title: On-Device AI Chrome Extension Skill (Gemini Nano)
category: Extension
description: Ship Chrome extensions that run Gemini Nano locally via Chrome's built-in AI APIs — zero API cost, private by design, works offline. Distilled from two shipped products (CommentIQ, Quill): the offscreen-document pattern, session cloning, honest capability detection, structured-output chunking, and the graceful-fallback architecture for the majority of devices where the model isn't there.
usage: Load this skill when building or debugging any feature on Chrome's built-in AI (Prompt API / LanguageModel, Rewriter, Summarizer, Writer, Proofreader). Tell the AI which context your code runs in (service worker, content script, extension page) and what the model should produce; it will pick the right host context, session strategy, and fallback path. Paste model errors (kErrorUnknown, QuotaExceededError, hangs) for diagnosis against section 4.
platforms: [Claude, Cursor]
priceUsd: 8
timeSavedHours: 20
pocUrl: https://tapdot.org
---
# On-Device AI Chrome Extension Skill (Gemini Nano)

From two shipped extensions that run Gemini Nano in production: CommentIQ (bulk analysis of up to 1,000 YouTube comments through an offscreen document, with structured JSON output) and Quill (writing tools using the specialized Writing Assistance APIs with Prompt API fallback). Every rule below was paid for with a real-device bug.

## 1. Philosophy

- **On-device AI is a capability, not a dependency.** Most of your users will NOT have the model (wrong hardware, wrong Chrome build, flags off, 22GB disk requirement unmet). The product must be fully coherent — not apologetic — without it. CommentIQ ships "search-only insights" as a first-class result when the model is unavailable; Quill's UI greys out exactly the actions whose engine is missing and links straight to the enabling flag.
- **Zero cost and privacy are the product, not implementation details.** "Nothing leaves the browser" is a headline feature you can put in the store listing, and $0 inference means free tiers that don't bleed money. Design the architecture so this stays literally true — no telemetry containing user text, ever.
- **The model is flaky; the architecture absorbs it.** Real-device calls hang past their abort signals, fail on first warm-up, and corrupt sessions with `kErrorUnknown`. Retries, outer timeouts you enforce yourself, and partial-result salvage are not defensive extras — they are the baseline.
- **Never throw away work.** If 6 of 8 chunks analyzed successfully before a timeout, the user gets a labeled partial report, not an error screen. Partial and honest beats complete and imaginary.
- **Small context window, plan for it.** Nano's context is shared between input and output. Chunk your input against the *measured live budget*, not a guessed token count.

## 2. Tech Stack

- **Prompt API** (`LanguageModel` global) — the general engine and universal fallback. Structured output via `responseConstraint` (JSON Schema), streaming via `promptStreaming()`.
- **Writing Assistance APIs** (`Rewriter`, `Writer`, `Summarizer`, `Proofreader`) — narrower, separately flagged, better at their one job. Prefer them when present; fall back to Prompt API.
- **Offscreen document** (`chrome.offscreen`) — the AI host when your orchestrator is a service worker: `LanguageModel` only exists in document/Window contexts, never in a service worker.
- Content scripts CAN access these APIs directly on supporting builds — verified in production (Quill). If your AI runs where the user's selection is, you may not need an offscreen document at all.
- `minimum_chrome_version: "138"` or later; `"offscreen"` permission when using the offscreen pattern.
- No external AI SDKs, no API keys, no server.

## 3. Patterns

### 3.1 Honest capability detection

Availability is per-API and per-device. Check every engine you can use, derive per-feature capability, and persist it so every surface (menus, popup, options) can render the same truth:

```js
const AI_GLOBALS = ['Rewriter', 'Proofreader', 'Summarizer', 'Writer', 'LanguageModel'];

async function avail(name) {
  const G = globalThis[name];
  if (!G || typeof G.availability !== 'function') return 'unavailable';
  try { return await G.availability(); } catch { return 'unavailable'; }
}

async function detectCaps() {
  const av = Object.fromEntries(await Promise.all(AI_GLOBALS.map(async n => [n, await avail(n)])));
  const ok = (a) => !!a && a !== 'unavailable';   // 'available' | 'downloadable' | 'downloading' all count
  const prompt = ok(av.LanguageModel);            // universal fallback
  return {
    rewrite:   prompt || ok(av.Rewriter),
    proofread: prompt || ok(av.Proofreader),
    summarize: prompt || ok(av.Summarizer),
    write:     prompt || ok(av.Writer),
  };
}
```

Present it to users as an honest checklist, one line per requirement (this is Quill's settings page, and it cut support mail dramatically):

```
On-device AI status
  ✓ Chrome 138+                        (you have 140)
  ✓ Prompt API flag enabled            chrome://flags/#prompt-api-for-gemini-nano
  ✗ Optimization Guide model           chrome://flags/#optimization-guide-on-device-model
  ✗ Model downloaded                   (~2 GB, downloads on first use)
```

Two hard rules:
- `availability()` and `create()` must be called with the **same options object** — the availability answer is only valid for the options it was asked about.
- A page can't navigate to `chrome://flags` — route it through the worker: `chrome.tabs.create({ url: 'chrome://flags/#prompt-api-for-gemini-nano' })`.

### 3.2 The offscreen document pattern

When orchestration lives in the service worker, host the model in an offscreen document. Create lazily, keep it alive so the warm session (and any one-time model download) persists across jobs:

```js
// background.js
let offscreenReady = null;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!offscreenReady) {
    offscreenReady = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Runs the built-in on-device language model — it requires a document context the service worker does not have.',
    }).catch((e) => { offscreenReady = null; throw e; });  // let a later call retry fresh
  }
  await offscreenReady;
}
```

The `offscreenReady` promise-latch matters: two near-simultaneous callers would otherwise both call `createDocument` and one throws "only one offscreen document".

### 3.3 Session strategy: one warm base, clone per call

Creating a session is expensive (possibly a model download); a shared session accumulates every prompt/response in its context window until it overflows. The answer is both:

```js
// offscreen.js
const MODEL_OPTIONS = {
  expectedInputs:  [{ type: 'text', languages: ['en'] }],   // declare languages —
  expectedOutputs: [{ type: 'text', languages: ['en'] }],   // silences warnings, attests quality
};

let baseSessionPromise = null;
function getBaseSession() {
  if (!baseSessionPromise) {
    baseSessionPromise = LanguageModel.create({
      ...MODEL_OPTIONS,
      initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          const pct = Math.round((e.loaded ?? 0) * 100);
          chrome.runtime.sendMessage({ type: 'AI_DOWNLOAD_PROGRESS', progress: pct }).catch(() => {});
        });
      },
    }).catch((e) => { baseSessionPromise = null; throw e; }); // failed create must not poison retries
  }
  return baseSessionPromise;
}

async function promptOnce(base, text, schema) {
  let clone;
  try {
    clone = await base.clone();                    // fresh context, no cold start
    const response = await clone.prompt(text, { responseConstraint: schema });
    return { response, usage: { used: clone.contextUsage, total: clone.contextWindow } };
  } catch (e) {
    return { error: e.message };
  } finally {
    clone?.destroy();                              // ALWAYS destroy clones
  }
}
```

Serialize access — one model, one queue. Concurrent clones/prompts against the same base are not documented safe:

```js
let queue = Promise.resolve();
function enqueue(fn) {
  const result = queue.then(fn, fn);
  queue = result.catch(() => {});
  return result;
}
```

### 3.4 Chunking against the measured budget

Input and output share the window, so "fits" must reserve output headroom. Measure real prompts with `measureInputUsage` (it doesn't mutate session state — no clone needed):

```js
const INPUT_BUDGET_FRACTION = 0.6;   // leave ~40% for the model's own output; tune empirically

const budget = Math.floor((base.contextWindow - base.contextUsage) * INPUT_BUDGET_FRACTION);
const fits = async (texts) => (await base.measureInputUsage(buildPrompt(texts))) <= budget;
// greedily pack items into as few chunks as `fits` allows
```

Two UX refinements that made CommentIQ feel fast:
- **Cap the first chunk tiny** (~10 items) regardless of budget — it finishes in seconds and puts real results on screen immediately; later chunks pack normally.
- **Broadcast per-chunk results** (`CHUNK_DONE` with a `requestId`) so the UI fills in progressively instead of blanking until the whole job ends. Tag every broadcast with a `requestId` and filter in the listener — runtime broadcasts have no sender identity, and without the tag a stale listener attributes another job's chunks to itself.

### 3.5 Streaming, and the cumulative-vs-delta trap

Use `promptStreaming()` for anything longer than a few seconds — the first token proves the call is alive. But chunk semantics differ across Chrome versions (some yield the full response-so-far, some yield deltas). Detect instead of assuming:

```js
const parts = [];
for await (const part of stream) parts.push(part);
const concatenated = parts.join('');
const last = parts[parts.length - 1] ?? '';
const response = last.length >= concatenated.length ? last : concatenated;
```

### 3.6 Retries, corrupted sessions, and outer timeouts

```js
async function promptWithRetry(base, text, schema, maxRetries = 2) {
  let current = base, result;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    result = await promptOnce(current, text, schema);
    if (!result.error) return result;
    if (attempt < maxRetries) {
      if (result.error.includes('kErrorUnknown')) {
        // internal model error — the session may be corrupted; retrying on it rarely recovers
        baseSessionPromise = null;
        try { current = await getBaseSession(); } catch {}
      }
      await sleep(1000 * 2 ** attempt);
    }
  }
  return result;
}
```

And at the orchestrator: race the whole job against your own deadline AND a user-cancel promise. Real-device testing showed model calls hanging **past AbortSignal-based timeouts** — never depend on the model cooperating with cancellation. On timeout/cancel, return whatever chunks completed (labeled partial), not an error.

Cancellation needs both halves: disconnect your listener, AND tell the AI host to stop draining its queue (a cancelled-requestId set checked between chunks). Otherwise a cancelled job keeps grinding and the user's re-click queues behind it — the classic "stuck spinner after cancel".

### 3.7 The fallback ladder

Every feature declares its ladder before it ships:

1. Dedicated API (`Rewriter`/`Summarizer`/...) if available — best quality for the task.
2. Prompt API with an equivalent system prompt — broadly available engine.
3. Non-AI fallback that is still a real feature (CommentIQ: statistical "search-only insights"; Quill: action greyed out with a one-tap "Enable on-device AI →" flags link).

```js
async function doSummarize(type, length, text) {
  const a = await avail('Summarizer');
  if (a !== 'unavailable') {
    const opts = { type, format: 'plain-text', length };
    if (a !== 'available') opts.monitor = downloadMonitor;   // surface download progress
    const s = await Summarizer.create(opts);
    try { return await s.summarize(text); } finally { try { s.destroy(); } catch {} }
  }
  return promptOnce(SUMMARIZE_SYSTEM_PROMPTS[type], text);   // rung 2
}
```

Also sanitize: Nano loves emitting Markdown emphasis where you asked for prose. Strip `**`, `__`, backticks, and leading `#` before display. And tolerate shape drift — Proofreader's return shape varies across builds (string vs `{correctedInput}` vs corrections array); write an extractor that handles all of them.

## 4. Anti-patterns

- **Calling `LanguageModel` in a service worker.** It does not exist there. Symptom: `LanguageModel is not defined`, only in production. Host it in an offscreen document, extension page, or content script.
- **One shared session for everything.** Context fills with every prior exchange; quality degrades, then `QuotaExceededError`. Clone-per-call from a warm base.
- **Not destroying clones.** Each leaked session holds model resources; a long analysis leaks dozens. `finally { clone?.destroy(); }` — no exceptions.
- **Trusting `availability()` as a guarantee.** It means "worth trying," not "will succeed" — `create()` can still fail (download failure, disk). Guard `create()` too, and reset your promise-latch on failure so retry gets a fresh attempt.
- **AbortSignal as your only timeout.** Real devices hang past it. Race against your own deadline and salvage partials.
- **Treating the first failure as final.** First-call warm-up failures and transient offscreen restarts are common and usually clear on one retry ~1.5s later. CommentIQ retries the entire empty-result job once before falling back — this single rule converted many "broken" runs into successful ones.
- **Analyzing everything because you can.** Feeding 2,500 comments took minutes for insight that the top-liked 1,000 already contained. Select the highest-signal subset — but **filter, don't re-sort**, if any output (like a sentiment timeline) assumes input order.
- **Progress in implementation units.** "Chunk 3 of 7" means nothing to users; "Analysing 430/1000 comments" does. Map progress to the user's units.
- **Fabricating completeness.** If some chunks failed after retries, say `analysed 875 of 1000` and label the report partial. An IPC call resolving cleanly does NOT mean every chunk inside it succeeded — check per-chunk errors before claiming `partial: false`.
- **Blocking UI on the model download.** First use can trigger a ~2GB download. Wire the `monitor` callback into visible progress, and pre-trigger the download from your onboarding/options page when state is `downloadable`.

## 5. Usage

Tell the AI three things: (1) where the feature's code runs (worker / content script / extension page), (2) what the model must produce (freeform text vs structured JSON — provide the schema), (3) what the no-model experience should be. Then have it generate:

1. The capability report (§3.1) and where each surface renders it.
2. The host-context decision: offscreen (§3.2) only if orchestration is in the worker; direct access otherwise.
3. Session + queue module (§3.3), chunker if input can exceed ~a few thousand tokens (§3.4).
4. The fallback ladder (§3.7) written down per feature before implementation.
5. Failure drill: for each of hang / kErrorUnknown / cancel / partial-chunk-failure, what the user sees.

Debug prompts that work well with this skill: "model call never resolves" → §3.6 outer timeout; "second analysis stuck behind cancelled first" → cancellation both-halves; "JSON truncated/mangled" → cumulative-vs-delta (§3.5) or output headroom (§3.4); "works on my machine, unavailable for users" → §3.1 checklist rendered in-product.

## 6. Example Output

Request: "Summarize all open PR descriptions on this GitHub page on-device, with sentiment per PR, as JSON."

Skill-guided output: a content-script feature (GitHub page context — no offscreen needed) with `detectCaps()` gating the button; a `{ prs: [{ title, summary, sentiment }] }` responseConstraint schema; items packed by `measureInputUsage` against a 0.6 budget with a 5-item first chunk; per-chunk progressive rendering keyed by requestId; retry-with-session-reset on kErrorUnknown; and a fallback that renders plain description excerpts with a ✓/✗ enablement checklist when no engine is available. Cost per summary: $0. Data leaving the browser: none — and the listing says so.
