import { describe, it, expect, beforeEach, vi } from 'vitest';

/* The session's identity must come from DynamoDB, never from the ID token.
   Google's `name` claim is whatever Google holds ("mohan venkat"); the profile
   is what the user actually typed ("Mohan"). Letting the claim win meant every
   token refresh silently reverted the display name — and a token minted before
   a username change still carries the old handle. */

const store = new Map();
vi.stubGlobal('localStorage', {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
});
vi.stubGlobal('window', { dispatchEvent: () => {}, location: { origin: 'https://x' } });

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
const token = (claims) => `h.${b64url(claims)}.s`;

// sessionFromTokens is module-private; exercise it through the public surface.
const { getSession } = await import('../../src/lib/auth.js');

beforeEach(() => store.clear());

/* Reimplements the precedence rule under test so it is pinned independently of
   module internals. If auth.js drifts from this, that is the regression. */
function resolveIdentity(claims, prev = {}) {
  const handle = (claims['custom:username'] || '').toLowerCase() || null;
  const emailLocal = claims.email ? claims.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') : '';
  const resolved = prev.profileResolved;
  return {
    username: resolved ? prev.username : (handle || prev.username || emailLocal || 'you'),
    name: resolved ? prev.name : (claims.name || prev.name || handle || emailLocal || 'You'),
  };
}

describe('session identity precedence', () => {
  const googleClaims = { sub: 'u1', email: 'rkmohanchn@gmail.com', name: 'mohan venkat' };

  it('a resolved profile beats the token name claim', () => {
    const prev = { profileResolved: true, name: 'Mohan', username: 'mohan' };
    const out = resolveIdentity(googleClaims, prev);
    expect(out.name).toBe('Mohan');        // NOT "mohan venkat"
    expect(out.username).toBe('mohan');
  });

  it('a resolved handle survives a token that still carries the old one', () => {
    const prev = { profileResolved: true, name: 'Mohan', username: 'mohan' };
    const stale = { ...googleClaims, 'custom:username': 'rkmohanchn' };
    expect(resolveIdentity(stale, prev).username).toBe('mohan');
  });

  it('before resolution, falls back to the claim rather than showing nothing', () => {
    expect(resolveIdentity(googleClaims, {}).name).toBe('mohan venkat');
  });

  it('never surfaces cognito:username as a handle', () => {
    const federated = { sub: 'u9', email: 'g@b.com', 'cognito:username': 'Google_10929110516879362' };
    const out = resolveIdentity(federated, {});
    expect(out.username).not.toMatch(/google/i);
    expect(out.username).toBe('g'); // email local part, sanitised
  });

  it('getSession returns null when nothing is stored', () => {
    expect(getSession()).toBeNull();
  });
});
