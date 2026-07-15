---
title: Word Document Generation Skill
category: Document
description: Practical patterns for building real .docx files from data with the `docx` npm library — the Document/Paragraph/TextRun tree, named styles, numbering, DXA table widths, headers/footers, and the TOC field that will not populate the way you expect. Written for the moment someone asks for "the offer letter, but as an editable Word file, not a PDF" and you discover Word's unit system is twentieths of a point.
usage: Load this skill when a user asks for .docx output, Word export, offer letters, contracts, or "editable version". Read §3.1 units first — half the bugs in this space are unit-conversion bugs. Build with named styles (§3.3), not inline formatting, and apply §4 as a review checklist.
platforms: [Claude, Cursor]
priceUsd: 6
timeSavedHours: 12
pocUrl: https://github.com/dolanmiu/docx
---
# Word Document Generation Skill

## 1. Philosophy

People ask for Word instead of PDF for exactly one reason: they intend to change it. An
offer letter gets a negotiated number swapped. A contract gets a clause struck. A report
gets a paragraph from Legal pasted in. That reason should drive every decision you make,
and it leads somewhere non-obvious: **a .docx that is technically correct but structurally
sloppy is worse than a PDF**, because the user will open it, hit Enter, and watch the
formatting fall apart.

The positions:

1. **Structure over appearance.** Use named styles, real heading levels, and real list
   numbering. When the user types a new paragraph it should inherit the right look
   automatically. A document built from inline bold/size on every run looks identical and
   is unmaintainable the moment it is edited — which is the whole point of shipping .docx.
2. **Generate; do not template.** Building a document tree from data is a solved,
   debuggable problem. Find-and-replacing inside someone's existing .docx is a different
   and much worse problem (§3.9).
3. **Word's units are not your units.** Twips, DXA, half-points, and EMUs all appear in
   the same API. Write the conversion helpers in the first ten minutes (§3.1).
4. **If nobody will edit it, ship a PDF.** .docx costs real complexity. Pay it only when
   editability is the requirement.

## 2. Tech Stack

- **Primary:** **docx** — a library for generating Office Open XML word-processing
  documents declaratively from JS/TS. Repo: https://github.com/dolanmiu/docx. License:
  **MIT** (permissive; requires the copyright notice be preserved in distributions). This
  skill is an independent, original guide; it is not affiliated with or endorsed by the
  docx maintainers.
- **Runtime:** Node and browser both supported; the split is only at output (`Packer`,
  §3.10). TypeScript types ship with the package and are worth using — the option objects
  are wide and the compiler catches most unit mistakes before Word does.
- **Not in scope:** editing an existing .docx. See §3.9 for why that is a different
  problem and what the licensing caveat is.
- **No** "write an HTML file and name it .doc". Word opens it, but it is not a .docx, it
  degrades on save, and every downstream tool rejects it.

## 3. Patterns

### 3.1 Units: write these four lines before anything else

```js
const pt   = n => Math.round(n * 20);        // points → twips/DXA (1pt = 20 twips)
const hpt  = n => Math.round(n * 2);         // points → half-points (font sizes)
const cm   = n => Math.round(n * 567);       // cm → twips (1cm ≈ 567 twips)
const inch = n => Math.round(n * 1440);      // inches → twips
const px   = n => Math.round(n * 9525);      // px → EMU (images only)
```

The API mixes all of these. `size` on a `TextRun` is **half-points** — `size: 24` is 12pt,
not 24pt, and this is the single most common surprise in the library. Spacing, indents,
margins, and table widths are **twips** (DXA), i.e. twentieths of a point: 1440 to the
inch. Image dimensions are EMUs internally, though the library takes pixels and converts.
A US Letter page is 12240 × 15840 twips; A4 is 11906 × 16838.

### 3.2 The document tree

```js
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

const doc = new Document({
  sections: [{
    properties: {
      page: {
        size:   { width: inch(8.5), height: inch(11) },
        margin: { top: inch(1), right: inch(1), bottom: inch(1), left: inch(1) },
      },
    },
    children: [
      new Paragraph({ text: 'Offer of Employment', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [
          new TextRun('We are pleased to offer you the position of '),
          new TextRun({ text: 'Senior Engineer', bold: true }),
          new TextRun('.'),
        ],
      }),
    ],
  }],
});
```

The hierarchy is fixed: `Document → Section[] → Paragraph|Table[] → TextRun[]`. A
paragraph holds runs; a run holds *uniformly formatted* text and cannot hold another
paragraph. This is not the library being awkward — it is the OOXML model, and fighting it
is how people end up with the "why can't I nest this" afternoon.

A **section** is a page-layout scope, not a chapter. New page size, new orientation, or
new header/footer means a new section — and a new section always starts a new page.
Sections are not how you break pages within the same layout (§3.7).

### 3.3 Named styles over inline formatting

This is the pattern that makes the file survive editing.

```js
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: hpt(11) },
                  paragraph: { spacing: { line: 276 } } },   // 276 ≈ 1.15 line spacing
    },
    paragraphStyles: [
      { id: 'Clause', name: 'Clause', basedOn: 'Normal', next: 'Clause', quickFormat: true,
        run: { size: hpt(10.5) },
        paragraph: { spacing: { before: pt(6), after: pt(6) }, indent: { left: cm(0.75) },
                     alignment: AlignmentType.JUSTIFIED } },
      { id: 'Sig', name: 'Signature Block', basedOn: 'Normal', next: 'Normal',
        run: { italics: true, color: '444444' },
        paragraph: { spacing: { before: pt(24) }, keepLines: true } },
    ],
  },
  sections: [{ children: [ new Paragraph({ text: legalText, style: 'Clause' }) ] }],
});
```

`next: 'Clause'` means pressing Enter at the end of a clause produces another clause —
the ergonomic detail that makes a generated contract feel native. `basedOn: 'Normal'`
keeps you inheriting from the document default rather than restating it. `keepLines`
stops a signature block splitting across a page.

Colours are **6-digit hex, no `#`** (`'444444'`). Passing `'#444444'` yields black with
no error. The `line: 276` value is 240 × 1.15 — line spacing is in twentieths of a point
where 240 = single. `line: 480` is double-spaced.

### 3.4 Numbering and lists

Two different mechanisms, and picking the wrong one costs an hour.

```js
// Bullets — free, no config:
new Paragraph({ text: 'Health insurance from day one', bullet: { level: 0 } });

// Numbered lists — must declare a numbering config, then reference it:
const doc = new Document({
  numbering: {
    config: [{
      reference: 'clause-numbers',
      levels: [
        { level: 0, format: 'decimal', text: '%1.',    alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: cm(0.8), hanging: cm(0.4) } } } },
        { level: 1, format: 'lowerLetter', text: '(%2)',
          style: { paragraph: { indent: { left: cm(1.6), hanging: cm(0.5) } } } },
      ],
    }],
  },
  sections: [{ children: [
    new Paragraph({ text: 'Confidentiality', numbering: { reference: 'clause-numbers', level: 0 } }),
    new Paragraph({ text: 'Survives termination.', numbering: { reference: 'clause-numbers', level: 1 } }),
  ]}],
});
```

The traps, in the order they will hit you: `text: '%1.'` refers to level 0's counter,
`%2` to level 1's — so a nested `1.a` needs `text: '%1.%2'`, and using `%1` at level 1
restarts your numbering visually. Every paragraph sharing a `reference` shares one
continuous counter, so two separate lists in one document need **two references** or the
second starts at 8. And `hanging` indent is what keeps wrapped text aligned under the
text rather than under the number — without it, long list items look broken.

### 3.5 Tables, and why widths are the hard part

```js
import { Table, TableRow, TableCell, WidthType, BorderStyle, VerticalAlign } from 'docx';

const CONTENT_W = inch(6.5);                       // Letter minus 1" margins each side
const cols = [0.28, 0.44, 0.28].map(f => Math.round(CONTENT_W * f));

const cell = (text, { bold = false, align } = {}) => new TableCell({
  verticalAlign: VerticalAlign.CENTER,
  margins: { top: pt(4), bottom: pt(4), left: pt(6), right: pt(6) },
  children: [ new Paragraph({ alignment: align, children: [ new TextRun({ text, bold }) ] }) ],
});

const table = new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: cols,                               // ← required, in DXA, or Word guesses
  rows: [
    new TableRow({ tableHeader: true, children: [   // repeats on every page
      cell('Component', { bold: true }), cell('Detail', { bold: true }),
      cell('Amount', { bold: true, align: AlignmentType.RIGHT }),
    ]}),
    new TableRow({ children: [
      cell('Base salary'), cell('Annual, paid monthly'),
      cell('₹24,00,000', { align: AlignmentType.RIGHT }),
    ]}),
  ],
});
```

`columnWidths` on the table **and** consistent widths per cell is what stops Word's
autofit from redistributing everything on open. If the numbers do not sum to the table
width, Word silently scales them — which is how a table renders correctly in LibreOffice
and wrong in Word. Compute from a single `CONTENT_W` constant; never hardcode.

`tableHeader: true` on the first row makes it repeat across page breaks — the same
`<thead>` idea as print CSS, and equally the fix for 90% of "my table looks broken on
page 2".

`WidthType.PERCENTAGE` exists and takes fiftieths of a percent (`size: 5000` = 100%),
which is a unit nobody guesses. DXA is less clever and more predictable.

### 3.6 Headers, footers, and page numbers

```js
import { Header, Footer, PageNumber } from 'docx';

sections: [{
  properties: { titlePage: true },      // enables a distinct first-page header/footer
  headers: {
    first:   new Header({ children: [ new Paragraph('') ] }),   // blank on the cover
    default: new Header({ children: [ new Paragraph({ text: 'Acme Ltd — Confidential',
                                                      alignment: AlignmentType.RIGHT }) ] }),
  },
  footers: {
    default: new Footer({ children: [ new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [ new TextRun({ children: ['Page ', PageNumber.CURRENT,
                                           ' of ', PageNumber.TOTAL_PAGES] }) ],
    })]}),
  },
  children: [ /* ... */ ],
}]
```

Real page numbers, unlike in print CSS, come free here — `PageNumber.CURRENT` /
`TOTAL_PAGES` are field codes Word evaluates. This is a legitimate reason to pick .docx
over browser print for paginated documents. Note headers live in the **page margin**: a
three-line header with a 1" top margin overlaps the body. Grow the margin to match.

### 3.7 Page breaks

```js
new Paragraph({ children: [ new PageBreak() ] });               // explicit break
new Paragraph({ text: 'Schedule A', pageBreakBefore: true });   // better: attached to content
```

Prefer `pageBreakBefore` — it survives edits above it, where a standalone break paragraph
drifts and eventually leaves a blank page in the middle of a document you no longer
control. `keepNext: true` on a heading stops it orphaning at a page bottom; the direct
analogue of `break-after: avoid`.

### 3.8 The TOC field, and its honest limitation

```js
import { TableOfContents } from 'docx';

new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' });
```

This writes a TOC *field*, not a TOC. **The generated document opens with an empty or
"No table of contents entries found" placeholder** until the field is calculated —
Word prompts to update fields on open only if `updateFields` is set, and headless
converters (LibreOffice `--convert-to pdf`, most preview panes) will render it blank.

```js
const doc = new Document({ features: { updateFields: true }, sections: [ /* ... */ ] });
```

That prompts Word to populate it, which is the best available outcome and still a prompt
your user must accept. If the TOC must be correct in a PDF you generate server-side, you
either post-process through LibreOffice twice (once to populate fields, once to convert)
or you build the TOC yourself as ordinary paragraphs with no page numbers. Decide this
before you promise a client a Word doc with a working TOC. Entries only appear for
paragraphs using real heading styles — another reason §3.3 is not optional.

### 3.9 Templating: generate, don't find-and-replace

The recurring request is "here is our .docx, fill in the blanks". Resist it. Word splits
a placeholder like `{{name}}` across multiple runs unpredictably — the `{{`, `name`, and
`}}` frequently land in three separate `<w:r>` elements because of spell-check state or
an editing artifact, so naive string replacement finds nothing and silently produces a
document with visible placeholders. Correct implementations must normalize runs before
matching, which is a real piece of engineering, not a regex.

Libraries exist for this. The dominant one, **docxtemplater**, is not permissively
licensed — its core is under a copyleft licence with commercial terms for the features
most people actually want. Noting it here so you recognize the name and check before
adopting; this skill does not recommend it and does not cover it. The approach that keeps
you out of that decision entirely: model the document as data, generate the whole tree
with `docx`, and let the template live in your code as a function. `renderOffer(data)`
is reviewable, diffable, and testable. A binary .docx in your repo is none of those.

### 3.10 Images and Packer output

```js
import { ImageRun } from 'docx';

new Paragraph({ children: [ new ImageRun({
  data: logoBuffer,                      // Node: Buffer/Uint8Array. Browser: ArrayBuffer or base64.
  transformation: { width: 160, height: 40 },   // PIXELS here, not twips. Library → EMU.
  type: 'png',
})]});
```

Aspect ratio is not preserved for you — pass both dimensions and compute one from the
source ratio yourself, or ship a squashed logo. SVG support is partial and version-
dependent; rasterize to PNG at 2× and set the transformation to the 1× size.

```js
// Node
await fs.writeFile('offer.docx', await Packer.toBuffer(doc));

// Browser
const blob = await Packer.toBlob(doc);
const a = Object.assign(document.createElement('a'),
  { href: URL.createObjectURL(blob), download: 'offer-letter.docx' });
a.click(); URL.revokeObjectURL(a.href);
```

`Packer.toBuffer` in the browser and `Packer.toBlob` in Node are the two mistakes; the
error message is not obvious. There is also `Packer.toStream` for Node when the document
is large enough that holding the whole buffer matters — rare for .docx, which is text.

## 4. Anti-patterns

- **`size: 12` expecting 12pt.** It is half-points; you shipped 6pt. Write `hpt()` first
  and never pass a raw number.
- **Inline formatting on every run instead of named styles.** Looks identical, edits
  catastrophically. §3.3 is the whole reason to ship .docx at all.
- **`'#444444'` for a colour.** Six hex digits, no hash. The hash silently yields black.
- **Omitting `columnWidths` on tables.** Word's autofit redistributes on open, so it
  looks right in LibreOffice and wrong for your actual users.
- **Reusing one numbering `reference` for two unrelated lists.** The second list
  continues the first's counter and starts at 8.
- **Promising a populated TOC.** The field is empty until Word calculates it; headless
  converters render it blank. §3.8.
- **A new section per page break.** Sections are layout scopes. Use `pageBreakBefore`.
- **Standalone `PageBreak` paragraphs in editable documents.** They drift as content is
  edited above them and leave blank pages.
- **Find-and-replacing placeholders in a binary template.** Runs split; matches fail
  silently. Generate the tree from data (§3.9).

## 5. Usage

1. Confirm .docx is actually required — "will anyone edit this?" If no, ship a PDF and
   save the complexity.
2. Paste the §3.1 unit helpers in before writing any content. Use them everywhere.
3. Declare `styles.default` + named `paragraphStyles` with `basedOn`/`next` (§3.3).
   Content should reference styles, not carry formatting.
4. Model the document as data with a pure `render(data) → Document` function. No binary
   templates in the repo (§3.9).
5. Tables: one `CONTENT_W` constant, explicit `columnWidths`, `tableHeader: true` on
   row 1 (§3.5).
6. Headers/footers with `PageNumber.CURRENT`/`TOTAL_PAGES`; grow the page margin to fit
   (§3.6).
7. Review against every §4 item. Open the output in **Word** and **LibreOffice**, then
   press Enter at the end of each styled block and confirm the next paragraph inherits
   correctly. That last test is the one that catches inline-formatting rot.

## 6. Example Output

An "Export offer letter (.docx)" feature for an HR product, built with this skill:

- `renderOffer(candidate)` is a pure function returning a `Document`; the letter's text
  lives in code, reviewed in PRs, with a snapshot test asserting the run tree — no binary
  template anywhere in the repo.
- Three named styles (`Clause`, `Sig`, plus a `Normal` default of Calibri 11pt at 1.15
  line spacing), each with `next` chained so a recruiter editing the comp number and
  hitting Enter gets a correctly formatted paragraph rather than 6pt Times.
- A compensation table sized from a single `CONTENT_W = inch(6.5)` constant with explicit
  `columnWidths` at 28/44/28, right-aligned amounts, and `tableHeader: true` so it
  repeats when a long benefits list pushes it over a page.
- `titlePage: true` gives a clean letterhead cover; following pages carry an "Acme Ltd —
  Confidential" header and a real `Page N of M` footer field.
- Clause numbering via one `clause-numbers` reference with `decimal` / `lowerLetter`
  levels and hanging indents, so wrapped clause text aligns under the text, not the
  number. Schedule A starts via `pageBreakBefore` on its heading, not a floating break
  paragraph — so it stays correct after recruiters add paragraphs above it, which they do.
