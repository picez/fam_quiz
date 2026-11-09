import { Vector3, type BufferGeometry } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { TROPHY_ANCHORS, profileRadius, type BandAnchor, type Profile, type Spot } from '../anchors';
import { glbGeometry } from './glb-fixture';
import { BAND_LIFT, bandEdgeRadius, profileBand, projectDecal, sharedGeometry } from './surface-geometry';

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

  it('null is cached too', () => {
    const make = vi.fn(() => null);
    expect(sharedGeometry('empty', make)).toBeNull();
    expect(sharedGeometry('empty', make)).toBeNull();
    expect(make).toHaveBeenCalledTimes(1);
  });
});
