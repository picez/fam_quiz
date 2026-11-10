/** «Малюнок» (28c): штрихи на полотні 4:3 у сітці 0…DRAWING_SCALE; один код і для рушія, і для клієнта. */

export const DRAWING_SCALE = 1000;
export const DRAWING_ASPECT = 4 / 3;
export const DRAWING_COLORS = ['#1f1f1f', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41'] as const;
/** Індекс кольору «гумка»: малює кольором тла. */
export const DRAWING_ERASER = DRAWING_COLORS.length;
export const DRAWING_BACKGROUND = '#ffffff';
/** Товщини в тисячних ширини полотна. */
export const DRAWING_WIDTHS = [6, 14, 32] as const;

/** c — індекс у DRAWING_COLORS чи DRAWING_ERASER, w — індекс у DRAWING_WIDTHS, p — пласкі [x0, y0, x1, y1, …]. */
export interface Stroke {
  c: number;
  w: number;
  p: number[];
}

export type DrawOp =
  | { op: 'begin'; c: number; w: number; p: number[] }
  | { op: 'more'; index: number; p: number[] }
  | { op: 'undo' }
  | { op: 'clear' };

/** Подія drawing: операція чи повний знімок поточного запитання; questionIndex — номер у раунді, як view.questionIndex. */
export type DrawingEvent =
  | { kind: 'ops'; questionIndex: number; rev: number; op: DrawOp }
  | { kind: 'sync'; questionIndex: number; rev: number; strokes: Stroke[] };

/** Застосовує операцію (без перевірок прав і меж): нові масиви, вхід не змінюється. */
export function applyDrawOp(strokes: readonly Stroke[], op: DrawOp): Stroke[] {
  switch (op.op) {
    case 'begin':
      return [...strokes, { c: op.c, w: op.w, p: [...op.p] }];
    case 'more':
      return strokes.map((s, i) => (i === op.index ? { ...s, p: [...s.p, ...op.p] } : s));
    case 'undo':
      return strokes.slice(0, -1);
    case 'clear':
      return [];
  }
}

/** Точок у всьому малюнку. */
export function strokePoints(strokes: readonly Stroke[]): number {
  return strokes.reduce((sum, s) => sum + s.p.length / 2, 0);
}

/**
 * Стиснений запис для історії: штрихи через «;», штрих — цифра кольору, цифра товщини, «:», далі base36 зі знаком через «,»:
 * перша точка абсолютна, решта — різницями від попередньої.
 */
export function packStrokes(strokes: readonly Stroke[]): string {
  return strokes
    .map((s) => {
      const nums = s.p.map((v, i) => (i < 2 ? v : v - s.p[i - 2]!).toString(36));
      return `${s.c}${s.w}:${nums.join(',')}`;
    })
    .join(';');
}

const PACKED_STROKE = /^([0-8])([0-2]):(-?[0-9a-z]+(?:,-?[0-9a-z]+)*)$/;

/** Обернена до packStrokes; зіпсований рядок дає []. */
export function unpackStrokes(packed: string): Stroke[] {
  if (packed === '') return [];
  const out: Stroke[] = [];
  for (const part of packed.split(';')) {
    const m = PACKED_STROKE.exec(part);
    if (m === null) return [];
    const p = m[3]!.split(',').map((t) => parseInt(t, 36));
    if (p.length < 2 || p.length % 2 !== 0 || p.some((n) => !Number.isInteger(n))) return [];
    for (let i = 2; i < p.length; i += 1) p[i] = p[i]! + p[i - 2]!;
    if (p.some((v) => v < 0 || v > DRAWING_SCALE)) return [];
    out.push({ c: Number(m[1]), w: Number(m[2]), p });
  }
  return out;
}
