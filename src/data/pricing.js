/* Commission, in ONE place for the whole frontend.
   The authority for actual money is lambda/src/lib/purchases.mjs — this must
   agree with it. Before, "90%" was hardcoded as prose in five components and
   `* 0.9` in the publish form, so changing the rate meant finding all six and
   hoping. The seller-facing number is now derived from the rate. */
export const COMMISSION_RATE = 0.05;

export const SELLER_SHARE = 1 - COMMISSION_RATE;
export const SELLER_PCT = `${Math.round(SELLER_SHARE * 100)}%`;   // "95%"
export const COMMISSION_PCT = `${Math.round(COMMISSION_RATE * 100)}%`; // "5%"

/** What the seller actually banks on a sale, in dollars. */
export const sellerEarns = (priceDollars) => (Number(priceDollars) || 0) * SELLER_SHARE;
