---
title: Speech-to-Text Pipelines with Whisper Skill
category: AI/ML
description: Build production transcription pipelines with Whisper that do not hallucinate, do not stall in repetition loops, and do not burn 10x the compute they need. Covers model sizing, faster-whisper as the real runtime, VAD preprocessing, word timestamps, domain vocabulary priming, and transcript-to-summary chains.
usage: Load this skill before asking your AI assistant to build anything that turns audio into text. Say "use the Whisper speech-to-text skill" and describe your audio (length, language, quality, daily volume) and latency budget; the assistant will pick a model size and runtime with reasons, and write a pipeline with VAD and preprocessing already in place rather than bolted on after the hallucinations start.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 15
pocUrl: https://github.com/openai/whisper
---

# Speech-to-Text Pipelines with Whisper Skill

## 1. Philosophy

Whisper is remarkable and it will lie to you. Both are true, and every decision below comes from holding them at once.

**Whisper is a sequence-to-sequence model that always produces text.** It trained on 680,000 hours of internet audio, much of it captioned video, and it has no mechanism for saying "there is nothing here." Feed it thirty seconds of room tone and it does not return an empty string — it returns "Thanks for watching!" or "Subtitles by the Amara.org community," because that is what silence at the end of a video sounded like in training. This is not a bug you tune away with a temperature setting. It is what the model *is*. **Your pipeline's job is to never show it silence.**

Three rules:

1. **VAD first, transcription second.** Voice activity detection is not an optimization, it is a correctness requirement. Cutting non-speech before the model sees it removes the entire hallucination class *and* makes you faster, because you stop paying to transcribe nothing. Everyone adds VAD eventually. Add it on day one.
2. **The reference implementation is not the production runtime.** The original repo is the reference — clear, readable, slow. Production runs faster-whisper (CTranslate2): same weights, same output, ~4x the speed, half the memory. There is no trade-off to weigh.
3. **Preprocess or pay forever.** Whisper works in 16kHz mono. Everything else gets resampled anyway; the only question is whether that happens once in your pipeline or repeatedly inside a subprocess you never profiled.

The mental model that keeps you out of trouble: Whisper is not a transcriber, it is a *caption generator* that is usually right. Design for the times it is confidently wrong.

## 2. Tech Stack

- **Whisper** — https://github.com/openai/whisper — licensed **MIT**. Notably both the code *and* the released model weights are MIT — unusually permissive for a model this good. Run it commercially, on your own hardware, no per-minute fee, no license review. That is a large part of why it won.
- **faster-whisper** — https://github.com/SYSTRAN/faster-whisper — **MIT**. A CTranslate2 reimplementation; the production runtime for everything below.
- **Silero VAD** — **MIT**. Voice activity detection, ships integrated with faster-whisper.
- **ffmpeg** — decode and resample. LGPL/GPL depending on build; check yours if you redistribute binaries.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Whisper maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Picking a model size

RTX 4090, fp16, faster-whisper, clean English podcast audio. RTF = real-time factor (30x means one hour of audio in two minutes).

| Model | Params | VRAM fp16 | RTF | English WER | Verdict |
|---|---|---|---|---|---|
| tiny | 39M | ~0.7 GB | ~100x | ~12% | Keyword spotting. Not a transcript. |
| base | 74M | ~0.9 GB | ~70x | ~9% | Draft quality; fine for a search index. |
| small | 244M | ~1.8 GB | ~40x | ~6% | **The value pick.** Good English, runs anywhere. |
| medium | 769M | ~4.5 GB | ~18x | ~5% | A trap — see below. |
| large-v3 | 1550M | ~9 GB | ~10x | ~3.5% | **The quality pick.** Non-English, accents, noise. |

- **`medium` is a trap.** It costs most of large-v3's compute for a meaningful chunk of its error rate. Pick `small` for speed or `large-v3` for accuracy. The middle is where indecisive projects go.
- **`small` collapses on non-English.** The small→large-v3 gap on English is ~2.5 WER points. On Hindi, Vietnamese, or Polish it can be 15+. Non-English audio makes this decision for you: large-v3.
- **`distil-large-v3` (MIT)** is worth benchmarking for English-only batch work: ~6x faster than large-v3 at close to the same English WER. No translation, English only.
- CPU-only: `small` with int8 on 8 threads runs ~1.5–2x real time. Fine for background jobs, hopeless for interactive.

### 3.2 The 30-second window and why chunking exists

Whisper's encoder takes exactly 30 seconds — a fixed 3000-frame log-Mel spectrogram, zero-padded if shorter. A 90-minute recording is not transcribed as a 90-minute recording; it is sliced, transcribed window by window, and stitched.

The reference implementation slides that window using the model's *own predicted timestamps* to decide where the next one starts. So **a bad timestamp prediction moves the next window, and the error compounds forward.** This is the mechanism behind "perfect for 40 minutes, then timestamps drift 20 seconds and never recover." One long musical interlude produced a garbage timestamp, the window landed mid-word, everything downstream inherited the offset. VAD-based chunking fixes this by segmenting on speech boundaries *you detected* rather than boundaries the model guessed.

### 3.3 The production baseline

```python
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cuda",
                     compute_type="float16")   # "int8_float16" halves VRAM, costs ~0.3 WER

segments, info = model.transcribe(
    "interview.wav",
    language="en",              # never let it guess if you know — see 3.5
    beam_size=5,
    vad_filter=True,            # non-negotiable
    vad_parameters=dict(min_silence_duration_ms=500,
                        speech_pad_ms=200),   # padding, or you clip word onsets
    condition_on_previous_text=False,         # see 3.4 — the loop killer
)

print(f"{info.language} p={info.language_probability:.2f} dur={info.duration:.0f}s")
for s in segments:              # a GENERATOR — nothing ran until this loop
    print(f"[{s.start:7.2f} -> {s.end:7.2f}] {s.text.strip()}")
```

That config answers ~80% of transcription tasks. The two lines earning their keep are `vad_filter=True` and `condition_on_previous_text=False`. Note the generator: `transcribe` returns immediately and does no work — timing the call without consuming `segments` is how people report a 90-minute file transcribing in 4 milliseconds.

### 3.4 Repetition loops and `condition_on_previous_text`

By default Whisper feeds the previous window's text into the next as context. It improves coherence — consistent name spelling, sensible punctuation across boundaries — and it is also a feedback loop. Once the model emits a repetition, that repetition becomes context, making the next one more likely:

```
[12:03] and so the the the the the the the the the
[12:33] the the the the the the the the the the the
```

It never escapes. Forty minutes of `the`.

```python
segments, _ = model.transcribe(
    path,
    vad_filter=True,
    condition_on_previous_text=False,             # break the feedback loop
    temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],   # fallback ladder
    compression_ratio_threshold=2.4,              # repetitive text gzips too well
    no_speech_threshold=0.6,
)
```

The temperature ladder is the net: greedy first, and if the result trips the compression-ratio check or the log-prob floor, retry hotter. The compression heuristic is specifically what catches `the the the the`. Turning off `condition_on_previous_text` costs some cross-segment consistency — proper nouns may spell inconsistently across boundaries. Pay it. A slightly inconsistent transcript beats a 40-minute stutter.

### 3.5 Language: detect once, then force

Whisper detects language from the **first 30 seconds only**. If your recording opens with music, a jingle, or someone clearing their throat, it makes a confident guess from noise and transcribes an English interview as Welsh.

```python
from collections import Counter

def detect_language_robustly(model, path, probes=(30.0, 180.0, 420.0)):
    """Sample several points and vote, rather than trusting second 0-30."""
    votes = Counter()
    for offset in probes:
        segs, info = model.transcribe(path, clip_timestamps=[offset, offset + 30], vad_filter=True)
        list(segs)                                  # force the generator
        if info.language_probability > 0.65:
            votes[info.language] += 1
    return votes.most_common(1)[0][0] if votes else None
```

**If you know the language, pass it.** Detection is a fallback for unknown input, not a default. `language_probability < 0.7` means it is guessing — treat as unknown and fall back. And `task="translate"` translates to English and *only* English; there is no other target. People discover this after building a UI with a language dropdown.

### 3.6 `initial_prompt` for proper nouns and jargon

`initial_prompt` is prepended as context. It is **not an instruction** — the model will not obey "transcribe accurately, use British spelling." It is a **vocabulary prior**: seeing "Kubernetes" in context raises P("Kubernetes") over "Coober Netties."

```python
GLOSSARY = ("This is a Northwind engineering standup. Terms and names that appear: "
            "Kubernetes, Grafana, Terraform, idempotency, Priya Raghavan, Tomás Ek, "
            "the Kestrel service, SKU-4412, p99 latency.")

segments, _ = model.transcribe("standup.wav", language="en", initial_prompt=GLOSSARY,
                               vad_filter=True, condition_on_previous_text=False)
```

The catches: **~224 tokens, hard cap** — longer prompts truncate from the front, so a 60-word glossary of the terms that actually get mangled beats a 500-word company overview that gets silently cut. It applies **only to the first window** when `condition_on_previous_text=False`, so chunk long audio yourself and pass it per chunk. And **the prompt leaks** — Whisper occasionally emits prompt text as transcript, especially over silence. Another reason for VAD. Style priors do work: a prompt written with full punctuation produces better-punctuated output than one in lowercase.

### 3.7 Word timestamps

```python
segments, _ = model.transcribe("interview.wav", language="en",
                               vad_filter=True, word_timestamps=True)
for seg in segments:
    for w in seg.words:
        if w.probability < 0.5:
            print(f"LOW CONF {w.start:6.2f} {w.word!r} p={w.probability:.2f}")
```

Word timestamps come from cross-attention alignment (dynamic time warping), not the decoder. ~10–15% slower; accurate to roughly ±50–100ms, fine for subtitles and click-to-seek, not for phoneme work. `word.probability` is genuinely useful — flagging sub-0.5 words gives human reviewers a worklist instead of asking them to read everything.

### 3.8 Diarization is not part of Whisper

Whisper does not know who is speaking. It has no speaker concept. There is no `speakers=2` parameter and there will not be one. Every "Whisper with speaker labels" tool is Whisper plus a separate diarization model, stitched.

The standard stack is `pyannote.audio` (MIT code; **the pretrained pipelines are gated behind Hugging Face terms acceptance — check those before commercial use, they are not the code license**) or WhisperX, which packages alignment + diarization. The stitch, conceptually:

```python
def assign_speakers(words, turns):
    """words: [{start,end,word}]; turns: [{start,end,speaker}] from a diarizer.
    Assign each word to the turn with the greatest temporal overlap."""
    out = []
    for w in words:
        best, best_overlap = None, 0.0
        for t in turns:
            overlap = min(w["end"], t["end"]) - max(w["start"], t["start"])
            if overlap > best_overlap:
                best, best_overlap = t["speaker"], overlap
        out.append({**w, "speaker": best or "UNKNOWN"})
    return out
```

Overlapping speech is where this falls apart, and in real meetings people talk over each other constantly. 10–20% diarization error on real multi-party audio is normal. "Who said what" is a much harder problem than "what was said," and users assume it is the same problem.

### 3.9 Preprocessing: 16kHz mono, once

```python
import subprocess, numpy as np

def load_audio_16k_mono(path: str) -> np.ndarray:
    """Decode anything ffmpeg understands into the exact array Whisper wants."""
    cmd = ["ffmpeg", "-nostdin", "-threads", "0", "-i", path,
           "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-ar", "16000",
           "-loglevel", "error", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
```

A 44.1kHz stereo WAV carries 5.5x the bytes of what Whisper consumes, and every one of them is thrown away during resampling. Transcoding the same 2-hour file three times across a retry loop is minutes of pure waste per job. Normalize once at ingest, cache the 16k mono artifact, and every downstream stage reads it free. Passing a numpy array directly also skips ffmpeg inside the transcribe call.

### 3.10 Transcript → summary

Whisper gives you an undifferentiated wall of text. Nobody reads a 12,000-word transcript; the value is in what comes next.

```python
import textwrap

def to_timestamped_markdown(segments, block_seconds=120):
    """Group segments into blocks with anchors an LLM can cite."""
    blocks, current, block_start = [], [], 0.0
    for s in segments:
        if s.start - block_start >= block_seconds and current:
            blocks.append((block_start, " ".join(current)))
            current, block_start = [], s.start
        current.append(s.text.strip())
    if current:
        blocks.append((block_start, " ".join(current)))
    return "\n\n".join(f"[{int(t//60):02d}:{int(t%60):02d}] {textwrap.fill(txt, 100)}"
                       for t, txt in blocks)

SUMMARY_PROMPT = """Below is a timestamped meeting transcript.

Produce JSON with keys: decisions[], action_items[] (each with owner, task, timestamp),
open_questions[]. Cite the [MM:SS] anchor for every item. If an owner was never named,
use null — do not guess.

TRANSCRIPT:
{transcript}"""
```

Two things make this work. **Timestamp anchors** let the summary cite its source, so a reader can jump to 14:32 and check; ungrounded meeting summaries are quietly wrong and nobody catches it. **`null` instead of a guess** — without that instruction an LLM cheerfully assigns action items to whoever was mentioned most. For files over ~90 minutes, chunk into ~20-minute blocks with 2-minute overlaps, summarise each, then summarise the summaries; the overlap stops you severing a decision that spans a boundary.

## 4. Anti-patterns

- **No VAD.** You have opted into hallucinated text over every silence. The number one Whisper bug, and entirely preventable.
- **`condition_on_previous_text=True` on long audio.** Repetition loops. Forty minutes of one word, no self-recovery.
- **Believing "Thanks for watching!"** in a transcript of a phone call. That is training-data residue over silence, not something a caller said.
- **Feeding it 44.1kHz stereo.** It gets resampled to 16k mono regardless. You paid for the transcode and got nothing.
- **Letting it detect language on music-intro'd audio.** It guesses from the first 30 seconds. Pass `language=` when you know it.
- **Trusting timestamps on a 3-hour file without VAD chunking.** Window positions come from predicted timestamps; one bad prediction shifts everything after it.
- **Running the reference implementation in production.** faster-whisper is the same weights, ~4x faster, ~50% the VRAM, MIT.
- **Expecting speaker labels.** No speaker concept exists. Bolt on pyannote or WhisperX and check the pretrained-pipeline terms before commercial use.
- **Timing `transcribe()` without consuming the generator.** It is lazy. Your 90-minute file did not transcribe in 4ms.
- **`initial_prompt` as an instruction.** It is a vocabulary prior. "Please use correct punctuation" does nothing; 40 proper nouns does a lot.
- **`medium` because it sounds like a safe middle.** `small` for speed, `large-v3` for quality.
- **One giant LLM call on a 3-hour transcript.** Chunk with overlap, summarise hierarchically.

## 5. Usage

1. Paste this skill into your assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the audio concretely: length, language(s), source (phone/podcast/meeting/field), noise, daily volume, and whether latency is interactive or batch.
3. Ask for, in order: (a) model size + runtime + compute_type with the reasoning stated; (b) the ingest/normalize step; (c) the transcribe call with VAD and anti-loop settings already in it; (d) what comes after — subtitles, summary, search index.
4. If speaker labels come up, expect the assistant to say Whisper cannot do it and propose a separate diarizer with an honest error rate.
5. Test on your worst audio, not your best: the recording with 90 seconds of silence at the top and someone joining late on speakerphone.
6. Run section 4 as a checklist before shipping.

## 6. Example Output

Prompt given with this skill loaded: *"We record ~40 customer calls a day, 20-45 minutes each, English, over VoIP so quality is mixed. We need searchable transcripts plus a summary with action items. Overnight batch is fine."*

Expected shape of the answer:

> **Sizing.** Batch overnight, mixed VoIP quality, English → **large-v3, fp16, faster-whisper**. The math: 40 calls × ~32 min ≈ 21 hours of audio; at ~10x RTF that is ~2.1 GPU-hours per night — one A10G or 4090 finishes by 2am with room to retry failures. You are not latency-bound, so `small` buys nothing you need and costs real accuracy on compressed VoIP.
>
> **Ingest.** ffmpeg → 16kHz mono s16le, cached to S3 as the canonical artifact. Every retry and future re-transcription reads that instead of re-decoding.
>
> **Transcribe.** `vad_filter=True`, `min_silence_duration_ms=500`, `speech_pad_ms=200`. `condition_on_previous_text=False` — non-negotiable on call audio, where hold music and dead air are exactly the conditions that trigger repetition loops. Temperature ladder plus `compression_ratio_threshold=2.4`. `language="en"` passed explicitly: VoIP calls open with ringing and hold music, and detection on that returns nonsense with high confidence. `word_timestamps=True` so support can click a line and hear it.
>
> **`initial_prompt`**, ~50 words: product names, top 20 SKUs, customer-facing jargon. That is the difference between "Kestrel" and "Kestral" appearing 400 times in your search index.
>
> **Downstream.** Segments → timestamped markdown → one LLM call per call for JSON with `[MM:SS]` citations on every action item, `null` owner when nobody was named. Index raw segments with `(call_id, start, end)` so a hit jumps to the audio.
>
> **Speakers:** if you need agent-vs-customer labels, that is not Whisper. Best answer for VoIP: check whether your telephony provider gives you **separate channels per leg** — if so, transcribe each independently and you get perfect diarization for free. Only reach for pyannote if stuck with mixed mono, and expect 10–20% speaker error on overtalk.
>
> **Failure handling.** Flag any transcript whose gzip ratio exceeds 2.4 or whose mean word probability is under 0.4 for human review. Those are your loops and your unusable calls, and you want them in a queue, not in the search index.

Note what the output does *not* contain: no `whisper.load_model()` from the reference repo, no VAD-free transcribe call, no speaker parameter that does not exist, and no promise that the summaries are accurate without the timestamp anchors that let someone check.
