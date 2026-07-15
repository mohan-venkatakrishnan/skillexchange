// Seed PRODUCTION with real skills: parses seed-content/*.skill.md
// (frontmatter + body), uploads each SKILL.md + its real POC screenshot to
// the prod S3 bucket, then creates seller profiles + skill records via the
// superadmin API. Honest marketplace: zero downloads, zero reviews — signals
// accrue for real. Usage: node scripts/seed-prod.mjs <prod-api-url>
import { readFileSync, readdirSync } from 'node:fs';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const API = process.argv[2];
if (!API) { console.error('usage: node scripts/seed-prod.mjs <prod-api-url>'); process.exit(1); }

const env = Object.fromEntries(readFileSync(new URL('../input.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));

const BUCKET = 'skillexchange-prod-535079144881';
const s3 = new S3Client({
  region: 'us-east-1',
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
});

const HEADERS = {
  'Content-Type': 'application/json',
  'X-Superadmin-Username': env.SUPERADMIN_USERNAME,
  'X-Superadmin-Password': env.SUPERADMIN_PASSWORD,
};

// Seed seller personas. 'mohan' is intentionally NOT used — the founder
// claims that username with a real Cognito account.
const USERS = {
  tapdot_labs:     { name: 'Tapdot Labs', bio: 'Skills distilled from shipped tapdot products — launch pages, tools, and desktop apps.', location: 'Mumbai, India', verified: true },
  webcraft_dev:    { name: 'WebCraft Dev', bio: 'End-to-end web app skills from real production SaaS builds on AWS.', location: 'Mumbai, India', verified: true },
  extension_forge: { name: 'Extension Forge', bio: 'Chrome extension patterns from shipped MV3 products, including on-device AI.', location: 'Remote', verified: true },
  pipeline_pro:    { name: 'Pipeline Pro', bio: 'Payments, webhooks, and backend workflow skills battle-tested in production.', location: 'Remote', verified: false },
  oss_distiller:   { name: 'OSS Distiller', bio: 'Original, opinionated guides for building products on popular open-source projects.', location: 'Remote', verified: false },
};

// filename → seller + screenshot mapping
const ASSIGN = {
  'end-to-end-saas-webapp.skill.md':      { user: 'webcraft_dev',    shot: 'launch.tapdot.org.png', featured: true },
  'node-graph-ui.skill.md':               { user: 'webcraft_dev',    shot: 'launch.tapdot.org.png' },
  'playwright-regression-suite.skill.md': { user: 'webcraft_dev',    shot: 'launch.tapdot.org.png' },
  'payment-webhook-integration.skill.md': { user: 'pipeline_pro',    shot: 'peerreview.tapdot.org.png', featured: true },
  'two-sided-matching-engine.skill.md':   { user: 'pipeline_pro',    shot: 'peerreview.tapdot.org.png' },
  'chrome-extension-mv3-basics.skill.md': { user: 'extension_forge', shot: 'tapdot.org.png', featured: true },
  'ondevice-ai-extension.skill.md':       { user: 'extension_forge', shot: 'tapdot.org.png', featured: true },
  'writing-tools-extension.skill.md':     { user: 'extension_forge', shot: 'tapdot.org.png' },
  'pdf-generation.skill.md':              { user: 'tapdot_labs',     shot: 'tools.tapdot.org.png', featured: true },
  'electron-desktop-app.skill.md':        { user: 'tapdot_labs',     shot: 'tools.tapdot.org.png' },
  'client-side-tools-site.skill.md':      { user: 'tapdot_labs',     shot: 'tools.tapdot.org.png' },
  'calculator-tools.skill.md':            { user: 'tapdot_labs',     shot: 'tools.tapdot.org.png' },
  'supabase-saas-backend.skill.md':       { user: 'oss_distiller',   shot: 'github.com-supabase-supabase.png' },
  'shadcn-ui-design-system.skill.md':     { user: 'oss_distiller',   shot: 'github.com-shadcn-ui-ui.png' },
  'playwright-e2e-testing.skill.md':      { user: 'oss_distiller',   shot: 'github.com-microsoft-playwright.png' },
  'fastapi-production-backend.skill.md':  { user: 'oss_distiller',   shot: 'github.com-fastapi-fastapi.png' },
  'node-red-workflow-automation.skill.md': { user: 'oss_distiller',  shot: 'github.com-node-red-node-red.png' },
};

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('no frontmatter');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.startsWith('[')) v = v.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
    meta[k] = v;
  }
  return { meta, body: m[2] };
}

async function post(path, body) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// 1. Users
const users = Object.entries(USERS).map(([username, u], i) => ({
  userId: `tapdot-seed-${username}`,
  username, name: u.name, bio: u.bio, location: u.location,
  verified: u.verified, badges: u.verified ? ['Verified Creator'] : [],
  salesCount: 0,
  createdAt: new Date(Date.now() - (60 - i * 3) * 86400_000).toISOString(),
}));
await post('/admin/seed', { users });
console.log(`seeded ${users.length} sellers`);

// 2. Skills: upload files to S3, then seed records
const dir = new URL('../seed-content/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.skill.md'));
console.log(`found ${files.length} skill files`);
const skills = [];
for (const file of files) {
  const assign = ASSIGN[file];
  if (!assign) { console.warn(`SKIP ${file} — no assignment`); continue; }
  const { meta, body } = parseFrontmatter(readFileSync(new URL(file, dir), 'utf8'));
  const skillId = `tapdot-${file.replace('.skill.md', '')}`;
  const fileKey = `skills/${skillId}/SKILL.md`;
  const shotKey = `screenshots/${skillId}.png`;

  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: fileKey, Body: body, ContentType: 'text/markdown' }));
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: shotKey,
    Body: readFileSync(new URL(`shots/${assign.shot}`, dir)), ContentType: 'image/png',
  }));

  const seller = users.find(u => u.username === assign.user);
  skills.push({
    skillId,
    title: meta.title,
    category: meta.category,
    description: meta.description,
    usageInstructions: meta.usage,
    platforms: Array.isArray(meta.platforms) ? meta.platforms : [meta.platforms],
    priceCents: Math.round(Number(meta.priceUsd) * 100),
    timeSavedHours: Number(meta.timeSavedHours),
    pocUrl: meta.pocUrl,
    skillFileKey: fileKey,
    pocScreenshotKey: shotKey,
    status: 'approved',
    featured: !!assign.featured,
    downloadsCount: 0, rating: 0, reviewsCount: 0, // honest zero-start
    createdAt: new Date(Date.now() - Math.floor(Math.random() * 0) ).toISOString(),
    sellerId: seller.userId,
    sellerUsername: seller.username,
    sellerVerified: seller.verified,
    sellerBadges: seller.badges,
  });
  console.log(`uploaded + staged: ${meta.title} ($${meta.priceUsd}, ${meta.category}) by ${assign.user}`);
}

await post('/admin/seed', { skills });
console.log(`seeded ${skills.length} skills`);
await post('/admin/run-badges-job', {});
console.log('badges/stats job run. PROD SEEDED.');
