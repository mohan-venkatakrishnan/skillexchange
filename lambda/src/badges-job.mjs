// Nightly (and on-demand) computation of skill badges, seller leaderboard,
// top-skills leaderboard, and global stats. Badges are always DERIVED — never
// user-editable (CLAUDE.md §3).
import { db } from './lib/db.mjs';
import { computeBadges, computeLeaderboards, computeStats } from './lib/badges.mjs';

export const handler = async () => {
  const skills = await db.queryAll({
    IndexName: 'GSI4',
    KeyConditionExpression: 'GSI4PK = :pk',
    ExpressionAttributeValues: { ':pk': 'SKILL#approved' },
  });

  // Load seller profiles once (for verified flags, badges, sales counts).
  const sellerIds = [...new Set(skills.map(s => s.sellerId).filter(Boolean))];
  const sellers = {};
  for (const id of sellerIds) {
    const p = await db.get({ PK: `USER#${id}`, SK: 'PROFILE' });
    if (p) sellers[id] = p;
  }

  const badgeBySkill = computeBadges(skills);
  const { builders, topSkills } = computeLeaderboards(skills, sellers);
  const stats = computeStats(skills, sellers);

  // Persist skill badges + refresh denormalized seller flags.
  for (const s of skills) {
    const seller = sellers[s.sellerId];
    const newBadge = badgeBySkill[s.skillId] || null;
    const newVerified = !!seller?.isVerified;
    const newSellerBadges = seller?.badges || [];
    const unchanged = (s.skillBadge || null) === newBadge
      && !!s.sellerVerified === newVerified
      && JSON.stringify(s.sellerBadges || []) === JSON.stringify(newSellerBadges);
    if (unchanged) continue;
    await db.update({
      Key: { PK: `SKILL#${s.skillId}`, SK: 'META' },
      UpdateExpression: 'SET skillBadge = :b, sellerVerified = :v, sellerBadges = :sb',
      ExpressionAttributeValues: { ':b': newBadge, ':v': newVerified, ':sb': newSellerBadges },
    });
  }

  const now = new Date().toISOString();
  await db.put({ PK: 'LEADERBOARD', SK: 'BUILDERS', entries: builders, computedAt: now });
  await db.put({ PK: 'LEADERBOARD', SK: 'SKILLS', entries: topSkills, computedAt: now });
  await db.put({ PK: 'STATS', SK: 'GLOBAL', stats, computedAt: now });

  console.log(JSON.stringify({ badgesJob: { skills: skills.length, builders: builders.length, computedAt: now } }));
  return { ok: true, skills: skills.length };
};
