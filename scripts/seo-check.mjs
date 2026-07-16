import { chromium } from '@playwright/test';
import { preview } from 'vite';
const s = await preview({ preview: { port: 5202 } });
const b = await chromium.launch();
const p = await b.newPage();
for (const [path, label] of [['/', 'home'], ['/marketplace', 'market'], ['/publish', 'publish'], ['/leaderboard', 'lb'], ['/skills/1', 'skill']]) {
  await p.goto('http://localhost:5202' + path);
  await p.waitForTimeout(700);
  const title = await p.title();
  const desc = await p.getAttribute('meta[name="description"]', 'content');
  const canon = await p.getAttribute('link[rel="canonical"]', 'href');
  const ld = (await p.locator('script[data-seo-jsonld]').count());
  console.log(`${label.padEnd(8)} title="${title.slice(0,48)}" | canon=${canon} | jsonLd=${ld}`);
}
await b.close(); await s.close(); process.exit(0);
