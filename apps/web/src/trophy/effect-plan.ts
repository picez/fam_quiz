import type { TrophyEffect } from '@quiz/shared';
import type { TrophySize } from './engine-types';

/** Межа частинок на трофей за розміром вигляду. */
export const EFFECT_BUDGET: Record<TrophySize, number> = { stage: 48, view: 48, phone: 32, card: 12 };
export const GLOW_DEFAULT = '#ffd36b';
/** Скільки секунд симуляція прогрівається до першого кадру. */
export const PREWARM_S = 1.5;
const PREWARM_STEP = 1 / 30;

export type EffectMode = 'animated' | 'static' | 'off';
export interface EffectPlan {
  kind: TrophyEffect;
  mode: EffectMode;
  /** 0 для glow, rays і none. */
  count: number;
  color: string;
}

export function effectPlan(effect: { kind: TrophyEffect; color?: string }, size: TrophySize, calm: boolean): EffectPlan {
  const { kind } = effect;
  if (kind === 'none') return { kind, mode: 'off', count: 0, color: GLOW_DEFAULT };
  if (kind === 'glow' || kind === 'rays') {
    const mode: EffectMode = calm || size === 'card' ? 'static' : 'animated';
    return { kind, mode, count: 0, color: kind === 'glow' ? (effect.color ?? GLOW_DEFAULT) : GLOW_DEFAULT };
  }
  if (calm) return { kind, mode: 'off', count: EFFECT_BUDGET[size], color: GLOW_DEFAULT };
  return { kind, mode: size === 'card' ? 'static' : 'animated', count: EFFECT_BUDGET[size], color: GLOW_DEFAULT };
}

export type ParticleKind = 'sparks' | 'fire' | 'snow';
/** Кадр ефекту: центр і радіус кадрування трофея; підлога y = 0. */
export interface EffectFrame {
  center: readonly [number, number, number];
  radius: number;
}
export interface Particles {
  kind: ParticleKind;
  count: number;
  positions: Float32Array;
  /** RGB 0..1 на частинку; для адитивних згасає до 0. */
  colors: Float32Array;
  velocities: Float32Array;
  ages: Float32Array;
  lives: Float32Array;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rgb = readonly [number, number, number];
const hex = (value: number): Rgb => [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
const SPARK: Rgb = hex(0xffd36b);
const FIRE_STOPS: { at: number; color: Rgb }[] = [
  { at: 0, color: hex(0xfff1a8) },
  { at: 0.35, color: hex(0xff7a1a) },
  { at: 0.7, color: hex(0xc21d0b) },
  { at: 1, color: [0, 0, 0] },
];
const WHITE: Rgb = [1, 1, 1];

const LIFE: Record<'sparks' | 'fire', readonly [number, number]> = { sparks: [0.9, 1.6], fire: [0.8, 1.3] };
const GRAVITY = 0.6;
const SWAY_HZ = 1.5;
const GOLDEN = 2.399963;

const range = (rng: () => number, [low, high]: readonly [number, number]) => low + (high - low) * rng();

function fireColor(u: number): Rgb {
  for (let s = 1; s < FIRE_STOPS.length; s++) {
    const to = FIRE_STOPS[s]!;
    if (u <= to.at) {
      const from = FIRE_STOPS[s - 1]!;
      const k = (u - from.at) / (to.at - from.at);
      return [from.color[0] + (to.color[0] - from.color[0]) * k, from.color[1] + (to.color[1] - from.color[1]) * k, from.color[2] + (to.color[2] - from.color[2]) * k];
    }
  }
  return [0, 0, 0];
}

function paint(p: Particles, i: number): void {
  let color: Rgb = WHITE;
  if (p.kind !== 'snow') {
    const u = Math.min(1, p.ages[i]! / p.lives[i]!);
    if (p.kind === 'sparks') {
      const fade = 1 - u;
      color = [SPARK[0] * fade, SPARK[1] * fade, SPARK[2] * fade];
    } else color = fireColor(u);
  }
  p.colors[3 * i] = color[0];
  p.colors[3 * i + 1] = color[1];
  p.colors[3 * i + 2] = color[2];
}

function spawn(p: Particles, i: number, frame: EffectFrame, rng: () => number): void {
  const r = frame.radius;
  const [cx, cy, cz] = frame.center;
  const angle = rng() * Math.PI * 2;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const o = 3 * i;
  p.ages[i] = 0;
  if (p.kind === 'sparks') {
    p.lives[i] = range(rng, LIFE.sparks);
    p.positions[o] = cx + dx * 0.6 * r;
    p.positions[o + 1] = (0.75 + 0.25 * rng()) * (cy + r);
    p.positions[o + 2] = cz + dz * 0.6 * r;
    p.velocities[o] = dx * 0.3 * r;
    p.velocities[o + 1] = range(rng, [0.5, 0.9]) * r;
    p.velocities[o + 2] = dz * 0.3 * r;
  } else if (p.kind === 'fire') {
    p.lives[i] = range(rng, LIFE.fire);
    p.positions[o] = cx + dx * 0.55 * r;
    p.positions[o + 1] = 0.1 * r * rng();
    p.positions[o + 2] = cz + dz * 0.55 * r;
    p.velocities[o] = 0;
    p.velocities[o + 1] = range(rng, [0.6, 1.0]) * r;
    p.velocities[o + 2] = 0;
  }
  paint(p, i);
}

function wrap(value: number, limit: number): number {
  if (value > limit) return value - 2 * limit;
  if (value < -limit) return value + 2 * limit;
  return value;
}

export function createParticles(kind: ParticleKind, count: number, frame: EffectFrame, rng: () => number): Particles {
  const p: Particles = {
    kind,
    count,
    positions: new Float32Array(3 * count),
    colors: new Float32Array(3 * count),
    velocities: new Float32Array(3 * count),
    ages: new Float32Array(count),
    lives: new Float32Array(count),
  };
  const r = frame.radius;
  const [cx, cy, cz] = frame.center;
  for (let i = 0; i < count; i++) {
    if (kind === 'snow') {
      p.positions[3 * i] = cx + (rng() * 2 - 1) * 1.4 * r;
      p.positions[3 * i + 1] = rng() * (cy + 1.4 * r);
      p.positions[3 * i + 2] = cz + (rng() * 2 - 1) * 1.4 * r;
      p.velocities[3 * i + 1] = -range(rng, [0.25, 0.4]) * r;
      p.lives[i] = Infinity;
      paint(p, i);
    } else {
      spawn(p, i, frame, rng);
      p.ages[i] = rng() * p.lives[i]!;
      paint(p, i);
    }
  }
  for (let t = 0; t < PREWARM_S - 1e-9; t += PREWARM_STEP) stepParticles(p, frame, PREWARM_STEP, rng);
  return p;
}

export function stepParticles(p: Particles, frame: EffectFrame, delta: number, rng: () => number): void {
  const r = frame.radius;
  const [cx, cy, cz] = frame.center;
  for (let i = 0; i < p.count; i++) {
    const o = 3 * i;
    const before = p.ages[i]!;
    const after = before + delta;
    p.ages[i] = after;
    if (p.kind === 'snow') {
      const phase = i * GOLDEN;
      const sway = 0.08 * r * (Math.sin(SWAY_HZ * after + phase) - Math.sin(SWAY_HZ * before + phase));
      p.positions[o] = cx + wrap(p.positions[o]! - cx + sway, 1.4 * r);
      p.positions[o + 2] = cz + wrap(p.positions[o + 2]! - cz + sway * 0.5, 1.4 * r);
      let y = p.positions[o + 1]! + p.velocities[o + 1]! * delta;
      if (y < 0) y += cy + 1.4 * r;
      p.positions[o + 1] = y;
      continue;
    }
    if (after >= p.lives[i]!) {
      spawn(p, i, frame, rng);
      continue;
    }
    if (p.kind === 'sparks') p.velocities[o + 1] = p.velocities[o + 1]! - GRAVITY * r * delta;
    else {
      const phase = i * GOLDEN;
      p.positions[o] = p.positions[o]! + 0.05 * r * (Math.sin(SWAY_HZ * after + phase) - Math.sin(SWAY_HZ * before + phase));
    }
    p.positions[o] = p.positions[o]! + p.velocities[o]! * delta;
    p.positions[o + 1] = p.positions[o + 1]! + p.velocities[o + 1]! * delta;
    p.positions[o + 2] = p.positions[o + 2]! + p.velocities[o + 2]! * delta;
    paint(p, i);
  }
}
