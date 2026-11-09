import { CEREMONY_MS, TROPHY_APPEARANCES } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { APPEAR_SECONDS, NEUTRAL_POSE, appearancePose } from './appearance-pose';

const TAU = Math.PI * 2;

describe('appearance poses', () => {
  it('every appearance ends neutral', () => {
    for (const kind of TROPHY_APPEARANCES) {
      for (const t of [1, 5]) {
        const { turn, ...rest } = appearancePose(kind, t);
        const { turn: _neutralTurn, ...neutral } = NEUTRAL_POSE;
        expect(rest).toEqual(neutral);
        expect(Math.abs(turn % TAU)).toBeLessThan(1e-9);
      }
    }
  });

  it('all shorter than a ceremony step', () => {
    for (const kind of TROPHY_APPEARANCES) expect(APPEAR_SECONDS[kind] * 1000).toBeLessThan(CEREMONY_MS.step);
  });

  it('spin', () => {
    const start = appearancePose('spin', 0);
    expect(start.scale).toBeCloseTo(0.6, 9);
    expect(start.turn).toBe(0);
    expect(appearancePose('spin', 1).turn).toBeCloseTo(4 * Math.PI, 9);
    let last = -1;
    for (let i = 0; i < 20; i++) {
      const { turn } = appearancePose('spin', i / 19);
      expect(turn).toBeGreaterThanOrEqual(last);
      last = turn;
    }
  });

  it('rise', () => {
    expect(appearancePose('rise', 0)).toMatchObject({ lift: -2, clip: true, pedestal: 1 });
    const mid = appearancePose('rise', 0.5);
    expect(mid.pedestal).toBe(1);
    expect(mid.lift).toBeGreaterThan(-2);
    expect(mid.lift).toBeLessThan(0);
    expect(appearancePose('rise', 0.9).pedestal).toBeCloseTo(0.5, 9);
    expect(appearancePose('rise', 1)).toMatchObject({ clip: false, pedestal: 0 });
  });

  it('drop', () => {
    expect(appearancePose('drop', 0).lift).toBe(3);
    const hit = appearancePose('drop', 0.5);
    expect(hit.lift).toBeCloseTo(0, 9);
    expect(hit.squash).toBeCloseTo(0.85, 9);
    let top = 0;
    for (let t = 0.5; t <= 0.75 + 1e-9; t += 0.005) top = Math.max(top, appearancePose('drop', t).lift);
    expect(Math.abs(top - 0.35)).toBeLessThan(0.01);
    for (let t = 0.9; t <= 1 + 1e-9; t += 0.01) expect(appearancePose('drop', t).lift).toBe(0);
  });

  it('flash', () => {
    const early = appearancePose('flash', 0.1);
    expect(early.visible).toBe(false);
    expect(early.flash).toBeCloseTo(0.667, 3);
    const peak = appearancePose('flash', 0.15);
    expect(peak).toMatchObject({ flash: 1, visible: true });
    expect(peak.scale).toBeCloseTo(0.3, 9);
    expect(appearancePose('flash', 0.5).flash).toBeCloseTo(0, 9);
  });

  it('t below zero clamps', () => {
    expect(appearancePose('drop', -1)).toEqual(appearancePose('drop', 0));
  });
});
