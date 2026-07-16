---
title: Typst Typesetting Skill
category: Document
description: A practical guide to generating real documents with Typst — the set/show rule mental model, templates as plain functions, data-driven pages fed from JSON, long tables with repeating headers, and compiling in CI without the font failures that only appear on the build machine. For teams who need LaTeX-quality PDFs from a toolchain that compiles in milliseconds and reports errors you can act on.
usage: Load this skill when a user needs programmatic PDF or print output — invoices, reports, certificates, résumés, papers, generated docs — and wants better than HTML-to-PDF but faster to iterate than LaTeX. Settle the LaTeX-vs-Typst call with section 3.11 first, then build with set/show rules from 3.2 before writing any manual layout. Check section 4 before declaring the document done.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 20
pocUrl: https://github.com/typst/typst
---
# Typst Typesetting Skill

## 1. Philosophy

LaTeX won because nothing else set a page that well, and kept winning because switching
cost more than suffering. The suffering is real: a macro language with no data
structures worth the name, errors naming a line 200 lines from the mistake, a
multi-pass build, and an ecosystem where "how do I change the header" is a 2009 forum
post recommending `fancyhdr`.

Typst is that stack rebuilt with forty years of language design applied.

1. **The document is a program with a data layer.** Real arrays, dictionaries, and
   functions with named arguments. If your content comes from a system, you should be
   reading JSON — not concatenating `.tex`.
2. **`#set` and `#show` are the whole model.** Nearly every "how do I style X" is one of
   the two. Hand-tuned spacing and `#place` calls mean you skipped the model.
3. **Templates are functions, not preambles.** A function taking content and returning
   content. No class files, no `\input` ordering, no global mutable state.
4. **Compile speed changes how you work.** Sub-second incremental builds mean you
   iterate on a document like a web page. Design for that loop.
5. **LaTeX is still correct sometimes.** Journals ship `.cls` files. Be honest about it
   (§3.11) instead of reimplementing a template no editor will accept.

## 2. Tech Stack

- **Project:** Typst — https://github.com/typst/typst — Apache-2.0 licensed. The CLI,
  compiler, and standard library are Apache-2.0; the hosted web app is a separate,
  non-open-source product.
- This skill is an independent, original guide; it is not affiliated with or endorsed by
  the Typst maintainers.
- **CLI:** `typst compile`, `typst watch`, `typst fonts`, `typst query`. One static
  binary — no TeX distribution, no package manager to install first.
- **Packages:** `@preview/<name>:<version>`, fetched and cached on first use.
  Version-pinned by syntax, so builds are reproducible by default.
- **Data in:** `json()`, `yaml()`, `csv()`, `toml()`, `xml()` are standard library. Plus
  `sys.inputs` for values passed on the command line.
- **Embedding:** the `typst` Rust crate for in-process compiles, or a WASM build for
  browser rendering. Both make you supply a `World` (fonts, files, time) — that's the
  real work (§3.9).
- **Not** for journal submission. Not a general-purpose language — a document language
  that happens to be programmable.

## 3. Patterns

### 3.1 Markup mode vs code mode: the `#` is the whole story

A `.typ` file is markup until a `#` switches you into code mode for exactly one
expression. Then you're back in markup. Misreading this causes nearly every early error.

```typ
This is markup. *bold*, _italic_, `raw`, and a #strong[function call].

#let total = 1420.50           // code mode: a binding, no output
The invoice total is #total.   // markup with one code expression spliced in

#if total > 1000 [ A discount applies. ] else [ No discount. ]
#for item in ("a", "b") [ - Item #item ]
```

- `[...]` is a *content block* — markup, and a first-class value you can pass around.
- `{...}` is a *code block* — statements; the last expression is the value.
- `#foo[bar]` and `#foo([bar])` are identical. A trailing content block is just the last
  positional argument, which is why `#figure[...]` reads like markup and is a plain call.

### 3.2 `#set` and `#show`: learn these two and you know Typst

A **set rule** changes a function's default arguments for the rest of the scope. A
**show rule** intercepts an element and replaces how it renders.

```typ
#set page(paper: "a4", margin: (x: 20mm, y: 24mm))
#set text(font: "Source Serif 4", size: 10.5pt, lang: "en")
#set par(justify: true, leading: 0.68em)
#set heading(numbering: "1.1")

#show heading.where(level: 1): it => {
  set text(size: 16pt, weight: 700)
  block(above: 1.4em, below: 0.8em)[#it.body]      // it.body — NOT it
}
#show link: it => underline(text(fill: rgb("#0b57d0"), it))
#show: doc => columns(2, doc)                      // the everything-selector
```

Traps in the order people hit them:

- `#show heading: it => ...it...` rebuilds the heading and recurses forever. Use
  `it.body`, or use a set rule if you only want to change parameters.
- Set rules are scoped. `#set text(size: 8pt)` inside `[...]` dies at the closing
  bracket. That's a feature — it's how a footer gets smaller without a reset after.
- `#show: template.with(title: "Q3")` applies a template, and must come near the top,
  before any content.

### 3.3 Templates are functions

```typ
// report.typ
#let report(title: "", author: "", date: none, body) = {
  set document(title: title, author: author)
  set page(
    paper: "a4", margin: (top: 30mm, bottom: 28mm, x: 20mm),
    header: context {
      if counter(page).get().first() > 1 {
        set text(size: 8pt, fill: luma(110))
        grid(columns: (1fr, auto), title, date)
        line(length: 100%, stroke: 0.4pt + luma(200))
      }
    },
    footer: context align(center, text(size: 8pt, fill: luma(110))[
      #counter(page).display("1") / #counter(page).final().first()
    ]),
  )
  set text(font: "Source Serif 4", size: 10.5pt)
  set heading(numbering: "1.1")
  align(center, text(size: 22pt, weight: 700, title))
  v(2em)
  body
}
```

```typ
// main.typ
#import "report.typ": report
#show: report.with(title: "Q3 Infrastructure Review", author: "Platform Team",
                   date: datetime.today().display("[day] [month repr:long] [year]"))
= Summary
Body text starts here.
```

`counter(page).final().first()` gives a true page total, and requires the enclosing
`context` — Typst re-runs layout until counters converge, and `context` is you saying
"resolve this in a later pass." Forget it and you get a compile error naming exactly
that, which is the whole difference from debugging `\pageref{LastPage}`.

### 3.4 Data-driven documents: JSON in, PDF out

```typ
#let data = json("invoice.json")
#let money(cents) = "$" + str(calc.round(cents / 100, digits: 2))

= Invoice #data.number
#data.customer.name — #data.customer.email

#table(
  columns: (1fr, auto, auto, auto),
  align: (left, right, right, right),
  table.header([*Description*], [*Qty*], [*Unit*], [*Amount*]),
  ..data.lines.map(l => (l.description, str(l.qty), money(l.unitCents),
                         money(l.qty * l.unitCents))).flatten(),
)

#let subtotal = data.lines.fold(0, (acc, l) => acc + l.qty * l.unitCents)
#align(right)[*Total: #money(subtotal + calc.round(subtotal * 0.18))*]
```

The `..` spread with `.map().flatten()` is the idiom for feeding rows into `#table`,
which takes cells as flat positional arguments. Pass an array of arrays and you get one
cell containing an array, not a row.

Values from outside the file, without touching the source:

```sh
typst compile invoice.typ out/INV-1042.pdf --input id=1042
```

```typ
#let id = sys.inputs.at("id", default: "draft")
```

For 500 invoices, loop the CLI with `--input`, or use the Rust crate (§3.9). Do not
template-generate 500 `.typ` files.

### 3.5 Tables that survive page breaks

```typ
#set table(
  stroke: (x, y) => (bottom: if y == 0 { 0.8pt + black } else { 0.3pt + luma(200) }),
  fill: (x, y) => if calc.odd(y) and y > 0 { luma(248) },
  inset: (x: 6pt, y: 5pt),
)
#table(
  columns: (auto, 1fr, auto),
  table.header(repeat: true)[*Date*][*Event*][*Amount*],
  ..rows,
  table.footer[][*Total*][*#money(total)*],
)
```

`repeat: true` re-emits the header on every page the table spans. It's the default, but
state it — the failure mode (a 40-page table whose columns are labelled only on page 1)
is invisible until someone prints it.

`#table` vs `#grid`: same layout engine. `#table` is semantic — strokes, header/footer,
PDF structure. `#grid` is pure layout with no default strokes. Grid for a two-column
header block, table for data.

An `auto` column measures its widest cell and will blow past the page width on long
content. Any column holding free text must be `1fr`.

### 3.6 Figures, references, bibliography

```typ
#figure(image("charts/latency-p99.svg", width: 82%),
        caption: [p99 latency after the pool change.]) <fig-latency>

As shown in @fig-latency, the regression cleared at 14:20.

#figure(table(columns: 3, ..cells), caption: [Error budget.], kind: table) <tbl-budget>

#set cite(style: "chicago-author-date")
#bibliography("refs.bib", title: "References")
```

`<label>` attaches to the preceding element; `@label` references it. Numbering,
counters, and the supplement word are handled — change wording with
`#set figure(supplement: [Fig.])`. `kind: table` numbers tables separately from figures.
Bibliography reads Hayagriva YAML or BibTeX directly. Charts as SVG stay vector in the
PDF; a 300 DPI PNG is a 2MB blur on paper.

### 3.7 Fonts: the failure that only happens in CI

Typst resolves fonts by **name**, from system fonts plus its embedded set. `"Source
Serif 4"` on your laptop is something you installed and forgot. A CI container has no
fonts, so Typst substitutes silently — and the shipped PDF has different metrics,
different line breaks, and a different page count from the one you reviewed.

```sh
typst compile --font-path ./fonts --ignore-system-fonts main.typ out.pdf
```

`--ignore-system-fonts` is the load-bearing flag. Without it CI falls back quietly and a
customer tells you. With it, a missing font is a hard build error — which is what you
wanted. `typst fonts --font-path ./fonts` lists exactly what the compiler can see; run
it as step one of any font debugging.

Check licences before vendoring. SIL OFL fonts (Source Serif, Inter, Fira, EB Garamond)
are safe to commit and to embed in a distributed PDF. Many commercial fonts are not.

### 3.8 CI: compile, watch, and gating on it

```yaml
- run: |
    typst compile --root . --font-path ./fonts --ignore-system-fonts \
      --input build=${{ github.sha }} docs/report.typ artifacts/report.pdf
```

- `typst watch main.typ out/preview.pdf` gives sub-second incremental recompiles.
- `--root` bounds file access; any `json()`/`image()` outside it errors. Set it to the
  repo root rather than letting it default to the file's directory.
- Typst exits non-zero with file:line:column. No log scraping, no
  `-interaction=nonstopmode`, no second pass to let references settle.
- Pin the compiler version. Typst is pre-1.0 and a minor bump can change layout.
- `@preview/...` downloads hit the network on a cold cache. Cache or vendor them if your
  builds must be hermetic.

### 3.9 Embedding: the Rust crate and WASM

The crate is not `render(source) -> pdf`. You implement a `World` trait — source files,
font book, current time, package resolution — then hand it to the compiler and
serialise. Budget a day for the first one; the payoff is 500 invoices in one process
with fonts loaded once.

The WASM build renders in-browser: live preview, no server. The compiler plus embedded
fonts is a multi-megabyte download — fine for a dedicated editor page, wrong for a
marketing-site widget. Low volume → shell out to the CLI, the subprocess cost is noise.
High volume or live editing → embed.

### 3.10 Page-break control

```typ
#pagebreak(weak: true)          // no-op if already at a page top
#pagebreak(to: "odd")           // chapters start recto, for duplex printing
#block(breakable: false)[ #heading(level: 3)[Termination] This must not split. ]
```

`weak: true` is what you want inside templates and loops — it prevents the blank page
that appears when a section ends exactly at a boundary. Prefer
`block(breakable: false)` over manual `#pagebreak()` for keep-together: a manual break
is correct for exactly one revision of the content.

### 3.11 When LaTeX is still the right call

- **Journal or conference templates.** Elsevier, ACM, IEEE, and Springer ship `.cls`
  files and their editorial systems ingest `.tex`. A Typst lookalike is not the
  template; it gets rejected. Some venues now take PDF-only — check first.
- **A co-author or client whose workflow is Overleaf.** Tooling is a team decision.
- **A niche package with no Typst equivalent** — deep chemistry notation, music
  engraving, some legacy bibliography styles.

Everything else — internal reports, invoices, books, résumés, slides, docs-as-code —
Typst wins on iteration speed and on a data loop being four lines instead of a `pgffor`
incantation.

## 4. Anti-patterns

- **String-concatenating `.typ` source to inject data.** You now own escaping, and a `#`
  or `[` in a customer's name breaks the build or worse. Use `json()` / `sys.inputs`.
- **`#show heading: it => ... it ...`.** Referencing `it` bare inside its own show rule
  recurses forever. Use `it.body`.
- **CI without `--ignore-system-fonts`.** Silent substitution; the PDF reviewed is not
  the PDF shipped (§3.7).
- **Manual spacing instead of set rules.** `#v(0.6em)` after every heading is a
  `#set block(above: ...)` you haven't written yet, and it will drift.
- **`auto` columns for free text.** The column measures the longest cell and overflows
  the page. Use `1fr` for anything that should wrap.
- **Passing an array of arrays to `#table`.** Cells are flat positional arguments;
  without `..` and `.flatten()` you get one cell holding an array.
- **Manual `#pagebreak()` for keep-together.** Correct until the paragraph above changes
  by one line. Use `block(breakable: false)`.
- **`#place` and absolute coordinates.** Almost always a set/show rule or a `#grid` you
  haven't found. If you're computing offsets in `pt`, stop.
- **Floating the compiler version in CI.** Pre-1.0; a minor bump can change layout, and
  layout is your output.

## 5. Usage

1. Decide LaTeX vs Typst in one line with §3.11 before anything else. Journal template →
   LaTeX. Otherwise → Typst.
2. Write the template as a function first (§3.3): page geometry, header/footer, text and
   heading set rules. Content comes later and stays clean.
3. Express every styling requirement as `#set` or `#show`. If a requirement resists
   both, re-read §3.2 before writing manual layout.
4. If content comes from a system, load it with `json()`/`csv()`/`sys.inputs` — never by
   generating source text.
5. Vendor fonts and compile with `--font-path ./fonts --ignore-system-fonts --root .`
   from day one, locally and in CI. Pin the compiler version.
6. Iterate with `typst watch`; gate the build on `typst compile` exiting zero.
7. Review against every §4 anti-pattern. Test with an empty dataset, one row, and one
   long enough to span three pages — plus a name containing `#`, `[`, and an accent.

## 6. Example Output

A monthly usage-statement generator for a small SaaS, built with this skill:

- `statement.typ` is a template function taking `(account:, period:, body)`. A4,
  20mm/26mm margins, a `context` header that suppresses itself on page 1 and otherwise
  prints account and period, and a footer with true
  `counter(page).display("1") / counter(page).final().first()` numbering.
- The billing service writes one `account.json` per customer and shells out:
  `typst compile --root . --font-path ./fonts --ignore-system-fonts --input acct=A-8842
  statement.typ out/A-8842-2026-06.pdf`. 340 statements compile in about 9 seconds on a
  single CI runner — no render farm, no headless Chrome, no font container.
- The line-item table uses `columns: (auto, 1fr, auto, auto)` with the description as
  `1fr`, `table.header(repeat: true)`, zebra fill via a `fill:` closure, and a
  `table.footer` carrying the total. Four-page statements carry column headers onto
  every page — verified by a fixture with 180 line items.
- Inter and Source Serif 4 (both SIL OFL) are committed under `fonts/`. The first CI run
  without `--ignore-system-fonts` shipped a PDF two pages longer than the reviewed one;
  the flag went in that afternoon and the bug class has not returned.
- The usage chart is an SVG emitted by the billing service, dropped into `#figure` with
  a caption — vector in the PDF, sharp at 400% zoom, about 11KB.
