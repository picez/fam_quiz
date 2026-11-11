import { describe, expect, it } from 'vitest';
import { shareOf } from './spot-geometry';

describe('shareOf', () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };
  it('turns a touch into fractions of the picture', () => {
    expect(shareOf(rect, 110, 70)).toEqual({ x: 0.5, y: 0.5 });
  });
  it('clamps points outside the picture to 0…1', () => {
    expect(shareOf(rect, -50, 500)).toEqual({ x: 0, y: 1 });
    expect(shareOf(rect, 900, 0)).toEqual({ x: 1, y: 0 });
  });
  it('does not divide by an empty frame', () => {
    expect(shareOf({ left: 0, top: 0, width: 0, height: 0 }, 5, 5)).toEqual({ x: 0, y: 0 });
  });
});
