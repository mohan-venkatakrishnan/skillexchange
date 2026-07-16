import { describe, it, expect } from 'vitest';
import { commissionCents, COMMISSION_RATE } from '../../lambda/src/lib/purchases.mjs';

// Contract: 5% platform commission, stored per transaction at purchase time
// (CLAUDE.md §6). If the rate ever changes, THIS TEST changes with the policy —
// deliberately, as part of the change. Moved 10% -> 5% on 2026-07-16 at the
// founder's request; purchases written before that keep their stored rate,
// because commissionCents is persisted on the PURCHASE row and never
// recomputed. That is the whole point of storing it per transaction.
describe('commission', () => {
  it('is exactly 5%', () => {
    expect(COMMISSION_RATE).toBe(0.05);
  });

  it('computes 5% of the sale in cents, rounded', () => {
    expect(commissionCents(500)).toBe(25);    // $5 → $0.25
    expect(commissionCents(600)).toBe(30);    // $6 → $0.30
    expect(commissionCents(999)).toBe(50);    // $9.99 → $0.50 (rounded)
    expect(commissionCents(100)).toBe(5);     // $1 → $0.05
    expect(commissionCents(0)).toBe(0);       // free → no commission
  });

  it('seller keeps 95%', () => {
    expect(800 - commissionCents(800)).toBe(760);
    expect(500 - commissionCents(500)).toBe(475);
  });

  it('never takes more than the sale, and never a negative cut', () => {
    for (const price of [0, 1, 5, 99, 100, 500, 12345]) {
      const cut = commissionCents(price);
      expect(cut).toBeGreaterThanOrEqual(0);
      expect(cut).toBeLessThanOrEqual(price);
    }
  });
});
