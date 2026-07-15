---
title: Content Sites with Astro Skill
category: Website
description: Build content-driven sites that ship almost no JavaScript, without giving up React components where you actually need them. Covers islands architecture, typed content collections, image optimization, and the hydration decisions that separate a 40KB site from a 400KB one.
usage: Load this skill before asking your AI assistant to scaffold or extend an Astro site. Say "use the Astro content site skill" and describe your content model; the assistant will produce collection schemas, correctly-chosen client directives, and layouts that default to zero JS instead of copying React habits into .astro files.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 6
timeSavedHours: 16
pocUrl: https://github.com/withastro/astro
---

# Content Sites with Astro Skill

## 1. Philosophy

Most people arrive at Astro from Next.js and write Next.js with different file extensions. They put `client:load` on every component, import a state library on page one, then wonder why their blog ships 300KB of JavaScript to render text that never changes.

The mental model that actually works: **every component is server-rendered HTML until you explicitly pay to make it otherwise.** A `client:` directive is not a config detail — it is a purchase order. You are buying a framework runtime, a component bundle, and a hydration pass, billed to your user's phone on 4G. Astro's value is that the bill is itemized and opt-in.

Three rules govern everything below:

1. **No directive is the default answer.** Before adding `client:*`, ask: does this respond to an event, hold state, or change after paint? If not, it is HTML. A CSS-only dropdown, a pricing table, a footer, a highlighted code block — all zero JS. Most of a content site is zero JS.
2. **Islands are islands, not an archipelago pretending to be a continent.** Each hydrated component is an independent root with its own bundle. Two islands cannot share React context through the page — they are separate mounts. If you want shared state across islands, you need one bigger island, or you need to stop using components for that.
3. **Content is typed data, not files you happen to parse.** Frontmatter without a schema is a runtime error waiting for your build to go green and your page to render `undefined`. Define collections with zod on day one, not after the third typo'd `date`.

If a feature needs client-side routing, cross-page state, and a hydrated shell on every route, you may be building an app, not a content site. Astro is honest about that boundary; you should be too.

## 2. Tech Stack

- **Astro** — https://github.com/withastro/astro — licensed **MIT**. Static site builder with islands architecture, file-based routing, content collections, and optional SSR via adapters.
- **Zod** — re-exported by Astro's content layer (MIT), used for every schema below.
- **Sharp** — the default image optimization backend for `astro:assets` (Apache-2.0).
- **A UI framework, optionally** — React, Preact, Svelte, Solid, or Vue via official integrations. Pick exactly one. See anti-patterns.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Astro maintainers. All example code is original to this skill.

Recommended companions: TypeScript `strict` with `astro check` in CI, MDX only where you truly need components in prose, and a size budget in CI so the JS bill has a hard ceiling.

## 3. Patterns

### 3.1 The client directive decision table

The highest-leverage decision in an Astro codebase. Memorize it:

| Directive | Loads when | Use for |
|---|---|---|
| *(none)* | Never — server-rendered HTML only | Everything, until proven otherwise |
| `client:load` | Immediately on page load | Above-the-fold interactive: a search box used within 2 seconds |
| `client:idle` | On `requestIdleCallback` | Non-critical but always needed: theme toggle, copy-to-clipboard |
| `client:visible` | On `IntersectionObserver` entry | Anything below the fold: comments, carousel, map, chart |
| `client:media` | On media query match | Mobile-only nav drawer, desktop-only widget |
| `client:only` | Client, never server-rendered | Last resort — components touching `window` at module scope |

```astro
<TableOfContents headings={headings} />        <!-- zero JS: links built at build time -->
<ThemeToggle client:idle />                    <!-- small, always needed, not urgent -->
<CommentThread client:visible postId={post.id} /> <!-- heavy, below the fold -->
```

My rule of thumb: **`client:visible` is right about 60% of the time and nobody reaches for it.** A component below the fold has no business competing with your hero image for main-thread time.

### 3.2 Content collections with schemas that catch real mistakes

Do not write a permissive schema — `z.string()` for a date lets a build pass with `"2024-13-45"` in it.

```ts
// src/content.config.ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1).max(90),
      publishedAt: z.coerce.date(),   // coerce: YAML Date or string both work
      cover: image().optional(),      // validates the file EXISTS at build time
      coverAlt: z.string().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    })
    .refine((d) => !d.cover || !!d.coverAlt, {
      message: 'A post with a cover image must set coverAlt for accessibility.',
      path: ['coverAlt'],
    }),
});

export const collections = { posts };
```

Two details that pay for themselves in week two:

- `image()` is not cosmetic. It resolves the path relative to the entry, fails the build if the file is missing, and hands your component typed `width`/`height` — which is how you kill layout shift (§3.4).
- `.refine()` expresses rules a flat schema cannot ("cover requires alt"). Put content invariants in the schema, not in a review checklist.

Filter drafts **inside the `getCollection` callback** — `getCollection('posts', ({ data }) => !data.draft)` — not after, and gate on `import.meta.env.PROD` rather than commenting the filter in and out.

### 3.3 Passing props across the server/client boundary

Island props are serialized. This fails at runtime, not at type-check, which is why it bites.

```astro
<!-- WRONG: Dates, functions, class instances, Maps don't survive -->
<Widget client:load onSave={() => save()} publishedAt={post.data.publishedAt} />
<!-- RIGHT: serialize deliberately, keep behavior inside the island -->
<Widget client:load postId={post.id} publishedAtIso={post.data.publishedAt.toISOString()} />
```

Astro serializes island props to JSON embedded in the HTML. Three consequences nobody mentions:

1. **Functions cannot cross.** Handlers live inside the island. Parents learn things via custom events or a shared store — not prop callbacks.
2. **Props are visible in page source.** Never pass an API key, an unpublished draft body, or another user's data into an island.
3. **Big props are a hidden payload.** Passing a 40KB post body into an island to render one line ships 40KB twice. Pass the id; render the body in `.astro`.

### 3.4 Images: `astro:assets` and the CLS you didn't measure

```astro
---
import { Image, Picture } from 'astro:assets';
import hero from '../assets/hero.jpg'; // imported = dimensions known at build
---
<!-- Above the fold: eager, high priority, explicit sizes -->
<Image src={hero} alt="Warehouse floor at dawn" loading="eager" fetchpriority="high"
  widths={[480, 960, 1440]} sizes="(max-width: 768px) 100vw, 960px" />
<!-- Below the fold: lazy by default, modern formats -->
<Picture src={hero} formats={['avif', 'webp']} alt="Warehouse floor at dawn"
  widths={[480, 960]} sizes="(max-width: 768px) 100vw, 960px" />
```

- **Import local images; never reference them by string path.** An imported image carries intrinsic width/height, so Astro emits them and the browser reserves the box. `src="/hero.jpg"` reserves nothing and shoves the page down on load. That is CLS, and it's the most common Astro-site regression I see.
- **Remote images require `width`, `height`, and an `image.domains`/`remotePatterns` entry.** Astro can't infer dimensions over the network at build time, so it makes you say them.
- `loading="eager"` exactly once per page — the LCP image. Everything else lazy.

### 3.5 The SSR escape hatch, scoped

Static output is the default and should stay the default. When one route needs a request — a form POST, an OG image — do not flip the whole site to `output: 'server'`.

```js
// astro.config.mjs
export default defineConfig({
  output: 'static',              // prerender everything by default
  adapter: node({ mode: 'standalone' }),
  site: 'https://example.com',   // required for correct sitemap + canonical URLs
});
```

Then opt out exactly one route with `export const prerender = false` in its frontmatter. Two routes opting out keeps 98% of your site as files on a CDN. Flipping the global default because one contact form needed a POST handler is how a static site quietly becomes a server you keep alive at 3am.

### 3.6 Knowing what you actually shipped

Don't trust vibes. After `astro build`, the output tells the truth — `find dist -name '*.js' -exec du -h {} + | sort -rh | head` is the whole audit.

A pure content site should produce **zero or near-zero** JS chunks. A 140KB `react-dom` chunk on your About page means an island leaked into a layout — usually a `<ThemeToggle client:load />` in `BaseLayout.astro`, hydrating on every route including the 404. Wire that same `find` into CI, summed with `awk` and compared against a hard byte ceiling (60KB is a realistic starting line for a blog), so the job exits non-zero when a new island blows the budget. A number in CI is the only thing that stops JS creep; a review comment is not.

## 4. Anti-patterns

- **`client:load` on everything.** The directive is a purchase order, not a boilerplate token. No events and no state means no directive. Below the fold means `client:visible`. `client:load` is for the search box, not the footer.
- **An island in the base layout.** One `client:load` in `BaseLayout.astro` hydrates the framework runtime on every page of the site, including the 404. Layouts should be the most zero-JS files in the repo.
- **Mixing React and Vue and Svelte "because the integration exists".** Every framework ships its own runtime. Two on one page is two runtimes downloaded, parsed, executed. Pick one; enforce it in review.
- **`client:only` as a fix for a hydration error.** It doesn't fix the mismatch — it deletes your server-rendered HTML, so content is invisible to crawlers and blank until JS runs. Reserve it for components that genuinely can't server-render; fix mismatches by moving `window` access into an effect.
- **String paths for local images.** `<img src="/hero.jpg">` has no intrinsic dimensions and reserves no space. Import the image and let `astro:assets` emit width/height. Unsized images are the #1 source of CLS on Astro sites.
- **Frontmatter without a schema.** `z.string()` for a date, no required alt text — then a typo ships `Invalid Date` to production and the build was green the whole way.
- **Passing functions or Dates as island props.** Props are JSON-serialized into the HTML. Functions vanish, Dates become strings, and every prop is publicly readable page source.
- **Assuming MDX and Markdown behave the same.** MDX parses JSX, so a bare `<` or `{` in prose is a syntax error. Use `.md` for prose; reach for `.mdx` only where you actually embed components.
- **Global `output: 'server'` for one dynamic route.** You traded a CDN for a server you now operate — and `site` left unset on top of it means sitemap URLs, canonical tags, and RSS feeds silently generate as `localhost`, which nobody notices until search console does. Use `export const prerender = false` per route, and always set `site`.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / a Cursor rule).
2. Describe your content model and interactivity in plain sentences, e.g. "Marketing site + blog. Posts have title, date, cover image, tags. Blog index needs client-side tag filtering. Header has a theme toggle. Post pages have comments at the bottom."
3. Ask for, in order: (a) `src/content.config.ts` with zod schemas including `image()` and `.refine()` invariants, (b) the page/layout `.astro` files with an explicit justification for every `client:*` directive, (c) `astro.config.mjs` with `site` set and any per-route `prerender = false`.
4. Audit directive choices against the table in §3.1 — the assistant must name a reason for each. "Below the fold" means `client:visible`, not `client:load`.
5. Run `astro build`, check the JS output, and run §4 as a checklist before merging.

The assistant should default to no client directive, refuse to add a second UI framework, and flag any local image referenced by string path.

## 6. Example Output

Prompt given with this skill loaded: *"Add a tag-filterable blog index. Show cover images. Filtering should be instant, no page reload."* Expected shape of the answer — note the split between server-rendered content and one narrow island:

```astro
---
// src/pages/blog/index.astro
const posts = (await getCollection('posts', ({ data }) => !data.draft))
  .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
const tags = [...new Set(posts.flatMap((p) => p.data.tags))].sort();
---
<BaseLayout title="Blog">
  <!-- The only island: the filter control. -->
  <TagFilter client:idle tags={tags} />
  <!-- Cards are server-rendered HTML. Filtering toggles visibility. -->
  <ul class="grid">
    {posts.map((post) => (
      <li data-tags={post.data.tags.join(' ')}>
        <a href={`/blog/${post.id}/`}>
          {post.data.cover && (
            <Image src={post.data.cover} alt={post.data.coverAlt!}
              widths={[320, 640]} sizes="(max-width: 768px) 100vw, 320px" />
          )}
          <h2>{post.data.title}</h2>
        </a>
      </li>
    ))}
  </ul>
</BaseLayout>
```

```tsx
// src/components/TagFilter.tsx — the entire client-side surface area
export default function TagFilter({ tags }: { tags: string[] }) {
  const [active, setActive] = useState<string | null>(null);
  function apply(tag: string | null) {
    setActive(tag);
    // The cards are not React. Reach out and toggle them.
    document.querySelectorAll<HTMLElement>('li[data-tags]').forEach((li) => {
      li.hidden = !(!tag || li.dataset.tags?.split(' ').includes(tag));
    });
  }
  return (
    <div role="group" aria-label="Filter posts by tag">
      <button aria-pressed={active === null} onClick={() => apply(null)}>All</button>
      {tags.map((t) => (
        <button key={t} aria-pressed={active === t} onClick={() => apply(t)}>{t}</button>
      ))}
    </div>
  );
}
```

Note what the output does *not* contain: the post cards are not React components, so no post data crosses the serialization boundary and no list re-renders. The island is one row of buttons, and the 200-post index still ships as static HTML that renders with JS disabled. That is the whole point.
