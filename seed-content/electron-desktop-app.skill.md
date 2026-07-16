---
title: Electron Desktop App Skill
category: Desktop
description: Turn an existing web tool into a signed-or-honestly-unsigned desktop app with auto-update, secure IPC, and one-command cross-platform builds. Distilled from shipping tapdot Desktop — a real Electron app wrapping 90+ browser tools — including the copy-pipeline, CSP, and electron-builder + GitHub Releases setup that actually worked.
usage: Load this skill when packaging a web app or static site as a desktop application with Electron. Follow the security defaults in section 3.2 verbatim — they are non-negotiable — then adapt the packaging pipeline and release workflow to your repo layout. Use section 4 as a pre-ship review checklist.
platforms: [Claude, ChatGPT, Gemini]
priceUsd: 5
timeSavedHours: 20
pocUrl: https://tools.tapdot.org
---
# Electron Desktop App Skill

## 1. Philosophy

Most Electron guides teach you to build an app *in* Electron. This skill teaches the far
more common real-world job: you already have a working web product, and you want a
desktop version that (a) works fully offline, (b) updates itself, and (c) doesn't fork
your codebase.

Principles proven by tapdot Desktop (an Electron wrapper for the 92 tools at
tools.tapdot.org, released via GitHub Releases):

1. **The web app stays the single source of truth.** The Electron layer is a thin shell:
   a main process, a preload, and a shell UI (sidebar/menu). Tool code is *copied in at
   build time*, never forked. If you find yourself editing app logic inside `electron/`,
   the architecture has failed.
2. **Generated, not hand-maintained.** Any list the shell needs (tool catalog, routes,
   nav) must be generated from the web app's own data at build time. Hand-copied lists
   are stale by the second release — this bit tapdot when a plan doc hardcoded 67 tools
   while the site had 92.
3. **Security is a fixed recipe, not a per-app decision.** `contextIsolation: true`,
   `nodeIntegration: false`, a minimal `contextBridge` API, and a strict CSP. Every
   deviation gets a written justification in a code comment at the deviation site.
4. **Be honest about signing.** Code-signing costs real money (Apple $99/yr, Windows EV
   ~$200–400/yr). If you ship unsigned, don't hide it: dedicate a section of your
   download page to exactly which scary dialog users will see and why it's safe (open
   source, inspectable). Overclaiming trust destroys it.
5. **State offline claims precisely.** "100% offline" while one feature quietly calls an
   API undermines the pitch. tapdot's phrasing: "91 of the 92 tools never make a network
   request; CurrencyConvert fetches rates once a day and caches them — that's the one
   exception."

## 2. Tech Stack

- **electron** (devDependency) + **electron-builder** (packaging: dmg/nsis/AppImage/deb)
- **electron-updater** + **electron-log** (the only runtime dependencies you need)
- **GitHub Releases** as the update server — free, no infrastructure, works with
  `electron-builder --publish always`
- **GitHub Actions** matrix build (mac/win/linux in parallel) triggered by `v*` tags
- A ~40-line Node **copy script** bridging repo layout → electron-builder's file globs
- No bundler, no framework in the shell. The renderer shell is one HTML file.

## 3. Patterns

### 3.1 Repo layout: subfolder, not submodule

Put the desktop app in `electron/` inside the web repo. A separate repo + git submodule
only makes sense when different people own the two halves. electron-builder's `files`
globs resolve relative to `electron/`, so copy the site in before every run:

```js
// electron/scripts/copy-tools.mjs — run via pre-hooks, output is gitignored
const FOLDERS = ['shared', 'assets', 'study', 'finance', /* every content dir */];
const FILES = ['index.html', 'privacy.html'];
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const f of FOLDERS) copyDir(path.join(repoRoot, f), path.join(dest, f));
// copyDir skips node_modules and .git entries
```

```jsonc
// package.json — the pre-hooks make staleness impossible
"scripts": {
  "copy-tools": "node scripts/copy-tools.mjs",
  "prestart":   "npm run copy-tools",
  "start":      "electron .",
  "predist":    "npm run copy-tools",
  "dist":       "electron-builder --mac --win --linux"
}
```

Catalog generation: a script regexes the site's own registry (the same data structure
the site's search uses) and writes `src/renderer/tools-catalog.js`. One source of truth;
the sidebar can never drift from the real site.

### 3.2 The security recipe (copy verbatim)

```js
const win = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,     // renderer JS cannot touch Electron internals
    nodeIntegration: false,     // renderer JS cannot require('fs')
    // Any relaxation gets a comment HERE explaining exactly why. Example from
    // tapdot: webSecurity: false because Chromium blocks fetch() from file://
    // to https:// (one tool needs a daily rate fetch); the renderer CSP still
    // whitelists only that single host, so this is not arbitrary network access.
  },
});
```

```js
// preload.js — the ENTIRE bridge. Small enough to audit at a glance.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('myAppDesktop', {
  getVersion:   () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onNavigate:   (cb) => ipcRenderer.on('navigate', (_, p) => cb(p)),
  platform: process.platform,
});
```

Rules: expose **named functions only** — never `ipcRenderer` itself, never a generic
`invoke(channel, ...)` passthrough (that's `nodeIntegration` with extra steps). Validate
inputs in the main-process handler (`ipcMain.handle('open-external', (_, url) => {
if (/^https?:/.test(url)) shell.openExternal(url); })`).

External links open in the system browser, not new Electron windows:

```js
win.webContents.setWindowOpenHandler(({ url }) => {
  if (url.startsWith('http')) { shell.openExternal(url); return { action: 'deny' }; }
  return { action: 'allow' };
});
```

CSP as enforcement, not convention — tapdot's desktop build ships with zero analytics
not by stripping script tags but by leaving the beacon host out of `connect-src`; the
tag is present but cannot phone home:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self' file:; script-src 'self' 'unsafe-inline' file:;
           img-src 'self' file: data:;
           connect-src 'self' file: https://the-one-api-you-allow.example;" />
```

### 3.4 Auto-update via GitHub Releases

```js
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
autoUpdater.logger = log;                       // silent failures are undebuggable
if (!app.isPackaged) { /* skip updates in dev */ }
else setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000); // after window shows

autoUpdater.on('update-downloaded', (info) => {
  const r = dialog.showMessageBoxSync({
    type: 'info', title: 'Update ready',
    message: `${app.name} ${info.version} is ready to install.`,
    buttons: ['Restart now', 'Later'], defaultId: 0,
  });
  if (r === 0) autoUpdater.quitAndInstall();
});
autoUpdater.on('error', (err) => log.error('Update error:', err.message));
```

```jsonc
// package.json → build.publish — this is ALL the server config there is
"publish": [{ "provider": "github", "owner": "you", "repo": "your-repo" }]
```

Gotchas: `checkForUpdatesAndNotify` no-ops in dev (guard anyway to avoid log noise);
unsigned macOS builds **cannot** auto-install updates (Squirrel.Mac requires a valid
signature — notify-and-link-to-download is the honest fallback); the delayed check
keeps first paint fast.

### 3.5 Menu and app-lifecycle patterns

Build one template with platform splices rather than two menus:

```js
const isMac = process.platform === 'darwin';
const template = [
  ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, { role: 'quit' }] }] : []),
  { label: 'File', submenu: [isMac ? { role: 'close' } : { role: 'quit' }] },
  { label: 'View', submenu: [
      { role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { role: 'togglefullscreen' },
      { label: 'Toggle Dark Mode', accelerator: 'CmdOrCtrl+Shift+D',
        click: () => win.webContents.send('toggle-dark-mode') },  // shell → page via IPC
  ]},
  { role: 'help', submenu: [
      { label: 'View Source on GitHub', click: () => shell.openExternal(REPO_URL) },
      { label: `Version ${app.getVersion()}`, enabled: false },   // cheapest About box
  ]},
];
```

Lifecycle: `show: false` + `win.once('ready-to-show', () => win.show())` (no white
flash); mac apps stay alive on window-close (`if (process.platform !== 'darwin')
app.quit()`) and recreate on `activate`.

### 3.6 electron-builder targets + CI release

```jsonc
"build": {
  "appId": "org.example.desktop",
  "files": ["src/**/*", "tools/**/*", "assets/**/*", "!**/node_modules/**", "!tools/test/**"],
  "mac":   { "target": [{ "target": "dmg", "arch": ["x64", "arm64"] }],
             "hardenedRuntime": true, "darkModeSupport": true },
  "win":   { "target": [{ "target": "nsis", "arch": ["x64"] }] },
  "linux": { "target": ["AppImage", "deb"], "category": "Utility" },
  "nsis":  { "oneClick": false, "allowToChangeInstallationDirectory": true }
}
```

CI: one workflow, `on: push: tags: ['v*']`, a 3-OS matrix, each job running
`npm run copy-tools && npx electron-builder --publish always`. electron-builder talks to
GitHub Releases itself given `GH_TOKEN` — you do not need a separate upload-release
action step.

## 4. Anti-patterns

- **Forking the web code into the shell.** The moment `electron/tools/` is committed
  instead of generated, you have two products. Gitignore the copy output.
- **Hand-maintained catalogs/routes in the shell.** Generate from the web app's data.
- **`nodeIntegration: true`** or exposing raw `ipcRenderer`/generic invoke passthroughs
  in preload. This converts any XSS into full local code execution.
- **Loading remote URLs in the window** for an "offline" app — you've built a worse
  browser tab. `loadFile` local content.
- **Silently unsigned builds.** Users hit Gatekeeper/SmartScreen walls with no
  explanation and assume malware. Document the warnings prominently on the download page.
- **Auto-update without logging.** When updates fail in the field you get "it never
  updates" reports and zero evidence. Wire `electron-log` before shipping v1.0.0.
- **Checking for updates before the window shows.** Slow first paint for a background task.
- **Stripping analytics by editing copied files.** Fragile. Deny the host in CSP instead
  — enforcement beats convention.
- **Claiming "100% offline"** when any feature fetches. Name the exception explicitly.

## 5. Usage

1. Confirm the web app runs from `file://` (no client-side router dependency on a
   server; absolute paths may need a base-path shim). Fix that first — it's the only
   genuinely invasive step.
2. Scaffold `electron/` with §3.1's copy script + pre-hooks, §3.2's main/preload
   security recipe, §3.5's menu, §3.4's updater.
3. Generate the shell's catalog/nav from the web app's own registry data.
4. Configure §3.6 build targets; verify a local `npm start` and one `dist:<your-os>`
   build before touching CI.
5. Add the tag-triggered matrix workflow; ship `v1.0.0`; test auto-update by releasing
   `v1.0.1` with a visible change.
6. Write the download page with the honest-signing and precise-offline copy (§1.4–1.5).
   Review the whole thing against §4.

## 6. Example Output

Applying this skill to a static 90-tool web repo produced, in one session:

- `electron/` (5 source files: main.js ~170 lines, preload.js 16 lines, one renderer
  HTML shell, a copy script, a catalog generator) — the tools themselves untouched.
- `npm start` runs the full site offline from disk; sidebar lists all tools grouped by
  collection, generated from the site's own registry.
- dmg (x64+arm64), NSIS installer, AppImage and deb targets configured; GitHub Actions
  builds all three platforms in parallel on a `v*` tag and publishes to GitHub Releases,
  where electron-updater picks them up.
- CSP denies the web version's analytics beacon; download page states the one network
  exception precisely and explains the unsigned-app warnings rather than hiding them.
