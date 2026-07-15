---
title: Building MCP Tool Servers Skill
category: AI/ML
description: Build Model Context Protocol servers that a model can actually use correctly, not just call. Covers tool descriptions as prompt surface, token-efficient result shapes, errors that teach, destructive-action confirmation, and testing the whole thing without an LLM in the loop.
usage: Load this skill before asking your AI assistant to build, review, or debug an MCP server. Say "use the MCP tool server skill" and describe the system you're exposing; the assistant will design the tool surface for a model reader first and the implementation second.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 0
timeSavedHours: 10
pocUrl: https://github.com/modelcontextprotocol/python-sdk
---

# Building MCP Tool Servers Skill

## 1. Philosophy

The first MCP server everyone writes is a mechanical wrapper: forty functions, one per endpoint, each description copied from the internal docstring, each returning `json.dumps(response)`. It works in a demo and falls apart in real use — the model picks the wrong tool, calls it six times, and blows the context window with a payload nobody reads.

**An MCP server is not an API. It is a prompt with side effects.** Your tool names, descriptions, argument names, and — critically — your *return values* all land in the model's context. They are read by a stranger with no access to your codebase, your Slack, or your assumptions. Every one of them is prompt engineering whether you treat it that way or not.

Three rules govern everything below:

1. **Design for the reader, not the caller.** Write for a competent contractor on day one who has never seen your system. If a human couldn't pick the right tool from your descriptions alone, neither can the model — it just fails more politely.
2. **Context is your scarcest resource. Spend it like money.** A tool returning 40k tokens of JSON hasn't given the model information; it has evicted the conversation. Paginate, truncate, summarize, hand back ids the model can fetch with.
3. **Fewer tools, each answering a whole question.** Six tools that resolve real user intents beat forty that expose endpoints. Tool count is the dominant driver of wrong-tool selection.

If your server needs a README to be used correctly, the tool descriptions are the bug.

## 2. Tech Stack

- **Model Context Protocol Python SDK** — https://github.com/modelcontextprotocol/python-sdk — licensed **MIT**. Server and client implementation of MCP for Python, with decorator-based tool registration and stdio/HTTP transports.
- **Pydantic v2** (MIT) — argument schemas. Your type hints become the model's parameter contract.
- **Python 3.10+**.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Model Context Protocol maintainers. All example code is original to this skill.

The three primitives, in order of how often you'll need them: **Tools** — model-invoked functions with side effects or computation; 95% of what you'll build. **Resources** — addressable read-only content the *client* chooses to load. **Prompts** — reusable templates the user picks from a menu; genuinely useful, almost always skipped.

**Transports:** `stdio` for anything local — the client spawns your process; no ports, no auth, no CORS. Start here always. `HTTP` only when the server is genuinely remote and shared, at which point authentication, per-tenant isolation, and rate limits become your problem. Do not reach for HTTP because it feels more "real."

## 3. Patterns

### 3.1 The description is the prompt

Same function, twice. The second is a different product.

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("shop-analytics")

# Bad: the model has to guess, and it will guess wrong.
@mcp.tool()
def get_orders(start: str, end: str, status: int = 0) -> str:
    """Gets orders."""

# Good: a stranger could use this correctly on the first try.
@mcp.tool()
def list_orders(start_date: str, end_date: str, status: str = "any", limit: int = 20) -> str:
    """List customer orders placed in a date range, newest first.

    Use this to answer questions about individual orders ("what did customer X buy
    last week?"). For totals, revenue, or counts, use summarize_revenue instead —
    it is far cheaper than listing orders and adding them up yourself.

    Args:
        start_date: Inclusive start, YYYY-MM-DD, UTC.
        end_date: Inclusive end, YYYY-MM-DD, UTC. Max range is 90 days.
        status: One of "any", "paid", "refunded", "cancelled". Defaults to "any".
        limit: Max orders to return, 1-100. Returns the newest `limit` orders and
            tells you how many were omitted.
    """
```

The load-bearing sentence is the second paragraph: **it tells the model when *not* to use this tool.** Negative routing guidance is the highest-value thing you can write and virtually nobody writes it. Without it the model lists 400 orders and sums them in its head — slowly, expensively, and wrong.

Checklist for every description: one line on what it does in the user's vocabulary; one line on when to use it vs. the neighbouring tool; units, timezones, and formats on every argument (`"date"` is not a type, `"YYYY-MM-DD, UTC"` is); hard limits stated up front so the model doesn't discover them via error.

### 3.2 Argument schemas with Pydantic

Type hints become the model's parameter schema. Constrain them and impossible calls become impossible rather than becoming your error handler's problem.

```python
from datetime import date
from enum import Enum
from typing import Annotated
from pydantic import Field

class OrderStatus(str, Enum):
    ANY = "any"
    PAID = "paid"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"

@mcp.tool()
def list_orders(
    start_date: Annotated[date, Field(description="Inclusive start date, UTC.")],
    end_date: Annotated[date, Field(description="Inclusive end, UTC. Max 90 days after start.")],
    status: Annotated[OrderStatus, Field(description="Filter by order status.")] = OrderStatus.ANY,
    limit: Annotated[int, Field(ge=1, le=100, description="Max orders returned.")] = 20,
) -> str:
    """List customer orders placed in a date range, newest first. ..."""
```

The enum means the model cannot pass `"Paid "` or `"complete"`. The `ge`/`le` bounds mean it cannot ask for 10,000 rows. Every constraint pushed into the schema is a failure mode you never write a message for.

### 3.3 Return shapes: the context window is the budget

Where most servers die. A model reading 40k tokens of order JSON to answer "how many orders last week?" has burned real money and half the conversation to compute one integer.

```python
# Bad: 400 orders x ~90 tokens = 36k tokens of unbounded dump.
@mcp.tool()
def list_orders(...) -> str:
    return json.dumps([o.to_dict() for o in query(...)])

# Good: bounded, shaped, self-describing, and it says what it's leaving out.
@mcp.tool()
def list_orders(start_date: date, end_date: date, status: OrderStatus = OrderStatus.ANY,
                limit: int = 20) -> str:
    rows = query_orders(start_date, end_date, status)
    total, shown = len(rows), rows[:limit]

    lines = [f"{total} orders matched ({start_date} to {end_date}, status={status.value})."]
    if total > limit:
        lines.append(
            f"Showing the {limit} newest. {total - limit} omitted — narrow the date range "
            f"or call summarize_revenue if you need aggregate figures."
        )
    lines += ["", "order_id | date       | customer          | status   | total_usd"]
    for o in shown:
        lines.append(
            f"{o.id:<8} | {o.placed_at:%Y-%m-%d} | {o.customer_email[:17]:<17} "
            f"| {o.status:<8} | {o.total_usd:>9.2f}"
        )
    lines += ["", "Use get_order_detail(order_id) for line items on a specific order."]
    return "\n".join(lines)
```

Four deliberate choices there:

- **A header with the true count.** The model knows 400 exist though it sees 20, and can answer the count question without paginating.
- **A pointer to the cheaper tool**, placed exactly where the model would otherwise brute-force it.
- **A compact table, not JSON.** JSON spends ~40% of its tokens re-printing key names on every row. Same data, roughly half the tokens.
- **A drill-down pointer with the exact id format**, so the model goes deeper without guessing.

Rule of thumb: **any tool that can return more than ~2,000 tokens needs a limit argument and a truncation notice.** No exceptions. "It's usually small" means it is enormous on the one customer who matters.

### 3.4 Errors are instructions, not exceptions

An unhandled traceback tells the model "something broke." A good error tells it what to do next.

```python
@mcp.tool()
def get_order_detail(order_id: str) -> str:
    """Get line items, shipping, and payment status for one order.

    Args:
        order_id: Order id like "ORD-10432". Get these from list_orders.
    """
    if not order_id.startswith("ORD-"):
        return (
            f"Invalid order_id '{order_id}'. Order ids look like 'ORD-10432'. If you have "
            f"a customer email instead, call list_orders to find their orders."
        )
    order = fetch_order(order_id)
    if order is None:
        return (
            f"No order {order_id} exists. Similar ids that do exist: "
            f"{', '.join(nearest_ids(order_id, n=3))}. Note that ids are not sequential "
            f"per customer — do not guess."
        )
    return render_order(order)
```

Return the error as normal text. The model reads it, corrects, and retries — usually on the next call. Raising `ValueError` gets you a protocol-level error the model often just gives up on. **The error text is a prompt, so write it as one.** The "do not guess" clause exists because otherwise the model tries `ORD-10433`, then `ORD-10434`. Reserve real exceptions for genuine server faults (database down) where retrying is pointless.

### 3.5 Destructive actions: confirm, validate, make idempotent

```python
@mcp.tool()
def issue_refund(
    order_id: Annotated[str, Field(description="Order to refund, e.g. 'ORD-10432'.")],
    amount_usd: Annotated[float, Field(gt=0, description="USD. Must not exceed order total.")],
    reason: Annotated[str, Field(description="Why, for the audit log. Required.")],
    confirm: Annotated[bool, Field(description="Must be true to execute. Call false first.")] = False,
) -> str:
    """Issue a refund against an order. THIS MOVES REAL MONEY.

    Always call with confirm=false first to preview, show the preview to the user, and
    only call with confirm=true after the user has explicitly approved this exact
    amount. Never set confirm=true on your own initiative.
    """
    order = fetch_order(order_id)
    if order is None:
        return f"No order {order_id}. Nothing refunded."
    if amount_usd > order.total_usd:
        return (
            f"Refund ${amount_usd:.2f} exceeds order total ${order.total_usd:.2f}. Nothing "
            f"refunded. Reduce the amount or check the order id."
        )
    if not confirm:
        return (
            f"PREVIEW — nothing has happened yet.\nWould refund ${amount_usd:.2f} of "
            f"${order.total_usd:.2f} to {order.customer_email} for {order_id}.\n"
            f"Reason: {reason}\nShow this to the user. If they approve, call again with "
            f"confirm=true."
        )
    result = payments.refund(order_id, amount_usd,
                             idempotency_key=idempotency_key(order_id, amount_usd, reason))
    if result.replayed:
        return f"This exact refund was already issued ({result.refund_id}). No double charge."
    return f"Refunded ${amount_usd:.2f} for {order_id}. Refund id {result.refund_id}."
```

Three defences stacked, because one is not enough: the **`confirm` flag** forces a two-turn flow with a human in the middle, and the preview string is written *at the model*, telling it what to do next. The **idempotency key** derived from the arguments matters because models retry on timeouts — without it, a network blip becomes a double refund. **Validation before the side effect**, returned as text, means a bad call costs nothing and teaches the constraint.

Also: mark destructive tools as such in their annotations so clients can surface a confirmation UI, and **keep read and write tools in separate servers** where you can. A read-only server is one you can hand out freely.

### 3.6 Secrets stay server-side, always

```python
import os
mcp = FastMCP("shop-analytics")
_DB_URL = os.environ["SHOP_DB_URL"]          # read once, at startup
_API_KEY = os.environ["PAYMENTS_API_KEY"]    # never an argument, never in a return value
```

Never accept a credential as a tool argument — it lands in the model's context, in every trace log, and possibly on the user's screen. Never return one. Scrub them from error text: a database exception string frequently contains the full connection URL, password included. And if your server only sees one tenant's data because the model passed the right `tenant_id`, you have no security model — bind the tenant at startup or at the transport's auth layer.

### 3.7 Test the server with no LLM in the loop

Your tools are ordinary functions. Test them like it — at ordinary speed, for free, deterministically.

```python
# tests/test_tools.py
from server import list_orders, get_order_detail, issue_refund

def test_truncation_notice_appears(seeded_db):
    out = list_orders(start_date="2026-01-01", end_date="2026-03-01", limit=20)
    assert "orders matched" in out and "omitted" in out

def test_output_stays_token_cheap(seeded_db):
    out = list_orders(start_date="2026-01-01", end_date="2026-03-01", limit=100)
    assert len(out) / 4 < 2000            # ~4 chars/token: hard context budget

def test_bad_id_returns_instructive_text_not_exception(seeded_db):
    out = get_order_detail("12345")
    assert "ORD-" in out                  # tells the model the right format
    assert "list_orders" in out           # points at the recovery path

def test_refund_preview_does_not_charge(seeded_db, fake_payments):
    out = issue_refund("ORD-10432", 25.0, "damaged", confirm=False)
    assert "PREVIEW" in out and fake_payments.calls == []

def test_refund_is_idempotent(seeded_db, fake_payments):
    issue_refund("ORD-10432", 25.0, "damaged", confirm=True)
    second = issue_refund("ORD-10432", 25.0, "damaged", confirm=True)
    assert "already issued" in second and fake_payments.charge_count == 1
```

The token-budget assertion is the one people leave out and regret. It is the only test that catches "someone added three fields to the response and the server now eats the context window." Put it on every list-shaped tool.

## 4. Anti-patterns

- **Forty tools in one server.** The dominant cause of wrong-tool selection — every description competes with all the others. Above roughly 15-20 tools accuracy falls off a cliff. Consolidate by user intent, or split into focused servers the user enables separately.
- **One tool per REST endpoint.** Your API's shape is an artifact of your database. The model needs tools shaped like *questions users ask*. `summarize_revenue(period)` is a tool; `GET /orders?agg=sum` wrapped in Python is a leak.
- **`"""Gets orders."""`** Vague descriptions mean the model picks by name similarity — coin-flipping with extra steps.
- **No negative routing guidance.** If two tools could plausibly answer the same question, each must say when to use the other. Otherwise the model picks the expensive one.
- **Unbounded output.** `json.dumps(everything)` works on your 12-row dev database and evicts the conversation on the customer with 40,000 orders.
- **JSON when a table would do.** Repeating every key on every row is a ~40% token tax for zero benefit — the model reads tables fine.
- **Mutating without confirmation.** Anything that spends money, sends a message, or deletes a row needs a preview step and an idempotency key. Models retry. Plan for it.
- **Chatty tools.** If "how did we do last month?" takes six round-trips, that is 30+ seconds and six chances to derail. Add the tool that answers it in one call.
- **Raising exceptions the model can't act on.** A traceback is a dead end; instructive text is a recovery path.
- **Credentials as tool arguments.** Puts your API key in the context window, in the logs, and potentially on the user's screen.
- **Only testing through a chat client.** Slow, expensive, nondeterministic, and it tests the model, not your server. Unit-test the functions; use the client to test *descriptions*.

## 5. Usage

1. Paste this skill into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the system you're exposing **and the five questions users actually ask it**. The tool list derives from those questions, not from your endpoint list.
3. Ask for, in order: (a) the tool list with one-line purposes — challenge anything over ~10 tools, (b) full descriptions including negative routing guidance, (c) Pydantic-constrained signatures, (d) return shapes with explicit token budgets, (e) the implementation last.
4. For every tool ask: what does this return on the largest realistic input? Over ~2,000 tokens means it needs a limit and a truncation notice.
5. For every tool with a side effect, require the confirm flag and idempotency key before accepting the implementation.
6. Run section 4 as a checklist, then unit-test with no LLM in the loop.

The assistant should refuse to wrap an API endpoint-for-endpoint, and should push back on any tool whose output size is unbounded.

## 6. Example Output

Prompt given with this skill loaded: *"Expose our Postgres orders database to Claude so support can ask questions about customers."*

Expected shape of the answer — it should start by narrowing the surface:

> Not a `run_sql` tool. That's one tool that can do anything, which means the model writes a bad join and returns 200k tokens, and support staff get an arbitrary-SQL channel into production. Four read-only tools shaped like the questions support actually asks:

```python
from typing import Annotated
from mcp.server.fastmcp import FastMCP
from pydantic import Field

mcp = FastMCP("support-orders")

@mcp.tool()
def find_customer(query: Annotated[str, Field(description="Email, partial name, or id.")]) -> str:
    """Find a customer by email, name, or id. Start here — every other tool needs a customer_id.

    Returns up to 10 matches as a table. If you already have a customer_id, skip this
    and call customer_summary directly.
    """

@mcp.tool()
def customer_summary(customer_id: Annotated[str, Field(description="From find_customer.")]) -> str:
    """One-screen overview: lifetime spend, order count, last order date, open issues.

    Use this FIRST for any "tell me about this customer" question — it answers most of
    them in one call. Only call list_orders if you need individual order rows.
    """

@mcp.tool()
def list_orders(customer_id: str, limit: Annotated[int, Field(ge=1, le=50)] = 10) -> str:
    """List a customer's orders, newest first, as a compact table.

    For totals and lifetime value use customer_summary — do not list orders and add them
    up. Returns the newest `limit` orders and reports how many were omitted.
    """

@mcp.tool()
def order_detail(order_id: Annotated[str, Field(description="e.g. 'ORD-10432'.")]) -> str:
    """Line items, shipping status, and payment/refund history for one order.

    The only tool that returns line items. Max ~40 lines; long orders are truncated
    with a count of omitted items.
    """
```

```json
{
  "mcpServers": {
    "support-orders": {
      "command": "uv",
      "args": ["--directory", "/srv/support-orders", "run", "server.py"],
      "env": { "SHOP_DB_URL": "postgres://readonly@db.internal/shop" }
    }
  }
}
```

Note what the output does *not* contain: no `run_sql` escape hatch, no `get_customer_by_email` / `by_id` / `by_name` triplet (one `find_customer` covers all three), and no write tools at all — this server holds a read-only credential, so the worst a confused model can do is read a row it shouldn't have. `customer_summary` exists purely because "tell me about this customer" is the question support asks forty times a day, and answering it in one call instead of six is the entire point of designing tools around intents rather than tables. Every description names the tool the model should use *instead*, which is what stops it walking the whole order list to compute a sum.
