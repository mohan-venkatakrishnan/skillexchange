// Public, unauthenticated reads: marketplace, skill detail, reviews, profiles,
// leaderboard, stats, username availability.
import { db, skillToApi, profileToApi, getProfileByUsername } from './lib/db.mjs';
import { presignGet, screenshotKey } from './lib/s3.mjs';
import { ok, bad, notFound, route } from './lib/http.mjs';

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export const handler = route(async (event) => {
  const path = event.path.replace(/^\/(qa|prod)/, '');
  const parts = path.split('/').filter(Boolean);

  if (parts[0] === 'stats') return getStats();
  if (parts[0] === 'skills' && !parts[1]) return listSkills();
  if (parts[0] === 'skills' && parts[2] === 'reviews') return listReviews(decodeURIComponent(parts[1]));
  if (parts[0] === 'skills' && parts[1]) return getSkill(decodeURIComponent(parts[1]));
  if (parts[0] === 'profiles' && parts[1]) return getPublicProfile(decodeURIComponent(parts[1]).toLowerCase());
  if (parts[0] === 'leaderboard') return getLeaderboard();
  if (parts[0] === 'username-check') return usernameCheck((event.queryStringParameters?.u || '').toLowerCase());
  return notFound();
});

async function getStats() {
  const item = await db.get({ PK: 'STATS', SK: 'GLOBAL' });
  return ok(item?.stats || { skills: '0', downloads: '0', builders: '0', avgRating: '—' });
}

async function listSkills() {
  const items = await db.queryAll({
    IndexName: 'GSI4',
    KeyConditionExpression: 'GSI4PK = :pk',
    ExpressionAttributeValues: { ':pk': 'SKILL#approved' },
    ScanIndexForward: false,
  });
  // No presigning here — see skillToApi's `list` note.
  return ok({ skills: items.map(s => skillToApi(s, null, { list: true })) });
}

async function getSkill(skillId) {
  const item = await db.get({ PK: `SKILL#${skillId}`, SK: 'META' });
  if (!item || item.status !== 'approved') return notFound('Skill not found');
  return ok(skillToApi(await withScreenshotUrl(item)));
}

async function withScreenshotUrl(item) {
  if (!item.pocScreenshotKey) return item;
  return { ...item, pocScreenshotUrl: await presignGet(item.pocScreenshotKey, 3600) };
}

async function listReviews(skillId) {
  const items = await db.queryAll({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `SKILL#${skillId}`, ':sk': 'REVIEW#' },
  });
  return ok({
    reviews: items
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map(r => ({ reviewId: r.reviewId, user: r.buyerUsername, rating: r.rating, text: r.text, createdAt: r.createdAt })),
  });
}

async function getPublicProfile(username) {
  const profile = await getProfileByUsername(username);
  if (!profile) return notFound('Profile not found');
  const skills = await db.queryAll({
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :pk',
    ExpressionAttributeValues: { ':pk': `SELLER#${profile.userId}` },
    ScanIndexForward: false,
  });
  const approved = skills.filter(s => s.status === 'approved');
  const avatarUrl = profile.avatarKey ? await presignGet(profile.avatarKey, 3600) : null;
  return ok({
    profile: profileToApi(profile, avatarUrl),
    skills: approved.map(s => skillToApi(s, profile, { list: true })),
  });
}

async function getLeaderboard() {
  const [builders, skills] = await Promise.all([
    db.get({ PK: 'LEADERBOARD', SK: 'BUILDERS' }),
    db.get({ PK: 'LEADERBOARD', SK: 'SKILLS' }),
  ]);
  return ok({ builders: builders?.entries || [], skills: skills?.entries || [] });
}

async function usernameCheck(u) {
  if (!USERNAME_RE.test(u)) return bad('Username must be 3-24 chars: a-z, 0-9, _');
  const claim = await db.get({ PK: `USERNAME#${u}`, SK: 'CLAIM' });
  if (!claim) return ok({ available: true, suggestions: [] });
  return ok({ available: false, suggestions: await suggestUsernames(u) });
}

/* When a handle is taken, offer three free ones built off the same prefix
   rather than making the visitor guess. Candidates are probed in one batch and
   the first three free ones win, so the list is stable and cheap. */
async function suggestUsernames(base) {
  const stem = base.slice(0, 20).replace(/_+$/, '');
  const candidates = [
    `${stem}_dev`, `${stem}_ai`, `${stem}_hq`, `${stem}_io`,
    `${stem}1`, `${stem}_builds`, `${stem}_labs`, `the_${stem}`,
    `${stem}${new Date().getUTCFullYear() % 100}`, `${stem}_x`,
  ].filter(c => USERNAME_RE.test(c));

  const free = [];
  for (const c of candidates) {
    if (free.length === 3) break;
    // eslint-disable-next-line no-await-in-loop
    const taken = await db.get({ PK: `USERNAME#${c}`, SK: 'CLAIM' });
    if (!taken) free.push(c);
  }
  return free;
}
