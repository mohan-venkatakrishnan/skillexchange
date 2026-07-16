---
title: Spreadsheet Reports with ExcelJS Skill
category: Document
description: Production patterns for emitting real .xlsx workbooks with ExcelJS — typed cells, number formats, frozen panes, autofilter, validation dropdowns, and the streaming writer that keeps a 500k-row export from killing the process. Written after enough support tickets about "the dates are all wrong" and "Excel says the file is corrupt" to know exactly which five mistakes cause them.
usage: Load this skill when a user asks for Excel export, .xlsx reports, or "download as spreadsheet". Answer the §3.1 question first — CSV, ExcelJS, or SheetJS — before writing code. Use §3.3 for value-vs-format typing and §3.5 for anything over ~20k rows; apply §4 as a review checklist.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 16
pocUrl: https://github.com/exceljs/exceljs
---
# Spreadsheet Reports with ExcelJS Skill

## 1. Philosophy

Renaming a CSV to `.xlsx` is a lie that Excel catches instantly, and "export to Excel"
almost never means "export comma-separated text". It means: the finance team opens the
file, the columns are already the right width, the totals are already formatted as
currency, the header row is already frozen, and the filter dropdowns are already there.
That last mile is the entire feature. The data was never the hard part.

The positions this skill takes:

1. **A cell has a value AND a format, and they are different things.** Ninety percent of
   Excel export bugs are someone writing `"$1,234.50"` as a string. Write the number
   `1234.5`, set `numFmt`. The user needs to sum that column.
2. **Streaming is not an optimization, it is a threshold.** Below ~20k rows use the
   normal workbook. Above it, the in-memory object graph is 10–20× your raw data and
   you will OOM. Switch writers, not tactics.
3. **Formatting is the product.** Frozen panes, autofilter, and column widths are three
   lines of code and they separate a file people use from a file people re-format by
   hand every month.
4. **Do not template an existing .xlsx.** Round-tripping silently drops pivot tables,
   charts, slicers, and conditional formatting ExcelJS does not model. Generate fresh.

## 2. Tech Stack

- **Primary:** **ExcelJS** — a JavaScript reader/writer for the Office Open XML
  spreadsheet format. Repo: https://github.com/exceljs/exceljs. License: **MIT**
  (permissive; requires the copyright notice be preserved in distributions). This skill
  is an independent, original guide; it is not affiliated with or endorsed by the ExcelJS
  maintainers.
- **Runtime:** Node for server-side generation; works in the browser too via a bundler,
  but the bundle is heavy (~800KB min, plus a zip implementation). If browser size
  matters more than write fidelity, see the SheetJS note in §3.10.
- **Output:** `workbook.xlsx.writeBuffer()` (browser → Blob) or `writeFile(path)` (Node),
  or `stream.xlsx.WorkbookWriter` for large jobs.
- **No** `res.setHeader('Content-Type', 'application/vnd.ms-excel')` on an HTML table.
  That trick from 2009 makes Excel show a "the file format doesn't match the extension"
  warning to every user, forever.

## 3. Patterns

### 3.1 The decision (run this first)

```
Machine-to-machine, any size, no formatting needed?  → CSV. Stop. Don't add a dependency.
Human opens it in Excel, < ~20k rows?                → ExcelJS, normal workbook  (§3.2)
Human opens it, 20k – several million rows?          → ExcelJS WorkbookWriter    (§3.5)
Read/parse an .xlsx someone uploaded?                → SheetJS is usually better (§3.10)
Need charts / pivot tables in the output?            → Neither. Ship a template + data
                                                       sheet, or generate via a real
                                                       Excel automation host.
```

### 3.2 Workbook skeleton

```js
import ExcelJS from 'exceljs';

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Acme Reporting';
  wb.created = new Date();
  // Excel shows these in File → Info. Cheap credibility; costs nothing.
  return wb;
}

const wb = newWorkbook();
const ws = wb.addWorksheet('Invoices', {
  views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],   // freeze header row + first col
  properties: { defaultRowHeight: 18 },
});

ws.columns = [
  { header: 'Invoice #', key: 'num',    width: 14 },
  { header: 'Client',    key: 'client', width: 32 },
  { header: 'Issued',    key: 'issued', width: 12, style: { numFmt: 'yyyy-mm-dd' } },
  { header: 'Amount',    key: 'amount', width: 14, style: { numFmt: '#,##0.00' } },
  { header: 'Paid',      key: 'paid',   width: 8 },
];
```

Setting `ws.columns` with `header` fields *writes row 1 for you* — do not then also
`addRow(['Invoice #', ...])`, which is how people end up with a duplicated header. The
`key` is what `addRow({ num, client, ... })` matches against; keys and object property
names must agree or you get silent blanks.

Worksheet name rules Excel enforces and ExcelJS will not warn you about: max 31
characters, and none of `\ / ? * [ ] :`. A name built from a client name will eventually
contain a slash. Sanitize:

```js
const safeSheetName = s => s.replace(/[\\\/?*\[\]:]/g, '-').slice(0, 31) || 'Sheet1';
```

### 3.3 Values vs formats — the rule that prevents most tickets

```js
// WRONG — a string. Unsummable, left-aligned, sorts as text ("1000" < "9").
ws.addRow({ amount: '$1,234.50' });

// RIGHT — a number plus a display format.
const r = ws.addRow({ num: 'INV-0041', client: 'Northwind', issued: new Date(2026, 2, 14),
                      amount: 1234.5, paid: false });
r.getCell('amount').numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';   // negatives in red
r.getCell('paid').value = false;    // real boolean → Excel shows FALSE, filters as bool
```

Useful `numFmt` strings, all four sections being `positive;negative;zero;text`:

| Intent | numFmt |
|---|---|
| Thousands, 2dp | `#,##0.00` |
| Currency, red negatives | `"$"#,##0.00;[Red]-"$"#,##0.00` |
| Percent (store `0.0725`, not `7.25`) | `0.00%` |
| Accounting-style dash for zero | `#,##0.00;-#,##0.00;"—"` |
| Date | `yyyy-mm-dd` |
| Duration over 24h | `[h]:mm:ss` |

The percent trap deserves its own sentence: `0.00%` **multiplies the stored value by
100 for display**. Store `0.0725` to show `7.25%`. Store `7.25` and you ship `725.00%`.

### 3.4 Dates and the 1900 epoch

Excel stores dates as days since 1899-12-30, and its serial calendar deliberately
contains a **1900-02-29 that never existed** — a bug preserved since 1985 for Lotus 1-2-3
compatibility. ExcelJS handles the conversion when you pass a real `Date`, so:

```js
cell.value = new Date('2026-03-14T00:00:00');     // ✅ pass a Date, let the lib convert
cell.value = 46095;                                // ❌ raw serial: right only by luck
cell.value = '2026-03-14';                         // ❌ string: not a date to Excel
```

The one that actually bites in production is **timezones**. `new Date('2026-03-14')`
parses as UTC midnight; if your Node process runs in UTC+05:30 the local rendering is
still the 14th, but in UTC-05:00 it is the 13th at 19:00 — and a `yyyy-mm-dd` format
renders `2026-03-13`. Every report generated overnight is off by one day and only for
some users. Two defences, pick one and be consistent:

```js
// (a) Construct in local time explicitly — no Z, no drift:
new Date(2026, 2, 14);
// (b) Or set the workbook-level offset so ExcelJS's conversion is deterministic:
const wb = new ExcelJS.Workbook();
wb.properties.date1904 = false;         // stay on the 1900 epoch (the default)
```

If you are round-tripping dates that must survive exactly, store an ISO string in a
hidden column alongside the formatted date. Ugly, and it has saved audits.

### 3.5 Streaming for large datasets

```js
import ExcelJS from 'exceljs';

async function exportLarge(rows, path) {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: path,
    useStyles: true,       // false is ~2× faster; you lose numFmt. Usually worth the cost.
    useSharedStrings: false, // keep false: shared strings must be held in memory to dedupe
  });
  const ws = wb.addWorksheet('Ledger');
  ws.columns = [
    { header: 'Date',   key: 'date',   width: 12, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Ref',    key: 'ref',    width: 18 },
    { header: 'Amount', key: 'amount', width: 14, style: { numFmt: '#,##0.00' } },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).commit();

  for await (const r of rows) {
    ws.addRow({ date: r.date, ref: r.ref, amount: r.amountCents / 100 }).commit(); // ← !
  }
  ws.commit();
  await wb.commit();
}
```

`.commit()` on every row is the entire point — it flushes that row to disk and releases
it. Forget it and the streaming writer buffers everything, i.e. you took the complexity
and none of the benefit. Once a row is committed you **cannot go back and modify it**, so
anything computed from the whole dataset (a totals row, a max-width calculation) must
either be pre-computed or written to a second sheet.

Rough figures from a real ledger export on a 2-core container: 500k rows × 12 columns is
~180MB RSS and ~40s streaming with `useStyles: true`; the same job on a normal
`Workbook` peaked over 4GB and died. Also note Excel's hard limit — 1,048,576 rows per
sheet. Above that you must shard across sheets, and you should probably be shipping
Parquet or a database extract instead.

### 3.6 Autofilter, widths, and the header row

```js
ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

const header = ws.getRow(1);
header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
header.alignment = { vertical: 'middle' };
header.height = 22;
```

`argb` is **ARGB**, not RGB — `'FF1F3864'`, eight hex digits, alpha first. Passing
`'1F3864'` produces either black or a silently ignored fill depending on where you
passed it. There is no autofit in the .xlsx format; Excel's "autofit" is a UI action.
Approximate it yourself, capped:

```js
ws.columns.forEach(col => {
  let max = String(col.header ?? '').length;
  col.eachCell({ includeEmpty: false }, c => {
    max = Math.max(max, String(c.text ?? '').length);
  });
  col.width = Math.min(Math.max(max + 2, 8), 60);   // cap at 60 or one long URL ruins it
});
```

Not available in the streaming writer (committed rows are gone) — set sensible fixed
widths up front there.

### 3.7 Formulas vs cached results

```js
row.getCell('total').value = { formula: 'D2*E2', result: 1234.5 };
ws.getCell('F100').value  = { formula: 'SUM(F2:F99)', result: totalFromYourCode };
```

Always supply `result`. Excel recalculates on open and will overwrite it, but **nothing
else does**: LibreOffice in headless mode, Google Sheets import, Numbers, pandas'
`read_excel`, and every preview pane show `0` or blank for a formula with no cached
value. If your recipient pipes the file into a script, a formula-only cell is a data
loss bug. When in doubt, write the computed number and skip the formula entirely —
`SUM` is not a feature your users are paying for.

Formulas are always in A1 notation with `,` separators regardless of the user's locale;
ExcelJS does not translate to `;` for European locales, and it does not need to — the
file format is locale-neutral, Excel localizes on display.

### 3.8 Data validation dropdowns

```js
ws.getCell('E2').dataValidation = {
  type: 'list',
  allowBlank: false,
  formulae: ['"Draft,Sent,Paid,Void"'],   // note: ONE string, quoted, inside the array
  showErrorMessage: true,
  errorTitle: 'Invalid status',
  error: 'Pick a value from the list.',
};
```

The double-quoting is not a typo and it is the #1 reason validation silently does
nothing. The inline list also has a hard **255-character limit** including commas — past
that, Excel drops the validation without complaint. For longer lists, put the options on
a hidden sheet and reference the range:

```js
const lut = wb.addWorksheet('_lut', { state: 'veryHidden' });
countries.forEach((c, i) => lut.getCell(`A${i + 1}`).value = c);
ws.getCell('C2').dataValidation = { type: 'list', formulae: [`_lut!$A$1:$A$${countries.length}`] };
```

Apply per-cell in a loop; assigning to a range string is not supported the way you'd hope.

### 3.9 Merged cells (use sparingly)

```js
ws.mergeCells('A1:D1');
ws.getCell('A1').value = 'Q1 2026 Revenue Report';
ws.getCell('A1').alignment = { horizontal: 'center' };
```

Only the **top-left** cell holds the value; writing to `B1` after a merge throws. Merged
cells break sorting, break autofilter, and break every downstream parser. Use them for a
title banner above the data and nowhere inside it.

### 3.10 When to use SheetJS instead

Reach for SheetJS (`xlsx`) when you are **reading** arbitrary uploaded spreadsheets —
it parses more of the format's long tail (xls, xlsb, ods) and is far more forgiving of
malformed files. Reach for ExcelJS when you are **writing** and care about styling,
which SheetJS's community build largely leaves to its paid tier. Note that SheetJS's
distribution and licensing terms changed and are no longer the plain npm/Apache story
people remember — verify the current terms against your project's policy before adding
it. That check is cheap; discovering it at legal review is not.

## 4. Anti-patterns

- **Writing pre-formatted strings** (`'$1,234.50'`, `'14/03/2026'`, `'7.25%'`). Kills
  summing, sorting, and filtering. Number + `numFmt`, always.
- **CSV renamed to .xlsx**, or an HTML table served with an Excel MIME type. Excel warns
  the user the file is suspicious. It is.
- **Storing `7.25` for a `0.00%` cell.** Ships `725.00%`. Store `0.0725`.
- **`new Date('2026-03-14')` in a non-UTC process.** Off-by-one dates for half your
  users, only on some servers. Use `new Date(2026, 2, 14)`.
- **Streaming without `.commit()` per row.** All of the API complexity, none of the
  memory benefit.
- **Formulas with no `result`.** Blank cells in every consumer except Excel itself.
- **6-digit hex colours.** `argb` needs 8, alpha first — `'FF1F3864'`.
- **Merged cells inside the data region.** Breaks autofilter, sort, and every parser
  downstream.
- **Round-tripping a customer's .xlsx as a "template".** Silently drops charts, pivots,
  and conditional formatting. Generate fresh.

## 5. Usage

1. Answer §3.1 out loud. If CSV suffices, say so and add no dependency.
2. Build the workbook skeleton (§3.2): creator metadata, `ws.columns` with keys and
   widths, frozen header via `views`.
3. Type every cell (§3.3): numbers as numbers, booleans as booleans, `Date` objects as
   `Date`, formats via `numFmt`. Sweep for any string that contains `$`, `%`, or `/`.
4. Construct dates in local time (§3.4). Test with `TZ=America/New_York` and `TZ=UTC`.
5. If rows > ~20k, switch to `WorkbookWriter` (§3.5) with `.commit()` per row and fixed
   column widths.
6. Add autofilter + bold ARGB header + autofit-approximation (§3.6). Validation via
   §3.8 if the sheet is meant to be filled in.
7. Give formulas a cached `result` (§3.7), or drop the formula and write the number.
8. Review against every §4 item. Open the output in Excel *and* LibreOffice *and*
   `pandas.read_excel` before shipping.

## 6. Example Output

A monthly "Export ledger to Excel" feature for an invoicing product, built with this
skill:

- Two sheets: `Summary` (merged title banner, six KPI rows, hard numbers not formulas)
  and `Ledger` (the transactional rows).
- `Ledger` freezes row 1 + column A, carries an autofilter across all 11 columns, a navy
  `FF1F3864` bold header, and per-column `numFmt` — `yyyy-mm-dd` for dates,
  `"$"#,##0.00;[Red]-"$"#,##0.00` for amounts, `0.00%` over a stored `0.0725` for tax.
- A `Status` column carries a 4-option validation dropdown so finance can mark rows and
  re-upload; the 60-entry client list lives on a `veryHidden` `_lut` sheet referenced by
  range, sidestepping the 255-char inline limit.
- Accounts above 20k rows flip to `WorkbookWriter` with `.commit()` per row: the largest
  tenant's 460k-row year-end export writes in ~38s at ~170MB RSS, down from an OOM kill.
- Amounts are stored as `cents / 100` numbers, so the finance team's own SUM over a
  filtered selection matches our reported total to the cent — which is the actual
  acceptance test, and it passes in Excel, LibreOffice, and `pandas.read_excel` alike.
