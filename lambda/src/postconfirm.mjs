// Cognito PostConfirmation trigger: creates the DynamoDB profile.
// Native users: binds the pre-claimed username to the confirmed sub.
// Google users: derives a username from the email local part, suffixing
// until a claim succeeds (they never chose one — document in profile UI).
import { db } from './lib/db.mjs';

const sanitize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20) || 'builder';

export const handler = async (event) => {
  const attrs = event.request.userAttributes;
  const userId = attrs.sub;
  const email = attrs.email;
  let username = (attrs['custom:username'] || '').toLowerCase();

  if (username) {
    // Native flow: claim exists from PreSignUp — bind it to the real sub.
    await db.update({
      Key: { PK: `USERNAME#${username}`, SK: 'CLAIM' },
      UpdateExpression: 'SET userId = :u',
      ExpressionAttributeValues: { ':u': userId },
    });
  } else {
    // Federated flow: derive and claim with suffix retry.
    const base = sanitize(email?.split('@')[0]);
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? base : `${base}_${i}`;
      try {
        await db.put(
          { PK: `USERNAME#${candidate}`, SK: 'CLAIM', userId, email, claimedAt: new Date().toISOString() },
          { ConditionExpression: 'attribute_not_exists(PK)' },
        );
        username = candidate;
        break;
      } catch (err) {
        if (err.name !== 'ConditionalCheckFailedException') throw err;
      }
    }
    if (!username) username = `builder_${userId.slice(0, 8)}`;
  }

  await db.put(
    {
      PK: `USER#${userId}`, SK: 'PROFILE',
      userId, username, email,
      name: attrs.name || username,
      bio: '', location: '',
      isVerified: false, badges: [], salesCount: 0,
      createdAt: new Date().toISOString(),
    },
    { ConditionExpression: 'attribute_not_exists(PK)' },
  ).catch((err) => {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  });

  return event;
};
