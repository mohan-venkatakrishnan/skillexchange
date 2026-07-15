// Cognito PreSignUp trigger.
// Native sign-ups: validates + claims the requested custom:username via a
// conditional put — the application-layer uniqueness Cognito can't provide.
// Federated (Google) sign-ups pass through; username is derived in
// PostConfirmation. QA auto-confirms so tests need no email round-trip.
import { db } from './lib/db.mjs';

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export const handler = async (event) => {
  const isFederated = event.triggerSource === 'PreSignUp_ExternalProvider';

  if (!isFederated) {
    const username = (event.request.userAttributes['custom:username'] || '').toLowerCase();
    if (!USERNAME_RE.test(username)) {
      throw new Error('Username must be 3-24 characters: lowercase letters, numbers, underscores.');
    }
    try {
      await db.put(
        {
          PK: `USERNAME#${username}`, SK: 'CLAIM',
          userId: null, // filled with the Cognito sub at PostConfirmation
          email: event.request.userAttributes.email,
          claimedAt: new Date().toISOString(),
        },
        { ConditionExpression: 'attribute_not_exists(PK)' },
      );
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') {
        throw new Error('That username is already taken.');
      }
      throw err;
    }
  }

  if (process.env.AUTO_CONFIRM === 'true' || isFederated) {
    event.response.autoConfirmUser = true;
    if (event.request.userAttributes.email) event.response.autoVerifyEmail = true;
  }
  return event;
};
