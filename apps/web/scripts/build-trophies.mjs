/**
 * Одноразовий скрипт (не в CI): будує прості 3D-трофеї для призів (14a) з геометрії, без чужих файлів.
 *
 *   node apps/web/scripts/build-trophies.mjs
 *
 * Пише apps/web/public/models/{cup,medal,crown,star,statuette,grail}.glb і 15 форм 25e (lovingcup … fist, див. NEW_MODELS) —
 * glTF 2.0, один меш і один матеріал
 * (колір і металевість клієнт ставить сам після load). Моделі — власна робота проєкту, CC0 1.0 (див. CREDITS.txt).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/models');
const MAX_BYTES = 200_000;

/** Геометрія: позиції, нормалі, індекси. */
function mesh() {
  return { positions: [], normals: [], indices: [] };
}

function append(target, part) {
  const offset = target.positions.length / 3;
  target.positions.push(...part.positions);
  target.normals.push(...part.normals);
  for (const index of part.indices) target.indices.push(index + offset);
  return target;
}

function merge(...parts) {
  return parts.reduce(append, mesh());
}

const normalize = ([x, y, z]) => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};

/**
 * Тіло обертання навколо Y. profile — [[радіус, висота], …] знизу вгору; кожен відрізок — окремий пояс,
 * тож грані між відрізками гострі, а навколо осі — гладкі. phase — поворот (для квадратного постаменту з 4 сегментів).
 */
function lathe(profile, segments, phase = 0, { smooth = false } = {}) {
  const out = mesh();
  // Нормаль у площині профілю: перпендикуляр до відрізка, назовні.
  const segmentNormal = (i) => {
    const dr = profile[i + 1][0] - profile[i][0];
    const dy = profile[i + 1][1] - profile[i][1];
    const length = Math.hypot(dr, dy) || 1;
    return [dy / length, -dr / length];
  };
  // smooth: у спільній точці двох відрізків нормаль — середнє обох (як LatheGeometry); решта — як було.
  const pointNormal = (i, j) => {
    const own = segmentNormal(i);
    if (!smooth || j < 0 || j > profile.length - 2) return own;
    const other = segmentNormal(j);
    return normalize([own[0] + other[0], own[1] + other[1], 0]).slice(0, 2);
  };
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i];
    const [r1, y1] = profile[i + 1];
    const [nr, ny] = segmentNormal(i);
    const [nr0, ny0] = pointNormal(i, i - 1);
    const [nr1, ny1] = pointNormal(i, i + 1);
    const base = out.positions.length / 3;
    const flat = segments <= 6;
    for (let s = 0; s <= segments; s++) {
      const angle = phase + (s / segments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      out.positions.push(r0 * cos, y0, r0 * sin, r1 * cos, y1, r1 * sin);
      if (!flat) out.normals.push(nr0 * cos, ny0, nr0 * sin, nr1 * cos, ny1, nr1 * sin);
      else out.normals.push(0, 0, 0, 0, 0, 0);
    }
    for (let s = 0; s < segments; s++) {
      const a = base + s * 2;
      out.indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  return segmentsFlat(out, segments);
}

/** Для гранчастих тіл (постамент) — плоскі нормалі: кожен трикутник окремо. */
function segmentsFlat(out, segments) {
  return segments <= 6 ? flatten(out) : out;
}

/** Розгортає меш у трикутники з нормаллю грані. */
function flatten(source) {
  const out = mesh();
  const p = source.positions;
  for (let i = 0; i < source.indices.length; i += 3) {
    const [a, b, c] = [source.indices[i], source.indices[i + 1], source.indices[i + 2]];
    const A = [p[a * 3], p[a * 3 + 1], p[a * 3 + 2]];
    const B = [p[b * 3], p[b * 3 + 1], p[b * 3 + 2]];
    const C = [p[c * 3], p[c * 3 + 1], p[c * 3 + 2]];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(...cross) < 1e-12) continue;
    const n = normalize(cross);
    const base = out.positions.length / 3;
    out.positions.push(...A, ...B, ...C);
    out.normals.push(...n, ...n, ...n);
    out.indices.push(base, base + 1, base + 2);
  }
  return out;
}

/** Тор: великий радіус R, малий r; дуга від from до to (радіани) у площині XY. */
function torus(R, r, from, to, arcSegments, tubeSegments) {
  const out = mesh();
  for (let i = 0; i <= arcSegments; i++) {
    const u = from + ((to - from) * i) / arcSegments;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let j = 0; j <= tubeSegments; j++) {
      const v = (j / tubeSegments) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      out.positions.push((R + r * cv) * cu, (R + r * cv) * su, r * sv);
      out.normals.push(cv * cu, cv * su, sv);
    }
  }
  const row = tubeSegments + 1;
  for (let i = 0; i < arcSegments; i++) {
    for (let j = 0; j < tubeSegments; j++) {
      const a = i * row + j;
      out.indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  return out;
}

/** Куля радіуса r. */
function sphere(r, segments = 24, rings = 14) {
  const out = mesh();
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI;
    for (let j = 0; j <= segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const n = [Math.sin(phi) * Math.cos(theta), -Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
      out.positions.push(n[0] * r, n[1] * r, n[2] * r);
      out.normals.push(...n);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * row + j;
      out.indices.push(a, a + row + 1, a + 1, a, a + row, a + row + 1);
    }
  }
  return out;
}

/** Коробка з центром у (0,0,0) і розмірами sx, sy, sz (плоскі грані). */
function box(sx, sy, sz) {
  const [x, y, z] = [sx / 2, sy / 2, sz / 2];
  const corners = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
  ];
  const faces = [
    [4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4],
  ];
  const source = { positions: corners.flat(), normals: [], indices: [] };
  for (const [a, b, c, d] of faces) source.indices.push(a, b, c, a, c, d);
  return flatten(source);
}

/** Повертає й зсуває меш: matrix — 3×3 поворот (рядками), offset — зсув. */
function transform(source, matrix, offset = [0, 0, 0]) {
  const apply = (v, shift) => [
    matrix[0][0] * v[0] + matrix[0][1] * v[1] + matrix[0][2] * v[2] + shift[0],
    matrix[1][0] * v[0] + matrix[1][1] * v[1] + matrix[1][2] * v[2] + shift[1],
    matrix[2][0] * v[0] + matrix[2][1] * v[1] + matrix[2][2] * v[2] + shift[2],
  ];
  const out = { positions: [], normals: [], indices: [...source.indices] };
  for (let i = 0; i < source.positions.length; i += 3) {
    out.positions.push(...apply(source.positions.slice(i, i + 3), offset));
    out.normals.push(...normalize(apply(source.normals.slice(i, i + 3), [0, 0, 0])));
  }
  return out;
}

const rotX = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const rotY = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const rotZ = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const translate = (source, offset) => transform(source, rotX(0), offset);

/** Циліндр радіуса r від точки a до точки b. */
function rod(a, b, r, segments = 12) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(...d);
  const y = normalize(d);
  // Будь-який перпендикуляр до y.
  const helper = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const x = normalize([y[1] * helper[2] - y[2] * helper[1], y[2] * helper[0] - y[0] * helper[2], y[0] * helper[1] - y[1] * helper[0]]);
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const matrix = [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
  const body = lathe([[0, 0], [r, 0], [r, length], [0, length]], segments);
  return transform(body, matrix, a);
}

/** П'ятикутна зірка: товщина depth у центрі, промені до країв тоншають; лицем до +Z. */
function starShape(outer, inner, depth, edge) {
  const source = { positions: [], normals: [], indices: [] };
  const rim = [];
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    rim.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  // 0 — центр спереду, 1 — центр ззаду, далі обід спереду (z=edge) і ззаду (z=-edge).
  source.positions.push(0, 0, depth, 0, 0, -depth);
  for (const [x, y] of rim) source.positions.push(x, y, edge);
  for (const [x, y] of rim) source.positions.push(x, y, -edge);
  for (let i = 0; i < 10; i++) {
    const next = (i + 1) % 10;
    const f0 = 2 + i;
    const f1 = 2 + next;
    const b0 = 12 + i;
    const b1 = 12 + next;
    source.indices.push(0, f0, f1, 1, b1, b0, f0, b0, b1, f0, b1, f1);
  }
  return flatten(source);
}

// ── Моделі (висота ~1, низ на y=0) ─────────────────────────────────────────

/** Квадратний постамент: 4 сегменти з поворотом на 45°. */
const plinth = (half, height, y = 0) =>
  lathe([[0, y], [half, y], [half, y + height], [half * 0.86, y + height + 0.03], [0, y + height + 0.03]], 4, Math.PI / 4);

function cup() {
  const body = lathe(
    [
      [0, 0.2], [0.17, 0.2], [0.16, 0.25], [0.06, 0.3], [0.045, 0.42], [0.07, 0.45], [0.045, 0.48],
      [0.1, 0.55], [0.22, 0.66], [0.3, 0.8], [0.33, 0.95], [0.35, 1.0], [0.32, 1.0], [0.29, 0.94], [0.26, 0.8],
      [0.19, 0.68], [0, 0.62],
    ],
    40,
  );
  const handle = (side) => transform(torus(0.13, 0.025, -Math.PI / 2, Math.PI / 2, 18, 10), rotY(side < 0 ? Math.PI : 0), [side * 0.28, 0.82, 0]);
  return merge(plinth(0.26, 0.2), body, handle(1), handle(-1));
}

function medal() {
  const disc = transform(
    lathe([[0, -0.04], [0.3, -0.04], [0.34, -0.02], [0.34, 0.02], [0.3, 0.045], [0.26, 0.035], [0.22, 0.045], [0, 0.05]], 40),
    rotX(Math.PI / 2),
    [0, 0.42, 0],
  );
  const star = translate(starShape(0.17, 0.07, 0.07, 0.02), [0, 0.42, 0.03]);
  const loop = transform(torus(0.06, 0.018, 0, Math.PI * 2, 20, 8), rotY(Math.PI / 2), [0, 0.8, 0]);
  const strap = (side) => transform(box(0.11, 0.42, 0.015), rotZ(side * 0.42), [side * 0.11, 0.96, -0.02]);
  return merge(disc, star, loop, strap(1), strap(-1));
}

function crown() {
  const band = lathe(
    [[0.3, 0.1], [0.34, 0.1], [0.36, 0.14], [0.34, 0.18], [0.34, 0.42], [0.31, 0.42], [0.31, 0.1]],
    40,
  );
  const parts = [plinth(0.22, 0.08), lathe([[0, 0.11], [0.31, 0.11]], 40), band];
  const points = 5;
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const spike = lathe([[0.075, 0], [0, 0.26]], 6);
    const x = Math.cos(angle) * 0.325;
    const z = Math.sin(angle) * 0.325;
    parts.push(translate(spike, [x, 0.41, z]));
    parts.push(translate(sphere(0.035, 12, 8), [x, 0.69, z]));
    parts.push(translate(sphere(0.03, 12, 8), [Math.cos(angle) * 0.35, 0.28, Math.sin(angle) * 0.35]));
  }
  return merge(...parts);
}

/** Грааль: лише тіло за профілем запеченого сімейного (кільце фото, рим і табличку малює рушій з decor). */
function grail() {
  return lathe(
    [
      [0, 0], [0.26, 0], [0.27, 0.03], [0.22, 0.065], [0.09, 0.1], [0.075, 0.16], [0.11, 0.23], [0.075, 0.3], [0.09, 0.36],
      [0.12, 0.42], [0.26, 0.52], [0.37, 0.7], [0.405, 0.95], [0.41, 1.22], [0.435, 1.44], [0.44, 1.48], [0.4, 1.45],
      [0.37, 1.22], [0.35, 0.95], [0.3, 0.7], [0.18, 0.52], [0, 0.48],
    ],
    120,
    0,
    { smooth: true },
  );
}

function star() {
  const shape = translate(starShape(0.4, 0.17, 0.12, 0.04), [0, 0.62, 0]);
  const stem = lathe([[0, 0.18], [0.05, 0.18], [0.035, 0.25], [0.035, 0.3], [0, 0.3]], 20);
  return merge(plinth(0.2, 0.18), stem, shape);
}

function statuette() {
  const robe = lathe([[0, 0.22], [0.12, 0.22], [0.1, 0.4], [0.07, 0.6], [0.09, 0.66], [0.05, 0.7], [0, 0.71]], 28);
  const head = translate(sphere(0.07), [0, 0.78, 0]);
  const arm = (side) => rod([side * 0.07, 0.64, 0], [side * 0.15, 0.92, 0], 0.022, 10);
  const ball = translate(starShape(0.09, 0.04, 0.03, 0.012), [0, 1.0, 0]);
  const hands = [translate(sphere(0.028, 12, 8), [0.15, 0.93, 0]), translate(sphere(0.028, 12, 8), [-0.15, 0.93, 0])];
  const bar = rod([-0.15, 0.94, 0], [0.15, 0.94, 0], 0.014, 8);
  return merge(plinth(0.2, 0.22), robe, head, arm(1), arm(-1), ...hands, bar, ball);
}

// ── 25e: нові форми ─────────────────────────────────────────────────────────
// Старі функції вище не міняти: від них залежать байти старих .glb.

/** Розтягує меш по осях; нормалі — оберненим масштабом (щоб сплюснута куля світилася як пласка). */
function scaled(source, [sx, sy, sz]) {
  const out = { positions: [], normals: [], indices: [...source.indices] };
  for (let i = 0; i < source.positions.length; i += 3) {
    out.positions.push(source.positions[i] * sx, source.positions[i + 1] * sy, source.positions[i + 2] * sz);
    out.normals.push(...normalize([source.normals[i] / sx, source.normals[i + 1] / sy, source.normals[i + 2] / sz]));
  }
  return out;
}

/**
 * Призма за опуклим многокутником points ([[x, y], …] проти годинникової, дивлячись з +Z) завтовшки depth уздовж Z
 * (центр z = 0), з фаскою bevel на обох лицях; плоскі нормалі.
 */
function prism(points, depth, bevel) {
  const n = points.length;
  // Відступ усередину на bevel (міттер для опуклого многокутника).
  const inset = points.map((p, i) => {
    const prev = points[(i + n - 1) % n];
    const next = points[(i + 1) % n];
    const inward = (a, b) => {
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const length = Math.hypot(dx, dy) || 1;
      return [-dy / length, dx / length];
    };
    const n1 = inward(prev, p);
    const n2 = inward(p, next);
    const k = bevel / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
  });
  const half = depth / 2;
  const rings = [
    inset.map(([x, y]) => [x, y, -half]),
    points.map(([x, y]) => [x, y, -half + bevel]),
    points.map(([x, y]) => [x, y, half - bevel]),
    inset.map(([x, y]) => [x, y, half]),
  ];
  const source = { positions: [0, 0, half, 0, 0, -half], normals: [], indices: [] };
  for (const ring of rings) for (const v of ring) source.positions.push(...v);
  const at = (ring, i) => 2 + ring * n + (i % n);
  for (let i = 0; i < n; i++) {
    source.indices.push(0, at(3, i), at(3, i + 1), 1, at(0, i + 1), at(0, i));
    for (let ring = 0; ring < 3; ring++) {
      source.indices.push(at(ring, i), at(ring, i + 1), at(ring + 1, i + 1), at(ring, i), at(ring + 1, i + 1), at(ring + 1, i));
    }
  }
  return flatten(source);
}

/** Трубка радіуса r уздовж ламаної path ([[x, y, z], …]); гладкі нормалі, кінці відкриті (ховаються в інших частинах). */
function tube(path, r, sides = 8) {
  const out = mesh();
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const crossOf = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let normal = null;
  for (let i = 0; i < path.length; i++) {
    const t = normalize(sub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]));
    if (normal === null) normal = normalize(crossOf(Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], t));
    else {
      const along = normal[0] * t[0] + normal[1] * t[1] + normal[2] * t[2];
      normal = normalize([normal[0] - t[0] * along, normal[1] - t[1] * along, normal[2] - t[2] * along]);
    }
    const binormal = crossOf(normal, t);
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const d = [0, 1, 2].map((k) => normal[k] * Math.cos(a) + binormal[k] * Math.sin(a));
      out.positions.push(path[i][0] + d[0] * r, path[i][1] + d[1] * r, path[i][2] + d[2] * r);
      out.normals.push(...d);
    }
  }
  const row = sides + 1;
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * row + j;
      out.indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  return out;
}

/** Диск-лате з профілем [[радіус, z], …] (лице до +Z) з центром (x, y). */
const faceDisc = (profile, segments, x, y) => transform(lathe(profile, segments), rotX(Math.PI / 2), [x, y, 0]);

/**
 * Вушко й дві стрічки медалі над точкою top: стрічки 0.11 × 0.28 виходять з вушка (низ (±0.035, top + 0.09)) і розходяться
 * вгору під кутом 0.42; верх ≤ top + 0.37.
 */
function hanger(top) {
  const loop = transform(torus(0.06, 0.018, 0, Math.PI * 2, 20, 8), rotY(Math.PI / 2), [0, top + 0.05, 0]);
  const strap = (side) =>
    transform(box(0.11, 0.28, 0.015), rotZ(-side * 0.42), [side * (0.035 + 0.14 * Math.sin(0.42)), top + 0.09 + 0.14 * Math.cos(0.42), -0.02]);
  return [loop, strap(1), strap(-1)];
}

/**
 * Кубок з вухами. Постамент plinth(0.26, 0.2) (верх 0.23).
 * Ніжка (гострі грані): [0,0.23] [0.2,0.23] [0.2,0.26] [0.16,0.27] [0.16,0.3] [0.1,0.31] [0.06,0.36] [0.045,0.42] [0.07,0.45] [0.05,0.47].
 * Чаша зовні (гладка): [0.05,0.47] [0.12,0.48] [0.22,0.53] [0.3,0.6] [0.345,0.7] [0.365,0.82] [0.37,0.94] [0.37,0.98];
 * вінець: [0.37,0.98] [0.39,0.99] [0.39,1.005] [0.355,1.005]; усередині: [0.355,1.005] … [0,0.5].
 * Вуха — замкнені петлі (тор R 0.15, r 0.03) з центром (±0.37, 0.8, 0) у площині XY, що замикаються на стінці чаші.
 */
function lovingcup() {
  const outer = [[0.05, 0.47], [0.12, 0.48], [0.22, 0.53], [0.3, 0.6], [0.345, 0.7], [0.365, 0.82], [0.37, 0.94], [0.37, 0.98]];
  const foot = lathe(
    [[0, 0.23], [0.2, 0.23], [0.2, 0.26], [0.16, 0.27], [0.16, 0.3], [0.1, 0.31], [0.06, 0.36], [0.045, 0.42], [0.07, 0.45], [0.05, 0.47]],
    36,
  );
  const bowl = lathe(outer, 36, 0, { smooth: true });
  const rim = lathe([[0.37, 0.98], [0.39, 0.99], [0.39, 1.005], [0.355, 1.005]], 36);
  const inside = lathe([[0.355, 1.005], [0.355, 0.94], [0.35, 0.82], [0.33, 0.7], [0.28, 0.6], [0.2, 0.54], [0, 0.5]], 36, 0, { smooth: true });
  // Радіус чаші на висоті y (лінійно за профілем).
  const radiusAt = (y) => {
    for (let i = 0; i < outer.length - 1; i++) {
      const [[r0, y0], [r1, y1]] = [outer[i], outer[i + 1]];
      if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
    }
    return outer[outer.length - 1][0];
  };
  const [cx, cy, R] = [0.37, 0.8, 0.15];
  // Кінці дуги — там, де осьова лінія петлі входить у стінку чаші (петля ззовні суцільна, всередину чаші не стирчить).
  const meets = (sign) => {
    let u = 0;
    while (Math.abs(u) < Math.PI && cx + R * Math.cos(u) > radiusAt(cy + R * Math.sin(u))) u += sign * 0.01;
    return u;
  };
  const [from, to] = [meets(-1), meets(1)];
  const ear = (side) => transform(torus(R, 0.03, from, to, 22, 10), rotY(side < 0 ? Math.PI : 0), [side * cx, cy, 0]);
  return merge(plinth(0.26, 0.2), foot, bowl, rim, inside, ear(1), ear(-1));
}

/**
 * Ваза, без постаменту. Ніжка (гострі грані): [0,0] [0.16,0] [0.16,0.04] [0.12,0.06].
 * Тіло зовні (гладке): [0.12,0.06] [0.17,0.15] [0.23,0.3] [0.265,0.42] [0.27,0.5] [0.26,0.6] [0.22,0.72] [0.15,0.82] [0.1,0.9]
 * [0.115,0.96] [0.16,1.0]; губа: [0.16,1.0] [0.14,1.0]; горло всередині: [0.14,1.0] [0.095,0.94] [0.085,0.86] [0,0.86].
 */
function vase() {
  const foot = lathe([[0, 0], [0.16, 0], [0.16, 0.04], [0.12, 0.06]], 48);
  const body = lathe(
    [[0.12, 0.06], [0.17, 0.15], [0.23, 0.3], [0.265, 0.42], [0.27, 0.5], [0.26, 0.6], [0.22, 0.72], [0.15, 0.82], [0.1, 0.9], [0.115, 0.96], [0.16, 1.0]],
    48,
    0,
    { smooth: true },
  );
  const lip = lathe([[0.16, 1.0], [0.14, 1.0]], 48);
  const throat = lathe([[0.14, 1.0], [0.095, 0.94], [0.085, 0.86], [0, 0.86]], 48, 0, { smooth: true });
  return merge(foot, body, lip, throat);
}

/**
 * Тарілка-трофей стоїть на ребрі: диск r 0.4 лицем до +Z з центром (0, 0.68), профіль [радіус, z]:
 * [0,-0.03] [0.36,-0.03] [0.4,-0.01] [0.4,0.02] [0.37,0.035] [0.33,0.03] [0.3,0.012] [0,0.012] (борт і гладке заглиблення).
 * Тримач: plinth(0.24, 0.2) (верх 0.23), шийка [0,0.23] [0.09,0.23] [0.06,0.255] [0.045,0.29] [0,0.29], колиска — дуга
 * тора R 0.41 під нижнім краєм, ззаду — підпора-стрижень.
 */
function plate() {
  const cy = 0.68;
  const dish = faceDisc([[0, -0.03], [0.36, -0.03], [0.4, -0.01], [0.4, 0.02], [0.37, 0.035], [0.33, 0.03], [0.3, 0.012], [0, 0.012]], 56, 0, cy);
  const neck = lathe([[0, 0.23], [0.09, 0.23], [0.06, 0.255], [0.045, 0.29], [0, 0.29]], 24);
  const cradle = translate(torus(0.41, 0.022, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45, 18, 8), [0, cy, 0]);
  const brace = rod([0, 0.24, -0.12], [0, 0.6, -0.025], 0.02, 10);
  return merge(plinth(0.24, 0.2), neck, cradle, brace, dish);
}

/**
 * Келих. Ніжка-диск (гострі грані): [0,0] [0.2,0] [0.2,0.03] [0.17,0.045] [0.06,0.075] [0.035,0.1].
 * Ніжка й чаша зовні (гладкі): [0.035,0.1] [0.03,0.2] [0.03,0.4] [0.05,0.46] [0.12,0.5] [0.19,0.56] [0.24,0.64] [0.265,0.74]
 * [0.27,0.85] [0.27,0.93]; вінець: [0.27,0.93] [0.29,0.945] [0.29,0.965] [0.255,0.965]; усередині: [0.255,0.965] … [0,0.5].
 * Вузол — куля r 0.055 на y 0.3.
 */
function goblet() {
  const foot = lathe([[0, 0], [0.2, 0], [0.2, 0.03], [0.17, 0.045], [0.06, 0.075], [0.035, 0.1]], 40);
  const body = lathe(
    [[0.035, 0.1], [0.03, 0.2], [0.03, 0.4], [0.05, 0.46], [0.12, 0.5], [0.19, 0.56], [0.24, 0.64], [0.265, 0.74], [0.27, 0.85], [0.27, 0.93]],
    40,
    0,
    { smooth: true },
  );
  const rim = lathe([[0.27, 0.93], [0.29, 0.945], [0.29, 0.965], [0.255, 0.965]], 40);
  const inside = lathe([[0.255, 0.965], [0.255, 0.85], [0.245, 0.74], [0.21, 0.64], [0.15, 0.56], [0, 0.5]], 40, 0, { smooth: true });
  return merge(foot, body, rim, inside, translate(sphere(0.055, 16, 10), [0, 0.3, 0]));
}

/** Медаль-зірка: starShape(0.36, 0.15, 0.06, 0.02) з центром (0, 0.2912) — нижні промені на y = 0; вушко й стрічки над 0.65. */
function starmedal() {
  const cy = 0.2912;
  return merge(translate(starShape(0.36, 0.15, 0.06, 0.02), [0, cy, 0]), ...hanger(cy + 0.36));
}

/**
 * Рівнораменний хрест 0.7 × 0.7 з центром (0, 0.35), товщина 0.05 (z ±0.025): рамена 0.16 завширшки з круглими кінцями
 * (диски r 0.08 на ±0.27), у центрі диск r 0.13, профіль [радіус, z]: [0,-0.035] [0.13,-0.035] [0.13,0.03] [0.115,0.042] [0,0.045].
 */
function cross() {
  const cy = 0.35;
  const end = (x, y) => faceDisc([[0, -0.025], [0.08, -0.025], [0.08, 0.025], [0, 0.025]], 24, x, y);
  return merge(
    translate(box(0.54, 0.16, 0.05), [0, cy, 0]),
    translate(box(0.16, 0.54, 0.05), [0, cy, 0]),
    end(0.27, cy), end(-0.27, cy), end(0, cy + 0.27), end(0, cy - 0.27),
    faceDisc([[0, -0.035], [0.13, -0.035], [0.13, 0.03], [0.115, 0.042], [0, 0.045]], 40, 0, cy),
    ...hanger(cy + 0.35),
  );
}

/** Правильний восьмикутник радіуса r (до вершин) з пласкими гранями внизу й угорі. */
const octagonPoints = (r) => Array.from({ length: 8 }, (_, i) => [r * Math.cos(Math.PI / 8 + (i * Math.PI) / 4), r * Math.sin(Math.PI / 8 + (i * Math.PI) / 4)]);

/**
 * Восьмикутна медаль з центром (0, 0.3141) (нижня грань на y = 0): prism(octagonPoints(0.34), 0.07, 0.025) — лице z 0.035,
 * піднятий внутрішній prism(octagonPoints(0.25), 0.11, 0.015) — пласке лице z 0.055 (апофема 0.231); вушко й стрічки над 0.628.
 */
function octagon() {
  const cy = 0.3141;
  return merge(
    translate(prism(octagonPoints(0.34), 0.07, 0.025), [0, cy, 0]),
    translate(prism(octagonPoints(0.25), 0.11, 0.015), [0, cy, 0]),
    ...hanger(2 * cy),
  );
}

/**
 * Медаль на стрічці: диск r 0.3 з центром (0, 0.3), профіль [радіус, z]: [0,-0.035] [0.27,-0.035] [0.3,-0.015] [0.3,0.015]
 * [0.27,0.04] [0.23,0.03] [0.2,0.04] [0,0.045]; вушко (тор R 0.04) на y 0.63; V-стрічка — дві пластини 0.16 × 0.46 від
 * (±0.01, 0.6) угору врозтіч під кутом 0.19 (сходяться внизу у V) (z -0.012 / -0.024), планка-застібка 0.34 × 0.06 з центром (0, 1.06, -0.01).
 */
function ribbon() {
  const cy = 0.3;
  const disc = faceDisc([[0, -0.035], [0.27, -0.035], [0.3, -0.015], [0.3, 0.015], [0.27, 0.04], [0.23, 0.03], [0.2, 0.04], [0, 0.045]], 40, 0, cy);
  const loop = transform(torus(0.04, 0.013, 0, Math.PI * 2, 16, 8), rotY(Math.PI / 2), [0, 0.63, 0]);
  const [length, lean] = [0.46, 0.19];
  const strip = (side) =>
    transform(box(0.16, length, 0.012), rotZ(-side * lean), [
      side * (0.01 + (length / 2) * Math.sin(lean)),
      0.6 + (length / 2) * Math.cos(lean),
      side > 0 ? -0.012 : -0.024,
    ]);
  const clasp = translate(box(0.34, 0.06, 0.03), [0, 1.06, -0.01]);
  return merge(disc, loop, strip(1), strip(-1), clasp);
}

/**
 * Діадема: plinth(0.22, 0.2) (верх 0.23; вищий за brief-ний 0.08 — місце для таблички й висота ≥ 0.8), обруч — профіль
 * [0.28,0.24] [0.3,0.24] [0.31,0.28] [0.3,0.32] [0.28,0.32] [0.28,0.24], усередині диск на y 0.235;
 * спереду (кут θ від +Z, точка (0.3·sinθ, y, 0.3·cosθ)) гребінь з 9 арок від верху обруча (y 0.32): центральна ±14°,
 * решта по 15°, вершини від 0.82 у центрі до ~0.48 з боків, на вершинах кульки r 0.02; камінь — куля r 0.06 у (0, 0.42, 0.315).
 */
function diadem() {
  const R = 0.3;
  const base = 0.32;
  const at = (theta, y, radius = R) => [radius * Math.sin(theta), y, radius * Math.cos(theta)];
  const parts = [
    plinth(0.22, 0.2),
    lathe([[0, 0.235], [0.28, 0.235]], 40),
    lathe([[0.28, 0.24], [0.3, 0.24], [0.31, 0.28], [0.3, 0.32], [0.28, 0.32], [0.28, 0.24]], 48),
  ];
  const deg = Math.PI / 180;
  const edges = [-74, -59, -44, -29, -14, 14, 29, 44, 59, 74].map((d) => d * deg);
  for (let i = 0; i < edges.length - 1; i++) {
    const [a, b] = [edges[i], edges[i + 1]];
    const mid = (a + b) / 2;
    const apex = base + 0.14 + 0.36 * Math.cos(mid * 1.15) ** 2 - 0.012;
    // Арка: півеліпс над хордою, трохи нахилений назовні.
    const path = [];
    for (let k = 0; k <= 10; k++) {
      const t = (k / 10) * Math.PI;
      const theta = mid + ((b - a) / 2) * Math.cos(Math.PI - t);
      path.push(at(theta, base + (apex - base) * Math.sin(t), R + 0.02 * Math.sin(t)));
    }
    parts.push(tube(path, 0.012, 6));
    parts.push(translate(sphere(0.02, 10, 6), at(mid, apex + 0.012, R + 0.02)));
  }
  parts.push(translate(sphere(0.06, 16, 10), [0, 0.42, 0.315]));
  return merge(...parts);
}

/**
 * Вінок на постаменті: plinth(0.22, 0.2) (верх 0.23), стрижень до низу вінка; гілки — тор r 0.012, R 0.32 у площині XY з
 * центром (0, 0.62, 0); open — розімкнений угорі (гілки від низу до кута 90° − 30°), інакше — замкнене коло;
 * leaf — { count, length, width } листків на кожному боці (сплюснута куля 8×5), berries — скільки маслин (кулі r 0.02);
 * унизу на (0, 0.3) — бант (open) або вузол.
 */
function wreath({ open, leaf, berries }) {
  const [R, cy] = [0.32, 0.62];
  const parts = [plinth(0.22, 0.2), rod([0, 0.22, 0], [0, cy - R, 0], 0.025, 12)];
  const top = open ? Math.PI / 2 - 0.52 : Math.PI / 2;
  if (open) {
    parts.push(translate(torus(R, 0.012, -Math.PI / 2, top, 26, 6), [0, cy, 0]));
    parts.push(translate(torus(R, 0.012, Math.PI - top, (3 * Math.PI) / 2, 26, 6), [0, cy, 0]));
  } else parts.push(translate(torus(R, 0.012, 0, Math.PI * 2, 36, 6), [0, cy, 0]));
  const blade = scaled(sphere(1, 8, 5), [leaf.width / 2, leaf.length / 2, 0.006]);
  const start = -Math.PI / 2 + 0.22;
  const end = top - 0.04;
  for (let i = 0; i < leaf.count; i++) {
    const u = start + ((end - start) * i) / (leaf.count - 1);
    // Листок — уздовж гілки вгору, поперемінно назовні й усередину.
    const tilt = i % 2 === 0 ? -0.55 : 0.55;
    const direction = u + Math.PI / 2 + tilt;
    const offset = leaf.length * 0.42;
    for (const side of [1, -1]) {
      const x = side * (R * Math.cos(u) + offset * Math.cos(direction));
      const y = cy + R * Math.sin(u) + offset * Math.sin(direction);
      const spin = side * (direction - Math.PI / 2);
      parts.push(transform(transform(blade, rotY(side * tilt * 0.6)), rotZ(spin), [x, y, 0.004 * side]));
    }
  }
  for (let i = 0; i < berries; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const u = start + 0.12 + ((end - start - 0.24) * Math.floor(i / 2)) / Math.max(1, Math.ceil(berries / 2) - 1);
    const r = R + (i % 4 < 2 ? 0.03 : -0.03);
    parts.push(translate(sphere(0.02, 8, 6), [side * r * Math.cos(u), cy + r * Math.sin(u), 0.012]));
  }
  const knot = [0, cy - R, 0.016];
  parts.push(translate(sphere(0.024, 12, 8), knot));
  if (open) {
    for (const side of [1, -1]) {
      parts.push(transform(torus(0.045, 0.011, 0, Math.PI * 2, 16, 6), rotZ(side * 0.35), [side * 0.05, cy - R + 0.012, 0.016]));
      parts.push(transform(box(0.032, 0.12, 0.008), rotZ(side * 0.4), [side * 0.034, cy - R - 0.055, 0.02]));
    }
  } else {
    for (const side of [1, -1]) parts.push(transform(box(0.026, 0.07, 0.008), rotZ(side * 0.5), [side * 0.02, cy - R - 0.035, 0.02]));
  }
  return merge(...parts);
}

const laurel = () => wreath({ open: true, leaf: { count: 9, length: 0.13, width: 0.06 }, berries: 0 });
const olive = () => wreath({ open: false, leaf: { count: 10, length: 0.13, width: 0.032 }, berries: 10 });

/**
 * Фігурка: plinth(0.22, 0.2) (верх 0.23), барабан [0,0.23] [0.15,0.23] [0.15,0.36] [0.135,0.375] [0,0.375];
 * ноги — стрижні r 0.028 від (±0.035, 0.37) до (±0.03, 0.56); тулуб (гладкий) [0,0.54] [0.06,0.54] [0.075,0.62] [0.09,0.7]
 * [0.1,0.74] [0.07,0.77] [0.03,0.785] [0,0.785]; голова — куля r 0.055 на y 0.84; права рука вгору з вінком (тор R 0.055,
 * r 0.012, центр (0.09, 1.0, 0) у площині XY), ліва — вздовж тіла.
 */
function figure() {
  const drum = lathe([[0, 0.23], [0.15, 0.23], [0.15, 0.36], [0.135, 0.375], [0, 0.375]], 40);
  const legs = [1, -1].map((side) => rod([side * 0.035, 0.37, 0], [side * 0.03, 0.56, 0], 0.028, 12));
  const torso = lathe([[0, 0.54], [0.06, 0.54], [0.075, 0.62], [0.09, 0.7], [0.1, 0.74], [0.07, 0.77], [0.03, 0.785], [0, 0.785]], 24, 0, { smooth: true });
  const neck = rod([0, 0.77, 0], [0, 0.81, 0], 0.025, 10);
  const head = translate(sphere(0.055, 20, 12), [0, 0.84, 0]);
  const joint = (p, r = 0.024) => translate(sphere(r, 10, 6), p);
  const up = [[0.09, 0.735, 0], [0.13, 0.84, 0.01], [0.1, 0.95, 0.01]];
  const down = [[-0.09, 0.735, 0], [-0.11, 0.64, 0.01], [-0.105, 0.56, 0.02]];
  const arm = (points) => [rod(points[0], points[1], 0.02, 10), rod(points[1], points[2], 0.018, 10), joint(points[1], 0.02), joint(points[2])];
  const laurelRing = translate(torus(0.055, 0.012, 0, Math.PI * 2, 24, 6), [0.09, 1.0, 0.01]);
  return merge(plinth(0.22, 0.2), drum, ...legs, torso, neck, head, ...arm(up), ...arm(down), laurelRing);
}

/**
 * Вогонь: plinth(0.22, 0.2) (верх 0.23), чаша-тримач [0,0.23] [0.07,0.23] [0.05,0.27] [0.04,0.3] [0.08,0.33] [0.14,0.38]
 * [0.17,0.42] [0.15,0.42] [0,0.37]; полум'я — 5 язиків-крапель (гладкі лате) по колу, нахилених назовні, найвищий до y 1.0.
 */
function flame() {
  const holder = lathe([[0, 0.23], [0.07, 0.23], [0.05, 0.27], [0.04, 0.3], [0.08, 0.33], [0.14, 0.38], [0.17, 0.42], [0.15, 0.42], [0, 0.37]], 40);
  const drop = [[0, 0], [0.05, 0.025], [0.075, 0.08], [0.072, 0.15], [0.05, 0.26], [0.025, 0.36], [0.006, 0.44], [0, 0.46]];
  const tongues = [
    { angle: 0, offset: 0, lean: 0, height: 0.62, width: 1.25 },
    { angle: 0.3, offset: 0.07, lean: 0.28, height: 0.44, width: 0.95 },
    { angle: 1.55, offset: 0.075, lean: 0.32, height: 0.36, width: 0.9 },
    { angle: 3.2, offset: 0.07, lean: 0.3, height: 0.4, width: 0.95 },
    { angle: 4.6, offset: 0.075, lean: 0.3, height: 0.33, width: 0.85 },
  ];
  const parts = [plinth(0.22, 0.2), holder];
  for (const t of tongues) {
    const shape = lathe(drop.map(([r, y]) => [r * t.width, (y / 0.46) * t.height]), 20, 0, { smooth: true });
    // Нахил назовні в напрямку angle (кут від +X у площині XZ), основа на колі offset.
    const tilted = transform(shape, rotZ(-t.lean));
    const placed = transform(tilted, rotY(-t.angle), [t.offset * Math.cos(t.angle), 0.37, t.offset * Math.sin(t.angle)]);
    parts.push(placed);
  }
  return merge(...parts);
}

/**
 * Крилата статуетка: plinth(0.22, 0.2) (верх 0.23), стрижень r 0.03 до 0.36, куля r 0.1 на y 0.45; два крила-віяла з 7
 * пласких пір'їн (box 0.06 × L × 0.012, L від 0.5 до 0.26) від кореня (±0.05, 0.5, -0.04), розкритих дугою, найвища до y 1.0.
 */
function wings() {
  const parts = [plinth(0.22, 0.2), rod([0, 0.22, 0], [0, 0.37, 0], 0.03, 12), translate(sphere(0.1, 24, 14), [0, 0.45, 0])];
  for (const side of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const angle = 0.1 + i * 0.17;
      const length = 0.5 - i * 0.04;
      const root = [side * 0.05, 0.5, -0.04 - i * 0.004];
      const center = [root[0] + side * Math.sin(angle) * (length / 2), root[1] + Math.cos(angle) * (length / 2), root[2]];
      parts.push(transform(box(0.06, length, 0.012), rotZ(-side * angle), center));
    }
  }
  return merge(...parts);
}

/**
 * Піднятий кулак: plinth(0.22, 0.2) (верх 0.23), передпліччя (гладке) [0,0.23] [0.09,0.23] [0.095,0.32] [0.105,0.42] [0.1,0.5];
 * манжета й зап'ясток (гострі грані) [0.1,0.5] [0.115,0.5] [0.115,0.545] [0.1,0.545] [0.1,0.64] [0,0.64];
 * долоня — box 0.3 × 0.2 × 0.16 з центром (0, 0.72, 0), ребра скруглені кулями; 4 зігнуті пальці спереду (трубки r 0.042,
 * загнуті навколо (x, 0.755, 0.09) з радіусом 0.05, x = ±0.0375, ±0.1125), великий палець поперек них на y ~0.69.
 */
function fist() {
  const forearm = lathe([[0, 0.23], [0.09, 0.23], [0.095, 0.32], [0.105, 0.42], [0.1, 0.5]], 32, 0, { smooth: true });
  const cuff = lathe([[0.1, 0.5], [0.115, 0.5], [0.115, 0.545], [0.1, 0.545], [0.1, 0.64], [0, 0.64]], 32);
  const parts = [plinth(0.22, 0.2), forearm, cuff, translate(box(0.3, 0.2, 0.16), [0, 0.72, 0])];
  // Скруглення долоні: кулі на бічних ребрах і зверху ззаду.
  const ball = (p, r) => translate(sphere(r, 10, 6), p);
  for (const x of [-0.12, 0.12]) for (const y of [0.66, 0.78]) parts.push(ball([x, y, -0.02], 0.05));
  for (const x of [-0.06, 0.06]) parts.push(ball([x, 0.8, -0.04], 0.06));
  // Пальці: від тильного боку через верх і перед униз, кінчик ховається в долоню.
  for (const x of [-0.1125, -0.0375, 0.0375, 0.1125]) {
    const path = [];
    for (let k = 0; k <= 9; k++) {
      const phi = ((150 - (k * 270) / 9) * Math.PI) / 180;
      path.push([x, 0.755 + 0.05 * Math.sin(phi), 0.09 + 0.05 * Math.cos(phi)]);
    }
    parts.push(tube(path, 0.042, 10));
  }
  // Великий палець: від боку долоні поперек загнутих пальців.
  const thumb = [[0.155, 0.66, 0.0], [0.16, 0.665, 0.08], [0.125, 0.675, 0.15], [0.065, 0.685, 0.178], [0.0, 0.69, 0.178]];
  parts.push(ball(thumb[0], 0.038), tube(thumb, 0.036, 10), ball(thumb[thumb.length - 1], 0.036));
  return merge(...parts);
}

// ── Запис GLB ───────────────────────────────────────────────────────────────

function glb(name, geometry) {
  const vertexCount = geometry.positions.length / 3;
  const positions = new Float32Array(geometry.positions.map((v) => Math.round(v * 10000) / 10000));
  const normals = new Float32Array(geometry.normals);
  const wide = vertexCount > 65535;
  const indices = wide ? new Uint32Array(geometry.indices) : new Uint16Array(geometry.indices);
  const pad = (n) => (n + 3) & ~3;
  const indexBytes = pad(indices.byteLength);
  const bin = Buffer.alloc(positions.byteLength + normals.byteLength + indexBytes);
  Buffer.from(positions.buffer).copy(bin, 0);
  Buffer.from(normals.buffer).copy(bin, positions.byteLength);
  Buffer.from(indices.buffer).copy(bin, positions.byteLength + normals.byteLength);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  const json = {
    asset: { version: '2.0', generator: 'quiz build-trophies.mjs', copyright: 'CC0 1.0 — quiz project' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: 'metal', pbrMetallicRoughness: { baseColorFactor: [0.91, 0.72, 0.29, 1], metallicFactor: 1, roughnessFactor: 0.2 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: normals.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength + normals.byteLength, byteLength: indices.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertexCount, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: vertexCount, type: 'VEC3' },
      { bufferView: 2, componentType: wide ? 5125 : 5123, count: indices.length, type: 'SCALAR' },
    ],
  };
  let text = Buffer.from(JSON.stringify(json), 'utf8');
  text = Buffer.concat([text, Buffer.alloc(pad(text.length) - text.length, 0x20)]);
  const total = 12 + 8 + text.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(body.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, body]);
  };
  return Buffer.concat([header, chunk(0x4e4f534a, text), chunk(0x004e4942, bin)]);
}

mkdirSync(outDir, { recursive: true });
for (const [name, build] of Object.entries({ cup, medal, crown, star, statuette, grail })) {
  const file = glb(name, build());
  if (file.length > MAX_BYTES) throw new Error(`${name}.glb: ${file.length} B > ${MAX_BYTES}`);
  writeFileSync(resolve(outDir, `${name}.glb`), file);
  console.log(`${name}.glb ${file.length} B`);
}

// 25e: кожна нова ≤ 80 000 Б (усі 15 разом ≤ 800 000 Б — перевіряє models.test.ts).
const NEW_MAX_BYTES = 80_000;
const NEW_MODELS = { lovingcup, vase, plate, goblet, starmedal, cross, octagon, ribbon, diadem, laurel, olive, figure, flame, wings, fist };
for (const [name, build] of Object.entries(NEW_MODELS)) {
  const file = glb(name, build());
  if (file.length > NEW_MAX_BYTES) throw new Error(`${name}.glb: ${file.length} B > ${NEW_MAX_BYTES}`);
  writeFileSync(resolve(outDir, `${name}.glb`), file);
  console.log(`${name}.glb ${file.length} B`);
}
