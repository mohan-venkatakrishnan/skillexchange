import { describe, it, expect, vi, beforeEach } from 'vitest';

/* PreSignUp reserves a username BEFORE Cognito has finished accepting the
   signup, and the trigger has no rollback hook. A failed signup (duplicate
   email) therefore used to leave the handle claimed by userId:null forever —
   which is how `mohan` got squatted by a ghost, and which let anyone burn any
   handle by starting signups that fail. These pin the reservation semantics. */

const put = vi.fn();
vi.mock('../../lambda/src/lib/db.mjs', () => ({
  db: { put: (...a) => put(...a) },
  TABLE: 'T',
}));

const { handler } = await import('../../lambda/src/presignup.mjs');

const event = (username, over = {}) => ({
  triggerSource: 'PreSignUp_SignUp',
  request: { userAttributes: { email: 'a@b.com', 'custom:username': username } },
  response: {},
  ...over,
});

beforeEach(() => { put.mockReset(); put.mockResolvedValue({}); });

describe('PreSignUp username reservation', () => {
  it('reserves with NO userId — it is a reservation, not ownership', async () => {
    await handler(event('mohan'));
    const [item] = put.mock.calls[0];
    expect(item.PK).toBe('USERNAME#mohan');
    expect(item.userId).toBeNull();       // bound later by PostConfirmation
  });

  it('sets a TTL so a signup that never completes cannot squat the handle', async () => {
    await handler(event('mohan'));
    const [item] = put.mock.calls[0];
    expect(item.expiresAt).toBeTypeOf('number');
    const secondsOut = item.expiresAt - Math.floor(Date.now() / 1000);
    expect(secondsOut).toBeGreaterThan(0);
    expect(secondsOut).toBeLessThanOrEqual(20 * 60);
  });

  it('allows taking over a STALE unbound reservation', async () => {
    await handler(event('mohan'));
    const [, opts] = put.mock.calls[0];
    // Free, or an expired reservation nobody completed.
    expect(opts.ConditionExpression).toContain('attribute_not_exists(PK)');
    expect(opts.ConditionExpression).toContain('attribute_type(userId, :nullType)');
    expect(opts.ExpressionAttributeValues[':nullType']).toBe('NULL');
    expect(opts.ExpressionAttributeValues[':cutoff']).toBeTypeOf('string');
  });

  it('rejects a handle genuinely owned by someone else', async () => {
    const err = new Error('nope'); err.name = 'ConditionalCheckFailedException';
    put.mockRejectedValueOnce(err);
    await expect(handler(event('mohan'))).rejects.toThrow(/already taken/i);
  });

  it('validates the handle before reserving anything', async () => {
    await expect(handler(event('X!'))).rejects.toThrow(/3-24 characters/);
    await expect(handler(event('ab'))).rejects.toThrow(/3-24 characters/);
    expect(put).not.toHaveBeenCalled();
  });

  it('federated signups reserve nothing — the handle is derived later', async () => {
    const e = event(undefined, { triggerSource: 'PreSignUp_ExternalProvider' });
    delete e.request.userAttributes['custom:username'];
    await handler(e);
    expect(put).not.toHaveBeenCalled();
    expect(e.response.autoConfirmUser).toBe(true);
  });
});
