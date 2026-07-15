import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyCheckoutSignature, verifyWebhookSignature } from '../../lambda/src/lib/razorpay.mjs';

// verifyCheckoutSignature reads RAZORPAY_KEY_SECRET at module load — set it
// via env for this suite.
const SECRET = process.env.RAZORPAY_KEY_SECRET || '';

describe('verifyWebhookSignature', () => {
  const secret = 'whsec_test_123';
  const body = JSON.stringify({ event: 'payment.captured', payload: {} });

  it('accepts a correctly signed body', () => {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature(body + 'x', sig, secret)).toBe(false);
  });

  it('rejects a signature signed with the wrong secret', () => {
    const sig = crypto.createHmac('sha256', 'wrong').update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig, secret)).toBe(false);
  });

  it('rejects empty/missing signatures without throwing', () => {
    expect(verifyWebhookSignature(body, '', secret)).toBe(false);
    expect(verifyWebhookSignature(body, undefined, secret)).toBe(false);
    expect(verifyWebhookSignature(body, 'not-hex', secret)).toBe(false);
  });
});

describe('verifyCheckoutSignature', () => {
  it('rejects when no signature provided', () => {
    expect(verifyCheckoutSignature({ orderId: 'o1', paymentId: 'p1', signature: '' })).toBe(false);
  });
});
