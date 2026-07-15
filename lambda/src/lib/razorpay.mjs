import crypto from 'node:crypto';

const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

export const paymentsConfigured = () => !!(KEY_ID && KEY_SECRET);
export const razorpayKeyId = () => KEY_ID;

export async function createOrder({ amountCents, currency, receipt, notes }) {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`,
    },
    body: JSON.stringify({ amount: amountCents, currency, receipt, notes }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(JSON.stringify({ razorpayOrderError: data }));
    throw new Error('Payment provider rejected the order.');
  }
  return data; // { id, amount, currency, ... }
}

// Checkout callback signature: HMAC-SHA256(order_id|payment_id, key_secret)
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const expected = crypto.createHmac('sha256', KEY_SECRET)
    .update(`${orderId}|${paymentId}`).digest('hex');
  return timingSafeEqualHex(expected, signature);
}

// Webhook signature: HMAC-SHA256(raw body, webhook_secret)
export function verifyWebhookSignature(rawBody, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingSafeEqualHex(expected, signature);
}

function timingSafeEqualHex(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}
