---
title: Load Testing with k6 Skill
category: Testing
description: Write load tests that measure your server instead of your laptop, with arrival-rate executors, per-endpoint thresholds, and CI gates that actually fail the build. Prevents the classic disasters: a "passing" test that saturated the load generator, a p95 hiding a bimodal distribution, and a suite that reports averages nobody can act on.
usage: Load this skill before asking your AI assistant to write or review a k6 script. Describe the endpoint, the expected traffic shape ("300 checkouts/min, spiking to 900 at 9am"), and your SLO, and it will produce an arrival-rate scenario with tagged, per-endpoint thresholds rather than a VU loop with a sleep in it.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 8
timeSavedHours: 14
pocUrl: https://github.com/grafana/k6
---

# Load Testing with k6 Skill

## 1. Philosophy

Most load tests answer a question nobody asked. "Can it do 500 VUs?" is not a question — users don't arrive as VUs, they arrive as a rate. Every pattern here exists to make the test model reality and produce a number you can gate on.

1. **Measure the server, not the generator.** The most common failed load test measures the laptop it ran from. If your CPU is pinned, your "latency" is queueing inside k6. Always watch generator CPU and `iteration_duration` drift alongside your results; if they climb together while server metrics stay flat, throw the run away.
2. **Open models beat closed models.** VUs are a closed loop: each VU waits for a response before sending again, so when your server slows down, your load *drops*. Real users don't do you that favor. Arrival-rate executors keep sending at the configured rate regardless of how badly you're suffering — which is exactly what a real traffic spike does.
3. **Averages lie; percentiles are the contract.** An average blends the fast path and the fire. p95/p99 are what your users feel and what your SLO is written in. Nobody has ever been paged for a mean.
4. **A test without thresholds is a science experiment.** Thresholds turn a report into a gate. If a regression can't fail the build, it will ship.
5. **A percentile is a summary, and summaries hide shape.** p95 = 400ms can mean "everything is 400ms" or "90% at 40ms, 10% at 3s." Those are different products. Check the distribution before you trust the number.

## 2. Tech Stack

- **k6** — https://github.com/grafana/k6 — the core binary is licensed **AGPL-3.0** (see `LICENSE.md` in the repo root). This matters for how you *embed* it, not how you use it: running k6 as a CLI tool to test your own service imposes nothing on your application's code. The copyleft attaches if you modify k6 itself or build it into a service you offer to others — that's the "Affero" clause. Your test scripts are your own work; using k6 to run them does not make your app AGPL. If you plan to wrap k6 into a hosted product, get that reviewed by someone whose job it is.
- **JavaScript (ES2015+)** for scripts. k6 runs them on its own Go-embedded runtime — not Node — so `fs`, `require`, and npm packages are not available at runtime. Bundle first if you need them.
- Built-in modules used here: `k6/http`, `k6/metrics`, `k6/execution`, and `k6/data` for `SharedArray`.

This skill is an independent, original guide; it is not affiliated with or endorsed by the k6 maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Arrival rate, not VUs

`ramping-arrival-rate` fixes the rate and lets k6 allocate VUs to sustain it. Model the traffic shape you actually expect:

```js
export const options = {
  scenarios: {
    checkout_peak: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1m',            // 50 iterations/minute
      preAllocatedVUs: 40,       // allocated up front; allocation is not free
      maxVUs: 400,               // ceiling — see the note below
      stages: [
        { target: 50,  duration: '2m' },  // warm-up: JIT, pools, caches
        { target: 300, duration: '5m' },  // expected peak
        { target: 900, duration: '3m' },  // spike
        { target: 300, duration: '5m' },  // recovery — does it come back?
      ],
    },
  },
};
```

If k6 hits `maxVUs`, it cannot sustain the rate and will warn about dropped iterations. That warning is a finding, not noise: it means your target rate × your response time exceeds the VUs available. Either your server is too slow (a real result) or you under-allocated (a broken test). Check `dropped_iterations` before interpreting anything else.

Keep `constant-vus` for one legitimate job: soak tests where you want steady background pressure for hours while hunting leaks.

### 3.2 Thresholds are the gate; checks are the diagnosis

They are not interchangeable, and this is the single most misunderstood thing in k6:

- **`check`** records a pass/fail rate. A failing check **does not fail the run**. It shows up in the summary and moves on.
- **`threshold`** is an assertion on a metric that sets a non-zero exit code — which is what your CI reads.

```js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  thresholds: {
    // The SLO, stated as code. abortOnFail stops burning money on a dead build.
    'http_req_duration{endpoint:checkout}': ['p(95)<800', 'p(99)<2000'],
    'http_req_duration{endpoint:catalog}':  ['p(95)<200'],
    'http_req_failed':                      [{ threshold: 'rate<0.01', abortOnFail: true }],
    'checks':                               ['rate>0.99'],
    'dropped_iterations':                   ['count<1'],
  },
};

export default function () {
  // Tag at the request level so per-endpoint thresholds have something to bind to.
  const res = http.get('https://api.example.com/catalog', {
    tags: { endpoint: 'catalog' },
  });
  check(res, {
    'status is 200':      (r) => r.status === 200,
    'body has products':  (r) => r.json('products.length') > 0,
  }, { endpoint: 'catalog' });
}
```

Promote checks to thresholds via `'checks{endpoint:checkout}': ['rate>0.99']` when a functional failure should break the build. Untagged URLs collapse into one `http_req_duration` where a fast health check drags your p95 down and hides a slow checkout. Tag everything, and use the URL grouping tag for parameterized paths so `/orders/1` and `/orders/2` don't create thousands of distinct metrics.

### 3.3 Parameterization with SharedArray

Every VU is a separate JS runtime with its own memory. Loading a 50MB CSV naively means 400 VUs × 50MB. `SharedArray` keeps one copy:

```js
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

// Runs once in the init context, memory shared across all VUs.
const users = new SharedArray('users', () => JSON.parse(open('./users.json')));

export default function () {
  // Deterministic assignment: each iteration gets a distinct user, no collisions.
  const user = users[exec.scenario.iterationInTest % users.length];
  // ...
}
```

Random selection re-uses the same user concurrently and you end up load testing your row locks. Use the iteration counter unless contention is the thing you're measuring.

### 3.4 Correlation: never replay a captured token

Hardcoding a session token from your browser produces a test that passes for an hour and then 401s forever. Extract dynamic values from responses:

```js
export function setup() {
  // Runs once. The return value is passed to every VU — keep it small.
  const res = http.post('https://api.example.com/auth', JSON.stringify({
    email: __ENV.LOAD_USER, password: __ENV.LOAD_PASS,
  }), { headers: { 'Content-Type': 'application/json' } });
  return { token: res.json('accessToken') };
}

export default function (data) {
  const params = {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { endpoint: 'checkout' },
  };
  const cart = http.post('https://api.example.com/carts', null, params);
  // Correlate: the next call must use the id this call just produced.
  const cartId = cart.json('id');
  http.post(`https://api.example.com/carts/${cartId}/checkout`, null, params);
}
```

### 3.5 Don't let the generator become the bottleneck

```js
export const options = {
  discardResponseBodies: true,   // stop allocating megabytes you never read
  noConnectionReuse: false,      // reuse keep-alive like a real client does
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// Need the body for one specific request? Opt back in per call.
const res = http.get(url, { responseType: 'text', tags: { endpoint: 'catalog' } });
```

`discardResponseBodies: true` is the highest-leverage line in most scripts — parsing JSON you never assert on is pure generator cost. Other rules: run the generator in the same region as the target unless you're explicitly measuring latency, sanity-check that a single machine can produce your target rate before blaming the server, and go distributed only when one box genuinely can't keep up.

### 3.6 Think time, and reading the summary

Real users pause. Back-to-back requests with no `sleep()` produce an unrealistic burst pattern that misrepresents connection reuse and cache behavior. With arrival-rate executors, sleep models the user's pause *within* a session — it does not control your rate, which is the point.

```js
import { sleep } from 'k6';
sleep(Math.random() * 3 + 2);   // 2-5s, jittered — never a fixed sleep(1)
```

Reading the summary, in order:
1. `dropped_iterations` — nonzero means the run didn't do what you asked. Stop here.
2. `http_req_failed` — errors first. Fast 500s make a beautiful p95.
3. `http_req_duration` p95/p99 vs `med` — a p99 10x the median is a bimodal distribution wearing a disguise.
4. `http_req_waiting` vs `http_req_connecting` — waiting is server think time; connecting spikes point at pool exhaustion or TLS churn, not application code.
5. `iterations` and `vus_max` — did k6 need every VU it had? Then it was probably starved.

## 4. Anti-patterns

- **Reporting the average response time.** It's the one number that describes no user. If a stakeholder asks for it, give them p95 and explain once.
- **Ramping VUs and calling it a spike test.** A closed model reduces its own load when the server slows — you've built a system that politely refuses to reproduce the outage. Use `ramping-arrival-rate`.
- **Ignoring `dropped_iterations`.** The single most-skipped line in the summary, and the one that invalidates the run.
- **Running load tests from a laptop over Wi-Fi.** You measured your router. Generator CPU above ~80% means every latency number is contaminated.
- **No warm-up stage.** First-run results include JIT compilation, cold connection pools, and empty caches. You've measured your deploy, not your steady state.
- **One untagged `http_req_duration` for the whole suite.** A 20ms `/health` and a 2s `/checkout` average into a lie. Tag per endpoint, threshold per endpoint.
- **Trusting checks to fail CI.** They don't. A run can be 100% 500s and exit 0 if you only wrote checks. Every check that matters needs a threshold behind it.
- **Hardcoded auth tokens.** Works today, 401s tomorrow, and the failure looks like a performance cliff. Correlate in `setup()`.
- **Random user selection from a fixture.** Concurrent VUs grab the same row and you benchmark database contention you invented.
- **Parsing every response body.** Without `discardResponseBodies`, a high-rate test spends its budget on JSON you never look at.
- **`sleep(1)` everywhere.** Fixed sleeps synchronize your VUs into a thundering herd on a one-second beat. Jitter it.
- **Load testing prod's staging clone at 1/10th the size** and extrapolating linearly. Nothing about saturation is linear; the interesting behavior is at the knee.

## 5. Usage

1. Load this skill into your assistant's context in a repo where you can run `k6 run script.js`.
2. State the traffic shape and the SLO, not a VU count: "Checkout takes 300 req/min steady, 900 at peak; SLO is p95 under 800ms with error rate under 1%."
3. The assistant should produce, in order: the `scenarios` block with an arrival-rate executor and a warm-up stage, the tagged `thresholds` map encoding your SLO, then the request code with `SharedArray` parameterization and `setup()` correlation.
4. Reject output that uses `ramping-vus` for spike testing, leaves requests untagged, writes checks with no matching thresholds, or omits `discardResponseBodies`. Ask it to re-derive the scenario from the arrival rate.
5. For an existing run, paste the summary output and ask for a diagnosis against section 3.6 — starting with `dropped_iterations` and generator saturation — before changing a single line of the script.

## 6. Example Output

Prompt with this skill loaded: *"We expect 400 orders/min at peak with a 2x Black Friday spike. SLO: p95 under 900ms, p99 under 2.5s, error rate under 0.5%. Write the test."*

```js
// tests/load/checkout.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend } from 'k6/metrics';
import exec from 'k6/execution';

const buyers = new SharedArray('buyers', () => JSON.parse(open('./buyers.json')));
const checkoutLatency = new Trend('checkout_e2e_duration', true);

export const options = {
  discardResponseBodies: true,
  scenarios: {
    black_friday: {
      executor: 'ramping-arrival-rate',
      startRate: 60, timeUnit: '1m',
      preAllocatedVUs: 50, maxVUs: 600,
      stages: [
        { target: 60,  duration: '3m' },   // warm-up — excluded from judgement
        { target: 400, duration: '8m' },   // expected peak
        { target: 800, duration: '4m' },   // 2x spike
        { target: 400, duration: '8m' },   // recovery
      ],
    },
  },
  thresholds: {
    'http_req_duration{endpoint:cart_create}': ['p(95)<300'],
    'http_req_duration{endpoint:checkout}':    ['p(95)<900', 'p(99)<2500'],
    'checkout_e2e_duration':                   ['p(95)<1500'],
    'http_req_failed':                         [{ threshold: 'rate<0.005', abortOnFail: true, delayAbortEval: '30s' }],
    'checks{endpoint:checkout}':               ['rate>0.995'],
    'dropped_iterations':                      ['count<1'],
  },
};

export function setup() {
  const res = http.post('https://api.example.com/auth/service-token',
    JSON.stringify({ key: __ENV.LOAD_TEST_KEY }),
    { headers: { 'Content-Type': 'application/json' } });
  if (res.status !== 200) throw new Error(`setup auth failed: ${res.status}`);
  return { token: res.json('accessToken') };
}

export default function (data) {
  const buyer = buyers[exec.scenario.iterationInTest % buyers.length];
  const params = { headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' } };
  const started = Date.now();

  const cart = http.post('https://api.example.com/carts',
    JSON.stringify({ sku: buyer.sku, qty: 1 }),
    { ...params, tags: { endpoint: 'cart_create' }, responseType: 'text' });
  if (!check(cart, { 'cart created': (r) => r.status === 201 }, { endpoint: 'cart_create' })) return;

  sleep(Math.random() * 3 + 2);   // the human reads the cart page

  const order = http.post(`https://api.example.com/carts/${cart.json('id')}/checkout`,
    JSON.stringify({ paymentToken: buyer.paymentToken }),
    { ...params, tags: { endpoint: 'checkout' } });

  check(order, { 'order confirmed': (r) => r.status === 201 }, { endpoint: 'checkout' });
  checkoutLatency.add(Date.now() - started);
}
```

Markers of skill-compliant output: an arrival-rate executor with an explicit warm-up stage that models traffic instead of VU count; every request tagged so thresholds bind per endpoint rather than to one blended metric; the SLO restated as thresholds with `abortOnFail` and a `delayAbortEval` grace so startup blips don't kill the run; `dropped_iterations` guarded so a starved generator can't masquerade as a pass; `SharedArray` with deterministic modulo assignment instead of random collision; a custom `Trend` for the end-to-end journey that no single `http_req_duration` captures; and an early `return` on cart failure so a broken precondition doesn't pollute the checkout percentiles it was never part of.
