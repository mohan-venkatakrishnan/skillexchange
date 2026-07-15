// Capture REAL screenshots of the POC sites referenced by seed skills.
// No fabricated proof — these are live captures of the actual projects.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SITES = {
  'tapdot.org': 'https://tapdot.org',
  'launch.tapdot.org': 'https://launch.tapdot.org',
  'tools.tapdot.org': 'https://tools.tapdot.org',
  'peerreview.tapdot.org': 'https://peerreview.tapdot.org',
  'github.com-supabase-supabase': 'https://github.com/supabase/supabase',
  'github.com-shadcn-ui-ui': 'https://github.com/shadcn-ui/ui',
  'github.com-microsoft-playwright': 'https://github.com/microsoft/playwright',
  'github.com-fastapi-fastapi': 'https://github.com/fastapi/fastapi',
  'github.com-node-red-node-red': 'https://github.com/node-red/node-red',
};

mkdirSync('seed-content/shots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const [name, url] of Object.entries(SITES)) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `seed-content/shots/${name}.png` });
    console.log('captured', name);
  } catch (e) {
    console.error('FAILED', name, e.message);
  }
}
await browser.close();
