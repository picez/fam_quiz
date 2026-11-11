import { seededRng } from './sudoku';

export const JIGSAW_ASPECTS = ['1:1', '4:3', '3:4', '16:9'] as const;
export type JigsawAspect = (typeof JIGSAW_ASPECTS)[number];

export const JIGSAW_MIN_PIECES = 6;
export const JIGSAW_MAX_PIECES = 36;
/** Прилипання: відстань до свого місця менша за цю частку розміру шматочка. */
export const JIGSAW_SNAP = 0.25;

const RATIOS: Record<JigsawAspect, number> = { '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4, '16:9': 16 / 9 };

/** Ширина / висота. */
export function aspectRatio(aspect: JigsawAspect): number {
  return RATIOS[aspect];
}

/** Пропорція (ширина / висота) одного шматочка. */
export function jigsawPieceRatio(rows: number, cols: number, aspect: JigsawAspect): number {
  return (aspectRatio(aspect) / cols) * rows;
}

export function jigsawGrid(pieces: number, aspect: JigsawAspect): { rows: number; cols: number } {
  let best = { rows: 2, cols: 3 };
  let bestKey: [number, number, number] | null = null;
  for (let rows = 2; rows <= 12; rows++) {
    for (let cols = 2; cols <= 12; cols++) {
      const n = rows * cols;
      if (n < JIGSAW_MIN_PIECES || n > JIGSAW_MAX_PIECES) continue;
      const p = jigsawPieceRatio(rows, cols, aspect);
      if (p < 0.5 || p > 2) continue;
      const key: [number, number, number] = [Math.abs(n - pieces), Math.abs(Math.log(p)), rows];
      if (
        !bestKey ||
        key[0] < bestKey[0] ||
        (key[0] === bestKey[0] && (key[1] < bestKey[1] - 1e-12 || (Math.abs(key[1] - bestKey[1]) <= 1e-12 && key[2] < bestKey[2])))
      ) {
        best = { rows, cols };
        bestKey = key;
      }
    }
  }
  return best;
}

export function jigsawEdgeCount(rows: number, cols: number): number {
  return rows * (cols - 1) + (rows - 1) * cols;
}

/** По символу на внутрішнє ребро: спершу вертикальні (між (r,c) і (r,c+1)), потім горизонтальні (між (r,c) і (r+1,c)). */
export function jigsawTabs(rows: number, cols: number, seed: number): string {
  const rng = seededRng(seed);
  let out = '';
  for (let i = jigsawEdgeCount(rows, cols); i > 0; i--) out += rng() < 0.5 ? '0' : '1';
  return out;
}

/** Сторони шматочка k: 0 — пряма, 1 — виступ назовні, −1 — западина; порядок top, right, bottom, left. */
export function jigsawSides(rows: number, cols: number, tabs: string, piece: number): [number, number, number, number] {
  const r = Math.floor(piece / cols);
  const c = piece % cols;
  const vertical = (rr: number, cc: number) => (tabs[rr * (cols - 1) + cc] === '1' ? 1 : -1);
  const horizontal = (rr: number, cc: number) => (tabs[rows * (cols - 1) + rr * cols + cc] === '1' ? 1 : -1);
  const top = r === 0 ? 0 : -horizontal(r - 1, c);
  const bottom = r === rows - 1 ? 0 : horizontal(r, c);
  const left = c === 0 ? 0 : -vertical(r, c - 1);
  const right = c === cols - 1 ? 0 : vertical(r, c);
  return [top, right, bottom, left];
}

/** Шматочок прилипає: поворот правильний і відстань до свого місця менша за JIGSAW_SNAP. */
export function jigsawFits(grid: { rows: number; cols: number }, piece: number, x: number, y: number, rot: number): boolean {
  const total = grid.rows * grid.cols;
  if (!Number.isInteger(piece) || piece < 0 || piece >= total) return false;
  if (rot !== 0) return false;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const col = piece % grid.cols;
  const row = Math.floor(piece / grid.cols);
  return Math.hypot(x - col, y - row) < JIGSAW_SNAP;
}

/** Обрізання фото: прямокутник у пікселях оригіналу, focus — частка запасу. */
export function jigsawCrop(
  width: number,
  height: number,
  aspect: JigsawAspect,
  focus: { x: number; y: number },
): { sx: number; sy: number; sw: number; sh: number } {
  const ratio = aspectRatio(aspect);
  let sw = width;
  let sh = width / ratio;
  if (sh > height) {
    sh = height;
    sw = height * ratio;
  }
  return { sx: (width - sw) * focus.x, sy: (height - sh) * focus.y, sw, sh };
}
