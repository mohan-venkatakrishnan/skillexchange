---
title: Core Web Vitals and SEO with Eleventy Skill
category: Website
description: Build an Eleventy site that passes Core Web Vitals on real devices and gets indexed correctly the first time. Covers build-time performance budgets, responsive images, critical CSS, JSON-LD from front matter, canonicals, sitemaps, and why your Lighthouse 100 lies to you.
usage: Load this skill before asking your AI assistant to set up, audit, or speed up an Eleventy site. Say "use the Eleventy SEO and performance skill" and describe your site; the assistant will produce config, templates, and data files that follow these patterns instead of blog-post boilerplate.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 5
timeSavedHours: 12
pocUrl: https://github.com/11ty/eleventy
---

# Core Web Vitals and SEO with Eleventy Skill

## 1. Philosophy

A static site generator does not make a site fast. It makes a site *cheap to make fast* — and most people spend that discount on a 400KB font stack and a chat widget.

**Performance is a build artifact, not a vibe.** If your build can emit a 900KB page without failing, it will, on a Tuesday, three sprints after launch, because someone added a carousel. The only durable performance work is work the build refuses to break.

Three rules govern everything below:

1. **The budget is a gate, not a dashboard.** A number in a spreadsheet is a wish. A number in `postbuild` that exits non-zero is a policy. Set it before the first page ships, when it costs nothing to comply.
2. **Every byte of HTML is generated from data, never typed twice.** Canonical, OG image, JSON-LD, sitemap entry, RSS item — all derived from front matter through the data cascade. A hand-written `<link rel="canonical">` in a layout is a duplicate-content bug with a three-month fuse.
3. **Lab data tells you what you built; field data tells you what users got.** Optimize against the lab, ship, then judge yourself on CrUX. They will disagree, and the field is right.

If a feature cannot be expressed as "HTML plus images plus under 20KB of JS," ask whether the page needs it before asking how to optimize it.

## 2. Tech Stack

- **Eleventy** — https://github.com/11ty/eleventy — licensed **MIT**. A static site generator that ships zero client-side JavaScript by default and gets out of your way.
- **`@11ty/eleventy-img`** — the official image plugin (MIT), for build-time responsive image generation.
- **Nunjucks** — the template language in all examples. Liquid or JS templates work identically; only the syntax changes.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Eleventy maintainers. All example code is original to this skill.
Recommended companions: `lightningcss` or `esbuild` for asset pipelines, and a real mid-range Android phone on a throttled connection — the only benchmark that has ever changed my mind about anything.

## 3. Patterns

### 3.1 The budget as a build-time gate

Write the budget first. It should fail the build, not decorate a report.
```js
// scripts/check-budget.js — runs after eleventy in `npm run build`
import { glob, stat } from "node:fs/promises"; // glob: Node 22+
import { extname } from "node:path";
const BUDGET = { ".html": 45_000, ".css": 20_000, ".js": 20_000 };
let failed = false;
for await (const file of glob("_site/**/*.{html,css,js}")) {
  const { size } = await stat(file);
  if (size > BUDGET[extname(file)]) {
    console.error(`BUDGET FAIL ${file}: ${size}B > ${BUDGET[extname(file)]}B`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
```

Set limits at ~120% of today's real sizes. Every increase is a deliberate commit with a reason in the message, not silent drift.

### 3.2 LCP: find the element, then preload exactly it

LCP is almost always one element — your hero image or your headline. Optimizing "images" in general is how you spend a day and move nothing.
```njk
<link rel="preload" as="image" href="{{ hero.avif.url }}"
      imagesrcset="{{ hero.avif.srcset }}" imagesizes="100vw" fetchpriority="high">
<img src="{{ hero.fallback.url }}" srcset="{{ hero.avif.srcset }}" sizes="100vw"
     width="{{ hero.width }}" height="{{ hero.height }}" alt="{{ hero.alt }}"
     fetchpriority="high" decoding="async">
```

- **Preload exactly one thing.** Preloading five images means preloading nothing — you re-created the default priority order with extra bytes.
- **Never `loading="lazy"` on the LCP image.** Lazy defers discovery of your single most important byte. Lazy is for below the fold, and nothing else.
- **`fetchpriority="high"` on the hero, `low` on anything decorative in the header.** The browser guesses; this stops it guessing.

### 3.3 CLS: reserve space at build time

Layout shift is a promise you failed to keep about how much room something needs. Eleventy knows the answer at build time — use it.
```js
// eleventy.config.js
import Image from "@11ty/eleventy-img";
export default function (eleventyConfig) {
  eleventyConfig.addAsyncShortcode("img", async (src, alt, sizes = "100vw") => {
    const metadata = await Image(src, {
      widths: [400, 800, 1200, 1600], formats: ["avif", "webp", "jpeg"],
      outputDir: "./_site/img/", urlPath: "/img/",
    });
    return Image.generateHTML(metadata, { alt, sizes, loading: "lazy", decoding: "async" });
  });
}
```

`generateHTML` emits `width` and `height` from the real file. That is the entire CLS fix for images — the aspect-ratio box is reserved before the bytes arrive. For fonts the shift comes from the swap; kill it with metric overrides so the fallback occupies the same space:

```css
@font-face { font-family: "Inter"; src: url("/fonts/inter-var.woff2") format("woff2");
  font-display: swap; font-weight: 100 900; }
/* Fallback tuned to Inter's metrics — the swap moves nothing */
@font-face { font-family: "Inter Fallback"; src: local("Arial");
  size-adjust: 107%; ascent-override: 90%; descent-override: 22%; line-gap-override: 0%; }
body { font-family: "Inter", "Inter Fallback", sans-serif; }
```

The other CLS source is anything injected late: cookie banners, promo bars, embeds. If it must exist, give it a fixed-height container in the HTML from the start, or render it in an overlay that takes it out of flow. A banner that pushes content down 60px after 800ms is a CLS score of ~0.15 all by itself.

### 3.4 INP and render-blocking: ship less, block less

INP measures how long the main thread makes a user wait after they tap. On an Eleventy site it should be near-perfect by default; if it isn't, something you added is the cause. Load interactivity on intent, not on page load:
```js
document.querySelector("[data-search]")?.addEventListener("focus", async (e) => {
  const { mountSearch } = await import("/js/search.js");
  mountSearch(e.currentTarget);
}, { once: true });
```
Ship progressive enhancement, not hydration. A `<details>` element is an accordion. A `<form>` with a GET action is a search box. Every one you use instead of a component is INP you never have to measure.

The CSS equivalent: one render-blocking stylesheet costs an entire RTT before first paint. Inline the fold, defer the rest.
```njk
<style>{% include "css/critical.css" %}</style>
<link rel="preload" href="/css/main.css" as="style" onload="this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/css/main.css"></noscript>
```
Keep `critical.css` hand-written and under 8KB. Automated extractors produce 40KB of duplicated rules and a maintenance problem — you know what's above your fold better than a headless browser does.

### 3.5 Structured data generated from front matter

Never hand-write JSON-LD in a template. Derive it, so it cannot drift from the page it describes.
```njk
{# _includes/jsonld.njk — site.* comes from _data/site.js #}
<script type="application/ld+json">
{{ {
  "@context": "https://schema.org", "@type": "Article",
  "headline": title,
  "datePublished": page.date.toISOString(),
  "dateModified": (updated or page.date).toISOString(),
  "author": { "@type": "Person", "name": author or site.name },
  "publisher": { "@type": "Organization", "name": site.name,
    "logo": { "@type": "ImageObject", "url": site.logo } },
  "mainEntityOfPage": site.url + page.url
} | dump | safe }}
</script>
```

Add `BreadcrumbList` from the URL segments, and `Organization` once on the home page — not on every page, which is common and pointless. `dump | safe` escapes correctly; string-concatenating JSON-LD is how an apostrophe in a title becomes a parse error and your rich results vanish silently. Validate with Google's Rich Results Test *and* Schema.org's validator — they disagree, and both matter.

### 3.6 Canonicals, sitemap, RSS: one source of truth
```njk
{# _includes/head.njk — every URL derives from page.url, so it cannot drift #}
<link rel="canonical" href="{{ site.url }}{{ page.url }}">
<meta property="og:title" content="{{ title }}">
<meta property="og:description" content="{{ description }}">
<meta property="og:image" content="{{ site.url }}{{ ogImage or '/img/og-default.png' }}">
<meta property="og:url" content="{{ site.url }}{{ page.url }}">
<meta name="twitter:card" content="summary_large_image">
```
```njk
---
permalink: /sitemap.xml
eleventyExcludeFromCollections: true
---
<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{%- for item in collections.all %}{% if not item.data.noindex %}
  <url><loc>{{ site.url }}{{ item.url }}</loc>
  <lastmod>{{ (item.data.updated or item.date).toISOString() }}</lastmod></url>
{% endif %}{%- endfor %}
</urlset>
```

RSS is the same loop against `collections.posts` with an `<item>` per entry — same data, third serialisation. Set `description` and `ogImage` in directory data files (`posts/posts.11tydata.js`) so a whole section inherits sane defaults and pages override only when they differ. That is what the data cascade is for.

### 3.7 Lab vs field: know which number you're reading

Lighthouse is a simulated Moto G on a throttled link, run once, in CI. CrUX is 28 days of your actual users at the 75th percentile. They measure different things and will not match.

- **Lighthouse regression** = you shipped something. Investigate the diff.
- **CrUX regression with a green Lighthouse** = your users are not your CI. Usually a slow origin in one region, a third-party script that only fires for logged-in traffic, or a mobile share that shifted.
- **INP is field-only in practice.** Lighthouse's TBT is a proxy, not the metric. Don't celebrate a TBT of 0 and assume INP is fine.

Run Lighthouse in CI to catch what you control, judge success on CrUX, and never optimize a lab score you cannot connect to a field number.

## 4. Anti-patterns

- **"We'll do performance before launch."** Before launch is when you have the least time and the most code. The budget goes in on day one, when passing it is free.
- **`loading="lazy"` on the hero image.** You lazily loaded the exact byte the metric measures. LCP goes up by an RTT and nobody knows why.
- **Preloading six fonts and four images.** Preload is a priority *reordering* instruction. Reorder everything and you reordered nothing, at the cost of bandwidth contention with the thing that matters.
- **Hand-written `<link rel="canonical">` per page.** One copy-paste into a new layout and two URLs claim to be canonical. Generate it from `page.url` or don't have it.
- **The cookie banner that appears after 800ms.** Every millisecond of that delay is CLS you pay for on every page view, forever. Fixed container or overlay — pick one.
- **JSON-LD that contradicts the page.** Structured data describing an author, date, or headline that isn't in the visible HTML is a spam signal, not an SEO trick.
- **Trusting `sizes="100vw"` everywhere.** A 300px sidebar thumbnail declared as `100vw` downloads the 1600px source. Get `sizes` right or the image plugin is decoration.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe your site: page types, content source, and the one metric you're failing, e.g. "Docs site, ~200 markdown pages, LCP 3.4s on mobile, hero image on every landing page."
3. Ask for, in order: (a) `eleventy.config.js` with the image shortcode and collections, (b) `head.njk` / `jsonld.njk` wired to the data cascade, (c) the budget script and its `package.json` hook, (d) sitemap and RSS templates.
4. Check every generated `<img>` for `width`, `height`, and a `sizes` value matching its real rendered width. This is where the remaining CLS and wasted bytes live.
5. Run section 4 as a checklist before deploying, then compare CrUX 28 days later — not Lighthouse the same afternoon.

The assistant should refuse to emit an `<img>` without dimensions, and should flag any client-side JavaScript that could be served as plain HTML.

## 6. Example Output

Prompt given with this skill loaded: *"Add a blog post layout. Each post has a hero image, needs Article structured data, and must not shift layout when the webfont swaps."* Expected shape of the answer:
```njk
{# posts.njk, layout: base.njk #}
{% include "jsonld.njk" %}
<article>
  <h1>{{ title }}</h1>
  <time datetime="{{ page.date.toISOString() }}">{{ page.date | readableDate }}</time>
  {# Hero: preloaded, high priority, never lazy, dimensions from the real file #}
  {% heroImg hero, heroAlt, "(min-width: 60rem) 60rem, 100vw" %}
  {{ content | safe }}
</article>
```

```js
// eleventy.config.js — the hero shortcode differs from the body one on purpose
eleventyConfig.addAsyncShortcode("heroImg", async (src, alt, sizes) => {
  const metadata = await Image(src, {
    widths: [640, 960, 1280, 1920], formats: ["avif", "webp", "jpeg"],
    outputDir: "./_site/img/", urlPath: "/img/",
  });
  return Image.generateHTML(metadata, {
    alt, sizes, fetchpriority: "high", decoding: "async",
    loading: "eager", // never lazy — this is the LCP element
  });
});
```

Note what the output does *not* contain: no `loading="lazy"` on the hero, no hand-written canonical, no inline `<script>`, no JSON-LD typed by a human. The dimensions come from the file on disk, the metadata comes from the cascade, and the only reason there are two image shortcodes is that the LCP element genuinely needs different flags from everything below it.
