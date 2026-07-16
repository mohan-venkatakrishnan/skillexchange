---
title: SaaS Backend with Supabase Skill
category: Coding
description: Ship a production-grade SaaS backend on Supabase without writing a custom API server. Covers Postgres schema design, Row Level Security done right, auth, realtime subscriptions, and storage with signed URLs.
usage: Load this skill before asking your AI assistant to design or build any Supabase-backed feature. Say "use the Supabase SaaS backend skill" and describe your product; the assistant will produce schema, RLS policies, and client code that follow these patterns instead of generic tutorials.
platforms: [Claude, ChatGPT, Cursor, Gemini]
priceUsd: 0
timeSavedHours: 20
pocUrl: https://github.com/supabase/supabase
---

# SaaS Backend with Supabase Skill

## 1. Philosophy

Most Supabase tutorials teach you to treat it like Firebase-with-SQL. That is how you end up with a database anyone can read with a copied anon key. This skill teaches the opposite mental model:

**The database IS the API, and RLS IS the authorization layer.** Every table is exposed to the public internet the moment you create it through the auto-generated REST interface. Your job is not to hide tables behind a server — it is to write policies so precise that exposing them is safe.

Three rules govern everything below:

1. **RLS on before first insert.** A table without RLS enabled is a public table. Enable RLS in the same migration that creates the table, always, even for "internal" tables. A table with RLS enabled and zero policies is invisible to clients — that is the correct default, and you open access policy by policy.
2. **Authorization lives in SQL, not in client code.** An `if (user.id === row.owner_id)` check in React is decoration. The only check that counts is the one Postgres runs. Client-side checks are for UX (hiding buttons), never for security.
3. **Server-only work goes through the service role, and the service role never touches a browser.** Webhooks, cron jobs, admin panels, and cross-tenant aggregation use the `service_role` key from an Edge Function or your own server. If you ever feel tempted to ship it to a client, you have a schema-design problem, not a key-distribution problem.

If a feature cannot be expressed as "authenticated user operating on rows they are entitled to," pull it out of the client path and into an Edge Function.

## 2. Tech Stack

- **Supabase** — https://github.com/supabase/supabase — licensed **Apache-2.0**. Postgres hosting, auto-generated REST (PostgREST), auth (GoTrue), realtime, storage, and Edge Functions in one platform.
- **supabase-js** — the official TypeScript client (MIT), used in all examples below.
- **Postgres 15+** — the actual product. Everything Supabase adds is a thin, inspectable layer over vanilla Postgres.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Supabase maintainers. All example code is original to this skill.

Recommended companions: TypeScript strict mode, `supabase` CLI for local dev and migrations (`supabase db diff` to generate, checked into git), and Zod for validating anything that arrives from outside the type system.

## 3. Patterns

### 3.1 Schema: tenancy first, features second

Decide your tenancy unit before writing any table. For B2B SaaS it is almost always an `org`, not a `user`. Every domain table carries `org_id` so RLS can be uniform.

```sql
create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  primary key (org_id, user_id)
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table orgs enable row level security;
alter table org_members enable row level security;
alter table projects enable row level security;
```

### 3.2 The membership helper function

Write the "is this user in this org" check once, as a `security definer` function, so every policy stays one line and the planner can inline it. Mark it `stable` so Postgres caches it per statement.

```sql
create or replace function private.is_org_member(check_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members
    where org_id = check_org
      and user_id = (select auth.uid())
  );
$$;
```

Two details that matter and that generic tutorials omit:

- `set search_path = ''` on every `security definer` function. Without it, a caller can hijack the function via a crafted schema.
- `(select auth.uid())` instead of bare `auth.uid()` inside policies and helpers — the subselect form lets Postgres treat it as an initplan evaluated once per statement rather than once per row. On a 100k-row scan this is the difference between 20ms and 2s.

### 3.3 RLS policies: one per verb, named like sentences

```sql
create policy "members can read org projects"
  on projects for select
  using (private.is_org_member(org_id));

create policy "members can create org projects"
  on projects for insert
  with check (private.is_org_member(org_id));

create policy "admins can update org projects"
  on projects for update
  using (
    exists (
      select 1 from org_members m
      where m.org_id = projects.org_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  );
```

Rules of thumb:

- `select` policies use `using`. `insert` uses `with check`. `update` needs both when the row can move between tenants (it usually should not — see anti-patterns).
- Never write one `for all` mega-policy. Per-verb policies read like an access-control spec and diff cleanly in code review.
- Test policies with `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}';` in a SQL scratchpad before trusting them.

### 3.4 Auth: metadata is not authorization

Supabase auth gives you `raw_user_meta_data` (user-editable via `updateUser`) and `raw_app_meta_data` (server-only). The pattern:

- Profile fluff (display name, avatar) → a `profiles` table keyed on `auth.users.id`, created by a trigger on signup.
- Anything a policy depends on (role, plan, org membership) → real tables, never metadata. Metadata in JWTs goes stale until refresh; rows do not.

```sql
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', 'New user'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
```

### 3.5 Realtime: subscribe narrow, authorize in the database

Realtime respects RLS when you enable it per table, but broad subscriptions still cost you. Subscribe to the narrowest filter the feature needs:

```ts
const channel = supabase
  .channel(`project:${projectId}`)
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
    (payload) => applyTaskPatch(payload.new)
  )
  .subscribe()

// Always clean up — leaked channels are the #1 realtime bug in React apps.
return () => { supabase.removeChannel(channel) }
```

For presence and ephemeral state (cursors, "who's typing"), use broadcast channels, not database writes. The database is for facts, not heartbeats.

### 3.6 Storage: private buckets + signed URLs, always

Public buckets are for marketing assets only. User content lives in private buckets with path-based policies, and clients get time-limited signed URLs.

```sql
create policy "users manage own upload folder"
  on storage.objects for all
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
```

```ts
const { data, error } = await supabase.storage
  .from('user-files')
  .createSignedUrl(`${userId}/reports/q3.pdf`, 60 * 10) // 10 minutes
```

Convention: first path segment is always the owning user or org id. It makes every storage policy a one-liner.

### 3.7 Edge Functions for the three legitimate server jobs

You need server-side code for exactly three things: third-party webhooks (Stripe, Resend), privileged multi-row operations (admin dashboards, cross-tenant reports), and secrets you cannot expose (API keys to other services). Everything else goes through RLS-guarded client calls.

```ts
// supabase/functions/stripe-webhook/index.ts
import Stripe from 'npm:stripe'
import { createClient } from 'npm:@supabase/supabase-js'

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
  const sig = req.headers.get('stripe-signature')!
  const event = await stripe.webhooks.constructEventAsync(
    await req.text(), sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!
  )

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // service role: this code never runs in a browser
  )

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    await admin.from('subscriptions').upsert({
      org_id: session.metadata!.org_id,
      stripe_customer_id: session.customer as string,
      status: 'active',
    })
  }
  return new Response('ok')
})
```

Verify the webhook signature before touching the database. No signature check, no write.

## 4. Anti-patterns

- **"I'll add RLS later."** Later is after the breach. RLS goes in the same migration as `create table`, no exceptions.
- **Service role key in `NEXT_PUBLIC_*` / `VITE_*` env vars.** Any env var with a public prefix ships to the browser. The service role bypasses every policy you wrote.
- **Authorization via `user_metadata`.** Users can edit their own `user_metadata` through the API. A policy reading `auth.jwt() -> 'user_metadata' ->> 'role'` is a privilege-escalation kit.
- **One `for all using (true)` policy "to get it working."** You have re-created a public database with extra steps. Delete it and write real per-verb policies.
- **Bare `auth.uid()` in policies on large tables.** Per-row re-evaluation. Wrap it: `(select auth.uid())`.
- **Joining in policies against un-indexed columns.** Every RLS policy runs on every query. Index `org_members (user_id, org_id)` and every `org_id` foreign key or watch p95 latency triple as data grows.
- **Fetching then filtering client-side.** `select('*')` followed by a JS `.filter()` means you shipped rows the user should never see over the wire. RLS protects you here, but if RLS is why the filter "works," your query is wrong.
- **Using the database as a queue with polling.** Use `pg_cron` + Edge Functions or realtime triggers. A `setInterval` hitting PostgREST every second across 500 clients is a self-inflicted DDoS.
- **Skipping local dev.** `supabase start` gives you the full stack in Docker. Testing RLS against production data is how policies get "temporarily" disabled.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe your product's entities and who can do what to them, e.g. "Invoicing SaaS: orgs have members (owner/accountant/viewer); invoices belong to orgs; only owners and accountants can create; everyone in the org can read."
3. Ask for, in order: (a) the migration SQL with RLS enabled and policies, (b) the typed supabase-js client calls, (c) Edge Functions for any webhook/privileged paths.
4. Review the policies against the access-control sentences from step 2 — every policy name should map to one sentence.
5. Run the anti-pattern list in section 4 as a checklist before deploying.

The assistant should refuse to generate a table without RLS and should flag any design that would require the service role key in a client.

## 6. Example Output

Prompt given with this skill loaded: *"Add commenting to projects. Any org member can comment; only the author can edit or delete their comment."*

Expected shape of the answer:

```sql
create table comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  author_id uuid not null default (select auth.uid()) references auth.users(id),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table comments enable row level security;

create policy "members can read org comments"
  on comments for select using (private.is_org_member(org_id));
create policy "members can write comments as themselves"
  on comments for insert
  with check (private.is_org_member(org_id) and author_id = (select auth.uid()));
create policy "authors can edit own comments"
  on comments for update using (author_id = (select auth.uid()));
create policy "authors can delete own comments"
  on comments for delete using (author_id = (select auth.uid()));

create index comments_project_created_idx on comments (project_id, created_at desc);
```

```ts
const { data: comments } = await supabase
  .from('comments')
  .select('id, body, created_at, author:profiles(display_name)')
  .eq('project_id', projectId)
  .order('created_at', { ascending: false })
  .limit(50)
```

Note what the output does *not* contain: no Express route, no manual auth middleware, no client-side ownership check pretending to be security. The database is the API.
