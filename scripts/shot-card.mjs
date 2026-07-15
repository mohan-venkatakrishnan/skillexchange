import { chromium } from '@playwright/test';
import { preview } from 'vite';
const s = await preview({ preview: { port: 5192 } });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1360, height: 700 } });
await p.goto('http://localhost:5192/marketplace');
await p.waitForTimeout(1400);
await p.screenshot({ path: 'rev-cards.png', clip: { x: 300, y: 230, width: 1030, height: 290 } });
await b.close(); await s.close(); process.exit(0);
