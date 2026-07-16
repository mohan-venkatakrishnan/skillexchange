---
title: 100-Tool Static Site Skill
category: Website
description: The architecture that lets one solo-maintained repo ship 90+ zero-backend browser tools with per-page SEO, a shared design system, an SPA feel without a router, and free GitHub Pages hosting. Distilled from tools.tapdot.org, including the systemic bugs (global collisions, CSS leakage, min-width:0) that only show up at tool #40.
usage: Load this skill when building a multi-tool utility site, a collection of calculators/converters/generators, or any "many small pages, one design system" static product. Follow the folder and shared-shell contract in section 3 exactly, and run the checklist in section 5 for every new tool added.
platforms: [Claude, ChatGPT, Gemini]
priceUsd: 0
timeSavedHours: 25
pocUrl: https://tools.tapdot.org
---
# 100-Tool Static Site Skill

## 1. Philosophy

A single React SPA with 90 tool routes is the obvious architecture — and the wrong one.
tools.tapdot.org ships 90+ tools from one repo with **no build step, no framework, no
backend, no accounts**, and every architectural decision follows from four principles:

1. **Static, browser-only.** Plain HTML/CSS/JS. Nothing the user types is sent anywhere;
   any exception (one API fetch, one proxy lookup) is named explicitly in a privacy page.
   This is a product feature, not an implementation detail — "verifiable in the network
   tab" is the marketing.
2. **One job per page.** Each tool is its own folder with its own `index.html`. A real
   URL per tool means real SEO (each tool ranks for its own query), shareable links,
   working browser history, and total blast-radius isolation — a bug in tool #37 cannot
   break tool #38.
3. **The SPA feel without an SPA.** No client-side router. Cross-document **View
   Transitions** (`@view-transition { navigation: auto }`) plus **speculation-rules
   prerender on hover** make plain `<a href>` navigation feel instant. Progressive
   enhancement: on old browsers it's just... a website.
4. **Convention over configuration, enforced by tests.** One `data-collection` +
   `data-tool` attribute pair on `<html>` drives theme, breadcrumb, favicon, and icon.
   A Playwright suite plus a static CSS audit keep 90 pages honest — at this scale,
   discipline that isn't automated doesn't exist.

## 2. Tech Stack

- **Hosting:** GitHub Pages + custom domain via `CNAME`. Keep a `.nojekyll` file in the
  repo root — without it Pages runs a pointless Jekyll build that can fail silently.
- **No build step.** Files are served as-authored. Third-party libs (a YAML parser, a
  WASM hash lib) are vendored into `libs/` folders — no CDN, no npm at runtime.
- **Shared layer:** one `shared/shared.css` (design tokens + component classes) and one
  `shared/shared.js` (all page bootstrapping) loaded by every page.
- **Testing:** Playwright driving the system Chrome — layout regression (overflow checks
  at mobile/tablet/desktop), functional interaction tests, and a static CSS audit script.
- **Modern platform features as progressive enhancement:** View Transitions, Speculation
  Rules, `localStorage` persistence, WebCrypto, optional on-device AI.

## 3. Patterns

### 3.1 Folder-per-tool layout

```
/                       index.html (landing: hero + grouped collection cards)
/shared/                shared.css, shared.js
/assets/                icons, logo
/<collection>/          index.html (hub page: card grid of that collection's tools)
/<collection>/<slug>/   index.html + <slug>.js + <slug>.css   ← one tool, one job
/<collection>/libs/     vendored deps shared within a collection
/test/                  regression.mjs, functional.mjs, css-audit.mjs
```

### 3.2 The one-attribute contract

Every page declares its identity once:

```html
<html lang="en" data-collection="finance" data-tool="CompoundCalc">
```

`shared.js` reads these two attributes on DOMContentLoaded and derives *everything*:
the collection's pastel accent theme (CSS `[data-collection="finance"]` token overrides),
the breadcrumb (`tapdot / Tools / Finance / CompoundCalc`), a per-page colored favicon
tile drawn from an icon map, the tool-name icon, and a back button computed from the
hierarchy (never `history.back()` — unreliable when the page was opened directly).

Central registries in shared.js are the single source of truth the whole site reads:

```js
const TOOL_REGISTRY = [                       // powers Ctrl+K palette, browse page,
  { name: 'CompoundCalc', path: '/finance/compound/',   //  desktop-app catalog, site graph
    desc: 'Compound interest with contributions', collection: 'finance' },
  // ... every tool. A tool not registered here does not exist.
];
const ICON_PATHS = { 'CompoundCalc': '<path d="..."/>' }; // 24×24 stroke icons
```

### 3.3 SEO per tool page

Every tool page carries its own head — this is the entire reason for real pages:

```html
<title>CompoundCalc — Compound Interest Calculator | tapdot</title>
<meta name="description" content="Calculate compound interest with monthly contributions. Your financial data never leaves your browser." />
<meta property="og:title" content="CompoundCalc — Compound Interest Calculator | tapdot" />
<link rel="canonical" href="https://tools.tapdot.org/finance/compound/" />
```

Pattern: `ToolName — What It Does In Plain Query Language | brand`. The description
states the job AND the privacy differentiator. Canonical URLs end in `/` matching the
folder deploy.

### 3.4 Instant navigation without a router

```css
/* shared.css — cross-document view transitions */
@view-transition { navigation: auto; }
```

```js
// shared.js — prerender likely next pages on hover
function initSpeculation() {
  const s = document.createElement('script');
  s.type = 'speculationrules';
  s.textContent = JSON.stringify({
    prerender: [{ where: { href_matches: '/*' }, eagerness: 'moderate' }],
  });
  document.head.appendChild(s);
}
```

Every internal link is a normal `<a href>` — which is also why the command palette
(Ctrl+K fuzzy search over `TOOL_REGISTRY`) navigates by setting `location.href` through
anchors: prerender and transitions keep applying.

### 3.5 The FOUC rule (learned the hard way)

Theme choice must run **before first paint** — an inline `<head>` script on every page,
NOT in shared.js (which loads at the end of `<body>`):

```html
<head>
  <meta charset="UTF-8" />
  <script>(function(){try{var t=localStorage.getItem('tapdot-theme');
    var d=matchMedia('(prefers-color-scheme: dark)').matches;
    if(t==='dark'||(!t&&d))document.documentElement.setAttribute('data-theme','dark');
  }catch(e){}})();</script>
  <!-- everything else -->
```

shared.js only wires the toggle button. Any new page missing this snippet flashes white
in dark mode.

### 3.6 No-build vanilla JS: the global-scope discipline

Without ES modules, every `<script>` shares one global scope per page. Two rules:

- **Namespace the shared layer's globals and document them.** shared.js owns `ICONS`,
  `ICON_PATHS`, `TOOL_REGISTRY`, `STEPS`, `tapdotAI`, etc. A tool script that declares
  `const ICONS = ...` throws `SyntaxError: Identifier already declared` and **silently
  kills the entire page's JS**. (This shipped twice before a test caught it.)
- **Wrap shared utilities in IIFE modules** returning a frozen API:
  `const tapdotMoney = (() => { ...; return { fmt, fmtCompact }; })();`

And the test that catches this class of bug — a `pageerror` listener per page in the
functional suite — because layout screenshots look fine on a page whose JS is dead:

```js
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(route); /* interact */ 
assert.equal(errors.length, 0, `${route}: ${errors.join('; ')}`);
```

### 3.7 Shared CSS system + the two systemic bugs

Component classes (`.ts-card`, `.ts-btn-primary`, `.ts-input`, `.ts-segment`,
`.ts-stats-grid`, `.ts-table`, `.ts-hub-grid`...) live in shared.css; collection
stylesheets hold only tool-specific styles. Two rules earned from real regressions:

- **Any class used by more than one collection MUST live in shared.css.** A tabs
  component defined only in `dev/dev.css` rendered as unstyled browser buttons the day
  a marketing tool reused it. Enforce with a static audit script that flags classes
  used in HTML/JS but defined in no CSS file.
- **`min-width: 0` at every nesting level.** CSS grid/flex children default to
  `min-size: auto` and refuse to shrink below content width — the #1 cause of mobile
  overflow in nested card layouts. Apply globally:

```css
.ts-workbench > * { min-width: 0; }
.ts-select { min-width: 0; max-width: 100%; }
.ts-stat, .ts-stat-num { min-width: 0; overflow-wrap: anywhere; }
```

For stat numbers that must not wrap mid-digit, a generic auto-fitter beats per-tool
font sizing: measure each `.ts-stat-num`, step font-size down until it fits, re-run via
one `MutationObserver` on `document.body` — every future tool gets it for free.

### 3.8 The new-tool checklist (make it mechanical)

Adding tool #91 must be boring: (1) create the folder from a template page, set
`data-collection`/`data-tool`/title/meta/canonical; (2) register icon + `TOOL_REGISTRY`
entry; (3) add the card to the collection hub; (4) add the route to the regression
suite; (5) run all three test suites. Codify this in the repo's CLAUDE.md/README —
the checklist IS the architecture's maintenance story.

## 4. Anti-patterns

- **One SPA, 90 routes.** One `<title>` for Google, one bundle to break everything,
  a router reimplementing what URLs already do.
- **A build step "for later."** The moment you add one, every contributor and every
  future you needs the toolchain. No-build means the deployed artifact IS the source.
- **CDN `<script>` tags.** Third-party outage or supply-chain swap breaks 90 tools at
  once, and contradicts the offline/privacy story. Vendor into `libs/`.
- **Per-tool copies of shared components.** Duplication across collection CSS files is
  how the same tab component renders three different ways. Promote on second use.
- **Unregistered tools.** If search/browse/catalog read a registry, a tool missing from
  it is invisible. Make registration a checklist item and test it.
- **`history.back()` for the back button.** Wrong when the user landed directly. Compute
  the parent from the page's own identity attributes.
- **Trusting `git push` as "deployed."** Poll the Pages build API until `built` for your
  exact SHA, then curl two live routes. tapdot ate six consecutive silent deploy
  failures (missing `.nojekyll`) and one transient Pages error that needed an
  empty-commit re-push before this rule existed.
- **Big-bang batches.** Building 46 tools in one pass is how systemic bugs (mobile nav,
  grid shrink) slip in. Ship collection-by-collection, full test suite after each.

## 5. Usage

1. Scaffold: root hub, `shared/shared.css` (tokens + components), `shared/shared.js`
   (init functions on DOMContentLoaded), one collection, one exemplar tool. Get the
   one-attribute contract (§3.2) and FOUC snippet (§3.5) right in the exemplar — every
   future tool is copied from it.
2. Stand up the three test scripts (layout overflow at 375/768/1280px, functional with
   `pageerror` listeners, CSS audit) before tool #2, not after tool #40.
3. Add tools via the §3.8 checklist; ship and test per collection.
4. Deploy to GitHub Pages: `CNAME` + `.nojekyll`, verify builds via the API, smoke-test
   live URLs.
5. Review any new layout against the `min-width: 0` rule and any new shared-looking
   class against the shared.css promotion rule.

## 6. Example Output

Following this skill, a fresh "unit converters" site reaches production shape in one
session: a landing hub, `shared/` shell with dark mode + breadcrumb + command palette,
three tool folders (`/convert/length/`, `/convert/temp/`, `/convert/data/`) each with
unique title/meta/canonical, View-Transition navigation, a `TOOL_REGISTRY` powering
Ctrl+K search, Playwright checks proving no overflow at 375px and zero page errors, and
a GitHub Pages deploy verified against the builds API — zero dependencies, zero backend,
$0/month hosting, and an architecture that demonstrably scales to 90+ tools because
that's where it was extracted from.
