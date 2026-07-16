import { chromium } from '@playwright/test';
import { preview } from 'vite';
const s = await preview({ preview: { port: 5198 } });
const b = await chromium.launch();
let fails = 0;
for (let i = 0; i < 8; i++) {
  const p = await b.newPage({ viewport: { width: 1360, height: 950 } });
  await p.goto('http://localhost:5198/marketplace');
  await p.waitForSelector('[data-testid="results-count"]');
  await p.getByRole('button', { name: 'Cursor', exact: true }).click();
  await p.getByRole('button', { name: 'Any assistant' }).click();   // rapid: no settle
  const cb = p.getByLabel('Verified creators only');
  try {
    await cb.check({ timeout: 2500 });
    console.log(`run ${i}: OK  url=${p.url().split('?')[1] || '(none)'}`);
  } catch (e) {
    fails++;
    // what does the DOM actually say right now?
    const st = await p.evaluate(() => {
      const el = document.querySelector('input[type=checkbox]');
      return { domChecked: el.checked, url: location.search };
    });
    console.log(`run ${i}: FAIL domChecked=${st.domChecked} url=${st.url || '(none)'} :: ${e.message.split('\n')[0]}`);
  }
  await p.close();
}
console.log(`\n${fails}/8 failed`);
await b.close(); await s.close(); process.exit(0);
