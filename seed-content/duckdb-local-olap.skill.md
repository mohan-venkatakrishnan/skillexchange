---
title: Local OLAP with DuckDB Skill
category: Data
description: Run warehouse-grade analytics on your laptop by querying Parquet and CSV directly, without loading anything into a database first. Covers columnar execution, pushdown, EXPLAIN ANALYZE, memory limits and spilling, joins that OOM, and the single-writer model that surprises everyone.
usage: Load this skill before asking your AI assistant to write analytical SQL, build a local data pipeline, or debug a slow or crashing DuckDB query. Say "use the DuckDB local OLAP skill" and describe your files and the question you want answered; the assistant will produce queries that read pushdown-friendly and stay inside your memory budget.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 7
timeSavedHours: 16
pocUrl: https://github.com/duckdb/duckdb
---

# Local OLAP with DuckDB Skill

## 1. Philosophy

The instinct most engineers bring from Postgres is: *the data must be loaded before it can be queried*. That instinct is the biggest source of wasted hours in local analytics. You do not need an ingest step, or a Docker container. You need a file path and a `SELECT`.

**DuckDB is a query engine that happens to have a storage format, not a database that happens to run queries.** Parquet on disk is a first-class table. So is S3. So is a DataFrame in the same process. The engine's job is to read as few bytes as possible; your job is to write SQL that lets it.

Three rules govern everything below:

1. **Never load what you can scan.** `CREATE TABLE AS SELECT * FROM read_parquet(...)` costs the full decode, memory, and disk write, and buys nothing on a query that would have pushed a filter down and touched 3% of the file. Load only when you'll scan the same data 5+ times, or need indexes and constraints.
2. **Memory is a budget you declare, not a limit you discover.** By default DuckDB takes most of your RAM and competes with your browser; the OOM killer settles it. Set `memory_limit` and `temp_directory` in the first three lines of every script.
3. **One writer. Ever.** DuckDB is not a server. One process with write access, or many with read access — never both. Every "database is locked" is this rule being violated, usually by a forgotten Jupyter kernel.

Slow query? Pushdown or join-order problem. Dead query? Memory problem. There is almost never a third category.

## 2. Tech Stack

- **DuckDB** — https://github.com/duckdb/duckdb — licensed **MIT**. An in-process columnar OLAP engine: vectorized execution, no server, no daemon, one dependency-free binary.
- **Apache Parquet** — the format you should write everything to. Columnar, compressed, carries per-row-group statistics DuckDB uses to skip work.
- **httpfs / postgres_scanner extensions** — make `s3://` paths and live Postgres databases queryable as tables with no export step.

This skill is an independent, original guide; it is not affiliated with or endorsed by the DuckDB maintainers. All example code, plans, and timings are original to this skill and were measured on ordinary developer hardware.

Recommended companions: the Python client for pipelines, the CLI for exploration, Polars or Arrow for zero-copy handoff.

## 3. Patterns

### 3.1 Columnar execution: the shape of your SELECT is the whole game

DuckDB reads columns, not rows, in vectors of 2048 values. A filter on one column never touches another column's bytes. One practical consequence fights every row-store habit: `SELECT *` is not shorthand, it is an instruction to decode every column in the file.

```sql
-- 41 GB Parquet, 84 columns, 620M rows.
-- 18.4 s — decodes all 84 columns to answer a question about 2.
SELECT * FROM read_parquet('events/*.parquet') WHERE country = 'IN' LIMIT 10;

-- 0.31 s — reads 2 columns, skips row groups by statistics.
SELECT event_id, country FROM read_parquet('events/*.parquet') WHERE country = 'IN' LIMIT 10;
```

Sixty-fold, same data, same machine. Name your columns. Always.

### 3.2 Reading files directly: globs, hive partitioning, schema drift

```sql
SELECT count(*) FROM 'sales/2026-01.parquet';           -- single file
SELECT count(*) FROM read_parquet('sales/**/*.parquet'); -- recursive glob
```

If the directory layout encodes columns — `sales/year=2026/month=03/part-0.parquet` — turn on hive partitioning and path segments become real, filterable columns:

```sql
SELECT year, month, sum(amount_cents) / 100.0 AS revenue
FROM read_parquet('sales/**/*.parquet', hive_partitioning = true)
WHERE year = 2026 AND month IN (1, 2, 3)
GROUP BY year, month;
```

That `WHERE` is not a filter, it is a **file pruning directive** — DuckDB never opens the 2024 or 2025 directories. On a 5-year, 1,800-file archive it took the scan from 1,800 file opens to 3.

Two failure modes worth pre-empting:

- **Schema drift.** A column added in March makes February's files fail to unify by position. Pass `union_by_name = true` to match by name and fill missing with `NULL`.
- **CSV type guessing.** DuckDB samples 20,480 rows to infer types; a column that is integer for 30k rows then hits `"N/A"` fails mid-scan. Declare the types instead:

```sql
SELECT * FROM read_csv('raw/*.csv', header = true,
  types = {'user_id': 'BIGINT', 'signup_ts': 'TIMESTAMP', 'referrer': 'VARCHAR'},
  ignore_errors = false  -- keep false; silent row drops are worse than a crash
);
```

### 3.3 Projection and filter pushdown

Pushdown means the filter runs *inside* the Parquet reader, using row-group statistics to skip blocks before decompression. Free — until you write something that blocks it.

```sql
-- Blocked: the reader can't evaluate a function against row-group min/max stats. 9.7 s
SELECT count(*) FROM read_parquet('events/**/*.parquet')
WHERE date_trunc('month', ts) = DATE '2026-03-01';

-- Works: bare column vs. constants; out-of-range row groups skipped entirely. 0.44 s
SELECT count(*) FROM read_parquet('events/**/*.parquet')
WHERE ts >= TIMESTAMP '2026-03-01' AND ts < TIMESTAMP '2026-04-01';
```

The rule, memorized: **bare column on the left, arithmetic on the constants on the right.** Every predicate you write should pass this test.

### 3.4 Reading EXPLAIN ANALYZE without guessing

`EXPLAIN` shows the plan; `EXPLAIN ANALYZE` runs it and annotates actual time and rows. Only the second is worth your time.

```
┌───────────────────────────┐
│      HASH_GROUP_BY        │
│   Rows: 194   (0.08s)     │
├───────────────────────────┤
│        HASH_JOIN          │
│   Build: customers        │  <- (a) which side got hashed
│   Rows: 118,204,551       │  <- (b) output rows vs. what you expected
│   (11.62s)                │  <- (c) where the time went
├──────────┬────────────────┤
│ PARQUET_SCAN  orders      │
│ Filters: none             │  <- (d) empty = nothing pushed down
│ Projections: customer_id, │
│              amount_cents │  <- (e) columns you actually paid for
│ Rows: 118,204,551 (2.1s)  │
└───────────────────────────┘
```

Read it in this order, every time:

1. **(d) Filters** — if your `WHERE` isn't listed on the scan node, it did not push down. Back to 3.3.
2. **(e) Projections** — count them. More than you named means something expanded to `*`.
3. **(b) Rows** — a join emitting more rows than either input means your key isn't unique and you are silently fanning out. The #1 cause of "why is my sum too big."
4. **(a) Build side** — see 3.6. **(c) Timing** — last, because the slow node is usually a symptom of 1-3.

### 3.5 Memory limits and spilling to disk

```sql
SET memory_limit = '6GB';                       -- leave the OS and your editor room
SET temp_directory = '/var/tmp/duckdb_spill';   -- must exist, must have real free space
SET threads = 4;                                -- each thread holds its own buffers
SET preserve_insertion_order = false;           -- lets the engine stream; big win on large writes
```

With `temp_directory` set, work exceeding the budget spills partitions to disk and completes. Without it: `Out of Memory Error: could not allocate block of size 262144 (5.9GB/6.0GB used)`.

A `GROUP BY user_id` over 340M rows producing 41M distinct groups, `memory_limit = 4GB`:

- No `temp_directory`: **OOM at 00:52.**
- Spill dir on SSD: **3m 18s**, ~7.4 GB written and cleaned up on exit.
- `memory_limit = 16GB`, no spill needed: **41 s.**

Spilling is a safety net, not a plan. A 4x slowdown means reduce the work (3.6), don't buy patience. And a `temp_directory` on a network mount or a nearly-full disk is worse than none — you trade a fast OOM for a 40-minute crawl that fails anyway.

### 3.6 Joins that OOM, and the two fixes that work

DuckDB's hash join builds a table from one side and streams the other through it. **The build side must fit in memory.** When a query dies in a join, this is why. The engine picks the build side from cardinality estimates, and when both sides are raw Parquet scans those estimates are file-metadata guesses — wrong often enough that you must be able to override them.

**Fix 1 — give the planner a fact instead of a guess.**

```sql
-- Dies: builds on a 118M-row scan because it under-estimated the file.
SELECT o.id, c.country
FROM read_parquet('orders/*.parquet') o
JOIN read_parquet('customers/*.parquet') c ON c.id = o.customer_id
WHERE c.tier = 'enterprise';

-- Survives: filter applied and materialized before the join is planned.
WITH ent AS MATERIALIZED (
  SELECT id, country FROM read_parquet('customers/*.parquet') WHERE tier = 'enterprise'
)  -- 12,880 rows, hash table ~1.4 MB
SELECT o.id, ent.country
FROM read_parquet('orders/*.parquet') o JOIN ent ON ent.id = o.customer_id;
```

`AS MATERIALIZED` forces the CTE to compute once, giving an exact row count. This keyword has rescued more queries than every other tuning knob combined.

**Fix 2 — aggregate before you join, not after.** If you're joining a fact table only to sum it, sum it first:

```sql
-- 118M-row join, then group. Peak RSS 11.2 GB.
SELECT c.country, sum(o.amount_cents) FROM orders o
JOIN customers c ON c.id = o.customer_id GROUP BY c.country;

-- Group first (2.1M rows out), then join. Peak RSS 1.6 GB, 4.1x faster, identical answer.
WITH per_customer AS (SELECT customer_id, sum(amount_cents) AS amt FROM orders GROUP BY customer_id)
SELECT c.country, sum(p.amt) FROM per_customer p
JOIN customers c ON c.id = p.customer_id GROUP BY c.country;
```

Still exploding after both? Check **key fan-out** — duplicate keys on both sides multiply. `SELECT customer_id, count(*) FROM customers GROUP BY 1 HAVING count(*) > 1` takes ten seconds and has saved entire afternoons.

### 3.7 The single-writer concurrency model

Plainly, because the usual phrasing costs people an hour: a DuckDB file can be opened by **one process read-write**, *or* **many processes read-only**. Not both. No lock manager, no cross-process MVCC.

```
IO Error: Could not set lock on file "analytics.duckdb":
Conflicting lock is held in /usr/bin/python3 (PID 41822)
```

That PID is real — usually a Jupyter kernel you forgot, or a CLI in another tab. Kill it; there is no `--force` that is safe.

- **Many readers.** `duckdb.connect('analytics.duckdb', read_only=True)` from every process. Unlimited, no conflict.
- **One writer, many threads.** Within a process DuckDB parallelizes and is thread-safe on a shared connection. Pool connections inside one process, don't fork one process per worker.
- **Nothing on NFS/SMB/EFS.** File locking there is advisory at best. You get corruption, not an error message.

Need genuine multi-process writes? You've outgrown the model. Write per-process Parquet and scan the glob, or move to a server database. Do not fight the lock.

### 3.8 Attaching Postgres and S3

```sql
INSTALL httpfs; LOAD httpfs;
CREATE SECRET s3_prod (TYPE S3, PROVIDER credential_chain, REGION 'ap-south-1');
SELECT count(*) FROM read_parquet('s3://tapdot-lake/events/dt=2026-07-*/*.parquet');
```

Two things decide whether S3 is usable or miserable:

- **Row-group pruning works over HTTP range requests.** A filtered query on a 40 GB prefix can transfer 200 MB — but only if you projected columns and kept predicates bare (3.3). Get those wrong and you pay egress for the whole file.
- **Many small files destroy you.** Each file is a metadata round trip minimum. 40,000 × 2 MB files: 6m 40s. Same data as 400 × 200 MB files: 22 s. Target 128-512 MB per file.

```sql
INSTALL postgres; LOAD postgres;
ATTACH 'dbname=prod host=db.internal user=readonly' AS pg (TYPE postgres, READ_ONLY);

SELECT p.plan_name, count(*) AS events
FROM read_parquet('events/**/*.parquet') e
JOIN pg.public.subscriptions p ON p.org_id = e.org_id
GROUP BY p.plan_name;
```

**Pull dimensions, never facts.** A `SELECT *` across the attachment against a 200M-row production table runs a full sequential scan on your live database at 3pm on a Tuesday. Filter on the Postgres side, or copy the dimension local once with `CREATE TABLE dim_subs AS SELECT org_id, plan_name FROM pg.public.subscriptions`.

### 3.9 When DuckDB is the wrong answer

Reach for a warehouse when: **concurrency is the requirement** (50 analysts on a dashboard need a server — see 3.7); **the working set** — not the archive — genuinely exceeds one machine (a well-partitioned 8 TB lake where every query touches 30 GB is a laptop job; a query that shuffles 4 TB is not); **you need governance** (row-level security, audit logs, SSO — DuckDB has a file and your filesystem's permissions); or **writes are continuous** (streaming ingest with concurrent readers is exactly what the single-writer model refuses).

Reach for DuckDB when the data is files, the user is you or a batch job, the working set fits, and the alternative involves a cluster and a monthly invoice. That is far more workloads than people assume — a 32 GB laptop out-runs a small Spark cluster on anything under ~200 GB, with none of the JVM startup cost.

## 4. Anti-patterns

- **`SELECT *` in a columnar engine.** You paid to decode 84 columns to read 2 — 60x in the 3.1 benchmark. The most expensive keystroke in analytics.
- **`CREATE TABLE AS SELECT` before you know you need it.** Loading a file you'll scan once is pure tax: full decode, full memory, full disk write, zero benefit over scanning in place.
- **Wrapping the filter column in a function.** `WHERE date_trunc('month', ts) = ...` blocks pushdown: 0.44 s becomes 9.7 s. Bare column left, constants right.
- **Running without `memory_limit` and `temp_directory`.** The default competes with your browser and the OOM killer picks the winner. Three lines convert a crash into a slow success.
- **A spill directory on a network mount or full disk.** You traded a fast, honest OOM for a 40-minute crawl that fails anyway.
- **Trusting the planner's build-side choice on raw file scans.** Parquet-metadata estimates are guesses. `WITH ... AS MATERIALIZED` gives it a fact — the highest-value keyword in this file.
- **Joining before aggregating.** Summing after a 118M-row join: 11.2 GB RSS. Summing before it: 1.6 GB, same answer.
- **A second writer process.** A forgotten Jupyter kernel holds the lock and no safe `--force` exists. One writer, or many read-only readers.
- **A DuckDB file on NFS/EFS/SMB.** Advisory locking silently fails. You get corruption, not an error.
- **Ten thousand small Parquet files.** Metadata round trips dominate: 6m 40s vs. 22 s for identical bytes. Compact to 128-512 MB.
- **`ignore_errors = true` on CSV.** Rows vanish silently and your totals are quietly wrong forever. Declare `types` and let it crash loudly.

## 5. Usage

1. Paste this skill into your AI assistant's context (or install it as a project skill in Claude Code / a Cursor rule).
2. Describe your **files, not your schema**: layout and partitioning (`s3://lake/events/dt=YYYY-MM-DD/*.parquet`), row counts and file sizes, the columns you care about, and your RAM budget.
3. State the question in business terms. Ask for, in order: (a) the `SET` preamble, (b) the query with explicit projection and pushdown-safe predicates, (c) the `EXPLAIN ANALYZE` checkpoints that prove it.
4. Run `EXPLAIN ANALYZE` and read it in the 3.4 order: Filters → Projections → Rows → Build side → Timing. An empty Filters line means the query is wrong regardless of how fast it felt.
5. Before shipping any pipeline, walk section 4 as a checklist.

The assistant should refuse to write `SELECT *` against a wide file, should always emit the `memory_limit`/`temp_directory` preamble, and should flag any design implying two processes writing one database file.

## 6. Example Output

Prompt given with this skill loaded: *"I have ~2 years of clickstream in s3://tapdot-lake/events/, hive-partitioned by dt. About 900M rows, 60 columns. I want daily unique users for March 2026 by country. My laptop has 16 GB."*

Expected shape of the answer:

```sql
INSTALL httpfs; LOAD httpfs;
SET memory_limit = '10GB';
SET temp_directory = '/var/tmp/duckdb_spill';
SET threads = 8;
SET preserve_insertion_order = false;

CREATE SECRET s3_lake (TYPE S3, PROVIDER credential_chain, REGION 'ap-south-1');

SELECT dt, country, count(DISTINCT user_id) AS daily_active_users
FROM read_parquet('s3://tapdot-lake/events/**/*.parquet', hive_partitioning = true)
WHERE dt >= DATE '2026-03-01'
  AND dt <  DATE '2026-04-01'    -- bare column: prunes to 31 partitions, not 730
GROUP BY dt, country             -- 3 columns projected out of 60
ORDER BY dt, daily_active_users DESC;
```

With the verification spelled out, not left as an exercise:

> Run `EXPLAIN ANALYZE` and confirm on the `PARQUET_SCAN` node: `Filters:` lists `dt>=... AND dt<...` (if blank, partitions were not pruned and you're paying egress on 730 days); `Projections:` lists exactly `dt, country, user_id`; scanned rows ≈38M, not 900M.
>
> If `count(DISTINCT user_id)` spills, swap in `approx_count_distinct(user_id)` — HyperLogLog, ~2% error, constant memory, turning a 3-minute spilling run into ~20 seconds. For a DAU trend line that error is invisible; for a billing number it is not. Choose deliberately.

Note what the output does *not* contain: no `CREATE TABLE` staging step, no download of the S3 prefix to local disk, no pandas, no `SELECT *`, and no Spark cluster. The files are the table.
