// Authenticated routes: /me, /library, /verify, publish flow, reviews, buy/
// confirm/download. Identity comes exclusively from the Cognito authorizer.
import crypto from 'node:crypto';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import { db, TABLE, skillToApi, profileToApi } from './lib/db.mjs';
import { presignPut, presignGet, skillFileKey, screenshotKey, avatarKey } from './lib/s3.mjs';
import { ok, bad, forbidden, notFound, conflict, unavailable, parseBody, claims, route } from './lib/http.mjs';
import { paymentsConfigured, razorpayKeyId, createOrder, verifyCheckoutSignature } from './lib/razorpay.mjs';
import { recordPurchase, hasPurchase } from './lib/purchases.mjs';

const idp = new CognitoIdentityProviderClient({});
const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

const CATEGORIES = ["Coding","Design","Extension","Desktop","Document","Marketing","Website","Data","DevOps","AI/ML","Testing","Mobile","Other"];
const PLATFORMS = ["Claude","ChatGPT","Gemini","Cursor","Copilot"];

export const handler = route(async (event) => {
  const me = claims(event);
  if (!me) return forbidden('No identity in request'); // authorizer should prevent this

  const path = event.path.replace(/^\/(qa|prod)/, '');
  const parts = path.split('/').filter(Boolean);
  const method = event.httpMethod;

  if (method === 'GET' && parts[0] === 'me') return getMe(me);
  if (method === 'POST' && parts[0] === 'me' && !parts[1]) return updateProfile(me, parseBody(event));
  if (method === 'POST' && parts[0] === 'me' && parts[1] === 'avatar') return avatarUploadUrl(me, parseBody(event));
  if (method === 'POST' && parts[0] === 'me' && parts[1] === 'username') return changeUsername(me, parseBody(event));
  if (method === 'GET' && parts[0] === 'library') return getLibrary(me);
  if (method === 'POST' && parts[0] === 'verify') return applyVerification(me, parseBody(event));
  if (method === 'POST' && parts[0] === 'skills' && !parts[1]) return createSkill(me, parseBody(event));
  if (method === 'POST' && parts[0] === 'skills' && parts[2] === 'submit') return submitSkill(me, decodeURIComponent(parts[1]));
  if (method === 'POST' && parts[0] === 'skills' && parts[2] === 'reviews') return postReview(me, decodeURIComponent(parts[1]), parseBody(event));
  if (method === 'POST' && parts[0] === 'skills' && parts[2] === 'buy') return buySkill(me, decodeURIComponent(parts[1]));
  if (method === 'POST' && parts[0] === 'skills' && parts[2] === 'confirm') return confirmPurchase(me, decodeURIComponent(parts[1]), parseBody(event));
  if (method === 'POST' && parts[0] === 'skills' && parts[2] === 'download') return downloadSkill(me, decodeURIComponent(parts[1]));
  return notFound();
});

async function ensureProfile(me) {
  let profile = await db.get({ PK: `USER#${me.userId}`, SK: 'PROFILE' });
  if (profile) return profile;
  // Safety net for users whose PostConfirmation trigger didn't run (it does
  // not fire for every federated flow). If WE invent the handle rather than
  // the user choosing it, mark it auto-derived so they get their one change —
  // otherwise a Google user is stuck with an email-derived handle forever.
  const derived = !me.username;
  const username = me.username || `user_${me.userId.slice(0, 8)}`;
  profile = {
    PK: `USER#${me.userId}`, SK: 'PROFILE',
    userId: me.userId, username, email: me.email, name: me.name || username,
    bio: '', location: '', isVerified: false, badges: [], salesCount: 0,
    usernameAutoDerived: derived,
    createdAt: new Date().toISOString(),
  };
  await db.put(profile, { ConditionExpression: 'attribute_not_exists(PK)' }).catch(() => {});
  await db.put({ PK: `USERNAME#${username}`, SK: 'CLAIM', userId: me.userId, email: me.email },
    { ConditionExpression: 'attribute_not_exists(PK)' }).catch(() => {});
  return profile;
}

async function getMe(me) {
  const profile = await ensureProfile(me);
  const skills = await db.queryAll({
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :pk',
    ExpressionAttributeValues: { ':pk': `SELLER#${me.userId}` },
    ScanIndexForward: false,
  });
  const avatarUrl = profile.avatarKey ? await presignGet(profile.avatarKey, 3600) : null;
  return ok({ profile: profileToApi(profile, avatarUrl), skills: skills.map(s => skillToApi(s, profile, { list: true })) });
}

/* Display name, bio and location are editable. Username is NOT — it is the
   permanent public handle and its uniqueness claim is keyed on it. */
async function updateProfile(me, body) {
  if (!body) return bad('Invalid request body');
  const name = (body.name || '').trim();
  if (!name || name.length > 60) return bad('Name is required (max 60 characters)');
  const bio = (body.bio || '').trim().slice(0, 400);
  const location = (body.location || '').trim().slice(0, 80);
  await ensureProfile(me);
  await db.update({
    Key: { PK: `USER#${me.userId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET #n = :n, bio = :b, #l = :l',
    ExpressionAttributeNames: { '#n': 'name', '#l': 'location' },
    ExpressionAttributeValues: { ':n': name, ':b': bio, ':l': location },
  });
  return ok({ updated: true });
}

/* Usernames are permanent — EXCEPT one: a handle we derived for a federated
   user who never got to choose. usernameAutoDerived marks those, and this
   spends that one change. The claim move is a single transaction so the new
   handle can never be half-taken, and the old one is released in the same
   write so it doesn't leak. */
async function changeUsername(me, body) {
  const next = (body?.username || '').toLowerCase().trim();
  if (!USERNAME_RE.test(next)) return bad('Username must be 3-24 characters: lowercase letters, numbers, underscores.');
  const profile = await ensureProfile(me);
  if (next === profile.username) return ok({ username: next, unchanged: true });
  if (!profile.usernameAutoDerived) {
    return forbidden('Your username is permanent. Only an auto-assigned handle can be changed, and only once.');
  }
  const now = new Date().toISOString();
  try {
    await db.transact([
      { Put: {
        TableName: TABLE,
        Item: { PK: `USERNAME#${next}`, SK: 'CLAIM', userId: me.userId, email: profile.email, claimedAt: now },
        ConditionExpression: 'attribute_not_exists(PK)',
      } },
      { Delete: { TableName: TABLE, Key: { PK: `USERNAME#${profile.username}`, SK: 'CLAIM' } } },
      { Update: {
        TableName: TABLE,
        Key: { PK: `USER#${me.userId}`, SK: 'PROFILE' },
        UpdateExpression: 'SET username = :u, usernameAutoDerived = :f',
        ExpressionAttributeValues: { ':u': next, ':f': false },
      } },
    ]);
  } catch (err) {
    if (err.name === 'TransactionCanceledException') return conflict('That username is already taken.');
    throw err;
  }

  // Denormalised onto every skill this user sells — refresh so listings don't
  // keep pointing at a handle whose profile URL no longer resolves.
  const mine = await db.queryAll({
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :pk',
    ExpressionAttributeValues: { ':pk': `SELLER#${me.userId}` },
  });
  for (const s of mine) {
    await db.update({
      Key: { PK: `SKILL#${s.skillId}`, SK: 'META' },
      UpdateExpression: 'SET sellerUsername = :u',
      ExpressionAttributeValues: { ':u': next },
    });
  }

  // Push it onto the Cognito user so future ID tokens carry the new handle.
  try {
    await idp.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: me.poolId, Username: me.cognitoUsername,
      UserAttributes: [{ Name: 'custom:username', Value: next }],
    }));
  } catch (err) {
    console.error(JSON.stringify({ setUsernameAttrFailed: err.message, userId: me.userId }));
  }
  return ok({ username: next, skillsUpdated: mine.length });
}

/* Presigned PUT for the profile photo; the key is deterministic per user so a
   re-upload replaces the old object instead of orphaning it. */
async function avatarUploadUrl(me, body) {
  const type = body?.contentType || 'image/png';
  if (!/^image\/(png|jpeg|webp)$/.test(type)) return bad('Photo must be a PNG, JPG or WebP');
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const key = avatarKey(me.userId, ext);
  await ensureProfile(me);
  await db.update({
    Key: { PK: `USER#${me.userId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET avatarKey = :k',
    ExpressionAttributeValues: { ':k': key },
  });
  return ok({ uploadUrl: await presignPut(key, type), key });
}

async function getLibrary(me) {
  const purchases = await db.queryAll({
    IndexName: 'GSI3',
    KeyConditionExpression: 'GSI3PK = :pk',
    ExpressionAttributeValues: { ':pk': `BUYER#${me.userId}` },
    ScanIndexForward: false,
  });
  const skills = [];
  for (const p of purchases) {
    const s = await db.get({ PK: `SKILL#${p.skillId}`, SK: 'META' });
    if (s) skills.push(skillToApi(s, null, { list: true }));
  }
  return ok({ skills });
}

async function applyVerification(me, body) {
  if (!body || !body.skillUrl?.trim()) return bad('skillUrl is required');
  const profile = await ensureProfile(me);
  const applicationId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.put({
    PK: `VERIFY#${applicationId}`, SK: 'META',
    applicationId, userId: me.userId, username: profile.username,
    skillUrl: body.skillUrl.trim(), note: (body.note || '').trim(),
    status: 'pending', submittedAt: now,
    GSI4PK: 'VERIFY#pending', GSI4SK: now,
  });
  return ok({ applicationId, status: 'submitted' });
}

async function createSkill(me, body) {
  if (!body) return bad('Invalid request body');
  const errors = validateSkill(body);
  if (errors) return bad(errors);

  const profile = await ensureProfile(me);
  const skillId = crypto.randomUUID();
  const now = new Date().toISOString();
  const ext = body.screenshotContentType === 'image/png' ? 'png' : 'jpg';
  const fileKey = skillFileKey(skillId);
  const ssKey = screenshotKey(skillId, ext);

  await db.put({
    PK: `SKILL#${skillId}`, SK: 'META',
    skillId,
    title: body.title.trim(),
    category: body.category,
    description: body.description.trim(),
    usageInstructions: body.usageInstructions.trim(),
    platforms: body.platforms,
    priceCents: body.priceCents,
    timeSavedHours: body.timeSavedHours,
    pocUrl: body.pocUrl.trim(),
    skillFileKey: fileKey,
    pocScreenshotKey: ssKey,
    status: 'draft', // becomes pending on /submit after uploads complete
    featured: false,
    downloadsCount: 0, rating: 0, reviewsCount: 0,
    createdAt: now,
    sellerId: me.userId,
    sellerUsername: profile.username,
    GSI1PK: `CAT#${body.category}`, GSI1SK: 0,
    GSI2PK: `SELLER#${me.userId}`, GSI2SK: now,
    GSI4PK: 'SKILL#draft', GSI4SK: now,
  });

  return ok({
    skillId,
    skillFileUploadUrl: await presignPut(fileKey, 'text/markdown'),
    screenshotUploadUrl: await presignPut(ssKey, body.screenshotContentType || 'image/png'),
  });
}

function validateSkill(b) {
  if (!b.title?.trim()) return 'Title is required';
  if (!CATEGORIES.includes(b.category)) return 'Invalid category';
  if (!b.description?.trim()) return 'Description is required';
  if (!b.usageInstructions?.trim()) return 'Usage instructions are required';
  if (!Array.isArray(b.platforms) || b.platforms.length === 0 || !b.platforms.every(p => PLATFORMS.includes(p))) return 'Select at least one valid platform';
  if (!Number.isInteger(b.priceCents) || b.priceCents < 0 || (b.priceCents > 0 && b.priceCents < 100) || b.priceCents > 100000) return 'Price must be $0 (free) or $1-$1000';
  if (!(Number(b.timeSavedHours) > 0)) return 'Estimated time saved is required';
  if (!/^https?:\/\/.+\..+/.test(b.pocUrl || '')) return 'Proof-of-concept URL is required and enforced';
  return null;
}

async function submitSkill(me, skillId) {
  const skill = await db.get({ PK: `SKILL#${skillId}`, SK: 'META' });
  if (!skill) return notFound('Skill not found');
  if (skill.sellerId !== me.userId) return forbidden('Not your skill');
  if (skill.status !== 'draft') return ok({ skillId, status: skill.status });
  const now = new Date().toISOString();
  await db.update({
    Key: { PK: `SKILL#${skillId}`, SK: 'META' },
    UpdateExpression: 'SET #s = :pending, GSI4PK = :gpk, GSI4SK = :now',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':pending': 'pending', ':gpk': 'SKILL#pending', ':now': now },
  });
  return ok({ skillId, status: 'pending' });
}

async function postReview(me, skillId, body) {
  if (!body || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) return bad('Rating must be 1-5');
  const skill = await db.get({ PK: `SKILL#${skillId}`, SK: 'META' });
  if (!skill || skill.status !== 'approved') return notFound('Skill not found');
  if (skill.sellerId === me.userId) return forbidden("You can't review your own skill");
  const purchase = await hasPurchase(skillId, me.userId);
  if (!purchase) return forbidden('Buy or download this skill before reviewing it');

  const profile = await ensureProfile(me);
  const now = new Date().toISOString();
  // One review per buyer: reviewId is the buyer's id.
  try {
    await db.put({
      PK: `SKILL#${skillId}`, SK: `REVIEW#${me.userId}`,
      reviewId: me.userId, skillId,
      buyerId: me.userId, buyerUsername: profile.username,
      rating: body.rating, text: (body.text || '').trim().slice(0, 2000),
      createdAt: now,
    }, { ConditionExpression: 'attribute_not_exists(PK) OR attribute_not_exists(SK)' });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return conflict('You already reviewed this skill');
    throw err;
  }

  // Recompute aggregate rating.
  const newCount = (skill.reviewsCount || 0) + 1;
  const newRating = Math.round((((skill.rating || 0) * (skill.reviewsCount || 0)) + body.rating) / newCount * 10) / 10;
  await db.update({
    Key: { PK: `SKILL#${skillId}`, SK: 'META' },
    UpdateExpression: 'SET rating = :r, reviewsCount = :c',
    ExpressionAttributeValues: { ':r': newRating, ':c': newCount },
  });
  return ok({ reviewId: me.userId, rating: body.rating });
}

async function buySkill(me, skillId) {
  const skill = await db.get({ PK: `SKILL#${skillId}`, SK: 'META' });
  if (!skill || skill.status !== 'approved') return notFound('Skill not found');
  if (skill.priceCents === 0) return bad('This skill is free — use download');
  if (skill.sellerId === me.userId) return bad("You can't buy your own skill");
  if (await hasPurchase(skillId, me.userId)) return ok({ alreadyOwned: true });
  if (!paymentsConfigured()) return unavailable('Payments are not enabled yet. Check back soon.');

  const order = await createOrder({
    amountCents: skill.priceCents,
    currency: 'USD',
    receipt: `${skillId.slice(0, 24)}-${me.userId.slice(0, 12)}`,
    notes: { skillId, buyerId: me.userId },
  });
  return ok({
    razorpayOrderId: order.id,
    razorpayKeyId: razorpayKeyId(),
    amountCents: skill.priceCents,
    currency: 'USD',
  });
}

async function confirmPurchase(me, skillId, body) {
  if (!body?.razorpayOrderId || !body?.razorpayPaymentId || !body?.razorpaySignature) return bad('Missing payment confirmation fields');
  const skill = await db.get({ PK: `SKILL#${skillId}`, SK: 'META' });
  if (!skill) return notFound('Skill not found');
  const valid = verifyCheckoutSignature({
    orderId: body.razorpayOrderId,
    paymentId: body.razorpayPaymentId,
    signature: body.razorpaySignature,
  });
  if (!valid) {
    console.error(JSON.stringify({ invalidCheckoutSignature: { skillId, buyerId: me.userId, orderId: body.razorpayOrderId } }));
    return forbidden('Payment signature verification failed');
  }
  const profile = await ensureProfile(me);
  await recordPurchase({
    skillId, buyerId: me.userId, buyerUsername: profile.username,
    sellerId: skill.sellerId, amountCents: skill.priceCents,
    provider: 'razorpay', providerPaymentId: body.razorpayPaymentId,
  });
  return ok({ status: 'paid' });
}

async function downloadSkill(me, skillId) {
  const skill = await db.get({ PK: `SKILL#${skillId}`, SK: 'META' });
  if (!skill || skill.status !== 'approved') return notFound('Skill not found');
  const owned = await hasPurchase(skillId, me.userId);
  if (skill.priceCents > 0 && !owned && skill.sellerId !== me.userId) {
    return forbidden('Buy this skill to download it');
  }
  if (skill.priceCents === 0 && !owned && skill.sellerId !== me.userId) {
    const profile = await ensureProfile(me);
    await recordPurchase({
      skillId, buyerId: me.userId, buyerUsername: profile.username,
      sellerId: skill.sellerId, amountCents: 0, provider: 'free',
    });
  }
  return ok({ url: await presignGet(skill.skillFileKey, 300) });
}
