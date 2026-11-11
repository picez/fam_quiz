/** «Знайди відмінності» (29d): чиста геометрія влучання, допуску й балів. LIMITS тут не імпортуємо (quiz.ts імпортує цей файл). */

export const SPOT_SLACK = 0.04; // частка ширини
export const SPOT_MIN_PX = 24; // CSS px на екрані гравця
/** Стеля допуску: на дуже вузькій картинці 24 px не роздувають зону влучання понад 8 % ширини. */
export const SPOT_MAX_SLACK = 0.08;
/** Ширина картинки на екрані гравця (CSS px): вертикальні картинки поруч на телефоні бувають вузькими. */
export const SPOT_MIN_WIDTH = 60;
export const SPOT_MAX_WIDTH = 4000;
/** Співвідношення сторін (ширина / висота): вужче за 1 : 2 чи ширше за 3 : 1 на телефоні стає надто дрібним. */
export const SPOT_MIN_ASPECT = 0.5;
export const SPOT_MAX_ASPECT = 3;
export const SPOT_MIN_R = 0.015;
export const SPOT_MAX_R = 0.25;
export const SPOT_DEFAULT_R = 0.06;
export const SPOT_MIN_COUNT = 1;
export const SPOT_MAX_COUNT = 10;
export const SPOT_ASPECT_TOLERANCE = 0.02;

/** Коло відмінності: центр — частки ширини й висоти, радіус — частка ширини. */
export interface SpotCircle {
  x: number;
  y: number;
  r: number;
}

/** Допуск у ширинах картинки: 24 px на екрані гравця, але не менше 4 % і не більше 8 % ширини. */
export function spotSlack(width: number): number {
  return Math.max(SPOT_SLACK, Math.min(SPOT_MIN_PX / width, SPOT_MAX_SLACK));
}

/**
 * Тап (x, y) — частки картинки, width — її ширина в CSS px.
 * Індекс найближчого незнайденого кола; 'found' — зачепив лише вже знайдене; null — промах.
 */
export function spotHit(
  question: { aspect: number; spots: readonly SpotCircle[] },
  x: number,
  y: number,
  width: number,
  found: ReadonlySet<number>,
): number | 'found' | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || width <= 0) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  const slack = spotSlack(width);
  let best = -1;
  let bestEdge = Infinity;
  let touchedFound = false;
  question.spots.forEach((s, i) => {
    const d = Math.hypot(x - s.x, (y - s.y) / question.aspect);
    if (d > s.r + slack + 1e-9) return;
    if (found.has(i)) {
      touchedFound = true;
      return;
    }
    if (d - s.r < bestEdge) {
      bestEdge = d - s.r;
      best = i;
    }
  });
  if (best >= 0) return best;
  return touchedFound ? 'found' : null;
}

/** Усі знайдені — повна ціна; інакше пропорційно. */
export function spotPoints(base: number, found: number, total: number): number {
  if (total <= 0) return 0;
  return found === total ? base : Math.round((base * found) / total);
}

/** Другу картинку приймаємо, якщо її співвідношення сторін відрізняється не більше ніж на 2 %. */
export function aspectsMatch(a: number, b: number): boolean {
  return Math.abs(b / a - 1) <= SPOT_ASPECT_TOLERANCE + 1e-9;
}
