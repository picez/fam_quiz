/**
 * Розв’язувачі графічних головоломок «Логіки й дедукції»: рахують відповіді з тих самих даних, з яких малюються картинки,
 * щоб check.ts звірив їх із відповідями у вікторині. Нічого не малюють і не залежать від вікторини.
 */

export type Pt = [number, number];
export type Seg = [Pt, Pt];

const EPS = 1e-6;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;
const key = ([x, y]: Pt) => `${Math.round(x * 1e4) / 1e4},${Math.round(y * 1e4) / 1e4}`;
const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Точка лежить на відрізку (з кінцями). */
const onSeg = (p: Pt, [a, b]: Seg) =>
  Math.abs(cross(a, b, p)) < 1e-3 &&
  p[0] >= Math.min(a[0], b[0]) - EPS &&
  p[0] <= Math.max(a[0], b[0]) + EPS &&
  p[1] >= Math.min(a[1], b[1]) - EPS &&
  p[1] <= Math.max(a[1], b[1]) + EPS;

/** Перетин двох відрізків (одна точка) або null. */
function intersect([a, b]: Seg, [c, d]: Seg): Pt | null {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(den) < EPS) return null;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
  const p: Pt = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return onSeg(p, [a, b]) && onSeg(p, [c, d]) ? p : null;
}

/** Усі вузли фігури: кінці відрізків і їхні перетини. */
function nodes(segs: Seg[]): Pt[] {
  const map = new Map<string, Pt>();
  for (const s of segs) for (const p of s) map.set(key(p), p);
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const p = intersect(segs[i], segs[j]);
      if (p) map.set(key(p), p);
    }
  return [...map.values()];
}

/** Дві точки з’єднані, якщо обидві лежать на одному відрізку фігури. */
const linked = (segs: Seg[], p: Pt, q: Pt) => segs.some((s) => onSeg(p, s) && onSeg(q, s));

/** Скільки трикутників утворюють відрізки фігури. */
export function countTriangles(segs: Seg[]): number {
  const ps = nodes(segs);
  let n = 0;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      if (!linked(segs, ps[i], ps[j])) continue;
      for (let k = j + 1; k < ps.length; k++) {
        if (Math.abs(cross(ps[i], ps[j], ps[k])) < 1e-3) continue;
        if (linked(segs, ps[i], ps[k]) && linked(segs, ps[j], ps[k])) n++;
      }
    }
  return n;
}

/** Скільки прямокутників зі сторонами вздовж осей (squares — лише квадратів) утворюють відрізки. */
export function countRects(segs: Seg[], squares = false): number {
  const ps = nodes(segs);
  const has = new Set(ps.map(key));
  let n = 0;
  for (const a of ps)
    for (const c of ps) {
      if (!(c[0] > a[0] + EPS && c[1] > a[1] + EPS)) continue;
      if (squares && !near(c[0] - a[0], c[1] - a[1])) continue;
      const b: Pt = [c[0], a[1]];
      const d: Pt = [a[0], c[1]];
      if (!has.has(key(b)) || !has.has(key(d))) continue;
      if (linked(segs, a, b) && linked(segs, b, c) && linked(segs, c, d) && linked(segs, d, a)) n++;
    }
  return n;
}

/* ---------- Сірники ---------- */

/** Сегменти семисегментної цифри: a — верх, b — праворуч угорі, c — праворуч унизу, d — низ, e — ліворуч унизу, f — ліворуч угорі, g — середина. */
export const DIGITS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
};
/** Знаки: h — горизонтальний сірник посередині, v — вертикальний, t/u — верхній і нижній сірник «=». */
export const SIGNS: Record<string, string> = { '+': 'hv', '-': 'h', '=': 'tu' };

/** Поблажливі прочитання: інше написання цифр і знаків, які гравець може вважати правильними. */
const LENIENT: [string, string][] = [
  ['1', 'ef'],
  ['7', 'abcf'],
  ['9', 'abcfg'],
  ['6', 'cdefg'],
  // «−» з додатковим сірником часто читають як «=», а «=» без одного — як «−»; «+», повернутий сірник якого ліг горизонтально, — як «=».
  ['=', 'ht'],
  ['=', 'hu'],
  ['-', 't'],
  ['-', 'u'],
];

type Token = { ch: string; segs: Set<string> };

const DIGIT_SEGS = 'abcdefg';
const SIGN_SEGS = 'hvtu';

function readings(lenient: boolean): Map<string, string> {
  const m = new Map<string, string>();
  const sorted = (s: string) => [...s].sort().join('');
  for (const [ch, s] of Object.entries(DIGITS)) m.set(sorted(s), ch);
  for (const [ch, s] of Object.entries(SIGNS)) m.set(`#${sorted(s)}`, ch);
  if (lenient)
    for (const [ch, s] of LENIENT) {
      const k = /[0-9]/.test(ch) ? sorted(s) : `#${sorted(s)}`;
      if (!m.has(k)) m.set(k, ch);
    }
  return m;
}

const readToken = (kind: 'digit' | 'sign', segs: Set<string>, table: Map<string, string>) => {
  const s = [...segs].sort().join('');
  return table.get(kind === 'digit' ? s : `#${s}`);
};

/** Чи правдивий вираз: частини між «=» рівні між собою; дозволено лише + і −, мінус на початку. */
export function trueEquation(expr: string): boolean {
  const parts = expr.split('=');
  if (parts.length < 2) return false;
  const values: number[] = [];
  for (const part of parts) {
    if (!/^-?\d+([+-]\d+)*$/.test(part)) return false;
    let v = 0;
    for (const m of part.matchAll(/([+-]?)(\d+)/g)) v += (m[1] === '-' ? -1 : 1) * Number(m[2]);
    values.push(v);
  }
  return values.every((v) => v === values[0]);
}

/**
 * Усі правдиві вирази, які виходять перекладанням рівно одного сірника. lenient — з поблажливими прочитаннями
 * й можливістю поставити окремий сірник новим знаком «−» чи прибрати знак «−» цілком.
 */
export function matchMoves(expr: string, lenient: boolean): string[] {
  const table = readings(lenient);
  const tokens: Token[] = [...expr].map((ch) => ({ ch, segs: new Set(DIGITS[ch] ?? SIGNS[ch]) }));
  const kindOf = (t: Token) => (/[0-9]/.test(t.ch) ? 'digit' : 'sign');
  const out = new Set<string>();
  const render = (ts: (string | undefined)[]) => (ts.some((c) => c === undefined) ? null : ts.join(''));
  for (let i = 0; i < tokens.length; i++) {
    for (const s of tokens[i].segs) {
      const from = new Set(tokens[i].segs);
      from.delete(s);
      // Звідки взяли: знак без сірників зникає (лише в поблажливому режимі, і лише «−»).
      const fromCh = from.size === 0 ? (lenient && tokens[i].ch === '-' ? '' : undefined) : readToken(kindOf(tokens[i]), from, table);
      if (fromCh === undefined) continue;
      // Куди кладемо: у будь-який символ (також у той самий).
      for (let j = 0; j < tokens.length; j++) {
        const base = i === j ? from : tokens[j].segs;
        const targetPool = kindOf(tokens[j]) === 'digit' ? DIGIT_SEGS : SIGN_SEGS;
        for (const t of targetPool) {
          if (base.has(t)) continue;
          if (i === j && t === s) continue;
          const to = new Set(base);
          to.add(t);
          const toCh = readToken(kindOf(tokens[j]), to, table);
          if (toCh === undefined) continue;
          const chars = tokens.map((tok, k) => (k === i ? fromCh : tok.ch));
          chars[j] = toCh;
          if (i !== j) chars[i] = fromCh;
          const e = render(chars);
          if (e !== null && e !== expr && trueEquation(e)) out.add(e);
        }
      }
      // Поблажливо: сірник лягає окремим знаком «−» між символами чи на початку.
      if (lenient) {
        for (let pos = 0; pos <= tokens.length; pos++) {
          const chars = tokens.map((tok, k) => (k === i ? fromCh : tok.ch));
          chars.splice(pos, 0, '-');
          const e = chars.join('');
          if (e !== expr && trueEquation(e)) out.add(e);
        }
      }
    }
  }
  return [...out].sort();
}

/* ---------- Розгортка куба ---------- */

type V3 = [number, number, number];
const roll = (v: V3, d: V3): V3 => {
  // Кочення в напрямку d: d → низ, низ → −d, решта без змін.
  const p = v[0] * d[0] + v[1] * d[1];
  const q = v[2];
  const r: V3 = [v[0] - p * d[0], v[1] - p * d[1], 0];
  return [r[0] + q * d[0], r[1] + q * d[1], -p];
};

/** Чи складається розгортка (клітинки [x, y], y униз) у куб: котимо куб клітинками, кожна грань має торкнутися землі рівно раз. */
export function foldsToCube(cells: Pt[]): boolean {
  if (cells.length !== 6) return false;
  const k = ([x, y]: Pt) => `${x},${y}`;
  const set = new Set(cells.map(k));
  const faces: Record<string, V3> = { D: [0, 0, -1], U: [0, 0, 1], E: [1, 0, 0], W: [-1, 0, 0], N: [0, 1, 0], S: [0, -1, 0] };
  const down = (f: Record<string, V3>) => Object.entries(f).find(([, v]) => v[2] === -1)![0];
  const seen = new Map<string, string>([[k(cells[0]), down(faces)]]);
  const queue: [Pt, Record<string, V3>][] = [[cells[0], faces]];
  while (queue.length) {
    const [c, f] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n: Pt = [c[0] + dx, c[1] + dy];
      if (!set.has(k(n)) || seen.has(k(n))) continue;
      const d: V3 = [dx, -dy, 0];
      const g = Object.fromEntries(Object.entries(f).map(([name, v]) => [name, roll(v, d).map((x) => Math.round(x)) as V3]));
      seen.set(k(n), down(g));
      queue.push([n, g]);
    }
  }
  return seen.size === 6 && new Set(seen.values()).size === 6;
}

/* ---------- Поліоміно ---------- */

const norm = (cells: Pt[]) => {
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([x, y]) => `${x - mx},${y - my}`)
    .sort()
    .join(' ');
};
const rot = (cells: Pt[]): Pt[] => cells.map(([x, y]) => [-y, x]);

/** Чи фігура b — це фігура a, повернута на площині (без перевертання). */
export function sameByRotation(a: Pt[], b: Pt[]): boolean {
  let c = a;
  for (let i = 0; i < 4; i++) {
    if (norm(c) === norm(b)) return true;
    c = rot(c);
  }
  return false;
}

/** Дзеркальне відображення фігури. */
export const mirror = (cells: Pt[]): Pt[] => cells.map(([x, y]) => [-x, y]);

/* ---------- Лабіринт ---------- */

/** Лабіринт: w×h клітинок; open — множина проходів «x,y>x2,y2» між сусідніми клітинками. */
export type Maze = { w: number; h: number; open: Set<string> };
export const edge = (a: Pt, b: Pt) => {
  const [p, q] = [`${a[0]},${a[1]}`, `${b[0]},${b[1]}`].sort();
  return `${p}>${q}`;
};

/** Клітинки, досяжні від start. */
export function reachable(m: Maze, start: Pt): Set<string> {
  const seen = new Set([`${start[0]},${start[1]}`]);
  const queue: Pt[] = [start];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n: Pt = [x + dx, y + dy];
      if (n[0] < 0 || n[1] < 0 || n[0] >= m.w || n[1] >= m.h) continue;
      const k = `${n[0]},${n[1]}`;
      if (seen.has(k) || !m.open.has(edge([x, y], n))) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen;
}

/* ---------- Шестерні ---------- */

/** Напрямки обертання шестерень (1 — як перша, −1 — навпаки) або null, якщо механізм заклинить (непарний цикл). */
export function gearTurns(gears: { x: number; y: number; r: number }[]): (1 | -1 | 0)[] | null {
  const dir: (1 | -1 | 0)[] = gears.map(() => 0);
  dir[0] = 1;
  const queue = [0];
  const meshes = (i: number, j: number) => Math.abs(Math.hypot(gears[i].x - gears[j].x, gears[i].y - gears[j].y) - gears[i].r - gears[j].r) < 2;
  while (queue.length) {
    const i = queue.shift()!;
    for (let j = 0; j < gears.length; j++) {
      if (i === j || !meshes(i, j)) continue;
      const want = (-dir[i]) as 1 | -1;
      if (dir[j] === 0) {
        dir[j] = want;
        queue.push(j);
      } else if (dir[j] !== want) return null;
    }
  }
  return dir;
}

/* ---------- Шифри ---------- */

/** Українська абетка, 33 літери. */
export const ABC = 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя';

/** Зсув Цезаря на shift літер абеткою (пробіли й інше без змін). */
export const caesar = (text: string, shift: number) =>
  [...text.toLocaleLowerCase('uk')]
    .map((ch) => {
      const i = ABC.indexOf(ch);
      return i < 0 ? ch : ABC[(((i + shift) % ABC.length) + ABC.length) % ABC.length];
    })
    .join('');

/** Абетка навпаки: А ↔ Я, Б ↔ Ю… */
export const atbash = (text: string) =>
  [...text.toLocaleLowerCase('uk')]
    .map((ch) => {
      const i = ABC.indexOf(ch);
      return i < 0 ? ch : ABC[ABC.length - 1 - i];
    })
    .join('');

/** Номери літер в абетці (А = 1). */
export const letterNumbers = (word: string) => [...word.toLocaleLowerCase('uk')].map((ch) => ABC.indexOf(ch) + 1);
