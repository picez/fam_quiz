// Типів node у вебі немає, тож fs описано тут вручну.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { DECOR_SUPPORT, TROPHY_KINDS } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { TROPHY_ANCHORS, type Spot } from './anchors';
import { gemSpots } from './decor-layout';

const dir = ['apps/web/public/models', 'public/models'].find((path) => existsSync(`${path}/cup.glb`) as boolean)!;

interface Bytes {
  readUInt32LE(at: number): number;
  subarray(from: number, to: number): { toString(encoding: string): string };
}
function bounds(kind: string): { min: number[]; max: number[] } {
  const file = readFileSync(`${dir}/${kind}.glb`) as Bytes;
  const length = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + length).toString('utf8')) as {
    accessors: { min: number[]; max: number[] }[];
  };
  return json.accessors[0]!;
}

describe('trophy anchors', () => {
  it.each(TROPHY_KINDS)('%s anchors match the support table', (kind) => {
    const support = DECOR_SUPPORT[kind];
    const anchors = TROPHY_ANCHORS[kind];
    const expected = new Set<string>();
    if (support.photo.includes('ring')) expected.add('ring');
    if (support.photo.includes('medallion')) expected.add('medallion');
    if (support.photo.includes('gems')) expected.add('gems');
    if (support.photo.includes('plaque') || support.inscription.includes('plaque')) expected.add('plaque');
    if (support.inscription.includes('rim')) expected.add('rim');
    if (support.inscription.includes('band')) expected.add('band');
    if (support.inscription.includes('back')) expected.add('back');
    const present = (['ring', 'rim', 'band', 'medallion', 'back', 'gems', 'plaque'] as const).filter(
      (key) => anchors[key] !== undefined,
    );
    expect(new Set(present)).toEqual(expected);
    expect(Object.keys(anchors.stickers).sort()).toEqual([...support.sticker].sort());
  });

  it('grail anchors are the baked ones', () => {
    const grail = TROPHY_ANCHORS.grail;
    expect(grail.ring).toEqual({
      y: 1.0,
      height: 0.52,
      radiusTop: 0.49,
      radiusBottom: 0.475,
      segments: 0,
      tori: [
        { y: 1.27, radius: 0.5, tube: 0.028 },
        { y: 0.73, radius: 0.485, tube: 0.028 },
      ],
    });
    expect(grail.rim).toEqual({
      y: 1.37,
      height: 0.16,
      radiusTop: 0.463,
      radiusBottom: 0.455,
      segments: 220,
      tori: [
        { y: 1.455, radius: 0.452, tube: 0.012 },
        { y: 1.285, radius: 0.452, tube: 0.012 },
      ],
    });
    expect(grail.plaque).toEqual({ position: [0, 0.085, 0.235], tiltX: -0.32, width: 0.46, height: 0.18 });
  });

  it.each(TROPHY_KINDS)('%s normals are unit and spots sit on the model', (kind) => {
    const { min, max } = bounds(kind);
    // Запечений грааль — голе тіло: кільце, рим і табличку малює рушій поверх нього, тож межі ширші.
    const slack = kind === 'grail' ? 0.08 : 0.03;
    const anchors = TROPHY_ANCHORS[kind];
    const spots: Spot[] = [...Object.values(anchors.stickers)];
    if (anchors.medallion) spots.push(anchors.medallion);
    if (anchors.back) spots.push(anchors.back);
    const points: (readonly number[])[] = spots.map((s) => s.position);
    if (anchors.plaque) points.push(anchors.plaque.position);
    if (anchors.gems) points.push(anchors.gems.center);
    for (const band of [anchors.ring, anchors.rim, anchors.band]) {
      if (band) points.push([0, band.y, Math.max(band.radiusTop, band.radiusBottom)]);
    }
    for (const spot of spots) {
      expect(Math.abs(Math.hypot(...spot.normal) - 1)).toBeLessThan(1e-6);
    }
    for (const p of points) {
      p.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(min![i]! - slack);
        expect(v).toBeLessThanOrEqual(max![i]! + slack);
      });
    }
  });

  it('cup left and right stickers sit clear of the handles', () => {
    const { left, right } = TROPHY_ANCHORS.cup.stickers;
    for (const spot of [left!, right!]) {
      const [x, , z] = spot.position;
      // Ручки лежать у площині XY (z = 0): відстань від осі X за кутом.
      expect((Math.atan2(Math.abs(z), Math.abs(x)) * 180) / Math.PI).toBeGreaterThan(30);
    }
  });

  it('cup ring hugs the bowl', () => {
    // Зовнішній профіль чаші з build-trophies.mjs, cup(): [0.22,0.66], [0.3,0.8], [0.33,0.95].
    const profile = [
      [0.66, 0.22],
      [0.8, 0.3],
      [0.95, 0.33],
    ] as const;
    const body = (y: number): number => {
      const [a, b] = y <= profile[1][0] ? [profile[0], profile[1]] : [profile[1], profile[2]];
      return a[1] + ((b[1] - a[1]) * (y - a[0])) / (b[0] - a[0]);
    };
    const ring = TROPHY_ANCHORS.cup.ring!;
    for (let i = 0; i < 9; i++) {
      const y = ring.y - ring.height / 2 + (ring.height * i) / 8;
      const r = ring.radiusBottom + ((ring.radiusTop - ring.radiusBottom) * (y - (ring.y - ring.height / 2))) / ring.height;
      expect(r).toBeGreaterThanOrEqual(body(y) - 0.005);
      expect(r).toBeLessThanOrEqual(body(y) + 0.02);
    }
    const ys = ring.tori.map((torus) => torus.y).sort((a, b) => a - b);
    expect(Math.abs(ys[0]! - (ring.y - ring.height / 2))).toBeLessThanOrEqual(0.001);
    expect(Math.abs(ys[1]! - (ring.y + ring.height / 2))).toBeLessThanOrEqual(0.001);
  });

  it('crown gems clear the baked stones', () => {
    // build-trophies.mjs, crown(): камінці r 0.03 (0.35, y 0.28) і кульки r 0.035 (0.325, y 0.69) на 5 променях.
    const baked: { at: readonly [number, number, number]; r: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (2 * Math.PI * i) / 5;
      baked.push({ at: [0.35 * Math.cos(a), 0.28, 0.35 * Math.sin(a)], r: 0.03 });
      baked.push({ at: [0.325 * Math.cos(a), 0.69, 0.325 * Math.sin(a)], r: 0.035 });
    }
    const { gems, medallion, stickers } = TROPHY_ANCHORS.crown;
    const clear = (p: readonly number[], size: number): void => {
      for (const b of baked) {
        expect(Math.hypot(p[0]! - b.at[0], p[1]! - b.at[1], p[2]! - b.at[2])).toBeGreaterThanOrEqual(b.r + size / 2 + 0.005);
      }
    };
    for (let n = 1; n <= 8; n++) for (const g of gemSpots(gems!, n)) clear(g.position, gems!.size);
    clear(medallion!.position, medallion!.size);
    clear(stickers.front!.position, stickers.front!.size);
  });

  it('star decor sits on the face', () => {
    // build-trophies.mjs, star(): starShape(0.4, 0.17, 0.12, 0.04) на [0, 0.62, 0]; передня грань — трикутники центр–обід–обід.
    const rim: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 0.4 : 0.17;
      rim.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    const starFaceZ = (x: number, y: number): number => {
      const py = y - 0.62;
      for (let i = 0; i < 10; i++) {
        const a = rim[i]!;
        const b = rim[(i + 1) % 10]!;
        const d = a[0] * b[1] - a[1] * b[0];
        const u = (x * b[1] - py * b[0]) / d;
        const v = (a[0] * py - a[1] * x) / d;
        if (u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9) return 0.12 * (1 - u - v) + 0.04 * (u + v);
      }
      throw new Error(`point ${x},${y} is off the star`);
    };
    const { gems, stickers } = TROPHY_ANCHORS.star;
    const onFace = (p: readonly number[]): void => {
      const face = starFaceZ(p[0]!, p[1]!);
      expect(p[2]!).toBeGreaterThanOrEqual(face - 0.002);
      expect(p[2]!).toBeLessThanOrEqual(face + 0.02);
    };
    for (let n = 1; n <= 8; n++) for (const g of gemSpots(gems!, n)) onFace(g.position);
    onFace(stickers.left!.position);
    onFace(stickers.right!.position);
  });
});
