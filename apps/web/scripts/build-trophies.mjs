/**
 * Одноразовий скрипт (не в CI): будує прості 3D-трофеї для призів (14a) з геометрії, без чужих файлів.
 *
 *   node apps/web/scripts/build-trophies.mjs
 *
 * Пише apps/web/public/models/{cup,medal,crown,star,statuette,grail}.glb — glTF 2.0, один меш і один матеріал
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
