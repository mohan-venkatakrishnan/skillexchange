---
title: Property-Based Testing with fast-check Skill
category: Testing
description: Stop hand-picking the three inputs you already thought of and let the runner hunt for the one you didn't — round-trip properties, invariants, model-based state machines, and shrinking that hands you a two-character counterexample instead of a 400-element blob. Prevents the whole class of bug that lives in the gaps between your example tests: the empty string, the lone surrogate, the negative zero, the reordering that only breaks on the fourth operation.
usage: Load this skill before asking your AI assistant to write fast-check properties for a parser, serializer, reducer, or any pure transform. Give it the invariant in plain English ("parse(format(x)) always equals x") and it will produce tight arbitraries, an `fc.assert(fc.property(...))` harness, and a committed regression test for any counterexample it finds.
platforms: [Claude, Cursor]
priceUsd: 7
timeSavedHours: 12
pocUrl: https://github.com/dubzzz/fast-check
---

# Property-Based Testing with fast-check Skill

## 1. Philosophy

Example tests encode what you already believed. Property tests attack it. The value isn't "more inputs" — it's that the machine has no intuition to blind it, so it tries `''`, `-0`, `"\uD800"`, and the 4,097-character string, and one of those is your bug.

1. **State the law, not the example.** `expect(add(2, 3)).toBe(5)` records one data point; `add(a, b) === add(b, a)` records the rule. Writing that sentence down is most of the work — you usually discover mid-sentence that it isn't actually true, and that discovery *is* the bug.
2. **Shrinking is the product.** Any fuzzer finds a failure with 300 elements of garbage. fast-check walks it back to the minimal input that still fails — `['', 'a']`, obvious cause. Without shrinking you get noise; with it you get a diagnosis. This is why you build arbitraries with `map` rather than generate-and-validate: hand-rolled generation destroys shrinkability.
3. **A failing property is a permanent test.** The counterexample is a bug you had, so it's a bug you can have again. Hard-code the shrunk input as a plain example test beside the property. The property guards the future; the example guards the regression.
4. **Properties supplement examples, they don't replace them.** You still want `expect(formatMoney(1999)).toBe('$19.99')` because it pins the *intent*, readably, for a human. The property proves the transform is total and reversible. Ship both.
5. **If you can't state the law without restating the implementation, don't write the property.** The failure mode is a test that reimplements the function and compares — that tests your ability to write it twice. Find a different angle on the same truth: a round trip, an invariant, an oracle, a metamorphic relation.

## 2. Tech Stack

- **fast-check** — https://github.com/dubzzz/fast-check — licensed **MIT**. Property-based testing for JS/TS: built-in arbitraries, automatic shrinking, seeded reproducible runs, model-based/stateful commands.
- **@fast-check/vitest** — https://github.com/dubzzz/fast-check (same monorepo) — **MIT**. Runner integration exposing `test.prop`; a convenience, not a requirement.
- Vitest as the runner in examples; the `fc.assert` form works identically under Jest, Mocha, or node:test.
- TypeScript throughout — arbitraries are generic, and the inferred tuple types are half the ergonomics.

This skill is an independent, original guide; it is not affiliated with or endorsed by the fast-check maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 The harness, and what every knob is for

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { normalizeTag } from './tags'

describe('normalizeTag', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const once = normalizeTag(raw)
        expect(normalizeTag(once)).toBe(once)
      }),
      {
        numRuns: 200,            // see 3.5
        seed: 1740825600000,     // pin in CI; omit locally to keep hunting
        verbose: 2,              // print the full shrink path on failure
        endOnFailure: true,      // stop at the first counterexample
      }
    )
  })
})
```

Two ways to fail: return `false`, or throw. Prefer throwing via `expect` — you get the diff for free. Returning `undefined` counts as a pass, so a property returning `a === b` on one branch and nothing on another silently passes half the time. Pick one style per file.

The `@fast-check/vitest` shorthand for the common case:

```ts
import { test, fc } from '@fast-check/vitest'

test.prop([fc.string(), fc.string()])('concat length is additive', (a, b) => {
  expect((a + b).length).toBe(a.length + b.length)
})
```

### 3.2 Arbitraries: build them so they shrink

`fc.string()` already generates what breaks you: `''`, `' '`, astral characters, lone surrogates. That's the point — don't reach for an ASCII-only unit to make a failure go away. If your function breaks on `'😀'`, your function is broken and your users have emoji in their display names.

Compose domain arbitraries from primitives, and transform with `map` rather than generate-and-fix:

```ts
const cents = fc.integer({ min: 0, max: 10_000_000 })
const currency = fc.constantFrom('USD', 'EUR', 'INR', 'JPY')   // JPY: zero decimals, the edge case

// map preserves shrinkability — fast-check shrinks the source integers and re-maps.
const money = fc.record({ amountCents: cents, currency })

const invoice = fc.record({
  id: fc.uuid(),
  issuedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }),
  items: fc.array(
    fc.record({ sku: fc.stringMatching(/^[A-Z]{3}-\d{4}$/), qty: fc.integer({ min: 1, max: 99 }), unit: money }),
    { minLength: 1, maxLength: 20 }
  ),
})
```

`filter` is a hazard. `fc.integer().filter((n) => n % 7 === 3)` throws away 6 of 7 candidates *and* throws away shrink candidates — the shrinker proposes 4, the filter kills it, shrinking stalls at an ugly value. Rewrite as `fc.integer({ min: 0, max: 1000 }).map((n) => n * 7 + 3)`. Reserve `filter` for cheap predicates rejecting under ~10% of draws. When the constraint is structural, `fc.pre(cond)` inside the property is the escape hatch — but if it rejects most runs, fast-check will report it couldn't find enough valid cases, and that means "your arbitrary is wrong," not "raise numRuns."

Bound recursive shapes or you'll generate a tree that takes 90 seconds to shrink:

```ts
const json: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  node: fc.oneof(
    { maxDepth: 4, withCrossShrink: true },        // unbounded here = an occasional 10k-node tree
    fc.constant(null), fc.boolean(), fc.double({ noNaN: true }), fc.string(),
    fc.array(tie('node'), { maxLength: 5 }),
    fc.dictionary(fc.string(), tie('node'), { maxKeys: 5 }),
  ),
})).node
```

### 3.3 The three properties that pay for themselves

**Round trip** — the highest-yield property in existence. Anything with an encode/decode pair:

```ts
it('parse ∘ serialize is the identity on query strings', () => {
  const queryParams = fc.dictionary(
    fc.string({ minLength: 1 }),
    fc.oneof(fc.string(), fc.array(fc.string(), { maxLength: 3 })),
    { maxKeys: 8 }
  )
  fc.assert(fc.property(queryParams, (params) => {
    expect(parseQuery(serializeQuery(params))).toEqual(params)
  }))
})
```

This is where real bugs come from. That one found: keys containing `=` serialized unescaped and parsed back split at the wrong place. Shrunk counterexample: `{ '=': '' }`. Nobody writes that example test by hand.

**Invariant** — a truth that survives every operation:

```ts
it('applying any discounts never yields a negative or over-100% total', () => {
  fc.assert(fc.property(invoice, fc.array(discountRule, { maxLength: 5 }), (inv, rules) => {
    const total = applyDiscounts(inv, rules)
    expect(total.amountCents).toBeGreaterThanOrEqual(0)
    expect(total.amountCents).toBeLessThanOrEqual(subtotal(inv))
    expect(Number.isInteger(total.amountCents)).toBe(true)   // no float cents, ever
  }))
})
```

**Oracle / metamorphic** — compare against a slow-but-obviously-correct reference, or a relation that must hold:

```ts
it('the indexed search returns exactly what a linear scan would', () => {
  fc.assert(fc.property(fc.array(docArb, { maxLength: 50 }), fc.string(), (docs, q) => {
    const fast = search(buildIndex(docs), q).map((d) => d.id).sort()
    const slow = docs.filter((d) => d.body.includes(q)).map((d) => d.id).sort()
    expect(fast).toEqual(slow)     // the naive version is the spec
  }))
})
```

Metamorphic when no oracle exists: you may not know what `rank(docs, q)` should return, but you know appending an irrelevant document must not reorder the existing results.

### 3.4 Replaying a counterexample — the workflow

A failure prints the seed, the path, and the shrunk input:

```
Property failed after 43 tests
{ seed: -1063857102, path: "42:2:1:0", endOnFailure: true }
Counterexample: [{"amountCents":1,"currency":"JPY"}]
Shrunk 6 time(s)
Got error: expected '¥0' to be '¥1'
```

Reproduce exactly — `path` jumps straight to the shrunk case, no re-hunting:

```ts
fc.assert(fc.property(money, checkFormat), { seed: -1063857102, path: '42:2:1:0' })
```

Then do the thing most people skip. The seed reproduces the bug *for this version of the arbitrary*; change `money` next month and it replays something else entirely, silently. The seed is a debugging tool, not a regression test. Promote the counterexample:

```ts
// Regression: JPY has zero decimal places; the formatter divided by 100 unconditionally.
// Found by property test, seed -1063857102.
it('formats zero-decimal currencies without dividing', () => {
  expect(formatMoney({ amountCents: 1, currency: 'JPY' })).toBe('¥1')
})
```

Committing an example the property already covers looks redundant. It isn't: the example survives arbitrary refactors, runs in 0.1ms, and names the bug in English for whoever reads it in 2028.

`fc.configureGlobal({ seed: Number(process.env.FC_SEED ?? Date.now()) })` in a setup file, with the seed logged, gives you both: CI hunts new ground nightly, and any failure is one env var from reproducing.

### 3.5 numRuns, and the honest cost model

The default is 100 — a starting point, not a recommendation.

- **Fast pure function (<1ms/run):** 500-1000. Under a second, meaningfully wider search.
- **Anything touching I/O or a DOM (>10ms/run):** 20-50, and question whether this should be a property test at all.
- **Nightly CI:** 10,000 with a rotating seed. This is where property tests earn their keep — the deep search runs while you sleep and the failure lands with a seed attached.
- **Per-commit CI:** whatever fits the budget, with a *pinned* seed. A random seed per commit produces failures unrelated to the diff, and within a month the team re-runs CI reflexively instead of reading it.

Raising `numRuns` has sharply diminishing returns against a bad arbitrary. If your bug needs two fields to collide and each is drawn from 10,000 values, no run count saves you — narrow the range until collisions happen. Check what you're actually generating before tuning anything:

```ts
fc.statistics(invoice, (inv) => `items:${inv.items.length === 1 ? '1' : '2+'}`, { numRuns: 1000 })
// items:2+  ..  87.30%
// items:1   ..  12.70%   ← the single-item path is under-explored; weight it up
```

### 3.6 Model-based testing: properties for stateful things

The technique that finds bugs nobody finds by hand. Describe operations as commands, keep a trivially-correct model beside the real system, let fast-check generate the sequences.

```ts
type Model = { keys: string[]; capacity: number }   // insertion order, oldest first

class SetCmd implements fc.Command<Model, LruCache<string, number>> {
  constructor(readonly k: string, readonly v: number) {}
  check = () => true
  run(m: Model, r: LruCache<string, number>) {
    r.set(this.k, this.v)
    m.keys = m.keys.filter((x) => x !== this.k)
    m.keys.push(this.k)
    if (m.keys.length > m.capacity) m.keys.shift()      // evict oldest
    expect(r.size).toBe(m.keys.length)
  }
  toString = () => `set(${this.k}, ${this.v})`          // shrunk output must be readable
}

class GetCmd implements fc.Command<Model, LruCache<string, number>> {
  constructor(readonly k: string) {}
  check = () => true
  run(m: Model, r: LruCache<string, number>) {
    const hit = r.get(this.k)
    expect(hit !== undefined).toBe(m.keys.includes(this.k))
    if (hit !== undefined) {                            // a get is a use: refresh recency
      m.keys = m.keys.filter((x) => x !== this.k)
      m.keys.push(this.k)
    }
  }
  toString = () => `get(${this.k})`   // without this the shrunk repro prints [object Object]
}

it('the LRU cache matches its model under any command sequence', () => {
  const keys = fc.constantFrom('a', 'b', 'c', 'd')      // tiny alphabet → collisions actually happen
  const commands = fc.commands([
    fc.tuple(keys, fc.integer()).map(([k, v]) => new SetCmd(k, v)),
    keys.map((k) => new GetCmd(k)),
  ], { maxCommands: 40 })

  fc.assert(
    fc.property(commands, (cmds) =>
      fc.modelRun(() => ({ model: { keys: [], capacity: 3 }, real: new LruCache(3) }), cmds)),
    { numRuns: 500 }
  )
})
```

Note the four-key alphabet. With `fc.string()` as keys you'd generate 40 distinct keys, never evict, never re-hit, and prove nothing. Constraining the domain until operations *interfere* is the whole art of stateful property testing. This exact shape catches "a `get` on the oldest key doesn't refresh it, so the next `set` evicts it" — a four-command sequence you'd never hand-write.

## 4. Anti-patterns

- **Reimplementing the function inside the property.** `expect(slugify(s)).toBe(s.toLowerCase().replace(/\W+/g, '-'))` is your implementation, pasted. It passes forever, including when both copies are wrong the same way.
- **`filter` where `map` would do.** Rejecting most draws stalls the shrinker — it proposes a simpler value, the filter kills it, and your "minimal" counterexample is still 200 characters.
- **Constraining the arbitrary until the test passes.** The bug was `''` and you wrote `minLength: 1`. You fixed the test's ability to see it, nothing else. If empty input is genuinely invalid, the property is that it throws a typed error — assert *that*.
- **A random seed in per-commit CI.** Fails on a diff that didn't cause it, three people investigate, the fourth learns to hit re-run. Deterministic per commit; random in the nightly deep run.
- **Treating the seed as the regression test.** Seeds couple to the arbitrary's exact structure. Touch the generator and the seed replays a different input, silently. Hard-code the shrunk counterexample.
- **`numRuns: 10000` on a 30ms property.** Five minutes for one test, and it becomes the reason someone deletes property testing from the repo. Budget by per-run cost.
- **Property tests over I/O, DB writes, or a real DOM.** 100 runs of a 200ms operation is 20 seconds for one assertion, and the shrinker replays each candidate — so a failure costs minutes. Property-test the pure core; integration-test the edges (Testcontainers) and the flows (Playwright).
- **Unbounded recursive arbitraries.** No `maxDepth` means an occasional 10,000-node tree, an occasional 90-second run, and a shrink path nobody waits for. Bound at 3-5.
- **A property with no `expect` and an implicit return.** `fc.property(fc.nat(), (n) => { doThing(n) })` returns `undefined` — a pass. It asserts nothing and stays green for years.
- **Model-based tests with a huge key space.** Forty unique keys against a capacity-3 cache means no evictions, no collisions, no bugs found.
- **`toString` omitted from a `Command`.** The shrunk sequence prints as `[object Object]` and the one artifact you came for — a readable four-step repro — is gone.

## 5. Usage

1. Load this skill in a repo with `fast-check` installed. Point it at a *pure* module — parser, formatter, reducer, sorter. If the target does I/O, say so and expect pushback.
2. State the law in English before any code: "`parseQuery(serializeQuery(p))` deep-equals `p` for every params object." If you can't finish the sentence, you've found the real problem — the function has no stateable contract yet.
3. Expect output in this order: domain arbitraries (built with `map`, not `filter`), the `fc.assert(fc.property(...))` block with a justified `numRuns`, and any `fc.statistics` call needed to prove the generator reaches the interesting branch.
4. Reject output that reimplements the function under test, uses `filter` to reject more than ~10% of draws, tightens bounds to dodge a failure, or omits `toString` from a `Command`. Ask it to restate the property from a different angle.
5. When it reports a counterexample, ask for two artifacts: the `{ seed, path }` replay line for debugging now, and a hard-coded example test carrying the shrunk input plus a one-line comment naming the bug — that's the one you commit.

## 6. Example Output

Prompt with this skill loaded: *"Property-test our CSV round trip. `toCsv(rows)` then `fromCsv(text)` should give back the same rows, including quotes, commas, newlines, and unicode in the cell values."*

```ts
// src/lib/csv.property.test.ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { toCsv, fromCsv } from './csv'

// Cells are deliberately hostile: the delimiter, the quote char, CR, LF, CRLF,
// padding, and astral text are all *legal* cell contents.
const cell = fc.oneof(
  { weight: 6 }, fc.string(),
  { weight: 3 }, fc.constantFrom('', ' ', ',', '"', '""', 'a,b', '"q"', 'x\ny', 'x\r\ny', '\r', '  pad  '),
  { weight: 1 }, fc.string({ unit: 'binary' }),
)

const header = fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 6 })

// Rows are generated *from* the header so every row has matching arity — a rectangular
// table is a precondition of the format, not something to discover via fc.pre.
const table = header.chain((cols) =>
  fc.record({
    cols: fc.constant(cols),
    rows: fc.array(fc.array(cell, { minLength: cols.length, maxLength: cols.length }), { maxLength: 20 }),
  })
)

describe('csv round trip', () => {
  it('fromCsv ∘ toCsv is the identity for any rectangular table', () => {
    fc.assert(
      fc.property(table, ({ cols, rows }) => {
        const parsed = fromCsv(toCsv(cols, rows))
        expect(parsed.cols).toEqual(cols)
        expect(parsed.rows).toEqual(rows)   // exact: no trimming, no coercion, no lost '\r'
      }),
      { numRuns: 1000 }   // pure string work, ~0.3ms/run → under a second
    )
  })

  it('generates the interesting shapes it claims to', () => {
    fc.statistics(table, ({ rows }) => {
      const flat = rows.flat()
      if (flat.some((c) => c.includes('\n') || c.includes('\r'))) return 'has-newline-cell'
      if (flat.some((c) => c.includes('"'))) return 'has-quote-cell'
      if (flat.some((c) => c.includes(','))) return 'has-comma-cell'
      return 'plain'
    }, { numRuns: 1000 })
    // has-quote-cell    .. 41.2%
    // has-newline-cell  .. 33.8%   ← the branch that actually breaks parsers
    // has-comma-cell    .. 18.1%
    // plain             ..  6.9%
  })
})

// --- Regressions found by the property above. These are the tests that stay. ---

// seed 884213107, path "17:3:0" — shrunk to a single cell.
// toCsv escaped the embedded quote but did not wrap the field, so fromCsv saw two columns.
it('quotes a field that contains a quote character', () => {
  expect(toCsv(['a'], [['"']])).toBe('a\r\n""""\r\n')
  expect(fromCsv(toCsv(['a'], [['"']])).rows).toEqual([['"']])
})

// seed -299174430, path "8:1:1" — a lone '\r' inside a cell.
// The line splitter treated bare CR as a terminator; one row silently became two.
it('preserves a bare carriage return inside a quoted cell', () => {
  expect(fromCsv(toCsv(['a', 'b'], [['x\r', 'y']])).rows).toEqual([['x\r', 'y']])
})
```

Markers of skill-compliant output: the `cell` arbitrary is weighted *toward* hostile inputs rather than sanitized away from them; `table` uses `chain` so rows are generated at the header's arity instead of `fc.pre`-rejecting most draws; `numRuns` is justified out loud against a measured per-run cost; an `fc.statistics` block proves the newline branch is reached 33% of the time instead of asserting it on faith; the round-trip property compares against a real inverse rather than a reimplemented parser; and each counterexample the run found is committed as a named example test carrying its seed in a comment — the seed for debugging, the hard-coded input for the regression.
