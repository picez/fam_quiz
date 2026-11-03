/**
 * Картинки «Логіки й дедукції»: дані кожної головоломки й SVG з них. Дані експортуються, щоб check.ts перерахував відповіді
 * розв’язувачами з solve.ts. PNG малює draw.ts (npx tsx apps/server/scripts/logic/draw.ts) у logic/img; вони лежать у git.
 * Тло темне, лінії товсті й світлі, ширина 1200 px. Назви файлів — лише номери, без відповідей.
 */
import { edge, type Maze, type Pt, type Seg } from './solve';

const W = 1200;
const BG = '#161a26';
const INK = '#f2f2f2';
const YEL = '#ffcc4d';
const CYAN = '#5ec8ff';
const PINK = '#ff6b8b';
const GREEN = '#7be38a';
const DIM = '#8d93a8';
const FONT = 'Arial, Helvetica, sans-serif';

const svg = (h: number, body: string, w = W) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${BG}"/>${body}</svg>`;
const text = (x: number, y: number, s: string, size = 48, fill = INK, anchor = 'middle', weight = 'bold') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="central">${s}</text>`;
const line = ([a, b]: Seg, stroke = INK, width = 8) =>
  `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`;
const poly = (pts: Pt[], fill: string, stroke = 'none', width = 0) =>
  `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;
const circle = (x: number, y: number, r: number, fill: string, stroke = 'none', width = 0) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
/** Підпис варіанта (А, Б, В, Г…) у кружечку. */
const badge = (x: number, y: number, s: string) => circle(x, y, 34, '#2a3045', DIM, 3) + text(x, y + 2, s, 40, YEL);
export const LETTERS = ['А', 'Б', 'В', 'Г', 'Ґ', 'Д'];

/** Правильний n-кутник. */
const ngon = (n: number, cx: number, cy: number, r: number, turn = -Math.PI / 2): Pt[] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos(turn + (2 * Math.PI * i) / n), cy + r * Math.sin(turn + (2 * Math.PI * i) / n)]);

/* ---------- Трикутники, квадрати, прямокутники ---------- */

/** Трикутник із двома відрізками з вершини до основи. */
export const TRI_EASY: Seg[] = [
  [[600, 70], [180, 730]],
  [[600, 70], [1020, 730]],
  [[180, 730], [1020, 730]],
  [[600, 70], [460, 730]],
  [[600, 70], [740, 730]],
];

/** Трикутник: три відрізки з вершини й одна горизонталь через усі. */
const triMidY = 420;
const sideX = (x0: number, y: number) => 600 + ((x0 - 600) * (y - 70)) / 660;
export const TRI_MID: Seg[] = [
  [[600, 70], [180, 730]],
  [[600, 70], [1020, 730]],
  [[180, 730], [1020, 730]],
  [[600, 70], [390, 730]],
  [[600, 70], [600, 730]],
  [[600, 70], [810, 730]],
  [[sideX(180, triMidY), triMidY], [sideX(1020, triMidY), triMidY]],
];

/** Квадрат з обома діагоналями й обома середніми лініями. */
export const TRI_HARD: Seg[] = [
  [[300, 100], [900, 100]],
  [[900, 100], [900, 700]],
  [[900, 700], [300, 700]],
  [[300, 700], [300, 100]],
  [[300, 100], [900, 700]],
  [[900, 100], [300, 700]],
  [[600, 100], [600, 700]],
  [[300, 400], [900, 400]],
];

/** П’ятикутна зірка з п’яти відрізків (для запитання «Мільйонера», без картинки). */
export const PENTAGRAM: Seg[] = (() => {
  const v = ngon(5, 600, 400, 300);
  return v.map((p, i): Seg => [p, v[(i + 2) % 5]]);
})();

/** Сітка cols×rows клітинок із кроком step. */
const grid = (x0: number, y0: number, cols: number, rows: number, step: number): Seg[] => [
  ...Array.from({ length: rows + 1 }, (_, i): Seg => [[x0, y0 + i * step], [x0 + cols * step, y0 + i * step]]),
  ...Array.from({ length: cols + 1 }, (_, i): Seg => [[x0 + i * step, y0], [x0 + i * step, y0 + rows * step]]),
];
/** Квадрати: сітка 4×3. */
export const SQUARES = grid(260, 110, 4, 3, 170);
/** Прямокутники: сітка 3×2. */
export const RECTS = grid(300, 150, 3, 2, 200);

const figure = (segs: Seg[], h = 800) => svg(h, segs.map((s) => line(s)).join(''));

/* ---------- Сірники ---------- */

/** Рівняння із сірників: символи «0–9», «+», «−» («-»), «=». */
export const MATCHES = { easy: '3+3=9', mid: '0+6=2', hard: '0+3=17' } as const;

const SEG_DIGIT: Record<string, Seg> = {
  a: [[0, 0], [1, 0]],
  b: [[1, 0], [1, 1]],
  c: [[1, 1], [1, 2]],
  d: [[0, 2], [1, 2]],
  e: [[0, 1], [0, 2]],
  f: [[0, 0], [0, 1]],
  g: [[0, 1], [1, 1]],
};
const SEG_SIGN: Record<string, Seg> = {
  h: [[0, 1], [1, 1]],
  v: [[0.5, 0.5], [0.5, 1.5]],
  t: [[0, 0.75], [1, 0.75]],
  u: [[0, 1.25], [1, 1.25]],
};

/** Сірник: світле дерево з червоною голівкою на кінці b. */
const match = (a: Pt, b: Pt) =>
  `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#e9c98f" stroke-width="18" stroke-linecap="round"/>` +
  `<line x1="${a[0] + (b[0] - a[0]) * 0.88}" y1="${a[1] + (b[1] - a[1]) * 0.88}" x2="${b[0]}" y2="${b[1]}" stroke="#e2493b" stroke-width="24" stroke-linecap="round"/>`;

export function matchSvg(expr: string): string {
  const DIG = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' } as Record<string, string>;
  const SIG = { '+': 'hv', '-': 'h', '=': 'tu' } as Record<string, string>;
  const L = 140; // довжина сірника
  const widths = [...expr].map((ch) => (ch in DIG ? L + 50 : L + 40));
  const total = widths.reduce((a, b) => a + b, 0);
  let x = (W - total) / 2 + 20;
  const y0 = 160;
  let body = '';
  for (const ch of expr) {
    const segs = ch in DIG ? [...DIG[ch]].map((s) => SEG_DIGIT[s]) : [...SIG[ch]].map((s) => SEG_SIGN[s]);
    for (const [a, b] of segs) {
      const pa: Pt = [x + a[0] * L, y0 + a[1] * L];
      const pb: Pt = [x + b[0] * L, y0 + b[1] * L];
      // Короткий відступ, щоб сірники не зливалися в кутах.
      const dx = (pb[0] - pa[0]) * 0.1;
      const dy = (pb[1] - pa[1]) * 0.1;
      body += match([pa[0] + dx, pa[1] + dy], [pb[0] - dx, pb[1] - dy]);
    }
    x += ch in DIG ? L + 50 : L + 40;
  }
  return svg(600, body);
}

/* ---------- Лабіринт ---------- */

const random = (seed: string) => {
  let a = [...seed].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

/** Досконалий лабіринт (DFS) із зерна, потім стінки біля трьох хибних виходів відрізають їх від старту. */
function buildMaze(seed: string): { maze: Maze; start: Pt; exits: Pt[]; correct: number } | null {
  const w = 14;
  const h = 8;
  const next = random(seed);
  const open = new Set<string>();
  const seen = new Set<string>(['0,0']);
  const parent = new Map<string, Pt>();
  const stack: Pt[] = [[0, 0]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const free = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as Pt[])
      .map(([dx, dy]): Pt => [x + dx, y + dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < w && ny < h && !seen.has(`${nx},${ny}`));
    if (!free.length) {
      stack.pop();
      continue;
    }
    const n = free[Math.floor(next() * free.length)];
    open.add(edge([x, y], n));
    seen.add(`${n[0]},${n[1]}`);
    parent.set(`${n[0]},${n[1]}`, [x, y]);
    stack.push(n);
  }
  // Виходи внизу; правильний — В (індекс 2).
  const exits: Pt[] = [[1, 7], [5, 7], [9, 7], [12, 7]];
  const correct = 2;
  const pathTo = (c: Pt) => {
    const out = new Set<string>();
    let k = `${c[0]},${c[1]}`;
    out.add(k);
    while (parent.has(k)) {
      const p = parent.get(k)!;
      k = `${p[0]},${p[1]}`;
      out.add(k);
    }
    return out;
  };
  const good = pathTo(exits[correct]);
  for (let i = 0; i < exits.length; i++) {
    if (i === correct) continue;
    // Від хибного виходу йдемо до старту; прохід туди, де шлях уперше торкається правильного, замуровується.
    let k = `${exits[i][0]},${exits[i][1]}`;
    if (good.has(k)) return null;
    for (;;) {
      const p = parent.get(k)!;
      const pk = `${p[0]},${p[1]}`;
      if (good.has(pk)) {
        const [kx, ky] = k.split(',').map(Number);
        open.delete(edge([kx, ky], p));
        break;
      }
      k = pk;
    }
  }
  return { maze: { w, h, open }, start: [0, 0], exits, correct };
}
/** Перше зерно, з яким жоден хибний вихід не лежить на правильному шляху. */
export const MAZE = (() => {
  for (let n = 1; ; n++) {
    const m = buildMaze(`logic-maze-${n}`);
    if (m) return m;
  }
})();

function mazeSvg(): string {
  const { maze, exits } = MAZE;
  const s = 76;
  const x0 = (W - maze.w * s) / 2;
  const y0 = 90;
  let body = '';
  const wall = (a: Pt, b: Pt) => line([a, b], INK, 9);
  for (let y = 0; y < maze.h; y++)
    for (let x = 0; x < maze.w; x++) {
      const px = x0 + x * s;
      const py = y0 + y * s;
      if (x + 1 < maze.w && !maze.open.has(edge([x, y], [x + 1, y]))) body += wall([px + s, py], [px + s, py + s]);
      if (y + 1 < maze.h && !maze.open.has(edge([x, y], [x, y + 1]))) body += wall([px, py + s], [px + s, py + s]);
    }
  // Рамка з проходом угорі ліворуч і чотирма виходами внизу.
  body += wall([x0 + s, y0], [x0 + maze.w * s, y0]);
  body += wall([x0, y0], [x0, y0 + maze.h * s]);
  body += wall([x0 + maze.w * s, y0], [x0 + maze.w * s, y0 + maze.h * s]);
  const bottom = y0 + maze.h * s;
  const gaps = exits.map(([x]) => x).sort((a, b) => a - b);
  let from = 0;
  for (const g of gaps) {
    if (g > from) body += wall([x0 + from * s, bottom], [x0 + g * s, bottom]);
    from = g + 1;
  }
  if (from < maze.w) body += wall([x0 + from * s, bottom], [x0 + maze.w * s, bottom]);
  body += `<path d="M ${x0 + s / 2} ${y0 - 70} L ${x0 + s / 2} ${y0 - 10}" stroke="${GREEN}" stroke-width="10" stroke-linecap="round"/>` + poly([[x0 + s / 2 - 22, y0 - 34], [x0 + s / 2 + 22, y0 - 34], [x0 + s / 2, y0 - 4]], GREEN);
  body += text(x0 + s / 2 + 110, y0 - 44, 'Старт', 40, GREEN);
  exits.forEach(([x], i) => (body += badge(x0 + x * s + s / 2, bottom + 52, LETTERS[i])));
  return svg(800, body);
}

/* ---------- Розгортки куба ---------- */

/** «Яка НЕ складається»: три правильні розгортки й одна хибна (Б). */
export const NETS_ONE_BAD: Pt[][] = [
  [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [2, 2]],
  [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [3, 1]],
  [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [3, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]],
];
export const NETS_ONE_BAD_ANSWER = 1;
/** «Яка складається»: одна правильна (Г) і три хибні. */
export const NETS_ONE_GOOD: Pt[][] = [
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [1, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [3, 1]],
  [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [2, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [1, 2]],
];
export const NETS_ONE_GOOD_ANSWER = 3;

function netsSvg(nets: Pt[][]): string {
  const s = 62;
  let body = '';
  nets.forEach((cells, i) => {
    const cx = i % 2 === 0 ? 300 : 900;
    const cy = i < 2 ? 210 : 590;
    const mw = Math.max(...cells.map((c) => c[0])) + 1;
    const mh = Math.max(...cells.map((c) => c[1])) + 1;
    const x0 = cx - (mw * s) / 2;
    const y0 = cy - (mh * s) / 2;
    for (const [x, y] of cells) body += `<rect x="${x0 + x * s}" y="${y0 + y * s}" width="${s}" height="${s}" fill="#2f5d8a" stroke="${INK}" stroke-width="5"/>`;
    body += badge(cx - 250, cy - 120, LETTERS[i]);
  });
  body += line([[600, 40], [600, 760]], '#2a3045', 4) + line([[40, 400], [1160, 400]], '#2a3045', 4);
  return svg(800, body);
}

/* ---------- Поліоміно: поворот чи дзеркало ---------- */

export type PolyPuzzle = { sample: Pt[]; options: Pt[][]; answer: number };
const turn = (cells: Pt[], times: number): Pt[] => {
  let c = cells;
  for (let i = 0; i < times; i++) c = c.map(([x, y]) => [-y, x]);
  return c;
};
const flip = (cells: Pt[]): Pt[] => cells.map(([x, y]) => [-x, y]);
// Зразок для поля: шість клітинок; дзеркальний — варіант В.
const SAMPLE_A: Pt[] = [[0, 0], [1, 0], [1, 1], [1, 2], [1, 3], [2, 2]];
export const POLY_A: PolyPuzzle = { sample: SAMPLE_A, options: [turn(SAMPLE_A, 1), turn(SAMPLE_A, 2), flip(turn(SAMPLE_A, 1)), turn(SAMPLE_A, 3)], answer: 2 };
// Зразок для класики: сім клітинок; дзеркальний — варіант А.
const SAMPLE_B: Pt[] = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [2, 3], [3, 1]];
export const POLY_B: PolyPuzzle = { sample: SAMPLE_B, options: [flip(SAMPLE_B), turn(SAMPLE_B, 3), turn(SAMPLE_B, 2), turn(SAMPLE_B, 1)], answer: 0 };

function polySvg(p: PolyPuzzle): string {
  const s = 44;
  const draw = (cells: Pt[], cx: number, cy: number, fill: string) => {
    const mx = Math.min(...cells.map((c) => c[0]));
    const my = Math.min(...cells.map((c) => c[1]));
    const n = cells.map(([x, y]): Pt => [x - mx, y - my]);
    const w = Math.max(...n.map((c) => c[0])) + 1;
    const h = Math.max(...n.map((c) => c[1])) + 1;
    return n.map(([x, y]) => `<rect x="${cx - (w * s) / 2 + x * s}" y="${cy - (h * s) / 2 + y * s}" width="${s}" height="${s}" fill="${fill}" stroke="${BG}" stroke-width="4"/>`).join('');
  };
  let body = text(600, 50, 'Зразок', 40, DIM) + draw(p.sample, 600, 210, YEL);
  body += line([[60, 360], [1140, 360]], '#2a3045', 4);
  p.options.forEach((cells, i) => {
    const cx = 150 + i * 300;
    body += draw(cells, cx, 560, CYAN) + badge(cx, 740, LETTERS[i]);
  });
  return svg(800, body);
}

/* ---------- Латинський квадрат фігур і кольорів ---------- */

export const SHAPES = ['коло', 'квадрат', 'трикутник'] as const;
export const COLORS = [YEL, CYAN, PINK] as const;
export const COLOR_NAMES = ['жовтий', 'блакитний', 'рожевий'] as const;
/** Клітинка (r, c): фігура (r + c) % 3, колір (r + 2c) % 3; остання клітинка — знак питання. */
export const LATIN = Array.from({ length: 3 }, (_, r) => Array.from({ length: 3 }, (_, c) => ({ shape: (r + c) % 3, color: (r + 2 * c) % 3 })));
/** Варіанти для порожньої клітинки; правильний — Г (квадрат, жовтий). */
export const LATIN_OPTIONS = [
  { shape: 1, color: 1 },
  { shape: 2, color: 0 },
  { shape: 0, color: 0 },
  { shape: 1, color: 0 },
];
export const LATIN_ANSWER = 3;

const shapeAt = (shape: number, color: string, cx: number, cy: number, r: number) =>
  shape === 0
    ? circle(cx, cy, r, color)
    : shape === 1
      ? `<rect x="${cx - r * 0.88}" y="${cy - r * 0.88}" width="${r * 1.76}" height="${r * 1.76}" fill="${color}"/>`
      : poly(ngon(3, cx, cy + r * 0.15, r * 1.12), color);

function latinSvg(): string {
  const s = 190;
  const x0 = 70;
  const y0 = 120;
  let body = '';
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const cx = x0 + c * s + s / 2;
      const cy = y0 + r * s + s / 2;
      body += `<rect x="${x0 + c * s}" y="${y0 + r * s}" width="${s}" height="${s}" fill="none" stroke="${DIM}" stroke-width="5"/>`;
      body += r === 2 && c === 2 ? text(cx, cy, '?', 110, INK) : shapeAt(LATIN[r][c].shape, COLORS[LATIN[r][c].color], cx, cy, 58);
    }
  LATIN_OPTIONS.forEach((o, i) => {
    const cx = 790 + (i % 2) * 230;
    const cy = 250 + Math.floor(i / 2) * 270;
    body += `<rect x="${cx - 90}" y="${cy - 90}" width="180" height="180" rx="16" fill="#202638" stroke="${DIM}" stroke-width="3"/>`;
    body += shapeAt(o.shape, COLORS[o.color], cx, cy, 58) + badge(cx - 90, cy - 90, LETTERS[i]);
  });
  return svg(800, body);
}

/* ---------- Шестерні ---------- */

export type Gear = { x: number; y: number; r: number };
/** Ланцюжок із розгалуженням; перша (ліворуч) крутиться за годинниковою, питають про позначену «?» (індекс GEARS_ASK). */
export const GEARS: Gear[] = [
  { x: 300, y: 450, r: 110 },
  { x: 0, y: 0, r: 80 },
  { x: 0, y: 0, r: 120 },
  { x: 0, y: 0, r: 70 },
  { x: 0, y: 0, r: 95 },
  { x: 0, y: 0, r: 75 },
];
/** Розставляємо шестерні так, щоб сусіди точно торкалися: кожна — під кутом до попередньої (або до третьої для гілки). */
(() => {
  const place = (i: number, from: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    const d = GEARS[from].r + GEARS[i].r;
    GEARS[i].x = GEARS[from].x + d * Math.cos(a);
    GEARS[i].y = GEARS[from].y + d * Math.sin(a);
  };
  place(1, 0, -35);
  place(2, 1, 20);
  place(3, 2, -60);
  place(4, 3, 10);
  place(5, 2, 75);
})();
export const GEARS_ASK = 4;
/** Три шестерні, що торкаються одна одної по колу. */
export const GEARS_JAM: Gear[] = [
  { x: 420, y: 520, r: 150 },
  { x: 420 + 280, y: 520, r: 130 },
  { x: 0, y: 0, r: 120 },
];
(() => {
  // Третя торкається обох: відстані 150 + 120 = 270 і 130 + 120 = 250.
  const [a, b] = GEARS_JAM;
  const d = b.x - a.x;
  const ra = a.r + GEARS_JAM[2].r;
  const rb = b.r + GEARS_JAM[2].r;
  const x = (d * d + ra * ra - rb * rb) / (2 * d);
  GEARS_JAM[2].x = a.x + x;
  GEARS_JAM[2].y = a.y - Math.sqrt(ra * ra - x * x);
})();

const gear = ({ x, y, r }: Gear, fill: string, label = '') => {
  const teeth = Math.round(r / 12);
  const pts: Pt[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * 2 * Math.PI;
    const rr = i % 4 < 2 ? r + 4 : r - 14;
    pts.push([x + rr * Math.cos(a), y + rr * Math.sin(a)]);
  }
  return poly(pts, fill, BG, 2) + circle(x, y, r * 0.28, BG) + (label ? text(x, y, label, 52, INK) : '');
};
/** Стрілка за годинниковою над шестернею. */
const cwArrow = ({ x, y, r }: Gear) => {
  const R = r + 34;
  const a1 = (-160 * Math.PI) / 180;
  const a2 = (-95 * Math.PI) / 180;
  const p1: Pt = [x + R * Math.cos(a1), y + R * Math.sin(a1)];
  const p2: Pt = [x + R * Math.cos(a2), y + R * Math.sin(a2)];
  const tip: Pt = [x + (R) * Math.cos(a2 + 0.28), y + R * Math.sin(a2 + 0.28)];
  const n: Pt = [Math.cos(a2), Math.sin(a2)];
  return `<path d="M ${p1[0]} ${p1[1]} A ${R} ${R} 0 0 1 ${p2[0]} ${p2[1]}" fill="none" stroke="${GREEN}" stroke-width="10" stroke-linecap="round"/>` +
    poly([[p2[0] + n[0] * 22, p2[1] + n[1] * 22], [p2[0] - n[0] * 22, p2[1] - n[1] * 22], tip], GREEN);
};

function gearsSvg(gs: Gear[], ask: number | null): string {
  const fills = [CYAN, '#c7a6ff', YEL, '#ff9f6b', PINK, GREEN];
  let body = '';
  gs.forEach((g, i) => (body += gear(g, i === ask ? '#9aa0b5' : fills[i % fills.length], i === ask ? '?' : '')));
  body += cwArrow(gs[0]);
  return svg(800, body);
}

/* ---------- Терези ---------- */

const scale = (cx: number, cy: number, left: string, right: string) =>
  line([[cx - 230, cy], [cx + 230, cy]], DIM, 8) +
  poly([[cx, cy], [cx - 30, cy + 90], [cx + 30, cy + 90]], DIM) +
  `<path d="M ${cx - 230} ${cy} L ${cx - 230} ${cy - 10}" stroke="${DIM}" stroke-width="6"/>` +
  `<g transform="translate(${cx - 130},${cy - 46})">${left}</g><g transform="translate(${cx + 130},${cy - 46})">${right}</g>`;
/** Ряд фігур із центром у (0, 0): c — коло, s — квадрат, t — трикутник; q — знак питання. */
const row = (items: string) => {
  const n = items.length;
  return [...items]
    .map((it, i) => {
      const x = (i - (n - 1) / 2) * 62;
      if (it === 'c') return circle(x, 0, 27, YEL);
      if (it === 's') return `<rect x="${x - 27}" y="-27" width="54" height="54" fill="${CYAN}"/>`;
      if (it === 't') return poly(ngon(3, x, 4, 32), PINK);
      return text(x, 0, '?', 64, INK);
    })
    .join('');
};
/** Терези: ccc = s, s + c = t; питання: tt = ? кіл. */
export const SCALES = { square: 3, triangle: 4, ask: 8 };
function scalesSvg(): string {
  return svg(
    800,
    scale(300, 230, row('ccc'), row('s')) +
      scale(900, 230, row('sc'), row('t')) +
      scale(600, 600, row('tt'), `${row('q')}<g transform="translate(70,0)">${circle(0, 0, 27, YEL)}</g>`) +
      line([[60, 410], [1140, 410]], '#2a3045', 4),
  );
}

/* ---------- Числова піраміда ---------- */

/** Кожна цеглина — сума двох під нею. Нижній ряд: 3, ?, 5, 2; верх — 41. */
export const PYRAMID = { bottom: [3, null, 5, 2] as (number | null)[], top: 41, answer: 7 };
function pyramidSvg(): string {
  const bw = 210;
  const bh = 120;
  let body = '';
  for (let level = 0; level < 4; level++) {
    const n = 4 - level;
    const y = 640 - level * bh;
    const x0 = 600 - (n * bw) / 2;
    for (let i = 0; i < n; i++) {
      body += `<rect x="${x0 + i * bw}" y="${y}" width="${bw}" height="${bh}" fill="#24304a" stroke="${INK}" stroke-width="5"/>`;
      const v = level === 0 ? PYRAMID.bottom[i] : level === 3 ? PYRAMID.top : undefined;
      if (v === null) body += text(x0 + i * bw + bw / 2, y + bh / 2, '?', 64, YEL);
      else if (v !== undefined) body += text(x0 + i * bw + bw / 2, y + bh / 2, String(v), 60, INK);
    }
  }
  return svg(800, body);
}

/* ---------- Стрілки: що далі ---------- */

/** Стрілка повертається на 45° за годинниковою, крапок щоразу на одну більше. Варіанти: (кут, крапки); правильний — Б. */
export const ARROWS = { shown: [0, 45, 90, 135], dots: [1, 2, 3, 4], options: [[180, 4], [180, 5], [225, 5], [90, 5]] as [number, number][], answer: 1 };
const arrowTile = (cx: number, cy: number, deg: number, dots: number, s = 200) => {
  const r = s / 2 - 10;
  let b = `<rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="18" fill="#202638" stroke="${DIM}" stroke-width="3"/>`;
  b += `<g transform="rotate(${deg} ${cx} ${cy - 10})">${line([[cx, cy + 45], [cx, cy - 55]], INK, 12)}${poly([[cx - 28, cy - 35], [cx + 28, cy - 35], [cx, cy - 72]], INK)}</g>`;
  for (let i = 0; i < dots; i++) b += circle(cx - ((dots - 1) * 26) / 2 + i * 26, cy + r - 16, 9, YEL);
  return b;
};
function arrowsSvg(): string {
  let body = '';
  ARROWS.shown.forEach((deg, i) => (body += arrowTile(130 + i * 235, 180, deg, ARROWS.dots[i])));
  body += `<rect x="${130 + 4 * 235 - 100}" y="80" width="200" height="200" rx="18" fill="none" stroke="${YEL}" stroke-width="5" stroke-dasharray="18 12"/>` + text(130 + 4 * 235, 180, '?', 100, YEL);
  body += line([[60, 370], [1140, 370]], '#2a3045', 4);
  ARROWS.options.forEach(([deg, dots], i) => (body += arrowTile(180 + i * 280, 560, deg, dots) + badge(180 + i * 280 - 100, 460, LETTERS[i])));
  return svg(800, body);
}

/* ---------- Зайва фігура ---------- */

/** Сторін і крапок у фігурах; у зайвої крапок не стільки, скільки сторін. */
export const ODD = { figures: [[4, 4], [3, 3], [6, 5], [5, 5]] as [number, number][], answer: 2 };
function oddSvg(): string {
  let body = '';
  ODD.figures.forEach(([sides, dots], i) => {
    const cx = 160 + i * 293;
    const cy = 330;
    body += poly(ngon(sides, cx, cy + (sides === 3 ? 20 : 0), 120, sides === 4 ? -Math.PI / 4 : -Math.PI / 2), 'none', CYAN, 9);
    const pts = ngon(dots, cx, cy + (sides === 3 ? 25 : 0), dots === 1 ? 0 : sides === 3 ? 38 : 50, Math.PI / 2);
    for (const [x, y] of pts) body += circle(x, y, 13, YEL);
    body += badge(cx, 600, LETTERS[i]);
  });
  return svg(720, body);
}

/* ---------- Годинники ---------- */

/** Годинники: 3:00, 4:15, 5:30, 6:45 → ? */
export const CLOCKS = { shown: [[3, 0], [4, 15], [5, 30], [6, 45]] as [number, number][], options: ['7:45', '8:00', '8:15', '7:60'], answer: 1 };
const clock = (cx: number, cy: number, h: number, m: number, r = 115) => {
  let b = circle(cx, cy, r, '#202638', INK, 7);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI;
    const big = i % 3 === 0;
    b += line([[cx + (r - (big ? 28 : 18)) * Math.sin(a), cy - (r - (big ? 28 : 18)) * Math.cos(a)], [cx + (r - 8) * Math.sin(a), cy - (r - 8) * Math.cos(a)]], big ? INK : DIM, big ? 7 : 4);
  }
  const ha = (((h % 12) + m / 60) / 12) * 2 * Math.PI;
  const ma = (m / 60) * 2 * Math.PI;
  b += line([[cx, cy], [cx + r * 0.5 * Math.sin(ha), cy - r * 0.5 * Math.cos(ha)]], YEL, 13);
  b += line([[cx, cy], [cx + r * 0.8 * Math.sin(ma), cy - r * 0.8 * Math.cos(ma)]], CYAN, 8);
  return b + circle(cx, cy, 10, INK);
};
function clocksSvg(): string {
  let body = '';
  CLOCKS.shown.forEach(([h, m], i) => (body += clock(140 + i * 230, 300, h, m, 100)));
  body += circle(140 + 4 * 230, 300, 100, 'none', YEL, 6) + text(140 + 4 * 230, 300, '?', 100, YEL);
  return svg(600, body);
}

/* ---------- Мапа скарбу (точка) ---------- */

/** Мапа 8×6 клітинок; орієнтири в клітинках (x, y від лівого верхнього кута, y — на південь). */
export const TREASURE = {
  cols: 8,
  rows: 6,
  marks: { well: [1, 1], oak: [6, 1], stone: [2, 4], hut: [5, 4] } as Record<string, Pt>,
  /** Від криниці (1, 1) на схід до стовпця хати (5, 1), далі 2 клітинки на південь → (5, 3), просто над хатою. */
  answer: [5, 3] as Pt,
};
export const TREASURE_SIZE = { w: 1200, h: 900, x0: 160, y0: 90, s: 120 };
function treasureSvg(): string {
  const { x0, y0, s } = TREASURE_SIZE;
  const { cols, rows, marks } = TREASURE;
  let body = `<rect x="${x0}" y="${y0}" width="${cols * s}" height="${rows * s}" fill="#22301f"/>`;
  for (const seg of grid(x0, y0, cols, rows, s)) body += line(seg, '#4c5d48', 3);
  const at = ([x, y]: Pt): Pt => [x0 + x * s + s / 2, y0 + y * s + s / 2];
  const [wx, wy] = at(marks.well);
  body += circle(wx, wy, 40, '#3a8bd1', INK, 6) + circle(wx, wy, 18, '#1d4f80');
  const [ox, oy] = at(marks.oak);
  body += `<rect x="${ox - 9}" y="${oy + 10}" width="18" height="40" fill="#8a5a2b"/>` + circle(ox, oy - 8, 40, '#3fae4f');
  const [sx, sy] = at(marks.stone);
  body += poly([[sx - 44, sy + 30], [sx - 30, sy - 20], [sx + 5, sy - 34], [sx + 40, sy - 10], [sx + 46, sy + 30]], '#9aa0aa', INK, 4);
  const [hx, hy] = at(marks.hut);
  body += `<rect x="${hx - 36}" y="${hy - 6}" width="72" height="48" fill="#d9a066"/>` + poly([[hx - 48, hy - 4], [hx, hy - 48], [hx + 48, hy - 4]], '#b5452f');
  // Легенда й компас.
  const legend: [string, string][] = [['криниця', '#3a8bd1'], ['дуб', '#3fae4f'], ['камінь', '#9aa0aa'], ['хата', '#d9a066']];
  legend.forEach(([name, color], i) => (body += circle(x0 + 30 + i * 250, 70 + rows * s + 70, 16, color) + text(x0 + 58 + i * 250, 70 + rows * s + 72, name, 34, INK, 'start', 'normal')));
  body += line([[90, 300], [90, 170]], INK, 7) + poly([[70, 190], [110, 190], [90, 150]], INK) + text(90, 120, 'Пн', 36, INK);
  return svg(TREASURE_SIZE.h, body);
}

/* ---------- Ребуси ---------- */

const big = (x: number, y: number, s: string, size = 170, fill = INK) => text(x, y, s, size, fill);
/** Кома: ставиться перед словом чи після нього. */
const comma = (x: number, y: number) => text(x, y, ',', 170, YEL);
const REBUS_SVG: Record<string, () => string> = {
  // «40,» + «ЧКА»: сорок без останньої літери → соро + чка.
  r1: () => svg(420, big(390, 210, '40') + comma(530, 230) + big(760, 210, 'ЧКА')),
  // ВІ + 3 + НА.
  r2: () => svg(420, big(600, 210, 'ВІ<tspan fill="' + YEL + '">3</tspan>НА', 190)),
  // 100 + ЛИЦЯ.
  r3: () => svg(420, big(600, 210, '<tspan fill="' + YEL + '">100</tspan>ЛИЦЯ', 170)),
  // 7 + Я.
  r4: () => svg(420, big(600, 210, '<tspan fill="' + YEL + '">7</tspan>Я', 220)),
  // «КА» над «ДА»: ка на да.
  r5: () => svg(560, big(600, 165, 'КА', 160, CYAN) + big(600, 395, 'ДА', 160)),
  // «2,» + «ЕРІ»: два/дві без останньої літери → дв + ері.
  r7: () => svg(420, big(380, 210, '2') + comma(470, 230) + big(720, 210, 'ЕРІ')),
  // «5,» + «НИЦЯ»: п’ять без останньої літери → п’ят + ниця.
  r8: () => svg(420, big(330, 210, '5') + comma(420, 230) + big(730, 210, 'НИЦЯ')),
  // Куб (малюнок) + «ОК».
  r9: () => {
    const c = (x: number, y: number) =>
      poly([[x, y], [x + 150, y], [x + 150, y + 150], [x, y + 150]], '#2f5d8a', INK, 6) +
      poly([[x, y], [x + 70, y - 70], [x + 220, y - 70], [x + 150, y]], '#3f78ad', INK, 6) +
      poly([[x + 150, y], [x + 220, y - 70], [x + 220, y + 80], [x + 150, y + 150]], '#244a70', INK, 6);
    return svg(460, c(250, 170) + big(800, 240, 'ОК'));
  },
  // Нота (малюнок) + «ТКА».
  r10: () =>
    svg(
      460,
      `<ellipse cx="330" cy="320" rx="70" ry="50" transform="rotate(-20 330 320)" fill="${YEL}"/>` +
        line([[394, 300], [394, 80]], YEL, 14) +
        `<path d="M 394 80 C 430 120, 500 140, 470 230" stroke="${YEL}" stroke-width="14" fill="none" stroke-linecap="round"/>` +
        big(780, 240, 'ТКА'),
    ),
  // «МАКЕТА» з підписом «М = Р».
  r11: () => svg(460, big(600, 260, 'МАКЕТА', 170) + text(600, 80, 'М = Р', 80, YEL)),
  // Коло (малюнок) + «С».
  r12: () => svg(420, circle(400, 210, 130, 'none', CYAN, 16) + big(780, 210, 'С', 200)),
};

/** Ключ картинки → SVG. Ключі нейтральні: g01…, r1…; відповіді в назвах немає. */
export const FIGURES: Record<string, () => string> = {
  g01: () => figure(TRI_EASY),
  g02: () => figure(TRI_MID),
  g03: () => figure(TRI_HARD),
  g04: () => figure(SQUARES, 760),
  g05: () => figure(RECTS, 700),
  g06: () => matchSvg(MATCHES.easy),
  g07: () => matchSvg(MATCHES.mid),
  g08: () => matchSvg(MATCHES.hard),
  g09: mazeSvg,
  g10: () => netsSvg(NETS_ONE_BAD),
  g11: () => netsSvg(NETS_ONE_GOOD),
  g12: () => polySvg(POLY_A),
  g13: () => polySvg(POLY_B),
  g14: latinSvg,
  g15: () => gearsSvg(GEARS, GEARS_ASK),
  g16: () => gearsSvg(GEARS_JAM, null),
  g17: scalesSvg,
  g18: pyramidSvg,
  g19: arrowsSvg,
  g20: oddSvg,
  g21: clocksSvg,
  g22: treasureSvg,
  ...REBUS_SVG,
};
