---
title: In-Page Writing Tools Extension Skill
category: Extension
description: Build extension features that read and act on text selections inside arbitrary web pages — textareas, inputs, contenteditable, rich editors — with floating UI anchored to the selection that survives hostile site CSS. Distilled from Quill, a shipped writing-tools extension running on every page, including the selection-snapshot model, anchoring math, and Trusted-Types-safe DOM rules that made it possible.
usage: Load this skill when building any "select text, act on it" extension feature — rewriters, translators, annotators, grammar tools. Describe the actions your product offers and the AI will generate the selection-capture layer, floating UI, and entry points in the right order (context menu first, floating pill opt-in). Paste selection bugs ("works in textareas, dies in Gmail") for diagnosis against section 4.
platforms: [Claude, Cursor]
priceUsd: 5
timeSavedHours: 16
pocUrl: https://tapdot.org
---
# In-Page Writing Tools Extension Skill

Distilled from Quill, a shipped Chrome extension that injects Apple-style writing tools (tone rewrites, proofread, summarize, transform) into every page on the web. The hard part of a writing-tools extension is not the AI — it's living correctly inside 10,000 pages you don't control. This skill is that part.

## 1. Philosophy

- **You are a guest in a hostile house.** Every page has its own CSS resets, z-index wars, Trusted Types policies, focus management, and keyboard handlers. Assume all of them are actively trying to break your UI, and build so none of them can.
- **Copy beats replace.** Quill originally replaced the selection in place with an undo toast; real users found it harsh and trust-destroying, and the feature was removed. Default to showing copyable suggestions in a panel; the user pastes when *they* decide. Editing someone's draft is a privilege you earn with an opt-in, not a default.
- **The selection is gone the moment you touch anything.** Focus your input, open your panel, even let the user click your button wrong — the page selection collapses. Snapshot everything you need the instant an action starts, and operate on the snapshot forever after.
- **Quiet by default.** A floating toolbar popping up on every mouseup on every page is how you earn uninstalls. Quill ships the right-click context menu as the primary entry point and the floating pill as opt-in. Select-all triggering is a separate opt-in again.
- **Degrade site-by-site.** Some pages will always be broken hosts (Google Docs' canvas editor, chrome:// pages, the Web Store, cross-origin iframes). Ship an escape hatch — a side panel where users paste text — instead of pretending injection works everywhere. And let users block your extension per-site.

## 2. Tech Stack

- MV3 content script declared in the manifest (`<all_urls>`, `document_idle`) + its own CSS file; the whole product surface lives in the content script.
- Thin service worker: context menu tree, settings deep-links, `chrome://` navigation on the page's behalf (pages can't navigate there themselves).
- Vanilla JS IIFE — `(function () { 'use strict'; ... })()` — nothing leaks to page scope. No build step.
- `chrome.storage.local` + `chrome.storage.onChanged` as the settings bus between options page, worker, and every live tab.
- DOM built exclusively with `createElement` / `createElementNS` — mandatory under Trusted Types (GitHub, Google properties block `innerHTML` assignment outright).
- Optional side panel with a paste-in engine mirroring the content script, for pages where injection is impossible.

## 3. Patterns

### 3.1 Selection capture — the three-kind model

There are exactly three kinds of selection, and each needs different capture and different anchoring:

```js
let sel = { text: null, range: null, target: null, inputSel: null, editable: null };

function evaluateSelection() {
  // Kind 1: INPUT / TEXTAREA — window.getSelection() does NOT see these reliably.
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
    let start = null, end = null;
    try { start = ae.selectionStart; end = ae.selectionEnd; } catch { /* email/number inputs throw */ }
    if (start != null && end != null && end > start) {
      const text = ae.value.slice(start, end).trim();
      if (text.length >= 2) {
        sel = { text, range: null, target: ae, inputSel: { start, end }, editable: null };
        return ae.getBoundingClientRect();          // anchor: the control itself
      }
    }
  }
  // Kinds 2+3: page text and contenteditable — the Selection API.
  const selection = window.getSelection();
  const text = selection && selection.rangeCount ? selection.toString().trim() : '';
  if (!text || text.length < 2) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;  // collapsed/invisible
  sel = {
    text,
    range: range.cloneRange(),                       // clone! the live range mutates under you
    target: document.activeElement,
    inputSel: null,
    editable: getEditableHost(range),                // kind 3 marker: inside contenteditable?
  };
  return rect;                                       // anchor: the selection's own box
}

function getEditableHost(range) {
  let node = range.commonAncestorContainer;
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
  return node?.isContentEditable ? node : null;
}
```

Then snapshot at action start — deep-copy the mutable parts so nothing the user does afterward corrupts the in-flight action:

```js
function snapshot() {
  return {
    text: sel.text,
    range: sel.range ? sel.range.cloneRange() : null,
    target: sel.target,
    inputSel: sel.inputSel ? { ...sel.inputSel } : null,
    editable: sel.editable,
  };
}
```

Minimum length gate (`>= 2` chars) kills an entire class of accidental-trigger noise.

### 3.2 Keeping the selection alive under your own UI

Your toolbar steals focus on click, which collapses the selection it exists to serve. One line fixes it:

```js
pill.addEventListener('mousedown', (e) => e.preventDefault());   // click still fires; focus never moves
```

Exception: a UI containing a real text input (a compose box) must let that input take focus — so exempt it, and compensate by drawing overlay highlight boxes over the captured selection's rects, because the real highlight WILL collapse:

```js
compose.addEventListener('mousedown', (e) => { if (e.target !== composeInput) e.preventDefault(); });

function showSelHighlight(snap) {
  const rects = snap.range?.getClientRects ? [...snap.range.getClientRects()]
    : snap.target ? [snap.target.getBoundingClientRect()] : [];
  for (const r of rects) {
    if (!r.width || !r.height) continue;
    const h = el('div', 'q-sel-highlight');           // absolutely positioned tinted box
    h.style.left = `${r.left + scrollX}px`;  h.style.top = `${r.top + scrollY}px`;
    h.style.width = `${r.width}px`;          h.style.height = `${r.height}px`;
    document.body.appendChild(h);
  }
}
```

The user keeps seeing "their" selection while typing an instruction — this detail is the difference between the compose feature feeling solid and feeling haunted.

### 3.3 Anchored floating UI — measure hidden, flip, clamp

The universal positioning routine (pill, panel, compose all use it):

```js
function showAt(box, rect) {
  box.style.visibility = 'hidden';       // measure without flashing at (0,0)
  box.style.display = 'flex';
  const w = box.offsetWidth, h = box.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;

  let left = rect.left + scrollX + rect.width / 2 - w / 2;      // centered on the anchor
  let top  = rect.top + scrollY - h - 10;                        // prefer above
  if (top < scrollY + 8) top = rect.bottom + scrollY + 10;       // flip below if clipped

  left = Math.max(scrollX + 8, Math.min(left, scrollX + vw - w - 8));   // clamp BOTH axes
  top  = Math.max(scrollY + 8, Math.min(top, scrollY + vh - h - 8));

  box.style.left = `${Math.round(left)}px`;
  box.style.top = `${Math.round(top)}px`;
  box.style.visibility = 'visible';
}
```

Supporting rules that come from shipping:
- If the box can expand (a drawer, growing results), re-run a keep-in-view pass after expansion — Quill's tone drawer nudges the pill up so nothing clips at the bottom.
- Pin an expandable toolbar's width to its measured collapsed width first, so the drawer wraps within it instead of stretching into one long line.
- Dismissal is three listeners: `mousedown` outside any of your surfaces hides them; `Escape` hides everything; `scroll` (capture phase, `true` — many sites scroll inner containers, not window) and `resize` hide the anchored pill because its anchor just moved.
- Anything draggable (results panel) drags by its header via document-level capture-phase `mousemove`/`mouseup`, excluding the close button.

### 3.4 Surviving site CSS — the isolation checklist

Quill ships without Shadow DOM by following all of these strictly:

- **Namespace every class** (`q-pill`, `q-panel`, `q-btn`, ...). Zero generic names — the host page owns `.btn`, `.panel`, `.toast`.
- **Set every property you depend on** in your own CSS. You inherit the page's resets: assume `box-sizing`, `line-height`, `font-family`, `color` are all sabotaged and re-declare them on your roots.
- **Max z-index** (`2147483647`) on floating roots; `position: absolute` with page (scroll-offset) coordinates.
- **Hide with `!important`-backed classes** (`.q-hidden { display: none !important; }`) and remember an inline `display` cannot override it — remove the class, don't fight it. (This exact mistake shipped once: the compose box "wouldn't open.")
- **No `innerHTML`, ever.** Strict-CSP/Trusted-Types sites (GitHub, Google) throw on assignment. Build icons with `createElementNS('http://www.w3.org/2000/svg', ...)`; a tiny `el(tag, cls, text)` helper covers everything else.
- **Theme via a data attribute** (`[data-quill-theme="glass-dark"]`) stamped on each floating root — never on `<body>` or `<html>`, which belong to the page. A "glass" default theme (translucent + `backdrop-filter`) auto-resolves against `prefers-color-scheme`, re-resolved on the media-query's `change` event, so your UI looks native on both light and dark sites without asking.
- **`document.body` can be null** (XML docs, frames) — bail from `init()` early.

### 3.5 Entry points, wired in the right order

1. **Context menu (primary, always on).** Worker builds a `Quill ▸` tree with `contexts: ['selection', 'editable']`, one id per action (`q-act-<id>`); clicking sends `{ type: 'QUILL_ACTION', actionId }` to the tab. The content script re-evaluates the selection on receipt — the menu can outlive it.
2. **Floating pill (opt-in, off by default).** Shown from `mouseup` and — for keyboard selections — `keyup` when Shift/arrows were involved. Wrap both in `setTimeout(..., 10)`: the selection isn't final until after the event settles.
3. **Ctrl/Cmd+A surfacing (separate opt-in)** — it fires on every page; most select-alls aren't for you.
4. **Side panel (escape hatch)** — paste-in version of the same engine for uninjectable pages.

Per-site blocklist, checked before anything initializes — normalize entries so users can paste anything URL-shaped:

```js
function siteIsBlocked(list, host) {
  const h = (host || '').toLowerCase();
  return (list || []).some((raw) => {
    const p = String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return p && (p === '*' || h === p || h.endsWith('.' + p));    // subdomains match too
  });
}
```

### 3.6 The action pipeline

One orchestrator, always the same shape: snapshot → gate → panel-with-loader → stream results → settle.

```js
async function startAction(actionId) {
  if (isRunning) return;                                    // single-flight guard
  if (!sel.text) { showInfo('Select some text first.'); return; }
  const snap = snapshot();
  const anchor = anchorRect(snap);                          // re-derive from snapshot, live rect may be gone
  hidePill();
  isRunning = true;
  try { await runAction(snap, actionId, anchor); }
  catch (err) { panelMessage(err?.message ?? 'Something went wrong.'); }
  finally { isRunning = false; }
}
```

Pipeline rules that map to real complaints:
- **Panel opens immediately with a visible loader**, before any engine/availability check — errors render *inside* the panel (with a fix-it link when actionable), never as a pre-panel toast. One consistent behavior for every action.
- **Rewrites produce up to 3 variants; transforms produce 1.** Variants come from re-running with per-call variation hints ("Offer a distinctly different phrasing with the same tone") and are **de-duplicated on normalized text** — the model repeats itself more than you'd hope.
- On multi-variant runs, a failure after the first success is swallowed (you already have something to show); a failure on the first is thrown and displayed.
- Sanitize model output for prose display: strip `**`, `__`, backticks, leading `#`.
- Structured outputs get real rendering — parse the Markdown table into a `<table>` (fall back to plain text if it doesn't parse), but copy the raw source.
- Charge quota only on delivered results, checked before the call, counted after success — with the reset time in the limit message ("Unlocks in ~23 min").

## 4. Anti-patterns

- **`window.getSelection()` as the single source.** It misses `INPUT`/`TEXTAREA` selections in practice — that's what `selectionStart/End` are for. And reading those throws on non-text input types; wrap in try/catch. Symptom: "works on articles, dead in the search box."
- **Holding the live Range.** The page mutates; your Range now points at detached nodes with a zero rect. `cloneRange()` at capture AND at snapshot.
- **Replacing text in the page as the default behavior.** Beyond trust, it's technically doomed in the general case: rich editors (ProseMirror, Lexical, Draft) own their DOM and will revert, corrupt, or desync from injected mutations. If you offer in-place replace at all, it's opt-in, and paired with execCommand-style paths per editor family — a permanent whack-a-mole you should decline by default.
- **Showing floating UI on every selection out of the box.** Uninstall fuel. Context menu primary; pill opt-in. (Quill shipped this the wrong way first.)
- **Fighting `display:none !important` with inline styles.** Remove the class. Ten minutes of "why won't it open" every time you forget.
- **`innerHTML` for icons/markup.** Works everywhere except the strict-CSP sites your power users live on, where it throws and takes your whole init with it.
- **Toasts for long-lived status.** A persistent "Downloading model…" toast gets stuck when the flow moves on. Progress belongs in the loader of the panel the user is already watching; toasts are for 4-second facts.
- **Forgetting capture-phase scroll.** `window.addEventListener('scroll', hide)` misses inner-container scrolling (Gmail, Notion) — pass `true` and hide on any scroll anywhere, because your absolutely-positioned pill just detached from its anchor visually.
- **Re-running heavyweight setup on settings changes.** Rebuild the affected widget (Quill rebuilds just the pill when custom tones change) via `storage.onChanged` — don't re-init the world, and don't require a page reload.
- **Assuming injection works everywhere.** `chrome://`, Web Store, PDFs, Google Docs' canvas: no. Ship the paste-in side panel and route those users to it instead of shipping silence.

## 5. Usage

Give the AI this skill plus your action list ("proofread, translate, summarize, 3 tone rewrites"). Build order that works:

1. **Selection layer first** (§3.1–3.2), tested against: a plain article, a `<textarea>`, an `<input>`, a Gmail compose (contenteditable), and a GitHub comment box (Trusted Types). This is the foundation; everything else is decoration.
2. **Context-menu entry point** (§3.5) end-to-end with one action and the panel pipeline (§3.6).
3. **Floating pill** with anchoring (§3.3) and the isolation checklist (§3.4) applied to every element.
4. **Remaining actions, quota/plan gates, per-site blocklist, side-panel escape hatch.**

Ask the AI to verify §3.4 as a literal checklist against generated code — namespacing, no-innerHTML, and `!important` hygiene are mechanical to audit and always where regressions creep in.

Debug phrasing that resolves fast with this skill: "selection lost when clicking my button" → §3.2 mousedown preventDefault; "pill floats mid-page after scrolling" → capture-phase scroll hide; "throws on github.com only" → Trusted Types / innerHTML; "textarea selections ignored" → three-kind model (§3.1).

## 6. Example Output

Request: "Extension that translates selected text to French, showing the translation next to the selection."

Skill-guided result: a content script with the three-kind selection capture and snapshot model; context-menu `Translate to French` as primary entry, opt-in pill secondary; a namespaced `t-panel` opened with a loader anchored via measure-hidden/flip/clamp, results copyable (never auto-replacing the page text); overlay selection highlight while the panel is open; Trusted-Types-safe DOM throughout; per-site blocklist and a paste-in popup fallback for restricted pages. Tested green on the five-page gauntlet from §5 step 1 — including the two sites (Gmail, GitHub) where naive implementations always die first.
