---
title: Analytics Engineering with dbt Skill
category: Data
description: Build a dbt project that survives contact with real data — layered models, incremental logic that handles late-arriving rows, snapshots, and tests that catch breakage before your CEO does. Covers staging/intermediate/mart discipline, sources and freshness, merge vs. delete+insert, contracts, and slim CI with state:modified+.
usage: Load this skill before asking your AI assistant to design a dbt project, write or debug an incremental model, or add tests to an existing warehouse. Say "use the dbt analytics engineering skill" and describe your sources and the grain you need; the assistant will produce layered models with declared grain, tests, and incremental logic that stays correct on late-arriving data.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 24
pocUrl: https://github.com/dbt-labs/dbt-core
---

# Analytics Engineering with dbt Skill

## 1. Philosophy

dbt is not a SQL runner with Jinja. It is a compiler that turns a folder of `SELECT` statements into a dependency graph, and it earns its keep only if you feed it a graph worth compiling. Teams that skip that part end up with 400 models, a nine-hour run, and a `revenue` number three dashboards disagree about.

**Every model is a contract about a grain, and the DAG is the only documentation anyone will ever read.** A model that cannot answer "what is one row here?" in one sentence is not a model, it is a query someone saved.

1. **One model, one grain, stated in the config.** `one row per order`. If the sentence needs an "and also," you have two models. Grain confusion is the root cause of nearly every fan-out bug and double-counted metric in analytics.
2. **`ref()` or it doesn't exist.** Hardcoding a schema name severs the DAG. dbt builds in the wrong order, and `--select state:modified+` silently misses the model your change actually broke.
3. **Tests are the deploy gate, not the documentation.** `unique` + `not_null` on every grain key is non-negotiable — it is the automated form of rule 1. An untested model is a promise you made and cannot keep.

If you are debugging a number, the question is never "what's wrong with this SQL." It is "at what layer did the grain change without anyone declaring it."

## 2. Tech Stack

- **dbt-core** — https://github.com/dbt-labs/dbt-core — licensed **Apache-2.0**. Compiles templated SQL into a DAG, materializes it in your warehouse, tests the result.
- **A warehouse adapter** — Snowflake, BigQuery, Postgres, Databricks, DuckDB. Examples are ANSI-ish; incremental strategies differ per adapter and I flag where.
- **A utility package** — community `dbt_utils`-style helpers (`expression_is_true`, `unique_combination_of_columns`). Pin the version in `packages.yml`.

This skill is an independent, original guide; it is not affiliated with or endorsed by the dbt-core maintainers. All example models, YAML, and timings are original to this skill and drawn from projects I have run in production.

Recommended companion: `sqlfluff` with the dbt templater in pre-commit.

## 3. Patterns

### 3.1 The three layers, and what each is forbidden from doing

Layering is not aesthetic. Each layer exists so a specific kind of change has exactly one place to happen.

**Staging** — one model per source table, 1:1, `stg_<source>__<entity>`. Permitted: renaming, casting. **Forbidden: joins, aggregation, business logic.** Views; they cost nothing and always reflect the source.

```sql
-- models/staging/stripe/stg_stripe__charges.sql
{{ config(materialized='view') }}
with source as (select * from {{ source('stripe', 'charges') }}),
renamed as (
    select
        id                            as charge_id,
        customer                      as customer_id,
        amount                        as amount_cents,   -- cents, integer, forever
        status                        as charge_status,
        cast(created as timestamp)    as created_at,
        cast(_synced_at as timestamp) as synced_at
    from source
    where not coalesce(_deleted, false)
)
select * from renamed
```

That `select * from {{ source(...) }}` CTE is the only place a raw table name may appear in your project. This one rule makes a source rename a one-file change instead of a two-day grep.

**Intermediate** — `int_<entity>_<verb>`. Where joins happen, where grain legitimately changes, where a shared calculation lives so two marts can't drift. Ephemeral unless reused 3+ times. **Never exposed to BI.**

**Marts** — `fct_<event>` / `dim_<entity>`. The only layer outsiders touch. **Forbidden: referencing a source directly, or referencing another mart.** If a mart needs a mart, that logic belongs in an intermediate model. The failure this prevents is specific: a project where `fct_revenue` selects from `fct_orders`, which selects from `fct_sessions`. I watched one `where` clause edit in a five-mart chain shift a board-reported ARR figure by 4%, and nobody could explain why for two days.

### 3.2 Sources and freshness: fail on stale, don't compute on stale

```yaml
sources:
  - name: stripe
    schema: raw_stripe
    loaded_at_field: _synced_at
    freshness:
      warn_after:  {count: 2, period: hour}
      error_after: {count: 8, period: hour}
    tables:
      - name: charges
        columns:
          - name: id
            data_tests: [unique, not_null]
      - name: customers
        freshness:                    # per-table override; this one syncs nightly
          warn_after:  {count: 26, period: hour}
          error_after: {count: 48, period: hour}
```

Run freshness **before** the build and let it fail the job:

```bash
dbt source freshness || { echo "stale sources — refusing to build"; exit 1; }
dbt build --select state:modified+
```

The alternative is the failure every data team learns the hard way: the loader dies at 02:00, dbt runs happily at 04:00 on yesterday's data, and the 09:00 exec dashboard shows a 60% revenue drop. Two hours of incident response for something freshness catches in eleven seconds. **A build on stale data is worse than no build** — no build is visibly broken, a stale build is confidently wrong.

### 3.3 ref(), the DAG, and the CI failure you won't see

```sql
select * from analytics.dbt_prod.stg_stripe__charges   -- wrong: invisible to the DAG
select * from {{ ref('stg_stripe__charges') }}         -- right
```

`ref()` does three things at once and you lose all three together. **Ordering:** dbt topologically sorts the DAG; a hardcoded name builds in arbitrary order, sometimes reading *yesterday's* table. **Environment routing:** in dev, `ref()` resolves to your personal schema — hardcode it and your dev run reads, possibly writes, production. **Impact selection:** `state:modified+` traverses the DAG, so a severed edge means CI tests the model you changed and *not* the mart your change broke. It goes green. It ships. That last one is the dangerous one: no error, just a suite that passes while quietly not covering your change. Use `{{ source() }}` upstream of your project, `{{ ref() }}` everywhere else. If you want a third option, you want a source declaration you haven't written yet.

### 3.4 Incremental models: the parts that are actually hard

The `is_incremental()` shape is easy. The correctness is not.

```sql
{{ config(
    materialized='incremental',
    unique_key='event_id',
    incremental_strategy='merge',
    on_schema_change='append_new_columns',
    partition_by={'field': 'event_date', 'data_type': 'date'}
) }}
with events as (
    select * from {{ ref('stg_app__events') }}
    {% if is_incremental() %}
      -- Look back 3 days, not "since max". This is the whole ballgame.
      where event_at >= (
          select coalesce(max(event_at), '1900-01-01'::timestamp) - interval '3 days'
          from {{ this }}
      )
    {% endif %}
)
select event_id, customer_id, cast(event_at as date) as event_date,
       event_at, event_type, revenue_cents
from events
```

**Late-arriving data is why the naive version is wrong.** The tutorial filter is `where event_at > (select max(event_at) from {{ this }})`. It works until a mobile client buffers events offline and uploads six hours late, or a loader retries a failed partition. Those rows have an `event_at` *below* your high-water mark. They are never selected, never in the table. **No error, no test failure, no clue** — just a Tuesday that is permanently 3% light, found in a quarterly reconciliation months later.

Two defenses, and you need both. **A lookback window** (above): re-scan the last N days and let `merge` dedupe on `unique_key`. Size N from observed lateness — measure `event_at` vs. `_synced_at` at p99.9, then double it. A 3-day lookback on 400M rows/day cost 90 extra seconds per run. **Filter on load time, not event time**, when the loader gives you one: `where _synced_at >= (select max(_synced_at) from {{ this }})` is strictly correct — late rows still have a recent `_synced_at` — but only if that column is trustworthy and monotonic. Many loaders lie. Check first.

| | `merge` | `delete+insert` |
|---|---|---|
| How | Matches on `unique_key`, updates matched, inserts new | Deletes rows matching the batch's keys, then inserts |
| Cost | Scans target for matches — pricey on huge unpartitioned tables | Two ops, each cheap on a partitioned table |
| Trap | **Duplicate `unique_key` in the batch** → adapter error, or a nondeterministic winner | Non-atomic on some adapters: a failure between delete and insert leaves a hole |
| Use when | Row-level updates, unpredictable key distribution | Time-partitioned facts where you replace whole days |

That `merge` trap is the most common incremental incident: **dedupe the incoming batch before the merge.** A source that re-emits an event on retry gives you two rows with one `event_id`, and the merge either errors at 03:00 or picks one at random. `qualify row_number() over (partition by event_id order by _synced_at desc) = 1` — or the same thing in a CTE filtered `= 1` outside, on adapters without `qualify`.

**Full-refresh discipline.** `dbt run --full-refresh` rebuilds from scratch, and on a real fact table that is not a 90-second inconvenience. `fct_events`, 14B rows, Snowflake: **incremental run 4m 12s; full refresh 6h 40m and roughly $190 of credits.** The Monday someone ran it "to be safe," the mart was unavailable for the entire business day. So: **never** put `--full-refresh` in the scheduled job — not as a flag, not as a weekly "just in case." Guard expensive models with `{{ config(full_refresh=false) }}` so the flag becomes a no-op and rebuilding is a deliberate manual act. When you genuinely need one, build to a new schema, verify row counts and known aggregates, then swap — never truncate the live table and hope. And a schema change is not a reason to full-refresh: `on_schema_change='append_new_columns'` handles the additive case, which is 90% of the cases you actually have.

### 3.5 Snapshots for SCD2

Incremental models track events. Snapshots track *how a mutable row changed over time* — the thing your source overwrites and forgets.

```sql
{% snapshot snap_customers %}
{{ config(
    target_schema='snapshots', unique_key='customer_id',
    strategy='check',
    check_cols=['plan_name', 'mrr_cents', 'account_status'],
    invalidate_hard_deletes=true
) }}
select customer_id, plan_name, mrr_cents, account_status, updated_at
from {{ source('app', 'customers') }}
{% endsnapshot %}
```

You get `dbt_valid_from` / `dbt_valid_to`, so "what plan were they on when they churned" becomes answerable — which it never is from the source table. Decisions that matter:

- **`strategy='timestamp'`** if you trust an `updated_at` the source reliably bumps (cheaper: one column compared). **`strategy='check'`** when you don't, and you usually don't — plenty of systems update rows without touching `updated_at`, and that gap is invisible until you audit.
- **Never `check_cols='all'` on a wide table.** Any noisy column — a `last_seen_at`, a recomputed score — creates a new row version every run. A 40k-row customers table became 2.1M snapshot rows in five weeks that way. List the 3-6 columns whose history you need.
- **Snapshots run against the source and must run before the models reading them.** `dbt build` orders this; a hand-rolled `dbt run && dbt snapshot` does not.
- **A snapshot's history is unrecoverable.** Miss a week of runs and that week never existed. It is the one thing in dbt you cannot rebuild from source — alert on snapshot failure separately, and louder.

### 3.6 Tests: generic, singular, custom generic

**Generic** — declared in YAML. Every grain key gets `unique` + `not_null`. No exceptions, no "it's obviously unique."

```yaml
models:
  - name: fct_orders
    description: "One row per order. Grain: order_id."
    columns:
      - name: order_id
        data_tests: [unique, not_null]
      - name: customer_id
        data_tests:
          - not_null
          - relationships: {to: ref('dim_customers'), field: customer_id}
      - name: order_status
        data_tests:
          - accepted_values:
              values: ['pending', 'paid', 'shipped', 'refunded']
              config: {severity: warn}   # a new status is news, not an outage
```

That `severity: warn` matters. A new enum value from an upstream team should page a human, not block the pipeline at 03:00. Reserve `error` for things that make data *wrong* rather than *surprising* — that distinction is what stops people muting the alerts channel entirely.

**Singular** — a `.sql` file in `tests/` returning failing rows; zero rows = pass. For invariants no generic test expresses:

```sql
-- tests/assert_refunds_never_exceed_charges.sql
select o.order_id, o.amount_cents, sum(r.refund_cents) as total_refunded
from {{ ref('fct_orders') }} o
join {{ ref('fct_refunds') }} r using (order_id)
group by 1, 2
having sum(r.refund_cents) > o.amount_cents
```

That test caught a real double-refund bug in a payments integration eleven days before finance would have found it in reconciliation.

**Custom generic** — a singular test parameterized into a macro, once you've written the same shape three times:

```sql
-- macros/tests/not_null_where.sql
{% test not_null_where(model, column_name, condition) %}
select * from {{ model }} where {{ condition }} and {{ column_name }} is null
{% endtest %}
```

"Required, but only in this state" (`- not_null_where: {condition: "order_status = 'shipped'"}`) is the test you will write in every project. Write the macro once. And the composite-grain test is the automated form of rule 1 — if `dbt_utils.unique_combination_of_columns` with `combination_of_columns: [customer_id, activity_date]` fails, you didn't break a test, you broke the model's definition.

### 3.7 Contracts: make the mart's shape a promise

A contract makes dbt verify column names, types, and constraints at build time and **fail the build** rather than silently reshape a table BI depends on.

```yaml
models:
  - name: dim_customers
    config:
      contract: {enforced: true}
    columns:
      - name: customer_id
        data_type: varchar
        constraints: [{type: not_null}, {type: primary_key}]
      - name: mrr_cents
        data_type: bigint
```

Enforce on marts only — staging changes constantly by design, so a contract there is friction with no payoff. On a mart feeding a dashboard, a contract turns "someone changed `mrr` from int to float and every Looker filter broke" into a red CI check on the PR that did it. Pair with versioning when a breaking change is genuinely necessary: ship v2 alongside v1, migrate consumers, deprecate v1. That's what lets you change a mart without a company-wide announcement.

### 3.8 Slim CI with `state:modified+`

Never build the whole project in CI. Build what changed and everything downstream.

```yaml
- name: Fetch production manifest
  run: aws s3 cp s3://tapdot-dbt-artifacts/prod/manifest.json ./state/manifest.json
- name: Build changed models and their children
  run: dbt build --select state:modified+ --defer --state ./state --target ci
- name: Upload manifest on merge to main
  if: github.ref == 'refs/heads/main'
  run: aws s3 cp target/manifest.json s3://tapdot-dbt-artifacts/prod/manifest.json
```

Each piece does real work. **`state:modified`** diffs your project against the production `manifest.json` from the last prod run — no manifest, no slim CI, which is why uploading it on merge is load-bearing. **The trailing `+`** means "and everything downstream"; without it you test your change and not the mart it breaks. **`--defer`** resolves any `ref()` to a model you did *not* change against **production** instead of rebuilding it in CI — this is where the time goes: a 340-model project went from a **52-minute** full CI build to **3m 40s** for a typical 4-model PR. And **`dbt build`, not `dbt run && dbt test`**: `build` interleaves them per model in DAG order, so a failing staging test stops the marts from being built on data you already know is bad. `run && test` cheerfully builds all 340 models and *then* tells you the first one was broken.

## 4. Anti-patterns

- **A model that can't state its grain in one sentence.** "One row per order" or it isn't a model. Every double-counted metric traces to a grain that changed and was never declared.
- **`where event_at > max(event_at)` in an incremental.** Late rows silently, permanently lost. No error, no failing test — a Tuesday that's 3% light forever. Lookback window plus `merge`.
- **Merging a batch with duplicate `unique_key`s.** A source retry re-emits the row; the merge errors at 03:00 or picks a winner at random. `qualify row_number() ... = 1` first, always.
- **`--full-refresh` in the scheduled job.** 4m 12s becomes 6h 40m and ~$190 of credits, and the mart is down all day. Guard expensive models with `full_refresh=false` so the flag can't fire by accident.
- **Hardcoded `analytics.schema.table` instead of `ref()`.** Wrong build order, dev reads prod, and `state:modified+` stops covering your change. CI goes green on a broken PR.
- **A mart selecting from another mart.** Change one filter, three definitions of revenue move. Shared logic goes in an intermediate model — that's what the layer is for.
- **Joins or business logic in staging.** Staging is 1:1 with the source. The moment it joins, there's no longer one obvious place to fix a source rename.
- **`check_cols='all'` on a wide snapshot.** One noisy `last_seen_at` gave 40k customers 2.1M snapshot rows in five weeks. List the 3-6 you need.
- **Building before `dbt source freshness`.** Loader dies at 02:00, dbt runs at 04:00, the exec dashboard shows a 60% drop at 09:00. Confidently wrong is worse than visibly broken.
- **`severity: error` on everything.** Page for wrong data, warn for surprising data. Blur that line and the alerts channel is muted within a month, along with the tests that mattered.
- **`dbt run && dbt test` instead of `dbt build`.** You build 340 models on data you already knew was bad, then find out.
- **Untested models.** `unique` + `not_null` on the grain key is thirty seconds of YAML and the only enforcement your one-row-per-X claim will ever have.

## 5. Usage

1. Paste this skill into your AI assistant's context (or install it as a project skill in Claude Code / a Cursor rule).
2. Describe your **sources** (system, table, sync cadence, whether a trustworthy `_synced_at` exists) and the **grain** you need out ("one row per customer per day with revenue and active-session count").
3. Ask for, in order: (a) `sources.yml` with freshness thresholds, (b) staging models — one per source table, no joins, (c) intermediate models wherever the grain changes, (d) the mart with its grain in the description, (e) `schema.yml` tests including `unique` + `not_null` on the grain key.
4. For any incremental model, make the assistant state explicitly: the `unique_key`, the strategy and why, the lookback window and the observed lateness it's sized from, and the batch dedupe. If it can't justify all four, the model is wrong.
5. Before merging, walk section 4 as a checklist. Confirm CI runs `dbt build --select state:modified+ --defer --state ./state`.

The assistant should refuse to write a model without a declared grain, should never generate `where ts > max(ts)` incremental logic, and should flag any mart that references another mart.

## 6. Example Output

Prompt given with this skill loaded: *"Stripe charges land in raw_stripe hourly, app events in raw_app every 15 minutes. I need daily revenue per customer per day. Events arrive up to 2 days late from mobile clients."*

Expected shape of the answer:

```sql
-- models/marts/fct_customer_daily_revenue.sql
-- Grain: one row per customer_id per activity_date.
{{ config(
    materialized='incremental',
    unique_key=['customer_id', 'activity_date'],
    incremental_strategy='merge',
    on_schema_change='append_new_columns',
    partition_by={'field': 'activity_date', 'data_type': 'date'},
    full_refresh=false
) }}
with charges as (
    select * from {{ ref('stg_stripe__charges') }}
    where charge_status = 'succeeded'
    {% if is_incremental() %}
      -- 2 days observed lateness, doubled to 4. Costs ~40s/run; loses nothing.
      and cast(created_at as date) >= (
          select coalesce(max(activity_date), date '1900-01-01') - interval '4 days'
          from {{ this }}
      )
    {% endif %}
),
deduped as (
    select * from charges
    qualify row_number() over (partition by charge_id order by synced_at desc) = 1
)
select customer_id, cast(created_at as date) as activity_date,
       sum(amount_cents) as revenue_cents, count(*) as charge_count
from deduped
group by 1, 2
```

```yaml
models:
  - name: fct_customer_daily_revenue
    description: "One row per customer per day. Grain: customer_id + activity_date."
    data_tests:
      - dbt_utils.unique_combination_of_columns:
          combination_of_columns: [customer_id, activity_date]
    columns:
      - name: revenue_cents
        data_tests:
          - not_null
          - dbt_utils.expression_is_true: {expression: ">= 0"}
```

> The 4-day lookback is the load-bearing decision: your mobile clients are 2 days late, so `where created_at > max(created_at)` would permanently drop those rows with no error and no failing test. Doubling observed lateness costs ~40 seconds per run and is the difference between a fact table you can reconcile and one you can't. `full_refresh=false` makes a stray `--full-refresh` in the nightly a no-op instead of a six-hour outage.

Note what the output does *not* contain: no `select * from raw_stripe.charges` (sources only), no mart reading another mart, no `--full-refresh` anywhere near the schedule, no `where created_at > max(created_at)`, and no model shipping without a `unique` test on its declared grain.
