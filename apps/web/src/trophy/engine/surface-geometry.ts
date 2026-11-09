import { BufferGeometry, Float32BufferAttribute, LatheGeometry, Vector2, Vector3 } from 'three';
import { profileRadius, type Profile, type Spot } from '../anchors';

/** Підйом декалі над поверхнею по нормалі вершини. */
export const DECAL_LIFT = 0.0015;
/** Підйом смуги над профілем по нормалі профілю. */
export const BAND_LIFT = 0.003;

/** Поверхня, на яку лягає оформлення: геометрія завантаженої моделі; key — для кешу (url моделі). */
export interface Surface {
  key: string;
  geometry: BufferGeometry;
}

/** Трикутник, повернутий до проєктора менше за це (cos), відкидається: внутрішня стінка чаші, зворот, боки. */
const FACING = 0.25;
/** Нормаль вершини, що відхиляється від грані більше за це (cos), — з сусідньої грані на гострому ребрі; береться нормаль грані. */
const SMOOTH = 0.5;

const unitClamp = (value: number) => Math.min(1, Math.max(0, value));

/** Вершина в системі проєктора: p — (right, up, normal) відносно центру плями, n — нормаль вершини у світі. */
interface Point {
  p: Vector3;
  n: Vector3;
}

function clip(polygon: Point[], axis: 'x' | 'y' | 'z', sign: 1 | -1, half: number): Point[] {
  const out: Point[] = [];
  const inside = (point: Point) => sign * point.p[axis] <= half;
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;
    const currentIn = inside(current);
    const nextIn = inside(next);
    if (currentIn) out.push(current);
    if (currentIn !== nextIn) {
      const t = (half - sign * current.p[axis]) / (sign * (next.p[axis] - current.p[axis]));
      out.push({ p: current.p.clone().lerp(next.p, t), n: current.n.clone().lerp(next.n, t) });
    }
  }
  return out;
}

/**
 * Декаль плями на геометрії моделі (як DecalGeometry з three, але в просторі геометрії й без зворотних граней):
 * трикутники в кубі size³ з центром у spot.position обрізаються по його шести площинах, uv — з координат проєктора.
 * up — світовий Y у площині нормалі (для майже вертикальної нормалі — Z), right = up × normal.
 * Неіндексована, з position / normal / uv; null — під плямою немає поверхні.
 */
export function projectDecal(surface: BufferGeometry, spot: Spot, lift: number = DECAL_LIFT): BufferGeometry | null {
  const normal = new Vector3(...spot.normal).normalize();
  const up = Math.abs(normal.y) > 0.99 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  up.addScaledVector(normal, -up.dot(normal)).normalize();
  const right = new Vector3().crossVectors(up, normal);
  const center = new Vector3(...spot.position);
  const half = spot.size / 2;

  const position = surface.getAttribute('position');
  const normals = surface.getAttribute('normal');
  const index = surface.getIndex();
  const count = index ? index.count : position.count;
  const vertexAt = (k: number) => (index ? index.getX(k) : k);

  const positions: number[] = [];
  const outNormals: number[] = [];
  const uvs: number[] = [];
  const corner = [new Vector3(), new Vector3(), new Vector3()] as const;
  const face = new Vector3();
  const edge = new Vector3();
  const world = new Vector3();
  const local = (v: Vector3) => {
    edge.subVectors(v, center);
    return new Vector3(edge.dot(right), edge.dot(up), edge.dot(normal));
  };

  for (let k = 0; k + 2 < count; k += 3) {
    const ids = [vertexAt(k), vertexAt(k + 1), vertexAt(k + 2)];
    ids.forEach((id, c) => corner[c].fromBufferAttribute(position, id));
    face.subVectors(corner[1], corner[0]).cross(edge.subVectors(corner[2], corner[0]));
    if (face.lengthSq() === 0) continue;
    face.normalize();
    if (face.dot(normal) <= FACING) continue;
    let polygon: Point[] = ids.map((id, c) => {
      const n = normals ? new Vector3().fromBufferAttribute(normals, id).normalize() : face.clone();
      return { p: local(corner[c]), n: n.dot(face) < SMOOTH ? face.clone() : n };
    });
    for (const axis of ['x', 'y', 'z'] as const) {
      polygon = clip(polygon, axis, 1, half);
      polygon = clip(polygon, axis, -1, half);
      if (polygon.length < 3) break;
    }
    if (polygon.length < 3) continue;
    // Віялом від першої вершини.
    for (let i = 1; i + 1 < polygon.length; i++) {
      for (const point of [polygon[0]!, polygon[i]!, polygon[i + 1]!]) {
        const n = point.n.clone().normalize();
        world.copy(center).addScaledVector(right, point.p.x).addScaledVector(up, point.p.y).addScaledVector(normal, point.p.z).addScaledVector(n, lift);
        positions.push(world.x, world.y, world.z);
        outNormals.push(n.x, n.y, n.z);
        // Обрізання кладе вершини рівно на межу; округлення не виводить uv за [0, 1].
        uvs.push(unitClamp(point.p.x / spot.size + 0.5), unitClamp(point.p.y / spot.size + 0.5));
      }
    }
  }
  if (positions.length === 0) return null;
  const decal = new BufferGeometry();
  decal.setAttribute('position', new Float32BufferAttribute(positions, 3));
  decal.setAttribute('normal', new Float32BufferAttribute(outNormals, 3));
  decal.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return decal;
}

/** Зовнішня нормаль профілю [r, y] на висоті y (на зламі — бісектриса двох відрізків). */
function profileNormal(profile: Profile, y: number): Vector2 {
  const step = 1e-4;
  const along = (from: number, to: number) => new Vector2(profileRadius(profile, to) - profileRadius(profile, from), to - from).normalize();
  const tangent = along(y - step, y).add(along(y, y + step));
  // Повернута на −90°: назовні від осі для профілю знизу вгору.
  return new Vector2(tangent.y, -tangent.x).normalize();
}

/**
 * Смуга по профілю між y0 і y1: LatheGeometry з 17 рядів, рівномірно по y, кожна точка зсунута по нормалі профілю на lift;
 * profile.segments × 3 сегментів від phiStart = 0 — вершини моделі збігаються з кожною третьою вершиною смуги. u = 0 спереду (+Z).
 */
export function profileBand(profile: Profile, y0: number, y1: number, lift: number = BAND_LIFT): BufferGeometry {
  const rows = 17;
  const points = Array.from({ length: rows }, (_, j) => {
    const y = y0 + ((y1 - y0) * j) / (rows - 1);
    const n = profileNormal(profile, y);
    return new Vector2(profileRadius(profile, y) + n.x * lift, y + n.y * lift);
  });
  return new LatheGeometry(points, profile.segments * 3);
}

/** Радіус обідка-тора на краю смуги: над профілем на підйом смуги й товщину тора. */
export function bandEdgeRadius(profile: Profile, y: number, tube: number): number {
  return profileRadius(profile, y) + BAND_LIFT + tube;
}

const shared = new Map<string, BufferGeometry | null>();

/**
 * Геометрія з модульного кешу (ключ — url моделі, слот, розмір, кількість фото); будується раз, null теж кешується.
 * userData.shared = true: decorResources такі геометрії не звільняє. Ключів обмежено: 6 форм × ≤ 50.
 */
export function sharedGeometry(key: string, make: () => BufferGeometry | null): BufferGeometry | null {
  if (shared.has(key)) return shared.get(key)!;
  const geometry = make();
  if (geometry) geometry.userData.shared = true;
  shared.set(key, geometry);
  return geometry;
}
