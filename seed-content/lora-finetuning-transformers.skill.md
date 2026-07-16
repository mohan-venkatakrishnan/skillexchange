---
title: LoRA Fine-Tuning with Transformers and PEFT Skill
category: AI/ML
description: Fine-tune open-weight LLMs with LoRA and QLoRA on a single consumer GPU without burning a week on failed runs. Covers when fine-tuning is the wrong tool, dataset construction, chat templates, rank/alpha choices, completion-only loss masking, and evaluation that catches quality regressions.
usage: Load this skill before asking your AI assistant to plan or write any fine-tuning code. Say "use the LoRA fine-tuning skill" and describe your base model, your data, and what behaviour you want to change; the assistant will first challenge whether fine-tuning is appropriate, then produce a dataset spec, training config, and eval plan that follow these patterns.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 40
pocUrl: https://github.com/huggingface/transformers
---

# LoRA Fine-Tuning with Transformers and PEFT Skill

## 1. Philosophy

Most people who want to fine-tune should not fine-tune. That is the most valuable sentence in this file, so it goes first.

**Fine-tuning teaches a model how to speak. It does not teach a model what is true.**

If your goal is "the model should know our 400-page policy handbook," fine-tuning is the wrong tool and fails in an expensive, confusing way. The model learns the *cadence* of your handbook and then confidently invents clauses that were never in it — it sounds more like your handbook and is less accurate about it. Fluency without grounding is the worst possible outcome. Facts go in a retrieval system: put the handbook in a vector store, retrieve three chunks, stuff them in the prompt. That works on day one, costs nothing when the handbook changes, and cites its source.

Fine-tune for exactly three things: **style and tone** (every response must sound like your support team; prompting gets 80% there and drifts on turn six), **format reliability** (valid JSON on 99.5% of calls rather than 96% — a few thousand examples beats any prompt), and **domain vocabulary and task framing** (in your world "a lift" is a warehouse operation, and "run the close" means a specific eight-step workflow — that is a dialect, not a fact). The tell: *if I put perfect context in the prompt, would a strong base model get this right?* If yes, your problem is retrieval or prompting. If the model has the context and still answers in the wrong voice, shape, or frame — that is fine-tuning territory.

Second principle: **your dataset is the entire project.** Everything below about rank and learning rate is a rounding error next to data quality. 500 examples you personally read and fixed beat 100,000 scraped ones, and it is not close — a scraped dataset teaches the model the average of its noise. Budget 80% of your time on data. Tuning hyperparameters before reading 100 of your own examples end to end is procrastination. Third: **loss is not quality.** Build the eval before the first run, not after.

## 2. Tech Stack

- **Hugging Face Transformers** — https://github.com/huggingface/transformers — **Apache-2.0**. Model loading, tokenizers, chat templates, training loop.
- **PEFT** — https://github.com/huggingface/peft — **Apache-2.0**. The LoRA implementation: adapter injection, saving, merging.
- **TRL** — https://github.com/huggingface/trl — **Apache-2.0**. SFT trainer, completion-only loss masking, packing.
- **bitsandbytes** — https://github.com/bitsandbytes-foundation/bitsandbytes — **MIT**. 4-bit NF4 quantization for QLoRA.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Hugging Face Transformers maintainers. All example code is original to this skill.

Start from Llama 3.1 8B Instruct, Qwen2.5 7B/14B Instruct, or Mistral 7B Instruct v0.3 — always the **Instruct** variant unless you have 50k+ examples, since base variants need far more data to learn conversational behaviour you get free. A 24GB card (3090/4090/A10G) runs QLoRA on 7B/8B comfortably and 13B tightly; an 80GB A100 runs bf16 LoRA on 8B easily and QLoRA on 70B.

## 3. Patterns

### 3.1 The dataset is a spec, not a scrape

One JSONL record per example, deduped before splitting. No "I'll normalize it in the loader."

```python
import json, hashlib
from pathlib import Path

SYSTEM = "You are the Northwind support agent. Be direct, name the exact policy, never apologize twice."

def build_record(user, assistant):
    return {"messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": user.strip()},
                         {"role": "assistant", "content": assistant.strip()}]}

def write_jsonl(records, path):
    seen, kept = set(), []
    for r in records:
        # dedupe on the user turn — near-duplicates poison your eval split
        key = hashlib.sha256(r["messages"][1]["content"].lower().encode()).hexdigest()
        if key not in seen:
            seen.add(key); kept.append(r)
    Path(path).write_text("\n".join(json.dumps(r) for r in kept), encoding="utf-8")
    print(f"{len(kept)} kept, {len(records) - len(kept)} dupes dropped")
```

Target sizes from experience: **300–800** for format/schema adherence, **800–2,000** for tone and voice, **2,000–5,000** for domain dialect, **10,000+** for a task the base model cannot do at all (and reconsider the plan). Above ~5,000 curated examples you hit sharp diminishing returns on style work. People reach for 100k because it feels safer; it is noisier, not safer. Every example must show the behaviour you want *at inference time* — if production sends one user turn with no system prompt, do not train on ten-turn conversations. The distribution you train on is the distribution you get.

### 3.2 Chat templates: the most common silent failure

Every instruct model has a template turning messages into tokens — Llama 3 uses `<|start_header_id|>`, Qwen uses `<|im_start|>`. Train with one and infer with another and the model works "sort of," degrading in ways that look exactly like undertraining. You will spend two days blaming your learning rate. Never hand-write it; ask the tokenizer:

```python
from transformers import AutoTokenizer

MODEL = "meta-llama/Llama-3.1-8B-Instruct"
tok = AutoTokenizer.from_pretrained(MODEL)
msgs = [{"role": "system", "content": "You are terse."},
        {"role": "user", "content": "Status of order 5512?"},
        {"role": "assistant", "content": "Shipped Tuesday. Arrives Friday."}]

train_text = tok.apply_chat_template(msgs, tokenize=False)
infer_text = tok.apply_chat_template(msgs[:-1], tokenize=False, add_generation_prompt=True)
print(repr(train_text))
assert train_text.startswith(infer_text), "TEMPLATE MISMATCH — train must extend the infer prefix"
```

Run that assert once per project; it has saved me more hours than any other three lines here. Print the `repr` too — look at the real special tokens before launching a run that costs money.

### 3.3 LoRA config: rank, alpha, modules

```python
from peft import LoraConfig

peft_config = LoraConfig(
    r=16, lora_alpha=32, lora_dropout=0.05,   # keep alpha = 2 * r
    bias="none", task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",     # attention
                    "gate_proj", "up_proj", "down_proj"],       # MLP — do not skip
)
```

**r=8 for pure style, r=16 for style + format, r=32 for domain dialect.** r=64+ is almost always someone fixing a data problem with capacity: it overfits faster and rarely works. **alpha = 2r** pins the effective scale (alpha/r) at 2.0 so you do not re-tune the LR every time you touch r. **Target the MLP layers, not just attention** — the old "q_proj and v_proj only" advice is a leftover from the original paper's budget experiments; adding `gate/up/down` costs ~30% more adapter params and consistently lands better on instruction data. That is the highest-leverage config change most people are missing. Use `lora_dropout=0.05` under ~2k examples, 0.0 above.

### 3.4 QLoRA: the VRAM math on a 24GB card

8B model, seq 2048, batch 1, gradient checkpointing on:

| Component | bf16 LoRA | QLoRA (NF4) |
|---|---|---|
| Base weights | ~16.0 GB | ~5.5 GB |
| Adapters + grads + Adam states | ~0.9 GB | ~0.9 GB |
| Activations | ~2.5 GB | ~2.5 GB |
| **Total** | **~19.4 GB — OOMs on the first long batch** | **~8.9 GB — comfortable** |

bf16 LoRA on 8B technically fits in 24GB until a long sequence arrives and it does not. QLoRA leaves headroom, at ~25–40% slower steps and a quality gap genuinely hard to detect in blind review for style/format work.

```python
import torch
from transformers import AutoModelForCausalLM, BitsAndBytesConfig

bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                         bnb_4bit_compute_dtype=torch.bfloat16,  # compute bf16, store nf4
                         bnb_4bit_use_double_quant=True)         # ~0.4 GB more on 8B, free
model = AutoModelForCausalLM.from_pretrained(
    MODEL, quantization_config=bnb, torch_dtype=torch.bfloat16,
    device_map={"": 0}, attn_implementation="flash_attention_2")
model.config.use_cache = False   # incompatible with gradient checkpointing
```

### 3.5 Training config, with the numbers that matter

```python
from trl import SFTConfig

args = SFTConfig(
    output_dir="out/northwind-v1",
    num_train_epochs=2,                  # 1-3. Never 10.
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,       # effective batch = 16
    gradient_checkpointing=True,
    learning_rate=2e-4,                  # LoRA lives at 1e-4..2e-4
    lr_scheduler_type="cosine", warmup_ratio=0.03,
    optim="paged_adamw_8bit", bf16=True,
    max_seq_length=2048, packing=False,
    eval_strategy="steps", eval_steps=50, save_steps=50,
    load_best_model_at_end=True,
)
```

**Learning rate is the number people get wrong.** LoRA wants **1e-4 to 2e-4** — roughly 10x full fine-tuning's 1e-5 to 2e-5, because you are training a small set of freshly-initialised parameters. Someone copies a full-FT recipe at 2e-5, trains three hours, sees no behaviour change, and concludes "LoRA doesn't work." LoRA works; the LR was 10x too low.

**1–3 epochs.** Style transfers in 1–2; by epoch 4 you are memorising. Needing 10 epochs on 500 examples means you need 3,000 examples. **Effective batch 16–32** — below 8 the loss curve is pure noise and you cannot tell a bad run from a normal one. **Packing** concatenates short examples for throughput; only worth it for thousands of sub-512-token examples, and it needs correct attention isolation or examples bleed into each other. Otherwise you are trading a correctness risk for 2x throughput on a job that already runs in under an hour.

### 3.6 Mask the prompt — loss on completions only

By default loss covers every token including the user's question, so you are teaching the model to *generate user questions*. On long-input/short-output data (extraction, classification, summarisation) that is the dominant loss term: the model gets great at predicting your prompts and mediocre at the thing you wanted.

```python
from trl import SFTTrainer, DataCollatorForCompletionOnlyLM

response_marker = "<|start_header_id|>assistant<|end_header_id|>\n\n"   # Llama 3.1
collator = DataCollatorForCompletionOnlyLM(response_template=response_marker, tokenizer=tok)

# VERIFY before trusting it — decode one batch and look with your own eyes.
supervised = tok.decode([t for t in collator([train_ds[0]])["labels"][0] if t != -100])
print("LOSS IS COMPUTED ON:", repr(supervised))
# Must be the assistant turn only. Seeing the user's question here means your marker is wrong.

trainer = SFTTrainer(model=model, args=args, train_dataset=train_ds, eval_dataset=eval_ds,
                     peft_config=peft_config, data_collator=collator)
trainer.train()
```

The marker must tokenize identically in context. If the string never appears the collator may mask everything and loss goes NaN — that is a *good* failure. The silent one is when it masks nothing.

### 3.7 Eval: build it before you train

```python
import torch

@torch.no_grad()
def generate_review_set(model, tok, prompts, max_new_tokens=256):
    """The eval that actually tells you whether you shipped a better model."""
    model.eval(); rows = []
    for p in prompts:
        msgs = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": p}]
        text = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        ids = tok(text, return_tensors="pt").to(model.device)
        out = model.generate(**ids, max_new_tokens=max_new_tokens,
                             do_sample=False,          # greedy: comparing models, not sampling
                             pad_token_id=tok.eos_token_id)
        rows.append({"prompt": p, "output": tok.decode(
            out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True)})
    return rows
```

1. Hold out 5–10%, deduped against train by normalised user turn. **Eval leakage is rampant** — templated data puts near-identical prompts in both splits and eval loss becomes a memorisation score.
2. Run `generate_review_set` on the **base model before training**. Save it. That is your before column and you cannot recover it later.
3. Train, regenerate, put 30 pairs side by side shuffled and unlabelled, pick a winner per row. If the tune does not win 70%+, do not ship it, whatever the loss curve says.
4. Keep a **regression set**: 15 unrelated prompts ("reverse a linked list", "capital of Peru"). Run before and after. If your support tune has forgotten how to code, that is catastrophic forgetting and your LR or epoch count is too high. Ten minutes to set up, and the only thing that catches the failure nobody looks for.

### 3.8 Merge or serve separately

```python
from peft import PeftModel

# Merge from a bf16 base, NEVER from the 4-bit one.
base = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype=torch.bfloat16, device_map="cpu")
merged = PeftModel.from_pretrained(base, "out/northwind-v1/checkpoint-best").merge_and_unload()
merged.save_pretrained("out/northwind-v1-merged", safe_serialization=True)
```

**Merge** for one adapter and max inference speed (~5-10% faster, single artifact for vLLM/TGI), at the cost of a full 16GB copy per variant. **Serve separately** for several variants — one base in VRAM, hot-swap ~120MB adapters; vLLM does multi-LoRA serving, so use it rather than deploying six merged 16GB models. **Never merge a QLoRA adapter into the 4-bit base** — merging into a dequantized base bakes in quantization error and yields a model measurably worse than either the adapter or the base, a quiet ugly result that looks like a bad training run.

## 4. Anti-patterns

- **Fine-tuning to inject facts.** The headline failure: a model that hallucinates in your house style. Use RAG. When someone says "we fine-tuned the docs in and it kind of works," ask for the accuracy number on a held-out fact set. There isn't one.
- **Training on the prompt.** No completion-only collator, so loss is dominated by input tokens. Symptom: the model continues your prompts instead of answering them.
- **Template mismatch.** Hand-rolled f-string at training, `apply_chat_template` at inference. Assert the prefix.
- **Copying a full fine-tuning LR.** 2e-5 barely moves LoRA adapters. It is 1e-4 to 2e-4.
- **Eval leakage.** Random split on templated data puts near-duplicates on both sides. Dedupe *before* splitting.
- **Trusting the loss curve.** Loss down, quality down: the model is memorising your dataset's quirks including its mistakes. Only blind side-by-sides tell the truth.
- **No before-training baseline.** You cannot claim an improvement without a saved "before" column.
- **10 epochs on 500 examples.** That is memorisation. More data, not more passes.
- **r=128 for "more capacity."** Rank is not the bottleneck; your 400 mediocre examples are.
- **Skipping the regression set.** Your model is now excellent at tickets and has forgotten arithmetic. Nobody noticed for three weeks.
- **`use_cache=True` with gradient checkpointing.** Warns, wastes memory, occasionally errors.
- **Tuning the base model instead of the Instruct variant** on 800 examples. You are re-teaching conversational behaviour on a data budget that cannot do it.

## 5. Usage

1. Paste this skill into your assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. State the goal in behaviour terms: "responses should sound like our support team and end with a next action," not "the model should know our product."
3. **Expect pushback first.** The assistant should ask whether RAG or a better prompt solves this, and refuse to plan a fine-tune whose goal is fact injection.
4. Then ask, in order: (a) a dataset spec — shape, count, source, dedupe strategy; (b) the template verification snippet for your base model; (c) LoRA + training config with justified numbers; (d) the eval harness, *before* the training script.
5. Generate and save the base-model review set. Train. Regenerate. Compare blind.
6. Run section 4 as a checklist before claiming the run worked.

## 6. Example Output

Prompt given with this skill loaded: *"We want to fine-tune Llama 3.1 8B on our 12,000 archived support tickets so it can answer customer questions about our API's rate limits and error codes."*

Expected shape of the answer:

> **Stop — this plan mixes two goals and one of them will fail.**
>
> "Answer questions about rate limits and error codes" is **fact retrieval**. Fine-tuning will not do this reliably. The model learns the *shape* of your support answers and then invents rate limits that sound plausible — 1000 req/min when the real answer is 600. That is worse than the base model saying "I don't know," because it is wrong with confidence in your brand voice. Your error codes also change; a fine-tune freezes them at training time.
>
> **Split it.** Facts → **RAG**: index the API docs and error-code reference, retrieve top-3 per query. Ship that first; it works this week and stays correct when the docs change. Voice and structure → **LoRA**. *That* is what 12,000 tickets are good for: your team's tone, when they escalate, always closing with a next action.
>
> **Dataset:** do not use all 12,000. Filter to tickets rated ≥4/5, resolved, one exchange each — probably ~2,000. Read 100 of them. Drop anything whose answer needed context the model won't have at inference; those examples actively teach hallucination. Dedupe on normalised user turn, then hold out 8%.
>
> **Config:** Llama 3.1 8B Instruct, QLoRA NF4 (~9GB, comfortable on your 4090), r=16 / alpha=32 / dropout=0.05, targeting q,k,v,o + gate,up,down. LR 2e-4 cosine, 2 epochs, effective batch 16 (bs 2 × accum 8), seq 2048, packing off. `DataCollatorForCompletionOnlyLM` on the Llama 3 assistant header — decode a batch to verify the mask before launching. ~40 min/epoch on a 4090.
>
> **Eval, built before training:** held-out loss for "is it learning"; a 30-prompt review set generated from the **base model first** and saved; a 15-prompt regression set for forgetting. Ship only if the tune wins ≥70% of blind side-by-sides *and* the regression set is unchanged.

Note what the output does *not* contain: no training script that would have "learned the rate limits," no 10-epoch run, no claim that more tickets means a better model, and no hyperparameter table offered before anyone had looked at the data.
