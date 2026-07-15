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
  it('extracts identity from the Cognito authorizer', () => {
    const event = { requestContext: { authorizer: { claims: {
      sub: 'u-123', email: 'a@b.com', 'custom:username': 'Mohan', name: 'Mohan',
    } } } };
    expect(claims(event)).toEqual({ userId: 'u-123', email: 'a@b.com', username: 'mohan', name: 'Mohan' });
  });
  it('returns null with no authorizer context', () => {
    expect(claims({ requestContext: {} })).toBeNull();
  });
});
