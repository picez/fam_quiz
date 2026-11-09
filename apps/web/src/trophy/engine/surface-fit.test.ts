import { Vector3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { STICKER_PLACES } from '@quiz/shared';
import { NEW_KINDS_25E, TROPHY_ANCHORS, profileRadius, type BandAnchor, type Plate, type Spot } from '../anchors';
import { gemSpots } from '../decor-layout';
import { glbGeometry } from './glb-fixture';
import { DECAL_DEPTH, profileBand, projectDecal } from './surface-geometry';

/** Осі проєктора, як у projectDecal: up — Y у площині нормалі (для майже вертикальної — Z), right = up × normal. */
function frame(spot: Spot): { normal: Vector3; up: Vector3; right: Vector3 } {
  const normal = new Vector3(...spot.normal).normalize();
  const up = Math.abs(normal.y) > 0.99 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  up.addScaledVector(normal, -up.dot(normal)).normalize();
  return { normal, up, right: new Vector3().crossVectors(up, normal) };
}

/** Площа трикутників декалі, спроєктованих на площину плями (шари одне над одним рахуються кожен). */
function projectedArea(decal: BufferGeometry, spot: Spot): number {
  const { normal } = frame(spot);
  const position = decal.getAttribute('position');
  const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()];
  let area = 0;
  for (let k = 0; k + 2 < position.count; k += 3) {
    a.fromBufferAttribute(position, k);
    b.fromBufferAttribute(position, k + 1);
    c.fromBufferAttribute(position, k + 2);
    area += Math.abs(b.clone().sub(a).cross(c.clone().sub(a)).dot(normal)) / 2;
  }
  return area;
}

/** Табличка (і поясок на грані) — пластина, повернута навколо X на tiltX від лиця +Z. */
const plateNormal = (plate: Plate): readonly [number, number, number] => [0, -Math.sin(plate.tiltX), Math.cos(plate.tiltX)];

/**
 * Плями, менші за глибину проєктора (±DECAL_DEPTH), за якими модель продовжується: там декаль лягає й на те, що ззаду,
 * але воно сховане за самою плямою. Вузол вінка (куля r 0.024): за ним гілка-тор (z 0…0.012) і стрижень.
 */
const HIDDEN_BEHIND: Record<string, number> = {
  'laurel sticker front': DECAL_DEPTH,
  'olive sticker front': DECAL_DEPTH,
};

const meshes = new Map<string, BufferGeometry>();
const meshOf = (kind: string) => meshes.get(kind) ?? meshes.set(kind, glbGeometry(kind)).get(kind)!;

describe('25e decor places lie on the real model', () => {
  it.each(NEW_KINDS_25E)('%s every spot lies on the surface', (kind) => {
    const anchors = TROPHY_ANCHORS[kind];
    const spots: { name: string; spot: Spot; gem: boolean }[] = [];
    const add = (name: string, spot: Spot | undefined, gem = false) => spot && spots.push({ name, spot, gem });
    add('medallion', anchors.medallion);
    add('back', anchors.back);
    add('base-back', anchors.baseBack);
    for (const place of STICKER_PLACES) add(`sticker ${place}`, anchors.stickers[place]);
    if (anchors.gems) for (const n of [1, 4, 8]) gemSpots(anchors.gems, n).forEach((g, i) => add(`gem ${n}.${i}`, g, true));
    expect(spots.length).toBeGreaterThan(0);
    for (const { name, spot, gem } of spots) {
      // Без підйому: вершини лежать рівно на поверхні моделі.
      const decal = projectDecal(meshOf(kind), spot, 0);
      expect(decal, `${kind} ${name}`).not.toBeNull();
      const need = gem ? 0.5 * ((Math.PI * spot.size ** 2) / 4) : 0.6 * spot.size ** 2;
      expect(projectedArea(decal!, spot), `${kind} ${name} area`).toBeGreaterThanOrEqual(need);
      // Кожна вершина — не далі size / 2 + 0.01 від центру плями по кожній осі проєктора (у площині плями й по нормалі):
      // декаль не перекидається на далекі частини моделі.
      const { normal, up, right } = frame(spot);
      const center = new Vector3(...spot.position);
      const position = decal!.getAttribute('position');
      const limit = spot.size / 2 + 0.01;
      const depthLimit = HIDDEN_BEHIND[`${kind} ${name}`] ?? limit;
      for (let i = 0; i < position.count; i++) {
        const offset = new Vector3().fromBufferAttribute(position, i).sub(center);
        for (const [axis, value, most] of [
          ['right', offset.dot(right), limit],
          ['up', offset.dot(up), limit],
          ['normal', offset.dot(normal), depthLimit],
        ] as const) {
          expect(Math.abs(value), `${kind} ${name} ${axis}`).toBeLessThanOrEqual(most);
        }
      }
    }
  });

  it.each(NEW_KINDS_25E)('%s plates and face bands sit on a face', (kind) => {
    const anchors = TROPHY_ANCHORS[kind];
    const plates: { name: string; plate: Plate }[] = [];
    if (anchors.plaque) plates.push({ name: 'plaque', plate: anchors.plaque });
    for (const slot of ['ring', 'rim', 'band'] as const) {
      const band = anchors[slot];
      if (band?.shape === 'face') plates.push({ name: slot, plate: band.plate });
    }
    for (const { name, plate } of plates) {
      // Квадрати зі стороною min(width, height) від краю до краю таблички: жоден не звисає з грані.
      const size = Math.min(plate.width, plate.height);
      const steps = Math.ceil((plate.width - size) / size) + 1;
      for (let i = 0; i < steps; i++) {
        const along = steps === 1 ? 0 : -(plate.width - size) / 2 + ((plate.width - size) * i) / (steps - 1);
        const [x, y, z] = plate.position;
        const spot: Spot = { position: [x + along, y, z], normal: plateNormal(plate), size, surface: plate.surface };
        const decal = projectDecal(meshOf(kind), spot, 0);
        expect(decal, `${kind} ${name} at ${along.toFixed(3)}`).not.toBeNull();
        expect(projectedArea(decal!, spot), `${kind} ${name} at ${along.toFixed(3)}`).toBeGreaterThanOrEqual(0.9 * size ** 2);
      }
    }
  });

  it.each(NEW_KINDS_25E)('%s profile bands hug the body', (kind) => {
    const anchors = TROPHY_ANCHORS[kind];
    const bands = (['ring', 'rim', 'band'] as const)
      .map((slot) => [slot, anchors[slot]] as const)
      .filter((entry): entry is readonly [(typeof entry)[0], Extract<BandAnchor, { shape: 'profile' }>] => entry[1]?.shape === 'profile');
    for (const [slot, band] of bands) {
      const profile = anchors.profile!;
      const first = profile.points[0]![1];
      const last = profile.points[profile.points.length - 1]![1];
      expect(band.y0, `${kind} ${slot}`).toBeGreaterThanOrEqual(first);
      expect(band.y1, `${kind} ${slot}`).toBeLessThanOrEqual(last);
      expect(band.y1).toBeGreaterThan(band.y0);
      const position = profileBand(profile, band.y0, band.y1).getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        const p = new Vector3().fromBufferAttribute(position, i);
        const gap = Math.hypot(p.x, p.z) - profileRadius(profile, p.y);
        expect(gap, `${kind} ${slot} y ${p.y.toFixed(4)}`).toBeGreaterThanOrEqual(0.0025);
        expect(gap, `${kind} ${slot} y ${p.y.toFixed(4)}`).toBeLessThanOrEqual(0.006);
      }
    }
  });
});
