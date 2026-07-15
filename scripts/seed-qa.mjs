// Populate QA with dummy users/skills/reviews via the superadmin endpoint.
// Usage: node scripts/seed-qa.mjs <api-url>   (creds read from input.env)
import { readFileSync } from 'node:fs';

const API = process.argv[2];
if (!API) { console.error('usage: node scripts/seed-qa.mjs <api-url>'); process.exit(1); }

const env = Object.fromEntries(
  readFileSync(new URL('../input.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

const HEADERS = {
  'Content-Type': 'application/json',
  'X-Superadmin-Username': env.SUPERADMIN_USERNAME,
  'X-Superadmin-Password': env.SUPERADMIN_PASSWORD,
};

const CATEGORIES = ["Coding","Design","Extension","Desktop","Document","Marketing","Website","Data","DevOps","AI/ML","Testing","Mobile","Other"];
const PLATFORMS = ["Claude","ChatGPT","Gemini","Cursor","Copilot"];
const FIRST = ['dev','code','build','ship','pixel','stack','byte','cloud','async','query','logic','prompt','neural','vector','tensor','quantum','cyber','data','meta','hyper'];
const LAST = ['smith','forge','craft','works','labs','guru','ninja','wizard','master','hacker','builder','maker','mind','flow','core','base','shift','spark','pulse','wave'];
const SKILL_VERBS = ['Generation','Scaffolding','Automation','Migration','Optimization','Testing','Deployment','Refactoring','Integration','Analysis'];
const SKILL_NOUNS = { Coding:['API','Backend','Microservice','CLI Tool','GraphQL','REST API','Auth System','Database Schema'], Design:['Design System','UI Kit','Component Library','Landing Page','Dashboard','Icon Set'], Extension:['Chrome Extension','Firefox Add-on','Browser Tool','Sidepanel App'], Desktop:['Electron App','Desktop Tool','System Tray App','Auto-updater'], Document:['PDF','Report','Invoice','Resume','Ebook','Documentation'], Marketing:['Landing Copy','Email Campaign','SEO Content','Ad Copy','Product Launch'], Website:['Portfolio','Blog','E-commerce Site','SaaS Site','Docs Site'], Data:['ETL Pipeline','Data Viz','Scraper','Analytics','Dashboard'], DevOps:['CI/CD Pipeline','Docker Setup','Terraform Stack','Monitoring'], 'AI/ML':['RAG System','Fine-tuning','Prompt Chain','Agent Workflow','Embeddings'], Testing:['E2E Suite','Unit Tests','Regression Suite','Load Tests'], Mobile:['React Native App','PWA','Mobile UI','Push Notifications'], Other:['Workflow','Toolkit','Starter Kit','Boilerplate'] };
const REVIEW_TEXTS = [
  'Saved me a full day of setup. Worth every cent.',
  'Clear instructions, worked on the first try.',
  'Good skill, though I had to tweak it for my stack.',
  'The proof of concept convinced me — and it delivered.',
  'Solid patterns. My AI assistant followed them perfectly.',
  'Exactly what it says. Instant productivity boost.',
  'Decent, but could use more edge-case coverage.',
  'This is how skill files should be written.',
  'Bought it for one project, reused it on three.',
  'The anti-patterns section alone was worth the price.',
];

// Deterministic PRNG so reseeding produces stable data.
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const daysAgo = d => new Date(Date.now() - d * 86400_000).toISOString();

// ── Generate 40 sellers ──
const users = [];
const seen = new Set();
while (users.length < 40) {
  const username = `${pick(FIRST)}_${pick(LAST)}${users.length < 20 ? '' : '_' + users.length}`;
  if (seen.has(username)) continue;
  seen.add(username);
  const verified = rnd() < 0.35;
  users.push({
    userId: `seed-user-${users.length}`,
    username,
    name: username.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    bio: pick(['Indie hacker shipping AI-first tools.','Full-stack dev, AI workflows.','Design systems and prompts.','Automation nerd.','Building in public.']),
    location: pick(['Mumbai, India','Bangalore, India','Remote','Tokyo, Japan','Berlin, Germany','Austin, TX','London, UK','Singapore']),
    verified,
    badges: verified ? ['Verified Creator'] : [],
    salesCount: rnd() < 0.2 ? int(30, 120) : int(0, 25),
    createdAt: daysAgo(int(30, 300)),
  });
}

// ── Generate 220 skills across sellers/categories ──
const skills = [];
for (let i = 0; i < 220; i++) {
  const cat = pick(CATEGORIES);
  const seller = users[int(0, users.length - 1)];
  const title = `${pick(SKILL_NOUNS[cat])} ${pick(SKILL_VERBS)} Skill`;
  const downloads = rnd() < 0.15 ? int(150, 900) : int(0, 120);
  const reviewCount = Math.min(int(0, 12), downloads);
  const rating = reviewCount ? Math.round((3.2 + rnd() * 1.8) * 10) / 10 : 0;
  const nPlatforms = int(1, 3);
  const platforms = [...new Set(Array.from({ length: nPlatforms }, () => pick(PLATFORMS)))];
  const createdDays = int(0, 200);
  const reviews = Array.from({ length: reviewCount }, (_, r) => {
    const reviewer = users[int(0, users.length - 1)];
    return {
      buyerId: `seed-reviewer-${i}-${r}`,
      buyerUsername: reviewer.username,
      rating: Math.max(1, Math.min(5, Math.round(rating + (rnd() - 0.5) * 2))),
      text: pick(REVIEW_TEXTS),
      createdAt: daysAgo(int(0, createdDays)),
    };
  });
  skills.push({
    skillId: `seed-skill-${i}`,
    title, category: cat,
    description: `A battle-tested SKILL.md for ${title.toLowerCase().replace(' skill','')}. Covers setup, core patterns, anti-patterns, and a phased build plan your AI assistant can follow end to end.`,
    usageInstructions: 'Load the SKILL.md at the start of your AI session. Follow the phased plan inside; each phase lists its own verification step.',
    platforms,
    priceCents: rnd() < 0.3 ? 0 : int(1, 12) * 100,
    timeSavedHours: int(1, 20),
    pocUrl: pick(['https://tapdot.org','https://github.com/example/project','https://launch.tapdot.org','https://tools.tapdot.org']),
    status: rnd() < 0.92 ? 'approved' : 'pending', // some pending for the admin queue
    featured: rnd() < 0.06,
    downloadsCount: downloads,
    rating, reviewsCount: reviewCount,
    createdAt: daysAgo(createdDays),
    sellerId: seller.userId,
    sellerUsername: seller.username,
    sellerVerified: seller.verified,
    sellerBadges: seller.badges,
    reviews,
  });
}

// ── Push in chunks (payload limits), then trigger the badges job ──
async function post(path, body) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

console.log(`Seeding ${users.length} users + ${skills.length} skills to ${API}`);
await post('/admin/seed', { users });
for (let i = 0; i < skills.length; i += 25) {
  const r = await post('/admin/seed', { skills: skills.slice(i, i + 25) });
  console.log(`  skills ${i}-${i + 24}: ${r.seeded} items`);
}
console.log('Running badges job…');
await post('/admin/run-badges-job', {});
console.log('Done. Marketplace, leaderboard, and stats are populated.');
