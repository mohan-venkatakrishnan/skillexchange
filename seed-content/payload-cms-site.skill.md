---
title: CMS-Backed Sites with Payload Skill
category: Website
description: Build content sites where the CMS is TypeScript in your repo, not clicks in someone else's admin panel. Covers collections and globals, access control as real authorization, block-based page building, drafts and preview, hooks, and the Local API for server rendering with zero network hops.
usage: Load this skill before asking your AI assistant to design or extend any Payload-backed site. Say "use the Payload CMS site skill" and describe your content model and who edits what; the assistant will produce config-as-code collections, access functions, and block schemas instead of a WYSIWYG dump in a rich-text field named "content".
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 22
pocUrl: https://github.com/payloadcms/payload
---

# CMS-Backed Sites with Payload Skill

## 1. Philosophy

The reason your last CMS project rotted is that the content model lived in a hosted admin UI. Someone added a field on a Tuesday, nobody reviewed it, the types drifted, and there was no way to know production's schema without logging in to look. Payload's answer: **the content model is source code** — a TypeScript config, in the repo, reviewed in a PR, deployed with the app.

**Second thesis: content is structured data, not a blob of HTML.** A single rich-text field called `content` is a WYSIWYG editor cosplaying as a schema. It cannot be redesigned, cannot re-render on another surface, and will contain a `<div style="color:#f0f">` within six weeks.

Three rules govern everything below:
1. **Access control is the authorization layer, and it defaults open.** Every collection is exposed over REST and GraphQL the moment you define it. A collection with no `access` object is readable by the internet. Write access functions in the same commit that creates the collection.
2. **Generated types are checked into git.** `payload-types.ts` is a build artifact, but it is also the diff that shows a reviewer someone changed the content model. Commit it; fail CI when it is stale.
3. **On the server, use the Local API.** Payload runs in your app's Node process. Calling your own REST endpoint over HTTP to render a page is a self-inflicted network hop, a serialization round-trip, and an auth header to manage.

If an editor can break the layout by choosing the wrong option, the schema is wrong — not the editor.

## 2. Tech Stack

- **Payload** — https://github.com/payloadcms/payload — licensed **MIT**. Headless CMS defined in TypeScript config: collections, fields, access control, hooks, admin UI, REST + GraphQL + Local API.
- **Next.js (App Router)** — **MIT** — Payload 3 installs into a Next app and shares its process, which is what makes the Local API a function call instead of a fetch.
- **Postgres or MongoDB** via the official adapters (**MIT**). Postgres if the content has real relational shape and you want migrations you can read; Mongo if the model is deeply nested and churning.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Payload maintainers. All example code is original to this skill.

Recommended companions: S3-compatible object storage for media in production, `sharp` for resizing, and TypeScript strict mode — generated types are the whole payoff and `any` throws it away.

## 3. Patterns

### 3.1 Collections vs globals: cardinality is the whole test

**Collection** = many of a thing, each with its own URL or lifecycle: pages, posts, authors. **Global** = exactly one, forever: site settings, main nav, footer. The mistake is a `Settings` *collection* with one row and a comment saying "don't add more." Editors will add more. Use a global; then it can't happen.
```ts
// src/collections/Pages.ts
export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', '_status', 'updatedAt'] },
  versions: { drafts: true },
  access: { read: publishedOrEditor, create: isEditor, update: isEditor, delete: isAdmin },
  hooks: { beforeChange: [ensureSlug], afterChange: [purgeCache] },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', unique: true, index: true, admin: { position: 'sidebar' } },
    { name: 'layout', type: 'blocks', blocks: [Hero, RichTextBlock, CardGrid, CTA] },
  ],
}
```

### 3.2 Access functions are your authorization layer

An access function returns `true`, `false`, or — the powerful case — a **query constraint** Payload merges into every read. That is row-level security without writing SQL.
```ts
// src/access/index.ts
export const isAdmin: Access = ({ req: { user } }) => user?.role === 'admin'
export const isEditor: Access = ({ req: { user } }) =>
  user?.role === 'admin' || user?.role === 'editor'

// Anonymous visitors see published docs only; editors see everything.
export const publishedOrEditor: Access = ({ req: { user } }) => {
  if (user?.role === 'admin' || user?.role === 'editor') return true
  return { _status: { equals: 'published' } } // ← constraint, not a boolean
}

// Authors may only touch their own drafts.
export const ownDraftsOnly: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'admin') return true
  return { and: [{ author: { equals: user.id } }, { _status: { not_equals: 'published' } }] }
}
```
The constraint form is not sugar. `return true` plus a `where` clause in your query is a filter an attacker deletes from the URL; the access constraint applies on every read path — REST, GraphQL, Local API, admin — and no request param overrides it.

Field-level access is the half people forget: `{ name: 'internalNotes', type: 'textarea', access: { read: isEditor } }`. Without it, `internalNotes` is on your public JSON. The field renders nowhere and ships everywhere.

### 3.3 Blocks: a page builder that cannot produce garbage

Each block is a typed schema with its own fields and its own component. Editors compose; they don't style.
```ts
// src/blocks/CardGrid.ts
export const CardGrid: Block = {
  slug: 'cardGrid',
  interfaceName: 'CardGridBlock', // names the generated TS type — do this on every block
  fields: [
    { name: 'heading', type: 'text' },
    // not a number input: seven columns is not a design you own
    { name: 'columns', type: 'select', options: ['2', '3', '4'], defaultValue: '3', required: true },
    {
      name: 'cards',
      type: 'array',
      minRows: 2,
      maxRows: 12, // an unbounded array is an unbounded layout
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'body', type: 'textarea', maxLength: 180 },
        { name: 'icon', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}
```
Render with an exhaustive switch, so a new block can't silently render nothing:
```tsx
export function RenderBlocks({ blocks }: { blocks: Page['layout'] }) {
  return <>{blocks?.map((block, i) => {
    switch (block.blockType) {
      case 'hero': return <Hero key={i} {...block} />
      case 'cardGrid': return <CardGrid key={i} {...block} />
      case 'richText': return <RichText key={i} content={block.content} />
      default: {
        const _exhaustive: never = block // a block with no renderer = type error
        return null
      }
    }
  })}</>
}
```

### 3.4 Rich text is JSON. You are writing a serializer.

This surprises everyone once. The editor stores a node tree, not an HTML string. There is no `dangerouslySetInnerHTML` shortcut — and that is correct, because it's why the same content renders into React, RSS, and plain text. Budget half a day, write it once, treat unknown nodes as loud dev failures:
```tsx
type Node = { type: string; text?: string; format?: number; children?: Node[]; [k: string]: unknown }

function renderNodes(nodes: Node[] = []): React.ReactNode {
  return nodes.map((node, i) => {
    if (node.type === 'text') {
      let el: React.ReactNode = node.text
      if (node.format! & 1) el = <strong>{el}</strong>
      if (node.format! & 2) el = <em>{el}</em>
      return <span key={i}>{el}</span>
    }
    const kids = renderNodes(node.children)
    switch (node.type) {
      case 'paragraph': return <p key={i}>{kids}</p>
      case 'heading': return React.createElement(String(node.tag ?? 'h2'), { key: i }, kids)
      case 'list': return node.listType === 'number' ? <ol key={i}>{kids}</ol> : <ul key={i}>{kids}</ul>
      case 'listitem': return <li key={i}>{kids}</li>
      case 'link': return <a key={i} href={String((node.fields as any)?.url)}>{kids}</a>
      case 'upload': return <MediaFigure key={i} value={node.value} />
      default:
        if (process.env.NODE_ENV !== 'production') console.warn('Unhandled node:', node.type)
        return kids
    }
  })
}
```

### 3.5 The Local API: stop fetching yourself over HTTP
```tsx
// app/(site)/[slug]/page.tsx
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { isEnabled: draft } = await draftMode()
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    draft,                 // pull the unpublished version when previewing
    overrideAccess: false, // ← default is TRUE and bypasses access control
    depth: 1,              // resolve relationships one level, no deeper
    limit: 1,
  })
  if (!docs[0]) notFound()
  return <RenderBlocks blocks={docs[0].layout} />
}
```
`overrideAccess: false` is the line to burn into memory. The Local API runs privileged by default — sensible for scripts, catastrophic on a public route, where it means unpublished drafts render to anyone who guesses a slug. Keep REST/GraphQL for genuinely external consumers; never for your own SSR.

### 3.6 Hooks for slugs and cache invalidation
```ts
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)

// Generate once, on create. Re-slugging on update silently 404s a live URL and
// every backlink to it. Renames are a redirect, not a mutation.
export const ensureSlug: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  if (operation === 'create' && !data.slug && data.title) data.slug = slugify(data.title)
  else if (operation === 'update') data.slug = originalDoc?.slug ?? data.slug
  return data
}

export const purgeCache: CollectionAfterChangeHook = ({ doc, previousDoc, req }) => {
  if (doc._status !== 'published') return doc // don't purge for autosaved drafts
  revalidatePath(`/${doc.slug}`)
  if (previousDoc?.slug && previousDoc.slug !== doc.slug) revalidatePath(`/${previousDoc.slug}`)
  revalidateTag('nav')
  req.payload.logger.info(`revalidated /${doc.slug}`)
  return doc
}
```
`beforeChange` mutates data on its way in — slugs, denormalized fields. `afterChange` reacts to a committed write — cache purges, search indexing. Never put a slow network call in `beforeChange`; you are holding the editor's save button hostage.

### 3.7 Drafts, versions, and a preview that isn't a lie
```ts
versions: {
  drafts: { autosave: { interval: 800 } },
  maxPerDoc: 25, // versions are rows; unbounded history is an unbounded table
},
admin: { livePreview: { url: ({ data }) => `${process.env.NEXT_PUBLIC_SITE_URL}/${data.slug}` } },
```
The preview route validates a secret, enables draft mode, redirects. The rule that keeps it honest: **preview renders through the exact same page component as production**, with `draft: true` passed to `find`. A bespoke preview renderer is a second codebase that will disagree with the first one on the day it matters.

### 3.8 Media, image sizes, and migrations
```ts
export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    imageSizes: [
      { name: 'thumb', width: 320, height: 320, position: 'centre' },
      { name: 'card', width: 768 },
      { name: 'hero', width: 1920 },
    ],
    focalPoint: true,
    mimeTypes: ['image/*'],
  },
  access: { read: () => true, create: isEditor, update: isEditor, delete: isAdmin },
  fields: [{ name: 'alt', type: 'text', required: true }], // accessibility is not a nice-to-have
}
```
Define sizes up front — they are generated at upload time, so adding `hero` in month four means every existing image lacks it until you reprocess the library. Use object storage anywhere that isn't your laptop; a serverless filesystem is not a filesystem. On Postgres, generate and commit a migration for every schema change; push-mode auto-sync is a dev convenience that will one day quietly drop a production column.

## 4. Anti-patterns

- **A collection with no `access` object.** It is world-readable and possibly world-writable. Access functions ship in the same commit as the collection — not in the hardening ticket that never gets prioritized.
- **`overrideAccess` left at its default in a public route.** The Local API runs as god by default. On a public page that means unpublished drafts and internal fields render to strangers.
- **One rich-text field named `content`.** You re-invented a `.doc` file with a database bill. Blocks, or accept that the redesign in two years is a manual re-typing project.
- **`depth: 5` because a relationship came back as an id.** Each level is another resolution pass across every doc in the result. A 20-item list at depth 5 is a query storm. Use `depth: 0`–`1` and `select` the fields you render.
- **Free-text where a select belongs.** An editor types "three" and the grid collapses. Constrain with `options`, `min/maxRows`, `maxLength`. The schema is the guardrail.
- **Re-slugging on update.** Editor fixes a title typo, the URL changes, the page 404s, every inbound link dies.
- **Skipping field-level access on internal fields.** Absence from the template is not absence from the payload.
- **Uncommitted `payload-types.ts`.** Nobody can review a content-model change and CI can't catch drift.
- **Calling your own REST API from your own server component.** Same process, and you chose an HTTP round-trip plus token handling.
- **A custom preview renderer.** Two codebases, one exercised only by editors, drifting until "it looked fine in preview" becomes a support ticket.

## 5. Usage

1. Paste this skill into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. State your database (Postgres vs Mongo) and role model up front — access functions are the bulk of the config and depend entirely on roles.
3. Describe the content model as cardinality + permissions, e.g. "Pages (many, block-based, editors publish); Site Settings (one global, admin only); Posts (many, authors draft, editors publish)."
4. Ask for, in order: (a) `payload.config.ts` with collections, globals, and the DB adapter, (b) `src/access/` with one named function per rule, (c) block schemas plus renderers and the exhaustive switch, (d) hooks for slugs and revalidation, (e) the server-rendered page using the Local API with `overrideAccess: false`.
5. Run section 4 as a pre-launch checklist. Then hit your public REST endpoint logged out and read the raw JSON — that is the real test of access control, not what the admin UI shows you.

The assistant should refuse to define a collection without access functions, propose blocks before a rich-text field, and flag any Local API call in a public route missing `overrideAccess: false`.

## 6. Example Output

Prompt given with this skill loaded: *"Add a Case Studies collection. Editors draft and publish; the public sees published only. Each has a client name, a hero image, and a block-based body. The index page lists them newest first."*

Expected shape of the answer:
```ts
// src/collections/CaseStudies.ts
export const CaseStudies: CollectionConfig = {
  slug: 'case-studies',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'client', '_status', 'publishedAt'] },
  versions: { drafts: { autosave: { interval: 800 } }, maxPerDoc: 25 },
  access: { read: publishedOrEditor, create: isEditor, update: isEditor, delete: isAdmin },
  hooks: { beforeChange: [ensureSlug], afterChange: [purgeCache] },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 120 },
    { name: 'slug', type: 'text', unique: true, index: true, admin: { position: 'sidebar' } },
    { name: 'client', type: 'text', required: true },
    { name: 'heroImage', type: 'upload', relationTo: 'media', required: true },
    { name: 'publishedAt', type: 'date', admin: { position: 'sidebar' } },
    { name: 'layout', type: 'blocks', minRows: 1, blocks: [Hero, RichTextBlock, CardGrid, CTA] },
    { name: 'dealSize', type: 'number', access: { read: isEditor, update: isEditor } },
  ],
}
```
```tsx
// app/(site)/work/page.tsx
export default async function WorkIndex() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'case-studies',
    overrideAccess: false, // publishedOrEditor now constrains this query
    depth: 1,              // resolve heroImage, nothing deeper
    select: { title: true, slug: true, client: true, heroImage: true },
    sort: '-publishedAt',
    limit: 24,
  })
  return (
    <ul className="grid">
      {docs.map((cs) => (
        <li key={cs.id}>
          <a href={`/work/${cs.slug}`}>
            <img src={cs.heroImage?.sizes?.card?.url} alt={cs.heroImage?.alt} />
            <h3>{cs.title}</h3><p>{cs.client}</p>
          </a>
        </li>
      ))}
    </ul>
  )
}
```
Note what the output does *not* contain: no `where: { _status: { equals: 'published' } }` in the index query — that constraint comes from the access function, so it applies to REST, GraphQL, and every future page anyone writes. No `dangerouslySetInnerHTML`, because rich text is a node tree. And no `dealSize` in the public JSON, because field-level access strips it before serialization, not before rendering. The config is the spec.
