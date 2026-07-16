---
title: Self-Hosted Dashboards with Apache Superset Skill
category: Data
description: Run Superset as real BI infrastructure instead of a SQL Lab window that falls over the first time twelve charts refresh at once. Covers physical vs virtual datasets, a semantic layer built from dataset metrics, async Celery query workers, row-level security for multi-tenant dashboards, cache warmup, and dashboards versioned as YAML in git.
usage: Load this skill before asking your AI assistant to design a Superset deployment, model a dataset, or debug a slow dashboard. Say "use the Superset dashboards skill" and describe your warehouse and audience; the assistant will produce dataset models, metrics, RLS filters, and config that scale past the demo, instead of a pile of one-off virtual datasets.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 18
pocUrl: https://github.com/apache/superset
---

# Self-Hosted Dashboards with Apache Superset Skill

## 1. Philosophy

Superset is astonishingly easy to stand up and astonishingly easy to turn into a liability. The gap between those two states is entirely about where you put your logic.

**Superset is a query generator, not a database.** Every chart is a `SELECT` your warehouse executes. Superset's performance *is* your warehouse's performance plus a cache. If a dashboard is slow, nine times in ten the answer is in the query log, not in `superset_config.py`.

**The dataset is your semantic layer, or you don't have one.** A metric defined once on a dataset is one definition of "revenue." A metric typed into six charts' Custom SQL is six definitions of revenue that will disagree in a board meeting. I have sat in that meeting.

Three rules govern everything below:

1. **Business logic lives in dbt or views — never in a virtual dataset.** Virtual datasets are unversioned shadow ETL living in a web form.
2. **Every query is async, capped, and timed out.** A sync query is a Gunicorn worker held hostage by an analyst's `SELECT *`.
3. **Dashboards are code.** Export to YAML, commit, import in CI. If your only copy of a dashboard is in the metadata database, you have an outage waiting for a bad migration.

## 2. Tech Stack

- **Apache Superset** — https://github.com/apache/superset — licensed **Apache-2.0**. The web tier, SQL Lab, chart engine, and metadata model behind everything below.
- **Superset 3.x+** — assumed throughout, under Gunicorn with a Celery worker fleet, Redis for cache and broker, and Postgres for the metadata database (never SQLite outside your laptop).
- **A real analytical warehouse** — Postgres, ClickHouse, BigQuery, or Snowflake. Examples use ANSI-ish SQL.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Apache Superset maintainers. All example code is original to this skill.

Recommended companions: dbt for the modeling layer that belongs *below* Superset, and `superset-cli` export/import wired into CI.

## 3. Patterns

### 3.1 Physical datasets by default; virtual datasets are a code smell

A **physical dataset** points at a table or view. A **virtual dataset** is a SQL query saved inside Superset's metadata database. Virtual datasets feel great for about three weeks. Then:

- The SQL is not in git. No diff, no blame, no review, no rollback.
- No dependency tracking, no `dbt test`, no lineage — it is a view without any of a view's guarantees.
- Superset wraps it as a subquery, so the warehouse plans `select ... from (your 200-line query) where dttm >= ...` and the predicate frequently does not push down.
- Someone edits it at 4pm on Friday and every chart built on it changes silently.

We inherited a virtual dataset that was 340 lines with four CTEs and two window functions. One chart on it took 34 seconds. The fix was not Superset tuning; it was `dbt run` — the same logic as a materialized model made the chart 400ms, and the dataset became one line: `analytics.fct_orders_daily`.

```
Heavy transformation      -> dbt model / materialized view in the warehouse
Light reshaping           -> a plain database VIEW, in git, deployed by migration
Aggregation & formatting  -> a dataset METRIC in Superset
Ad-hoc exploration        -> SQL Lab, and it stays there
```

A virtual dataset is acceptable for exactly one thing: a temporary probe you intend to delete. If it survives a sprint, promote it to a view.

### 3.2 The semantic layer: metrics on the dataset, not in the chart

Define the calculation once, on the dataset, with a verbose name and a description. Every chart picks it from a dropdown and nobody re-derives it.

```sql
-- Metric: revenue          SUM(total_cents) / 100.0
-- Metric: orders           COUNT(DISTINCT order_id)
-- Metric: aov              SUM(total_cents) / 100.0 / NULLIF(COUNT(DISTINCT order_id), 0)
-- Metric: paid_conversion  COUNT(DISTINCT CASE WHEN status = 'paid' THEN order_id END)
--                            / NULLIF(COUNT(DISTINCT order_id), 0)
```

- `NULLIF(..., 0)` on every denominator. A ratio that divides by zero fails the whole chart, not the one cell — and it happens the first day a filter selects an empty segment.
- Give metrics a **verbose name** ("Revenue (USD)") and a **description** ("Gross, pre-refund, excludes test orders"). The description shows on hover and is the cheapest data governance you will ever ship.
- Calculated **columns** are the sibling pattern: put row-level derivations (`date_trunc('week', ordered_at)`) on the dataset so twelve charts stop reimplementing them.

The test for whether you have a semantic layer: change the definition of revenue in one place and count how many charts update. If the answer is not "all of them," you have twelve definitions.

### 3.3 Async queries: sync queries kill the web tier

By default a chart query runs in the Gunicorn web worker. With 8 workers and a dashboard of 12 charts, one analyst opening one dashboard on a cold cache consumes every worker and the *login page* stops responding. That is the whole incident: Superset appeared down, and the cause was one person opening one dashboard.

```python
# superset_config.py
class CeleryConfig:
    broker_url = "redis://redis:6379/0"
    result_backend = "redis://redis:6379/0"
    imports = ("superset.sql_lab", "superset.tasks.cache")
    worker_prefetch_multiplier = 1        # long queries: never batch-grab tasks
    task_acks_late = True

CELERY_CONFIG = CeleryConfig
RESULTS_BACKEND = RedisCache(host="redis", port=6379, key_prefix="superset_results")

FEATURE_FLAGS = {
    "GLOBAL_ASYNC_QUERIES": True,   # chart queries go async too, not just SQL Lab
    "DASHBOARD_RBAC": True,
    "ALERT_REPORTS": True,
}
```

`worker_prefetch_multiplier = 1` is the setting people miss. The default lets a worker reserve several tasks; with 90-second analytical queries, tasks sit in one worker's local buffer while other workers idle. Set it to 1 and the queue behaves like a queue.

### 3.4 Query timeouts and the runaway `SELECT *`

Every layer needs a ceiling, because an analyst *will* run `select * from events` against a 400M-row table. Ours did. It pinned a Celery worker for eleven minutes and pushed the results backend into eviction, which quietly broke caching for everyone else.

```python
ROW_LIMIT = 5000
VIZ_ROW_LIMIT = 10000
SQL_MAX_ROW = 50000                 # hard cap on SQL Lab result rows
DEFAULT_SQLLAB_LIMIT = 1000
SQLLAB_TIMEOUT = 60 * 5
SUPERSET_WEBSERVER_TIMEOUT = 60
```

And on the connection itself (Settings → Database → Advanced): chart cache timeout set explicitly, async execution on, and **Allow DDL/DML off** — Superset connects with a read-only warehouse role, always. If someone needs to write, they are not doing BI.

Then the fence nobody can route around, warehouse-side:

```sql
alter role superset_ro set statement_timeout = '300s';
alter role superset_ro set default_transaction_read_only = on;
```

Set that even if you set all the others. Every limit above it is advisory.

### 3.5 Caching: two layers, and warm the one that matters

```python
CACHE_CONFIG = {  # metadata / general
    "CACHE_TYPE": "RedisCache", "CACHE_DEFAULT_TIMEOUT": 60 * 60 * 24,
    "CACHE_KEY_PREFIX": "superset_", "CACHE_REDIS_URL": "redis://redis:6379/1",
}
DATA_CACHE_CONFIG = {  # chart query results — the one users feel
    "CACHE_TYPE": "RedisCache", "CACHE_DEFAULT_TIMEOUT": 60 * 60 * 6,
    "CACHE_KEY_PREFIX": "superset_data_", "CACHE_REDIS_URL": "redis://redis:6379/2",
}
```

Cache timeout resolves chart → dataset → database → global. Set it at the level where the *data* changes: if the warehouse loads hourly, a 6-hour chart cache is a lie you tell your executives.

Then warm it, so the first person in the morning is not the one paying for the cold query:

```python
CELERYBEAT_SCHEDULE = {
    "cache-warmup-daily": {
        "task": "cache-warmup",
        "schedule": crontab(minute=45, hour=5),  # after the nightly load, before standup
        "kwargs": {"strategy_name": "top_n_dashboards", "top_n": 10},
    },
}
```

Warm the dashboards that matter. Warming everything just moves the load; it does not remove it.

### 3.6 Row-level security for multi-tenant dashboards

Build **one** dashboard, not one per customer. RLS injects a predicate into every query on a dataset, based on the viewer's roles.

| Field | Value |
|---|---|
| Filter type | Regular |
| Tables | `analytics.fct_orders`, `analytics.fct_sessions` |
| Roles | `TenantAcme` |
| Group key | `tenant` |
| Clause | `tenant_id = 42` |

Non-negotiables, because this is a security boundary living in a web form:

- **Apply the filter to every dataset carrying tenant data.** RLS is per-dataset, not per-schema. The one you miss is a breach. Audit it as an explicit list, not a vibe.
- **The group key matters**: filters sharing a group key are `OR`-ed, different keys are `AND`-ed. Get it backwards and a user with two roles sees everything.
- **Never let a tenant user reach SQL Lab.** Strip `can_sql_json` and database access from tenant roles. RLS is not a jail; SQL Lab is a door around it.
- **Test as the user**, with a real tenant account, reading the generated SQL under "View query". Not as an admin — admins are exempt.
- For external customers or regulated data, back it with database-level RLS too. Superset RLS for ergonomics; Postgres RLS for the guarantee.

### 3.7 Dashboards as code: export, commit, import

The metadata database is a runtime, not a source of truth.

```bash
superset export-dashboards -f dashboards.zip          # YAML: dashboards, charts, datasets
superset import-dashboards -p dashboards.zip -u admin # in CI, against a fresh environment
```

1. Build in a staging Superset.
2. Export, unzip, commit the YAML — chart definitions and metrics diff beautifully.
3. **Strip credentials before committing.** The exported database YAML carries a `sqlalchemy_uri` with the password in it. Replace it with a placeholder or you have committed warehouse credentials to git.
4. Import into production in a deploy job.

The UUIDs in the YAML are the identity. Preserve them across environments or every import creates duplicates instead of updates.

### 3.8 SQL Lab discipline

SQL Lab is a workbench, not a production surface.

- Read-only role, always, with the `statement_timeout` from 3.4.
- A `LIMIT` in every exploratory query. `DEFAULT_SQLLAB_LIMIT` helps; teach the habit anyway.
- "Save as dataset" is the primary way virtual datasets breed. Treat it as a request to write a dbt model, not a shortcut.
- Check the row count in the query before you `SELECT *`, not in the browser.

## 4. Anti-patterns

- **Virtual datasets as the modeling layer.** 340 unversioned lines in a web form, wrapped as a subquery the planner can't optimize. Move it to dbt and the chart gets 80x faster for free.
- **Metrics typed into Custom SQL per chart.** Six definitions of revenue, all slightly different, discovered live in a board meeting.
- **Sync queries in production.** 8 workers, 12 charts, one cold dashboard — and the login page stops responding.
- **No `statement_timeout` on the warehouse role.** Every other limit is advisory; this one is the fence. `SELECT *` on 400M rows finds every gap you leave.
- **Superset connecting with a read/write user.** BI does not write. DDL/DML off, read-only role, no exceptions.
- **A dashboard per tenant.** Forty copies drift within a month. One dashboard plus RLS.
- **RLS on *some* tenant datasets.** RLS is per-dataset. The one you missed is the headline.
- **SQL Lab access for tenant users.** A door around the boundary you carefully built.
- **Dashboards that exist only in the metadata database.** No git, no review, no rollback, one bad upgrade from gone.
- **`worker_prefetch_multiplier` left at default with long queries.** Workers hoard tasks while peers idle, and queue depth lies to you.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the deployment as a contract: "Superset on ECS, Postgres warehouse, 400M-row events table, 30 internal analysts plus 40 external customer accounts who must only see their own rows, data loads at 05:00 UTC."
3. Ask for, in order: (a) the dataset layout — which are physical, which views, which dbt models; (b) the metrics and calculated columns that make up the semantic layer; (c) `superset_config.py` covering Celery, both caches, row limits, timeouts; (d) the RLS matrix per role per dataset; (e) the export/import CI job.
4. Run section 4 as a review checklist. Start with the RLS matrix — that is the one whose bug is a headline.
5. Verify by logging in as a real tenant user and reading the generated SQL under "View query" on every chart.

The assistant should refuse to model business logic in a virtual dataset, refuse to configure a read/write warehouse connection, and ask which datasets carry tenant identifiers before proposing RLS.

## 6. Example Output

Prompt given with this skill loaded: *"We have `analytics.fct_orders` in Postgres, 90M rows: order_id, tenant_id, ordered_at, status, total_cents, channel. Each of our 40 customers needs a revenue dashboard showing only their orders."*

Expected shape of the answer:

```sql
-- Physical dataset, not virtual. One index serving every chart's predicate.
create index concurrently if not exists fct_orders_tenant_time_idx
  on analytics.fct_orders (tenant_id, ordered_at desc);

create role superset_ro login password :'pw';
grant usage on schema analytics to superset_ro;
grant select on analytics.fct_orders to superset_ro;
alter role superset_ro set statement_timeout = '300s';
alter role superset_ro set default_transaction_read_only = on;
```

Dataset `analytics.fct_orders` — metrics defined once, on the dataset:

```
revenue     SUM(total_cents) / 100.0                                  "Revenue (USD)" — gross, pre-refund
orders      COUNT(DISTINCT order_id)                                  "Orders"
aov         SUM(total_cents) / 100.0 / NULLIF(COUNT(DISTINCT order_id), 0)   "Average Order Value (USD)"
paid_rate   COUNT(DISTINCT CASE WHEN status='paid' THEN order_id END)
              / NULLIF(COUNT(DISTINCT order_id), 0)                   "Paid Conversion"
```

RLS: one filter per tenant role, all on the `tenant` group key, all bound to this dataset.

```
Filter: "Acme sees Acme"   type: Regular   roles: [TenantAcme]
  tables: [analytics.fct_orders]   group key: tenant   clause: tenant_id = 42
```

Cache and warmup, tuned to the 05:00 load:

```python
DATA_CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 60 * 60 * 12,   # data changes once daily
    "CACHE_KEY_PREFIX": "superset_data_",
    "CACHE_REDIS_URL": "redis://redis:6379/2",
}
CELERYBEAT_SCHEDULE = {
    "warm-tenant-dashboards": {
        "task": "cache-warmup",
        "schedule": crontab(minute=30, hour=5),   # after the load, before anyone logs in
        "kwargs": {"strategy_name": "top_n_dashboards", "top_n": 5},
    },
}
```

Note what the output does *not* contain: no virtual dataset holding the tenant filter in hand-written SQL, no forty near-identical dashboards, no metric defined inside a chart, no read/write connection. One dataset, one dashboard, forty roles — and the security boundary is a predicate the warehouse enforces, not a `WHERE` clause an analyst can edit.
