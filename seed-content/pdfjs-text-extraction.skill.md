---
title: PDF Text Extraction with PDF.js Skill
category: Document
description: Hard-won patterns for pulling text and layout back out of existing PDFs in the browser with pdf.js — worker setup, glyph-run reassembly, reading order, column detection, and the font traps that silently corrupt your output. Written for people who discovered that getTextContent() returns positioned fragments, not sentences, and that a PDF with no text layer is an OCR problem wearing a PDF costume.
usage: Load this skill when a user asks to read, search, parse, or extract text/tables from PDFs client-side. Run the §3.1 triage first — confirm the PDF even has a text layer before writing extraction code. Use §3.4 as the line-reconstruction reference implementation and §4 as a review checklist.
platforms: [Claude, Cursor]
priceUsd: 6
timeSavedHours: 14
pocUrl: https://github.com/mozilla/pdf.js
---
# PDF Text Extraction with PDF.js Skill

## 1. Philosophy

A PDF does not contain text. It contains instructions to paint glyphs at coordinates.
Every extraction bug you will hit descends from that one sentence. There is no
paragraph, no line, no reading order, no word boundary stored in the file — those are
inferences you reconstruct from positions, and pdf.js hands you the raw material, not
the conclusion.

The working positions of this skill:

1. **Extraction is geometry, not string handling.** If your code is doing
   `items.map(i => i.str).join(' ')`, you have shipped a bug that will surface on the
   first two-column PDF a user uploads. Sort by position, cluster into lines, then join.
2. **Triage before you parse.** Roughly a third of real-world uploaded PDFs — scans,
   faxes, phone photos "printed to PDF" — have no text layer at all. Detect that in
   ~50ms and say so, rather than returning an empty string and letting the user think
   your tool is broken.
3. **The browser is the right place for this.** Documents people want parsed are
   contracts, bank statements, and payslips. Extraction that never leaves the device is
   the entire trust proposition.
4. **Fidelity has a ceiling. Set expectations at that ceiling.** Perfect table
   reconstruction from a PDF is unsolved. Promise "searchable text and reasonable line
   structure," deliver that reliably, and promise no more.

## 2. Tech Stack

- **Primary:** `pdfjs-dist` — the distribution build of **PDF.js**, the PDF renderer
  maintained by Mozilla. Repo: https://github.com/mozilla/pdf.js. License: **Apache-2.0**
  (permissive; requires attribution and NOTICE preservation). This skill is an
  independent, original guide; it is not affiliated with or endorsed by the PDF.js
  maintainers.
- **Two files matter**, not one: the main library and the **worker** (`pdf.worker.min.mjs`).
  Parsing runs off-main-thread. Ship both from your own origin — a worker URL pointed at
  a CDN is a supply-chain dependency inside your privacy story.
- **Optional:** `tesseract.js` for the scanned-PDF branch (§3.7) — ~10MB of WASM plus
  language data, so lazy-load it; never put it in the initial bundle.
- **No** server round-trips, no `pdftotext` shelling out, no "just use an LLM to read the
  PDF" for documents you can parse deterministically in 200ms.

## 3. Patterns

### 3.1 Triage: does this PDF even have text?

Run this before building anything. It decides your entire code path.

```js
async function hasTextLayer(pdf, sampleN = 3) {
  const pages = Math.min(pdf.numPages, sampleN);
  let glyphs = 0;
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    glyphs += tc.items.reduce((n, it) => n + (it.str?.trim().length ?? 0), 0);
    page.cleanup();
  }
  return glyphs / pages > 40;   // <40 chars/page ⇒ scan, cover page, or image-only
}
```

```
Text layer present?  → §3.2–§3.6 (deterministic extraction, fast, exact)
No text layer?       → §3.7 (render to canvas → OCR; slow, lossy, ask the user first)
Encrypted?           → §3.8
```

The 40-character threshold is empirical: real scanned pages usually still carry a few
stray glyphs from a scanner watermark or a stamped page number, so `length > 0` is not a
usable test.

### 3.2 Loading: the worker, and the destroy you will forget

```js
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';  // bundler-resolved

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

async function open(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({
    data,
    // Only fetch these if you actually need exotic CJK/legacy encodings; they are
    // network fetches at parse time and will hang an offline tool otherwise.
    useSystemFonts: false,
    isEvalSupported: false,        // stricter CSP posture; costs a little speed
  });
  return task.promise;             // PDFDocumentProxy
}
```

Two things bite here. First: `getDocument` **transfers** the `data` buffer to the worker
— your `Uint8Array` is detached afterwards, and reusing it throws. Clone it if you need
the bytes elsewhere. Second: `pdf.destroy()` is not optional. Without it the worker
holds every parsed page; on a 400-page document that is hundreds of MB retained after
your UI has moved on.

### 3.3 The shape of a text item

```js
const tc = await page.getTextContent();
// tc.items[i] ≈ {
//   str:       'Total amount due',
//   dir:       'ltr',
//   width: 92.4, height: 11,
//   transform: [a, b, c, d, e, f],   // e = x, f = y  (PDF user space)
//   fontName:  'g_d0_f2',            // NOT a real font name — see §3.6
//   hasEOL:    false                 // pdf.js's own line-break hint; advisory only
// }
```

The critical facts: **`f` (y) grows upward** — top of page is the highest y. An item is a
*glyph run*, not a word and not a line: "Total amount due" may arrive as one item, or as
`['T', 'otal amount', ' due']` depending entirely on how the producing tool kerned it.
`a` and `d` in the transform are the horizontal/vertical scale — the effective font size
is roughly `Math.hypot(a, b)`, not `height`, whenever the text is rotated or scaled.

Never assume item order in the array is reading order. It is *painting* order, which for
many producers (LaTeX especially) means all the body text, then all the ligatures, then
all the superscripts.

### 3.4 Reconstructing lines from positioned runs

This is the core of the skill. Cluster by y, sort by x, join with inferred spaces.

```js
function toLines(items, { yTol = 2.0 } = {}) {
  const runs = items
    .filter(it => it.str.length)
    .map(it => ({
      s: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      size: Math.hypot(it.transform[0], it.transform[1]) || 10,
    }));

  // Bucket into lines by baseline, with a tolerance — baselines of the same visual
  // line differ by sub-point amounts, and superscripts differ by ~30% of font size.
  const lines = [];
  for (const r of runs.sort((p, q) => q.y - p.y || p.x - q.x)) {
    const line = lines.find(L => Math.abs(L.y - r.y) <= yTol);
    if (line) { line.runs.push(r); line.y = (line.y + r.y) / 2; }
    else lines.push({ y: r.y, runs: [r] });
  }

  return lines.map(L => {
    L.runs.sort((p, q) => p.x - q.x);
    let out = '';
    let prev = null;
    for (const r of L.runs) {
      if (prev) {
        const gap = r.x - (prev.x + prev.w);
        // A space is a GAP, not a character. ~25% of font size is the usable cut.
        if (gap > prev.size * 0.25) out += ' ';
      }
      out += r.s;
      prev = r;
    }
    return out.trimEnd();
  });
}
```

The `0.25 * size` gap threshold is the number that took longest to settle on. Below 0.2
you glue words together in tightly-kerned serif documents; above 0.35 you start splitting
words in justified text where the producer padded inter-letter spacing to fill the line.
Justified text is precisely where naive extractors produce `T o t a l  a m o u n t`.

Do not trust `hasEOL` as your only line signal — producers set it inconsistently, and it
tells you nothing about *columns*.

### 3.5 Column detection (the two-column killer)

An academic paper, a newspaper layout, or an invoice with a side panel will interleave
disastrously if you sort by y alone. Detect the gutter before clustering:

```js
function findGutter(items, pageWidth) {
  // Histogram x-coverage in 5pt bins; a gutter is a wide empty vertical band
  // near the middle that persists down the page.
  const bins = new Array(Math.ceil(pageWidth / 5)).fill(0);
  for (const it of items) {
    const a = Math.floor(it.transform[4] / 5);
    const b = Math.ceil((it.transform[4] + it.width) / 5);
    for (let i = a; i < b && i < bins.length; i++) bins[i]++;
  }
  const mid = bins.length >> 1, span = Math.round(bins.length * 0.18);
  let best = null;
  for (let i = mid - span; i <= mid + span; i++) {
    if (bins[i] === 0) {
      let j = i; while (bins[j + 1] === 0) j++;
      if (!best || j - i > best.j - best.i) best = { i, j };
      i = j;
    }
  }
  // A real gutter is empty for >=3 bins (15pt) — narrower is just word spacing.
  return best && best.j - best.i >= 3 ? ((best.i + best.j) / 2) * 5 : null;
}
```

Then extract each column as an independent document (`items.filter(x < gutter)`, run
`toLines`, then the same for the right side) and concatenate. Bail out to single-column
mode when `findGutter` returns null — a false-positive gutter mangles single-column
pages far worse than a missed gutter mangles two-column ones, so bias conservative.

### 3.6 Font traps: ligatures, CID fonts, and fake names

`fontName` is `g_d0_f2` — an internal pdf.js handle, not a typeface name. If you need the
real name, go through `page.commonObjs`, but for extraction you almost never should.

The real damage comes from encoding:

- **Ligatures.** `ﬁ ﬂ ﬀ ﬃ` (U+FB01…) arrive as single glyphs. Your extracted text
  contains `conﬁrmation`, which fails a search for "confirmation" — a silent, terrible
  bug because the text *looks* right on screen. Normalize on the way out:
  ```js
  const LIGATURES = { 'ﬁ':'fi', 'ﬂ':'fl', 'ﬀ':'ff', 'ﬃ':'ffi', 'ﬄ':'ffl', 'ﬅ':'st' };
  const deLigature = s => s.replace(/[ﬀ-ﬆ]/g, m => LIGATURES[m] ?? m);
  ```
  Follow with `.normalize('NFKC')` to fold the remaining compatibility forms.
- **CID fonts with no ToUnicode map.** Subsetted fonts (very common in
  LaTeX/InDesign output) map glyph IDs to Unicode via an optional `ToUnicode` CMap. If
  the producer omitted it, pdf.js gives you literal garbage — `` — and
  there is no fix at your layer. Detect it (>15% of extracted characters outside
  printable ranges) and route the document to the OCR branch. This is the single most
  common "why is the text mojibake" ticket.
- **Soft hyphens and hard-wrapped words.** `U+00AD` and end-of-line `-` both need
  rejoining if you are producing prose: `text.replace(/(\w)-\n(\w)/g, '$1$2')`.
- **RTL and vertical text.** `item.dir === 'rtl'` means the run is already in logical
  order — do not re-sort it by x, you will reverse it.

### 3.7 The scanned-PDF branch

When §3.1 says no text layer, you are doing OCR. Say so in the UI: it is 100–1000×
slower, it is lossy, and it should be opt-in.

```js
async function pageToImage(page, scale = 2.0) {
  const vp = page.getViewport({ scale });      // 2.0 ≈ 150dpi; 3.0 ≈ 225dpi for small type
  const canvas = new OffscreenCanvas(vp.width, vp.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return canvas.convertToBlob({ type: 'image/png' });
}
```

Scale is the whole ballgame: below 1.5, OCR accuracy on 9pt type collapses; above 3.0 you
pay quadratic memory (an A4 page at scale 4 is ~140MB of canvas backing store) for gains
you cannot measure. Start at 2.0, retry once at 3.0 if confidence is low.

### 3.8 Password-protected files

```js
const task = pdfjs.getDocument({ data });
task.onPassword = (retry, reason) => {
  // reason === pdfjs.PasswordResponses.NEED_PASSWORD  (first ask)
  // reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD (retry)
  promptUser(reason).then(retry);   // call retry(pw) — do NOT re-create the task
};
```

Note the distinction that trips people: a PDF can be encrypted with an *owner* password
only (restricting printing/copying) and still open with an empty user password. pdf.js
opens those without prompting and ignores the permission flags — extraction works. Those
flags are a request to your application, not a lock; whether you honour them is a product
decision you should make deliberately rather than by accident.

### 3.9 Streaming big documents without blowing up

```js
async function extractAll(pdf, onPage) {
  const out = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    out.push(toLines(tc.items).join('\n'));
    page.cleanup();             // frees this page's fonts/ops in the worker
    onPage?.(p, pdf.numPages);  // yields to the event loop; keeps the UI alive
  }
  await pdf.destroy();
  return out;
}
```

Sequential, one page in flight, `cleanup()` after each. The tempting
`Promise.all(pages.map(...))` parses every page concurrently and peaks at gigabytes on
a large scanned document — it is also barely faster, because the worker is single-
threaded anyway. Batch of 1 is the right batch size.

## 4. Anti-patterns

- **`items.map(i => i.str).join(' ')`.** The canonical wrong answer. Ignores position, so
  it interleaves columns, drops line structure, and inserts spaces mid-word. Works
  perfectly on your test PDF and fails on the first real one.
- **Trusting array order as reading order.** It is painting order. Sort by geometry.
- **Treating a text item as a word.** It is a glyph run; it can be one letter or a whole
  paragraph, decided by the producing tool's kerning.
- **Shipping without the no-text-layer check.** Returning `""` for a scan makes your tool
  look broken to the exact user who most needs help.
- **CDN-hosted `workerSrc`.** Breaks offline, and puts a third-party origin inside a
  pipeline you are advertising as local-only.
- **Forgetting `page.cleanup()` / `pdf.destroy()`.** The leak is invisible in a 3-page
  test and fatal in a 300-page one.
- **Parsing all pages in parallel.** Memory spike, no throughput gain — the worker
  serializes it regardless.
- **Skipping ligature/NFKC normalization.** Your search box will fail on `fi`/`fl` words
  and nobody will report it; they will just conclude search is unreliable.
- **Rendering to canvas to "get the text".** That is OCR with extra steps. Only do it
  when §3.1 says there is genuinely nothing to extract.

## 5. Usage

1. Run the §3.1 triage on the first 3 pages and state the branch out loud: text layer,
   scan, or encrypted.
2. Set up the worker from a self-hosted URL (§3.2). Clone the buffer if the caller still
   needs it.
3. Build `toLines` (§3.4) as a pure function of `items → string[]`. Test it against a
   justified-text page before anything else.
4. Add `findGutter` (§3.5) only if the corpus has multi-column documents; bias toward
   single-column when uncertain.
5. Pipe every extracted string through `deLigature` + `NFKC` (§3.6). Check the mojibake
   ratio and fall back to OCR when the ToUnicode map is missing.
6. Stream page-by-page with `cleanup()` (§3.9). Report progress; never freeze the tab.
7. Review against every §4 item. Test corpus must include: a two-column paper, a
   justified contract, a LaTeX doc, a pure scan, and a 200+ page file.

## 6. Example Output

A client-side "search inside your PDFs" feature for a document-locker tool, built with
this skill:

- Drop 40 mixed PDFs; each is opened with a self-hosted worker and triaged by §3.1. The
  ~6 scans in the pile get an explicit "image-only — run OCR?" chip rather than silently
  indexing as empty; encrypted files raise an inline `onPassword` prompt and retry in
  place.
- The remaining ~34 stream page-by-page through `toLines` with `cleanup()` after each; a
  180-page bank statement bundle extracts in ~4s under 90MB peak. Two-column papers route
  through `findGutter`, so abstracts read as prose instead of interleaving.
- Lines are de-ligatured and NFKC-normalized before hitting the index, so searching
  "confirmation" finds the `ﬁ`-ligature contract a naive extractor silently missed.
- Zero network requests after load — the index is IndexedDB-local, verifiable in the
  network tab, which is the demo.
