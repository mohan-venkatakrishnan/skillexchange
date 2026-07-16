import { db } from './db.mjs';

export const COMMISSION_RATE = 0.05; // stored per transaction, never recalculated

export function commissionCents(amountCents) {
  return Math.round(amountCents * COMMISSION_RATE);
}

// Idempotent purchase creation: PK encodes (skill, buyer) so a webhook replay
// or double-confirm can never double-count. Increments the skill's download
// counter and the seller's sales counter only on first write.
export async function recordPurchase({ skillId, buyerId, buyerUsername, sellerId, amountCents, provider, providerPaymentId }) {
  const now = new Date().toISOString();
  const purchase = {
    PK: `PURCHASE#${skillId}#${buyerId}`,
    SK: 'META',
    purchaseId: `${skillId}#${buyerId}`,
    skillId, buyerId, buyerUsername, sellerId,
    amountCents,
    commissionCents: commissionCents(amountCents),
    provider: provider || (amountCents === 0 ? 'free' : 'unknown'),
    providerPaymentId: providerPaymentId || null,
    purchasedAt: now,
    GSI3PK: `BUYER#${buyerId}`,
    GSI3SK: now,
  };

  try {
    await db.put(purchase, { ConditionExpression: 'attribute_not_exists(PK)' });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return { created: false };
    throw err;
  }

  // First purchase of this skill by this buyer → bump counters.
  await db.update({
    Key: { PK: `SKILL#${skillId}`, SK: 'META' },
    UpdateExpression: 'ADD downloadsCount :one SET GSI1SK = if_not_exists(GSI1SK, :zero) + :one',
    ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
  });
  if (amountCents > 0) {
    await db.update({
      Key: { PK: `USER#${sellerId}`, SK: 'PROFILE' },
      UpdateExpression: 'ADD salesCount :one, revenueCents :rev',
      ExpressionAttributeValues: { ':one': 1, ':rev': amountCents - commissionCents(amountCents) },
    });
  }
  return { created: true };
}

export function hasPurchase(skillId, buyerId) {
  return db.get({ PK: `PURCHASE#${skillId}#${buyerId}`, SK: 'META' });
}
