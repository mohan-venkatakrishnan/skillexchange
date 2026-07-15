---
title: E2E Testing with Playwright Skill
category: Testing
description: Write end-to-end tests that survive refactors and run fast in CI. Covers user-facing locators, fixtures as the unit of setup, network interception, sharded CI runs, and debugging with traces instead of screenshots-and-prayer.
usage: Load this skill before asking your AI assistant to write or fix Playwright tests. Point it at the flow to cover ("test checkout with a declined card") and it will produce role-based locators, fixture-driven setup, and web-first assertions instead of brittle CSS selectors and sleeps.
platforms: [Claude, ChatGPT, Cursor, Gemini]
priceUsd: 0
timeSavedHours: 12
pocUrl: https://github.com/microsoft/playwright
---

# E2E Testing with Playwright Skill

## 1. Philosophy

E2E suites die one of two deaths: they become flaky (so people stop trusting red) or slow (so people stop running them). Every pattern in this skill exists to prevent one of those deaths.

1. **Test what the user sees, locate how the user locates.** A user finds the submit button by its role and name, not by `div.form-wrap > button:nth-child(3)`. Locators that mirror user perception survive refactors; structural selectors die with the next CSS change.
2. **Flakiness is a bug in the test, not weather.** Playwright's auto-waiting assertions eliminate almost every legitimate reason to sleep. If a test needs `waitForTimeout`, the test doesn't understand what it's waiting *for* — find the real condition and assert on it.
3. **Setup is not a test step.** Logging in through the UI in 400 tests is 400 chances to fail at something you already proved works once. Prove login in one test; everywhere else, inject authenticated state via fixtures and storage state.
4. **Each test owns its universe.** Tests that share mutable data serialize badly and fail mysteriously in parallel. Unique data per test (timestamps/UUIDs in names) is cheaper than any cleanup discipline.
5. **When it fails, the trace is the truth.** Don't reproduce locally from a screenshot; open the trace and scrub through the failure like a video with DOM, network, and console attached.

## 2. Tech Stack

- **Playwright** — https://github.com/microsoft/playwright — licensed **Apache-2.0**. Browser automation and test runner for Chromium, Firefox, and WebKit, with auto-waiting assertions, tracing, and first-class parallelism.
- **@playwright/test** — the bundled runner; use it rather than bolting Playwright onto Jest.
- TypeScript for all examples; JavaScript works identically.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Playwright maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Locator hierarchy — memorize this order

1. `getByRole('button', { name: 'Save changes' })` — role + accessible name. Default choice; also audits your accessibility for free.
2. `getByLabel('Email')` — form fields.
3. `getByText('No results found')` — static content.
4. `getByPlaceholder`, `getByAltText`, `getByTitle` — when the above don't apply.
5. `getByTestId('pricing-row')` — last resort for genuinely anonymous containers. A test-id on a button is an admission the button has no accessible name — fix the button.

Scope, don't index:

```ts
// Bad: position-dependent
page.locator('.card').nth(2).locator('button')

// Good: filter by user-visible content, then act within
const proPlan = page.getByRole('listitem').filter({ hasText: 'Pro plan' })
await proPlan.getByRole('button', { name: 'Upgrade' }).click()
```

### 3.2 Web-first assertions do the waiting

```ts
// Each of these retries until pass or timeout — no sleeps, ever.
await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
await expect(page.getByTestId('cart-count')).toHaveText('3')
await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled()
await expect(page).toHaveURL(/\/orders\/\d+/)
```

The rule: `expect(locator)` auto-retries; `expect(value)` does not. `expect(await locator.textContent()).toBe('3')` freezes one instant in time and is a flake generator — never unwrap a locator into a value before asserting on it.

### 3.3 Fixtures: the unit of setup and teardown

Custom fixtures replace `beforeEach` soup and compose across files:

```ts
// fixtures.ts
import { test as base, expect } from '@playwright/test'

type Fixtures = {
  ownerPage: import('@playwright/test').Page
  project: { id: string; name: string }
}

export const test = base.extend<Fixtures>({
  // Authenticated page: storage state was produced once by a setup project
  ownerPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: '.auth/owner.json' })
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },

  // Each test gets a fresh project via API, torn down after
  project: async ({ request }, use) => {
    const name = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const res = await request.post('/api/projects', { data: { name } })
    const project = await res.json()
    await use(project)
    await request.delete(`/api/projects/${project.id}`)
  },
})
export { expect }
```

Authentication happens once, in a dedicated setup project:

```ts
// auth.setup.ts
import { test as setup, expect } from '@playwright/test'

setup('authenticate as owner', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(process.env.E2E_OWNER_EMAIL!)
  await page.getByLabel('Password').fill(process.env.E2E_OWNER_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.context().storageState({ path: '.auth/owner.json' })
})
```

```ts
// playwright.config.ts (excerpt)
projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
]
```

Create test data through the API (fast, reliable), verify behavior through the UI (what you're actually testing).

### 3.4 Network interception: mock the edges, not your own app

Mock third-party and hard-to-trigger states; do not mock your own backend in E2E tests (that's a component test wearing a costume).

```ts
test('shows graceful error when payment provider is down', async ({ ownerPage }) => {
  await ownerPage.route('**/api/payments/intent', (route) =>
    route.fulfill({ status: 502, json: { error: 'upstream_unavailable' } })
  )
  await ownerPage.goto('/checkout')
  await ownerPage.getByRole('button', { name: 'Pay now' }).click()
  await expect(
    ownerPage.getByRole('alert').filter({ hasText: 'Payment is temporarily unavailable' })
  ).toBeVisible()
})
```

To assert a request was made correctly, capture it — set up `waitForRequest` *before* the triggering action:

```ts
const reqPromise = page.waitForRequest('**/api/analytics')
await page.getByRole('button', { name: 'Export CSV' }).click()
const req = await reqPromise
expect(req.postDataJSON()).toMatchObject({ event: 'export', format: 'csv' })
```

### 3.5 CI: sharding, retries, and honest reporting

```ts
// playwright.config.ts (excerpt)
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,        // a stray .only fails the build
  retries: process.env.CI ? 2 : 0,     // retries surface flakes; they don't excuse them
  workers: process.env.CI ? '100%' : undefined,
  reporter: process.env.CI ? [['blob'], ['github']] : [['html']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'off',                      // traces supersede video
  },
})
```

Shard across CI machines and merge reports:

```yaml
# .github/workflows/e2e.yml (excerpt)
strategy:
  fail-fast: false
  matrix: { shard: [1, 2, 3, 4] }
steps:
  - run: npx playwright test --shard=${{ matrix.shard }}/4
  - uses: actions/upload-artifact@v4
    if: ${{ !cancelled() }}
    with: { name: blob-report-${{ matrix.shard }}, path: blob-report }
# then a merge job: npx playwright merge-reports --reporter html ./all-blob-reports
```

Treat "passed on retry" as a bug with a lower severity, not as a pass. Grep CI output for flaky-marked tests weekly and fix the top offender.

### 3.6 Trace-first debugging

- Config: `trace: 'on-first-retry'` in CI, `--trace on` locally when hunting.
- Open with `npx playwright show-trace trace.zip`: timeline scrubber, before/after DOM snapshots per action, network tab, console.
- Reading a timeout failure: check the *action log* first — Playwright tells you exactly which auto-wait condition never became true ("element is not visible", "intercepts pointer events"). That message is the diagnosis; the fix is usually a wrong locator or a missing assertion before the action.
- `npx playwright test --ui` for local development: watch mode, time-travel, and locator picking in one tool. `npx playwright codegen <url>` to bootstrap locators for unfamiliar pages — then rewrite what it gives you into role-based form.

## 4. Anti-patterns

- **`page.waitForTimeout(3000)`.** The suite's slowest, flakiest line. There is always a real condition — a visible element, a URL, a request — to wait on instead.
- **CSS/XPath structural selectors** (`.btn-primary`, `//div[3]/button`). They test your DOM tree, not your product.
- **Asserting on unwrapped values** (`expect(await el.isVisible()).toBe(true)`). You've disabled auto-retry. Use `await expect(el).toBeVisible()`.
- **UI login in every test.** Minutes of wasted CI per run and a single point of flakiness. Storage state + setup project.
- **Shared test users mutating shared data.** Test A renames the project Test B asserts on. Unique data per test, created via API in a fixture.
- **`test.describe.serial` to paper over interdependence.** Serial mode means one failure cascades and nothing parallelizes. Fix the dependency instead.
- **Mocking your own API everywhere.** If every route is fulfilled from fixtures, you're testing your mocks. Reserve `route()` for third parties and induced failure states.
- **Conditional assertions** (`if (await banner.isVisible()) { ... }`). A test that branches doesn't know what it's testing. Control the state so the outcome is deterministic.
- **One mega-test covering signup→onboarding→purchase→refund.** When it fails at step 14, steps 1–13 are noise. Split by user intention; use fixtures to start each test deep in the flow.
- **Ignoring the `webServer` config option** and hand-rolling server startup scripts. `webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI }` handles readiness and teardown for you.

## 5. Usage

1. Load this skill into your assistant's context (or project rules) in a repo with `@playwright/test` installed.
2. Describe the user flow and the states to cover: happy path, one failure mode, one permission boundary. Example: "Cover inviting a teammate: success, already-a-member error, and that viewers don't see the invite button."
3. The assistant should produce: fixture additions (if new setup is needed), the test file with role-based locators and web-first assertions, and any `route()` mocks for third-party calls — in that order.
4. Reject output containing `waitForTimeout`, `nth(` without a filter justification, or raw CSS selectors; ask it to re-derive locators from the rendered accessibility tree.
5. For an existing flaky test, paste the trace's action log and the test source; ask for a diagnosis against section 4 before any code change.

## 6. Example Output

Prompt with this skill loaded: *"Test that a viewer-role user cannot delete a document, but an editor can."*

```ts
// tests/documents/permissions.spec.ts
import { test, expect } from '../fixtures'

test.describe('document deletion permissions', () => {
  test('editor can delete a document', async ({ editorPage, document }) => {
    await editorPage.goto(`/docs/${document.id}`)
    await editorPage.getByRole('button', { name: 'Document actions' }).click()
    await editorPage.getByRole('menuitem', { name: 'Delete document' }).click()
    await editorPage.getByRole('button', { name: 'Confirm delete' }).click()

    await expect(editorPage).toHaveURL('/docs')
    await expect(editorPage.getByRole('status')).toHaveText(/deleted/i)
    await expect(editorPage.getByRole('link', { name: document.title })).toHaveCount(0)
  })

  test('viewer does not see the delete action', async ({ viewerPage, document }) => {
    await viewerPage.goto(`/docs/${document.id}`)
    await viewerPage.getByRole('button', { name: 'Document actions' }).click()
    await expect(viewerPage.getByRole('menuitem', { name: 'Delete document' })).toHaveCount(0)
  })

  test('viewer is blocked at the API even with a crafted request', async ({ viewerPage, document }) => {
    const res = await viewerPage.request.delete(`/api/docs/${document.id}`)
    expect(res.status()).toBe(403)
  })
})
```

Markers of skill-compliant output: two role-specific page fixtures instead of two UI logins, a per-test `document` fixture so parallel runs never collide, role/name locators throughout, a `toHaveCount(0)` absence assertion instead of a try/catch, and a third test that checks the server actually enforces what the UI hides.
