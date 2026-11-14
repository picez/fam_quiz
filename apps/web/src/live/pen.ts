import { DRAWING_SCALE, LIMITS, clamp, type DrawOp } from '@quiz/shared';

/** «Малюнок» (28c): як часто телефон художника шле пакет точок, мс. */
export const DRAW_FLUSH_MS = 80;
/** Найменший крок між точками штриха в одиницях сітки 0…DRAWING_SCALE: дрібніший рух точки не додає. */
export const DRAW_MIN_STEP = 3;

/** Перо художника без DOM: точки 0…1 від полотна → операції малювання для сервера. */
export interface Pen {
  /** Початок штриха: x, y — частки ширини й висоти полотна (0…1), c — колір чи гумка, w — товщина. */
  down(x: number, y: number, c: number, w: number): void;
  move(x: number, y: number): void;
  up(): void;
  /** Усе, що назбиралося з минулого разу: begin нового штриха й more продовжень, кожен пакет ≤ drawBatch точок. */
  flush(): DrawOp[];
}

interface PenStroke {
  c: number;
  w: number;
  /** Номер штриха на сервері; null — begin ще не пішов. */
  index: number | null;
  /** Усі точки штриха (пласкі). */
  p: number[];
  /** Скільки чисел із p уже пішло. */
  sent: number;
}

const quantize = (value: number) => clamp(Math.round(value * DRAWING_SCALE), 0, DRAWING_SCALE);

/**
 * next — номер наступного штриха в малюнку (довжина локальної моделі художника); питається під час flush для штриха, чий begin ще не пішов.
 * Штрих, що досяг maxStrokePoints, продовжується новим штрихом з останньої точки, тож лінія не рветься.
 */
export function createPen(next: () => number): Pen {
  // Штрихи, у яких ще є невіслані точки; останній — поточний, якщо перо опущене.
  let queue: PenStroke[] = [];
  let current: PenStroke | null = null;

  const add = (x: number, y: number) => {
    if (current === null) return;
    if (current.p.length / 2 >= LIMITS.maxStrokePoints) {
      const lastX = current.p[current.p.length - 2]!;
      const lastY = current.p[current.p.length - 1]!;
      current = { c: current.c, w: current.w, index: null, p: [lastX, lastY], sent: 0 };
      queue.push(current);
    }
    current.p.push(x, y);
  };

  return {
    down(x, y, c, w) {
      current = { c, w, index: null, p: [quantize(x), quantize(y)], sent: 0 };
      queue.push(current);
    },
    move(x, y) {
      if (current === null) return;
      const qx = quantize(x);
      const qy = quantize(y);
      const lastX = current.p[current.p.length - 2]!;
      const lastY = current.p[current.p.length - 1]!;
      if (Math.hypot(qx - lastX, qy - lastY) < DRAW_MIN_STEP) return;
      add(qx, qy);
    },
    up() {
      current = null;
    },
    flush() {
      const ops: DrawOp[] = [];
      const batch = LIMITS.drawBatch * 2;
      let fresh = 0;
      for (const stroke of queue) {
        if (stroke.index === null) {
          stroke.index = next() + fresh;
          fresh += 1;
          const p = stroke.p.slice(0, batch);
          ops.push({ op: 'begin', c: stroke.c, w: stroke.w, p });
          stroke.sent = p.length;
        }
        while (stroke.sent < stroke.p.length) {
          const p = stroke.p.slice(stroke.sent, stroke.sent + batch);
          ops.push({ op: 'more', index: stroke.index, p });
          stroke.sent += p.length;
        }
      }
      // Лишається лише поточний штрих: до нього ще додаватимуться точки.
      queue = current === null ? [] : [current];
      return ops;
    },
  };
}
