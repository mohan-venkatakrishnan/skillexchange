import { chromium } from '@playwright/test';
import { preview } from 'vite';
const s = await preview({ preview: { port: 5197 } });
const b = await chromium.launch();
for (let i = 0; i < 6; i++) {
  const p = await b.newPage({ viewport: { width: 1360, height: 950 } });
  await p.goto('http://localhost:5197/marketplace');
  await p.waitForSelector('[data-testid="results-count"]');
  await p.getByRole('button', { name: 'Free', exact: true }).click();
  await p.getByRole('button', { name: 'Any price' }).click();
  await p.getByRole('button', { name: 'Cursor', exact: true }).click();
  await p.getByRole('button', { name: 'Any assistant' }).click();
  const before = p.url();
  const cb = p.getByLabel('Verified creators only');
  await cb.click();
  await p.waitForTimeout(250);
  console.log(`run ${i}: url_before=${before.split('?')[1] || '(none)'} | after=${p.url().split('?')[1] || '(none)'} | checked=${await cb.isChecked()}`);
  await p.close();
}
await b.close(); await s.close(); process.exit(0);
