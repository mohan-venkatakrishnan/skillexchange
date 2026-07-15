// Superadmin tool: static-credential gate (headers), founder-only.
// Approve/reject/flag skills, verification queue, badge grant/revoke,
// trigger the badges job on demand, and bulk-seed QA data.
import crypto from 'node:crypto';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { db, getProfileByUsername } from './lib/db.mjs';
import { ok, bad, unauthorized, notFound, parseBody, route } from './lib/http.mjs';

const lambda = new LambdaClient({});

function authorized(event) {
  const u = event.headers?.['x-superadmin-username'] || event.headers?.['X-Superadmin-Username'];
  const p = event.headers?.['x-superadmin-password'] || event.headers?.['X-Superadmin-Password'];
  const eu = process.env.SUPERADMIN_USERNAME, ep = process.env.SUPERADMIN_PASSWORD;
  if (!u || !p || !eu || !ep) return false;
  return timingSafeEq(u, eu) && timingSafeEq(p, ep);
}

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export const handler = route(async (event) => {
  if (!authorized(event)) return unauthorized('Invalid superadmin credentials');

  const path = event.path.replace(/^\/(qa|prod)/, '').replace(/^\/admin/, '');
  const parts = path.split('/').filter(Boolean);
  const method = event.httpMethod;

  if (method === 'POST' && parts[0] === 'login') return ok({ ok: true });
  if (method === 'GET' && parts[0] === 'queue') return getQueue();
  if (method === 'POST' && parts[0] === 'skills' && parts[2]) return moderateSkill(decodeURIComponent(parts[1]), parts[2]);
  if (method === 'POST' && parts[0] === 'verify' && parts[2]) return moderateVerification(decodeURIComponent(parts[1]), parts[2]);
  if (method === 'POST' && parts[0] === 'badges') return setBadge(parseBody(event));
  if (method === 'POST' && parts[0] === 'run-badges-job') return runBadgesJob();
  if (method === 'POST' && parts[0] === 'seed') return seed(parseBody(event));
  return notFound();
});

async function getQueue() {
  const [skills, applications] = await Promise.all([
    db.queryAll({
      IndexName: 'GSI4',
      KeyConditionExpression: 'GSI4PK = :pk',
      ExpressionAttributeValues: { ':pk': 'SKILL#pending' },
    }),
    db.queryAll({
      IndexName: 'GSI4',
      KeyConditionExpression: 'GSI4PK = :pk',
      ExpressionAttributeValues: { ':pk': 'VERIFY#pending' },
    }),
  ]);
  return ok({ skills, applications });
}

async function moderateSkill(skillId, action) {
  const map = { approve: 'approved', reject: 'rejected', flag: 'flagged' };
  const status = map[action];
  if (!status) return bad(`Unknown action: ${action}`);
  const skill = await db.get({ PK: `SKILL#${skillId}`, SK: 'META' });
  if (!skill) return notFound('Skill not found');
  await db.update({
    Key: { PK: `SKILL#${skillId}`, SK: 'META' },
    UpdateExpression: 'SET #s = :s, GSI4PK = :gpk, reviewedAt = :now',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': status, ':gpk': `SKILL#${status}`, ':now': new Date().toISOString() },
  });
  return ok({ skillId, status });
}

async function moderateVerification(applicationId, action) {
  const map = { approve: 'approved', reject: 'rejected' };
  const status = map[action];
  if (!status) return bad(`Unknown action: ${action}`);
  const app = await db.get({ PK: `VERIFY#${applicationId}`, SK: 'META' });
  if (!app) return notFound('Application not found');
  const now = new Date().toISOString();
  await db.update({
    Key: { PK: `VERIFY#${applicationId}`, SK: 'META' },
    UpdateExpression: 'SET #s = :s, GSI4PK = :gpk, reviewedAt = :now',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': status, ':gpk': `VERIFY#${status}`, ':now': now },
  });
  if (status === 'approved') {
    await grantBadge(app.userId, 'Verified Creator', true);
  }
  return ok({ applicationId, status });
}

async function setBadge(body) {
  if (!body?.username || !body?.badge || !['grant', 'revoke'].includes(body.action)) {
    return bad('Required: username, badge (Verified Creator|Top Seller), action (grant|revoke)');
  }
  const profile = await getProfileByUsername(body.username.toLowerCase());
  if (!profile) return notFound('User not found');
  await grantBadge(profile.userId, body.badge, body.action === 'grant');
  return ok({ username: body.username, badge: body.badge, action: body.action });
}

async function grantBadge(userId, badge, grant) {
  const profile = await db.get({ PK: `USER#${userId}`, SK: 'PROFILE' });
  if (!profile) return;
  const badges = new Set(profile.badges || []);
  if (grant) badges.add(badge); else badges.delete(badge);
  const isVerified = badge === 'Verified Creator' ? grant : !!profile.isVerified;
  await db.update({
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET badges = :b, isVerified = :v',
    ExpressionAttributeValues: { ':b': [...badges], ':v': isVerified },
  });
  // Denormalized seller flags on skills refresh on the nightly badges job.
}

async function runBadgesJob() {
  await lambda.send(new InvokeCommand({
    FunctionName: process.env.BADGES_JOB_FN,
    InvocationType: 'RequestResponse',
  }));
  return ok({ triggered: true });
}

// Bulk-seed QA with dummy users/skills/reviews. Items land pre-approved.
async function seed(body) {
  if (!body) return bad('Invalid body');
  const now = new Date().toISOString();
  const puts = [];

  for (const u of body.users || []) {
    const userId = u.userId || `seed-${crypto.randomUUID()}`;
    puts.push({
      PK: `USER#${userId}`, SK: 'PROFILE',
      userId, username: u.username.toLowerCase(), email: u.email || `${u.username}@seed.local`,
      name: u.name || u.username, bio: u.bio || '', location: u.location || '',
      isVerified: !!u.verified, badges: u.badges || [], salesCount: u.salesCount || 0,
      createdAt: u.createdAt || now,
    });
    puts.push({ PK: `USERNAME#${u.username.toLowerCase()}`, SK: 'CLAIM', userId, email: u.email || '' });
  }

  for (const s of body.skills || []) {
    const skillId = s.skillId || crypto.randomUUID();
    const created = s.createdAt || now;
    puts.push({
      PK: `SKILL#${skillId}`, SK: 'META',
      skillId, title: s.title, category: s.category, description: s.description || '',
      usageInstructions: s.usageInstructions || '', platforms: s.platforms || ['Claude'],
      priceCents: s.priceCents ?? 0, timeSavedHours: s.timeSavedHours ?? 1,
      pocUrl: s.pocUrl || 'https://example.com', skillFileKey: s.skillFileKey || null,
      pocScreenshotKey: s.pocScreenshotKey || null,
      status: s.status || 'approved', featured: !!s.featured,
      downloadsCount: s.downloadsCount || 0, rating: s.rating || 0, reviewsCount: s.reviewsCount || 0,
      createdAt: created, sellerId: s.sellerId, sellerUsername: s.sellerUsername,
      sellerVerified: !!s.sellerVerified, sellerBadges: s.sellerBadges || [],
      skillBadge: s.skillBadge || null,
      GSI1PK: `CAT#${s.category}`, GSI1SK: s.downloadsCount || 0,
      GSI2PK: `SELLER#${s.sellerId}`, GSI2SK: created,
      GSI4PK: `SKILL#${s.status || 'approved'}`, GSI4SK: created,
    });
    for (const r of s.reviews || []) {
      puts.push({
        PK: `SKILL#${skillId}`, SK: `REVIEW#${r.buyerId || crypto.randomUUID()}`,
        reviewId: r.buyerId, skillId, buyerId: r.buyerId, buyerUsername: r.buyerUsername,
        rating: r.rating, text: r.text || '', createdAt: r.createdAt || now,
      });
    }
  }

  await db.batchWrite(puts);
  return ok({ seeded: puts.length });
}
