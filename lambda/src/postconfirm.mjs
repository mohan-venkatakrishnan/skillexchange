// Cognito PostConfirmation trigger: creates the DynamoDB profile.
// Native users: binds the pre-claimed username to the confirmed sub.
// Google users: derives a username from their name/email, suffixing until a
// claim succeeds — they never chose one.
//
// The derived username is written BACK to the Cognito user as custom:username.
// Without that write, a federated user's ID token carries only
// cognito:username, which Cognito sets to "Google_<sub>" — that is what put
// the ugly "google_…" handle in the nav.
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import { db } from './lib/db.mjs';

const idp = new CognitoIdentityProviderClient({});

const sanitize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 20);

export const handler = async (event) => {
  const attrs = event.request.userAttributes;
  const userId = attrs.sub;
  const email = attrs.email;
  const displayName = attrs.name || attrs.given_name || '';
  let username = (attrs['custom:username'] || '').toLowerCase();
  let derived = false;

  if (username) {
    // Native flow: claim exists from PreSignUp — bind it to the real sub.
    await db.update({
      Key: { PK: `USERNAME#${username}`, SK: 'CLAIM' },
      UpdateExpression: 'SET userId = :u',
      ExpressionAttributeValues: { ':u': userId },
    });
  } else {
    // Federated flow: prefer their real name, fall back to the email local part.
    const base = sanitize(displayName.replace(/\s+/g, '_')) || sanitize(email?.split('@')[0]) || 'builder';
    for (let i = 0; i < 50; i++) {
      const candidate = (i === 0 ? base : `${base}_${i}`).slice(0, 24);
      if (candidate.length < 3) continue;
      try {
        await db.put(
          { PK: `USERNAME#${candidate}`, SK: 'CLAIM', userId, email, claimedAt: new Date().toISOString() },
          { ConditionExpression: 'attribute_not_exists(PK)' },
        );
        username = candidate;
        derived = true;
        break;
      } catch (err) {
        if (err.name !== 'ConditionalCheckFailedException') throw err;
      }
    }
    if (!username) { username = `builder_${userId.slice(0, 8)}`; derived = true; }
  }

  await db.put(
    {
      PK: `USER#${userId}`, SK: 'PROFILE',
      userId, username, email,
      name: displayName || username,
      bio: '', location: '', avatarKey: null,
      isVerified: false, badges: [], salesCount: 0,
      usernameAutoDerived: derived, // profile can prompt them to pick a real one
      createdAt: new Date().toISOString(),
    },
    { ConditionExpression: 'attribute_not_exists(PK)' },
  ).catch((err) => {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  });

  // Push the handle onto the Cognito user so every future ID token carries it.
  if (derived) {
    try {
      await idp.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: event.userPoolId,
        Username: event.userName,
        UserAttributes: [{ Name: 'custom:username', Value: username }],
      }));
    } catch (err) {
      // Non-fatal: /me resolves the username from DynamoDB regardless.
      console.error(JSON.stringify({ setUsernameAttrFailed: err.message, userId }));
    }
  }

  return event;
};
