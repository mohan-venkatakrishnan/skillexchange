---
title: Local LLM Applications with Ollama Skill
category: AI/ML
description: Ship real applications on locally-hosted models — quantization and VRAM math that predicts whether a model actually fits, context sizing, the HTTP API, structured output, and honest limits on concurrency. Includes the decision framework for when local wins on privacy, offline, and volume economics, and when it plainly loses.
usage: Load this skill before asking your AI assistant to build anything against a local model. Say "use the Ollama local LLM skill" and describe your hardware, model, and traffic; the assistant will do the VRAM arithmetic first, pick a quantization, and tell you if your plan needs a real serving tier instead.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 5
timeSavedHours: 14
pocUrl: https://github.com/ollama/ollama
---

# Local LLM Applications with Ollama Skill

## 1. Philosophy

Local inference is not "the API but free." It's a different product with a different shape, and projects fail when they discover that shape three weeks in. The mental model:

**You are renting VRAM from yourself, and the rent is fixed.** A hosted API charges per token and scales elastically. A local model occupies a fixed number of gigabytes whether you send one request or ten thousand, and when you run out nothing degrades gracefully — it OOMs, or worse, silently falls back to CPU and gets 10x slower while reporting success.

Three rules govern everything below:

1. **Do the VRAM math before you type the model name.** Weights + KV cache + overhead. If it doesn't fit with 15% headroom, you picked the wrong model or the wrong context length. Arithmetic, not an experiment.
2. **Ollama is a single-user runtime that grew an HTTP API. It is not a serving tier.** Superb for desktop apps, local agents, batch jobs, and dev. Point 40 concurrent users at it and you'll rediscover this in production. That's what vLLM is for.
3. **Match the task to the weight class.** An 8B is genuinely good at extraction, classification, rewriting, and routing. It is not good at multi-step reasoning, and no prompt fixes that.

If your requirements are "GPT-4-class reasoning, 50 concurrent users, sub-second latency, one consumer GPU," the honest answer is an API. Say so on day one instead of month two.

## 2. Tech Stack

- **Ollama** — https://github.com/ollama/ollama — licensed **MIT**. Local model runtime with a registry, the Modelfile format, and an HTTP API for chat, generation, and embeddings.
- **llama.cpp / GGUF** — the inference engine and quantized weight format underneath (MIT). Every quantization decision below is really a GGUF decision.
- **Python `httpx`** — the API is plain HTTP/JSON. You don't need a client library, and the examples below deliberately don't use one.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Ollama maintainers. All example code is original to this skill.

Recommended companions: `pydantic` for validating structured output, and `nvidia-smi` open in a second terminal during your first week — it's how you catch a CPU fallback.

## 3. Patterns

### 3.1 The decision: when local actually wins

Local wins on exactly four things. Be honest about whether you need them.

- **Privacy/compliance.** The data legally cannot leave the machine. The strongest reason and often the only one that matters — not a cost argument, a "the deal doesn't exist otherwise" argument.
- **Offline.** Field devices, air-gapped networks, desktop apps that must work on a plane.
- **Per-token economics at volume.** An 8B-class API endpoint runs ~$0.20/M tokens. A $0.40/hr cloud GPU is ~$290/month. Break-even lands around **1.5B tokens/month** — ~50M tokens/day, sustained. Below that the API is cheaper *and* someone else runs it. Most projects citing cost are nowhere near this line.
- **Latency floor with no network.** ~40ms to first token vs ~250ms round-trip. Matters for autocomplete, not chat.

Local loses on: hard reasoning, long context, burst traffic, and anything where a 3am OOM is your problem rather than a vendor's.

### 3.2 Quantization and the VRAM math that predicts OOM

| Level | Bits/weight | 8B model | Quality cost |
|---|---|---|---|
| `fp16` | 16 | ~16.0 GB | Baseline |
| `Q8_0` | 8.5 | ~8.5 GB | Effectively indistinguishable |
| `Q5_K_M` | 5.7 | ~5.7 GB | Slight, task-dependent |
| **`Q4_K_M`** | **4.8** | **~4.8 GB** | **Small; the default. Start here.** |
| `Q3_K_M` | 3.9 | ~3.9 GB | Noticeable degradation |
| `Q2_K` | 3.0 | ~3.0 GB | Don't |

`Q4_K_M` is the sweet spot and it isn't close: ~70% memory savings for a quality drop most tasks can't detect. The real lesson: **a Q4 of a bigger model beats an fp16 of a smaller one, every time.** A 13B at Q4 (~7.9GB) is a better model than an 8B at Q8 (~8.5GB) at the same memory cost.

```
total_vram ≈ weights + kv_cache + ~0.8GB overhead
weights   ≈ params × bits_per_weight / 8
kv_cache  ≈ 2 × n_layers × n_kv_heads × head_dim × num_ctx × 2 bytes
```

Made concrete at `Q4_K_M`:

| Model | Weights | KV @ 8k | KV @ 32k | Fits 24GB @ 32k? |
|---|---|---|---|---|
| 7B | 4.4 GB | ~0.5 GB | ~2.0 GB | Easily |
| 8B (GQA) | 4.8 GB | ~0.25 GB | ~1.0 GB | Easily |
| 13B | 7.9 GB | ~1.6 GB | ~6.4 GB | Yes, ~15GB |
| 70B | 41 GB | ~1.3 GB | ~5.2 GB | **No.** Needs 48GB+ |

Note the 13B's KV cache: 6.4GB at 32k, nearly as much as its weights. That's grouped-query attention *not* being present. The 8B with GQA holds 1.0GB at the same context. This one architectural detail decides more OOMs than quantization does.

### 3.3 num_ctx is a memory allocation, not a preference

The most common local-LLM bug: setting `num_ctx: 131072` because the model card says 128k, then OOMing at request three.

```python
def kv_cache_gb(n_layers, n_kv_heads, head_dim, num_ctx, bytes_per=2):
    return 2 * n_layers * n_kv_heads * head_dim * num_ctx * bytes_per / 1e9

# Llama-3-8B: 32 layers, 8 KV heads (GQA), head_dim 128
for ctx in (4096, 8192, 32768, 131072):
    print(ctx, round(kv_cache_gb(32, 8, 128, ctx), 2), "GB")
# 4096 → 0.13 GB | 8192 → 0.27 GB | 32768 → 1.07 GB
# 131072 → 4.29 GB, plus 4.8GB weights + overhead, for context you never use
```

Set `num_ctx` to the p99 of your real prompts plus max output, rounded up. Measure it:

```python
import httpx

def token_count(model: str, text: str) -> int:
    # num_predict=0 returns prompt_eval_count without generating.
    r = httpx.post("http://localhost:11434/api/generate", json={
        "model": model, "prompt": text,
        "options": {"num_predict": 0}, "stream": False}, timeout=60)
    return r.json()["prompt_eval_count"]

sizes = sorted(token_count("llama3.1:8b", p) for p in sample_prompts)
p99 = sizes[int(0.99 * len(sizes))]
# p99 prompt: 3180 → num_ctx: 4096, not 131072. That's 4.2GB back for free.
```

### 3.4 Modelfiles: pin the behavior, don't re-send it

```dockerfile
# Modelfile.extractor
FROM llama3.1:8b-instruct-q4_K_M
PARAMETER temperature 0
PARAMETER num_ctx 4096
PARAMETER num_predict 512
SYSTEM """You extract structured data from invoices.
Return only JSON matching the requested schema. Never explain.
If a field is absent, use null. Never guess a value."""
```

```bash
ollama create invoice-extractor -f Modelfile.extractor
```

Every caller now gets identical behavior from `"model": "invoice-extractor"`, and changing the prompt is a version-controlled file edit plus one `ollama create` — not a redeploy of every client. Pin the quantization in `FROM` too: `FROM llama3.1:8b` resolves to whatever the default is *today*; six months later that's a different model and your evals shift under you.

### 3.5 The HTTP API: chat, streaming, embeddings

```python
import httpx, json
BASE = "http://localhost:11434"

def chat(messages: list[dict], model="invoice-extractor", **options) -> str:
    r = httpx.post(f"{BASE}/api/chat", json={
        "model": model, "messages": messages,
        "stream": False, "options": options}, timeout=300)
    r.raise_for_status()
    return r.json()["message"]["content"]

def chat_stream(messages: list[dict], model="llama3.1:8b"):
    with httpx.stream("POST", f"{BASE}/api/chat", json={
        "model": model, "messages": messages, "stream": True}, timeout=300) as r:
        for line in r.iter_lines():
            if not line:
                continue
            chunk = json.loads(line)
            if chunk.get("done"):
                yield {"_stats": {                      # the CPU-fallback alarm
                    "prompt_tokens": chunk["prompt_eval_count"],
                    "tok_per_sec": chunk["eval_count"] / (chunk["eval_duration"] / 1e9)}}
            else:
                yield chunk["message"]["content"]

def embed(texts: list[str], model="nomic-embed-text") -> list[list[float]]:
    r = httpx.post(f"{BASE}/api/embed", json={"model": model, "input": texts}, timeout=120)
    return r.json()["embeddings"]
```

That `_stats` block is not optional instrumentation. `tok_per_sec` is how you detect §3.7.

### 3.6 Structured output that survives contact with reality

Pass a JSON schema in `format` and decoding is constrained — the model *cannot* emit invalid JSON. Use it. Then validate anyway, because schema-valid and correct are different claims.

```python
from pydantic import BaseModel, ValidationError

class Invoice(BaseModel):
    vendor: str
    total_cents: int
    due_date: str | None

def extract(text: str, retries: int = 2) -> Invoice | None:
    for attempt in range(retries + 1):
        raw = chat([{"role": "user", "content": text}],
                   model="invoice-extractor", temperature=0)
        try:
            return Invoice.model_validate_json(raw)
        except ValidationError as e:
            if attempt == retries:
                log.warning("extraction failed after %d tries: %s", retries + 1, e)
                return None
            text = f"{text}\n\nYour last output was invalid: {e}. Return valid JSON only."
```

Send `"format": Invoice.model_json_schema()` and the retry loop mostly stops firing — grammar-constrained decoding makes malformed JSON structurally impossible. It does not make `total_cents` correct. Keep the validator.

### 3.7 keep_alive, load latency, and the silent CPU fallback

Ollama unloads after 5 idle minutes. The next request pays a cold load: **~2–4s for an 8B off NVMe, ~15–25s for a 70B.** Users read that as "the app is broken." `keep_alive: -1` pins the model permanently — predictable latency for a GPU you can't share. Dedicated box: do it. Laptop: `"10m"`.

Now the failure that costs the most time. If the model doesn't fit, Ollama does not fail — it offloads layers to CPU and keeps answering at a tenth the speed:

```
$ ollama ps
NAME              SIZE     PROCESSOR          UNTIL
llama3.1:70b      42 GB    38%/62% CPU/GPU    4 minutes from now
```

`38%/62% CPU/GPU` is the alarm. `100% GPU` is what you want. Assert on it:

```python
def assert_on_gpu(model: str):
    procs = httpx.get(f"{BASE}/api/ps").json()["models"]
    m = next((p for p in procs if p["name"] == model), None)
    if not m:
        raise RuntimeError(f"{model} not loaded")
    if m["size_vram"] < m["size"] * 0.99:
        raise RuntimeError(f"{model}: only {m['size_vram']/m['size']:.0%} on GPU — "
                           f"~10x slow. Lower num_ctx or use a smaller quant.")
```

Reference speeds, 8B Q4 on a 24GB consumer GPU: **~70–110 tok/sec**. CPU only: **~6–10 tok/sec**. Single-digit `tok_per_sec` from §3.5 means you've found it.

### 3.8 Concurrency, and the point where you must leave

`OLLAMA_NUM_PARALLEL` serves N requests at once — but each slot carves its *own* KV cache out of `num_ctx`. With `num_ctx: 8192` and `OLLAMA_NUM_PARALLEL=4`, every request gets 2048 tokens. Longer prompts get silently truncated at the front, which looks like the model developing amnesia.

```bash
OLLAMA_NUM_PARALLEL=4 OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_KEEP_ALIVE=-1 ollama serve
# num_ctx must be 4 × your real per-request need.
```

Realistic ceiling for an 8B Q4 on one 24GB GPU: **4–8 concurrent requests**, ~25 tok/sec each. Beyond that, throughput collapses and queuing takes over.

The honest boundary: Ollama has no continuous batching, no paged KV cache, and no admission control. Those are the features that make multi-tenant serving work, and **vLLM** has all of them — 10–20x Ollama's throughput on identical hardware at high concurrency. Ollama for desktop apps, local agents, dev, and batch. vLLM the moment "concurrent users" appears in the requirements.

## 4. Anti-patterns

- **`num_ctx: 131072` because the model card says 128k.** 4.3GB of KV cache for an 8B you'll never fill. OOM at request three. Use measured p99 (§3.3).
- **Expecting an 8B to reason.** No multi-hop planning, no careful math, no long-chain deduction — and prompt engineering doesn't close that gap. Give it extraction, classification, routing, rewriting.
- **Ignoring `ollama ps`.** `38%/62% CPU/GPU` is a 10x slowdown reported as success. Assert `100% GPU` in your health check.
- **Hammering one Ollama process with 50 parallel requests.** No continuous batching means they queue. p95 hits 40s while the GPU sits at 30% utilization. Use vLLM.
- **`FROM llama3.1:8b` in a Modelfile.** Unpinned quantization; evals drift when the default tag moves.
- **Choosing a smaller model instead of a lower quant.** 13B-Q4 (7.9GB) beats 8B-Q8 (8.5GB) and uses less. Quantize down, then size up.
- **Cost-justifying local below ~1.5B tokens/month.** $290/mo of GPU plus your ops time to avoid a $40 API bill. Privacy and offline are good reasons; arithmetic isn't, at that volume.
- **No `keep_alive` on a latency-sensitive service.** First request after 5 idle minutes takes 4 seconds and the user files a bug.
- **`OLLAMA_NUM_PARALLEL=8` without multiplying `num_ctx` by 8.** Each slot gets 1/8th the context; long prompts truncate silently.
- **Quoting warm-cache numbers as p99.** Your p99 includes the cold load. Measure it or state that you pinned the model.

## 5. Usage

1. Paste this skill into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. State your hardware (GPU + VRAM), the model, your p99 prompt length, and expected concurrency. All four, up front.
3. Ask for, in order: (a) the VRAM math for your model/quant/`num_ctx`, (b) the Modelfile, (c) the API client with `_stats` logging and the GPU assertion, (d) structured output with a schema if you're extracting.
4. Verify `ollama ps` shows `100% GPU` and `tok_per_sec` is in band before building on top, then run section 4 as a checklist before shipping.

The assistant should refuse to recommend a model without doing the VRAM arithmetic first, and should say plainly when your concurrency requirement means vLLM rather than Ollama.

## 6. Example Output

Prompt given with this skill loaded: *"Desktop app that summarizes meeting transcripts locally. Transcripts run 30–60 minutes. Users have RTX 4070 (12GB)."*

Expected shape of the answer:

```python
# 60 min transcript ≈ 9,000 words ≈ 12,000 tokens, plus ~800 output → num_ctx 16384.
# VRAM on a 12GB card:
#   llama3.1:8b-instruct-q4_K_M weights ....... 4.8 GB
#   KV cache @ 16k (GQA, 8 kv heads) .......... 0.54 GB
#   overhead .................................. 0.8 GB
#   total ..................................... 6.1 GB  → fits, 5.9GB spare
# 13B-Q4 would be 7.9 + 3.2 (no GQA!) + 0.8 = 11.9GB → do not. Zero headroom.

# Modelfile.summarizer
#   FROM llama3.1:8b-instruct-q4_K_M
#   PARAMETER num_ctx 16384
#   PARAMETER temperature 0.2
#   SYSTEM """You summarize meeting transcripts into decisions, action items
#   (with owners), and open questions. Cite speaker names. Never invent an owner."""

def summarize(transcript: str):
    assert_on_gpu("summarizer")                     # catch CPU fallback loudly
    if token_count("summarizer", transcript) > 15_000:
        return summarize_chunked(transcript)        # map-reduce, don't raise num_ctx
    for token in chat_stream([{"role": "user", "content": transcript}],
                             model="summarizer"):   # 12k prompt ≈ 3s prefill; stream it
        yield token

# keep_alive: "15m" — users open it in bursts, but don't hold 6GB of a gamer's VRAM forever.
```

Note what the output does *not* contain: no `num_ctx: 131072`, no 13B recommendation (the KV math kills it on 12GB — and the reason is stated, not asserted), no concurrency story (desktop app, one user), and no claim that an 8B will produce analysis. It summarizes, which is what an 8B is actually good at. The chunking fallback exists because raising `num_ctx` past the card is not an option.
