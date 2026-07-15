import { chromium } from '@playwright/test';
import { preview } from 'vite';
const s = await preview({ preview: { port: 5196 } });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1360, height: 1050 } });
const wait = (sel) => p.waitForSelector(sel, { timeout: 30000 });

await p.goto('http://localhost:5196/u/vector_kitchen');
await wait('[data-testid="skill-card"]');
await p.waitForTimeout(1200);
await p.screenshot({ path: 'real-profile.png' });

await p.goto('http://localhost:5196/skills/tapdot-langchain-rag-pipeline');
await p.waitForTimeout(3000);
await p.screenshot({ path: 'real-detail.png' });
await b.close(); await s.close(); process.exit(0);
