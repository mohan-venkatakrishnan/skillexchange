import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/* Contract tests for the seed catalogue itself.
   A stray process (or a well-meaning agent restoring "spec" values it
   remembered from an earlier brief) silently reverted three skills to $6-8
   after the catalogue had been deliberately repriced. Nothing caught it
   except a hand-read of the diff. These lock the shape of the catalogue so
   the next drift fails CI instead of reaching the storefront. */

const CATS = ['Coding', 'Design', 'Extension', 'Desktop', 'Document', 'Marketing', 'Website', 'Data', 'DevOps', 'AI/ML', 'Testing', 'Mobile', 'Other'];
const PLATS = ['Claude', 'ChatGPT', 'Gemini', 'Cursor', 'Copilot'];

const skills = readdirSync('seed-content')
  .filter(f => f.endsWith('.skill.md'))
  .map(f => {
    const raw = readFileSync(`seed-content/${f}`, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) throw new Error(`${f}: no frontmatter`);
    const meta = {};
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      let v = line.slice(i + 1).trim();
      if (v.startsWith('[')) v = v.replace(/[[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
      meta[line.slice(0, i).trim()] = v;
    }
    return { file: f, meta, bodyLines: m[2].split('\n').length };
  });

describe('seed catalogue', () => {
  it('has skills to check', () => {
    expect(skills.length).toBeGreaterThan(50);
  });

  it('is ~90% free — free is the acquisition engine and makes downloads real', () => {
    const free = skills.filter(s => Number(s.meta.priceUsd) === 0);
    const pct = free.length / skills.length;
    expect(pct, `${free.length}/${skills.length} free`).toBeGreaterThanOrEqual(0.85);
  });

  it('prices nothing outside the $5-6 band', () => {
    const bad = skills
      .filter(s => Number(s.meta.priceUsd) > 0)
      .filter(s => Number(s.meta.priceUsd) < 5 || Number(s.meta.priceUsd) > 6)
      .map(s => `${s.file} = $${s.meta.priceUsd}`);
    expect(bad, 'paid skills must be $5-6').toEqual([]);
  });

  it('every skill has a real proof-of-concept URL', () => {
    const bad = skills.filter(s => !/^https?:\/\/.+\..+/.test(s.meta.pocUrl || '')).map(s => s.file);
    expect(bad, 'proof of concept is never optional').toEqual([]);
  });

  it('every skill has a valid category and platform set', () => {
    for (const s of skills) {
      expect(CATS, s.file).toContain(s.meta.category);
      const plats = Array.isArray(s.meta.platforms) ? s.meta.platforms : [s.meta.platforms];
      expect(plats.length, s.file).toBeGreaterThan(0);
      for (const p of plats) expect(PLATS, `${s.file} platform`).toContain(p);
    }
  });

  it('has no duplicate titles', () => {
    const seen = new Map();
    const dupes = [];
    for (const s of skills) {
      if (seen.has(s.meta.title)) dupes.push(`${s.file} == ${seen.get(s.meta.title)}`);
      seen.set(s.meta.title, s.file);
    }
    expect(dupes).toEqual([]);
  });

  it('every skill is substantive, not a stub', () => {
    const thin = skills.filter(s => s.bodyLines < 100).map(s => `${s.file} (${s.bodyLines} lines)`);
    expect(thin, 'a listing must be worth opening').toEqual([]);
  });

  it('covers every category', () => {
    const covered = new Set(skills.map(s => s.meta.category));
    expect([...CATS].filter(c => !covered.has(c)), 'uncovered categories').toEqual([]);
  });
});
