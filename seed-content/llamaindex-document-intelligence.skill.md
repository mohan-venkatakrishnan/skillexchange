---
title: Document Intelligence with LlamaIndex Skill
category: AI/ML
description: Turn a messy document corpus into a queryable knowledge system with LlamaIndex — incremental ingestion with content-hash dedup, metadata that actually filters, and hierarchical retrieval that returns whole ideas instead of orphaned fragments. Covers the response synthesizer and index-type choices that quietly turn a $40/month system into a $4,000/month one.
usage: Load this skill before asking your AI assistant to build or debug a LlamaIndex ingestion or query system. Say "use the LlamaIndex document intelligence skill" and describe your documents and who queries them; the assistant will produce an ingestion pipeline with a docstore, a metadata schema designed for filtering, and a query engine whose cost you can predict.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 20
pocUrl: https://github.com/run-llama/llama_index
---

# Document Intelligence with LlamaIndex Skill

## 1. Philosophy

LlamaIndex makes it about eight lines to go from a folder of PDFs to a working question-answering system. That is genuinely great, and it is also the trap: those eight lines re-embed your entire corpus on every run, throw away every piece of metadata that would have made retrieval precise, and pick a response synthesizer whose cost scales with your document count rather than your query count.

**A document intelligence system is an ingestion problem first and a retrieval problem second.** The query engine is the last 10% of the work and the first 90% of every tutorial. Get ingestion right — stable node ids, content hashing, rich filterable metadata — and retrieval becomes tuning. Get it wrong and no amount of retrieval cleverness saves you, because the information the retriever needed was destroyed at parse time.

Three rules govern everything below:

1. **Ingestion must be incremental, and incrementality requires identity.** A node needs a deterministic id derived from its content, and the pipeline needs a docstore to remember what it has already seen. Without both, "update the index" means "pay to rebuild the index."
2. **Metadata is the highest-leverage retrieval win available, and it is nearly free.** A `where department = 'legal' and effective_year >= 2024` filter removes 95% of your corpus before the vector math starts. No embedding model, no reranker, no chunking tweak comes close to that for the effort. But metadata only counts if your vector store indexed it — an unindexed field is decoration.
3. **The unit you retrieve should not be the unit you send to the model.** Small nodes embed precisely; large nodes read well. Sentence-window and auto-merging retrieval let you have both. Choosing one chunk size for both jobs means being mediocre at each.

If your reindex takes an hour, you will avoid reindexing, and your corpus will drift stale. Ingestion speed is a correctness feature.

## 2. Tech Stack

- **LlamaIndex** — https://github.com/run-llama/llama_index — licensed **MIT**. Ingestion pipelines, node parsers, indices, retrievers, and query engines. This skill uses `llama-index-core` plus specific integration packages; pin them separately, they version independently.
- **A docstore + vector store, both persisted** — the docstore holds node text and hashes for dedup and parent lookup; the vector store holds embeddings and payloads. `SimpleDocumentStore` for < ~100k nodes, Redis or Postgres above that.
- **A structure-preserving PDF parser** — this is a real decision, see 3.6. The default fast text extractors turn tables into word salad.

This skill is an independent, original guide; it is not affiliated with or endorsed by the LlamaIndex maintainers. All example code is original to this skill.

Reference numbers used throughout: `text-embedding-3-small` at 1536 dims, ~$0.02 per million tokens. A 50k-page corpus is roughly 25M tokens ≈ 200k nodes ≈ **$0.50 to embed once**. That sounds trivial until you re-embed on every CI run — then it is $0.50 × 40 deploys/month plus 90 minutes of wall clock each time, and the wall clock is what actually hurts.

## 3. Patterns

### 3.1 Ingestion: content-hash dedup and a docstore that remembers

The pipeline must be idempotent. Run it twice on an unchanged folder and the second run should cost nothing and take seconds.

```python
import hashlib, re
from dataclasses import dataclass, field

def stable_hash(text: str) -> str:
    """Normalize before hashing — whitespace churn is not a content change."""
    norm = re.sub(r"\s+", " ", text).strip().lower()
    return hashlib.sha256(norm.encode()).hexdigest()[:16]

@dataclass
class Node:
    text: str
    doc_id: str
    metadata: dict = field(default_factory=dict)
    parent_id: str | None = None

    @property
    def node_id(self) -> str:
        # Content-derived: same text -> same id -> free dedup across runs and docs.
        return f"{self.doc_id}:{stable_hash(self.text)}"

class IncrementalIngest:
    def __init__(self, docstore, vector_store, embedder, parser, extractors):
        self.docstore, self.vs = docstore, vector_store
        self.embedder, self.parser, self.extractors = embedder, parser, extractors

    def run(self, documents) -> dict:
        seen_now, to_embed = set(), []
        for doc in documents:
            nodes = self.parser.parse(doc)
            for ex in self.extractors:
                nodes = ex.apply(nodes)
            for n in nodes:
                seen_now.add(n.node_id)
                if not self.docstore.exists(n.node_id):   # unchanged -> no embed, no upsert
                    to_embed.append(n)

        if to_embed:
            vecs = self.embedder.embed_batch([n.text for n in to_embed], batch_size=256)
            self.vs.upsert([(n.node_id, v, {**n.metadata, "doc_id": n.doc_id,
                                            "parent_id": n.parent_id})
                            for n, v in zip(to_embed, vecs)])
            self.docstore.put_many(to_embed)

        stale = self.docstore.ids_for_docs({d.doc_id for d in documents}) - seen_now
        if stale:                                  # deletions matter as much as insertions
            self.vs.delete(list(stale)); self.docstore.delete_many(list(stale))

        return {"embedded": len(to_embed), "deleted": len(stale),
                "unchanged": len(seen_now) - len(to_embed)}
```

The deletion branch is the one everyone forgets. Edit a paragraph out of a policy document, re-run ingestion without it, and the old paragraph stays in the vector store forever — retrievable, authoritative-looking, and wrong. That is how a RAG system starts citing a policy you revoked eight months ago.

### 3.2 Metadata extraction: design the filter schema before the parser

Ask one question: **what will people filter on?** Then guarantee every node carries those fields. Extract cheaply first (path, mtime, regex on headers, front-matter) and only reach for an LLM for fields you genuinely cannot derive.

```python
class PathMetadata:
    """Free, deterministic, covers most real filters. Always run this before any LLM step."""
    def apply(self, nodes):
        for n in nodes:
            parts = n.metadata["path"].split("/")
            m = re.search(r"(20\d{2})", n.metadata["path"])
            n.metadata.update({"department": parts[1] if len(parts) > 1 else "unknown",
                               "doc_type": parts[2] if len(parts) > 2 else "unknown",
                               "effective_year": int(m.group(1)) if m else None})
        return nodes

class LLMTopics:
    """Costs money. Cache by node_id — content-derived, so the cache never goes stale."""
    def __init__(self, llm, cache): self.llm, self.cache = llm, cache
    def apply(self, nodes):
        for n in nodes:
            if (hit := self.cache.get(n.node_id)) is None:
                hit = [t.strip() for t in self.llm.complete(
                    f"Return 1-3 topic tags, lowercase, comma-separated. No prose."
                    f"\n\n{n.text[:1200]}").text.split(",")][:3]
                self.cache.set(n.node_id, hit)
            n.metadata["topics"] = hit
        return nodes
```

Then — and this is the step that gets skipped — **create the index in the vector store for every field you filter on**. In Qdrant that is `create_payload_index`; in pgvector a btree on the metadata expression. An unindexed filter forces a scan or, worse, post-filtering: the store returns its top-k by vector similarity and *then* discards non-matching rows, so a filter matching 2% of the corpus routinely returns two results out of a requested twenty. The filter appears to work. Recall has quietly collapsed.

Filtering to a department typically cuts candidates 20–50× and lifts recall@5 by 10–20 points on multi-tenant corpora. It is the best-value line of code in this file.

### 3.3 Sentence-window retrieval: embed small, read wide

Embed one sentence, retrieve on that precision, then hand the model the sentences around it. The embedding is sharp because it represents one claim; the context is readable because it is a paragraph.

```python
class SentenceWindowParser:
    def __init__(self, window: int = 3): self.window = window

    def parse(self, doc):
        sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", doc.text) if s.strip()]
        out = []
        for i, s in enumerate(sents):
            lo, hi = max(0, i - self.window), min(len(sents), i + self.window + 1)
            out.append(Node(text=s, doc_id=doc.doc_id,      # embedded: this sentence only
                            metadata={**doc.metadata,
                                      "window": " ".join(sents[lo:hi])}))  # sent to the LLM
        return out

def swap_in_windows(retrieved):
    for n in retrieved:
        n.text = n.metadata.get("window", n.text)
    return retrieved
```

Use this for dense prose where the answer is one sentence: policies, contracts, research papers, incident write-ups. Do not use it for step-by-step procedures — every step embeds independently and you retrieve step 4 with no idea steps 1–3 exist. Procedures want 3.4.

### 3.4 Auto-merging retrieval: return the parent when the children agree

Chunk hierarchically (say 2048 → 512 → 128 tokens). Embed only the leaves. If enough leaves under the same parent get retrieved, discard them and return the parent instead — you get the whole coherent section rather than three disconnected snippets of it.

```python
def build_hierarchy(doc, sizes=(2048, 512, 128), count=lambda s: len(s) // 4):
    """Emit every level; only the smallest level (levels[-1]) gets embedded."""
    levels, parents = [], [Node(doc.text, doc.doc_id, doc.metadata)]
    for size in sizes:
        parents = [Node(piece, doc.doc_id, dict(p.metadata), parent_id=p.node_id)
                   for p in parents for piece in window_split(p.text, size, count)]
        levels.append(parents)
    return levels

def auto_merge(leaf_hits, docstore, threshold=0.5):
    by_parent: dict[str, list] = {}
    for n in leaf_hits:
        by_parent.setdefault(n.parent_id, []).append(n)

    out, merged_parents = [], set()
    for parent_id, children in by_parent.items():
        total = docstore.child_count(parent_id)
        if total and len(children) / total >= threshold:
            out.append(docstore.get(parent_id))    # promote to parent
            merged_parents.add(parent_id)
        else:
            out.extend(children)
    return out, merged_parents
```

Threshold 0.5 is a sane default: half the section retrieved means the section is the answer. Below ~0.3 you promote on a single stray hit and send 2k tokens to answer a one-line question. Above ~0.7 it effectively never fires and you have paid for a hierarchy you do not use.

Fetch more leaves than you need before merging — merging *reduces* the node count, so retrieving 6 leaves and merging leaves you with 2 nodes and a thin context.

### 3.5 Response synthesizers: where the money goes

This is the most consequential API choice in LlamaIndex and the least discussed. The mode you pick determines how many LLM calls one question costs.

| Mode | LLM calls | Latency | When it is right |
|---|---|---|---|
| `compact` | 1 (usually) | ~1× | **Default.** Packs nodes into as few prompts as fit. Use unless you have a reason not to. |
| `refine` | 1 per node | ~N× | Nodes that individually matter and must not be summarized away. Rarely worth it. |
| `tree_summarize` | O(N) across log N rounds | high | Genuine whole-corpus summarization: "summarize all 400 incident reports." Never for lookups. |
| `accumulate` | 1 per node | ~N× | You want N separate answers, not one. Niche. |

The trap: `refine` on 10 nodes is 10 sequential calls. At ~800ms each that is an 8-second answer and 10× the bill, for output that is usually *worse* than `compact` because each refinement step can only edit the previous answer and cannot see nodes it already passed. Teams pick `refine` because the name sounds like quality. It is the single most expensive default-override in the library.

`tree_summarize` over a 200k-node index is not a query, it is a batch job. If someone asks for a "summary of everything," precompute it nightly and serve the cached artifact.

```python
def choose_synthesizer(question: str, n_nodes: int) -> str:
    corpus_wide = re.search(r"\b(all|every|overall|across|trends?|summar\w+)\b", question, re.I)
    if corpus_wide and n_nodes > 40:
        return "precomputed_summary"     # do NOT tree_summarize live
    return "compact"                      # everything else
```

### 3.6 Structured and tabular documents

PDF tables are where document intelligence systems go to die. A fast text extractor reads a table in column-major or reading order and emits `Q1 Q2 Q3 Revenue 4.2 5.1 6.0 Costs 3.1 3.4 3.9` — the numbers survive, the association between number and label does not. The model then answers "what was Q2 revenue" with total confidence and the wrong number. Nothing downstream can detect this; the text is fluent.

Rules that hold up:

- **Route by document type at ingestion.** Text-heavy PDFs → fast extractor. Table-heavy PDFs (financials, spec sheets, lab results) → a layout-aware parser that emits markdown or HTML tables. The routing cost is worth it; the parse cost of the good parser is not worth paying on every prose page.
- **A table is one node.** Never split it. Prepend the caption and column headers to the node text so it retrieves on the words a human would search for.
- **Store the table's structured form in metadata** and let the model see markdown. `{"kind": "table", "columns": [...], "rows": [...]}` in the payload means you can compute on it later instead of asking an LLM to do arithmetic in prose.

```python
def route_parser(doc):
    density = doc.text.count("|") / max(len(doc.text.split("\n")), 1)
    if density > 0.4 or doc.metadata.get("doc_type") in {"financials", "specs"}:
        return LayoutAwareParser(emit="markdown", atomic_tables=True)
    return SentenceWindowParser(window=3)
```

Cheapest possible validation: parse ten table pages, eyeball the markdown. If the columns are wrong you just saved yourself a quarter of confidently-wrong financial answers.

### 3.7 Persistence and versioning

```python
def persist(storage_dir: str, ingest_result: dict, corpus_version: str):
    docstore.persist(f"{storage_dir}/docstore.json")
    write_json(f"{storage_dir}/manifest.json", {
        "corpus_version": corpus_version,          # bump on every ingest
        "embed_model": "text-embedding-3-small",   # changing either of these
        "embed_dim": 1536,                         #   means a FULL reindex
        "parser_version": "sentence-window-v3",
        **ingest_result,
    })
```

Write the manifest and check it on boot. If the running config's embed model or parser version disagrees with the manifest, refuse to start rather than mixing embedding spaces in one collection — that failure is silent, degrades recall by half, and takes days to find because nothing errors.

## 4. Anti-patterns

- **`VectorStoreIndex.from_documents(SimpleDirectoryReader("./docs").load_data())` in production.** No persistence, no dedup, no metadata. It re-embeds everything on every process start. Fine for a demo, ruinous as an ingestion strategy.
- **Ingesting without a docstore.** No docstore means no dedup, no parent lookup for auto-merging, and no deletion detection. Deleted content stays retrievable forever.
- **Metadata that isn't indexed in the vector store.** The filter runs, results come back, everything looks fine — you are post-filtering and your recall silently dropped. Create payload indexes for every filterable field.
- **`refine` as a default.** N sequential LLM calls per question for output that is usually worse than `compact`. Verify which mode you are actually on; do not assume.
- **`tree_summarize` on a live query path.** O(N) calls over the retrieved set at query time. One user asking "summarize everything" against a large index is a four-figure surprise on the invoice.
- **Fast text extraction on table-heavy PDFs.** Silently wrong numbers, fluently presented. Route table-heavy docs to a layout-aware parser.
- **Sentence-window on procedures.** You retrieve step 4 alone with no notion that steps 1–3 exist. Hierarchical/auto-merging is the right tool for ordered content.
- **Changing the embedding model without a full reindex.** Two embedding spaces in one collection. Nothing errors. Recall halves. The manifest check exists precisely to prevent this.
- **Random node ids (`uuid4`).** Same content, new id, every run. Incremental ingestion becomes impossible by construction. Hash the content.
- **One giant collection for all tenants.** See 3.2 — partition by a payload field and index it, or the day a filter is forgotten is the day tenant A reads tenant B's contracts.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe your corpus and its access patterns: "12k PDFs across legal/HR/finance, mixed prose and financial tables, updated weekly by a handful of authors; users always scope to one department; answers must survive an audit."
3. Ask for, in order: (a) the metadata schema plus the list of payload indexes to create, (b) the incremental ingestion pipeline with content hashing and stale-node deletion, (c) the parser routing rule for tables vs prose, (d) the retriever (sentence-window or auto-merging, justified) and the synthesizer choice with its per-query call count.
4. Make the assistant state the expected cost and wall-clock of a full reindex *and* of a typical incremental run before you accept the design. If it cannot, the pipeline is not incremental.
5. Run section 4 as a pre-deploy checklist.

The assistant should refuse to produce an ingestion pipeline with random node ids or without deletion handling, and should flag any live query path using `tree_summarize`.

## 6. Example Output

Prompt given with this skill loaded: *"12k PDFs, departments legal/HR/finance, weekly updates, some are financial tables. Users always search within their own department. Build ingestion + query."*

Expected shape of the answer:

```python
PAYLOAD_INDEXES = ["department", "doc_type", "effective_year", "kind"]  # create these first

ingest = IncrementalIngest(
    docstore=RedisDocStore(url=REDIS_URL),
    vector_store=qdrant,
    embedder=Embedder("text-embedding-3-small", dim=1536),
    parser=RoutingParser(route_parser),          # tables atomic, prose windowed
    extractors=[PathMetadata()],                 # no LLM extractor: path carries it all
)

def query(question: str, department: str) -> dict:
    leaves = retriever.retrieve(
        question,
        filters={"department": department, "effective_year": {"gte": 2023}},
        top_k=12,                                 # over-fetch: auto_merge collapses these
    )
    if not leaves:
        return {"answer": "No matching documents in your department.", "sources": []}

    nodes, merged = auto_merge(leaves, docstore, threshold=0.5)
    mode = choose_synthesizer(question, len(nodes))
    if mode == "precomputed_summary":
        return cached_summary(department)

    text = synthesize(question, nodes, mode="compact")   # 1 LLM call
    return {"answer": text,
            "sources": [{"path": n.metadata["path"], "kind": n.metadata.get("kind", "prose"),
                         "merged": n.node_id in merged} for n in nodes]}
```

```
$ python -m ingest --all
{'embedded': 214113, 'deleted': 0, 'unchanged': 0}    # first run: 51 min, ~$0.48

$ python -m ingest --all                              # nothing changed upstream
{'embedded': 0, 'deleted': 0, 'unchanged': 214113}    # 38 s, $0.00

$ python -m ingest --all                              # after one policy PDF was edited
{'embedded': 31, 'deleted': 27, 'unchanged': 214082}  # 41 s, $0.00007
```

Note what the output does *not* contain: no `from_documents` one-liner, no `uuid4` node ids, no LLM metadata extractor doing work that a path split does for free, no `refine`, and no unfiltered retrieval — the department filter is applied inside the vector store against an indexed payload field, so a legal query cannot reach an HR document even if the retriever ranks it first. The third run proves the point of the whole file: an edit to one document costs 31 embeddings and seven cents' worth of nothing, not a 51-minute rebuild.
