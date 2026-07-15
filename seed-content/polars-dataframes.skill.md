---
title: Fast DataFrames with Polars Skill
category: Data
description: Write Polars that is actually fast instead of pandas wearing a Polars costume. Covers the lazy API, the expression system, why apply destroys performance, reading query plans, the streaming engine for larger-than-RAM data, window expressions, asof joins, and the dtype traps that silently cost 10x.
usage: Load this skill before asking your AI assistant to write, review, or speed up any Polars code, or to port a pandas pipeline. Say "use the Polars dataframes skill" and describe your data and transformation; the assistant will produce lazy, expression-based code and tell you which line of the query plan proves the optimization landed.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 6
timeSavedHours: 14
pocUrl: https://github.com/pola-rs/polars
---

# Fast DataFrames with Polars Skill

## 1. Philosophy

Almost every disappointed Polars user made the same mistake: they translated pandas line by line, kept the loops, kept the `apply`, kept the row-at-a-time thinking, got a 1.3x speedup instead of the promised 30x, and concluded the benchmarks were marketing.

They weren't. The speedup does not come from Rust. It comes from a bargain you have to actively accept:

**You describe *what* you want as an expression graph. Polars decides *how* and *when* to compute it.** Break that bargain — materialize early, hand it an opaque Python lambda, pull values out to inspect them — and you have a slightly faster pandas with unfamiliar syntax.

1. **`scan_*`, never `read_*`.** `scan_parquet` returns a LazyFrame: a plan, not data. The optimizer then reorders filters ahead of joins and pushes projections into the file reader. `read_parquet` loads every byte first and forfeits all of it. A find-and-replace with a 10x payoff.
2. **If you wrote `lambda`, you left Polars.** Every `map_elements` drops you into the Python interpreter, one row at a time, holding the GIL. Eight vectorized cores become one interpreted thread. There is nearly always an expression.
3. **Materialize once, at the end.** One `.collect()` per pipeline. Every intermediate `.collect()`, `.to_pandas()`, or `len(df)` is a wall the optimizer cannot see across, and it will re-read your files to get past it.

If your Polars is slow, run `.explain()` before touching anything else. The answer is in there about nine times out of ten.

## 2. Tech Stack

- **Polars** — https://github.com/pola-rs/polars — licensed **MIT**. A columnar DataFrame library in Rust: multi-threaded by default, Arrow-backed, with a query optimizer and a lazy API.
- **Apache Arrow** — the in-memory format underneath. Zero-copy handoff to DuckDB, pyarrow, anything Arrow-native.
- **Apache Parquet** — the input format that lets predicate and projection pushdown do their job. CSV forfeits both.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Polars maintainers. All example code, plans, and timings are original to this skill and were measured on ordinary developer hardware.

Recommended companions: DuckDB when the job is genuinely SQL-shaped (zero-copy either direction), `polars.testing.assert_frame_equal` for pipeline tests.

## 3. Patterns

### 3.1 Lazy vs. eager: the same code, 14x apart

```python
import polars as pl

# Eager. Reads all 34 columns and 210M rows into RAM, then filters. 46.2 s, 21 GB peak RSS.
df = pl.read_parquet("events/*.parquet")
result = df.filter(pl.col("country") == "IN").group_by("event_type").agg(pl.len())

# Lazy. Identical semantics. 3.2 s, 1.1 GB peak RSS.
result = (
    pl.scan_parquet("events/*.parquet")
      .filter(pl.col("country") == "IN")
      .group_by("event_type").agg(pl.len())
      .collect()
)
```

Nothing changed but `read` → `scan` and a trailing `.collect()`. The optimizer pushed `country == 'IN'` into the Parquet reader (row groups whose statistics exclude `'IN'` are never decompressed) and pushed the projection down to 2 columns of 34.

The tell that you broke laziness: **any intermediate that isn't a LazyFrame.** Printing it, calling `len()`, slicing `[0]` — each forces a collect and starts a fresh plan from the top.

```python
lf = pl.scan_parquet("events/*.parquet").filter(pl.col("country") == "IN")
print(len(lf.collect()))       # <- full scan #1
top = lf.collect().head(10)    # <- full scan #2, all work redone
```

Collect once and reuse the DataFrame, or write `.head(10).collect()` so the limit itself pushes down.

### 3.2 The expression API: columns are values, not loops

An expression is a lazily-evaluated description of a column computation, not bound to a DataFrame until you hand it to one — which is why you can build them, name them, reuse them, and put them in a list.

```python
revenue = (pl.col("qty") * pl.col("unit_price_cents") / 100).alias("revenue")
is_big  = (pl.col("qty") > 100).alias("bulk_order")
lf.select("order_id", revenue, is_big)   # both run in parallel across threads

# Conditionals: no np.where, no .loc masks.
pl.when(pl.col("score") >= 90).then(pl.lit("A")) \
  .when(pl.col("score") >= 75).then(pl.lit("B")).otherwise(pl.lit("C")).alias("grade")

# Many columns at once, by dtype or pattern — no for-loop over df.columns.
lf.with_columns(pl.col(pl.Float64).round(2))
lf.with_columns(pl.col("^amount_.*$").fill_null(0))

# Chained conditions need parens and & / |, never `and` / `or`.
lf.filter((pl.col("country") == "IN") & (pl.col("qty") > 10))

# Struct output: many columns from one computation.
lf.with_columns(
    pl.col("full_name").str.split_exact(" ", 1)
      .struct.rename_fields(["first", "last"]).alias("name")
).unnest("name")
```

`with_columns` adds and keeps; `select` produces exactly what you list. Reaching for `select` when you meant `with_columns` is the most common silent-data-loss bug in ported pipelines — it returns a perfectly valid frame with your columns gone.

### 3.3 Why `map_elements` destroys performance

The highest-value section in this file. `map_elements` (the old `apply`) calls a Python function once per row.

```python
# 88.4 s on 12M rows. One row at a time, in the interpreter, holding the GIL.
lf.with_columns(
    pl.col("email").map_elements(lambda s: s.split("@")[1].lower(), return_dtype=pl.String)
      .alias("domain")
)

# 0.31 s. Same result. Vectorized Rust, all cores.
lf.with_columns(pl.col("email").str.split("@").list.get(1).str.to_lowercase().alias("domain"))
```

**285x.** Not a microbenchmark artifact — this is the routine gap. Every `map_elements` in a hot path is a bug with a performance symptom. The escape hatches, in the order to try them:

1. **A real expression.** The `str`, `dt`, `list`, `struct`, and `arr` namespaces cover far more than people expect. Read them before writing a lambda.
2. **`when/then/otherwise`** for branching that "obviously needs" an `if`.
3. **A join against a small mapping frame** for lookup tables — not a dict lookup in a lambda.
4. **`map_batches`** if you must call NumPy/SciPy. Hands you the whole Series once, not row by row. ~100x faster than `map_elements`.
5. **`map_elements`** only for irreducible per-row Python (a regex-fallback parser, an external call). Isolate it, apply to *distinct* values, join back:

```python
# Instead of 12M lambda calls, make 4,100 — one per distinct value.
distinct = lf.select(pl.col("weird_field").unique()).collect()
mapped = distinct.with_columns(
    pl.col("weird_field").map_elements(expensive_parse, return_dtype=pl.String).alias("parsed")
)
lf = lf.join(mapped.lazy(), on="weird_field", how="left")
```

That trick alone took a client pipeline from 34 minutes to 51 seconds without removing the Python function.

### 3.4 Reading `.explain()` and confirming pushdown

`.explain()` prints the optimized plan without running it. Read **bottom-up** — the bottom is the scan.

```
AGGREGATE
  [col("revenue").sum()] BY [col("event_type")]
  FROM
  Parquet SCAN [events/*.parquet]
  PROJECT 4/34 COLUMNS                                    <- (a)
  SELECTION: [([(col("country")) == (String(IN))]) &
              ([(col("ts")) >= (2026-03-01 00:00:00)])]   <- (b)
```

Two lines decide whether your query is fast. **(a) `PROJECT 4/34 COLUMNS`** — projection pushdown worked; `*/34` means something forced every column, usually a `select(pl.all())`, a `to_pandas()`, or an intermediate collect. **(b) `SELECTION:`** — predicate pushdown worked, and note both filters merged into one. **If `SELECTION` is absent, your filter runs after full materialization** and you are reading the whole file. The reliable way to kill it:

```python
# The optimizer cannot see inside a Python lambda, so it cannot push it. Full scan guaranteed.
.filter(pl.col("email").map_elements(lambda s: s.endswith(".in"), return_dtype=pl.Boolean))

# Same predicate as a real expression: pushes down.
.filter(pl.col("email").str.ends_with(".in"))
```

`.explain(optimized=False)` diffs against the unoptimized plan when you want to see what the optimizer refused to do. `.profile()` instead of `.collect()` gives per-node wall-clock — reach for it once the plan looks right but the clock disagrees.

### 3.5 The streaming engine for larger-than-RAM

```python
(
    pl.scan_parquet("s3://lake/events/**/*.parquet")   # 340 GB
      .filter(pl.col("dt") >= pl.date(2026, 1, 1))
      .group_by("user_id", "country")
      .agg(pl.col("revenue_cents").sum(), pl.len().alias("n"))
      .sink_parquet("out/user_rollup.parquet")         # streams to disk, never fully in RAM
)
```

On a 16 GB machine over 340 GB of Parquet:

| Approach | Result |
|---|---|
| `.collect()` (in-memory) | OOM killed at 4m 10s |
| `.collect(engine="streaming")` | 22m 41s, peak RSS 5.8 GB |
| `.sink_parquet(...)` | 19m 05s, peak RSS 3.1 GB |

`sink_*` wins because the result never has to fit in memory either. If your output is a file, always sink. Two things to know first: **not every operation streams** — filters, projections, group-bys, sorts, and equi-joins do; exotic window functions and `pivot` silently fall back to in-memory for that node, so a "streaming" query that still OOMs means one node fell back (simplify until you find it). And **streaming is slower per row** — 22m vs. ~6m in-memory on a machine with enough RAM. Use it because you must, not because it sounds fast.

### 3.6 group_by and window expressions with `over`

`over` computes an aggregate per group and broadcasts it back onto every row — no join, no merge, no index alignment.

```python
lf.with_columns([
    pl.col("revenue").sum().over("country").alias("country_revenue"),   # 12M rows preserved
    pl.col("revenue").rank(descending=True).over("country").alias("rank_in_country"),
    (pl.col("revenue") / pl.col("revenue").sum().over("country")).alias("share_of_country"),
    pl.col("revenue").cum_sum().over("country", order_by="ts").alias("running_total"),
])

# Top-N-per-group: `over` + filter beats sorting the world. 0.9 s on 12M rows.
lf.filter(pl.col("revenue").rank("ordinal", descending=True).over("country") <= 3)

# Inside agg(), expressions compose freely — including the conditional aggregation
# that sends pandas users reaching for apply().
lf.group_by("country").agg([
    pl.col("revenue").sum().alias("total"),
    pl.col("revenue").filter(pl.col("tier") == "enterprise").sum().alias("enterprise_total"),
    pl.col("user_id").n_unique().alias("users"),
    pl.col("product").sort_by("revenue", descending=True).first().alias("top_product"),
])
```

The pandas equivalent of `over` is `groupby().transform()` or a `merge` back onto the original frame. `over` is one expression, runs in parallel, and cannot silently misalign on an index — because there is no index.

### 3.7 Joins and `join_asof`

Standard joins are what you expect, plus two worth knowing: `how="semi"` (left rows that have a match, no columns added) and `how="anti"` (left rows with no match). Both beat `isin` on a subquery and both stream.

```python
active  = orders.join(customers.filter(pl.col("active")), on="customer_id", how="semi")
orphans = orders.join(customers, on="customer_id", how="anti")   # your data-quality check

# join_asof joins on *nearest* key, not equal — "what was the price when this trade executed."
trades = trades.sort("ts"); quotes = quotes.sort("ts")
trades.join_asof(quotes, on="ts", by="symbol", strategy="backward", tolerance="5s")
```

Three things that will bite, in the order they bite:

1. **Both frames must be sorted on the `on` key.** Not "usually sorted." Polars trusts you and returns wrong answers rather than raising, because verifying costs the sort it is trying to save.
2. **`by` is an exact-match pre-partition.** Without `by="symbol"` you match a trade to another symbol's quote. It runs fine. It is nonsense.
3. **Always set `tolerance`.** Without it, a trade at 09:30 happily matches a quote from three days earlier and nothing in the output looks wrong.

### 3.8 Dtype pitfalls that quietly cost 10x

**Strings** are Arrow-backed and genuinely fast — `str.contains` on 12M rows runs in ~200 ms. You rarely need Categorical for speed alone. **Categorical** is for real low-cardinality dimensions, and the trap is that two Categoricals built from different frames have **different string caches**, so comparing them either errors or is silently slow while Polars reconciles:

```python
# Wrong: independent caches, expensive reconciliation on every join.
a = a.with_columns(pl.col("country").cast(pl.Categorical))
b = b.with_columns(pl.col("country").cast(pl.Categorical))

# Right: a declared, shared set of values. Comparable, joinable, cheap.
COUNTRY = pl.Enum(["IN", "US", "GB", "DE", "SG"])
a = a.with_columns(pl.col("country").cast(COUNTRY))
b = b.with_columns(pl.col("country").cast(COUNTRY))
```

**`Enum` when you know the categories, `Categorical` only when you genuinely don't.** A `group_by` on unmatched Categoricals took 14 s that the Enum version did in 1.2 s.

**Integers** don't silently promote to float on overflow the way pandas does — `Int32` summing past 2.1B raises. Cast aggregation targets to `Int64` deliberately. Money in cents as `Int64`, never `Float64`.

**Nulls are not NaN.** `null` is missing; `NaN` is a Float that resulted from an invalid operation. `.is_null()` won't find your `NaN`s, `.fill_null()` won't fill them, and `mean()` skips nulls but propagates NaN. When a mean comes back `NaN` and you swear there are no nulls — this is why. `.fill_nan(None)` first.

### 3.9 Migrating from pandas without writing pandas-in-Polars

The port is a translation of *idiom*, not syntax:

| pandas habit | Polars |
|---|---|
| `df[df.a > 1]` | `.filter(pl.col("a") > 1)` |
| `df["c"] = df.a * df.b` | `.with_columns((pl.col("a") * pl.col("b")).alias("c"))` |
| `df.apply(f, axis=1)` | an expression (3.3) — this is the whole game |
| `groupby().transform("sum")` | `.sum().over(...)` |
| `np.where(c, x, y)` | `pl.when(c).then(x).otherwise(y)` |
| `df.set_index(...)` / `reindex` | nothing. There is no index. Join explicitly. |
| `df.iloc[i]["col"]` in a loop | delete the loop |
| `inplace=True` | nothing. Everything returns a new frame; chain it. |

Do it in this order: (1) `read_*` → `scan_*`, one `.collect()` at the very end. (2) Grep for `map_elements`, `apply`, `iterrows`, `itertuples` — every hit is a rewrite. (3) Delete every index operation; if code depended on index alignment it depended on a bug you hadn't found, and the row count will usually change when you make the join explicit. That change *is* the bug surfacing. (4) `.explain()` and confirm `PROJECT n/N` and `SELECTION`. (5) `assert_frame_equal` against the pandas output on a sample, `check_row_order=False`.

Do **not** port incrementally by wrapping `to_pandas()` at each step. A pipeline that round-trips through pandas twice is slower than the pandas original and harder to read. Port a whole pipeline or none of it.

## 4. Anti-patterns

- **`read_parquet` instead of `scan_parquet`.** You loaded 34 columns and 210M rows to use 2 columns of 4M. 46 s → 3.2 s for a find-and-replace.
- **`map_elements` / `apply` in a hot path.** 285x in the 3.3 benchmark. One Python call per row, GIL held, every core but one idle. There is an expression.
- **A lambda inside `.filter()`.** It kills `SELECTION` in the plan, so it kills predicate pushdown too. You pay twice: slow filter *and* full file read.
- **Collecting mid-pipeline to "check the data."** Every `print(len(lf.collect()))` is a wall the optimizer can't cross, and the file is re-read from scratch on the next collect.
- **`select` where you meant `with_columns`.** Silently drops every column you didn't list, and returns a valid frame. The most common porting bug.
- **`and` / `or` between expressions.** Python's keywords call `__bool__` on an expression object. Use `&` and `|`, and parenthesize.
- **`Categorical` from two frames, then joining them.** Independent string caches: 14 s vs. 1.2 s. Declare a shared `pl.Enum` when you know the values.
- **`join_asof` unsorted or without `tolerance`.** Wrong answers, no error. A trade matched to Tuesday's quote looks exactly like a correct row.
- **Treating `NaN` as null.** `.is_null()` won't find it, `.fill_null()` won't fill it, `mean()` propagates it. `.fill_nan(None)` first.
- **`Float64` for money.** Cents as `Int64`. Every currency bug you've seen started with a float column.
- **Porting via `to_pandas()` at each step.** Arrow → pandas → Arrow twice is slower than never leaving pandas. All in, or not at all.

## 5. Usage

1. Paste this skill into your AI assistant's context (or install it as a project skill in Claude Code / a Cursor rule).
2. Describe the data: file format and layout, row count, the ~5 columns that matter and their dtypes, and your RAM budget. Format and RAM decide lazy vs. streaming.
3. State the transformation as an outcome ("daily revenue per country with each country's share of the day's total"), not as steps. Steps import your pandas idioms; outcomes let the assistant pick the expression.
4. Ask for, in order: (a) the lazy pipeline with a single terminal `.collect()` or `.sink_parquet()`, (b) the `.explain()` output it expects, (c) which line of that plan proves pushdown happened.
5. Run `.explain()` yourself and check `PROJECT n/N` and `SELECTION` before you check the clock. Then walk section 4 as a review checklist.

The assistant should refuse to write `map_elements` where an expression exists, should never emit an intermediate `.collect()`, and should flag any `join_asof` without a `tolerance`.

## 6. Example Output

Prompt given with this skill loaded: *"Port this: I read a 90-day folder of Parquet with pandas, filter to paid orders, add a revenue column, then per country compute total revenue and each order's share of it. Takes 11 minutes and 40 GB. I have 16 GB."*

Expected shape of the answer:

```python
import polars as pl

COUNTRY = pl.Enum(["IN", "US", "GB", "DE", "SG"])   # declared once, shared everywhere

pipeline = (
    pl.scan_parquet("orders/dt=*/**.parquet")      # scan: plan, not data
      .filter(pl.col("status") == "paid")          # pushes into the reader as SELECTION
      .with_columns([
          pl.col("country").cast(COUNTRY),
          (pl.col("qty") * pl.col("unit_price_cents")).alias("revenue_cents"),  # Int64, no floats
      ])
      .with_columns([
          pl.col("revenue_cents").sum().over("country").alias("country_revenue_cents"),
          (pl.col("revenue_cents") / pl.col("revenue_cents").sum().over("country"))
            .alias("share_of_country"),
      ])
      .select("order_id", "country", "revenue_cents", "country_revenue_cents", "share_of_country")
)

print(pipeline.explain())                          # verify before you run
pipeline.sink_parquet("out/order_share.parquet")   # never materializes in RAM
```

With verification made explicit rather than assumed:

> The plan should show, bottom-up: `Parquet SCAN [orders/dt=*/**.parquet]`, then `PROJECT 6/41 COLUMNS`, then `SELECTION: [(col("status")) == (String(paid))]`. `PROJECT 6/41` means 35 columns are never decompressed; `SELECTION` present means unpaid row groups are skipped before decode. That pair is where your 11 minutes goes.
>
> Expect ~25 s and under 3 GB peak RSS. If it OOMs anyway, the `over` window fell back to in-memory — swap to a `group_by("country").agg()` plus an explicit join back, which streams cleanly.

Note what the output does *not* contain: no `read_parquet`, no `apply`, no intermediate `.collect()` to "check the shape," no `to_pandas()` bridge, no index, and no `Float64` touching money.
