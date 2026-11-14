import { describe, expect, it } from 'vitest';
import { seededRng } from '@quiz/shared';
import { createParticles, effectPlan, stepParticles, type EffectFrame, type ParticleKind } from './effect-plan';

const frame: EffectFrame = { center: [0, 1, 0], radius: 1 };
const KINDS: ParticleKind[] = ['snow', 'fire', 'sparks'];

describe('effect plan', () => {
  it('plan per size and motion', () => {
    expect(effectPlan({ kind: 'fire' }, 'stage', false)).toMatchObject({ mode: 'animated', count: 48 });
    expect(effectPlan({ kind: 'fire' }, 'phone', false)).toMatchObject({ mode: 'animated', count: 32 });
    expect(effectPlan({ kind: 'fire' }, 'card', false)).toMatchObject({ mode: 'static', count: 12 });
    for (const kind of ['fire', 'sparks', 'snow'] as const) expect(effectPlan({ kind }, 'stage', true).mode).toBe('off');
    for (const kind of ['glow', 'rays'] as const) {
      expect(effectPlan({ kind }, 'stage', true).mode).toBe('static');
      expect(effectPlan({ kind }, 'card', false).mode).toBe('static');
      expect(effectPlan({ kind }, 'view', false)).toMatchObject({ mode: 'animated', count: 0 });
    }
    for (const size of ['stage', 'view', 'phone', 'card'] as const) {
      for (const calm of [false, true]) expect(effectPlan({ kind: 'none' }, size, calm).mode).toBe('off');
    }
  });

  it('glow colour', () => {
    expect(effectPlan({ kind: 'glow', color: '#4fc3f7' }, 'stage', false).color).toBe('#4fc3f7');
    expect(effectPlan({ kind: 'glow' }, 'stage', false).color).toBe('#ffd36b');
    expect(effectPlan({ kind: 'sparks', color: '#000000' }, 'stage', false).color).not.toBe('#000000');
  });
});

describe('particles', () => {
  it('stay in their box', () => {
    for (const kind of KINDS) {
      const p = createParticles(kind, 48, frame, seededRng(3));
      const rng = seededRng(4);
      for (let s = 0; s < 300; s++) {
        stepParticles(p, frame, 1 / 30, rng);
        for (let i = 0; i < p.count; i++) {
          const [x, y, z] = [p.positions[3 * i]!, p.positions[3 * i + 1]!, p.positions[3 * i + 2]!];
          if (kind === 'snow') {
            expect(Math.abs(x)).toBeLessThanOrEqual(1.4);
            expect(Math.abs(z)).toBeLessThanOrEqual(1.4);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(2.4);
          } else {
            expect(Math.abs(x)).toBeLessThanOrEqual(2);
            expect(Math.abs(z)).toBeLessThanOrEqual(2);
            expect(y).toBeGreaterThanOrEqual(-0.5);
            expect(y).toBeLessThanOrEqual(3);
          }
        }
      }
    }
  });

  it('additive particles fade to black', () => {
    for (const kind of ['sparks', 'fire'] as const) {
      const p = createParticles(kind, 8, frame, seededRng(5));
      p.ages[0] = p.lives[0]! - 0.001;
      stepParticles(p, frame, 0.0005, seededRng(6));
      const dark = [0, 1, 2].every((c) => p.colors[c]! < 0.05);
      expect(dark || p.ages[0]! < 0.1).toBe(true);
      p.ages[1] = p.lives[1]! - 0.001;
      stepParticles(p, frame, 1 / 30, seededRng(6));
      expect(p.ages[1]).toBeLessThan(0.1);
    }
  });

  it('sparks are born at the middle of the frame, so they rise and fade inside it', () => {
    // Смуга народження [0.35, 0.65]·(c.y + r): кадр сягає ≈1.09r над центром, тож іскри живуть здебільшого в ньому.
    const top = frame.center[1] + frame.radius;
    const p = createParticles('sparks', 16, frame, seededRng(9));
    for (let i = 0; i < 16; i++) p.ages[i] = p.lives[i]! - 0.0001;
    stepParticles(p, frame, 0.0002, seededRng(10));
    for (let i = 0; i < 16; i++) {
      expect(p.ages[i]).toBeLessThan(0.01);
      const y = p.positions[3 * i + 1]!;
      expect(y).toBeGreaterThanOrEqual(0.35 * top - 0.01);
      expect(y).toBeLessThanOrEqual(0.65 * top + 0.01);
    }
  });

  it('snow wraps to the top', () => {
    const p = createParticles('snow', 4, frame, seededRng(1));
    p.positions[1] = 0.001;
    p.velocities[1] = -0.3;
    stepParticles(p, frame, 0.1, seededRng(2));
    expect(p.positions[1]).toBeGreaterThan(1.5);
  });

  it('deterministic', () => {
    for (const kind of KINDS) {
      const a = createParticles(kind, 32, frame, seededRng(7));
      const b = createParticles(kind, 32, frame, seededRng(7));
      expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    }
  });

  it('prewarmed', () => {
    const p = createParticles('fire', 32, frame, seededRng(8));
    expect(Array.from(p.ages).some((age) => age > 0)).toBe(true);
  });
});
