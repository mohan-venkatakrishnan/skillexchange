import { defineConfig } from '@playwright/test';

// Local e2e: preview server in MOCK mode — deterministic, no backend needed.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:5174',
    reuseExistingServer: false, // stale preview servers test yesterday's build
    timeout: 30_000,
  },
});
