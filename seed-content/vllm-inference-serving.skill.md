---
title: High-Throughput LLM Serving with vLLM Skill
category: AI/ML
description: Run a self-hosted LLM endpoint that survives real traffic — PagedAttention and continuous batching as the mental model, KV-cache sizing math, prefix caching for shared system prompts, tensor parallelism, and quantization trade-offs. Includes the load-testing methodology that stops teams from benchmarking at concurrency 1 and drawing the wrong conclusion.
usage: Load this skill before asking your AI assistant to deploy, tune, or debug a vLLM server. Say "use the vLLM serving skill" and give your model, GPU, and traffic shape; the assistant will size the KV cache from arithmetic, pick flags with reasons attached, and tell you which latency metric you are actually optimizing.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 8
timeSavedHours: 28
pocUrl: https://github.com/vllm-project/vllm
---

# High-Throughput LLM Serving with vLLM Skill

## 1. Philosophy

Every team that adopts vLLM and reports disappointment made the same measurement: they sent one request, timed it, compared it to something else, and concluded vLLM was unremarkable. That benchmark isn't wrong so much as it's measuring a system that isn't running.

The mental model:

**Throughput comes from batching, not from the GPU going faster.** A decode step for one sequence uses a few percent of an H100 — the GPU spends its time hauling 16GB of weights out of HBM to produce one token. Those same weights, loaded once, produce tokens for 64 sequences at nearly the same cost. Decoding is memory-bandwidth-bound, so batching is close to free. **At concurrency 1 you are paying for a supercomputer to do arithmetic a phone could manage.**

Which reframes the engineering problem: **your job is to keep the batch full.** PagedAttention, continuous batching, prefix caching — all of it exists to fit more concurrent sequences into fixed VRAM.

Three rules:

1. **Never report a number measured at concurrency 1.** It describes a system you will not operate. Load-test at your real concurrency or don't quote the result.
2. **VRAM is a zero-sum split between weights and KV cache.** Weights are fixed. Everything left is batch capacity. `max_model_len` isn't a feature flag — it's a claim on that budget, per sequence.
3. **Pick one metric.** TTFT, inter-token latency, and throughput trade directly against each other. A config optimal for all three doesn't exist, and "make it fast" is not a specification.

## 2. Tech Stack

- **vLLM** — https://github.com/vllm-project/vllm — licensed **Apache-2.0**. Inference and serving engine built on PagedAttention, with continuous batching and an OpenAI-compatible HTTP server.
- **PyTorch + CUDA 12.x** — the runtime. Driver/CUDA mismatches cause most install failures; check them first.
- **Any OpenAI client** — `openai-python`, LangChain, LlamaIndex. The server speaks `/v1/chat/completions`, so clients don't know they've moved.

This skill is an independent, original guide; it is not affiliated with or endorsed by the vLLM maintainers. All example code is original to this skill.

Recommended companions: a load generator you control (§3.8 — don't trust a vendor's), and Prometheus scraping `/metrics`, where queue depth and cache-usage gauges live.

## 3. Patterns

### 3.1 PagedAttention and continuous batching

Naive serving preallocates a contiguous KV buffer per sequence at `max_model_len`. A request declares 8k, generates 200 tokens, wastes 97% of its allocation. Fragmentation on top. Real systems lost 60–80% of KV memory this way.

PagedAttention borrows virtual memory: KV lives in fixed 16-token blocks, allocated on demand, indexed through a block table. A sequence's KV is physically scattered and logically contiguous. Waste drops under one block per sequence — call it 4%. Two sequences sharing a prefix can point at the *same* physical blocks, which is what makes §3.4 possible.

Static batching then wastes the rest: one 2000-token generation in a batch of 32 makes 31 finished sequences sit idle at the exit. vLLM schedules **per decode step** — a sequence leaves the batch the iteration it finishes, a queued request joins on the next. The batch is a live population, not a cohort.

Ballpark, Llama-3-8B on one A100-80G:

| Concurrency | Throughput | Per-request tok/s | GPU util |
|---|---|---|---|
| 1 | ~95 tok/s | 95 | ~8% |
| 8 | ~700 tok/s | 88 | ~35% |
| 32 | ~2,400 tok/s | 75 | ~78% |
| 64 | ~3,600 tok/s | 56 | ~94% |
| 128 | ~4,100 tok/s | 32 | ~97% |

Read the first row against the last: **43x total throughput, per-request speed dropping only ~3x.** That's the entire value proposition, and it's invisible unless you generate load. Note the knee, too — 64→128 buys 14% throughput and costs 43% per-request speed. Past the knee you're queuing, not serving.

### 3.2 The server, and every flag with a reason

```bash
vllm serve meta-llama/Meta-Llama-3.1-8B-Instruct \
  --served-model-name prod-8b \
  --gpu-memory-utilization 0.88 \
  --max-model-len 8192 \
  --max-num-seqs 64 \
  --max-num-batched-tokens 8192 \
  --enable-prefix-caching \
  --disable-log-requests
```

- `--gpu-memory-utilization 0.88` — fraction of VRAM vLLM claims. **0.90 is the practical ceiling**; see §3.3.
- `--max-model-len 8192` — per-sequence context ceiling. Sized from measured p99, not the model card.
- `--max-num-seqs 64` — concurrent sequences per batch. Your knee from §3.1.
- `--max-num-batched-tokens 8192` — tokens per scheduler step. The TTFT/throughput dial (§3.5).
- `--served-model-name prod-8b` — decouples your API contract from the HF path. Swap models without touching clients.
- `--disable-log-requests` — per-request logging costs real throughput at high QPS.

Clients change one line: `OpenAI(base_url="http://vllm:8000/v1", api_key="unused")`.

### 3.3 KV-cache sizing: the arithmetic that prevents 3am OOM

```python
def plan(gpu_gb, util, weights_gb, n_layers, n_kv_heads, head_dim,
         max_model_len, avg_seq_len, dtype_bytes=2):
    per_token = 2 * n_layers * n_kv_heads * head_dim * dtype_bytes
    kv_gb = gpu_gb * util - weights_gb - 2.0          # ~2GB activations/graphs
    if kv_gb <= 0:
        raise ValueError("weights alone exceed the budget — shard or quantize")
    return {
        "kv_gb": round(kv_gb, 1),
        "kv_per_token_kb": round(per_token / 1024, 1),
        "worst_case_seqs": int(kv_gb * 1e9 / (per_token * max_model_len)),
        "realistic_seqs":  int(kv_gb * 1e9 / (per_token * avg_seq_len)),
    }

# Llama-3.1-8B (32 layers, 8 KV heads GQA, head_dim 128), fp16, A100-80G
print(plan(80, 0.88, 16.1, 32, 8, 128, max_model_len=8192, avg_seq_len=1200))
# {'kv_gb': 52.3, 'kv_per_token_kb': 128.0, 'worst_case_seqs': 49, 'realistic_seqs': 340}
```

Two lessons in that output.

**`worst_case_seqs: 49` is the number that matters** — it's what happens when traffic skews long. `--max-num-seqs 64` exceeds it, so a long-prompt burst makes vLLM preempt. Set `--max-num-seqs` at or below worst-case, or accept the thrash knowingly.

**Now raise `max_model_len` to 32768** and `worst_case_seqs` becomes **12**. You didn't add a capability; you cut capacity 4x for a context length p99 never reaches.

On `--gpu-memory-utilization`: it governs vLLM's pool, and CUDA graphs, NCCL buffers, and fragmentation live *outside* it. 0.95 profiles fine on an idle box and OOMs 40 minutes into traffic. **0.85–0.90.** The 5% you're chasing is worth ~4GB of KV — three more sequences, against a hard crash.

### 3.4 Automatic prefix caching: the biggest free win here

`--enable-prefix-caching` hashes KV blocks by content. A prefix already computed is *reused*, not recomputed — PagedAttention makes the sharing physical.

Enormous for two real workloads:

**Shared system prompts.** 800-token system prompt, 60-token question. Cold: 860 tokens of prefill. Warm: 60. **93% of prefill eliminated**, TTFT ~180ms → ~35ms.

**RAG.** 4,000-token retrieved context with follow-up questions against it. Turn 2 onward reuses all 4,000. TTFT ~600ms → ~50ms.

The trap that silently destroys it — matching is a **prefix**, exact from token 0:

```python
# BROKEN: timestamp changes every request → cache never hits, ever.
system = f"You are a support agent. Current time: {datetime.now()}.\n{POLICY}"

# BROKEN: user's name at the top → cache partitioned per user.
system = f"You are assisting {user.name}.\n{POLICY}"

# CORRECT: static prefix first, volatile suffix last.
system = f"{POLICY}\n\nSession context: user={user.name}, time={datetime.now()}"
```

Same tokens, same information, ~10x difference in TTFT under load. **Order your prompt by volatility: most static first, most volatile last.** A timestamp at position 0 invalidates everything behind it; the same timestamp at position 800 costs nothing.

Verify rather than assume:

```python
import httpx, re

def prefix_hit_rate() -> float:
    body = httpx.get("http://vllm:8000/metrics").text
    q = float(re.search(r"prefix_cache_queries.* ([\d.e+]+)$", body, re.M).group(1))
    h = float(re.search(r"prefix_cache_hits.* ([\d.e+]+)$", body, re.M).group(1))
    return h / q if q else 0.0

# Shared system prompt in steady state should be >0.8.
# Below 0.3 means something volatile sits at the top of your prompt.
```

### 3.5 max_model_len vs max_num_batched_tokens

Constantly confused; unrelated jobs.

- **`--max-model-len`** — per-sequence ceiling (prompt + output). Rejects longer requests. Sets *worst-case* KV per sequence.
- **`--max-num-batched-tokens`** — tokens the scheduler processes per step, across all sequences. A throughput/TTFT dial.

With chunked prefill, a 6,000-token prompt splits across steps so it can't monopolize the GPU. Raising `max_num_batched_tokens` means bigger prefill chunks: better throughput, worse TTFT for everyone queued behind. Lowering it interleaves prefill with decode more finely: snappier TTFT, lower ceiling.

- **Chat/interactive (TTFT matters):** `--max-num-batched-tokens 2048`
- **Balanced:** `4096–8192`
- **Batch/offline (throughput only):** `16384+`, `--max-num-seqs 256`

### 3.6 Tensor parallelism and quantization

`--tensor-parallel-size N` shards every layer across N GPUs. Use it when weights don't fit, not to speed up a model that already fits — TP adds an all-reduce per layer, so 2 GPUs give ~1.7x, not 2x. TP size must divide the head count evenly (64 heads → 1/2/4/8, never 6), and TP wants NVLink: over PCIe the all-reduce dominates and you can land *below* a single GPU's throughput on a model that would have fit.

```bash
# Llama-3.1-70B fp16 = ~140GB. Doesn't fit one 80GB card.
vllm serve meta-llama/Meta-Llama-3.1-70B-Instruct \
  --tensor-parallel-size 4 \    # 4×A100-80G: 35GB weights each, ~200GB KV left
  --gpu-memory-utilization 0.90 --max-model-len 8192 --enable-prefix-caching
```

| Method | VRAM (70B) | Throughput | Quality | Use when |
|---|---|---|---|---|
| fp16 | ~140 GB | baseline | baseline | You have the GPUs |
| **FP8** | ~70 GB | **1.4–1.8x** | ~indistinguishable | **H100/L40S. Default there.** |
| AWQ (4-bit) | ~40 GB | 1.1–1.3x | small drop | Fit on fewer/older GPUs |
| GPTQ (4-bit) | ~40 GB | 1.0–1.2x | small drop | You already have GPTQ weights |

FP8 on Hopper is the rare free lunch. On Ampere there's no FP8 hardware — AWQ or nothing. The counterintuitive bit: **4-bit can *lower* throughput at high concurrency.** Dequantization costs compute, and a full batch is compute-bound, not memory-bound. AWQ's win is fitting a bigger model or a bigger KV cache, not speed. A 4-bit 70B serving 8 sequences may lose to an fp16 8B serving 60.

LoRA serves multiple adapters off one base model — requests pass `model="legal"`, base weights stay loaded once, four fine-tunes on one GPU instead of four GPUs:

```bash
vllm serve meta-llama/Meta-Llama-3.1-8B-Instruct \
  --enable-lora --max-loras 4 --max-lora-rank 16 \
  --lora-modules legal=/adapters/legal support=/adapters/support
```

### 3.7 The three metrics, and why you must choose

- **TTFT** — chat responsiveness. Lower `max-num-batched-tokens` and `max-num-seqs`. Costs throughput.
- **ITL** (inter-token latency) — perceived streaming speed. Under ~50ms/token reads as fast. Degrades as the batch fills.
- **Throughput** — tokens/sec/GPU. Your cost. Raise `max-num-seqs` until ITL breaches your floor.

Then add admission control so overload degrades instead of collapsing:

```python
from fastapi import HTTPException

async def guarded_generate(req):
    if await queue_depth() > 100:        # vllm:num_requests_waiting from /metrics
        raise HTTPException(503, "overloaded", headers={"Retry-After": "2"})
    return await forward(req)
```

An unbounded queue turns a 20% overload into 90-second p99s and client timeouts — and retries then double your load. Shed early.

### 3.8 Load testing: the only methodology that tells the truth

```python
import asyncio, time, statistics, httpx

async def one(client, prompt, out_tokens=256):
    t0, ttft, n = time.perf_counter(), None, 0
    async with client.stream("POST", "/v1/chat/completions", json={
        "model": "prod-8b", "messages": [{"role": "user", "content": prompt}],
        "max_tokens": out_tokens, "stream": True,
    }) as r:
        async for line in r.aiter_lines():
            if line.startswith("data: ") and "[DONE]" not in line:
                if ttft is None:
                    ttft = time.perf_counter() - t0
                n += 1
    total = time.perf_counter() - t0
    return {"ttft": ttft, "itl": (total - ttft) / max(n - 1, 1), "tokens": n}

async def sweep(prompts, concurrency):
    limit = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient(base_url="http://vllm:8000", timeout=300) as c:
        async def guarded(p):
            async with limit:
                return await one(c, p)
        t0 = time.perf_counter()
        rs = await asyncio.gather(*(guarded(p) for p in prompts))
        wall = time.perf_counter() - t0
    return {"concurrency": concurrency,
            "throughput_tok_s": round(sum(r["tokens"] for r in rs) / wall),
            "ttft_p50": round(statistics.median(r["ttft"] for r in rs), 3),
            "ttft_p99": round(sorted(r["ttft"] for r in rs)[int(0.99 * len(rs))], 3),
            "itl_p50_ms": round(1000 * statistics.median(r["itl"] for r in rs), 1)}

for c in (1, 8, 32, 64, 128):
    print(asyncio.run(sweep(REAL_PROMPTS, c)))   # your prompts, not lorem ipsum
```

Non-negotiables: **sweep concurrency**; use **your** prompt length distribution (prefill cost is entirely prompt-dependent); report **p99, not mean** (the mean hides preemption); separate **TTFT from ITL** — they move in opposite directions and one aggregate number conceals which you broke.

## 4. Anti-patterns

- **Benchmarking at concurrency 1 and concluding vLLM is slow.** You measured ~8% GPU utilization. Sweep concurrency (§3.8) or don't report.
- **`--gpu-memory-utilization 0.95`.** Profiles clean, OOMs mid-traffic when CUDA graphs and fragmentation claim memory outside the pool. 0.85–0.90.
- **`--max-model-len 131072` because the model supports it.** Cuts worst-case concurrency 16x for context p99 never reaches. Size from measured data.
- **A timestamp at the top of the system prompt.** Silently defeats prefix caching — every request a miss, TTFT 5–10x worse under load. Volatile content goes last.
- **Assuming prefix caching is on because you passed the flag.** Check `prefix_cache_hits/queries`. Below 0.3 with a shared system prompt means something volatile is at position 0.
- **Tensor parallelism to "speed up" a model that already fits.** ~1.7x for 2 GPUs, and over PCIe it can be net negative. TP is for fitting, not accelerating.
- **AWQ for speed at high concurrency.** Dequantization is compute, and a full batch is compute-bound. AWQ buys memory, not throughput.
- **`--max-num-seqs` above `worst_case_seqs`.** Preemption thrash: sequences swap out and get recomputed, throughput drops while the GPU looks busy.
- **Unbounded request queues.** 20% overload becomes 90s p99 and a retry storm. Shed at a depth you chose.
- **Load testing with uniform 50-token prompts.** Prefill is where prompt length is felt. Test your real distribution or your capacity plan is fiction.
- **Reporting mean latency.** Preemption and queuing live in the tail. p99 or nothing.

## 5. Usage

1. Paste this skill into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. State: model, GPU type and count, p99 prompt length, p99 output length, target concurrency, and **which metric you're optimizing** (TTFT, ITL, or throughput). All six.
3. Ask for, in order: (a) the KV-cache plan with `worst_case_seqs`, (b) the `vllm serve` command with a reason per flag, (c) the prompt layout ordered by volatility, (d) the concurrency sweep harness.
4. Run the sweep before tuning anything. Find your knee. Every later change is judged against that table.
5. Run section 4 as a checklist before shipping.

The assistant should refuse to recommend `--max-model-len` without your p99 prompt length, and should ask which of TTFT/ITL/throughput you're optimizing before touching `--max-num-batched-tokens`.

## 6. Example Output

Prompt given with this skill loaded: *"Serve Llama-3.1-8B on one A100-80G for a support chatbot. 1,200-token system prompt, ~200-token questions, ~300-token answers. 40 concurrent users. TTFT matters most."*

Expected shape of the answer:

```bash
# KV plan: 8B fp16 = 16.1GB weights. 80 × 0.88 − 16.1 − 2.0 = 52.3GB KV.
# GQA (32 layers, 8 kv heads, head_dim 128) → 128 KB/token.
#   avg seq = 1200 + 200 + 300 = 1,700 tok → ~240 concurrent (plenty)
#   worst case @ max-model-len 4096 ......... ~99 concurrent
# 40 users fits with 2.5x headroom. Do NOT set max-model-len to 128k:
#   that drops worst case to 3 and buys nothing — p99 prompt is 1,700.

vllm serve meta-llama/Meta-Llama-3.1-8B-Instruct \
  --served-model-name support-8b \
  --gpu-memory-utilization 0.88 \
  --max-model-len 4096 \           # p99 1,700 + headroom, not the card's 128k
  --max-num-seqs 48 \              # ≤ worst_case 99; above target 40 for burst
  --max-num-batched-tokens 2048 \  # TTFT-optimized: fine-grained prefill/decode interleave
  --enable-prefix-caching          # 1,200-tok shared system prompt = the whole win
```

```python
# Prompt layout is load-bearing, not style. Volatility increases downward.
messages = [
    {"role": "system", "content": POLICY_1200_TOKENS},          # byte-identical → cached
    {"role": "user", "content": f"[user={uid}] {question}"},     # volatile lives HERE
]
# Cold TTFT ~210ms → warm ~45ms. Expect prefix_cache_hits/queries > 0.9.
```

Expected sweep output, which is the actual deliverable:

```
{'concurrency': 1,  'throughput_tok_s': 94,   'ttft_p50': 0.048, 'ttft_p99': 0.061, 'itl_p50_ms': 10.5}
{'concurrency': 8,  'throughput_tok_s': 690,  'ttft_p50': 0.052, 'ttft_p99': 0.089, 'itl_p50_ms': 11.4}
{'concurrency': 40, 'throughput_tok_s': 2810, 'ttft_p50': 0.071, 'ttft_p99': 0.164, 'itl_p50_ms': 14.1}
{'concurrency': 96, 'throughput_tok_s': 3950, 'ttft_p50': 0.203, 'ttft_p99': 0.918, 'itl_p50_ms': 24.3}
```

Read it: 40 concurrent holds TTFT p99 at **164ms** — the target. Pushing to 96 buys 40% throughput and takes p99 TTFT to **918ms**, a 5.6x regression on the metric that was declared to matter. So `--max-num-seqs 48`, and the extra capacity stays unclaimed on purpose.

Note what the output does *not* contain: no `--max-model-len 131072`, no tensor parallelism (the model fits one card — TP would be slower), no AWQ (fp16 fits and quantizing would cost throughput at this batch size), and no single "vLLM does 4,000 tok/s" headline. Throughput at concurrency 96 is real and deliberately declined. Every flag traces to a number, and the sweep is the evidence, not the config.
