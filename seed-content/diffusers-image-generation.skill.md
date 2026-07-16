---
title: Image Generation Pipelines with Diffusers Skill
category: AI/ML
description: Build and serve image generation pipelines with Diffusers without black outputs, silently truncated prompts, or OOM at batch size 4. Covers pipeline anatomy, SDXL vs SD 1.5 trade-offs, scheduler and CFG choices, real reproducibility, VRAM reduction with measured numbers, and a job-queue serving pattern built for 2-10 second latency.
usage: Load this skill before asking your AI assistant to write generation code or design an image API. Say "use the Diffusers image generation skill" and describe your target resolution, GPU, and throughput; the assistant will pick a base model and scheduler with reasons, flag the model weight license separately from the library license, and produce serving code that assumes generation is slow rather than pretending it is a REST call.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 18
pocUrl: https://github.com/huggingface/diffusers
---

# Image Generation Pipelines with Diffusers Skill

## 1. Philosophy

A diffusion pipeline is not one model. It is three or four models in a trench coat, and every hard bug comes from forgetting which one is misbehaving.

**Text encoder → UNet (or DiT) → VAE.** The text encoder turns your prompt into embeddings. The UNet iteratively denoises a latent under those embeddings. The VAE decodes the final latent into pixels. They trained separately, they fail separately, and they fail *distinctively*:

- **Black image**, no error → the VAE overflowed in fp16 during decode. The UNet was fine; you lost the picture on the last step.
- **Half your prompt ignored** → the text encoder. You exceeded 77 tokens and CLIP silently dropped the rest.
- **Noise or mush** → the UNet or scheduler. Wrong step count, wrong scheduler config, or a guidance scale that tore sampling apart.
- **Different every run despite a fixed seed** → your generator is on the wrong device or is being consumed more than once.

Read the failure, skip the two-hour bisect. That is the whole philosophy: **debug by stage, not by flailing at parameters.**

Second principle, and this one has legal weight: **the library's license and the weights' license are different things, and the weights are the one that can hurt you.** Diffusers is Apache-2.0 — genuinely permissive. But `diffusers` is a *loader*, and the checkpoint it loads carries its own license. Stable Diffusion checkpoints commonly ship under **CreativeML OpenRAIL-M**, which is not Apache, is not MIT, and carries use-based restrictions plus an obligation to pass those restrictions downstream to anyone you give the model or its derivatives to. SDXL uses a different variant again. Other checkpoints are non-commercial, research-only, or require a separate agreement above a revenue threshold. **Check the license on the specific model card, per model, before commercial use.** "It's on Hugging Face and the library is Apache-2.0" is not a legal position. This is the most common blind spot in production image work, and it becomes a real problem exactly when your product succeeds.

Third: **generation takes 2–10 seconds, so it is not a request/response API.** Design the queue before the endpoint.

## 2. Tech Stack

- **Hugging Face Diffusers** — https://github.com/huggingface/diffusers — licensed **Apache-2.0**. Pipelines, schedulers, model loading, LoRA and ControlNet integration.
- **Model weights** — licensed **separately and individually**. SD 1.5 and SDXL checkpoints commonly carry **CreativeML OpenRAIL-M** or a variant, imposing use-based restrictions the Apache-2.0 library does not. Read the model card for every checkpoint you ship.
- **PyTorch** (BSD-3) and **Transformers** (Apache-2.0) — the text encoders live in Transformers.
- **xFormers** or PyTorch 2.x native SDPA for memory-efficient attention. On PyTorch 2.x, SDPA is default and xFormers is largely unnecessary.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Hugging Face Diffusers maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 SDXL vs SD 1.5: pick with numbers

RTX 4090, fp16, 30 steps, batch 1:

| | SD 1.5 | SDXL base 1.0 |
|---|---|---|
| Native resolution | 512×512 | 1024×1024 |
| UNet params | ~860M | ~2.6B |
| Text encoders | 1 (CLIP ViT-L) | 2 (CLIP ViT-L + OpenCLIP ViT-bigG) |
| VRAM, inference | ~4 GB | ~10 GB |
| Latency, 30 steps | ~1.1 s | ~3.4 s |
| LoRA / ControlNet ecosystem | Enormous | Large |

- **SDXL** if output quality is the product and 1024px is the deliverable. ~3x the latency for a quality gap non-technical users notice immediately.
- **SD 1.5** if you need throughput, are VRAM-constrained, or depend on a niche fine-tune or ControlNet that only exists for 1.5. Still the deepest ecosystem by a wide margin.
- **Never ask SD 1.5 for 1024×1024.** It trained at 512. Above its training resolution you get duplicated subjects — two heads, three arms, a second horizon. No negative prompt fixes this. Generate at 512×512 or 512×768 and upscale.
- SDXL's refiner adds ~40% latency for a marginal gain. Skip it on v1; base-only is fine and the ecosystem largely agrees.

### 3.2 The baseline pipeline

```python
import torch
from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler

pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",   # NOTE: check THIS model's license terms
    torch_dtype=torch.float16, variant="fp16", use_safetensors=True,
)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(
    pipe.scheduler.config,            # from_config, NOT from_pretrained — see below
    algorithm_type="dpmsolver++", use_karras_sigmas=True,
)
pipe = pipe.to("cuda")

image = pipe(
    prompt="a brass astrolabe on a weathered oak desk, morning light, shallow depth of field",
    negative_prompt="blurry, watermark, text, lowres",
    num_inference_steps=28,
    guidance_scale=6.0,
    height=1024, width=1024,
    generator=torch.Generator(device="cuda").manual_seed(1234),
).images[0]
```

`from_config`, not `from_pretrained`, on the scheduler. The scheduler must inherit the model's training config — beta schedule, timestep spacing, prediction type. Build one from scratch and you get a subtly wrong sampler producing washed-out or oversharpened output with no error at all.

### 3.3 Schedulers, steps, and CFG

A scheduler is the numerical solver stepping the denoising ODE. Better solver → fewer steps for the same quality.

| Scheduler | Usable steps | Notes |
|---|---|---|
| DDIM | 50+ | Old, dependable, slow to converge |
| Euler a | 20–30 | Ancestral: adds noise each step, never converges |
| **DPM++ 2M Karras** | **20–30** | **The default. Best quality-per-step.** |
| LCM / Turbo / Lightning | 1–8 | Distilled; needs matching weights, CFG ≈ 1.0 |

**28 steps on DPM++ 2M Karras beats 50 steps on DDIM and runs in half the time.** People raise step count when unhappy because it is the easiest knob. Above ~35 steps with a good scheduler you are burning GPU for changes invisible in a blind test — fix the prompt or the model. Ancestral schedulers (anything with `a`) inject fresh noise per step and never converge: 50 steps gives a *different* image, not a better one. Legitimate aesthetic choice, but it breaks the "more steps = more refined" intuition.

Guidance scale: **1.0** = off (required for Turbo/LCM). **3–5** loose and creative, may drift. **6–8** the zone for SDXL. **7–9** the zone for SD 1.5. **12+** blown out.

CFG-too-high has a look, and once seen you cannot unsee it — the image is *shouting the prompt*. Skin goes plastic, colours clip, a hard contour rings every subject, fine detail dies. At CFG 14 trying to force obedience, the prompt is the problem. SDXL also wants roughly a point lower than SD 1.5, so a recipe ported straight from 1.5 looks overcooked.

### 3.4 Seeds and actual reproducibility

```python
def generate(pipe, prompt: str, seed: int, **kw):
    # Explicit generator on the SAME device as the pipeline. A CPU generator with a
    # CUDA pipeline silently produces different latents.
    g = torch.Generator(device=pipe.device).manual_seed(seed)
    return pipe(prompt=prompt, generator=g, **kw).images[0]

def generate_batch_reproducibly(pipe, prompt: str, seeds: list[int], **kw):
    """One generator per image. One shared generator for a batch of 4 gives you
    4 images you cannot individually reproduce later."""
    gens = [torch.Generator(device=pipe.device).manual_seed(s) for s in seeds]
    return pipe(prompt=[prompt] * len(seeds), generator=gens, **kw).images
```

- **One generator per image.** A batch sharing one generator consumes it sequentially — image 3's latents depend on 1 and 2 having been drawn first. Re-run seed 42 alone and you get a different picture than seed 42 in position 3 of a batch. Maddening, because "the seed is right there in the metadata."
- **Generator device must match pipeline device.** `torch.Generator()` defaults to CPU. Silent divergence, no warning.
- **A seed reproduces within an identical environment only.** Same GPU architecture, PyTorch version, attention backend, dtype. Change any of them — even a PyTorch upgrade — and the same seed gives a similar-but-different image. It is not a content hash. Promising users "your seed always gives your image" is promising never to upgrade a dependency.
- Store `{seed, prompt, negative_prompt, steps, cfg, scheduler, model_revision, dtype}` as a unit. Any one missing makes the row worthless.

### 3.5 img2img and the strength dial

```python
from diffusers import StableDiffusionXLImg2ImgPipeline
from diffusers.utils import load_image

i2i = StableDiffusionXLImg2ImgPipeline.from_pipe(pipe)   # reuses loaded weights, no extra VRAM

out = i2i(prompt="the same room rendered as a watercolour",
          image=load_image("room.png"),
          strength=0.55,
          num_inference_steps=30,     # ACTUAL steps run = 30 * 0.55 ≈ 16
          guidance_scale=6.0,
          generator=torch.Generator(device="cuda").manual_seed(7)).images[0]
```

`strength` is how far back into the noise schedule you start, and **it multiplies your step count** — the part people miss. At `strength=0.3` with `num_inference_steps=20` you are running **6 steps**, and the output looks undercooked because it is. At low strength, raise nominal steps to compensate.

0.2–0.4 recolour/restyle, keep composition. 0.5–0.65 same composition, new medium — the useful middle. 0.75+ the input is a vague suggestion. 1.0 you have deleted the input; that is txt2img with extra steps.

`from_pipe` is the underrated call: it builds a new pipeline over the *already-loaded* weights. Loading a second full pipeline for img2img doubles VRAM for nothing, and is the most common way people OOM on a card that was fine a minute ago.

### 3.6 ControlNet for structure, LoRA for style

The clean split: **ControlNet controls geometry, LoRA controls aesthetic.** Writing "in the exact pose of" means you want ControlNet. Writing "in the style of" means you want a LoRA.

```python
from diffusers import StableDiffusionXLControlNetPipeline, ControlNetModel

controlnet = ControlNetModel.from_pretrained("diffusers/controlnet-canny-sdxl-1.0",
                                             torch_dtype=torch.float16)
cn_pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    controlnet=controlnet, torch_dtype=torch.float16, variant="fp16").to("cuda")

out = cn_pipe(prompt="a product photo of a ceramic kettle, studio lighting, white backdrop",
              image=canny_edge_map,                 # must match output h/w exactly
              controlnet_conditioning_scale=0.7,    # 1.0 traces and looks stiff
              num_inference_steps=28, guidance_scale=6.0).images[0]
```

`controlnet_conditioning_scale=1.0` produces an image that *traces* the control map — technically obedient, visually dead. 0.6–0.8 gives the model room to make it look real. ControlNet costs ~+35% latency and ~2.5GB VRAM on SDXL.

```python
# LoRA: adapters over the same base, hot-swappable, ~50-400MB each.
pipe.load_lora_weights("./loras/blueprint-style.safetensors", adapter_name="blueprint")
pipe.load_lora_weights("./loras/soft-film.safetensors", adapter_name="film")
pipe.set_adapters(["blueprint", "film"], adapter_weights=[0.8, 0.4])
img = pipe(prompt="a cutaway diagram of a bicycle hub", num_inference_steps=28).images[0]
pipe.unload_lora_weights()   # LoRAs are STATEFUL on the pipe — they leak across requests
```

That last line matters in a server. A pipeline object is long-lived; a LoRA loaded for one request stays loaded for the next. Users start reporting that their photorealistic portraits look like blueprints, and the request logs show nothing wrong. Unload in a `finally`. Stacking more than two LoRAs above ~0.5 weight each degrades fast — they fight, and you get mud. LoRA licensing is its own minefield: one trained on a living artist's work carries exposure that has nothing to do with Diffusers' Apache-2.0.

### 3.7 VRAM reduction, in the order to apply it

SDXL, 1024×1024, batch 1, measured peak on a 4090:

| Config | Peak VRAM | Latency (28 steps) |
|---|---|---|
| fp16 baseline | ~10.3 GB | 3.2 s |
| + VAE tiling | ~9.1 GB | 3.3 s |
| + attention slicing | ~7.4 GB | 4.1 s |
| + sequential CPU offload | ~3.6 GB | 14.8 s |

```python
pipe.enable_vae_tiling()          # free-ish; essential above 1024px
pipe.enable_vae_slicing()         # helps when batching
pipe.enable_attention_slicing()   # ~25% slower, real savings
pipe.enable_model_cpu_offload()   # whole modules moved CPU<->GPU per stage
# pipe.enable_sequential_cpu_offload()  # per-LAYER; runs SDXL in ~4GB, ~5x slower
```

Apply in that order, stop as soon as it fits. The two offload modes get confused constantly: `model_cpu_offload` moves whole submodules (text encoder → UNet → VAE) as needed, ~20–30% cost. `sequential_cpu_offload` moves individual *layers* at a 4–5x tax — the "run on an 8GB card at all" option, not a production setting. Shipping it on an A10G because someone copied a Colab notebook is a real and common waste of money.

### 3.8 Serving: a queue, not an endpoint

A synchronous handler holding a connection for 10 seconds means timeouts, retries that double the GPU work, and a GPU thrashing between requests it should have serialized.

```python
import asyncio, uuid
from dataclasses import dataclass
from fastapi import FastAPI, HTTPException

@dataclass
class Job:
    id: str; prompt: str; seed: int
    status: str = "queued"          # queued | running | done | failed
    result_path: str | None = None
    error: str | None = None

app = FastAPI()
JOBS: dict[str, Job] = {}
QUEUE: asyncio.Queue[str] = asyncio.Queue(maxsize=100)

async def worker():
    """ONE worker. The GPU is a single serial resource; concurrency here buys OOM,
    not throughput."""
    loop = asyncio.get_running_loop()
    while True:
        job = JOBS[await QUEUE.get()]
        job.status = "running"
        try:
            # Blocking CUDA work off the event loop, or health checks hang for 10s.
            img = await loop.run_in_executor(
                None, lambda: generate(pipe, job.prompt, job.seed, num_inference_steps=28))
            job.result_path = f"/out/{job.id}.png"
            img.save(job.result_path)
            job.status = "done"
        except Exception as e:
            job.status, job.error = "failed", str(e)
        finally:
            pipe.unload_lora_weights()      # never leak adapter state into the next job
            QUEUE.task_done()

@app.on_event("startup")
async def start():
    asyncio.create_task(worker())

@app.post("/generate")
async def submit(prompt: str, seed: int | None = None):
    if QUEUE.full():
        raise HTTPException(503, "queue full, retry with backoff")
    job = Job(id=uuid.uuid4().hex, prompt=prompt, seed=seed or int(uuid.uuid4().int % 2**31))
    JOBS[job.id] = job
    await QUEUE.put(job.id)
    # ~4s per job at 28 steps on SDXL — tell the client, don't make it guess.
    return {"job_id": job.id, "eta_seconds": (QUEUE.qsize() + 1) * 4}

@app.get("/jobs/{job_id}")
async def status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "unknown job")
    return {"status": job.status, "result": job.result_path, "error": job.error}
```

Load-bearing decisions: **one worker per GPU** (two concurrent SDXL generations on one card do not run 2x faster; they OOM or thrash), `run_in_executor` so CUDA does not block the event loop, a **bounded queue that 503s** rather than accumulating a 10-minute backlog, an **ETA in the response** so clients poll sensibly, and `unload_lora_weights()` in `finally`.

Batching is real throughput: batch 4 on SDXL runs ~2.4x the images/sec of batch 1, because the GPU stops being latency-bound on small matmuls. It also costs ~+7GB. Batch only when queue depth justifies it, and measure — batch 8 is usually not twice batch 4, and then it OOMs.

### 3.9 The safety checker, honestly

SD 1.5 pipelines ship a CLIP-based NSFW classifier that replaces flagged output with a black image. Plainly: it is **not accurate** — false positives on skin tones, medical imagery, and abstract art are common, and so are false negatives. It costs ~300MB VRAM. SDXL pipelines do not include it by default. Everyone disables it in production and substitutes their own moderation, because a classifier that black-frames a legitimate product photo is worse than useless to a paying user.

Critically: **a black image can mean the safety checker fired OR the VAE overflowed.** Completely different bugs, identical symptom. Log which one happened or you will chase the wrong one for an afternoon.

If you serve public user prompts you need moderation — on the *prompt*, before generation, where it is cheap and interpretable, and ideally on the output with a classifier you have actually measured. The bundled checker is not a compliance story.

## 4. Anti-patterns

- **Assuming Apache-2.0 on the library covers the weights.** The checkpoint may be OpenRAIL-M, non-commercial, or worse. Check every model card. This is the one with legal teeth.
- **fp16 VAE producing black images.** SD 1.5's original VAE overflows in fp16 on some latents. Fix: load a fixed fp16 VAE, or `pipe.vae.to(torch.float32)` and eat ~200ms. Symptom is a pure black PNG, no error, no traceback.
- **Prompts over 77 tokens.** CLIP's context is 77 tokens including start/end markers — about 60 words. Everything past it is **silently dropped**. Your carefully appended "shot on Hasselblad, 85mm, golden hour" never reached the model. Use Compel or embedding chunking, or write shorter prompts.
- **One generator for a batch.** Nothing is individually reproducible. One generator per seed.
- **CPU generator with a CUDA pipeline.** Different latents, no warning, "the seed doesn't work."
- **Promising seed reproducibility across upgrades.** Same seed + different PyTorch/GPU = different image.
- **SD 1.5 at 1024×1024.** Duplicated subjects, two heads. Generate at 512, upscale.
- **CFG 15 to force prompt adherence.** Deep-fried output. If 8 is not obeying, fix the prompt.
- **50 steps on DDIM.** DPM++ 2M Karras at 28 is better and 40% faster.
- **`from_pretrained` on a scheduler instead of `from_config`.** Loses the training config; subtly wrong output, no error.
- **A second full pipeline for img2img.** Use `from_pipe`. You just doubled VRAM to reuse the same weights.
- **Leaking LoRA state across requests.** The pipe is long-lived and adapters are sticky.
- **Synchronous HTTP endpoint per generation.** 10-second handlers, gateway timeouts, retries doubling GPU load.
- **Multiple concurrent generations per GPU.** Not 2x faster. OOM or thrash. One worker per card.
- **`enable_sequential_cpu_offload` on a 24GB card.** 5x slowdown to solve a problem you do not have.
- **Batch 4 without measuring peak VRAM.** OOM lands on step 26 of 28, after 3 seconds of work, on the request that mattered.

## 5. Usage

1. Paste this skill into your assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. State constraints concretely: output resolution, GPU and VRAM, images/minute at peak, whether prompts come from staff or the public, and whether this is commercial.
3. **Expect the license question first.** If the use is commercial, the assistant should flag that the checkpoint's license is separate from Diffusers' Apache-2.0 and tell you to read the specific model card before writing code.
4. Ask for, in order: (a) base model + scheduler + step/CFG defaults with reasons; (b) the generation function with an explicit per-image generator; (c) VRAM config only as far as it needs to fit; (d) the queue and worker; (e) what you persist per generation.
5. Test the failure modes on purpose: an 80-token prompt, batch 4 at target resolution, the same seed twice from a cold process.
6. Run section 4 as a checklist before shipping.

## 6. Example Output

Prompt given with this skill loaded: *"Build an API for our marketing team to generate 1024px product-scene images. Maybe 200/day, one A10G (24GB). Should be reproducible so they can re-run a good one."*

Expected shape of the answer:

> **License first, because this is commercial.** Diffusers is Apache-2.0, but the checkpoint is not covered by that. If you go with SDXL base 1.0, read its model card and license terms yourself before you ship — OpenRAIL-family licenses carry use-based restrictions and pass-through obligations. Not a formality: switching base models after your team has 400 saved seeds is painful.
>
> **Sizing.** 200/day is ~8/hour average — trivial for one A10G. At ~4.5s per SDXL image (A10G is meaningfully slower than a 4090), even a 10x burst is fine behind a queue. You are not throughput-constrained, so optimize for quality: **SDXL base 1.0, fp16, no refiner.**
>
> **Defaults.** DPM++ 2M Karras via `from_config`, 28 steps, CFG 6.5, 1024×1024. SDXL fp16 peaks ~10.3GB on 24GB — you need **nothing** from the VRAM section. No attention slicing, no offload. Leave the 25% latency on the table; you have the headroom.
>
> **Reproducibility — the actual requirement here.** Per-image `torch.Generator(device="cuda")`. Persist a row per generation: `{id, seed, prompt, negative_prompt, steps, cfg, scheduler, model_id, model_revision, dtype, created_at}`. Pin `model_revision` to a commit hash, not `main` — "re-run this one" breaks the day the repo updates, and nobody will connect the two events. Pin torch and say so in the README. Be honest in the UI: same seed reproduces exactly on this deployment; a GPU or dependency change means similar, not identical.
>
> **Prompt length.** Marketing writes long, so their prompts will exceed 77 tokens on day one. Count tokens at submit and **reject with the count** rather than letting CLIP silently truncate. Otherwise they spend a week believing "shot on medium format, warm rim light" is doing something.
>
> **Serving.** FastAPI, bounded `asyncio.Queue(maxsize=50)`, **one** worker, `run_in_executor` for the CUDA call, 503 when full, `eta_seconds = (depth + 1) * 4.5` in the submit response. `POST /generate` → job id, `GET /jobs/{id}` → poll. No LoRAs yet, but put `unload_lora_weights()` in the worker's `finally` now — you will add a brand-style LoRA within two months and this is the bug you will not find.
>
> **Skip the safety checker.** Internal staff tool, and SDXL does not bundle one anyway. Do log a distinct error when the VAE returns an all-black frame, so a black image is never ambiguous.

Note what the output does *not* contain: no CPU offload the card does not need, no refiner pass, no 50-step default, no synchronous endpoint, and no assumption that the Apache-2.0 badge on the repo settles the commercial-use question.
