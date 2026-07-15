// Razorpay webhook — backup path for purchase recording (the primary path is
// the in-app /confirm call). Signature-verified, idempotent, every event logged.
import { db } from './lib/db.mjs';
import { ok, bad, unauthorized, route } from './lib/http.mjs';
import { verifyWebhookSignature } from './lib/razorpay.mjs';
import { recordPurchase } from './lib/purchases.mjs';

export const handler = route(async (event) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return unauthorized('Webhook not configured');

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : (event.body || '');
  const signature = event.headers?.['x-razorpay-signature'] || event.headers?.['X-Razorpay-Signature'];
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    console.error(JSON.stringify({ webhookRejected: 'bad signature' }));
    return unauthorized('Invalid signature');
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return bad('Invalid JSON'); }

  const eventName = payload.event;
  const payment = payload.payload?.payment?.entity;
  console.log(JSON.stringify({ webhookEvent: eventName, paymentId: payment?.id, status: payment?.status, notes: payment?.notes }));

  if (eventName === 'payment.captured' && payment?.notes?.skillId && payment?.notes?.buyerId) {
    const { skillId, buyerId } = payment.notes;
    const skill = await db.get({ PK: `SKILL#${skillId}`, SK: 'META' });
    const buyer = await db.get({ PK: `USER#${buyerId}`, SK: 'PROFILE' });
    if (skill) {
      const result = await recordPurchase({
        skillId, buyerId,
        buyerUsername: buyer?.username || 'unknown',
        sellerId: skill.sellerId,
        amountCents: payment.amount,
        provider: 'razorpay',
        providerPaymentId: payment.id,
      });
      console.log(JSON.stringify({ webhookPurchase: { skillId, buyerId, created: result.created } }));
    }
  }

  return ok({ received: true });
});
