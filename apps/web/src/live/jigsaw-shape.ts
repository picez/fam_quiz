/** Виступ — до цієї частки меншої сторони ядра шматочка назовні. */
export const JIGSAW_TAB = 0.2;

/** Поле навколо ядра, яке займають виступи: canvas/SVG шматочка має розмір (w + 2·pad) × (h + 2·pad). */
export function piecePad(w: number, h: number): number {
  return Math.ceil(JIGSAW_TAB * Math.min(w, h)) + 1;
}

const num = (value: number): string => String(Math.round(value * 100) / 100 + 0);

interface Frame {
  /** Початок ребра. */
  ox: number;
  oy: number;
  /** Одиничний напрям уздовж ребра (за годинниковою). */
  dx: number;
  dy: number;
  /** Одиничний вектор назовні від шматочка. */
  nx: number;
  ny: number;
}

/**
 * Одне ребро від початку до кінця: пряма (side 0) або класичний виступ «шийка + голова» (1 — назовні, −1 — всередину).
 * Крива симетрична щодо середини ребра, тож сусідній шматочок, що обходить те саме ребро навпаки, малює ту саму лінію.
 */
function edge({ ox, oy, dx, dy, nx, ny }: Frame, length: number, side: number, small: number): string {
  const at = (u: number, v: number) => `${num(ox + dx * u + nx * v * side)} ${num(oy + dy * u + ny * v * side)}`;
  if (side === 0) return `L${num(ox + dx * length)} ${num(oy + dy * length)}`;
  const d = JIGSAW_TAB * small;
  const neck = 0.06 * small;
  const head = 0.12 * small;
  const c = length / 2;
  return [
    `L${at(c - neck, 0)}`,
    `C${at(c - neck, 0.35 * d)} ${at(c - head * 1.05, 0.3 * d)} ${at(c - head, 0.6 * d)}`,
    `C${at(c - head * 1.05, d)} ${at(c + head * 1.05, d)} ${at(c + head, 0.6 * d)}`,
    `C${at(c + head * 1.05, 0.3 * d)} ${at(c + neck, 0.35 * d)} ${at(c + neck, 0)}`,
    `L${num(ox + dx * length)} ${num(oy + dy * length)}`,
  ].join(' ');
}

/**
 * Шлях SVG (d) шматочка в пікселях: ядро в (0,0)…(w,h), сторони за годинниковою — top, right, bottom, left
 * (0 — пряма, 1 — виступ назовні, −1 — западина, як jigsawSides). Виступ іде до JIGSAW_TAB × меншої сторони назовні.
 * (x, y) — зсув ядра: мініатюри сцени збирають шматочки однієї рамки без transform.
 */
export function piecePath(sides: [number, number, number, number], w: number, h: number, x = 0, y = 0): string {
  const small = Math.min(w, h);
  const [top, right, bottom, left] = sides;
  return [
    `M${num(x)} ${num(y)}`,
    edge({ ox: x, oy: y, dx: 1, dy: 0, nx: 0, ny: -1 }, w, top, small),
    edge({ ox: x + w, oy: y, dx: 0, dy: 1, nx: 1, ny: 0 }, h, right, small),
    edge({ ox: x + w, oy: y + h, dx: -1, dy: 0, nx: 0, ny: 1 }, w, bottom, small),
    edge({ ox: x, oy: y + h, dx: 0, dy: -1, nx: -1, ny: 0 }, h, left, small),
    'Z',
  ].join(' ');
}
