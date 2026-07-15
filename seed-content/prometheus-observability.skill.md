---
title: Metrics and Alerting with Prometheus Skill
category: DevOps
description: Instrument services with Prometheus metrics that stay cheap at scale and alert on symptoms your users actually feel. Covers metric type selection, naming, RED/USE, cardinality control, histogram buckets, recording rules, and retention sizing.
usage: Load this skill before asking your AI assistant to add instrumentation, write PromQL, or author alerting rules. Say "use the Prometheus observability skill" and describe the service and its SLO; the assistant will produce metric definitions, queries, and alerts that respect a cardinality budget instead of copying tutorial snippets.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 7
timeSavedHours: 20
pocUrl: https://github.com/prometheus/prometheus
---

# Metrics and Alerting with Prometheus Skill

## 1. Philosophy

Prometheus is not a logging system with graphs. It is a time-series database with a brutal cost model: **every unique combination of metric name and label values is one series, and every series costs RAM whether or not anyone ever queries it.**

Three rules govern everything below:

1. **Labels are dimensions, not data.** A label value must come from a small, bounded, known-in-advance set: `method="GET"`, `status="500"`. If you cannot write the complete list of possible values on a napkin, it is not a label. It is a log field.
2. **Alert on symptoms, page on pain.** Users do not care that a disk is 81% full. They care that checkout returns 500s. Cause-based alerts fire constantly and teach people to ignore the pager.
3. **The cost of a metric is paid forever.** A series costs ~1–2 bytes/sample on disk but ~3–4 KB of RAM while active. 14 million active series is not a graph problem — it is an OOM.

If you are instrumenting to answer "what happened to this one request," you want tracing. Prometheus answers "what is happening to this *population* of requests," and does it better than anything else for about a dollar a month.

## 2. Tech Stack

- **Prometheus** — https://github.com/prometheus/prometheus — licensed **Apache-2.0**. Scrape-based collection, TSDB storage, PromQL, and a bundled rule evaluator.
- **Alertmanager** — Apache-2.0. Dedup, grouping, silencing, routing. Prometheus decides *what* fires; Alertmanager decides *who* wakes up.
- **Client libraries** — the official instrumentation libraries (Go, Python, Java, Rust), Apache-2.0.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Prometheus maintainers. All example code and queries are original to this skill.

On dashboards: Grafana relicensed to AGPL-3.0 in 2021, so a permissive-licence-sensitive stack deliberately does not build on it. Prometheus's expression browser and the Alertmanager UI cover the on-call path; treat dashboards as a separate, replaceable decision. Nothing here requires one.

## 3. Patterns

### 3.1 The four metric types, and when each is wrong

| Type | Use for | Wrong when |
|---|---|---|
| Counter | Monotonic totals: requests, errors, bytes | You need a value that can go down. A decreasing counter reads as a reset and `rate()` invents a huge spike. |
| Gauge | Point-in-time: queue depth, in-flight, memory | You want a rate. `rate()` on a gauge is meaningless. |
| Histogram | Latency and sizes, quantiles across instances | Buckets are wrong (3.4), or the observed value has unbounded labels. |
| Summary | Client-side quantiles on a single instance | Almost always. Summary quantiles **cannot be aggregated** — a p99 from 12 pods cannot combine into a fleet p99. |

Default: histogram for anything timed, counter for anything counted. Reach for summary only when you have one instance and know why.

```python
# Original example: counter, gauge, histogram on one HTTP handler.
REQUESTS = Counter(
    "http_requests_total",              # _total suffix: it is a counter
    "HTTP requests handled.",
    ["method", "route", "status"],      # bounded: ~6 x ~40 x ~8
)
IN_FLIGHT = Gauge("http_requests_in_flight", "Requests currently being served.")
LATENCY = Histogram(
    "http_request_duration_seconds",    # base unit: seconds, never ms
    "HTTP request latency.",
    ["route"],                          # NOT status, NOT user_id
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)
```

### 3.2 Naming and base units

Format: `<namespace>_<subsystem>_<thing>_<unit>[_total]` — `checkout_payment_attempts_total`, `db_pool_connections_open`. Renaming after six months of recording rules is a migration, so get it right on day one.

**Base units only: seconds, bytes, ratios.** Never `_ms`, `_kb`, `_percent`. Store `0.42`, render `42%` at display time. Mixed units are how someone alerts on `> 5` meaning milliseconds while the metric is in seconds. Counters end in `_total`; gauges do not. Histograms give you `_bucket`/`_sum`/`_count` — do not add those suffixes yourself. `le` and `quantile` are reserved label names.

### 3.3 RED for services, USE for resources

**RED** — anything serving requests: Rate, Errors, Duration.

```promql
# Rate
sum by (route) (rate(http_requests_total[5m]))

# Errors — a ratio, so it is comparable across services
sum by (route) (rate(http_requests_total{status=~"5.."}[5m]))
  / sum by (route) (rate(http_requests_total[5m]))

# Duration — aggregated correctly across every instance
histogram_quantile(0.99,
  sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))
```

**USE** — anything with finite capacity (CPU, disk, connection pools): Utilization, Saturation, Errors. Utilization is "how busy"; saturation is "how much work is queued *because* it is too busy." Saturation is the one people forget, and the one that predicts an outage.

```promql
db_pool_connections_waiting / db_pool_connections_max
```

### 3.4 Histogram buckets, and why rate() comes first

`histogram_quantile()` interpolates *inside* a bucket. If 97% of traffic lands in `le="1.0"` and the next boundary is `le="10.0"`, your p99 is a linear guess across a nine-second gap. It will be wrong and it will look precise.

Pick buckets around your SLO. "p99 under 300ms" needs boundaries at 0.1, 0.2, 0.25, 0.3, 0.4, 0.5 — dense where the decision is made. Every bucket is a series per label combination: 10 buckets × 40 routes = 400 series before `_sum` and `_count`. It is a budget, not a wish list.

```promql
# WRONG — quantile over a raw cumulative counter. Computes the quantile over all
# history since process start, so it barely moves during an incident.
histogram_quantile(0.99, http_request_duration_seconds_bucket)

# RIGHT — rate() first (windows it, handles resets), then sum by (le), then quantile.
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
```

Never `sum(histogram_quantile(...))` — that is arithmetic on percentiles, which is meaningless.

### 3.5 Cardinality explosions: the war story

A payments API ran at a steady **~200,000 active series** across 12 pods — about 1.4 GB of head RAM on a 4 GB Prometheus. Someone shipped a two-line "improvement" to see slow endpoints:

```python
LATENCY.labels(route=request.path).observe(elapsed)   # request.path, not the route template
```

`request.path` is `/invoices/8f3c-…/lines/44`, not `/invoices/{id}/lines/{n}`. Every invoice ID minted a new label value: 12 series per unique path (10 buckets + `_sum` + `_count`), times 12 pods.

Within 90 minutes Prometheus hit **14.2 million active series** and the head block ate the box. The OOM killer took it at 03:10. It restarted, replayed the WAL, re-ingested the same garbage, and OOMed again — a crash loop that also destroyed the alerting we needed to understand the outage. We were blind for 40 minutes because of a monitoring change.

**Spotting it in under a minute** — three queries, in order:

```promql
# 1. Which metric names own the series? The offender is usually 10x the runner-up.
topk(10, count by (__name__) ({__name__=~".+"}))

# 2. Which job is producing them?
topk(10, count by (job, __name__) ({__name__=~".+"}))

# 3. Which label is the exploder? 480 -> fine. 96000 -> found it.
count(count by (route) (http_request_duration_seconds_bucket))
```

Alert on it *before* it hurts — Prometheus exports its own head series count:

```yaml
- alert: SeriesGrowthAbnormal
  expr: prometheus_tsdb_head_series > 1.5e6
  for: 15m
  labels: { severity: warning }
  annotations:
    summary: "TSDB head at {{ $value | humanize }} series — run topk on count by (__name__)"
```

**Fixing it without waiting for a deploy.** `metric_relabel_configs` runs on the scrape path, so it protects the TSDB while the bad build is still live:

```yaml
scrape_configs:
  - job_name: payments-api
    kubernetes_sd_configs: [{ role: pod }]
    metric_relabel_configs:
      # Emergency: drop the exploding label. Series collapse back into one bucket set.
      - regex: "route"
        action: labeldrop

      # Best: keep the label, collapse high-cardinality values into a template.
      - source_labels: [route]
        regex: "/invoices/[^/]+/lines/[^/]+"
        target_label: route
        replacement: "/invoices/{id}/lines/{n}"
```

The permanent fix is in the app: label with the **route template from the router**, never the resolved path. Same for `user_id`, `email`, `session_id`, `trace_id`, and full SQL text. Those are log fields.

### 3.6 Recording rules for expensive queries

A slow query in the browser is a slow query in an alert too — and alerts evaluate it every 15–60s, forever. Precompute it.

```yaml
groups:
  - name: payments-red
    interval: 30s
    rules:
      # Convention: level:metric:operations
      - record: job_route:http_errors:ratio5m
        expr: |
          sum by (job, route) (rate(http_requests_total{status=~"5.."}[5m]))
            / sum by (job, route) (rate(http_requests_total[5m]))

      - record: job_route:http_latency:p99_5m
        expr: |
          histogram_quantile(0.99,
            sum by (job, route, le) (rate(http_request_duration_seconds_bucket[5m])))
```

A dashboard query that took 4.1s over 30 days now reads one pre-aggregated series in ~20ms. Rule of thumb: any query touching more than ~100k series, or used by more than one alert, becomes a recording rule.

### 3.7 Alerting rules: `for:`, symptoms, and `absent()`

```yaml
groups:
  - name: payments-alerts
    rules:
      # SYMPTOM. Users are seeing errors. `for: 10m` means a deploy blip wakes nobody.
      - alert: CheckoutErrorRateHigh
        expr: job_route:http_errors:ratio5m{route="/checkout"} > 0.02
        for: 10m
        labels: { severity: page }
        annotations:
          summary: "Checkout failing {{ $value | humanizePercentage }} of requests"
          runbook: "https://runbooks.internal/checkout-errors"

      # SYMPTOM. Slow is a form of broken.
      - alert: CheckoutLatencyBreachingSLO
        expr: job_route:http_latency:p99_5m{route="/checkout"} > 0.3
        for: 15m
        labels: { severity: page }

      # DEAD SCRAPE. `up == 0` misses the case where the target vanished from service
      # discovery entirely — no target, no `up` series, no alert, silence.
      - alert: PaymentsMetricsMissing
        expr: absent(up{job="payments-api"} == 1)
        for: 5m
        labels: { severity: page }
```

`for:` is the most commonly omitted line in the file. Without it every alert is edge-triggered on a single scrape and your pager becomes noise. Tune it longer than your deploy's unhealthy window.

Cause-based alerts (`DiskWillFillIn4Hours`, `NodeMemoryHigh`) belong at `severity: ticket`, routed to a queue and read in business hours. They are useful. They are not worth a human's sleep unless a symptom alert is also firing.

### 3.8 Retention, sizing, and what this costs

```
bytes ≈ active_series × samples_per_second × retention_seconds × bytes_per_sample

# 200k series, 15s scrape, 30d retention, ~1.7 bytes/sample compressed:
# 200,000 × 0.0667 × 2,592,000 × 1.7 ≈ 58 GB
```

RAM is the harder constraint: budget **3–4 KB per active series** for the head block, plus query working set. 200k series ≈ 800 MB head — 4 GB leaves room for queries. 14M series ≈ 50 GB head, which is why the OOM in 3.5 was instant rather than gradual.

```yaml
--storage.tsdb.retention.time=30d
--storage.tsdb.retention.size=50GB   # whichever hits first; set both, it is a cheap seatbelt
```

Thirty days answers every question you actually ask during an incident. For a quarterly capacity chart, downsample the few series you need via recording rules at a coarse interval and ship *those* to long-term storage. Do not raise global retention — it multiplies every series you failed to prune in 3.5.

## 4. Anti-patterns

- **`user_id`, `email`, `trace_id`, or a raw URL path as a label.** This is the 200k → 14M OOM in 3.5, and the leading cause of Prometheus outages. Template the route; log the ID.
- **`histogram_quantile()` on a raw `_bucket` series.** No `rate()` means a quantile over all-time-since-process-start. It looks calm during the incident it should be screaming about.
- **`sum()` of quantiles, or averaging p99s across pods.** Percentiles do not add. Aggregate buckets with `sum by (le)`, *then* take the quantile.
- **Summary metrics on a multi-replica service.** Client-side quantiles cannot be merged. Twelve pods each reporting "my p99 is 200ms" tells you nothing about the fleet.
- **Alerts with no `for:` clause.** Single-scrape edge triggering. One GC pause pages at 4am, the on-call sees green, and next week they mute the channel.
- **Alerting on causes instead of symptoms.** `NodeMemoryAbove80Percent` fires forever and means nothing. Page on the symptom; ticket the cause.
- **`up == 0` as your only liveness alert.** If the target leaves service discovery, the series stops existing and the alert quietly stops evaluating. Use `absent()`.
- **Non-base units in metric names.** `latency_ms`, `disk_percent`. Someone will compare them against a threshold in the other unit, during an outage.
- **Retention at 400d "just in case."** It multiplies your worst cardinality decision by 13. Downsample instead.
- **No alert on `prometheus_tsdb_head_series`.** The monitoring system is the one system nothing watches. Watch it, or find out via the OOM killer.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the service and, critically, its SLO: "Checkout API, FastAPI, 12 pods, ~800 rps. SLO: 99.9% success, p99 under 300ms."
3. Ask for, in order: (a) metric definitions with an explicit cardinality estimate per label, (b) RED recording rules, (c) alerting rules with `for:` durations and severities, (d) a `metric_relabel_configs` block as a cardinality seatbelt.
4. Challenge every label: ask for the maximum number of distinct values. If the assistant cannot state it, the label is wrong.
5. Run section 4 as a review checklist before merging any instrumentation PR.

The assistant should refuse to put an unbounded identifier in a label, always `rate()` before `histogram_quantile()`, and justify bucket boundaries against the stated SLO rather than emitting a default set.

## 6. Example Output

Prompt given with this skill loaded: *"Instrument our webhook delivery worker. It pulls jobs from a queue, POSTs to customer endpoints, retries with backoff. Page us if deliveries fail or the queue backs up."*

Expected shape of the answer:

```python
# Cardinality budget stated up front:
#   outcome: 3 | attempt: 4 | queue: ~5  ->  ~60 series total.
#   customer_id and target_url are deliberately NOT labels (unbounded). They go in logs.
DELIVERIES = Counter(
    "webhook_deliveries_total", "Webhook delivery attempts.",
    ["queue", "outcome", "attempt"],   # outcome: success|client_error|server_error
)
QUEUE_DEPTH = Gauge("webhook_queue_depth", "Jobs waiting in the queue.", ["queue"])
DELIVERY_LATENCY = Histogram(
    "webhook_delivery_duration_seconds", "Time for one delivery attempt.",
    ["queue"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),  # SLO is 5s; dense around it
)
```

```yaml
groups:
  - name: webhooks
    interval: 30s
    rules:
      - record: queue:webhook_failures:ratio5m
        expr: |
          sum by (queue) (rate(webhook_deliveries_total{outcome!="success"}[5m]))
            / sum by (queue) (rate(webhook_deliveries_total[5m]))

      # SYMPTOM: customers are not receiving webhooks.
      - alert: WebhookDeliveryFailing
        expr: queue:webhook_failures:ratio5m > 0.10
        for: 10m
        labels: { severity: page }
        annotations:
          summary: "{{ $labels.queue }} failing {{ $value | humanizePercentage }} of deliveries"

      # SYMPTOM: saturation — work arriving faster than it drains.
      - alert: WebhookQueueBackingUp
        expr: webhook_queue_depth > 5000 and deriv(webhook_queue_depth[15m]) > 0
        for: 15m
        labels: { severity: page }

      - alert: WebhookWorkerMetricsMissing
        expr: absent(up{job="webhook-worker"} == 1)
        for: 5m
        labels: { severity: page }
```

Note what the output does *not* contain: no `customer_id` or `target_url` label (that is the 14M-series mistake), no summary metric, no quantile over a raw bucket, no alert without a `for:` clause, and no alert on worker CPU — because nobody should be woken for a cause when the two symptoms above already cover the pain.
