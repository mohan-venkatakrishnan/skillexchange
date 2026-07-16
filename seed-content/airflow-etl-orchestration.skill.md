---
title: ETL Orchestration with Apache Airflow Skill
category: Data
description: Build Airflow pipelines that survive backfills, source-database pressure, and 3am pages instead of DAGs that quietly re-run the same rows twice. Covers idempotent tasks keyed on the data interval, the TaskFlow API, deferrable operators, pools, XCom discipline, and the top-level-code parse loop that takes down production APIs.
usage: Load this skill before asking your AI assistant to write, review, or refactor any Airflow DAG. Say "use the Airflow ETL orchestration skill" and describe your source, sink, and schedule; the assistant will produce DAGs that are idempotent, parse-cheap, and concurrency-bounded instead of the tutorial DAG that works once and stampedes on the first backfill.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 26
pocUrl: https://github.com/apache/airflow
---

# ETL Orchestration with Apache Airflow Skill

## 1. Philosophy

Airflow is not a cron that runs Python. It is a scheduler that repeatedly *parses your file* and *replays your intervals*. Every bug that has ever woken me up comes from forgetting one of those two facts.

**A DAG file is a declaration, not a script.** The scheduler imports it on a loop — by default every 30 seconds, on every scheduler and every worker. Whatever sits at module level runs on that loop. Not once. Not at execution time. Continuously, in a process nobody is watching.

**A task is a pure function of its data interval.** Given `data_interval_start` and `data_interval_end`, a task must produce the same result whether it runs once, three times, or two years late during a backfill. If a task reads `datetime.now()`, it is not a task — it is a coin flip with a retry policy.

1. **Nothing expensive at module level.** No API calls, no queries, no secret fetches. If you cannot import a DAG file with the network unplugged, it is broken.
2. **Idempotent or it doesn't ship.** Every write is a delete-then-insert, a `MERGE`, or an atomic partition swap scoped to the interval. Never a bare `INSERT`.
3. **Bound everything.** Pools, `max_active_runs`, and timeouts are part of the DAG definition, not knobs you reach for after an incident.

The failure mode that defines this skill: a DAG that works beautifully on today's data and destroys your source database the first time someone clears a month of runs.

## 2. Tech Stack

- **Apache Airflow** — https://github.com/apache/airflow — licensed **Apache-2.0**. The scheduler, executor, metadata database, and UI behind everything below.
- **Airflow 2.7+** — assumed throughout. TaskFlow, deferrable operators, and datasets all matter here; on 1.x, upgrade before reading further.
- **Postgres** — as a representative source and as the metadata database. Examples use ANSI-ish SQL and port cleanly to Snowflake/BigQuery. Pair it with a `pytest` DAG-import test that fails CI when a file parses slower than a second.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Apache Airflow maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 The parse loop: the outage that teaches this skill

The most expensive Airflow mistake I have seen in production, reduced to its essence:

```python
# WRONG — this is a DAG file, and this line runs every parse
ACCOUNTS = requests.get("https://api.vendor.com/v1/accounts").json()  # <-- every 30s

with DAG("sync_accounts", schedule="@daily", start_date=datetime(2024, 1, 1)):
    for account in ACCOUNTS:
        PythonOperator(task_id=f"sync_{account['id']}", python_callable=sync, op_args=[account])
```

This DAG ran twice a day. The vendor API saw it **2,880 times a day** — two schedulers, each parsing every 30 seconds, times 24 hours. We found it when the vendor rate-limited our whole account and the sales dashboard went dark. The parse loop had been hammering them for six weeks, and *the DAG was green the entire time.* Defer the fan-out to runtime with dynamic task mapping:

```python
@dag(schedule="@daily", start_date=pendulum.datetime(2024, 1, 1, tz="UTC"),
     catchup=False, max_active_runs=1)
def sync_accounts():
    @task
    def list_accounts() -> list[dict]:
        import requests  # imported in a worker, at runtime, once per run
        return requests.get("https://api.vendor.com/v1/accounts", timeout=30).json()

    @task(max_active_tis_per_dag=4)  # never more than 4 in flight against the vendor
    def sync_one(account: dict) -> str: return do_sync(account["id"])

    sync_one.expand(account=list_accounts())
```

### 3.2 Idempotency: key every write on the data interval

`data_interval_start` / `data_interval_end` are the only clock a task may read. They are stable across retries, across backfills, and when someone clears a run from 2023.

```python
@task
def load_orders(data_interval_start=None, data_interval_end=None):
    PostgresHook(postgres_conn_id="warehouse").run(
        """delete from analytics.orders where ordered_at >= %(lo)s and ordered_at < %(hi)s;
           insert into analytics.orders (id, ordered_at, customer_id, total_cents)
           select id, ordered_at, customer_id, total_cents from raw.orders
            where ordered_at >= %(lo)s and ordered_at < %(hi)s;""",
        parameters={"lo": data_interval_start, "hi": data_interval_end},
        autocommit=False,  # one transaction: delete and insert land together or not at all
    )
```

Half-open interval `[start, end)`, delete-then-insert in one transaction, no `now()` anywhere. Run it ten times, get one copy. The `now()` version of this shipped once: a retry after a network blip re-read `now()`, landed in the next hour's window, and duplicated 40,000 order rows into a revenue dashboard. Finance found it before we did.

### 3.3 TaskFlow API: dependencies from data, not from arrows

Prefer `@task` and function calls over operators and `>>` chains — the graph falls out of the Python, and XComs are handled for you.

```python
@task
def extract(data_interval_start=None, data_interval_end=None) -> str:
    key = f"raw/sessions/{data_interval_start:%Y/%m/%d/%H}.parquet"
    dump_to_s3(key, lo=data_interval_start, hi=data_interval_end)
    return key  # a path, not a payload

@task
def transform(key: str) -> str:
    out = key.replace("raw/", "staged/"); s3_transform(key, out); return out

load(transform(extract()))  # the graph is the call tree; no `>>` required
```

`>>` still earns its place for non-data ordering ("don't refresh until the vacuum finishes"), but a `>>` between two tasks that also pass data is a dependency declared twice.

### 3.4 Sensors will eat your cluster; defer instead

A classic sensor is a task that sleeps in a worker slot. We had 32 slots, 29 of them held by `S3KeySensor` in poke mode, average wait 4 hours — so the pipeline that was *supposed* to write those files couldn't get a slot. It looked like Airflow had hung; it was a deadlock we wrote ourselves.

```python
wait = S3KeySensor(
    task_id="wait_for_drop",
    bucket_key="s3://vendor-drop/{{ data_interval_start | ds }}/orders.csv",
    deferrable=True,      # runs on the triggerer, costs ~0 worker slots
    poke_interval=60,
    timeout=60 * 60 * 6,  # always. a sensor without a timeout is a slot leak with a UI
)
```

Any sensor that can wait longer than five minutes is `deferrable=True`, or at minimum `mode="reschedule"`. Never leave the default poke mode on a long wait.

### 3.5 Pools: your source has a connection budget, so spend it explicitly

Airflow's concurrency defaults are generous; your Postgres replica's `max_connections` is not. Pools tell Airflow about a limit that lives outside Airflow — `@task(pool="source_pg", pool_slots=1)` on a mapped extract means 60 tables queue politely through 8 slots instead of launching at once.

We learned this by exhausting a replica's 200-connection limit at 02:15 on a Sunday: a mapped extract across 60 tables, each opening a connection pool of its own, plus a concurrent backfill. Every application sharing that replica started throwing `FATAL: sorry, too many clients already`.

The layered budget, all set deliberately: **`pool` size** = the source's safe concurrent connections, across all DAGs; **`max_active_runs`** = `1` for anything writing to a warehouse; **`max_active_tasks`** = 8–16 per DAG; **`max_active_tis_per_dag`** for third-party rate limits. `max_active_runs=1` is the one people skip, and the one that stops a backfill from running 90 days concurrently.

### 3.6 Backfills: assume they happen, at the worst time

Someone will clear a month of runs to "fix that one bad day." Design so this is boring:

- `catchup=False` on every DAG unless you deliberately decided otherwise and wrote down why. A DAG with `start_date=2021-01-01` and `catchup=True` that gets unpaused today immediately schedules ~1,600 runs. I have watched that fill a scheduler queue in under a minute.
- `max_active_runs=1` so a cleared range runs serially instead of as a thundering herd.
- For wide ranges, prefer a backfill *task* that loops intervals at your pace, in your pool, over `airflow dags backfill` — easier to reason about, easier to kill — and point it at a read replica via a separate connection id, never at the primary.

### 3.7 XCom: push paths, never payloads

XCom values serialize into the metadata database — a practical ceiling around 48KB on Postgres, and even where it fits it does not belong there.

```python
@task
def extract_wrong() -> pd.DataFrame:                  # a 400MB frame through the metadata DB
    return pd.read_sql("select * from orders", conn)

@task
def extract_right(data_interval_start=None) -> str:   # data to S3, pointer through XCom
    key = f"s3://lake/staging/orders/{data_interval_start:%Y-%m-%dT%H}.parquet"
    pd.read_sql(sql, conn, params={...}).to_parquet(key)
    return key                                        # 62 bytes
```

XCom carries identifiers, paths, row counts, and small dicts. If you are asking whether your XCom is too big, it is.

### 3.8 Retries, timeouts, and alerts people actually read

```python
default_args = {
    "retries": 3, "retry_delay": pendulum.duration(minutes=5),
    "retry_exponential_backoff": True, "max_retry_delay": pendulum.duration(minutes=30),
    "execution_timeout": pendulum.duration(hours=2),  # kill hung tasks
}
```

- Retry transient things (network, throttles, lock timeouts). Never retry a non-idempotent task — you are just running the bug three more times.
- `execution_timeout` on every task. A task hung on a socket read holds its slot until a human notices, which is usually the next morning.
- Alert on the pipeline promise, not on task noise. One alert on the final `load` beats twelve from mapped extracts.
- SLA misses mean "late," failures mean "broken." Route them separately or people mute both.

### 3.9 Connections and secrets

Credentials live in a secrets backend (`AIRFLOW__SECRETS__BACKEND=...SecretsManagerBackend`), referenced by connection id. DAG code carries the id — `PostgresHook(postgres_conn_id="source_pg_replica")` — never the password. And never call `Variable.get()` or `BaseHook.get_connection()` at module level: that is a metadata-database or Secrets Manager round trip on every parse, and it bills like one. Inside a task, always. At import time, never.

## 4. Anti-patterns

- **API calls, queries, or `Variable.get()` at module level.** 2,880 requests a day per scheduler, silently, while the UI stays green.
- **`datetime.now()` inside a task.** Your task is unreproducible and your backfill is fiction. Use the data interval.
- **`catchup=True` with an old `start_date`.** Unpausing schedules years of runs in one breath.
- **Bare `INSERT` as the load step.** The first retry duplicates the interval. Delete-then-insert in one transaction, or `MERGE`.
- **Sensors in default poke mode.** 29 of 32 slots parked on `S3KeySensor` is a self-inflicted deadlock. Use `deferrable=True`.
- **No `max_active_runs`.** A cleared month runs 30 ways at once against a source sized for one.
- **DataFrames through XCom.** The metadata database is not a data lake. Push the S3 key.
- **No `execution_timeout`.** A hung socket read holds a slot until someone notices. That someone is you, at 3am.
- **One 200-task DAG "so it's all in one place."** Parse time climbs, the graph is unreadable, and one poison task blocks nine teams.
- **Retries on non-idempotent tasks.** Not resilience — three more chances to corrupt the table.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the pipeline as a contract: "Every hour, pull orders from the Postgres replica for the interval, write Parquet to S3, load into Snowflake. Source tolerates 8 concurrent connections. Late data arrives up to 2 hours behind."
3. Ask for, in order: (a) the DAG skeleton with schedule, `catchup`, `max_active_runs`, pools; (b) tasks with their idempotent write statements; (c) the deferral strategy for upstream waits; (d) alerting.
4. Run section 4 as a review checklist. Read the module level of the file first — that is where the outage hides.
5. Verify by clearing a two-day range in dev and confirming row counts do not change.

The assistant should refuse to place I/O at module level, refuse to write a non-idempotent load task, and ask for the source's concurrency budget before generating mapped tasks.

## 6. Example Output

Prompt given with this skill loaded: *"Hourly DAG: pull events from our Postgres replica, land Parquet in S3, load into the warehouse. The replica handles 6 concurrent connections. Alert me if the load hasn't finished within 90 minutes."* Expected shape of the answer:

```python
@dag(dag_id="events_hourly", schedule="@hourly", catchup=False, max_active_runs=1,
     start_date=pendulum.datetime(2024, 6, 1, tz="UTC"),
     default_args={"retries": 3, "retry_delay": pendulum.duration(minutes=5),
                   "retry_exponential_backoff": True,
                   "execution_timeout": pendulum.duration(minutes=45)})
def events_hourly():
    @task(pool="source_pg", pool_slots=1)   # 6-slot pool = the replica's budget
    def extract(data_interval_start=None, data_interval_end=None) -> str:
        df = PostgresHook(postgres_conn_id="source_pg_replica").get_pandas_df(
            "select id, occurred_at, user_id, kind, payload from events "
            "where occurred_at >= %(lo)s and occurred_at < %(hi)s",
            parameters={"lo": data_interval_start, "hi": data_interval_end})
        key = f"s3://lake/staging/events/{data_interval_start:%Y/%m/%d/%H}.parquet"
        df.to_parquet(key, index=False)
        return key  # the path, not the frame

    @task(sla=pendulum.duration(minutes=90))
    def load(key: str, data_interval_start=None, data_interval_end=None) -> None:
        with PostgresHook(postgres_conn_id="warehouse").get_conn() as conn, conn.cursor() as cur:
            cur.execute("delete from analytics.events "
                        "where occurred_at >= %(lo)s and occurred_at < %(hi)s",
                        {"lo": data_interval_start, "hi": data_interval_end})
            cur.execute(f"copy analytics.events from '{key}' (format parquet)")
            conn.commit()

    load(extract())
```

Plus the pool, created once as infrastructure rather than assumed — `airflow pools set source_pg 6 "Connection budget for the orders replica"`.

Note what the output does *not* contain: no module-level database call, no `datetime.now()`, no `catchup=True`, no DataFrame through XCom, and no `INSERT` without the matching `DELETE`. Clear any hour twice and the row count is identical — the only property that makes a 3am rerun a non-event.
