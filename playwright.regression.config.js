import { defineConfig } from '@playwright/test';

// Live regression vs a deployed environment (QA by default) — the release
// gate on every deploy and the nightly cron. REGRESSION_URL overrides.
export default defineConfig({
  testDir: 'tests/regression',
  timeout: 45_000,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.REGRESSION_URL || 'https://skillexchangeqa.tapdot.org',
    screenshot: 'only-on-failure',
  },
});
