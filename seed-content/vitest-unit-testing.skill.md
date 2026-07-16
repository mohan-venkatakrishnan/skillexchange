---
title: Fast Unit Tests with Vitest Skill
category: Testing
description: Build a unit suite that runs in seconds and still catches real bugs — correct environment choice, mock hoisting that doesn't bite, fake timers that don't deadlock, and coverage numbers you can act on. Prevents the two classic outcomes: a suite so slow nobody runs it pre-push, and a suite so mock-saturated it stays green while production burns.
usage: Load this skill before asking your AI assistant to write, port, or speed up Vitest tests. Give it the module and the behavior you want pinned ("test the retry backoff in fetchWithRetry, including the timer path") and it will produce tests against the real module boundary, with `vi.mock` placed correctly and async-aware timer advancement instead of sleeps.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 0
timeSavedHours: 10
pocUrl: https://github.com/vitest-dev/vitest
---

# Fast Unit Tests with Vitest Skill

## 1. Philosophy

A unit suite has one job: tell you in under ten seconds whether you broke something. Every rule below defends either the speed or the honesty of that signal — a slow suite gets skipped, a lying suite gets deleted.

1. **The test knows the contract, not the internals.** Assert what the function returns and what it does at its boundary. The moment a test asserts a private helper was called three times, you've welded the test to the implementation and every refactor costs two hours of test surgery.
2. **Mock at the edge of your process, never inside it.** Network, clock, filesystem, `crypto.randomUUID` — mock those. Your own `./lib/pricing` — do not. A mock of your own module is a copy of its behavior that starts drifting the day it's written and never announces the divergence.
3. **Speed is a feature you have to defend.** A suite drifts to 90 seconds one careless `beforeEach` at a time. Anything over 50ms in a unit test is doing I/O, spinning a real timer, or booting a framework it doesn't need.
4. **Isolation is the whole premise.** A test that passes alone and fails in the suite has already found a bug — usually module-level mutable state — and the fix is the production code, not `--no-isolate`.
5. **Coverage is a map of the untested, not a score.** 85% means nothing. The uncovered `catch` in your payment handler means everything. Read the report, don't chase the number.

## 2. Tech Stack

- **Vitest** — https://github.com/vitest-dev/vitest — licensed **MIT**. Vite-native runner with an expect-compatible API, native ESM/TypeScript handling, and watch mode driven by Vite's module graph.
- **happy-dom** — https://github.com/capricorn86/happy-dom — **MIT**. Lightweight DOM; the default for component-adjacent tests.
- **jsdom** — https://github.com/jsdom/jsdom — **MIT**. Heavier, more spec-complete; the fallback when happy-dom's gaps show.
- **@vitest/coverage-v8** — ships in the Vitest repo, **MIT**. V8-native coverage provider.
- TypeScript for all examples; plain JavaScript behaves identically.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Vitest maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Pick the environment per file, not globally

A global `environment: 'happy-dom'` makes every pure-logic test pay DOM setup. Default to `node` and opt in.

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'node',          // fast default; most of your code has no DOM
    environmentMatchGlobs: [
      ['src/components/**', 'happy-dom'],
      ['src/legacy-widgets/**', 'jsdom'],   // needs real Range/selection APIs
    ],
    restoreMocks: true,
    clearMocks: true,
  },
})
```

happy-dom vs jsdom, honestly: happy-dom constructs roughly 2-4x faster and covers everything a typical React test touches — queries, events, `classList`, observer shims. jsdom is slower but more complete around `Range`, selection, and older SVG surfaces. Start on happy-dom; move a *single directory* to jsdom the day you hit a real gap. Never migrate the whole suite because one legacy widget needed it.

Neither is a browser. Neither runs layout — `getBoundingClientRect()` returns zeros in both. A test asserting an element is "below the fold" belongs in a real browser (see the Playwright E2E skill for that layer).

### 3.2 `vi.mock` hoisting — the gotcha that costs everyone an afternoon

`vi.mock` calls hoist above your imports, so the factory runs before any `const` in the module body exists. This fails, always:

```ts
// BROKEN — ReferenceError: Cannot access 'fakeUser' before initialization
import { getUser } from './api'
const fakeUser = { id: 'u1' }
vi.mock('./api', () => ({ getUser: () => fakeUser }))   // hoisted above `fakeUser`
```

Use `vi.hoisted` when you need a handle on the mock:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { chargeCard } from './billing'

const { postChargeMock } = vi.hoisted(() => ({ postChargeMock: vi.fn() }))
vi.mock('./gateway', () => ({ postCharge: postChargeMock }))   // gateway is the process edge

describe('chargeCard', () => {
  beforeEach(() => postChargeMock.mockReset())

  it('sends the amount in minor units', async () => {
    postChargeMock.mockResolvedValue({ id: 'ch_1', status: 'succeeded' })
    await chargeCard({ amountUsd: 12.5, token: 'tok_x' })
    expect(postChargeMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1250, currency: 'usd' })
    )
  })
})
```

`vi.mock` replaces the *whole* module; every export you forget becomes `undefined`, and the failure points at a line 40 files away. Spread the real module and override exactly one thing: `vi.mock('./gateway', async (importOriginal) => ({ ...(await importOriginal<typeof import('./gateway')>()), postCharge: postChargeMock }))`. Better still, for the 80% case, skip `vi.mock` and spy — `vi.spyOn(gateway, 'postCharge').mockResolvedValue(...)` keeps the real module and reverts under `restoreMocks`.

Path matching is literal. `vi.mock('./gateway')` does not intercept `../billing/gateway.js` imported elsewhere. When a mock "doesn't work," check the specifier before anything else.

### 3.3 Fake timers, and the deadlock everyone hits once

Fake the timers, call code that awaits a `setTimeout`-backed sleep, advance synchronously — the promise never gets a microtask turn, the test hangs, and you spend an hour blaming Vitest.

```ts
// DEADLOCK: advanceTimersByTime is sync; the pending promise never settles
vi.useFakeTimers()
const p = fetchWithRetry('/api/x')
vi.advanceTimersByTime(5000)
await p                          // hangs until the test timeout
```

The async variant flushes microtasks between firings. Use it for anything with `await` in the path:

```ts
describe('fetchWithRetry', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())    // leaking fake timers poisons every later file

  it('backs off exponentially and succeeds on the third attempt', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ ok: true })

    const promise = fetchWithRetry(attempt, { retries: 3, baseMs: 100 })
    await vi.advanceTimersByTimeAsync(100)   // first backoff
    await vi.advanceTimersByTimeAsync(200)   // second, doubled

    await expect(promise).resolves.toEqual({ ok: true })
    expect(attempt).toHaveBeenCalledTimes(3)
  })
})
```

Attach any `rejects` assertion *before* advancing the clock — `const a = expect(p).rejects.toThrow(); await vi.advanceTimersByTimeAsync(1000); await a` — or you get an unhandled rejection and a flaky pass. And pin the wall clock whenever a test touches `Date` via `vi.setSystemTime(new Date('2026-03-01T12:00:00Z'))`, or the test that formats "3 days ago" fails the week someone runs it near a DST boundary.

### 3.4 Pools: threads, forks, and when it matters

- **threads** (default) — `worker_threads`. Roughly 20-40ms per-file startup vs 80-150ms for a fork. Correct default.
- **forks** — child processes. The only safe option when your code touches native modules (`better-sqlite3`, `sharp`, `canvas`), calls `process.chdir`, or crashes the worker. Symptoms that tell you to switch: segfaults, `undefined` inside a native binding, a worker that dies with no stack.

Set it per project — `test: { pool: 'threads', poolOptions: { threads: { useAtomics: true } } }` — and switch the whole suite, not one file, since the pool is process-wide.

`isolate: false` is a real 30-50% win on a large suite and a real footgun: module state now persists across files in the same worker. It is safe only for a suite with zero module-level mutable state — which yours does not have, until proven. Turn it on last; turn it off the first time a test only fails in CI.

### 3.5 In-source tests, and coverage that means something

For leaf helpers, an `if (import.meta.vitest) { const { it, expect } = import.meta.vitest; ... }` block at the bottom of the source file removes the import ceremony and makes deletion atomic. It requires `includeSource: ['src/**/*.ts']` and, non-negotiably, `define: { 'import.meta.vitest': 'undefined' }` in your build config so the block is dead-code-eliminated from the production bundle — omit that and you ship your tests to users. Leaf utilities only: once a file needs mocks or fixtures, the in-source block has outgrown its welcome.

Coverage, decided: **v8** collects from the engine at near-zero cost — right for every push. **istanbul** instruments the source, runs ~2-3x slower, and accounts branches more faithfully; v8 has historically been generous about ternaries and default parameters, so its branch number reads a few points above the truth. Run v8 by default, istanbul in the one nightly job where you actually study the report.

Configure it as `coverage: { provider: 'v8', reporter: ['text', 'html', 'lcov'], exclude: ['**/*.config.*', '**/mocks/**', '**/*.d.ts'], thresholds: { lines: 70, autoUpdate: true } }` — `autoUpdate` ratchets the floor up as you improve and never lets it regress. Do not set a 90% gate on a codebase at 62%. You will get 28 points of `expect(true).toBe(true)`.

## 4. Anti-patterns

- **Mocking your own module boundary.** `vi.mock('./pricing')` freezes what pricing did the day you wrote it. Six months on the real module rounds differently, every caller's test is green, and the invoice is off by a cent per line. A module that's hard to use for real is a design signal, not a mocking opportunity.
- **`vi.advanceTimersByTime` on an async path.** Sync advancement never yields to the microtask queue, so the awaited promise can't settle. `await vi.advanceTimersByTimeAsync(ms)`.
- **Forgetting `vi.useRealTimers()` in `afterEach`.** Fake timers leak to the rest of the file and, with `isolate: false`, the rest of the worker. The symptom is an unrelated test hanging — the worst possible clue.
- **`environment: 'jsdom'` set globally.** Every pure-function file boots a DOM. On 400 files that's 20-30 wasted seconds per run, forever.
- **Asserting call counts of internal helpers.** `expect(formatRow).toHaveBeenCalledTimes(3)` tests your loop, not your output.
- **Giant `toMatchSnapshot()` on markup.** Nobody reviews a 300-line diff; they run `-u` and move on. Snapshot narrow semantic values where the diff is legible.
- **`test.concurrent` on tests touching fake timers, `setSystemTime`, or a shared spy.** Concurrent siblings share module state and the global `expect`, so a failed assertion gets attributed to the wrong test. Passes eight times, fails the ninth, in CI, on someone else's PR — and it buys little on a suite that already parallelizes per file. When you do use it, take `expect` from the test's own argument, never the import.
- **Chasing a coverage percentage.** A team told to hit 90% hits it by testing getters. Coverage says where you haven't looked; never that the looking was good.
- **`isolate: false` as a first optimization.** You traded a correctness guarantee for 30% of a number you should have fixed by deleting the DOM from 300 files.
- **A `beforeEach` that builds the world.** Forty objects constructed for the two tests needing three is why the suite takes 40 seconds. Factory functions, called where needed.

## 5. Usage

1. Load this skill into your assistant's context in a repo with `vitest` installed. Confirm `vitest.config.ts` defaults to `environment: 'node'` before asking for anything else.
2. Name the module and the behavior, not the shape of the test: "Pin the retry budget and backoff schedule in `fetchWithRetry`, including when every attempt fails." Say which collaborators are real and which sit at the process edge.
3. Expect output in this order: fixture/factory helpers, the `vi.hoisted` + `vi.mock` block (edge modules only), then the tests — happy path, one boundary, one failure.
4. Reject output that mocks a first-party module unasked, uses sync `advanceTimersByTime` on an awaited path, or omits `afterEach(() => vi.useRealTimers())`. Ask it to re-derive against the real module.
5. For a test that passes alone and fails in the suite, paste the test and the module's top-level code. Ask for a diagnosis against section 4 — it's leaked module state or a leaked fake timer nine times in ten — before accepting a code change.

## 6. Example Output

Prompt with this skill loaded: *"Test the token bucket rate limiter in `src/lib/rate-limit.ts`. It should allow a burst up to capacity, refill over time, and never go negative under concurrent takes."*

```ts
// src/lib/rate-limit.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTokenBucket } from './rate-limit'

describe('createTokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'))  // refill is time-derived; pin the clock
  })
  afterEach(() => vi.useRealTimers())

  it('allows a burst up to capacity, then refuses', () => {
    const bucket = createTokenBucket({ capacity: 5, refillPerSec: 1 })
    expect(Array.from({ length: 6 }, () => bucket.tryTake()))
      .toEqual([true, true, true, true, true, false])
    expect(bucket.available()).toBe(0)
  })

  it('refills at the configured rate and clamps at capacity', async () => {
    const bucket = createTokenBucket({ capacity: 5, refillPerSec: 2 })
    for (let i = 0; i < 5; i++) bucket.tryTake()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(bucket.available()).toBe(2)

    await vi.advanceTimersByTimeAsync(60_000)   // far past full
    expect(bucket.available()).toBe(5)          // clamped, not 122
  })

  it('never reports a negative balance when takes race the refill', async () => {
    const bucket = createTokenBucket({ capacity: 3, refillPerSec: 1 })
    const takes = Promise.all(
      Array.from({ length: 10 }, () => bucket.take({ timeoutMs: 5_000 }))
    )
    await vi.advanceTimersByTimeAsync(10_000)

    expect((await takes).filter(Boolean)).toHaveLength(10)
    expect(bucket.available()).toBeGreaterThanOrEqual(0)
  })

  it('rejects a waiter that outlives its timeout', async () => {
    const bucket = createTokenBucket({ capacity: 1, refillPerSec: 0.1 })
    bucket.tryTake()
    const assertion = expect(bucket.take({ timeoutMs: 1_000 }))
      .rejects.toThrow(/rate limit timeout/i)   // handler attached before the clock moves
    await vi.advanceTimersByTimeAsync(1_001)
    await assertion
  })
})
```

Markers of skill-compliant output: the system clock is pinned because refill is time-derived; every advancement is `await vi.advanceTimersByTimeAsync` rather than the synchronous form; `afterEach` restores real timers so nothing leaks into the next file; the `rejects` assertion exists before the clock moves; the real `createTokenBucket` is exercised with zero first-party mocks; and each test pins exactly one contract — burst, refill-and-clamp, no-negative-under-race, timeout — instead of one test walking the whole lifecycle.
