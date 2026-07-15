// Validate every seed skill file before it can reach a marketplace listing.
import { readFileSync, readdirSync } from 'node:fs';
const CATS = ["Coding","Design","Extension","Desktop","Document","Marketing","Website","Data","DevOps","AI/ML","Testing","Mobile","Other"];
const PLATS = ["Claude","ChatGPT","Gemini","Cursor","Copilot"];
const dir = 'seed-content';
let fail = 0, ok = 0;
const byCat = {}, titles = new Set(), slugs = [];

for (const f of readdirSync(dir).filter(x => x.endsWith('.skill.md'))) {
  const raw = readFileSync(`${dir}/${f}`, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) { console.error(`FAIL ${f}: no frontmatter`); fail++; continue; }
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':'); if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if (v.startsWith('[')) v = v.replace(/[[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
    meta[line.slice(0, i).trim()] = v;
  }
  const errs = [];
  if (!meta.title) errs.push('title');
  if (!CATS.includes(meta.category)) errs.push(`category=${meta.category}`);
  if (!meta.description || meta.description.length < 30) errs.push('description too short');
  if (!meta.usage || meta.usage.length < 20) errs.push('usage too short');
  const plats = Array.isArray(meta.platforms) ? meta.platforms : [meta.platforms];
  if (!plats.length || !plats.every(p => PLATS.includes(p))) errs.push(`platforms=${plats}`);
  const price = Number(meta.priceUsd);
  if (isNaN(price) || price < 0 || price > 20) errs.push(`price=${meta.priceUsd}`);
  if (!(Number(meta.timeSavedHours) > 0)) errs.push('timeSavedHours');
  if (!/^https?:\/\/.+\..+/.test(meta.pocUrl || '')) errs.push('pocUrl');
  const lines = m[2].split('\n').length;
  if (lines < 100) errs.push(`body only ${lines} lines`);
  if (titles.has(meta.title)) errs.push('DUPLICATE title');
  titles.add(meta.title);
  if (errs.length) { console.error(`FAIL ${f}: ${errs.join(', ')}`); fail++; continue; }
  byCat[meta.category] = (byCat[meta.category] || 0) + 1;
  slugs.push({ f, price, cat: meta.category, lines });
  ok++;
}
console.log(`\n${ok} valid, ${fail} invalid`);
console.log('by category:', JSON.stringify(byCat, null, 0));
console.log('free skills:', slugs.filter(s => s.price === 0).length);
console.log('avg body lines:', Math.round(slugs.reduce((a, s) => a + s.lines, 0) / (slugs.length || 1)));
process.exit(fail ? 1 : 0);
