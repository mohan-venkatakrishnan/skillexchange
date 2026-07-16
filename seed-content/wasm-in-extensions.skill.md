---
title: WebAssembly in Browser Extensions Skill
category: Extension
description: Ship Rust/WASM inside a Manifest V3 extension without fighting the CSP, the service worker lifecycle, or the review team. Covers wasm-pack target selection, why wasm-unsafe-eval is required and what it actually permits, instantiating from a bundled .wasm in a worker vs an offscreen document, detached-ArrayBuffer bugs across worker restarts, binary size, and justifying an opaque blob at review.
usage: Load this skill before adding WASM to an extension, or when a working wasm-pack build breaks the moment it is loaded as one. Describe the workload — what it computes, roughly how long, what triggers it — and the AI will pick the target, write the manifest CSP and resource declarations, and generate the loader with the right lifecycle. Paste a CSP error or a detached-buffer exception and it will diagnose against sections 3.2 and 3.7.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 20
pocUrl: https://github.com/rustwasm/wasm-bindgen
---
# WebAssembly in Browser Extensions Skill

WASM in a web page is a solved problem with good docs. WASM in an MV3 extension is a
different problem with almost none, and every layer — the CSP, the service worker, the
packaging rules, the review team — has an opinion. This is what shipping one taught me.

## 1. Philosophy

- **The default wasm-pack output does not work in an extension.** Not a bug: the glue that
  works everywhere else uses patterns MV3's CSP forbids, and the failure is an opaque CSP
  violation rather than a helpful error. Target choice is the first decision, not a
  build-config detail.
- **Bundle the binary. Never fetch it.** MV3 forbids remotely hosted code, and a `.wasm`
  downloaded at runtime is exactly that whatever you call it. It ships in the zip or it
  does not ship.
- **The service worker is a hostile host for WASM.** It dies at ~30s idle, taking your
  instance, your linear memory, and every `ArrayBuffer` you handed out. If your workload
  is measured in seconds, this is the central constraint, not an edge case.
- **Reach for WASM for a reason you can say out loud.** "It's faster" does not justify an
  opaque binary to a reviewer or ~200KB to a user. "This is an existing, audited Rust
  codec/parser" does.
- **Binary size is a feature.** A default release build is roughly double what it needs to
  be. Cutting it is one afternoon of build flags and it pays on every install.

## 2. Tech Stack

- **Project referenced:** wasm-bindgen — https://github.com/rustwasm/wasm-bindgen —
  license: **MIT OR Apache-2.0**. This skill is an independent, original guide; it is not
  affiliated with or endorsed by the wasm-bindgen maintainers.
- Rust (stable) + `wasm-bindgen` + `wasm-pack`, targeting `wasm32-unknown-unknown`.
- `wasm-pack build --target web` — the only target that works cleanly in an MV3 module
  worker with no bundler (§3.1).
- `wasm-opt` (binaryen) and `twiggy` for size; cargo profile flags for the rest.
- `content_security_policy.extension_pages` with `wasm-unsafe-eval` — mandatory (§3.2).
- `chrome.offscreen` when the work needs a DOM, a real `Worker`, or a lifetime the service
  worker cannot give (§3.4).
- The `.wasm` packaged; `web_accessible_resources` only if a content script must load it.
- No CDN, no `fetch()` to your server, no eval-based glue. All three are rejections.

## 3. Patterns

### 3.1 Picking the wasm-pack target

The decision that wastes the most time, because three of the four targets appear to work
in a plain page and only one survives contact with MV3.

```
--target web        → ES module + WebAssembly.instantiate. Works in a module service
                      worker. THE DEFAULT CHOICE.
--target bundler    → bare `import ... from './x_bg.wasm'`. Needs webpack/rollup with a
                      wasm loader. Silently unusable without one.
--target no-modules → assigns a global via a classic script. A module worker cannot
                      import it and MV3 module workers forbid importScripts. Avoid.
--target nodejs     → require() + fs. Not a browser target at all.
```

```bash
wasm-pack build --release --target web --out-dir ../extension/wasm
```

It emits `mylib.js` (ES module glue), `mylib_bg.wasm`, and types. The glue's `default`
export is an init function taking an optional path / `Response` / `ArrayBuffer`. That
parameter is the entire reason this target works in an extension: you can hand it bytes
you obtained legally.

### 3.2 The CSP, and why `wasm-unsafe-eval` is not a smell

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  },
  "background": { "service_worker": "background.js", "type": "module" }
}
```

Without it, every `WebAssembly.instantiate` throws: "Refused to compile or instantiate
WebAssembly module because 'wasm-unsafe-eval' is not an allowed source of script."

The name causes real hesitation, so be precise: `'wasm-unsafe-eval'` permits **compiling
and instantiating WebAssembly bytes**. It does not enable `eval()`, does not enable
`new Function()`, and does not relax `script-src 'self'` for JavaScript at all. It is the
narrow, modern replacement for what used to require `'unsafe-eval'` — which *would* have
opened JS eval, and which is what older tutorials still tell you to add. A guide that says
to add `'unsafe-eval'` for WASM is out of date and is handing a reviewer a reason to
reject you.

Two rules that bite. `extension_pages` covers the worker, popup, options, and devtools
panel — there is no separate worker CSP. And you **cannot** loosen the CSP for content
scripts this way: they run under the *page's* CSP, so a site with `script-src 'self'` and
no `wasm-unsafe-eval` blocks your content script's compile and the manifest cannot help.
If your feature needs WASM on arbitrary pages, that is an architectural constraint — do
the work in the worker or an offscreen document and message the result back.

### 3.3 Why fetch + instantiate works and eval-glue does not

The model that makes all of this click: MV3 does not care that WASM is "code." It cares
**where the bytes came from.** Bytes from a URL inside your own package are packaged code —
reviewed, fixed at install, exactly what shipped. Bytes from the network are remote code.
Code built from a string at runtime is remote code's cousin and dies to `script-src`.

```js
// background.js — module service worker, --target web output.
import init, { analyze } from './wasm/mylib.js';

let ready = null;                                    // memoize the PROMISE, not a boolean
function ensureWasm() {
  if (!ready) ready = (async () => {
    const url = chrome.runtime.getURL('wasm/mylib_bg.wasm');   // extension-origin URL
    const resp = await fetch(url);                             // a package read
    await init({ module_or_path: await resp.arrayBuffer() });  // explicit bytes
  })();
  return ready;
}

export async function run(input) { await ensureWasm(); return analyze(input); }
```

Notes worth the price of this skill:

- **`fetch()` on a `chrome-extension://` URL is a package read, not a network request.** No
  host permission, works offline, cannot be intercepted, not remote code. No reviewer has
  ever flagged it.
- **`instantiateStreaming` is a trap here.** It demands `Content-Type: application/wasm`,
  and extension-origin fetches do not reliably provide it — you get "Incorrect response
  MIME type" for a file in your own zip. Use `arrayBuffer()`, which is what passing the
  buffer to `init` does. The ~5ms is not worth the flake.
- **`init()` with no argument** makes the glue guess a URL relative to the JS module. In a
  worker that guess is often wrong, and the 404 surfaces as an unrelated instantiation
  error. Always pass explicit bytes.
- **Memoize the promise, not a boolean.** Two concurrent `ensureWasm()` calls before the
  first resolves will otherwise both instantiate — two linear memories, one orphaned.

What does not work: any glue that builds a function from a string. Older `no-modules`
output and hand-rolled loaders do this, `script-src 'self' 'wasm-unsafe-eval'` blocks it,
and adding `'unsafe-eval'` trades a build problem for a review problem.

### 3.4 Service worker vs offscreen document

```
Work < ~1s, no DOM, called from an event handler   → service worker
Seconds-to-minutes, or needs a real Worker/DOM     → offscreen document
Needs canvas / OffscreenCanvas / audio            → offscreen document
Must run with no UI open, on a schedule           → worker + alarms, chunked (§3.6)
Needs page globals                                → not WASM's problem; see §3.2
```

The worker is the obvious home and the wrong one for anything long. It is torn down at
~30s idle, and — this is the surprise — the idle timer resets on **events**, not on your
code running. A synchronous 45-second WASM call is not an event. You get evicted
mid-computation with no error, no rejection, no log: the promise you were awaiting simply
never settles.

An offscreen document is a real page with a normal page lifetime. It is not evicted while
it exists, it can spawn a real `Worker`, and you close it when done:

```js
// background.js
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument?.()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],                  // must be a reason that is actually true
    justification: 'Runs the bundled WASM image decoder off the main thread.',
  });
}
```

```js
// offscreen.js — a normal page. Spawn a real worker; keep WASM off this thread too.
const worker = new Worker('wasm-worker.js', { type: 'module' });
const pending = new Map();
let seq = 0;

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg.type !== 'DECODE') return false;
  const id = ++seq;
  pending.set(id, sendResponse);
  worker.postMessage({ id, bytes: msg.bytes }, [msg.bytes.buffer]);   // transfer, don't copy
  return true;                                    // async response — the MV3 contract
});
worker.onmessage = ({ data }) => { pending.get(data.id)?.({ out: data.out }); pending.delete(data.id); };
```

`reasons` is an enum (`WORKERS`, `DOM_PARSER`, `BLOBS`, `CLIPBOARD`, …) and the
`justification` string is read by a human at review. Only one offscreen document may exist
per extension, hence the `hasDocument` guard. It is invisible to users and absent from the
tab strip — which is exactly why reviewers read that justification carefully.

### 3.5 `web_accessible_resources` vs packaged-only

The default is packaged-only: files in your zip are readable by your own realms via
`getURL` + `fetch` with **no manifest declaration at all**. This surprises people who
assume every resource needs listing.

You need `web_accessible_resources` only when a **content script or the page** must load
the file, because a content script fetching an extension URL plays by the page's rules:

```json
"web_accessible_resources": [
  { "resources": ["wasm/mylib_bg.wasm"], "matches": ["https://app.example.com/*"] }
]
```

Default to packaged-only. Every entry is a file any matching page can fetch and
fingerprint — it makes your extension detectable and it is a question in review. If the
answer to "who loads it" is "the worker," the answer to "should it be web accessible" is
no.

The corollary that saves an architecture: since content scripts are stuck with the page's
CSP anyway (§3.2), keep WASM out of them entirely. Content script gathers input → message
→ worker or offscreen runs WASM → message back. Your binary stays packaged-only, invisible
to the page, and unblocked by any site's CSP.

### 3.6 Keeping the worker alive during long WASM work

If you stay in the worker despite §3.4, the workload must be chunked so events keep
firing. WASM is synchronous; a single long call cannot be interrupted. Split it in Rust:

```rust
#[wasm_bindgen]
pub struct Job { /* internal cursor + state */ }

#[wasm_bindgen]
impl Job {
    #[wasm_bindgen(constructor)]
    pub fn new(input: &[u8]) -> Job { /* ... */ }
    /// Process up to `budget_ms` of work; returns true when finished.
    pub fn step(&mut self, budget_ms: f64) -> bool { /* ... */ }
    pub fn take_result(&mut self) -> Vec<u8> { /* ... */ }
}
```

```js
async function runJob(bytes) {
  await ensureWasm();
  const job = new Job(bytes);
  while (!job.step(50)) {                          // 50ms slices
    await new Promise((r) => setTimeout(r, 0));    // yield to the event loop
    await persistCursor(job);                      // an eviction now costs 50ms, not the job
  }
  return job.take_result();
}
```

Yielding alone does not guarantee survival — the honest fix is a keep-alive port from an
open UI surface, or accepting that background-only long work belongs offscreen. But a
chunked job has a larger second benefit: it is **resumable**.

### 3.7 Memory growth and detached ArrayBuffers

The bug that costs a day, and it is in no tutorial.

WASM linear memory is backed by a JS `ArrayBuffer`. When memory grows — which happens on
allocation, invisibly, inside your Rust — the old buffer is **detached** and replaced. Any
view you were holding now throws `TypeError: Cannot perform Construct on a detached
ArrayBuffer`, or silently reads zeros.

```js
// WRONG — `view` detaches the moment any wasm call allocates.
const view = new Uint8Array(wasm.memory.buffer, ptr, len);
wasm.do_more_work();                       // may grow memory → view is detached garbage
console.log(view[0]);                      // throws, or zeros

// RIGHT — re-derive after every call into wasm, and copy out immediately.
const readBytes = (ptr, len) => new Uint8Array(wasm.memory.buffer, ptr, len).slice();
```

wasm-bindgen marshals correctly for values it owns; the danger is hand-written pointer
access, which is exactly what you write when optimizing away a copy. **Never hold a view
across a wasm call.**

The extension twist stacks on top. The worker restarts; your `ready` promise, the instance,
and all of linear memory are gone. A pointer you stashed in a `Map` — worse, one you wrote
to `chrome.storage` — now addresses an address space that no longer exists. It will not
throw. It will read whatever the new instance happens to have there.

```js
// Never: await chrome.storage.local.set({ resultPtr: ptr });  // meaningless after restart
const out = readBytes(ptr, len);            // copy out before anything can restart or grow
wasm.free_result(ptr, len);
await chrome.storage.local.set({ result: Array.from(out) });
```

The discipline that erases both bug classes: **WASM memory is a scratchpad with the
lifetime of a single call.** Copy in, compute, copy out, free. Nothing that outlives the
call may reference it.

### 3.8 Binary size

A default `wasm-pack build --release` on a modest library lands at 300–800KB. Most of that
is avoidable.

```toml
[profile.release]
opt-level = "z"       # size; try "s" if "z" is measurably slower for your workload
lto = true            # cross-crate inlining and dead-code elimination
codegen-units = 1     # better optimization, slower builds — worth it for a shipped artifact
panic = "abort"       # drops unwinding machinery; often 10-20% alone
strip = true
```

```bash
wasm-opt -Oz --enable-bulk-memory -o extension/wasm/mylib_bg.wasm extension/wasm/mylib_bg.wasm
twiggy top -n 20 extension/wasm/mylib_bg.wasm     # what is actually big
```

Where bytes hide, by payoff: `panic = "abort"` removes formatting-heavy unwind paths (keep
`console_error_panic_hook` in dev builds only). A single `format!` on an error path drags
in a surprising amount of core — `twiggy` will show it. `wasm-opt -Oz` after wasm-bindgen
takes another 15–30%, and wasm-pack's built-in invocation is not always current, so run it
yourself. And audit `getrandom` / `std::time`, pulled in transparently by common crates
with JS shims you may not need.

Gzip is what travels to the store, and WASM compresses well — but installed size and
compile time are uncompressed. 200KB is a defensible ask; 1.5MB invites the question.

### 3.9 Review: justifying a binary

A reviewer sees a `.wasm` as an opaque blob they cannot read. That is a fair problem.

- **Say what it is and where it came from,** in the listing and the review notes: "Image
  decoding is performed by a Rust library compiled to WebAssembly and bundled with the
  extension. Source: <public repo>. No code is downloaded at runtime."
- **Publish the source and a reproducible `wasm-pack` command.** This turns "opaque blob"
  into "artifact I could rebuild" and is the highest-leverage move available.
- **Make the network story provable** by requesting no host permissions for the WASM path.
  Decode locally, ask for zero origins, get an easy approve.
- **Do not minify the glue beyond what the toolchain emits.** Minified JS wrapped around an
  opaque binary reads as evasion.
- **Never ship a `.wasm` fetched at runtime, even from your own domain.** No exceptions, no
  appeal. The rejection is fast and correct.

## 4. Anti-patterns

- **`fetch`ing the `.wasm` from a CDN or your API.** Remotely hosted code: instant
  rejection, and it breaks offline besides.
- **Adding `'unsafe-eval'` to fix a WASM CSP error.** `'wasm-unsafe-eval'` is the correct,
  narrow directive. `'unsafe-eval'` opens JS eval and a reviewer who sees it will ask.
- **`--target bundler` with no bundler, or `--target no-modules` in a module worker.** Both
  produce failures that look like WASM problems and are target problems.
- **`instantiateStreaming` on a `chrome-extension://` URL.** The MIME type is not reliably
  `application/wasm` for package reads.
- **Calling `init()` with no path.** The glue guesses relative to itself, guesses wrong in
  a worker, and the 404 surfaces as an unrelated instantiation error.
- **Memoizing a `wasmReady` boolean instead of the init promise.** Concurrent callers each
  instantiate; two linear memories, one leak nobody finds.
- **Holding a `Uint8Array` view across a call into WASM.** Any allocation can grow memory
  and detach it. Re-derive and `.slice()`.
- **Storing a WASM pointer anywhere that outlives the call** — a `Map`, `chrome.storage`, a
  message payload. After a worker restart it does not throw; it returns garbage.
- **A 45-second synchronous WASM call in the service worker.** Your code running is not an
  event; the idle timer is unmoved. You are evicted mid-call and the promise never settles.
- **Putting the WASM in the content script.** It runs under the page's CSP, so it works on
  your test page and fails on the site that matters.

## 5. Usage

Give the AI this skill plus the workload: what it computes, roughly how long, what triggers
it. Ask for, in order:

1. **Justification check** — one sentence on why this is WASM and not JS, phrased as you'd
   write it in the review form. If that sentence is hard to write, stop here.
2. **Host decision** — the §3.4 table, with the eviction math stated for the expected
   duration. Worker, offscreen, or offscreen + Worker.
3. **Build config** — `wasm-pack --target web`, the §3.8 profile, the `wasm-opt` step, and
   a `twiggy` baseline committed so size regressions are visible.
4. **Manifest** — `extension_pages` CSP with `'wasm-unsafe-eval'`, module worker,
   `web_accessible_resources` **only** if a content script genuinely needs the file.
5. **Loader** — memoized init promise, explicit `arrayBuffer()` bytes, and a
   copy-in/copy-out boundary with no view or pointer escaping a call.
6. **Lifecycle test** — stop the worker in `chrome://extensions` mid-job and confirm the
   feature recovers with a message, not a hang.

For debugging: "Refused to compile … WebAssembly" → §3.2. "Incorrect response MIME type" →
`instantiateStreaming` on a package URL (§3.3). "detached ArrayBuffer" → §3.7. "Works, then
goes silent after ~30s" → eviction (§3.4/§3.6). "Works unpacked, fails on a real site" →
content script under the page's CSP (§3.2).

## 6. Example Output

A local decoder for an uncommon image format, previewed inline, built with this skill:

- **Justification:** the decoder is an existing Rust crate with a real test suite; the JS
  reimplementation is ~4,000 lines of pixel-format code nobody should write twice. That
  sentence went verbatim into the review notes and the store description.
- **Host:** offscreen document with `reasons: ['WORKERS']`, spawning a module `Worker`. A
  1.2MB image decodes in ~600ms — past the point where the worker's eviction math stops
  being theoretical, and off every thread that matters.
- **Build:** `wasm-pack --release --target web`, `opt-level = "z"`, `lto`, `panic =
  "abort"`, `codegen-units = 1`, then `wasm-opt -Oz`. 740KB → **196KB**. `twiggy top`
  output committed as `size-baseline.txt`; CI fails on a >10% regression.
- **Loader:** ~30 lines. Memoized init promise, `getURL` + `fetch` + `arrayBuffer()`, and a
  strict copy-in/copy-out boundary — decoded pixels are `.slice()`d out and the WASM buffer
  freed before the result is messaged anywhere. Zero pointers cross a message boundary.
- **Packaging:** the `.wasm` is packaged-only. The content script never touches it; it
  detects the format, sends bytes, receives a `Blob` URL. Works identically on a site with
  a locked-down `script-src` — which is where the first architecture died.
- **Manifest:** `"extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src
  'self'"`, no host permissions on the decode path, no network access at all. Approved on
  first submission with the source repo linked in the notes.
