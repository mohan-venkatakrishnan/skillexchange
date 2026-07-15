---
title: Playwright Live Regression Suite Skill
category: Testing
description: Turn Playwright into a product immune system — a three-layer test pyramid topped by a live regression suite that runs against production as a release gate and nightly cron. Includes the sentinel test classes (CSS truncation, security headers, deep-link 200s, styled-chrome probes), zero-cost AI-provider mocking, and the determinism rules proven on a shipped SaaS.
usage: Load this skill when setting up or hardening tests for a deployed web app. Start with Section 5 to stand up the two configs and global-setup, then add the Section 3 sentinel tests one class at a time — each one is copy-adaptable. Whenever a user reports a bug, return to this skill and encode the bug's CLASS as a new sentinel.
platforms: [Claude, Cursor]
priceUsd: 8
timeSavedHours: 30
pocUrl: https://launch.tapdot.org
---
# Playwright Live Regression Suite Skill

## 1. Philosophy

Most test suites verify features on localhost. The suite that actually protects a shipped product runs **against production** — because "the code is correct" and "the deployed site works" diverge in exactly the ways that embarrass you: a CDN serving stale CSS, a rewrite rule turning deep links into 404s, a security header dropped in a hosting migration, an authorizer change breaking CORS.

Principles, each earned on a live SaaS (launch.tapdot.org) where this suite runs on every deploy and every night:

- **Three layers, three jobs.** Unit tests (Vitest) prove logic including Lambda handlers with mocked SDKs. E2E tests (Playwright vs local preview + real backend) prove flows. The **live regression suite** (Playwright vs the deployed URL) proves *the product users are actually touching* — and it is the release gate.
- **Test bug classes, not bug instances.** When a user reports "huge black box on the landing page" (stripped CSS made an SVG explode), you don't write a test for that SVG — you write a sentinel that asserts *no* SVG renders taller than 120px. Every user-reported bug becomes a permanent class-level sentinel.
- **Deterministic by construction, not by retries.** Force the app's low performance tier, mark first-run tips as seen, mock every external AI provider at the network layer, and wait for durable events (the POST that carries your content), never for timers.
- **A test that fails in-suite but passes alone is a real finding.** The two "flakes" chased on the source product were an actual data-loss race and an actual durability gap. Retry-looping them away ships the bug.
- **The live suite must cost $0 and leave no residue.** AI calls intercepted, emails intercepted, and every entity it creates deleted through the product's own delete affordance — if the product can't delete it, that's a product gap; fix the product.

## 2. Tech Stack

- `@playwright/test` with **two configs**: `playwright.config.js` (e2e, local preview) and `playwright.regression.config.js` (live site).
- Vitest for the unit layer (frontend logic + Lambda handlers with mocked AWS SDK).
- A shared `global-setup.js` that signs in a real test user via the identity provider's admin API and seeds `storageState`.
- CI: full pyramid on push; regression suite re-run against production **after** deploy and on a nightly cron.

## 3. Patterns

### 3.1 The two configs

```js
// playwright.config.js — e2e against a local preview build + REAL backend
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // All specs share ONE real test user and their real DB rows (no per-test
  // isolation) — cross-file parallelism causes real races. Run serially.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  globalSetup: './tests/e2e/global-setup.js',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: 'tests/.auth/user.json',
  },
  webServer: { command: 'npm run preview', port: 5173, reuseExistingServer: !process.env.CI },
});
```

```js
// playwright.regression.config.js — the LIVE deployment, no webServer at all
export default defineConfig({
  testDir: './tests/regression',
  workers: 1,
  retries: 2,                       // network reality; assertions stay strict
  timeout: 45000,
  globalSetup: './tests/e2e/global-setup.js',   // same auth seed, different target
  use: {
    baseURL: process.env.REGRESSION_BASE_URL ?? 'https://app.example.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: 'tests/.auth/user.json',
  },
  reporter: [['list'], ['html', { outputFolder: 'regression-report' }],
             ['json', { outputFile: 'test-results/regression.json' }]],
});
```

Gotcha baked into that webServer block: `reuseExistingServer: true` locally will happily test **yesterday's build** if a stale preview server survives. Kill node processes before e2e runs, or you'll debug fixed bugs.

### 3.2 Global setup: real auth + forced determinism

```js
// tests/e2e/global-setup.js
export default async function globalSetup(config) {
  loadDotEnv();   // CI exports env vars; local shells don't. Without this the
                  // auth seed SILENTLY skips and suites run on a stale token.
  const baseURL = config?.projects?.[0]?.use?.baseURL;

  // sign in a real test user via the IdP's server-side auth API (for Cognito:
  // AdminInitiateAuth with ADMIN_USER_PASSWORD_AUTH) — no UI login flow to flake
  const idToken = await adminSignIn(process.env.TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(baseURL);
  await page.evaluate((token) => {
    localStorage.setItem('app_id_token', token);
    // deterministic UI: no animation loops, no first-run tips popping over targets
    localStorage.setItem('perf-tier', 'low');
    localStorage.setItem('tips-seen-v1', JSON.stringify({ '/': true, '/dashboard': true, '/settings': true }));
  }, idToken);
  await page.context().storageState({ path: 'tests/.auth/user.json' });
  await browser.close();
}
```

Signed-out coverage inside a signed-in suite: open a fresh context with `browser.newContext({ storageState: undefined })` per test that needs it.

### 3.3 Sentinel: CSS truncation / design-system integrity

The bug class: a build or CDN issue serves partial CSS. The page still "works", but unstyled inline SVGs explode to container width (the production symptom was a huge black box). The sentinel asserts computed reality, not markup:

```js
test('design system integrity: no unstyled elements survive', async ({ page }) => {
  await page.goto('/');
  // 1. stripped-CSS canary: no SVG may exceed 120px tall
  //    (exempt the one intentionally full-width decorative SVG by class)
  const giants = await page.evaluate(() =>
    [...document.querySelectorAll('svg:not(.hero-track)')]
      .map((el) => ({ h: el.getBoundingClientRect().height,
                      where: el.parentElement?.className?.toString().slice(0, 30) }))
      .filter((x) => x.h > 120)
  );
  expect(giants).toEqual([]);
  // 2. key components carry COMPUTED styles, not browser defaults
  const probe = await page.evaluate(() => {
    const btn = getComputedStyle(document.querySelector('.btn.primary'));
    const sel = getComputedStyle(document.querySelector('select'));
    return { btnBg: btn.backgroundImage, btnRadius: btn.borderRadius, selAppearance: sel.appearance };
  });
  expect(probe.btnBg).toContain('linear-gradient');   // themed, not flat default
  expect(probe.btnRadius).not.toBe('0px');
  expect(probe.selAppearance).toBe('none');           // selects themed, not native grey
});
```

### 3.4 Sentinel: deep links are real 200s, and security headers ship

SPA hosts with a 404→index fallback *render* fine while serving HTTP 404 to crawlers, unfurlers, and uptime checks. And security headers silently vanish in hosting changes. Both are two-minute sentinels:

```js
test('deep links serve HTTP 200, not SPA-fallback 404s', async ({ page }) => {
  for (const path of ['/demo', '/docs', '/privacy', '/billing']) {
    const resp = await page.request.get(path, { maxRedirects: 0 });
    expect(resp.status(), `${path} must be a real 200`).toBe(200);
  }
  // and genuinely missing paths still 404 — the rewrite must not eat errors
  expect((await page.request.get('/definitely-not-a-page.xyz')).status()).toBe(404);
});

test('security headers are served (OWASP A05)', async ({ page }) => {
  const h = (await page.request.get('/')).headers();
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['strict-transport-security']).toContain('max-age');
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
});
```

### 3.5 Sentinel: layout physics — sticky chrome and horizontal overflow

```js
test('top bar stays pinned while scrolling', async ({ page }) => {
  for (const path of ['/', '/dashboard']) {
    await page.goto(path);
    await page.evaluate(() => window.scrollTo(0, 900));
    const top = await page.evaluate(() => document.querySelector('.topbar')?.getBoundingClientRect().top);
    expect(top, `${path} topbar drifted while scrolling`).toBe(0);
    // the classic root cause: overflow-x:hidden on html/body kills position:sticky
  }
});

test('zero horizontal overflow at phone width', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  for (const path of ['/', '/dashboard', '/settings']) {
    await page.goto(path);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} scrolls sideways at 390px`).toBe(0);
  }
  await ctx.close();
});
```

### 3.6 Deterministic AI-engine mocking — paid providers tested at $0

The full generate flow — key verification, drafting, provenance labels, error surfacing — tested end-to-end on the live site with zero spend and zero real keys, by intercepting at the network layer and asserting the *outbound request shape*:

```js
test('cloud AI engines work end-to-end (providers mocked — zero cost)', async ({ page }) => {
  const seen = {};
  await page.route('https://api.openai.com/v1/chat/completions', (route) => {
    seen.openai = JSON.parse(route.request().postData());
    seen.auth = route.request().headers()['authorization'];
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'MOCK drafted this title' } }] }) });
  });
  // seed one key via storage, type the other through the real Settings UI —
  // pre-seeding both would make the fill a no-op and skip verification coverage
  await page.addInitScript(() => localStorage.setItem('app_claude_key', 'sk-ant-mock'));

  await page.goto('/settings');
  await page.getByTestId('engine-openai').locator('input[type="password"]').fill('sk-mock');
  await expect(page.getByTestId('key-status-openai')).toContainText('Verified ✓');

  // drive the REAL UI; assert both the visible result and the outbound payload
  await page.getByTestId('engine-select').selectOption('openai');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('rte-Title')).toContainText('MOCK drafted this title');
  expect(seen.auth).toBe('Bearer sk-mock');                          // key actually sent
  expect(seen.openai.messages.some((m) => m.role === 'system')).toBe(true);
  expect(seen.openai.model).toMatch(/gpt/);

  // error path: a provider 429 must surface as a human sentence, not a code
  await page.route('https://api.openai.com/v1/chat/completions',
    (route) => route.fulfill({ status: 429, body: '{}' }), { times: 3 });
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('toast')).toContainText(/rate limit/i);
});
```

The same interception pattern covers transactional email (intercept Formspree/SES-frontends, assert the payload contains the address, never actually send) — the nightly cron must not spam anyone.

### 3.7 Durability waits and residue-free journeys

```js
// WRONG: waits for a debounce timer — passes locally, flakes in CI
await page.waitForTimeout(1500);

// RIGHT: wait for the durable event — the POST whose body carries YOUR content.
// An earlier autosave tick with partial text must not satisfy the wait.
const autosaved = page.waitForResponse((r) =>
  r.url().includes('/projects') && r.request().method() === 'POST'
  && (r.request().postData() ?? '').includes('Regression draft title'));
await editor.pressSequentially('Regression draft title');
await autosaved;
await page.reload();
await expect(editor).toContainText('Regression draft title');   // survived the reload
```

Journey hygiene: name test entities `` `Regression ${Date.now()}` `` so runs never collide; end every journey by deleting through the UI and asserting count 0. Account-level state (prefs, custom entities) persists across runs — count *relatively* (+1 from baseline), never absolutely.

### 3.8 The pipeline: regression as release gate

```yaml
# deploy.yml (shape, not full file)
jobs:
  test:    # unit + e2e vs preview build
  deploy:  # needs: test — build, push artifact to host
  regression:
    needs: deploy
    steps:
      - run: npx playwright test --config playwright.regression.config.js
        env: { REGRESSION_BASE_URL: https://app.example.com }
# plus a schedule: cron trigger running ONLY the regression job nightly
```

Deploy is not done when the artifact uploads; it's done when the live suite is green against the URL users hit. The nightly run catches what no deploy caused: expired certs, provider API drift, hosting config decay.

## 4. Anti-patterns

- **Only testing localhost.** Every failure mode in §3.3–3.5 (stale CSS, rewrite 404s, dropped headers) is invisible on localhost by construction. If no suite targets the production URL, these ship silently.
- **Retry-looping flakes away.** In-suite-only failures are ordering/race findings. Both "flakes" on the source product were real data-loss bugs. Diagnose; never just bump `retries`.
- **`waitForTimeout` as synchronization.** Timers encode your machine's speed. Wait for the response whose payload proves durability (§3.7).
- **Parallel workers over a shared test account.** One real user + real DB rows means cross-file parallelism races itself. `workers: 1`, and never run local e2e while CI e2e runs — same account, real collisions.
- **Tests that mutate account state without restoring it.** A payment test flipping the shared account's plan breaks every later run. Pin required state (e.g. plan=pro) as a self-healing pipeline step *before* tests.
- **Pre-seeding all fixtures so the UI does nothing.** If both API keys are pre-seeded, the "type a key → Verified ✓" path is silently untested (§3.6's comment). Leave one path to be exercised through the real UI.
- **Screenshot-diff-everything as the visual strategy.** Full-page pixel diffs on a live animated site drown you in noise. Assert computed styles and geometry (§3.3, §3.5); keep screenshots as failure artifacts for humans.
- **Letting the nightly run touch the outside world.** Real emails to Formspree, real spend on OpenAI, real orphan rows. Intercept externals, assert payloads, delete residue.
- **A silently-skipping global setup.** Missing env vars must at minimum warn loudly; the failure mode is every spec running on an expired token and failing with baffling 401s.

## 5. Usage

1. **Stand up the pyramid**: "Create `playwright.config.js` (e2e, local preview, workers 1) and `playwright.regression.config.js` (live URL from `REGRESSION_BASE_URL`) per §3.1, plus `tests/e2e/global-setup.js` per §3.2 using [my IdP]'s admin auth. Add Vitest for units."
2. **Determinism switches in the app**: a perf-tier flag that disables animation loops, tips keyed in localStorage, and `data-testid` on every interactive element. Tests force all three in global-setup.
3. **Sentinels first, journeys second**: add §3.3 (CSS integrity), §3.4 (deep links + headers), §3.5 (sticky + overflow) — they're app-agnostic and catch infrastructure decay immediately.
4. **One full journey**: create → edit → durable-save (§3.7 wait) → reload → verify → delete-through-UI → assert count 0.
5. **Mock the money paths**: adapt §3.6 for each external provider your app calls; assert outbound auth headers and body shape, plus one error-status → human-message case each.
6. **Wire the gate**: deploy job → regression job against production; add the nightly cron. A red nightly is a pageable event.
7. **Forever after**: every user-reported bug gets a sentinel for its *class* before the fix merges. Ask the AI: "generalize this bug into a class-level sentinel test."

## 6. Example Output

Repo shape after applying this skill:

```
tests/
├── unit/                      # Vitest: logic + lambda handlers (mocked SDK)
├── e2e/
│   ├── global-setup.js        # admin auth → storageState + determinism keys
│   ├── auth.spec.js  editor.spec.js  billing.spec.js  ux-states.spec.js
└── regression/
    └── ui.spec.js             # ~20 tests vs PRODUCTION, serial
playwright.config.js
playwright.regression.config.js
```

A green nightly run reads like a product health report:

```
Running 19 tests using 1 worker
  ✓ landing: hero, showcase, pricing, sitemap footer (4.1s)
  ✓ design system integrity: no unstyled elements survive (2.3s)
  ✓ auth gate: protected routes bounce signed-out visitors (3.0s)
  ✓ full journey: brief → editor → sections → persistence (14.8s)
  ✓ deep links serve HTTP 200, not SPA-fallback 404s (1.2s)
  ✓ security headers are served (OWASP A05) (0.6s)
  ✓ top bar stays pinned while scrolling (2.1s)
  ✓ zero horizontal overflow at phone width (2.8s)
  ✓ cloud AI engines work end-to-end (providers mocked — zero cost) (11.4s)
  ✓ live API: plan check answers, feedback endpoint answers (3.9s)
  19 passed (1.4m)
```

When this is green against production every night, "did the deploy break anything?" stops being a feeling and becomes a report.
