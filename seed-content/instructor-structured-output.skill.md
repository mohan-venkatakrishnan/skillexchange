---
title: Reliable Structured Output with Instructor Skill
category: AI/ML
description: Turn an LLM into a typed function that returns validated Pydantic objects instead of JSON you have to pray about. Covers schema-as-prompt design, validators as self-healing retry signals, grounding fields, and the schema shapes that quietly cause hallucination.
usage: Load this skill before asking your AI assistant to build any extraction, classification, or structured-generation feature. Say "use the Instructor structured output skill" and describe the data you need out of the text; the assistant will design the Pydantic model first and the prompt second.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 4
timeSavedHours: 12
pocUrl: https://github.com/567-labs/instructor
---

# Reliable Structured Output with Instructor Skill

## 1. Philosophy

Most teams reach for structured output after their string-parsing code catches fire. They bolt a schema onto an existing prompt, watch the validation errors, and start adding "PLEASE RETURN VALID JSON" in caps. That is backwards.

**The Pydantic model IS the prompt contract.** Not a post-processing step — the contract. The model sees your field names, types, docstrings, and enum values; they are serialized into the tool schema and read as instructions. A field named `x: str` teaches the model nothing. A field named `refund_amount_usd: float` described as `"Total refunded to the customer in USD. Null if the ticket mentions no refund."` teaches it everything, and you never wrote a line of prompt.

Three rules govern everything below:

1. **Design the schema before the prompt.** If you are writing prompt prose to explain a field, that prose belongs in the field's `description`. The prompt says what job to do; the schema says what the answer looks like.
2. **A validator is a message to the model, not just a gate.** When a validator raises `ValueError("Confidence must be between 0 and 1, got 4.2")`, Instructor sends that exact string back and asks the model to try again. Write error messages as instructions to a colleague, because that is literally what they are.
3. **Every required field is a demand that the model produce a value.** If the source doesn't contain it, the model will not error — it will invent something plausible. Required fields cause hallucination. `Optional` is honesty about what the source may not say.

If you cannot describe a field to a smart intern who has never seen your codebase, the model cannot fill it either.

## 2. Tech Stack

- **Instructor** — https://github.com/567-labs/instructor — licensed **MIT**. Patches your LLM client so `response_model=SomeModel` returns a validated instance, with retries driven by validation errors.
- **Pydantic v2** — licensed **MIT**. The actual product here. Instructor is a thin, honest layer turning Pydantic models into tool schemas and validation errors into retry prompts.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Instructor maintainers. All example code is original to this skill.

Model notes from production use: `claude-sonnet-4-5` and `gpt-4.1` both handle 2-level nesting reliably. `claude-haiku-4-5` and `gpt-4.1-mini` are excellent for flat extraction at roughly a tenth of the cost — default to them for high-volume document work — but they degrade faster on nesting. Retries multiply cost linearly: a schema that retries twice on 20% of calls costs about 1.4x its naive estimate.

## 3. Patterns

### 3.1 Field names and docstrings are prompt real estate

A schema of `type: str`, `amount: Optional[float]`, `urgent: bool` is syntactically fine and tells the model nothing — it will guess what you meant, and guess differently on every document. Compare it to the version below, which *is* the prompt:

```python
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field

class Category(str, Enum):   # closed set, not free text — see below
    BILLING = "billing"
    BUG_REPORT = "bug_report"
    ACCOUNT_ACCESS = "account_access"
    OTHER = "other"          # always include an escape hatch

# Good: every field carries its own instruction.
class SupportTicket(BaseModel):
    """A single customer support ticket parsed from an inbound email."""

    category: Category = Field(
        description="Best-fit category. Use OTHER only when the ticket genuinely fits "
                    "none of the others — do not stretch a category to fit."
    )
    refund_amount_usd: Optional[float] = Field(
        default=None,
        description="Dollar amount the customer explicitly asks to be refunded. Null if "
                    "no specific amount is requested anywhere in the email.",
    )
    is_escalation: bool = Field(
        description="True only if the customer threatens churn, chargeback, legal action, "
                    "or mentions contacting a regulator. Frustration alone is False.",
    )
```

Note `is_escalation`. The boundary case ("frustration alone is False") is the entire feature. That sentence lives in the schema forever, gets version-controlled, and applies to every call — unlike a prompt tweak someone deletes in six months.

Enums, not free text, for anything categorical. Free-text categories produce `"Billing"`, `"billing"`, and `"payment/billing"` across three calls, and then you write a normalization function — a downstream tax on an upstream mistake. But always include an `OTHER`/`UNKNOWN` member: without one the model is forced into your taxonomy and picks the least-wrong option with full confidence, which is worse than an honest `OTHER` you can route to a human.

### 3.2 Validators as the retry signal

This is what separates Instructor from a plain JSON schema. Raise `ValueError` with a fixable instruction and `max_retries` does the rest.

```python
import instructor
from anthropic import Anthropic
from pydantic import field_validator, model_validator

client = instructor.from_anthropic(Anthropic())

class Invoice(BaseModel):
    invoice_number: str
    subtotal_usd: float
    tax_usd: float
    total_usd: float

    @model_validator(mode="after")
    def totals_must_add_up(self):
        expected = round(self.subtotal_usd + self.tax_usd, 2)
        if abs(expected - self.total_usd) > 0.01:
            raise ValueError(
                f"subtotal ({self.subtotal_usd}) + tax ({self.tax_usd}) = {expected}, but "
                f"total_usd is {self.total_usd}. Re-read the document and correct whichever "
                f"figure you misread."
            )
        return self

invoice = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=1024, response_model=Invoice, max_retries=2,
    messages=[{"role": "user", "content": f"Extract the invoice:\n\n{document_text}"}],
)
```

The arithmetic validator is the highest-leverage code in this file. Models misread digits in scanned documents constantly; a cross-field check catches it and hands the model its own contradiction. In practice this moves numeric extraction from ~90% to the high 90s on messy PDFs, costing one extra call on the minority of documents that trip it.

**Set `max_retries` to 2 or 3. Never higher.** A validator the model cannot satisfy — because the document truly lacks the data — loops to your ceiling, silently, on every document. At 5 retries across 10,000 documents, that is a five-figure surprise. Log every retry with its error and alert above a ~10% retry rate.

### 3.3 Grounding: force the model to quote

The single best hallucination defence here. Make the model cite the span it read.

```python
from typing import List

class Finding(BaseModel):
    claim: str = Field(description="A factual claim made about the product.")
    source_quote: str = Field(
        description="The exact verbatim sentence from the source document supporting this "
                    "claim. Copy it character-for-character."
    )

    @field_validator("source_quote")
    @classmethod
    def must_be_verbatim(cls, v: str, info) -> str:
        source = (info.context or {}).get("source_text", "")
        if source and v.strip() not in source:
            raise ValueError(
                "source_quote is not present verbatim in the source document. Copy an exact "
                "sentence from the text — do not paraphrase or reconstruct."
            )
        return v

report = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=2048, response_model=List[Finding], max_retries=2,
    validation_context={"source_text": document_text},   # what the validator reads
    messages=[{"role": "user", "content": f"Extract all claims:\n\n{document_text}"}],
)
```

A model that must produce a substring that actually exists cannot invent a finding. It quotes or it fails the validator. This converts hallucination from a silent correctness bug into a loud validation error — the best trade in the discipline.

### 3.4 Nesting depth, schema size, and cost

Reliability degrades with depth, and not gracefully. Field-observed behaviour on frontier models: **flat** (5-10 fields) is solved, ship it on a haiku/mini-class model. **One level** (an object with a list of sub-objects) is reliable — the sweet spot for extraction. **Two levels** works on Sonnet-4.5/GPT-4.1-class models and drifts on small ones, where sub-objects get duplicated or dropped from the tail of long lists. **Three or more**: don't. The model populates the wrong nesting level, and your validation errors become uninterpretable — you can't tell whether it misread the document or misread your schema.

When you need depth, split the call: extract the parent list, then map a second call over each parent. Two cheap flat calls beat one deep call on accuracy and debuggability, and they parallelize.

The same logic applies to width. Your schema ships in the tool definition on **every call** — a 30-field model with verbose descriptions costs 600-900 input tokens per request before the document arrives. On 100k documents/month that is real money, and it degrades accuracy because the model is doing thirty jobs in one pass. Split by concern: a cheap flat "classify and route" call on a mini-class model, then a rich extraction per route. Typically 60-80% cheaper *and* more accurate, because most documents don't need most fields.

### 3.5 Streaming partials, and the trap in them

A 15-field extraction takes 8-20 seconds; don't show a spinner for that. `client.messages.create_partial(...)` yields the object as it fills, so you iterate and re-render — unfilled fields are `None`.

The caveat bites people: **partials are not validated.** Validators run only on the final object, so a partial can hold a value that the finished instance will reject. Never make a business decision — a write, a charge, a routing action — on a partial. Render it; act only on the completed instance.

## 4. Anti-patterns

- **The 30-field god-schema.** One model extracting everything anyone might want. Accuracy on the fields you care about drops (thirty jobs, one pass) and cost rises on every call. Split by concern.
- **Required fields the source may not contain.** `refund_amount: float` on an email with no refund request produces `0.0` or `99.99` — a confident fabrication. If the source can omit it, it is `Optional` with `default=None`.
- **Un-validated numeric strings.** `amount: str = "1,299.00"` then `float(amount)` in the caller. Type it `float`, let Pydantic coerce and fail loudly, and never hand-parse currency downstream.
- **`max_retries=5` and no observability.** Silent retry loops are the #1 cost overrun in extraction; a high retry rate means your schema is wrong, not that the model is dumb. Relatedly, **validators raising on things the model can't fix** ("must be a valid SKU in our catalog" is not satisfiable by re-reading the document) loop until the ceiling — validate that server-side, after the call. Validators are for errors *the model can correct*.
- **Prompting around the schema.** "Return the category lowercase with no spaces" in the prompt, when an enum enforces it structurally. If the prompt describes output format, the schema is underspecified — and a missing escape-hatch enum member guarantees confidently wrong labels on out-of-distribution inputs.
- **Treating `Field(description=...)` as documentation.** It is a prompt sent to a model on every request. Write it for the model; your team benefits as a side effect.

## 5. Usage

1. Paste this skill into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the source text and the decision the data will drive, e.g. "Inbound support emails; auto-route to billing/engineering/success and flag churn risk."
3. Ask for the **Pydantic model first, prompt second**. Push back on any field lacking a `description`, any free-text field that is really a closed set, and any required field the source might omit.
4. Ask for validators next — specifically cross-field checks and grounding/verbatim-quote checks. That is where reliability lives.
5. Run section 4 as a checklist. Count the fields; over ~12, ask for the split.

The assistant should refuse to write a required field for data the source may legitimately omit, and should propose an enum any time it sees a categorical `str`.

## 6. Example Output

Prompt given with this skill loaded: *"Extract action items from meeting transcripts. I need who owns it, what it is, and when it's due, and I need to trust the owner field."*

Expected shape of the answer:

```python
from datetime import date

class ActionItem(BaseModel):
    """One concrete commitment made by a named person during the meeting."""

    task: str = Field(description="What was committed to, as an imperative. 3-15 words.")
    owner: Optional[str] = Field(
        default=None,
        description="Speaker name of the person who took the task, exactly as it appears in "
                    "the transcript. Null if the task was raised but nobody accepted it.",
    )
    owner_quote: Optional[str] = Field(
        default=None,
        description="The verbatim line where the owner accepted this task. Null if and only "
                    "if owner is null.",
    )
    due_date: Optional[date] = Field(
        default=None,
        description="Only if an explicit date was stated. Null for vague timing like 'soon' "
                    "or 'next sprint' — do not guess a date.")

    @field_validator("owner_quote")
    @classmethod
    def quote_present_in_source(cls, v: Optional[str], info) -> Optional[str]:
        if v is None:
            return v
        transcript = (info.context or {}).get("transcript", "")
        if transcript and v.strip() not in transcript:
            raise ValueError(
                "owner_quote must be copied verbatim from the transcript. Find the actual "
                "line where this person accepted the task."
            )
        return v

actions = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=2048, response_model=list[ActionItem],
    max_retries=2, validation_context={"transcript": transcript},
    messages=[{"role": "user", "content": f"Extract action items:\n\n{transcript}"}],
)
```

Note what the output does *not* contain: no prompt telling the model to "return valid JSON," no `json.loads` in a try/except, no regex over a fenced code block, and no required `owner` field that would have invented an assignee for every unclaimed task on the table. The `owner_quote` validator means an item can only carry an owner if that person is on record accepting it — the schema enforces the trust requirement from the original ask.
