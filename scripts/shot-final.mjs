import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1360, height: 1000 } });
await p.goto('https://skillexchange.tapdot.org/marketplace');
await p.waitForFunction(() => {
  const el = document.querySelector('[data-testid="results-count"]');
  return el && !el.textContent.includes('Loading');
}, { timeout: 30000 });
await p.waitForTimeout(2000);
console.log('PROD marketplace:', (await p.textContent('[data-testid="results-count"]')).trim());
await p.screenshot({ path: 'FINAL-prod.png' });
const of = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log('horizontal overflow:', of);
await b.close(); process.exit(0);
