import { describe, expect, it } from 'vitest';
import { aspectsMatch, spotHit, spotPoints, spotSlack } from './spotdiff';

const one = { aspect: 2, spots: [{ x: 0.5, y: 0.5, r: 0.05 }] };
const none = new Set<number>();

describe('spotdiff geometry', () => {
  it('hits inside the circle plus four percent', () => {
    expect(spotHit(one, 0.59, 0.5, 1000, none)).toBe(0);
    expect(spotHit(one, 0.591, 0.5, 1000, none)).toBeNull();
    expect(spotHit(one, 0.5, 0.68, 1000, none)).toBe(0);
    expect(spotHit(one, 0.5, 0.682, 1000, none)).toBeNull();
  });

  it('the slack grows to 24 px on a small picture', () => {
    expect(spotSlack(1000)).toBe(0.04);
    expect(spotSlack(300)).toBe(0.08);
    expect(spotSlack(200)).toBe(0.12);
    expect(spotHit(one, 0.63, 0.5, 300, none)).toBe(0);
    expect(spotHit(one, 0.632, 0.5, 300, none)).toBeNull();
  });

  it('the nearest circle wins', () => {
    const q = {
      aspect: 2,
      spots: [
        { x: 0.3, y: 0.5, r: 0.05 },
        { x: 0.42, y: 0.5, r: 0.05 },
      ],
    };
    expect(spotHit(q, 0.37, 0.5, 1000, none)).toBe(1);
    expect(spotHit(q, 0.37, 0.5, 1000, new Set([1]))).toBe(0);
    expect(spotHit(q, 0.37, 0.5, 1000, new Set([0, 1]))).toBe('found');
    expect(spotHit(q, 0.9, 0.9, 1000, new Set([0, 1]))).toBeNull();
  });

  it('bad taps miss', () => {
    expect(spotHit(one, NaN, 0.5, 1000, none)).toBeNull();
    expect(spotHit(one, 1.2, 0.5, 1000, none)).toBeNull();
  });

  it('points split by the count, all found is the full price', () => {
    expect(spotPoints(300, 2, 7)).toBe(86);
    expect(spotPoints(300, 7, 7)).toBe(300);
    expect(spotPoints(100, 1, 3)).toBe(33);
    expect(spotPoints(100, 2, 3)).toBe(67);
    expect(spotPoints(300, 0, 5)).toBe(0);
  });

  it('aspects match within two percent', () => {
    expect(aspectsMatch(1.5, 1.52)).toBe(true);
    expect(aspectsMatch(1.5, 1.54)).toBe(false);
  });
});
