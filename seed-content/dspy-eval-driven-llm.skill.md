---
title: Eval-Driven LLM Systems with DSPy Skill
category: AI/ML
description: Stop hand-tuning prompt strings and start compiling them against a metric you actually trust. Covers signatures and modules, building a dev set before you write a prompt, LLM-as-judge calibration, optimizer economics, and the eval leakage that makes your numbers a lie.
usage: Load this skill before asking your AI assistant to build or improve any LLM pipeline where quality matters more than a demo. Say "use the DSPy eval-driven skill" and describe the task; the assistant will demand a dev set and a metric before it writes a single prompt.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 26
pocUrl: https://github.com/stanfordnlp/dspy
---

# Eval-Driven LLM Systems with DSPy Skill

## 1. Philosophy

Here is the workflow almost everyone runs: write a prompt, eyeball ten outputs, add "Be concise and accurate." to the top, eyeball ten more, ship. Six weeks later the prompt is 900 words of accumulated superstition, nobody remembers why clause seven exists, and nobody can change anything because there is no way to tell if a change made it worse.

That is not engineering. It is haunting a text file.

**The thesis: you do not write prompts. You define what the task takes in and puts out, you define how to score it, and an optimizer writes the prompt.** DSPy's real contribution is not syntax — it is forcing the discipline. You cannot compile a program without a metric, and the moment you have a metric your quality claim is falsifiable. Everything good follows from that.

Three rules govern everything below:

1. **The dev set comes before the prompt.** 50-200 examples, hand-labeled, built while you still remember what "good" means. If you cannot produce 50 examples, you do not understand the task well enough to prompt it, and no amount of prompt prose will rescue you.
2. **A metric you don't trust is worse than no metric.** No metric leaves you honestly uncertain. A bad metric makes you confidently wrong and lets an optimizer march your system toward a target nobody wanted.
3. **The prompt is a compilation artifact, not source code.** You would not hand-edit assembly and re-run the compiler. Change the signature, the metric, or the data, and recompile.

If your answer to "did that change help?" is "it feels better," you are not doing this yet.

## 2. Tech Stack

- **DSPy** — https://github.com/stanfordnlp/dspy — licensed **MIT**. Declarative signatures, composable modules, and optimizers that bootstrap demonstrations and instructions against your metric.
- **Python 3.10+** and any LM provider DSPy can reach. Examples use `claude-sonnet-4-5` as the task model and `claude-opus-4-5` as the judge.

This skill is an independent, original guide; it is not affiliated with or endorsed by the DSPy maintainers. All example code is original to this skill.

Economics from real runs: a bootstrapped few-shot optimization over ~120 training examples with a Sonnet-class task model and an Opus-class judge lands in the **$8-40** range and takes **10-45 minutes**, dominated by judge calls, not task calls. Budget for weekly, not per-commit. CI runs the *eval*, never the optimizer.

## 3. Patterns

### 3.1 Signatures: declare the contract, not the wording

A signature is the input/output contract. Its docstring and field descriptions are the only prose you write by hand — and even those are hints, not instructions.

```python
import dspy

class ClassifyTicket(dspy.Signature):
    """Route an inbound support ticket to the team that can actually resolve it."""

    ticket_text: str = dspy.InputField(desc="Raw customer email body, unedited.")
    account_tier: str = dspy.InputField(desc="One of: free, pro, enterprise.")

    team: str = dspy.OutputField(desc="One of: billing, engineering, success, spam.")
    rationale: str = dspy.OutputField(desc="One sentence citing the phrase that decided it.")

dspy.configure(lm=dspy.LM("anthropic/claude-sonnet-4-5", max_tokens=1000))
route = dspy.Predict(ClassifyTicket)
```

Notice what is absent: no "You are a helpful support routing assistant," no "Think step by step," no output format instructions, no examples. Those are the optimizer's job. Writing them by hand pre-empts the search and locks in your guesses.

### 3.2 Modules: Predict, ChainOfThought, ReAct — and when each earns its cost

`dspy.Predict` is 1 call and cheapest. `dspy.ChainOfThought` is 1 call at 3-5x the output tokens. `dspy.ReAct(sig, tools=[...])` is N calls. Opinionated guidance, because people cargo-cult this:

- **`Predict`** for anything a competent human does in under five seconds — classification, extraction, short rewrites. CoT here burns tokens for a fraction of a point.
- **`ChainOfThought`** when the task has genuine intermediate steps: multi-hop reasoning, arithmetic, weighing evidence. Real gains on hard tasks, real waste on easy ones. **Measure it.** It is a hypothesis, not a best practice.
- **`ReAct`** only when the model needs information it doesn't have. Every tool call is another chance to loop; latency compounds to 8-30 seconds. If the retrieval set is known upfront, retrieve and pass it to `Predict`.

Compose them as normal Python — each sub-module is optimized independently, which is the payoff for declaring instead of stringing:

```python
class SupportPipeline(dspy.Module):
    def __init__(self):
        super().__init__()
        self.classify = dspy.Predict(ClassifyTicket)
        self.draft = dspy.ChainOfThought(DraftReply)

    def forward(self, ticket_text: str, account_tier: str):
        routed = self.classify(ticket_text=ticket_text, account_tier=account_tier)
        if routed.team == "spam":
            return dspy.Prediction(team="spam", reply=None)
        reply = self.draft(ticket_text=ticket_text, team=routed.team)
        return dspy.Prediction(team=routed.team, reply=reply.reply)
```

### 3.3 Build the dev set first. Yes, by hand.

Before any code. Pull 150 real inputs from your logs — not invented ones, which encode the assumptions you're trying to test — and label them.

```python
import dspy, random

examples = [
    dspy.Example(ticket_text=r["text"], account_tier=r["tier"], team=r["team"])
      .with_inputs("ticket_text", "account_tier")
    for r in load_labeled_tickets()
]
random.Random(42).shuffle(examples)   # fixed seed: splits must be reproducible
train, dev, test = examples[:80], examples[80:130], examples[130:]
```

Three splits, three jobs, no exceptions. **train** — the optimizer eats this; bootstrapped demos come from here. **dev** — you look at this constantly, every experiment, every metric tweak. **test** — you look at it when you ship, and **you write down how many times you have looked**, because every look burns a little of its validity.

Deliberately oversample hard cases. A dev set that is 90% easy tickets reports 94% accuracy and tells you nothing, because the 6% you fail is where the product's entire pain lives. Load it toward ambiguity, sarcasm, multi-issue emails, and the cases support complains about.

### 3.4 Metrics: programmatic where you can, judge where you must

Exact match is perfect for closed sets and **worthless for prose** — a reply that is 100% correct but phrased differently scores 0. So do BLEU and ROUGE, which reward n-gram overlap with one arbitrary reference and would score a factually wrong paraphrase above a correct rewording.

Before reaching for a judge, try harder to be programmatic. Most "subjective" metrics have a checkable core:

```python
def routing_metric(example, pred, trace=None) -> float:
    return float(pred.team == example.team)          # closed set: exact match is correct

def reply_metric(example, pred, trace=None) -> float:
    reply = pred.reply or ""
    checks = [
        example.required_fact.lower() in reply.lower(),      # did it say the thing
        "refund" not in reply.lower() or example.refund_ok,  # no unauthorized promises
        len(reply.split()) <= 180,                           # length ceiling
        example.customer_name in reply,                      # personalization
    ]
    return sum(checks) / len(checks)
```

That metric is free, deterministic, runs in CI in milliseconds, and catches the failures that get you paged. Reach for a judge only for the genuinely irreducible part: tone, helpfulness, coherence.

### 3.5 LLM-as-judge, done properly

Most judges are one line saying "Rate this 1-10." That judge is a random number generator with good manners. A real one has five properties.

```python
class JudgeReply(dspy.Signature):
    """Score a support reply against a rubric with concrete anchors."""

    ticket: str = dspy.InputField()
    reply: str = dspy.InputField()

    score: int = dspy.OutputField(
        desc=("1 = factually wrong, or promises something the agent cannot authorize. "
              "2 = accurate but does not resolve the customer's actual question. "
              "3 = resolves the question; tone is robotic or hedged. "
              "4 = resolves it clearly, correct tone, no padding. "
              "5 = resolves it AND pre-empts the obvious follow-up. "
              "Length is not quality: a 40-word reply that resolves it scores above a "
              "200-word reply that resolves it.")
    )
    justification: str = dspy.OutputField(desc="Quote the span that decided the score.")

judge_lm = dspy.LM("anthropic/claude-opus-4-5", max_tokens=600)

def judged_metric(example, pred, trace=None) -> float:
    with dspy.context(lm=judge_lm):
        out = dspy.Predict(JudgeReply)(ticket=example.ticket_text, reply=pred.reply)
    return (int(out.score) - 1) / 4.0
```

The five rules, each earned the hard way:

1. **Anchors, not adjectives.** "1-10 on helpfulness" gives you 7s forever. Every point needs a concrete, checkable description, like above.
2. **Judge a different model than the one under test.** Models prefer their own output. Self-preference bias is real and it flatters you. Sonnet under test → Opus (or another family) judging.
3. **Calibrate against ~50 human labels.** Label 50 dev outputs yourself, run the judge, compute agreement — count a hit when the judge is within one point of you. **Below ~80% agreement your judge is noise, and optimizing against it is worse than useless**: it will confidently move your system somewhere you did not want to go.
4. **Report agreement in your README.** "Judge agrees with human labels 86% of the time (n=50)" is a quality claim. "We use LLM-as-judge" is marketing.
5. **Fight the known biases.** *Verbosity:* judges reward length — put an anti-length clause in the rubric, then correlate score against word count on dev; above ~0.4 your judge is measuring word count. *Position:* in pairwise comparisons the first option wins more, so run both orders and average. *Self-preference:* see rule 2.

### 3.6 Optimizers: what actually happens when you compile

```python
from dspy.teleprompt import BootstrapFewShotWithRandomSearch
from dspy.evaluate import Evaluate

optimizer = BootstrapFewShotWithRandomSearch(
    metric=reply_metric, max_bootstrapped_demos=4, max_labeled_demos=8,
    num_candidate_programs=8,
)
compiled = optimizer.compile(SupportPipeline(), trainset=train, valset=dev)
compiled.save("artifacts/support_v3.json")   # commit this

evaluate = Evaluate(devset=dev, metric=reply_metric, num_threads=8)
print("baseline:", evaluate(SupportPipeline()))   # 0.61
print("compiled:", evaluate(compiled))            # 0.79
```

Demystified: it runs your program over **train**, keeps the traces your metric scored well, uses those as few-shot demonstrations, tries several candidate demo sets, and keeps whichever scores best on **valset**. That is the whole trick — and it is why train-set quality dominates. The optimizer can only bootstrap demos from examples your program *already sometimes gets right*. If your baseline scores 0 on the hard cases, it will never learn them; it will just get better at the easy ones.

Start with `BootstrapFewShot` (cheap, minutes, usually most of the gain). Graduate to random search once you trust the metric and have budget. Instruction-rewriting optimizers cost meaningfully more and mainly pay off after few-shot demos plateau. **Always record the baseline** — an optimized number without an unoptimized one beside it is not a result.

### 3.7 Regression gates in CI

The optimizer runs on your laptop, weekly; you commit the artifact. **CI runs the eval, every PR.**

```python
# tests/test_quality.py
import json, pytest
from dspy.evaluate import Evaluate

BASELINE = json.load(open("artifacts/quality_baseline.json"))  # {"routing": 0.88, "reply": 0.79}
TOLERANCE = 0.03   # absorbs LM sampling noise; tighten as the dev set grows

@pytest.mark.parametrize("name,metric", [("routing", routing_metric), ("reply", reply_metric)])
def test_no_regression(name, metric):
    pipeline = SupportPipeline()
    pipeline.load("artifacts/support_v3.json")
    score = Evaluate(devset=load_dev(), metric=metric, num_threads=8)(pipeline)
    assert score >= BASELINE[name] - TOLERANCE, f"{name} regressed: {score:.3f}"
```

Gate against **dev**, not test. Dev is for iterating and you will look at it a thousand times — that is its job. If CI gates on test, you have leaked test into your development loop and your final number is fiction. Keep the dev eval under ~60 seconds (~50 examples, threaded); anything slower gets disabled within a month.

## 4. Anti-patterns

- **Optimizing against the test set.** The cardinal sin. Every optimizer run touching test bakes test into your prompt, and your reported number becomes a measure of memorization.
- **Eval leakage by osmosis.** Subtler: you read test failures, tweak the signature, re-run. You have become the optimizer, with test as your train set. Same crime, slower.
- **A judge that rewards length.** Untested judges almost always do. Correlate score against word count on dev; if it's strong, your "quality" metric is a verbosity metric and the optimizer will happily give you 300-word replies to yes/no questions.
- **The same model judging itself.** Self-preference bias inflates scores for free. You feel great and learn nothing.
- **"It looks better."** Vibes are a hypothesis, not a result. If you cannot name the number that moved, you do not know that it moved.
- **A metric that doesn't correlate with the actual complaint.** Support says "the replies feel dismissive." You optimize factual accuracy to 0.94 and ship. The complaint is unchanged, because you measured what was easy to measure instead of what was wrong. Build the metric backwards from the complaint.
- **Skipping the baseline.** "We got 0.79 after optimization" is meaningless. It might have been 0.81 before.
- **Hand-editing the compiled prompt.** You just decoupled the artifact from its source; nobody can recompile without losing your edit.
- **A dev set of 12 examples.** One example is 8 points of accuracy. Every run looks like a breakthrough or a catastrophe and none of it is real. 50 minimum; 150+ if the task has real variance.
- **Running the optimizer in CI.** $8-40 and 45 minutes per PR, plus nondeterministic gates. Compile locally, commit the artifact, evaluate in CI.

## 5. Usage

1. Paste this skill into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the task **and the complaint** — what is actually wrong today, in the words of whoever complained. The metric derives from that sentence.
3. Ask for, in order: (a) the signature, (b) the dev-set schema and a labeling plan targeting hard cases, (c) the metric — programmatic first, judge only for the irreducible part, (d) the module choice with a stated reason, (e) the optimizer setup with a cost estimate.
4. If a judge is involved, get the anchored rubric and the calibration script *before* the optimizer. Uncalibrated judge → don't run the optimizer at all.
5. Record baseline before compiled. Commit the artifact and the baseline JSON. Gate CI on dev.

The assistant should refuse to write a prompt string by hand, and should ask "what's the metric?" before writing any pipeline code.

## 6. Example Output

Prompt given with this skill loaded: *"Our RAG bot answers questions over our API docs. Users say it makes stuff up. Improve it."*

Expected shape of the answer — it should open by refusing the frame:

> "Makes stuff up" is a complaint, not a metric. Before touching the pipeline: pull 60 real logged questions where users complained, plus 60 where they didn't. For each, label whether every factual claim is supported by the retrieved chunks. That labeled set is the product here — the pipeline changes are downstream of it.

```python
class AnswerFromDocs(dspy.Signature):
    """Answer a developer's question using only the provided documentation excerpts."""

    question: str = dspy.InputField()
    context: str = dspy.InputField(desc="Retrieved documentation excerpts, newline-separated.")

    answer: str = dspy.OutputField()
    supporting_quotes: str = dspy.OutputField(
        desc="Verbatim sentences from context supporting each claim, one per line. "
             "Write NONE if the context does not answer the question."
    )

def groundedness(example, pred, trace=None) -> float:
    """Programmatic. Every quote must literally exist in the retrieved context."""
    quotes = [q.strip() for q in (pred.supporting_quotes or "").split("\n") if q.strip()]
    if not quotes:
        return 0.0
    if quotes == ["NONE"]:
        return 1.0 if example.answerable is False else 0.0   # correct abstention
    return sum(q in example.context for q in quotes) / len(quotes)

evaluate = Evaluate(devset=dev, metric=groundedness, num_threads=8)
print("baseline:", evaluate(dspy.Predict(AnswerFromDocs)))          # 0.58
compiled = BootstrapFewShot(metric=groundedness, max_bootstrapped_demos=4).compile(
    dspy.Predict(AnswerFromDocs), trainset=train
)
print("compiled:", evaluate(compiled))                              # 0.86
```

Note what the output does *not* contain: no "You are a helpful assistant that never hallucinates" system prompt, no temperature fiddling, no suggestion to "add more context" or switch to a bigger model. And note the primary metric is **programmatic, not a judge** — groundedness is substring containment, which costs nothing, runs in CI, and cannot be gamed by verbosity. The abstention branch is what most teams miss: a bot that says "the docs don't cover this" scores 1.0 here, which is the only way the optimizer ever learns to say it.
