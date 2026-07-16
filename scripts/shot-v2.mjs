import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1360, height: 1000 } });
await p.goto('https://skillexchange.tapdot.org/');
await p.waitForTimeout(3500);
await p.screenshot({ path: 'v2-home.png' });
await p.goto('https://skillexchange.tapdot.org/marketplace');
await p.waitForFunction(() => {
  const e = document.querySelector('[data-testid="results-count"]');
  return e && !e.textContent.includes('Loading');
}, { timeout: 30000 });
await p.waitForTimeout(1800);
console.log('marketplace:', (await p.textContent('[data-testid="results-count"]')).trim());
await p.screenshot({ path: 'v2-market.png' });
// nav timing: revisit should NOT re-show the loader
const t0 = Date.now();
await p.goto('https://skillexchange.tapdot.org/leaderboard');
await p.waitForTimeout(1500);
await p.screenshot({ path: 'v2-leaderboard.png' });
await b.close(); process.exit(0);
