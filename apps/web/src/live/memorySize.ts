/** Найменша картка «Пам'яті», при якій текст ще читається; менше — краще дати екрану прокрутку. */
export const MEMORY_MIN_CARD = 52;

export interface MemoryCardSizeInput {
  /** Ширина поля, у якому стоїть сітка (px). */
  width: number;
  /** Висота, яку сітка може зайняти від свого верху до низу вікна (px), без рядка стану під нею. */
  height: number;
  cols: number;
  rows: number;
  gap: number;
}

/**
 * Сторона квадратної картки: менше з «за шириною» і «за висотою», але за висотою — не менше MEMORY_MIN_CARD (тоді екран прокручується,
 * а картка лишається читабельною); за шириною менше можна — вужче поле не лишає вибору. Ціле число px (округлення вниз).
 */
export function memoryCardSize({ width, height, cols, rows, gap }: MemoryCardSizeInput): number {
  const byWidth = (width - (cols - 1) * gap) / cols;
  const byHeight = (height - (rows - 1) * gap) / rows;
  const size = Math.min(byWidth, Math.max(byHeight, MEMORY_MIN_CARD));
  return Math.max(0, Math.floor(size));
}
