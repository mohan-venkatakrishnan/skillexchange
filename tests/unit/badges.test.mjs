import { describe, it, expect } from 'vitest';
import { computeBadges, computeLeaderboards, computeStats, floorPlus } from '../../lambda/src/lib/badges.mjs';

const NOW = new Date('2026-07-15T00:00:00Z');
const skill = (over = {}) => ({
  skillId: over.skillId || Math.random().toString(36).slice(2),
  title: 'Skill', category: 'Coding', sellerId: 'u1', sellerUsername: 'mohan',
  downloadsCount: 0, rating: 0, reviewsCount: 0, timeSavedHours: 4,
  createdAt: '2026-06-01T00:00:00Z',
  ...over,
});

describe('computeBadges', () => {
  it('assigns #1 in Category to the top-downloaded skill per category', () => {
    const a = skill({ skillId: 'a', category: 'Coding', downloadsCount: 100 });
    const b = skill({ skillId: 'b', category: 'Coding', downloadsCount: 50 });
    const c = skill({ skillId: 'c', category: 'Design', downloadsCount: 10 });
    const badges = computeBadges([a, b, c], NOW);
    expect(badges.a).toBe('#1 in Coding');
    expect(badges.c).toBe('#1 in Design');
    expect(badges.b).toBeUndefined();
  });

  it('never gives #1 in Category for zero downloads', () => {
    const a = skill({ skillId: 'a', downloadsCount: 0 });
    expect(computeBadges([a], NOW).a).toBeUndefined();
  });

  it('Top Rated goes to the genuinely best-rated skill with enough reviews', () => {
    const catWinner = skill({ skillId: 'catWinner', category: 'Coding', downloadsCount: 100 });
    const bestRated = skill({ skillId: 'bestRated', category: 'Coding', downloadsCount: 5, rating: 4.9, reviewsCount: 5 });
    const fewReviews = skill({ skillId: 'few', category: 'Design', rating: 5, reviewsCount: 1 });
    const badges = computeBadges([catWinner, bestRated, fewReviews], NOW);
    expect(badges.catWinner).toBe('#1 in Coding');
    expect(badges.bestRated).toBe('Top Rated');
    expect(badges.few).toBeUndefined(); // too few reviews — never Top Rated
  });

  it('a badge is DROPPED, never reassigned, when its winner holds a higher-priority badge', () => {
    const first = skill({ skillId: 'first', category: 'Coding', downloadsCount: 200 });
    const second = skill({ skillId: 'second', category: 'Coding', downloadsCount: 150 });
    const badges = computeBadges([first, second], NOW);
    expect(badges.first).toBe('#1 in Coding'); // also most downloaded — category shows
    expect(badges.second).toBeUndefined();     // "Most Downloaded" would be a lie here
  });

  it('New & Notable needs recency and traction', () => {
    const fresh = skill({ skillId: 'fresh', category: 'Design', createdAt: '2026-07-10T00:00:00Z', downloadsCount: 6 });
    const stale = skill({ skillId: 'stale', category: 'Data', createdAt: '2026-01-01T00:00:00Z', downloadsCount: 6 });
    // Give category #1 to higher-download decoys so fresh/stale compete for New & Notable only
    const decoy1 = skill({ skillId: 'd1', category: 'Design', downloadsCount: 500 });
    const decoy2 = skill({ skillId: 'd2', category: 'Data', downloadsCount: 500 });
    const badges = computeBadges([fresh, stale, decoy1, decoy2], NOW);
    expect(badges.fresh).toBe('New & Notable');
    expect(badges.stale).toBeUndefined();
  });
});

describe('computeLeaderboards', () => {
  const sellers = {
    u1: { username: 'mohan', salesCount: 10 },
    u2: { username: 'devkraft', salesCount: 25 },
  };

  it('ranks builders by sales with podium icons in order', () => {
    const skills = [
      skill({ sellerId: 'u1', sellerUsername: 'mohan', downloadsCount: 900 }),
      skill({ sellerId: 'u2', sellerUsername: 'devkraft', downloadsCount: 10 }),
    ];
    const { builders } = computeLeaderboards(skills, sellers);
    expect(builders[0]).toMatchObject({ rank: 1, name: 'devkraft', sales: 25, badge: 'Crown' });
    expect(builders[1]).toMatchObject({ rank: 2, name: 'mohan', sales: 10, badge: 'Flame' });
  });

  it('ranks skills by downloads', () => {
    const skills = [
      skill({ skillId: 'low', downloadsCount: 5 }),
      skill({ skillId: 'high', downloadsCount: 500 }),
    ];
    const { topSkills } = computeLeaderboards(skills, sellers);
    expect(topSkills[0].skillId).toBe('high');
    expect(topSkills[0].rank).toBe(1);
  });

  it('averages a builder rating only over reviewed skills', () => {
    const skills = [
      skill({ sellerId: 'u1', rating: 5, reviewsCount: 2 }),
      skill({ sellerId: 'u1', rating: 0, reviewsCount: 0 }), // unreviewed — excluded
      skill({ sellerId: 'u1', rating: 4, reviewsCount: 1 }),
    ];
    const { builders } = computeLeaderboards(skills, { u1: { username: 'mohan', salesCount: 1 } });
    expect(builders[0].rating).toBe(4.5);
  });
});

describe('floorPlus', () => {
  // The "+" must be EARNED: the real number is always strictly greater than
  // the number we print, so no headline stat can ever overstate the catalogue.
  it('steps back on an exact boundary so "+" is never a lie', () => {
    expect(floorPlus(100)).toBe('90+');   // not "100+" — that claims >100
    expect(floorPlus(20)).toBe('15+');
    expect(floorPlus(200)).toBe('150+');
  });

  it('rounds down to a friendly step', () => {
    expect(floorPlus(16)).toBe('15+');
    expect(floorPlus(13)).toBe('10+');
    expect(floorPlus(7)).toBe('5+');
    expect(floorPlus(101)).toBe('100+');
  });

  it('shows small counts exactly rather than a meaningless "+"', () => {
    expect(floorPlus(0)).toBe('0');
    expect(floorPlus(3)).toBe('3');
    expect(floorPlus(5)).toBe('5');
    expect(floorPlus(9)).toBe('5+');
  });

  it('never claims more than reality', () => {
    for (let n = 0; n < 500; n++) {
      const out = floorPlus(n);
      if (!out.endsWith('+')) continue;
      const claimed = Number(out.replace(/[+,]/g, ''));
      expect(claimed).toBeLessThan(n);
    }
  });
});

describe('computeStats', () => {
  it('aggregates counts and average rating', () => {
    const skills = [
      skill({ downloadsCount: 100, rating: 4, reviewsCount: 2 }),
      skill({ downloadsCount: 50, rating: 5, reviewsCount: 1 }),
      skill({ downloadsCount: 0, rating: 0, reviewsCount: 0 }),
    ];
    const stats = computeStats(skills, { u1: {} });
    expect(stats.skills).toBe('3');
    expect(stats.downloads).toBe('150');
    expect(stats.builders).toBe('1');
    expect(stats.avgRating).toBe('4.5★');
  });

  it('shows dash when nothing is rated', () => {
    expect(computeStats([skill()], {}).avgRating).toBe('—');
  });
});
