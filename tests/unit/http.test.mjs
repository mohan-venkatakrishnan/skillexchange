import { describe, it, expect } from 'vitest';
import { json, parseBody, claims } from '../../lambda/src/lib/http.mjs';

describe('json responses', () => {
  it('always carries CORS headers — API Gateway proxy responses must self-serve CORS', () => {
    const res = json(401, { message: 'nope' });
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).message).toBe('nope');
  });
});

describe('parseBody', () => {
  it('parses plain JSON', () => {
    expect(parseBody({ body: '{"a":1}' })).toEqual({ a: 1 });
  });
  it('parses base64-encoded bodies (API Gateway binary mode)', () => {
    const b64 = Buffer.from('{"a":2}').toString('base64');
    expect(parseBody({ body: b64, isBase64Encoded: true })).toEqual({ a: 2 });
  });
  it('returns null (not throw) on malformed JSON', () => {
    expect(parseBody({ body: '{oops' })).toBeNull();
  });
  it('returns empty object when no body', () => {
    expect(parseBody({})).toEqual({});
  });
});

describe('claims', () => {
  const ISS = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc123';

  it('extracts identity from the Cognito authorizer', () => {
    const event = { requestContext: { authorizer: { claims: {
      sub: 'u-123', email: 'a@b.com', 'custom:username': 'Mohan', name: 'Mohan',
      iss: ISS, 'cognito:username': 'a@b.com',
    } } } };
    expect(claims(event)).toEqual({
      userId: 'u-123', email: 'a@b.com', username: 'mohan', name: 'Mohan',
      poolId: 'us-east-1_abc123', cognitoUsername: 'a@b.com',
    });
  });

  // The regression that put a "google_…" handle in the nav: for a federated
  // user Cognito sets cognito:username to "Google_<sub>". It must NEVER be
  // used as the marketplace handle — that comes from custom:username / the DB.
  it('never falls back to cognito:username for a federated user', () => {
    const event = { requestContext: { authorizer: { claims: {
      sub: 'u-9', email: 'g@b.com', iss: ISS,
      'cognito:username': 'Google_109291105168793621134',
    } } } };
    const c = claims(event);
    // null, NOT the Google_<sub> string — callers fall back to the DB handle.
    expect(c.username).toBeNull();
    // still exposed separately, because admin attribute writes need it
    expect(c.cognitoUsername).toBe('Google_109291105168793621134');
  });

  it('derives poolId from the issuer', () => {
    const event = { requestContext: { authorizer: { claims: { sub: 'u-1', iss: ISS } } } };
    expect(claims(event).poolId).toBe('us-east-1_abc123');
  });

  it('returns null with no authorizer context', () => {
    expect(claims({ requestContext: {} })).toBeNull();
  });
});
