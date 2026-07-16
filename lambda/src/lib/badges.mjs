// Pure badge/leaderboard/stats computation — unit-testable, no I/O.

const MIN_REVIEWS_FOR_TOP_RATED = 3;
const NEW_NOTABLE_DAYS = 14;
const NEW_NOTABLE_MIN_DOWNLOADS = 5;

// Badges are TRUTHFUL: each winner is computed independently; when a skill
// wins several, the higher-priority badge is shown and the lower one is
// DROPPED — never reassigned to a runner-up (a "Most Downloaded" badge on a
// skill that isn't the most downloaded would be a lie).
// Priority: #1 in Category > Top Rated > Most Downloaded > New & Notable.
export function computeBadges(skills, now = new Date()) {
  const out = {};

  // #1 in Category: most-downloaded approved skill per category (needs >0).
  const byCat = {};
  for (const s of skills) {
    if (!byCat[s.category] || (s.downloadsCount || 0) > (byCat[s.category].downloadsCount || 0)) {
      byCat[s.category] = s;
    }
  }
  for (const [cat, s] of Object.entries(byCat)) {
    if ((s.downloadsCount || 0) > 0) out[s.skillId] = `#1 in ${cat}`;
  }

  // Top Rated: the single best-rated skill with enough reviews.
  const rated = skills
    .filter(s => (s.reviewsCount || 0) >= MIN_REVIEWS_FOR_TOP_RATED)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviewsCount || 0) - (a.reviewsCount || 0));
  if (rated[0] && !out[rated[0].skillId]) out[rated[0].skillId] = 'Top Rated';

  // Most Downloaded: the single overall top-downloads skill.
  const downloaded = skills
    .filter(s => (s.downloadsCount || 0) > 0)
    .sort((a, b) => (b.downloadsCount || 0) - (a.downloadsCount || 0));
  if (downloaded[0] && !out[downloaded[0].skillId]) out[downloaded[0].skillId] = 'Most Downloaded';

  // New & Notable: the freshest recent skill with traction.
  const cutoff = new Date(now.getTime() - NEW_NOTABLE_DAYS * 24 * 3600 * 1000).toISOString();
  const fresh = skills
    .filter(s => s.createdAt >= cutoff && (s.downloadsCount || 0) >= NEW_NOTABLE_MIN_DOWNLOADS)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (fresh[0] && !out[fresh[0].skillId]) out[fresh[0].skillId] = 'New & Notable';

  return out;
}

const BUILDER_ICONS = ['Crown', 'Flame', 'Gem', 'Bolt'];

export function computeLeaderboards(skills, sellers) {
  // Builders ranked by paid sales, then total downloads as tiebreak.
  const bySeller = {};
  for (const s of skills) {
    if (!s.sellerId) continue;
    const agg = bySeller[s.sellerId] ||= { downloads: 0, ratings: [], reviews: 0, sellerId: s.sellerId };
    agg.downloads += s.downloadsCount || 0;
    if ((s.reviewsCount || 0) > 0) { agg.ratings.push(s.rating || 0); agg.reviews += s.reviewsCount; }
  }

  const builders = Object.values(bySeller)
    .map(agg => {
      const p = sellers[agg.sellerId] || {};
      return {
        name: p.username || 'unknown',
        avatarKey: p.avatarKey || null,
        sales: p.salesCount || 0,
        downloads: agg.downloads,
        // reviews travels with rating: the UI must be able to tell "unrated"
        // from "rated zero" — without the count it would stamp "New" on the
        // top seller, or show a rating nobody actually gave.
        reviews: agg.reviews,
        rating: agg.ratings.length ? round1(agg.ratings.reduce((a, b) => a + b, 0) / agg.ratings.length) : 0,
      };
    })
    .sort((a, b) => b.sales - a.sales || b.downloads - a.downloads)
    .slice(0, 10)
    .map((b, i) => ({ rank: i + 1, name: b.name, avatarKey: b.avatarKey, sales: b.sales, rating: b.rating, reviews: b.reviews, badge: BUILDER_ICONS[i] || null }));

  const topSkills = [...skills]
    .sort((a, b) => (b.downloadsCount || 0) - (a.downloadsCount || 0))
    .slice(0, 10)
    .map((s, i) => ({
      rank: i + 1, skillId: s.skillId, title: s.title, author: s.sellerUsername,
      category: s.category,
      downloads: s.downloadsCount || 0, rating: s.rating || 0, reviews: s.reviewsCount || 0,
      timeSaved: s.timeSavedHours,
    }));

  return { builders, topSkills };
}

export function computeStats(skills, sellers) {
  const downloads = skills.reduce((sum, s) => sum + (s.downloadsCount || 0), 0);
  const rated = skills.filter(s => (s.reviewsCount || 0) > 0);
  const avg = rated.length ? round1(rated.reduce((a, s) => a + (s.rating || 0), 0) / rated.length) : null;
  const categories = new Set(skills.map(s => s.category).filter(Boolean));
  const timed = skills.filter(s => Number(s.timeSavedHours) > 0);
  const avgSaved = timed.length ? Math.round(timed.reduce((a, s) => a + Number(s.timeSavedHours), 0) / timed.length) : null;
  // Every value is real or omitted — the home page filters out empties rather
  // than printing "0 downloads" to a first-time visitor. Headline counts are
  // rounded DOWN to a "+" figure (100 -> "90+"), which is both nicer to read
  // and never overstates: the real number is always at least what we claim.
  return {
    skills: floorPlus(skills.length),
    categories: floorPlus(categories.size),
    downloads: downloads ? fmt(downloads) : '0',
    builders: floorPlus(Object.keys(sellers).length),
    avgRating: avg ? `${avg}★` : '—',
    avgTimeSaved: avgSaved ? `~${avgSaved}h` : null,
  };
}

/* 100 -> "90+", 16 -> "15+", 13 -> "10+", 7 -> "5+", 3 -> "3".
   Rounds DOWN to a friendly step, and uses (n-1) so an exact boundary steps
   back: with 100 skills, "100+" would claim MORE than 100 — the "+" has to be
   earned. This way the real number is always strictly greater than the claim. */
export function floorPlus(n) {
  if (n < 5) return String(n);
  // Step stays at 5 right up to 100 — an earlier version widened it at 20,
  // which rendered 20 as "10+" and undersold the catalogue by half.
  const step = n < 100 ? 5 : n < 200 ? 10 : n < 1000 ? 50 : 100;
  const floored = Math.floor((n - 1) / step) * step;
  if (floored < step) return String(n); // too small for a meaningful "+"
  return `${floored.toLocaleString()}+`;
}

function round1(n) { return Math.round(n * 10) / 10; }

function fmt(n) {
  if (n >= 1000) return `${(Math.floor(n / 100) / 10).toLocaleString()}k+`;
  return String(n);
}
