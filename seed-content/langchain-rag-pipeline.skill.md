---
title: Production RAG Pipelines with LangChain Skill
category: AI/ML
description: Build RAG systems with LangChain that survive real users, not just a demo notebook — LCEL composition, hybrid retrieval with reciprocal rank fusion, reranking, and citation grounding that refuses to invent sources. Covers the chunking, context-budgeting, and retry patterns that separate a 60%-accurate prototype from something you can put in front of paying customers.
usage: Load this skill before asking your AI assistant to design, build, or debug any LangChain retrieval pipeline. Say "use the LangChain RAG pipeline skill" and describe your corpus and query patterns; the assistant will produce LCEL chains, a chunking strategy, and a grounded answer contract instead of the standard load-split-embed-query tutorial.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 24
pocUrl: https://github.com/langchain-ai/langchain
---

# Production RAG Pipelines with LangChain Skill

## 1. Philosophy

Every RAG tutorial ends in the same place: load a PDF, split on 1000 characters, embed, stuff the top 4 chunks into a prompt. It demos beautifully and falls apart at roughly the tenth real question, because the tutorial optimized for the happy path and production is entirely edge cases.

**RAG is a retrieval problem wearing a generation costume.** When answers are wrong, the LLM is almost never the cause — the right chunk was not in the top-k. Fix retrieval before you touch the prompt, and fix chunking before you touch retrieval.

1. **The generator can only be as good as the retriever's recall@k.** If the answer-bearing chunk is not in the retrieved set, no prompt engineering rescues you. Measure recall@10 on a labeled set before you measure answer quality — they are different metrics and only one is actionable.
2. **Every claim carries a chunk id or it does not ship.** Grounding is not a post-hoc "please cite your sources" plea. It is a structural contract: chunks arrive tagged, the model must reference tags, and an uncited sentence is a bug caught in code, not in a user report.
3. **Chunking is schema design.** You are deciding, permanently, what the smallest retrievable unit of meaning in your corpus is. A fixed-size character splitter makes that decision by accident, mid-sentence, mid-table.
4. **Budget the context window like it costs money.** 40k tokens at $3/M input is $0.12 a question. At 50k questions/month that is $6,000 spent shipping chunks the model ignored.

If you cannot state your recall@10, you do not have a RAG pipeline. You have a vibe.

## 2. Tech Stack

- **LangChain** — https://github.com/langchain-ai/langchain — licensed **MIT**. Composition framework for LLM applications. This skill uses LCEL (the `|` runnable syntax) exclusively and treats the legacy `Chain` classes as deprecated surface area.
- **langchain-core** — the runnable/prompt/parser primitives (MIT). Nearly everything below depends only on core, which is the point: depend on core, treat integration packages as swappable.
- **A vector store with metadata filtering** — Qdrant, pgvector, or Weaviate. A store without filterable payloads forces post-filtering, which silently destroys recall.
- **A reranker** — a cross-encoder (bge-reranker-v2-m3 self-hosted, or Cohere Rerank if you would rather pay per call than run a GPU).

This skill is an independent, original guide; it is not affiliated with or endorsed by the LangChain maintainers. All example code is original to this skill.

Numbers below assume `text-embedding-3-small` at 1536 dims (~$0.02/M tokens) and a mid-tier chat model for synthesis. Do not use a frontier model for synthesis until retrieval is fixed: it papers over retrieval bugs by guessing well, and you ship the bugs.

## 3. Patterns

### 3.1 Chunking: structure-aware, 512–1024 tokens, 10–15% overlap

Split on the document's own boundaries first (headings, sections), then size-limit. Never size-limit first. The range is not arbitrary: below ~256 tokens a chunk loses the context that makes it interpretable ("it increased 12%" — what did?); above ~1024 it holds several topics, so its embedding averages all of them, drifts toward the document centroid, and discriminates for none. Overlap of 10–15% (~60–120 tokens here) survives a boundary landing mid-argument; past ~20% you pay to store and rerank near-duplicates that crowd your top-k.

```python
import re
from dataclasses import dataclass, field

@dataclass
class Chunk:
    text: str
    meta: dict = field(default_factory=dict)

HEADING = re.compile(r"^(#{1,4})\s+(.*)$", re.MULTILINE)

def split_by_structure(md: str, source: str) -> list[Chunk]:
    """Cut on headings first; keep the heading trail as metadata."""
    marks = [(m.start(), len(m.group(1)), m.group(2).strip()) for m in HEADING.finditer(md)]
    marks.append((len(md), 0, ""))
    out, trail = [], {}
    for i in range(len(marks) - 1):
        start, level, title = marks[i]
        trail = {k: v for k, v in trail.items() if k < level}
        trail[level] = title
        if body := md[start:marks[i + 1][0]].strip():
            out.append(Chunk(body, {"source": source,
                                    "breadcrumb": " > ".join(trail[k] for k in sorted(trail))}))
    return out

def enforce_budget(chunks, max_tok=900, overlap_tok=110, count=lambda s: len(s) // 4):
    """Only now apply size. Paragraph-aligned, never mid-sentence."""
    final = []
    for c in chunks:
        if count(c.text) <= max_tok:
            final.append(c); continue
        buf = []
        for p in filter(str.strip, c.text.split("\n\n")):
            buf.append(p)
            if count("\n\n".join(buf)) >= max_tok:
                final.append(Chunk("\n\n".join(buf), dict(c.meta)))
                tail, kept = [], 0
                for prev in reversed(buf):            # carry overlap backwards
                    if kept >= overlap_tok: break
                    tail.insert(0, prev); kept += count(prev)
                buf = tail
        if buf: final.append(Chunk("\n\n".join(buf), dict(c.meta)))
    return final
```

Two details the tutorials skip. **Prepend the breadcrumb to the embedded text**, not just the metadata — embedding `"Billing > Refunds > Partial refunds\n\nRequests over 30 days..."` lifts recall on short queries markedly, because the chunk's own prose often never repeats the topic word. And **never let a splitter cut a table**: detect table blocks and emit them atomically even if they blow the budget. A half-table is worse than none — the model reads the header rows and confidently invents the missing ones.

### 3.2 LCEL: compose, don't orchestrate

LCEL's value is not the pretty `|`. It is that every composed object gets `.invoke`, `.batch`, `.stream`, `.astream` and per-step tracing for free, so the streaming and retry patterns in 3.7 are one-liners instead of rewrites.

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableParallel, RunnablePassthrough, RunnableConfig
from langchain_core.output_parsers import StrOutputParser

ANSWER_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "Answer strictly from the numbered context blocks.\n"
               "Cite every factual sentence as [id]. Multiple ids: [id1][id2].\n"
               "If the context does not contain the answer, reply exactly: "
               "INSUFFICIENT_CONTEXT. Never use outside knowledge."),
    ("human", "Context:\n{context}\n\nQuestion: {question}"),
])

def render_context(docs) -> str:
    return "\n\n".join(f"[{d.metadata['chunk_id']}] {d.metadata['breadcrumb']}\n{d.page_content}"
                       for d in docs)

def build_rag(retriever, llm):
    return (RunnableParallel(docs=(lambda x: x["question"]) | retriever,
                             question=lambda x: x["question"])
            | RunnablePassthrough.assign(context=lambda x: render_context(x["docs"]))
            | RunnableParallel(answer=ANSWER_PROMPT | llm | StrOutputParser(),
                               docs=lambda x: x["docs"]))   # docs survive, for 3.5
```

Note the shape: `docs` survives to the end. A pipeline that discards retrieved documents after rendering cannot validate its own citations, which makes 3.5 impossible. Design for that from the first line.

### 3.3 Hybrid retrieval: BM25 + dense, fused with RRF

Dense embeddings are semantic and lossy. They match "how do I cancel" to "subscription termination" — and fail completely on `ERR_4021`, a part number, or an internal acronym, because those tokens carry almost no semantic signal. BM25 nails exactly those and fails at paraphrase. You need both; this is the highest-return change in most pipelines. Fuse with Reciprocal Rank Fusion, not score blending: cosine and BM25 live on incomparable scales (BM25 is unbounded), so any `0.7*dense + 0.3*sparse` weighting is a hyperparameter you will never tune correctly. RRF reads only ranks, so it needs no normalization.

```python
def reciprocal_rank_fusion(ranked_lists, k: int = 60):
    """k=60 damps the top-rank advantage; the standard starting point."""
    scores = {}
    for ranking in ranked_lists:
        for rank, doc_id in enumerate(ranking, start=1):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda kv: -kv[1])

class HybridRetriever:
    def __init__(self, dense, sparse, store, fetch_k=50, top_k=20):
        self.dense, self.sparse, self.store = dense, sparse, store
        self.fetch_k, self.top_k = fetch_k, top_k

    def invoke(self, question: str, filters=None):
        d = [h.id for h in self.dense.search(question, limit=self.fetch_k, filters=filters)]
        s = [h.id for h in self.sparse.search(question, limit=self.fetch_k, filters=filters)]
        fused = reciprocal_rank_fusion([d, s])[: self.top_k]
        return self.store.get_many([doc_id for doc_id, _ in fused])
```

Fetch wide (50 per branch), fuse, hand ~20 to the reranker. Retrieving 4 and hoping is how recall dies.

### 3.4 Reranking and the relevance floor

Bi-encoder retrieval embeds query and chunk separately — they never see each other. A cross-encoder reads both together: too slow over a corpus (hence retrieval first), easily fast enough over 20 candidates. Typical shape on a real support corpus: recall@5 goes ~0.71 (dense only) → ~0.86 (hybrid) → ~0.94 (hybrid + rerank), for 80–150ms on a small GPU-hosted cross-encoder. Nothing else here buys that much for that little.

```python
class Reranked:
    def __init__(self, base, cross_encoder, keep=5, floor=0.15):
        self.base, self.ce, self.keep, self.floor = base, cross_encoder, keep, floor

    def invoke(self, question: str, filters=None):
        cands = self.base.invoke(question, filters=filters)
        if not cands: return []
        ranked = sorted(zip(cands, self.ce.score([(question, d.page_content) for d in cands])),
                        key=lambda t: -t[1])
        kept = [d for d, s in ranked if s >= self.floor][: self.keep]
        for d, s in ranked[: len(kept)]:
            d.metadata["rerank_score"] = round(float(s), 4)
        return kept                 # may legitimately be empty
```

The `floor` matters more than `keep`. Returning an empty list when nothing clears the bar is what lets the model say INSUFFICIENT_CONTEXT truthfully instead of dutifully summarizing five irrelevant chunks. Most pipelines have no floor; that is precisely why they hallucinate on out-of-scope questions.

### 3.5 Citation grounding: verify in code, not in the prompt

"Please cite your sources" is a request. This is an invariant.

```python
CITE = re.compile(r"\[([a-zA-Z0-9_\-:]+)\]")

def validate_citations(answer: str, docs) -> tuple[bool, list[str]]:
    allowed = {d.metadata["chunk_id"] for d in docs}
    problems = [f"phantom citation: [{p}] was never retrieved"
                for p in set(CITE.findall(answer)) - allowed]
    for sent in re.split(r"(?<=[.!?])\s+", answer.strip()):
        if len(sent) < 25 or sent.strip() == "INSUFFICIENT_CONTEXT": continue
        if not CITE.search(sent):
            problems.append(f"uncited claim: {sent[:70]}...")
    return (not problems), problems
```

Wire it as a terminal chain step. On failure: one retry with the problems fed back, then fail closed to INSUFFICIENT_CONTEXT — never ship a failed answer behind a "low confidence" badge, because users do not read badges. The phantom check is the important half: a model inventing `[doc_47]` when only `doc_12` and `doc_19` were retrieved is telling you in plain text that it is generating from parametric memory. Free hallucination detector.

### 3.6 Context budgeting and lost-in-the-middle

`top_k=5` is not a budget. Five 900-token chunks is 4.5k tokens; five atomic 3k-token tables is 15k — and if your window math assumed the former you now truncate silently, usually the last chunk, mid-sentence, with no error raised anywhere. Models also attend most reliably to the start and end of a long context; material parked in the middle of a 30k-token block measurably loses recall. Mitigations in order of value: **send less** (a packed 6k of reranked chunks beats 30k of everything, on accuracy *and* cost), then reorder so the strongest land at both edges — the opposite of the sorted order retrieval hands you.

```python
def pack_context(docs, max_tokens: int, count) -> list:
    """Fill to a token budget; skip a chunk that won't fit, never truncate one."""
    packed, used = [], 0
    for d in docs:
        cost = count(d.page_content) + 30       # id + breadcrumb overhead
        if used + cost <= max_tokens:
            packed.append(d); used += cost
    return packed

def edge_weight(docs):
    """rank 1 first, rank 2 last, rank 3 second... best material at both edges."""
    head, tail = [], []
    for i, d in enumerate(docs):
        (head if i % 2 == 0 else tail).append(d)
    return head + tail[::-1]
```

### 3.7 Streaming, caching, timeouts, retries

Streaming fights citation validation: you cannot validate an answer you have not finished. Stream into a buffer and gate the verdict — and emit the retrieved chunk ids as a `sources` event *before* the first token. That gives the user something true to read during 600ms of TTFT, and makes a wrong answer diagnosable at a glance: you see the retrieval was bad before you finish reading the prose. Never stream raw tokens straight through with no terminal validation step; that is how an ungrounded answer reaches a user with no gate at all.

```python
chain = build_rag(retriever, llm).with_retry(
    retry_if_exception_type=(TimeoutError, ConnectionError), stop_after_attempt=3,
).with_config(RunnableConfig(max_concurrency=8, tags=["rag", "v3"]))
```

- **Cache embeddings by content hash, not document id.** Re-ingesting an unchanged doc should cost $0; `sha256(normalized_text)` also dedups near-identical pages for free.
- **Cache answers on `(normalized_question, filter_signature, corpus_version)`.** Omit `corpus_version` and you serve last week's answer after a reindex, forever, with no way to notice.
- **Timeout every hop separately:** embed 5s, search 2s, rerank 3s, generate 60s. One global timeout tells you nothing about which hop is slow.
- **Retry embeddings and search; never blindly retry generation** — doubled bill, often a different answer. Once, on transport errors only, never on a validation failure without feeding back the reason.

## 4. Anti-patterns

- **`RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)` from the quickstart.** Characters are not tokens (1000 chars ≈ 250 tokens — too small), and 20% overlap is duplication you pay for. Split on structure, budget in tokens.
- **Dense-only retrieval.** Ship it and wait for the first user to search a SKU or an error code. Recall on identifier-shaped queries with pure dense retrieval is frequently under 40%.
- **Score-blending sparse and dense.** Different scales, one of them unbounded. Use RRF.
- **`top_k=4` with no reranker.** You are asking a bi-encoder to be right on its first four guesses. Fetch 50, fuse, rerank, keep 5.
- **No relevance floor.** A retriever that always returns k documents guarantees the model always has something to summarize — including when the honest answer is "not in the corpus." This is the mechanical cause of most RAG hallucinations.
- **Trusting citations because the prompt asked for them.** Models emit plausible ids. Validate every id against the retrieved set, in code, every time.
- **Stuffing 100k tokens "since the window is big now."** You pay full price for the middle and the model half-reads it. Big windows did not repeal lost-in-the-middle.
- **Evaluating with vibes.** Twenty hand-labeled question→chunk pairs in a CSV beat every subjective judgment. Without recall@k you cannot tell a chunking regression from a model change.
- **Rebuilding the whole index on every deploy.** Content-hash chunks and upsert deltas. A full reindex of 2M chunks is hours of downtime for a typo fix.
- **Legacy `RetrievalQA` in new code.** A black box you cannot stream, trace per-step, or insert a validator into. Compose it with LCEL; it is fifteen lines.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe your corpus and query shape: "8k markdown support articles with heading structure and pricing tables; users search naturally but also paste error codes like ERR_4021; answers must cite article URLs."
3. Ask for, in order: (a) the chunking strategy with the structure-aware splitter and the table rule, (b) the hybrid retriever with RRF plus reranker and floor, (c) the LCEL chain with grounded prompt and citation validator, (d) an eval harness reporting recall@10 and citation-validity rate.
4. Before tuning anything, run the eval and commit recall@10 as a baseline. Every later change is compared to that number, not to an impression.
5. Run section 4 as a pre-deploy checklist.

The assistant should refuse to produce a pipeline without a relevance floor and citation validation, and should push back on fixed-size character chunking for structured documents.

## 6. Example Output

Prompt given with this skill loaded: *"Users ask about our refund policy but also paste error codes. Build the retrieval + answer chain. Corpus is markdown help-center articles."*

Expected shape of the answer:

```python
retriever = Reranked(
    base=HybridRetriever(dense=qdrant_dense, sparse=bm25_index, store=doc_store,
                         fetch_k=50, top_k=20),
    cross_encoder=bge_reranker, keep=5, floor=0.15,
)

def answer(question: str, locale: str = "en") -> dict:
    docs = retriever.invoke(question, filters={"locale": locale, "status": "published"})
    docs = pack_context(edge_weight(docs), max_tokens=6000, count=tok_count)
    if not docs:
        return {"answer": "INSUFFICIENT_CONTEXT", "sources": []}

    out = ANSWER_PROMPT | llm | StrOutputParser()
    text = out.invoke({"context": render_context(docs), "question": question})
    ok, problems = validate_citations(text, docs)
    if not ok:                                   # one correction pass, then fail closed
        text = out.invoke({"context": render_context(docs),
                           "question": f"{question}\n\nPrior attempt rejected: {problems}. "
                                       f"Cite only the ids shown."})
        ok, problems = validate_citations(text, docs)
        if not ok:
            return {"answer": "INSUFFICIENT_CONTEXT", "sources": [], "rejected": problems}
    return {"answer": text,
            "sources": [{"id": d.metadata["chunk_id"], "url": d.metadata["source"],
                         "score": d.metadata["rerank_score"]} for d in docs]}
```

```
>>> answer("what is ERR_4021")
{'answer': 'ERR_4021 is a card authorization decline returned when the issuing bank
            rejects a retry within 60 seconds of a prior attempt [help_billing_errors:c3].
            Waiting 60 seconds and resubmitting clears it [help_billing_errors:c4].',
 'sources': [{'id': 'help_billing_errors:c3', 'url': '/help/billing/errors',
              'score': 0.83}, ...]}

>>> answer("do you sell in antarctica")
{'answer': 'INSUFFICIENT_CONTEXT', 'sources': []}
```

Note what the output does *not* contain: no fixed-size character splitter, no bare `similarity_search(k=4)`, no dense-only retrieval that would have missed `ERR_4021` entirely, and no confident invented answer for the Antarctica question — the relevance floor emptied the candidate set and the chain failed closed rather than summarizing the five least-irrelevant articles it could find.
