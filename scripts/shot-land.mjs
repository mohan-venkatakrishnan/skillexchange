import { chromium } from '@playwright/test';
import { preview } from 'vite';
const s = await preview({ preview: { port: 5204 } });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 800 } });
await p.goto('http://localhost:5204/');
await p.waitForTimeout(1500);
// scroll to how-it-works and let the flow animate
await p.evaluate(() => document.querySelector('#how')?.scrollIntoView({ behavior: 'instant', block: 'start' }));
await p.waitForTimeout(2500);
await p.screenshot({ path: 'land-flow.png' });
const of = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log('overflow:', of);
await b.close(); await s.close(); process.exit(0);
