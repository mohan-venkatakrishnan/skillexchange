import { chromium } from '@playwright/test';
import { preview } from 'vite';
const server = await preview({ preview: { port: 5177 } });
const browser = await chromium.launch();
// Light theme
const p1 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await p1.goto('http://localhost:5177/');
await p1.waitForTimeout(800);
await p1.getByLabel('Toggle theme').click();
await p1.waitForTimeout(400);
await p1.screenshot({ path: 'light-home.png' });
// Mobile 390px
const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
await p2.goto('http://localhost:5177/marketplace');
await p2.waitForTimeout(900);
const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log('mobile overflow px:', overflow);
await p2.getByLabel('Menu').click();
await p2.waitForTimeout(300);
await p2.screenshot({ path: 'mobile-menu.png' });
await browser.close(); await server.close(); process.exit(0);
