// Generate public/sitemap.xml: the static routes Google should consider for
// sitelinks, PLUS every live skill and seller page pulled from the prod API so
// each gets crawled and can earn its own snippet.
//
// Run before a deploy (the deploy script calls it). Falls back to just the
// static routes if the API is unreachable, so a build never fails on this.
//
// Usage: node scripts/gen-sitemap.mjs [api-url]
import { writeFileSync } from 'node:fs';

const ORIGIN = 'https://skillexchange.tapdot.org';
const API = process.argv[2] || 'https://cgruec1sv4.execute-api.us-east-1.amazonaws.com/prod';

// priority/changefreq are hints; the marketplace and home are the front doors.
const STATIC = [
  { loc: '/', priority: '1.0', changefreq: 'daily' },
  { loc: '/marketplace', priority: '0.9', changefreq: 'daily' },
  { loc: '/create', priority: '0.7', changefreq: 'monthly' },
  { loc: '/publish', priority: '0.7', changefreq: 'monthly' },
  { loc: '/leaderboard', priority: '0.6', changefreq: 'daily' },
  { loc: '/verify', priority: '0.5', changefreq: 'monthly' },
];

const urls = [...STATIC];

try {
  const res = await fetch(`${API}/skills`, { signal: AbortSignal.timeout(20_000) });
  const { skills = [] } = await res.json();
  const sellers = new Set();
  for (const s of skills) {
    urls.push({ loc: `/skills/${s.skillId}`, priority: '0.8', changefreq: 'weekly', lastmod: s.createdAt?.slice(0, 10) });
    if (s.sellerUsername) sellers.add(s.sellerUsername);
  }
  for (const u of sellers) urls.push({ loc: `/u/${u}`, priority: '0.5', changefreq: 'weekly' });
  console.log(`sitemap: ${STATIC.length} static + ${skills.length} skills + ${sellers.size} sellers`);
} catch (e) {
  console.warn(`sitemap: API unreachable (${e.message}) — static routes only`);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const body = urls.map(u => [
  '  <url>',
  `    <loc>${esc(ORIGIN + u.loc)}</loc>`,
  u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : '',
  `    <changefreq>${u.changefreq}</changefreq>`,
  `    <priority>${u.priority}</priority>`,
  '  </url>',
].filter(Boolean).join('\n')).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

writeFileSync('public/sitemap.xml', xml);
console.log(`wrote public/sitemap.xml (${urls.length} urls)`);
