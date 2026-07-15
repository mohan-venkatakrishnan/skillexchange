---
title: Tauri Desktop Apps Skill
category: Desktop
description: Ship a 10MB desktop app with a Rust backend and a web frontend — without discovering the webview fragmentation tax three weeks in. Covers Tauri v2's capabilities/permissions ACL, command and event plumbing, state, sidecars, and the honest list of cases where Electron is still the correct answer.
usage: Load this skill when building or migrating a desktop app with Tauri v2. Run section 3.1's webview-risk check before writing any frontend code — it decides whether Tauri is viable at all. Then follow 3.2–3.8 as the implementation order and use section 4 as a pre-ship review checklist.
platforms: [Claude, Cursor]
priceUsd: 8
timeSavedHours: 24
pocUrl: https://github.com/tauri-apps/tauri
---
# Tauri Desktop Apps Skill

## 1. Philosophy

Tauri is not "Electron but smaller." It is a different bet: you give up a bundled
browser engine and get a ~10MB installer, a ~40MB resident footprint, and a real systems
language on the backend. The bet pays off for most apps. When it doesn't, it fails
*late* — in QA on a customer's Mac, not on your machine.

1. **The webview is the whole tradeoff.** Everything else — Rust, the IPC, the bundler —
   is downstream of "you render in the OS's browser, not yours." Decide that first
   (§3.1); the rest of the architecture follows.
2. **Rust is the backend, not the app.** Frontend does UI; Rust does filesystem,
   network, crypto, DB, and anything CPU-bound. The `invoke` boundary is your API
   surface — design it like an API, with typed errors, not a grab-bag of helpers.
3. **v2's permission model is a feature, not a chore.** The v1 allowlist was
   all-or-nothing per API. v2 capabilities say "only this window, only these paths."
   Configure it on day one; retrofitting it is miserable.
4. **Binary size is a feature you must defend.** It is the reason you're here. Measure
   it every release.
5. **Be honest when Electron wins.** A skill that says "always Tauri" is marketing.
   §3.9 lists the cases where recommending Tauri would be malpractice.

## 2. Tech Stack

- **Project:** Tauri — https://github.com/tauri-apps/tauri — dual-licensed
  **MIT OR Apache-2.0**. This skill is an independent, original guide; it is not
  affiliated with or endorsed by the Tauri maintainers.
- **Runtime webviews:** WebView2 (Chromium) on Windows, WKWebView (Safari) on macOS,
  WebKitGTK on Linux. You do not choose these; the OS does.
- **Backend:** Rust stable, `tauri` v2, `serde` for the IPC boundary, `thiserror` for
  typed command errors, `tokio` only if you truly need async I/O.
- **Frontend:** any bundler output (Vite assumed). Tauri only needs a `dist/`.
- **Tooling:** `@tauri-apps/cli` (`tauri dev|build`), `tauri.conf.json`, `@tauri-apps/api`.
- **Not in scope:** Tauri v1 — the permission model changed enough that v1 advice is now
  actively harmful.

## 3. Patterns

### 3.1 The webview-risk check (run this before anything else)

```
Does your UI need any of:
  - Chromium-only APIs (WebUSB, WebBluetooth, WebSerial, File System Access)?
  - Deterministic video/canvas/WebGL behaviour across OSes?
  - A design system you cannot regression-test on 3 engines?
     → Electron. Stop here.
Otherwise → Tauri, and pin your CSS/JS floor now.
```

The fragmentation is real and asymmetric. Windows WebView2 is evergreen Chromium —
effectively your dev browser. macOS WKWebView is tied to the **OS version**: a user on
macOS 12 has Safari 15's engine forever. Linux WebKitGTK depends on the distro package
and is usually oldest.

Practical floor for macOS 12+ and Debian-stable Linux: no `:has()` in load-bearing
layout, no CSS nesting, no container queries without a fallback, no `findLast`. Set
browserslist to match and let the bundler transpile, rather than learning this from a
bug report titled "the sidebar is just gone on my MacBook."

The Linux tell: `error: failed to run custom build command for 'webkit2gtk-sys'` — a
missing `libwebkit2gtk-4.1-dev`. (v2 moved 4.0 → 4.1; half the blog posts still say 4.0.)

### 3.2 Commands: the invoke boundary

```rust
#[derive(Serialize)]
pub struct Note { id: String, title: String, updated_at: i64 }

#[derive(Debug, thiserror::Error)]
pub enum NoteError {
    #[error("note {0} not found")] NotFound(String),
    #[error("storage failure: {0}")] Storage(String),
}
// Errors must be Serialize to cross IPC; thiserror gives the message, serde the wire form.
impl serde::Serialize for NoteError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[tauri::command]
pub fn load_note(id: String) -> Result<Note, NoteError> { Err(NoteError::NotFound(id)) }
```

```ts
import { invoke } from '@tauri-apps/api/core';   // v2 path; v1 was '@tauri-apps/api/tauri'
const note = await invoke<Note>('load_note', { id });   // camelCase args → snake_case params
```

Two facts that cost an afternoon each: `invoke` arg keys are camelCase and map to
snake_case Rust params; and a rejected `invoke` gives you the *serialized error value*,
not an `Error` — so `err.message` is `undefined` and your logs say `[object Object]`.

Register every command or you get a runtime `Command load_note not found`:

```rust
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![notes::load_note, notes::save_note])
    .run(tauri::generate_context!()).expect("error while running tauri application");
```

### 3.3 Async commands and the main-thread trap

A synchronous `#[tauri::command]` runs on the **main thread**. A 400ms file hash there
freezes the entire window, OS chrome included.

```rust
#[tauri::command]
async fn hash_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || expensive_hash(&path))
        .await.map_err(|e| e.to_string())?
}
```

Rule: sync command = completes in <16ms and touches no I/O. Everything else is `async` +
`spawn_blocking` (CPU-bound) or real async I/O (network). An `async` command whose body
is a long synchronous loop is *still* blocking — `async` is not a thread.

### 3.4 State with `tauri::State` and interior mutability

```rust
struct AppState { db: Mutex<Connection> }

#[tauri::command]
fn save_note(note: Note, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "state lock poisoned".to_string())?;
    persist(&db, &note).map_err(|e| e.to_string())   // guard drops here
}

fn main() {
    tauri::Builder::default()
        .setup(|app| { app.manage(AppState { db: Mutex::new(open_db()?) }); Ok(()) })
        .invoke_handler(tauri::generate_handler![save_note])
        .run(tauri::generate_context!()).unwrap();
}
```

`State<T>` is looked up **by type**, so two `manage()` calls with the same type silently
overwrite — newtype each one. Holding a `std::sync::Mutex` guard across `.await` won't
compile (not `Send`); reach for `tokio::sync::Mutex` only then, not by default. A panic
inside a command **poisons** the mutex, so every later lock fails — which is why the
panic in your log is at 09:14 and the breakage starts at 09:14 and never stops.

### 3.5 Capabilities and permissions (v2's ACL) — the real change from v1

v1 had an `allowlist`: flip `fs: { all: true }` and every window could read every file.
v2 has three layers — **permission** (a named grant like `fs:allow-read-text-file`),
**scope** (which paths/URLs), and **capability** (a JSON file binding permissions to
specific **windows**).

```jsonc
// src-tauri/capabilities/main.json
{
  "identifier": "main-window",
  "windows": ["main"],                    // NOT the settings window, NOT a future webview
  "permissions": [
    "core:default",
    "dialog:allow-open",
    { "identifier": "fs:allow-read-text-file", "allow": [{ "path": "$APPDATA/notes/*" }] },
    { "identifier": "http:default", "allow": [{ "url": "https://api.example.com/*" }] }
  ]
}
```

The error you will meet:
`fs.readTextFile not allowed. Permissions associated with this command: fs:allow-read-text-file`
— that is the ACL working. Add the permission *with a scope*, never a blanket
`fs:default`. Your frontend is web code: if any dependency ever injects a script, the
blast radius is exactly what your capabilities allow. `$APPDATA/notes/*` is a bad day;
unscoped `fs` is your SSH keys.

Custom commands are **not** covered by plugin permissions — they're reachable from any
window that runs JS. Gate dangerous ones in Rust via `window.label()`, not in the frontend.

### 3.6 Events vs commands

```rust
use tauri::Emitter;
app.emit("import://progress", ImportProgress { done: 42, total: 500 })?;
app.emit_to("main", "import://progress", payload)?;   // targeted
```

```ts
const un = await listen<ImportProgress>('import://progress', e => setProgress(e.payload));
// ALWAYS keep the unlisten fn and call it on unmount.
```

**Commands are request/response; events are push.** If the frontend asked a question,
`invoke` — emit-and-listen round trips re-implement RPC badly and you own the
correlation IDs. If Rust has news (progress, file watcher, tray click), emit.

The leak: `listen` is async, so `useEffect(() => { listen(...) }, [])` returns a Promise,
not a cleanup. Under React StrictMode you register two handlers, remove neither, and see
every progress update applied twice while memory climbs across navigations.

### 3.7 Sidecars: shipping a real binary alongside the app

```jsonc
"bundle": { "externalBin": ["binaries/mytool"] }  // named mytool-<target-triple>[.exe]
```

```rust
let (mut rx, _child) = app.shell().sidecar("mytool")?.args(["--scan", &path]).spawn()?;
while let Some(ev) = rx.recv().await {
    if let CommandEvent::Stdout(line) = ev {
        app.emit("scan://line", String::from_utf8_lossy(&line).to_string())?;
    }
}
```

The naming rule is not optional and the error is unhelpful: `binary not found: mytool`
means you have `binaries/mytool` but Tauri wanted `binaries/mytool-x86_64-apple-darwin`
(`rustc -vV | grep host`). Every target needs its own copy — a universal macOS build
needs both triples present. And sidecars are separate executables inside your bundle, so
on macOS they must be signed too, or notarisation rejects the whole app.

### 3.8 Config, dev vs prod asset serving, and bundle size

```jsonc
{
  "productName": "Notebook", "version": "1.2.0",
  "identifier": "org.example.notebook",       // reverse-DNS; changing it later orphans user data
  "build": { "frontendDist": "../dist", "devUrl": "http://localhost:5173",
             "beforeDevCommand": "npm run dev", "beforeBuildCommand": "npm run build" },
  "app": { "windows": [{ "title": "Notebook", "width": 1100, "height": 720 }],
           "security": { "csp": "default-src 'self'; img-src 'self' asset: data:" } },
  "bundle": { "active": true, "targets": ["dmg", "nsis", "appimage", "deb"] }
}
```

In dev the webview loads `devUrl` over HTTP. In prod assets are **embedded in the
binary** and served from a custom protocol (`tauri://localhost`, or
`http://tauri.localhost` on Windows). Consequences people trip on: relative fetches that
work in dev can 404 in prod (use `convertFileSrc()` for user files); `localStorage` is
keyed by origin, and the dev origin differs from prod — so "my settings vanish in the
built app" is expected, not a bug; and a dev-only CSP hole (`'unsafe-eval'` for your
bundler) must never reach the shipped config.

```toml
[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

A realistic v2 hello-world lands at 8–12MB installed. If yours is 40MB, it's your
frontend bundle or an embedded font/model, not Tauri.

### 3.9 When Electron is genuinely the right call

Recommend Electron, without hedging, when: you need Chromium-only APIs
(WebSerial/WebUSB/File System Access) — WKWebView simply lacks them; rendering must be
identical everywhere (a design tool, a video editor, anywhere a WebKit-vs-Blink text
metric is a bug report); you depend on a mature Node library with no Rust equivalent and
rewriting it *is* the project; or the team has zero Rust capacity and the app is mostly
UI — a Tauri app maintained by people who can't debug a borrow-check error is a
liability, not a small binary.

Tauri wins on install size, memory, startup, the security model, and heavy lifting
running in Rust instead of one JS thread.

## 4. Anti-patterns

- **Developing only on your own OS.** The webview is the risk surface. If you haven't run
  the app on macOS 12-era WKWebView and a Debian WebKitGTK, you haven't tested it. This
  is *the* Tauri-specific discipline.
- **Blanket permissions** (`fs:default`, unscoped `shell:allow-execute`) because the ACL
  error was annoying at 11pm. Scope every permission to a path/URL prefix.
- **Blocking work in a sync command.** The freeze is total and users read it as a crash.
- **Holding a `Mutex` guard across `.await`,** or defaulting to `tokio::sync::Mutex`
  everywhere — async overhead on locks held for 3µs.
- **`listen()` without unlisten.** Double-fires under StrictMode, leaks across routes.
- **Events as RPC.** You've rebuilt `invoke` with no types and no error path.
- **Porting v1 allowlist advice into v2.** If a snippet says `"allowlist"`, it's for a
  version you are not running.
- **Sidecars without the target-triple suffix** — or forgetting they need macOS signing.
- **Choosing Tauri for a Chromium-API app** because the binary size sounded good. You
  find out in week three, and the migration is the frontend, not the shell.

## 5. Usage

1. Run §3.1's webview-risk check out loud. If it says Electron, say Electron and stop.
2. Pin the CSS/JS floor from your real OS support matrix; set browserslist to match.
3. Scaffold with `npm create tauri-app@latest`, then write `tauri.conf.json` (§3.8) —
   identifier and CSP first, they're the expensive-to-change ones.
4. Design the invoke surface as an API: typed commands with `thiserror` (§3.2), `async` +
   `spawn_blocking` for anything I/O or CPU (§3.3).
5. Write `capabilities/main.json` (§3.5) *before* the frontend calls a plugin API, scoping
   every permission. Gate dangerous custom commands in Rust by window label.
6. Use events only for push (§3.6); always return the unlisten function.
7. Apply §3.8's release profile and measure the binary every version.
8. Review against §4, then test the *built* app — not `tauri dev` — on all three OSes.

## 6. Example Output

Applying this skill to a note-taking app (Vite + React frontend, SQLite storage):

- `src-tauri` exposes six commands — `load_note`, `save_note`, `list_notes`,
  `search_notes`, `export_pdf`, `import_folder` — each returning `Result<T, NoteError>`
  whose `thiserror` messages render directly in the UI's toast component.
- `import_folder` is `async` + `spawn_blocking`, walking 4,000 markdown files while
  emitting `import://progress` every 50; the window stays interactive and the progress
  bar is driven by a `listen` whose unlisten runs on unmount.
- `AppState { db: Mutex<Connection> }` registered in `.setup()`; no guard crosses an
  await; the DB lives in `$APPDATA`, never next to the binary.
- `capabilities/main.json` grants the main window `dialog:allow-open` and
  `fs:allow-read-text-file` scoped to `$APPDATA/notes/*` plus the user-picked import dir.
  The settings window has its own capability with neither.
- Release profile with `lto`/`opt-level = "z"`/`strip`: 11.4MB dmg, 9.1MB NSIS installer.
  Verified on macOS 12 (WKWebView), Windows 10 (WebView2), and Debian 12 (WebKitGTK 4.1)
  — where a `:has()` selector in the sidebar was caught and replaced with a class toggle
  before release, not after.
