// Capture a REAL screenshot for every distinct pocUrl across the seed
// catalogue. Nothing is mocked or drawn — each shot is the live page the skill
// points at. Cached on disk, so re-runs only fetch new URLs.
//
// Usage: node scripts/capture-poc-shots.mjs [--force]
import { chromium } from '@playwright/test';
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const FORCE = process.argv.includes('--force');
const OUT = 'seed-content/shots';
mkdirSync(OUT, { recursive: true });

export const shotName = (url) => createHash('sha1').update(url).digest('hex').slice(0, 16) + '.png';

const urls = new Set();
for (const f of readdirSync('seed-content').filter(x => x.endsWith('.skill.md'))) {
  const raw = readFileSync(`seed-content/${f}`, 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) continue;
  const u = m[1].match(/^pocUrl:\s*(\S+)/m)?.[1];
  if (u) urls.add(u);
}

const todo = [...urls].filter(u => FORCE || !existsSync(`${OUT}/${shotName(u)}`));
console.log(`${urls.size} distinct POC URLs · ${todo.length} to capture`);
if (!todo.length) process.exit(0);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let ok = 0; const failed = [];

for (const url of todo) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2200);
    // GitHub shows a cookie/consent strip for some regions — dismiss if present
    await page.locator('button:has-text("Accept")').first().click({ timeout: 900 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/${shotName(url)}` });
    ok++;
    process.stdout.write('.');
  } catch (e) {
    failed.push(`${url} — ${e.message.split('\n')[0]}`);
    process.stdout.write('x');
  }
}
await browser.close();

console.log(`\ncaptured ${ok}/${todo.length}`);
if (failed.length) {
  // Loud, not silent: a skill without real proof must not reach a listing.
  console.error('\nFAILED (these skills cannot be seeded until their POC resolves):');
  failed.forEach(f => console.error('  ' + f));
  process.exit(1);
}
