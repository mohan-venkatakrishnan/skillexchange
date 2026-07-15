// Seed an environment with the real skill catalogue: parses seed-content/*.skill.md,
// uploads each SKILL.md + its real POC screenshot to S3, then writes seller
// profiles and skill records through the superadmin API.
//
// Honest by construction: downloads/ratings/reviews start at zero and accrue
// for real. `featured` is set — that is the platform's own curation, not a
// fabricated popularity signal.
//
// Usage: node scripts/seed-prod.mjs <api-url> [--env prod|qa]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { USERS, sellerFor, FEATURED } from './seed-personas.mjs';

const API = process.argv[2];
if (!API) { console.error('usage: node scripts/seed-prod.mjs <api-url> [--env prod|qa]'); process.exit(1); }
const ENV = (process.argv.includes('--env') ? process.argv[process.argv.indexOf('--env') + 1] : 'prod');

const env = Object.fromEntries(readFileSync(new URL('../input.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));

const BUCKET = `skillexchange-${ENV}-535079144881`;
const s3 = new S3Client({
  region: 'us-east-1',
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
});
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Superadmin-Username': env.SUPERADMIN_USERNAME,
  'X-Superadmin-Password': env.SUPERADMIN_PASSWORD,
};

const shotName = (url) => createHash('sha1').update(url).digest('hex').slice(0, 16) + '.png';

/* CRLF-normalised: git's autocrlf rewrites these files on checkout, and a
   \n-only regex silently matched nothing — the seeder reported success while
   skipping every committed file. */
function parseFrontmatter(raw) {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('no frontmatter');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.startsWith('[')) v = v.replace(/[[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
    meta[k] = v;
  }
  return { meta, body: m[2] };
}

async function post(path, body) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── Parse + validate everything BEFORE writing anything ──
const files = readdirSync('seed-content').filter(f => f.endsWith('.skill.md'));
const parsed = [];
const problems = [];
for (const file of files) {
  const slug = file.replace('.skill.md', '');
  try {
    const { meta, body } = parseFrontmatter(readFileSync(`seed-content/${file}`, 'utf8'));
    const shot = `seed-content/shots/${shotName(meta.pocUrl)}`;
    if (!existsSync(shot)) { problems.push(`${file}: no POC screenshot — run scripts/capture-poc-shots.mjs`); continue; }
    parsed.push({ slug, meta, body, shot, seller: sellerFor(slug, meta.category) });
  } catch (e) { problems.push(`${file}: ${e.message}`); }
}
if (problems.length) {
  console.error('Refusing to seed — every skill must ship with proof:');
  problems.forEach(p => console.error('  ' + p));
  process.exit(1);
}
console.log(`${parsed.length} skills parsed, all with a real POC screenshot`);

// ── Sellers (only those actually used) ──
const used = new Set(parsed.map(p => p.seller));
const now = Date.now();
const users = [...used].map((username, i) => {
  const u = USERS[username];
  if (!u) throw new Error(`unknown persona: ${username}`);
  return {
    userId: `tapdot-seed-${username}`,
    username, name: u.name, bio: u.bio, location: u.location,
    verified: u.verified, badges: u.verified ? ['Verified Creator'] : [],
    salesCount: 0,
    createdAt: new Date(now - (90 - i * 4) * 86400_000).toISOString(),
  };
});
await post('/admin/seed', { users });
console.log(`seeded ${users.length} sellers`);

// ── Skills ──
const skills = [];
for (const [i, p] of parsed.entries()) {
  const skillId = `tapdot-${p.slug}`;
  const fileKey = `skills/${skillId}/SKILL.md`;
  const shotKey = `screenshots/${skillId}.png`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: fileKey, Body: p.body, ContentType: 'text/markdown' }));
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: shotKey, Body: readFileSync(p.shot), ContentType: 'image/png' }));

  const seller = users.find(u => u.username === p.seller);
  skills.push({
    skillId,
    title: p.meta.title,
    category: p.meta.category,
    description: p.meta.description,
    usageInstructions: p.meta.usage,
    platforms: Array.isArray(p.meta.platforms) ? p.meta.platforms : [p.meta.platforms],
    priceCents: Math.round(Number(p.meta.priceUsd) * 100),
    timeSavedHours: Number(p.meta.timeSavedHours),
    pocUrl: p.meta.pocUrl,
    skillFileKey: fileKey,
    pocScreenshotKey: shotKey,
    status: 'approved',
    featured: FEATURED.has(p.slug),
    // Honest zero-start. These accrue from real activity.
    downloadsCount: 0, rating: 0, reviewsCount: 0,
    // Stagger createdAt so "Newest" sorts meaningfully instead of tying.
    createdAt: new Date(now - i * 3600_000).toISOString(),
    sellerId: seller.userId,
    sellerUsername: seller.username,
    sellerVerified: seller.verified,
    sellerBadges: seller.badges,
  });
  process.stdout.write('.');
}
console.log('');

for (let i = 0; i < skills.length; i += 20) {
  const r = await post('/admin/seed', { skills: skills.slice(i, i + 20) });
  console.log(`  seeded skills ${i + 1}-${Math.min(i + 20, skills.length)} (${r.seeded} items)`);
}

await post('/admin/run-badges-job', {});

const byCat = {};
skills.forEach(s => { byCat[s.category] = (byCat[s.category] || 0) + 1; });
console.log(`\nDONE — ${skills.length} skills · ${users.length} sellers · ${skills.filter(s => s.featured).length} featured`);
console.log('by category:', JSON.stringify(byCat));
