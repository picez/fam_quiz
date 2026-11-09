// Типів node у вебі немає, тож fs описано тут вручну.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { DECOR_SUPPORT, TROPHY_KINDS } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { TROPHY_ANCHORS, profileRadius, type BandAnchor, type Spot } from './anchors';
import { gemSpots } from './decor-layout';

const dir = ['apps/web/public/models', 'public/models'].find((path) => existsSync(`${path}/cup.glb`) as boolean)!;

interface Bytes {
  readUInt32LE(at: number): number;
  readFloatLE(at: number): number;
  subarray(from: number, to: number): { toString(encoding: string): string };
}
interface Glb {
  file: Bytes;
  binStart: number;
  json: { accessors: { min: number[]; max: number[]; count: number }[]; bufferViews: { byteOffset?: number }[] };
}
function glb(kind: string): Glb {
  const file = readFileSync(`${dir}/${kind}.glb`) as Bytes;
  const length = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + length).toString('utf8')) as Glb['json'];
  // Після JSON-чанка: 8 байт заголовка BIN-чанка.
  return { file, binStart: 20 + length + 8, json };
}
function bounds(kind: string): { min: number[]; max: number[] } {
  return glb(kind).json.accessors[0]!;
}
/** Позиції вершин моделі (accessor 0 → bufferView 0) по три числа. */
function positions(kind: string): Float32Array {
  const { file, binStart, json } = glb(kind);
  const count = json.accessors[0]!.count;
  const offset = binStart + (json.bufferViews[0]!.byteOffset ?? 0);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < out.length; i++) out[i] = file.readFloatLE(offset + i * 4);
  return out;
}

/** Точка смуги, що найдалі від осі (для перевірки меж моделі). */
function bandPoints(kind: (typeof TROPHY_KINDS)[number], band: BandAnchor): (readonly number[])[] {
  switch (band.shape) {
    case 'profile': {
      const profile = TROPHY_ANCHORS[kind].profile!;
      return [band.y0, band.y1].map((y) => [0, y, profileRadius(profile, y)]);
    }
    case 'raised':
      return [[0, band.y, Math.max(band.radiusTop, band.radiusBottom)]];
    case 'face':
      return [band.plate.position];
  }
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
      shape: 'raised',
      surface: 'body',
      y: 1.0,
      height: 0.52,
      radiusTop: 0.49,
      radiusBottom: 0.475,
      segments: 120,
      tori: [
        { y: 1.27, radius: 0.5, tube: 0.028 },
        { y: 0.73, radius: 0.485, tube: 0.028 },
      ],
    });
    expect(grail.rim).toEqual({
      shape: 'raised',
      surface: 'body',
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
    // 25d: табличка піднята над пояском основи (було y 0.085, z 0.235 — нижній край лягав на поясок).
    expect(grail.plaque).toEqual({ position: [0, 0.13, 0.225], tiltX: -0.32, width: 0.46, height: 0.18, surface: 'base' });
  });

  it('grail plaque rests on the base slope above the band', () => {
    const { plaque, band, profile } = TROPHY_ANCHORS.grail;
    if (band!.shape !== 'profile') throw new Error('grail band is a profile band');
    const half = plaque!.height / 2;
    const bottomY = plaque!.position[1] - half * Math.cos(plaque!.tiltX);
    const bottomZ = plaque!.position[2] - half * Math.sin(plaque!.tiltX);
    expect(plaque!.position[1] - half).toBeGreaterThanOrEqual(band!.y1 + 0.01 - 1e-9);
    // Нижній край лежить на поверхні основи (не далі 0.01 від профілю).
    expect(Math.abs(bottomZ - profileRadius(profile!, bottomY))).toBeLessThan(0.01);
  });

  it.each(TROPHY_KINDS.filter((kind) => TROPHY_ANCHORS[kind].profile !== undefined))(
    '%s profile points are vertices of the model',
    (kind) => {
      const profile = TROPHY_ANCHORS[kind].profile!;
      const vertices = positions(kind);
      for (let i = 1; i < profile.points.length; i++) {
        expect(profile.points[i]![1]).toBeGreaterThanOrEqual(profile.points[i - 1]![1]);
      }
      for (const [r, y] of profile.points) {
        let found = false;
        for (let i = 0; i < vertices.length && !found; i += 3) {
          // Лате починає з кута 0: x = r, z = 0.
          found =
            Math.abs(vertices[i]! - r) < 1e-3 && Math.abs(vertices[i + 1]! - y) < 1e-3 && Math.abs(vertices[i + 2]!) < 1e-3;
        }
        expect(found, `${kind} [${r}, ${y}]`).toBe(true);
      }
    },
  );

  it('profile radius interpolates and clamps', () => {
    const profile = { points: [[0.1, 0], [0.3, 1], [0.2, 2]] as const, segments: 4 };
    expect(profileRadius(profile, 0.5)).toBeCloseTo(0.2);
    expect(profileRadius(profile, 1.5)).toBeCloseTo(0.25);
    expect(profileRadius(profile, 1)).toBe(0.3);
    expect(profileRadius(profile, -1)).toBe(0.1);
    expect(profileRadius(profile, 5)).toBe(0.2);
    // Рівні y (дно грааля [0,0] → [0.26,0]): береться зовнішній край.
    const flat = { points: [[0, 0], [0.26, 0], [0.27, 0.03]] as const, segments: 4 };
    expect(profileRadius(flat, 0)).toBe(0.26);
  });

  it.each(TROPHY_KINDS)('%s every spot names a known surface', (kind) => {
    const anchors = TROPHY_ANCHORS[kind];
    const known = new Set(Object.keys(anchors.surfaces));
    const named: string[] = [...Object.values(anchors.stickers)].map((s) => s.surface);
    for (const s of [anchors.medallion, anchors.back, anchors.baseBack, anchors.gems, anchors.plaque]) {
      if (s) named.push(s.surface);
    }
    for (const band of [anchors.ring, anchors.rim, anchors.band]) {
      if (band) named.push(band.shape === 'face' ? band.plate.surface : band.surface);
    }
    for (const surface of named) expect(known, `${kind}: ${surface}`).toContain(surface);
    for (const band of [anchors.ring, anchors.rim, anchors.band]) {
      if (band?.shape === 'profile') {
        expect(anchors.profile).toBeDefined();
        expect(anchors.surfaces[band.surface]).toBe('revolved');
      }
    }
  });

  it('cup band lies on the plinth face', () => {
    const { band, plaque } = TROPHY_ANCHORS.cup;
    expect(band!.shape).toBe('face');
    if (band!.shape !== 'face') return;
    const { plate } = band!;
    expect(plate.surface).toBe('plinth-front');
    expect(plate.position[2]).toBeGreaterThanOrEqual(0.184);
    expect(plate.position[2]).toBeLessThanOrEqual(0.188);
    expect(plate.width).toBeLessThanOrEqual(0.368 - 0.02);
    const bottom = plate.position[1] - plate.height / 2;
    const top = plate.position[1] + plate.height / 2;
    expect(bottom).toBeGreaterThanOrEqual(plaque!.position[1] + plaque!.height / 2 + 0.01 - 1e-9);
    expect(top).toBeLessThanOrEqual(0.2);
  });

  it('statuette band sits above the plinth', () => {
    const band = TROPHY_ANCHORS.statuette.band!;
    expect(band.shape).toBe('profile');
    if (band.shape !== 'profile') return;
    expect(band.y0).toBeGreaterThanOrEqual(0.255);
  });

  it('cup base-back is on the back face', () => {
    expect(TROPHY_ANCHORS.cup.baseBack).toEqual({ position: [0, 0.1, -0.186], normal: [0, 0, -1], size: 0.16, surface: 'plinth-back' });
  });

  it.each(TROPHY_KINDS)('%s normals are unit and spots sit on the model', (kind) => {
    const { min, max } = bounds(kind);
    // Запечений грааль — голе тіло: кільце, рим і табличку малює рушій поверх нього, тож межі ширші.
    const slack = kind === 'grail' ? 0.08 : 0.03;
    const anchors = TROPHY_ANCHORS[kind];
    const spots: Spot[] = [...Object.values(anchors.stickers)];
    if (anchors.medallion) spots.push(anchors.medallion);
    if (anchors.back) spots.push(anchors.back);
    if (anchors.baseBack) spots.push(anchors.baseBack);
    const points: (readonly number[])[] = spots.map((s) => s.position);
    if (anchors.plaque) points.push(anchors.plaque.position);
    if (anchors.gems) points.push(anchors.gems.center);
    for (const band of [anchors.ring, anchors.rim, anchors.band]) {
      if (band) points.push(...bandPoints(kind, band));
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
    const { ring, profile } = TROPHY_ANCHORS.cup;
    expect(ring).toMatchObject({ shape: 'profile', surface: 'bowl', y0: 0.72, y1: 0.94 });
    // Зовнішній профіль чаші з build-trophies.mjs, cup(): …, [0.3, 0.8], ….
    expect(profileRadius(profile!, 0.8)).toBe(0.3);
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
