import { describe, it, expect } from 'vitest';
import { commissionCents, COMMISSION_RATE } from '../../lambda/src/lib/purchases.mjs';

// Contract: 10% platform commission, stored per transaction at purchase time
// (CLAUDE.md §6). If the rate ever changes, THIS TEST changes with the policy.
describe('commission', () => {
  it('is exactly 10%', () => {
    expect(COMMISSION_RATE).toBe(0.10);
  });

  it('computes 10% of the sale in cents, rounded', () => {
    expect(commissionCents(500)).toBe(50);    // $5 → $0.50
    expect(commissionCents(999)).toBe(100);   // $9.99 → $1.00 (rounded)
    expect(commissionCents(100)).toBe(10);    // $1 → $0.10
    expect(commissionCents(0)).toBe(0);       // free → no commission
  });

  it('seller keeps 90%', () => {
    const price = 800;
    expect(price - commissionCents(price)).toBe(720);
  });
});
