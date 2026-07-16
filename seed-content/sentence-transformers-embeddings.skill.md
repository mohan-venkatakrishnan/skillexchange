---
title: Embeddings and Reranking with Sentence Transformers Skill
category: AI/ML
description: Build retrieval that actually retrieves — model selection, prefixes, normalization, truncation traps, and a cross-encoder rerank stage that fixes what bi-encoders get wrong. Includes fine-tuning on in-domain pairs and an evaluation harness so you stop guessing whether your changes helped.
usage: Load this skill before asking your AI assistant to build a semantic search, RAG retrieval layer, or deduplication pipeline. Say "use the sentence-transformers embeddings skill" and describe your corpus and query style; the assistant will pick a model, wire the correct prefixes, and add a rerank stage instead of dumping a naive cosine-similarity loop.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 16
pocUrl: https://github.com/UKPLab/sentence-transformers
---

# Embeddings and Reranking with Sentence Transformers Skill

## 1. Philosophy

Almost every "our semantic search is bad" ticket traces back to one of four things, and none of them are the model being too small: a missing prefix, a mismatched model between index and query time, silent truncation, and no second stage. The mental model that prevents all four:

**A bi-encoder is a cheap filter, not an answer.** It compresses a document into one vector before it has ever seen your query. That's an enormous lossy bet, and it buys you the ability to search 10M documents in 8ms. It does not buy you precision at rank 1. You get precision by retrieving generously (top 50) and then paying a cross-encoder to actually read query and document together for the survivors.

Three rules govern everything below:

1. **The retrieval stage optimizes recall; the rerank stage optimizes precision.** If the right document isn't in your top 50, no reranker can save you. If it's at rank 37 and you show top 5, no prompting saves you either. Measure both separately.
2. **The embedding model is part of the index, not the query code.** Changing models means reindexing. Every time. Write it down next to the index, in a field, in the database.
3. **Anything you can't measure, you're guessing at.** Build a 100-query held-out set before you touch a model name. Recall@50 and MRR@10 on it are the only evidence a change helped — if you're tuning a similarity threshold by eyeballing results, stop and build it. Takes an afternoon, retires the entire argument.

## 2. Tech Stack

- **sentence-transformers** — https://github.com/UKPLab/sentence-transformers — licensed **Apache-2.0**. Bi-encoder and cross-encoder training/inference wrappers over transformer backbones, plus loss functions and evaluators.
- **PyTorch** — the runtime everything sits on (BSD-3). Device placement and batching are PyTorch concerns, not library concerns.
- **A vector store** — pgvector, FAISS, or Qdrant. This skill is store-agnostic; what matters is that it holds the *same* vectors your query encoder produces (§4).

This skill is an independent, original guide; it is not affiliated with or endorsed by the sentence-transformers maintainers. All example code is original to this skill.

Recommended companions: `numpy`, and a `pytest` case asserting your eval metrics never regress below a floor.

## 3. Patterns

### 3.1 Model selection: four real choices, not thirty

| Model | Dims | Max tokens | Use it when |
|---|---|---|---|
| `all-MiniLM-L6-v2` | 384 | 256 | Baseline. Embeds 1M short docs on a laptop. Start here always. |
| `all-mpnet-base-v2` | 768 | 384 | You measured MiniLM and need a few points of recall. ~4x slower. |
| `BAAI/bge-base-en-v1.5` | 768 | 512 | Asymmetric search (short query → long passage). Needs a query prefix. |
| `intfloat/e5-base-v2` | 768 | 512 | Same job, different prefix convention. Pick one family and stay. |

The 384→768 jump doubles index size and store RAM. On 5M docs that's 7.3GB vs 14.6GB of float32 — an infrastructure decision, not a rounding error. Earn the upgrade with a measurement. And anything above 1024 dims is almost always wrong for a first system: you're paying storage and latency for gains a cross-encoder rerank gives you for free.

### 3.2 The prefixes, which are not optional

E5 and BGE were trained with instruction prefixes baked in. Omit them and you lose 5–15 points of recall@10 — silently, no error, on a system that otherwise looks fine. The single most common bug in this space.

```python
from sentence_transformers import SentenceTransformer

class PrefixedEncoder:
    """Wraps a model with its family's prefixes so callers can't forget."""

    FAMILIES = {
        "e5":  {"query": "query: ", "passage": "passage: "},
        "bge": {"query": "Represent this sentence for searching relevant passages: ",
                "passage": ""},
        "none": {"query": "", "passage": ""},
    }

    def __init__(self, model_name: str, family: str):
        if family not in self.FAMILIES:
            raise ValueError(f"unknown family {family!r}")
        self.model = SentenceTransformer(model_name)
        self.prefixes = self.FAMILIES[family]
        self.model_name = model_name      # store this ON the index. See §4.

    def encode_queries(self, texts: list[str], **kw):
        return self.model.encode([self.prefixes["query"] + t for t in texts],
                                 normalize_embeddings=True, **kw)

    def encode_passages(self, texts: list[str], **kw):
        return self.model.encode([self.prefixes["passage"] + t for t in texts],
                                 normalize_embeddings=True, **kw)
```

Note what this makes impossible: encoding a query as a passage. There is no bare `encode()` — the asymmetry is enforced in code, not in a comment nobody reads. BGE prefixes queries only; E5 prefixes both sides. Mixing conventions gives you a model that half-works, which is worse than one that fails loudly.

### 3.3 Normalize once, then use dot product

Cosine similarity is dot product on unit vectors. Normalize at encode time and everything downstream gets cheaper:

```python
emb = encoder.encode_passages(chunks)      # already L2-normalized
scores = query_vec @ emb.T                  # dot == cosine, one matmul
top_k = np.argpartition(-scores, 50)[:50]   # O(n), not a full sort
top_k = top_k[np.argsort(-scores[top_k])]
```

`argpartition` over `argsort` on 2M candidates is ~40ms vs ~900ms in NumPy. And configure your store for inner product, not cosine — on normalized vectors, cosine mode is dot product with a wasted division per comparison.

### 3.4 Truncation: the bug that eats the end of your chunks

`all-MiniLM-L6-v2` truncates at **256 word pieces** — not words, not characters. A 500-word chunk loses roughly its back half, with no warning and no exception. You get an embedding of the first paragraph, and the answer living in the last paragraph becomes unretrievable.

```python
def audit_truncation(model, texts: list[str]) -> dict:
    tok, limit = model.tokenizer, model.max_seq_length
    lens = [len(tok.encode(t, add_special_tokens=True)) for t in texts]
    return {"limit": limit, "p95": int(np.percentile(lens, 95)),
            "truncated_pct": round(100 * sum(n > limit for n in lens) / len(lens), 2)}

print(audit_truncation(model, chunks))
# {'limit': 256, 'p95': 402, 'truncated_pct': 18.4}
```

18% truncated is a broken index. Fix it by chunking to the model's limit (target p95 ≈ 0.8 × limit) — not by hoping a 512-token model rescues you, because it does the same thing silently at 512.

### 3.5 Batch encoding and honest throughput

MiniLM-L6 on ~150-token chunks, so you can plan a backfill instead of discovering it at 2am. An 8-core CPU at batch 32 does **~250–400 texts/sec** (1M docs ≈ 45–65 min). A single A10G/T4 at batch 256 does **~2,500–4,000 texts/sec** (1M docs ≈ 5–7 min). `all-mpnet-base-v2` on that same GPU does **~700–1,000 texts/sec** — ~4x MiniLM's cost.

Batch size is the whole game on GPU: batch 8 vs 256 is often 6x throughput on identical hardware — you're paying kernel launch overhead instead of doing math. Encoding one text at a time in a loop runs a GPU at CPU speed.

### 3.6 Cross-encoder reranking: the second stage that earns its latency

A cross-encoder concatenates query and document and runs a full forward pass over the pair. No precomputation, and *dramatically* better at ordering. Far too slow to run over your corpus — which is exactly why it goes second.

```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", max_length=512)

def search(query: str, encoder, index, rerank_depth: int = 50, top_k: int = 5):
    qv = encoder.encode_queries([query])[0]
    cands = index.search(qv, k=rerank_depth)            # ~8ms, bi-encoder
    scores = reranker.predict([(query, c.text) for c in cands], batch_size=32)
    ranked = sorted(zip(cands, scores), key=lambda p: -p[1])
    return [{"id": c.id, "text": c.text, "score": float(s)} for c, s in ranked[:top_k]]
```

The latency math, which is the actual argument: bi-encoder over 5M docs is **~8ms**; cross-encoder over 50 pairs on GPU at batch 32 is **~90ms**. Total **~100ms**, and rank-1 precision typically moves 10–25 points on real corpora.

Cross-encoder over all 5M docs would be roughly **2.5 hours per query**. That's the whole reason two stages exist. Depth 50 is the sweet spot; depth 200 costs ~350ms and rarely buys more than a point, because the bi-encoder's recall curve has already flattened.

### 3.7 Fine-tuning with MultipleNegativesRankingLoss

With in-domain (query, positive) pairs — support tickets and their resolutions, search logs and their clicks — fine-tuning is the highest-leverage move available. MNRL needs only positives; every other item in the batch is a negative, so batch size *is* the negative count.

```python
from sentence_transformers import SentenceTransformer, InputExample, losses
from torch.utils.data import DataLoader
train = [InputExample(texts=[q, p]) for q, p in in_domain_pairs]   # positives only
model = SentenceTransformer("BAAI/bge-base-en-v1.5")
loader = DataLoader(train, shuffle=True, batch_size=64, drop_last=True)

model.fit(
    train_objectives=[(loader, losses.MultipleNegativesRankingLoss(model))],
    epochs=2, warmup_steps=int(0.1 * len(loader) * 2),
    optimizer_params={"lr": 2e-5}, output_path="models/bge-support-v1",
)
```

Non-obvious things that decide whether this works:

- **`drop_last=True` is mandatory.** A short final batch has fewer in-batch negatives and destabilizes the loss.
- **Batch size is a quality knob, not a memory knob.** 64 is a floor; 128–256 is meaningfully better if VRAM allows — the opposite of most fine-tuning intuition.
- **Duplicate positives poison a batch.** Two rows sharing a passage make each other false negatives. Deduplicate first.
- **2 epochs, not 10.** These overfit small in-domain sets fast, and you only find out on the held-out set.

### 3.8 Evaluation: recall@k and MRR on a split you didn't train on

```python
def evaluate(search_fn, gold: dict[str, set[str]], k_recall=50, k_mrr=10) -> dict:
    """gold: query -> set of relevant doc ids. Held-out split only."""
    hits, rr = 0, 0.0
    for q, relevant in gold.items():
        ranked = [r["id"] for r in search_fn(q, top_k=k_recall)]
        hits += bool(relevant & set(ranked[:k_recall]))
        rr += next((1 / i for i, d in enumerate(ranked[:k_mrr], 1) if d in relevant), 0.0)
    n = len(gold)
    return {f"recall@{k_recall}": hits / n, f"mrr@{k_mrr}": rr / n}

print(evaluate(search_no_rerank, gold))   # {'recall@50': 0.91, 'mrr@10': 0.52}
print(evaluate(search_with_rerank, gold)) # {'recall@50': 0.91, 'mrr@10': 0.74}
```

Read that correctly: **recall@50 is identical** — reranking cannot add documents the retriever missed. MRR jumped 22 points because reranking is purely an ordering fix. If recall@50 is 0.91, that's your ceiling, and the reranker is not your problem — your chunking or your prefix is.

## 4. Anti-patterns

- **Forgetting the E5/BGE prefix.** 5–15 points of recall@10, no error thrown. Wrap the model (§3.2) so nobody can call it wrong.
- **Different models at index and query time.** Someone upgrades the query path to mpnet, the index is still MiniLM: a loud crash if you're lucky, garbage scores across compatible dims if you're not. Store `model_name` on the index; assert on it at query time.
- **Mining hard negatives from the eval split.** Your negatives now encode which documents are relevant to eval queries. Metrics rise, production doesn't. Mine from train only.
- **Assuming truncation would have warned you.** It doesn't. Run §3.4 before every index build.
- **Cosine mode on a store of normalized vectors.** Paying for a division that yields 1.0. Use inner product.
- **Rerank depth 500 "to be safe."** ~900ms for gains the recall curve says aren't there. Compare recall@50 vs recall@500 — usually a 2-point spread — then pick 50.
- **Encoding one text per call in a loop.** 20x slower on GPU. The batch is the unit of work.
- **Tuning a similarity cutoff by eye.** Scores aren't calibrated across models or corpora; 0.78 means nothing transferable. Cut by rank, or calibrate against the held-out set.
- **Reaching for a 4096-dim model before adding a reranker.** The reranker is cheaper, bigger, and forces no reindex — and MNRL on 500 pairs without a held-out set will happily hand you a model that's perfect on training queries and worse than base everywhere else.

## 5. Usage

1. Paste this skill into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the job concretely: corpus size, document length, query style (keywords? full questions?), latency budget, and whether you have click or feedback data.
3. Ask for, in order: (a) the chunking + truncation audit, (b) the prefixed encoder and index build, (c) the two-stage search with rerank, (d) the eval harness and a baseline number.
4. Get baseline recall@50 and MRR@10 *before* accepting any optimization, then run section 4 as a checklist before shipping.

The assistant should refuse to write a bare `model.encode()` for an E5/BGE model, and should ask your latency budget before recommending a rerank depth.

## 6. Example Output

Prompt given with this skill loaded: *"Semantic search over 200k support articles, average 900 words each. Users type full questions. 300ms budget."*

Expected shape of the answer:

```python
# 900 words ≈ 1,200 word pieces — every candidate model truncates this.
# Chunk to 400 tokens, 50 overlap → p95 ≈ 410 vs bge's 512 limit.
CHUNKER = TokenChunker(tokenizer=model.tokenizer, size=400, overlap=50)

# Asymmetric: short question → long passage. BGE family, query prefix only.
# 200k articles → ~600k chunks @ 768 dims float32 = 1.8GB. Fits RAM; pgvector is fine.
# Backfill: ~600k @ ~900/sec on a T4 ≈ 11 minutes.
encoder = PrefixedEncoder("BAAI/bge-base-en-v1.5", family="bge")

def search(q: str, top_k: int = 5):
    qv = encoder.encode_queries([q])[0]                      # ~6ms
    cands = index.search(qv, k=50)                            # ~12ms (600k vectors, HNSW)
    scores = reranker.predict([(q, c.text) for c in cands])   # ~90ms, T4, batch 32
    return [c for c, _ in sorted(zip(cands, scores), key=lambda p: -p[1])][:top_k]
# Budget: 6 + 12 + 90 = ~108ms p50, ~180ms p95. Fits 300ms with headroom.
```

Note what the output does *not* contain: no threshold constant picked by feel, no 4096-dim model, no `model.encode(query)` without a prefix, and no claim that reranking improves recall. The chunk size is derived from the model's token limit, and the latency budget is arithmetic you can check.
