---
title: PDF Generation Skill
category: Document
description: Battle-tested patterns for generating polished PDFs entirely in the browser — no server, no user data leaving the device. Distilled from tapdot's 90+ tool suite, covering the print-CSS-first approach, when to reach for a library, and the layout details (headers, tables, pagination, fonts) that separate amateur output from documents people actually send.
usage: Load this skill when a user asks for PDF export, invoices, reports, certificates, or "download as PDF" from a web app. Follow the decision tree in section 3.1 first — choose print-CSS or a library before writing any code. Apply the anti-patterns list as a review checklist on whatever you generate.
platforms: [Claude, ChatGPT, Gemini]
priceUsd: 5
timeSavedHours: 12
pocUrl: https://tools.tapdot.org
---
# PDF Generation Skill

## 1. Philosophy

PDF generation is the most over-engineered feature in web development. Teams reach for
Puppeteer render farms, wkhtmltopdf Docker containers, or 300KB client bundles when the
browser they are already running in contains a world-class PDF engine: **print-to-PDF**.

This skill's core position, proven across the tapdot tool suite (tools.tapdot.org — 90+
zero-backend browser tools, several of which produce documents users file with lawyers
and accountants):

1. **Client-side first, always.** A PDF built in the browser means nothing the user
   typed is ever transmitted. For NDAs, offer letters, tax estimates, and medical logs
   this is not a nice-to-have — it is the product's trust story.
2. **Print CSS is the default; a library is the exception.** The browser's print engine
   handles pagination, font embedding, hyperlinks, and vector text for free. You write
   CSS, not coordinate math.
3. **A library (pdf-lib / jsPDF) only when you need**: programmatic multi-file output,
   pixel-exact coordinates (form overlays, certificates on a template), merging existing
   PDFs, or PDF generation with no user gesture (print-to-PDF requires the user to
   confirm the dialog).
4. **The document is data first.** Build a plain data object, render it to a printable
   DOM (or to library draw calls) as a final step. Never scrape your app's UI into a PDF
   — screen layout and page layout are different problems.

## 2. Tech Stack

- **Primary:** semantic HTML + `@media print` CSS + `window.print()` — zero dependencies.
- **`@page` rules** for margins, page size, and (in supporting engines) margin-box
  headers/footers.
- **Escape hatch:** `pdf-lib` (~200KB, modern, no canvas rasterization) for programmatic
  generation; `jsPDF` + `autoTable` if you need its table plugin. Vendor the file into
  your repo (`libs/pdf-lib.min.js`) — no CDN, so the tool works offline and the supply
  chain is auditable. (tapdot vendors every third-party lib this way: js-yaml, hash-wasm.)
- **Plain-text fallback:** `Blob` + object URL download for documents where .txt/.md is
  actually more useful than PDF (contracts users will paste into Word anyway).
- **No** html2canvas→jsPDF screenshot pipelines. Ever. See anti-patterns.

## 3. Patterns

### 3.1 The decision tree (run this first)

```
Need to fill/merge an EXISTING PDF?            → pdf-lib
Need output with no user gesture (batch/auto)? → pdf-lib
Need pixel-exact template overlay?             → pdf-lib
Everything else (reports, invoices,
letters, statements, tables, charts)           → print CSS + window.print()
```

### 3.2 The printable-region pattern (print CSS)

Don't print the app. Render a dedicated, hidden document node and show ONLY it in print:

```html
<div id="app"><!-- interactive tool UI --></div>
<article id="printDoc" class="print-doc" aria-hidden="true"><!-- filled by JS --></article>
```

```css
.print-doc { display: none; }

@media print {
  body > *:not(#printDoc) { display: none !important; }
  .print-doc { display: block; }
  /* Kill app chrome that CSS above might miss */
  nav, footer, .toolbar, .privacy-strip { display: none !important; }
}
```

```js
function exportPdf(data) {
  document.getElementById('printDoc').innerHTML = renderDocument(data); // pure fn: data → HTML
  window.print(); // user picks "Save as PDF" — filename comes from document.title
  // Set a meaningful title first; it becomes the default filename:
  // document.title = `Invoice-${data.number}-${data.date}`;
}
```

Restore `document.title` in an `afterprint` listener.

### 3.3 Page geometry, headers, and footers

```css
@page {
  size: A4;                 /* or 'letter'; offer both if your audience is mixed */
  margin: 18mm 16mm 20mm;   /* generous bottom margin = room for footer */
}

/* Repeating header: table-header-group is the ONLY cross-engine way
   to repeat content on every page without @page margin boxes. */
.print-doc { font: 11pt/1.45 Georgia, 'Times New Roman', serif; color: #111; }
```

The most reliable repeating header/footer technique — wrap the whole document in a
single-column table; `<thead>`/`<tfoot>` repeat on every printed page in Chromium,
Firefox, and WebKit:

```html
<table class="doc-frame">
  <thead><tr><td>
    <div class="doc-header">ACME Corp · Statement · March 2026</div>
  </td></tr></thead>
  <tbody><tr><td>
    <!-- actual document content -->
  </td></tr></tbody>
  <tfoot><tr><td>
    <div class="doc-footer">Generated locally in your browser — acme.example</div>
  </td></tr></tfoot>
</table>
```

Page numbers: only `@page { @bottom-right { content: counter(page); } }` produces true
"Page N of M", and browser support is still uneven. If page numbers are a hard
requirement across all browsers, that is a legitimate reason to switch to pdf-lib,
where you control every page. Do not fake page numbers with JS measurement — it breaks
the moment the user changes paper size in the print dialog.

### 3.4 Pagination control

```css
h1, h2, h3        { break-after: avoid; }   /* never orphan a heading at page bottom */
tr, li, .line-item{ break-inside: avoid; }  /* never split a row across pages */
.section          { break-inside: avoid; }  /* keep small blocks whole */
.new-page         { break-before: page; }   /* explicit page starts (chapters, per-client) */
p                 { orphans: 3; widows: 3; }
```

Tables: put column headers in a real `<thead>` — engines repeat it after every page
break automatically. That plus `tr { break-inside: avoid }` is 90% of "my table PDF
looks broken" fixes.

### 3.5 Fonts and images

- Use system serif/sans stacks in the print stylesheet. Webfonts work but MUST be fully
  loaded before `window.print()` — gate on `document.fonts.ready.then(() => window.print())`.
- Vector beats raster: render charts as inline SVG (tapdot's finance charts are
  hand-rolled SVG — see the Finance & Calculator Tools Skill) and they print at
  printer resolution for free. A `<canvas>` chart prints at screen resolution and
  looks fuzzy — if you must, swap in `canvas.toDataURL('image/png')` at 2–3× scale
  into an `<img>` before printing.
- Force backgrounds where they carry meaning: `.badge { print-color-adjust: exact; }`
  — browsers strip background colors by default in print.

### 3.6 The library path (pdf-lib), distilled

```js
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'; // vendored locally

async function buildPdf(data) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 50, LH = 16;                      // margin, line height in points
  let page = doc.addPage([595.28, 841.89]);   // A4 in points
  let y = page.getHeight() - M;

  const ensureRoom = (needed) => {            // manual pagination — you own it now
    if (y - needed < M) { page = doc.addPage([595.28, 841.89]); y = page.getHeight() - M; }
  };
  const text = (str, { size = 11, f = font, x = M } = {}) => {
    ensureRoom(LH);
    page.drawText(str, { x, y, size, font: f, color: rgb(0.07, 0.07, 0.07) });
    y -= LH;
  };

  text(data.title, { size: 18, f: bold }); y -= 8;
  for (const row of data.rows) {
    ensureRoom(LH);
    text(row.label);                                        // left column
    page.drawText(row.value, { x: 400, y: y + LH, size: 11, font }); // right column
  }
  return doc.save(); // Uint8Array
}

function download(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
```

Notes that save hours: pdf-lib's origin is **bottom-left** (y grows upward); text has no
automatic wrapping — measure with `font.widthOfTextAtSize(str, size)` and break lines
yourself; long tables mean you write the `ensureRoom` pagination shown above, which is
exactly the work print CSS does for free — hence the decision tree.

### 3.7 The plain-text sibling

For generated legal/HR documents, ship a `.txt` download NEXT TO the PDF option — users
routinely want to paste into Word/Google Docs. This is three lines (production pattern
from tapdot's NDAGenerator):

```js
const blob = new Blob([docText], { type: 'text/plain' });
const a = Object.assign(document.createElement('a'),
  { href: URL.createObjectURL(blob), download: 'mutual-nda.txt' });
a.click(); URL.revokeObjectURL(a.href);
```

## 4. Anti-patterns

- **html2canvas → jsPDF.** Produces a raster screenshot in a PDF wrapper: blurry text,
  unselectable, uncopyable, huge files, broken across page boundaries. If you catch
  yourself typing `html2canvas`, go back to the decision tree.
- **Printing the live app UI.** Screen layouts have sidebars, sticky navs, dark themes,
  and viewport-relative sizes. Render a dedicated document from data (§3.2).
- **CDN-loading the PDF library.** Breaks offline, adds a supply-chain dependency, and
  contradicts any "nothing leaves your device" claim. Vendor it.
- **Sending user data to a server "just for rendering."** If a PDF microservice sees the
  data, your privacy policy now has an exception. Client-side generation has no such
  asterisk.
- **JS-measured fake pagination** (absolutely positioned "Page 2" divs). Dies instantly
  when the user picks Letter instead of A4.
- **Forgetting `document.fonts.ready`** before `print()` — intermittent wrong-font PDFs
  that never reproduce in dev.
- **Dark-mode bleed.** If your app has a dark theme, the print stylesheet must reset to
  black-on-white explicitly; some engines otherwise print the dark background.
- **Canvas charts pasted at 1×.** Fuzzy on paper. Use SVG or upscale to a data URL.

## 5. Usage

1. Classify the request with the §3.1 decision tree; state the choice and why in one line.
2. Model the document as a plain object (`{title, meta, sections[], rows[]}`) with a pure
   `renderDocument(data)` function.
3. Print-CSS path: printable-region (§3.2) + `@page` (§3.3) + pagination rules (§3.4).
   Library path: vendored pdf-lib + the `ensureRoom` scaffold (§3.6).
4. Always offer a meaningful default filename via `document.title` or `download=`.
5. Review against every §4 anti-pattern before declaring done. Test: 1-page doc, 3-page
   doc with a table spanning a break, and A4 vs Letter.

## 6. Example Output

A "Download PDF" feature for a loan amortisation tool, built with this skill:

- `renderDocument(schedule)` produces an `<article>` with a summary stat block, an SVG
  balance chart, and a `<table>` of yearly rows (`<thead>` repeats per page,
  `tr { break-inside: avoid }`).
- `@page { size: A4; margin: 18mm 16mm 20mm }`, doc-frame table header carrying the
  tool name and generation date on every page.
- `document.title = 'LoanCalc-25yr-8.5pct'` before `window.print()`, restored after.
- Zero dependencies added; the feature is ~120 lines of CSS+JS; nothing the user typed
  ever left the browser — verifiable in the network tab, which is the demo.
