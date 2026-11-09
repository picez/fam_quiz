import { Vector3, type BufferGeometry } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STICKER_PLACES, type TrophyKind } from '@quiz/shared';
import { TROPHY_ANCHORS, profileRadius, type BandAnchor, type Profile, type Spot } from '../anchors';
import { gemSpots } from '../decor-layout';
import { glbGeometry } from './glb-fixture';
import { BAND_LIFT, bandEdgeRadius, profileBand, projectDecal, resetSharedGeometry, sharedGeometry } from './surface-geometry';

afterEach(() => resetSharedGeometry());

const cup = TROPHY_ANCHORS.cup;
const cupProfile = cup.profile!;
const cupFront = cup.stickers.front!;

function vertices(geometry: BufferGeometry): { p: Vector3; n: Vector3; u: number; v: number }[] {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  return Array.from({ length: position.count }, (_, i) => ({
    p: new Vector3().fromBufferAttribute(position, i),
    n: new Vector3().fromBufferAttribute(normal, i),
    u: uv.getX(i),
    v: uv.getY(i),
  }));
}

/** Осі проєктора, як у projectDecal: up — Y у площині нормалі, right = up × normal. */
function frame(spot: Spot): { normal: Vector3; up: Vector3; right: Vector3 } {
  const normal = new Vector3(...spot.normal).normalize();
  const up = new Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
  return { normal, up, right: new Vector3().crossVectors(up, normal) };
}

describe('projectDecal', () => {
  const cupMesh = glbGeometry('cup');

  it('cup front sticker decal lies on the bowl', () => {
    const decal = projectDecal(cupMesh, cupFront)!;
    expect(decal).not.toBeNull();
    expect(decal.index).toBeNull();
    const list = vertices(decal);
    expect(list.length).toBeGreaterThan(30);
    const spotNormal = new Vector3(...cupFront.normal);
    for (const { p, n, u, v } of list) {
      const gap = Math.hypot(p.x, p.z) - profileRadius(cupProfile, p.y);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(0.006);
      expect(p.z).toBeGreaterThan(0.2);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(n.dot(spotNormal)).toBeGreaterThan(0.25);
    }
  });

  it('medal medallion decal skips the back and the sides', () => {
    const decal = projectDecal(glbGeometry('medal'), TROPHY_ANCHORS.medal.medallion!)!;
    expect(decal).not.toBeNull();
    for (const { n } of vertices(decal)) expect(n.z).toBeGreaterThan(0.25);
  });

  it('decal size stays within the projector box', () => {
    // Без підйому: підйом іде по нормалі вершини, а на вигнутій чаші вона трохи вбік від осі проєктора.
    const decal = projectDecal(cupMesh, cupFront, 0)!;
    const { up, right } = frame(cupFront);
    const center = new Vector3(...cupFront.position);
    for (const { p } of vertices(decal)) {
      const offset = p.clone().sub(center);
      expect(Math.abs(offset.dot(right))).toBeLessThanOrEqual(cupFront.size / 2 + 1e-6);
      expect(Math.abs(offset.dot(up))).toBeLessThanOrEqual(cupFront.size / 2 + 1e-6);
    }
  });

  it('decal in the air is null', () => {
    expect(projectDecal(cupMesh, { ...cupFront, position: [0, 2, 0] })).toBeNull();
  });

  it('decal reads upright from the front', () => {
    const list = vertices(projectDecal(cupMesh, cupFront)!);
    const top = list.reduce((best, next) => (next.p.y > best.p.y ? next : best));
    const rightmost = list.reduce((best, next) => (next.p.x > best.p.x ? next : best));
    expect(top.v).toBeGreaterThan(0.9);
    expect(rightmost.u).toBeGreaterThan(0.9);
  });

  it('decal on a flat plinth face is lifted along the face normal', () => {
    const spot = cup.stickers['base-left']!;
    const list = vertices(projectDecal(cupMesh, spot)!);
    expect(list.length).toBeGreaterThan(0);
    // Грань постаменту: half 0.26 · cos45 від осі; декаль на 0.0015 зовні.
    for (const { p } of list) expect(p.x).toBeCloseTo(-0.26 * Math.SQRT1_2 - 0.0015, 4);
  });
});

/** Частка точок сітки uv у колі r (центр 0.5) чи в квадраті [0.5 − r, 0.5 + r], накритих трикутниками декалі в uv. */
function coverage(decal: BufferGeometry, shape: 'disc' | 'square', r: number): number {
  const uv = decal.getAttribute('uv');
  const triangles: number[][] = [];
  for (let k = 0; k + 2 < uv.count; k += 3) triangles.push([0, 1, 2].flatMap((c) => [uv.getX(k + c), uv.getY(k + c)]));
  const inside = (x: number, y: number, t: number[]) => {
    const [ax, ay, bx, by, cx, cy] = t as [number, number, number, number, number, number];
    const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
    const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
    const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
    const eps = 1e-9;
    return !((d1 < -eps || d2 < -eps || d3 < -eps) && (d1 > eps || d2 > eps || d3 > eps));
  };
  const steps = 24;
  let total = 0;
  let covered = 0;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = 0.5 - r + (2 * r * i) / steps;
      const y = 0.5 - r + (2 * r * j) / steps;
      if (shape === 'disc' && Math.hypot(x - 0.5, y - 0.5) > r) continue;
      total++;
      if (triangles.some((t) => inside(x, y, t))) covered++;
    }
  }
  return covered / total;
}

/** Кожна пляма кожної форми: медальйон, зворот (і запасний), наліпки, самоцвіти для 1–8 фото. */
const allSpots = (Object.keys(TROPHY_ANCHORS) as TrophyKind[]).flatMap((kind) => {
  const anchors = TROPHY_ANCHORS[kind];
  const spots: { name: string; kind: TrophyKind; spot: Spot }[] = [];
  const add = (name: string, spot: Spot | undefined) => spot && spots.push({ name: `${kind} ${name}`, kind, spot });
  add('medallion', anchors.medallion);
  add('back', anchors.back);
  add('base-back', anchors.baseBack);
  for (const place of STICKER_PLACES) add(`sticker ${place}`, anchors.stickers[place]);
  if (anchors.gems) for (let n = 1; n <= 8; n++) gemSpots(anchors.gems, n).forEach((gem, i) => add(`gem ${n}.${i}`, gem));
  return spots;
});

describe('decal coverage', () => {
  const meshes = new Map<TrophyKind, BufferGeometry>();
  const meshOf = (kind: TrophyKind) => meshes.get(kind) ?? meshes.set(kind, glbGeometry(kind)).get(kind)!;

  it.each(allSpots)('$name covers its disc and its square', ({ kind, spot }) => {
    const decal = projectDecal(meshOf(kind), spot);
    expect(decal).not.toBeNull();
    // Фото й написи — кружечки (r 0.45 у uv); наліпка — квадратна картинка, поля 0.03.
    expect(coverage(decal!, 'disc', 0.45)).toBeGreaterThanOrEqual(0.99);
    expect(coverage(decal!, 'square', 0.47)).toBeGreaterThanOrEqual(0.99);
  });
});

describe('profileBand', () => {
  it('cup ring band never sinks into the bowl', () => {
    const band = profileBand(cupProfile, 0.72, 0.94);
    const position = band.getAttribute('position');
    const uv = band.getAttribute('uv');
    expect(position.count).toBe(17 * (cupProfile.segments * 3 + 1));
    for (let i = 0; i < position.count; i++) {
      const p = new Vector3().fromBufferAttribute(position, i);
      const gap = Math.hypot(p.x, p.z) - profileRadius(cupProfile, p.y);
      expect(gap).toBeGreaterThanOrEqual(0.0025);
      expect(gap).toBeLessThanOrEqual(0.006);
    }
    // Перший трикутник — спереду, нормаль назовні.
    const index = band.index!;
    const [a, b, c] = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(position, index.getX(k)));
    const face = new Vector3().crossVectors(b!.clone().sub(a!), c!.clone().sub(a!));
    const radial = new Vector3(a!.x, 0, a!.z);
    expect(face.dot(radial)).toBeGreaterThan(0);
    // u = 0 спереду (+Z).
    for (let i = 0; i < position.count; i++) {
      if (uv.getX(i) !== 0) continue;
      expect(position.getX(i)).toBeCloseTo(0, 6);
      expect(position.getZ(i)).toBeGreaterThan(0);
    }
  });

  /**
   * Смуга зовні моделі й між рядами: модель на висоті y не далі від осі за profileRadius(y) (меридіан — відрізки профілю,
   * по колу — хорди), смуга між рядами — відрізок між сусідніми точками, а по колу — хорда з profile.segments × 3.
   */
  const profileBands = (Object.entries(TROPHY_ANCHORS) as [string, (typeof TROPHY_ANCHORS)['cup']][]).flatMap(([kind, anchors]) =>
    (['ring', 'rim', 'band'] as const)
      .map((slot) => [slot, anchors[slot]] as const)
      .filter((entry): entry is readonly [typeof entry[0], Extract<BandAnchor, { shape: 'profile' }>] => entry[1]?.shape === 'profile')
      .map(([slot, anchor]) => ({ name: `${kind} ${slot}`, profile: anchors.profile!, anchor })),
  );

  it.each(profileBands)('$name stays outside the model surface at sampled heights', ({ profile, anchor }) => {
    const band = profileBand(profile, anchor.y0, anchor.y1);
    const position = band.getAttribute('position');
    // Меридіан спереду (стовпець 0): 17 точок знизу вгору.
    const meridian = Array.from({ length: 17 }, (_, j) => new Vector3().fromBufferAttribute(position, j));
    const chord = Math.cos(Math.PI / (profile.segments * 3));
    for (let j = 0; j < 16; j++) {
      const lower = meridian[j]!;
      const upper = meridian[j + 1]!;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const y = lower.y + (upper.y - lower.y) * t;
        const r = (lower.z + (upper.z - lower.z) * t) * chord;
        expect(r - profileRadius(profile, y), `y ${y.toFixed(4)}`).toBeGreaterThan(0.001);
      }
    }
  });

  it('bandEdgeRadius sits on the band lift plus the tube', () => {
    expect(bandEdgeRadius(cupProfile, 0.8, 0.012)).toBeCloseTo(0.3 + BAND_LIFT + 0.012, 9);
  });

  it('a band on a straight profile is lifted by BAND_LIFT', () => {
    const flat: Profile = { points: [[0.2, 0], [0.2, 1]], segments: 4 };
    const band = profileBand(flat, 0.2, 0.4);
    const position = band.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      expect(Math.hypot(position.getX(i), position.getZ(i))).toBeCloseTo(0.2 + BAND_LIFT, 6);
    }
  });
});

describe('sharedGeometry', () => {
  it('shared geometry is built once', () => {
    const made = projectDecal(glbGeometry('cup'), cupFront)!;
    const make = vi.fn(() => made);
    const first = sharedGeometry('k', make);
    const second = sharedGeometry('k', make);
    expect(first).toBe(made);
    expect(second).toBe(first);
    expect(make).toHaveBeenCalledTimes(1);
    expect(first!.userData.shared).toBe(true);
  });

  it('null is not cached', () => {
    const make = vi.fn(() => null);
    expect(sharedGeometry('empty', make)).toBeNull();
    expect(sharedGeometry('empty', make)).toBeNull();
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('reset empties the cache', () => {
    const make = vi.fn(() => projectDecal(glbGeometry('cup'), cupFront));
    const first = sharedGeometry('k', make);
    resetSharedGeometry();
    const second = sharedGeometry('k', make);
    expect(second).not.toBe(first);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('a small spot on a slope keeps the full projector depth', () => {
    // Самоцвіт зірки на схилі грані: коробка size³ (±0.02) обрізала край фото.
    const gem = gemSpots(TROPHY_ANCHORS.star.gems!, 2)[1]!;
    const decal = projectDecal(glbGeometry('star'), gem, 0)!;
    const normal = new Vector3(...gem.normal);
    const center = new Vector3(...gem.position);
    const depths = vertices(decal).map(({ p }) => p.clone().sub(center).dot(normal));
    expect(Math.min(...depths)).toBeLessThan(-gem.size / 2);
  });
});
