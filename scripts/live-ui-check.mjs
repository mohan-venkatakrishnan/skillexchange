// Drive the LIVE-mode build in a real browser: marketplace from the real API,
// sign-in via real Cognito, library, sign-out.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../input.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));

const server = await preview({ preview: { port: 5176 } });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const die = (m) => { console.error('FAIL:', m); process.exit(1); };

// Marketplace loads real seeded data
await page.goto('http://localhost:5176/marketplace');
await page.waitForSelector('[data-testid="results-count"]', { timeout: 20000 });
const count = await page.textContent('[data-testid="results-count"]');
console.log('marketplace:', count.trim());
count.match(/\d{3}/) || die('expected 200+ seeded skills');

// Real Cognito sign-in through the UI
await page.click('[data-testid="nav-signin"]');
await page.fill('[data-testid="auth-email"]', env.TEST_USER_EMAIL);
await page.fill('[data-testid="auth-password"]', env.TEST_USER_PASSWORD);
await page.click('[data-testid="auth-submit"]');
await page.waitForSelector('[data-testid="nav-user"]', { timeout: 20000 });
console.log('signed in as:', (await page.textContent('[data-testid="nav-user"]')).trim());

// Library (authed API call)
await page.click('text=My Library');
await page.waitForSelector('text=Skills you\'ve purchased or downloaded.', { timeout: 15000 });
console.log('library loaded');

// Home stats now live
await page.goto('http://localhost:5176/');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'live-home.png' });
console.log('ALL LIVE UI CHECKS PASSED');
await browser.close(); await server.close(); process.exit(0);
