// Типів node у вебі немає, тож fs описано тут вручну.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { DECOR_SUPPORT, TROPHY_KINDS } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { TROPHY_ANCHORS, type Spot } from './anchors';

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
        expect(v).toBeGreaterThanOrEqual(min![i]! - 0.08);
        expect(v).toBeLessThanOrEqual(max![i]! + 0.08);
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
});
