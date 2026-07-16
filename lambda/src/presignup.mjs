// Cognito PreSignUp trigger.
// Native sign-ups: validates the requested custom:username and RESERVES it —
// the application-layer uniqueness Cognito can't provide.
// Federated (Google) sign-ups pass through; the handle is derived in
// PostConfirmation. QA auto-confirms so tests need no email round-trip.
import { db } from './lib/db.mjs';

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

/* A PreSignUp claim is a RESERVATION, not ownership: sign-up can still fail
   after this runs (a duplicate email throws UsernameExistsException), and the
   trigger gets no rollback hook. An unconditional claim therefore leaks the
   handle forever — that is how `mohan` ended up held by userId:null after one
   failed signup, and it let anyone burn any handle by starting signups that
   fail. So a reservation carries no userId, expires, and can be taken over
   once stale. PostConfirmation binds it (sets userId, clears the TTL) and only
   then is it permanent. */
const RESERVATION_MINUTES = 20;

export const handler = async (event) => {
  const isFederated = event.triggerSource === 'PreSignUp_ExternalProvider';

  if (!isFederated) {
    const username = (event.request.userAttributes['custom:username'] || '').toLowerCase();
    if (!USERNAME_RE.test(username)) {
      throw new Error('Username must be 3-24 characters: lowercase letters, numbers, underscores.');
    }
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - RESERVATION_MINUTES * 60_000).toISOString();
    try {
      await db.put(
        {
          PK: `USERNAME#${username}`, SK: 'CLAIM',
          userId: null, // bound by PostConfirmation; null == unclaimed reservation
          email: event.request.userAttributes.email,
          claimedAt: now.toISOString(),
          // Belt and braces: DynamoDB TTL reaps reservations that never bind.
          expiresAt: Math.floor(now.getTime() / 1000) + RESERVATION_MINUTES * 60,
        },
        {
          // Free, OR an expired reservation nobody ever completed.
          ConditionExpression:
            'attribute_not_exists(PK) OR (attribute_type(userId, :nullType) AND claimedAt < :cutoff)',
          ExpressionAttributeValues: { ':nullType': 'NULL', ':cutoff': staleCutoff },
        },
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
