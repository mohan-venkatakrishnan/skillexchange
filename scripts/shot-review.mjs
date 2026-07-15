import { chromium } from '@playwright/test';
import { preview } from 'vite';
const server = await preview({ preview: { port: 5191 } });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1360, height: 1000 } });
const go = async (path, name, wait = 1500) => {
  await p.goto(`http://localhost:5191${path}`);
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `rev-${name}.png` });
  const of = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (of > 0) console.log('!! OVERFLOW', name, of);
};
await go('/skills/1', 'detail');
await go('/create', 'create');
await go('/leaderboard', 'leaderboard');
// light theme
await p.goto('http://localhost:5191/marketplace');
await p.waitForTimeout(800);
await p.getByLabel('Toggle theme').click();
await p.waitForTimeout(600);
await p.screenshot({ path: 'rev-light-market.png' });
console.log('done');
await b.close(); await server.close(); process.exit(0);
