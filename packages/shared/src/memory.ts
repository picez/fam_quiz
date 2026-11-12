/** «Пам'ять» (29f): чиста детермінована логіка сіток, розкладу, пар і балів. LIMITS тут не імпортуємо (quiz.ts імпортує цей файл). */
import { seededRng } from './sudoku';

export const MEMORY_GRIDS = ['3x4', '4x4', '4x5'] as const;
export type MemoryGrid = (typeof MEMORY_GRIDS)[number];
export const MEMORY_TEXT_MAX = 40;
export const MEMORY_MAX_CELLS = 20;

export interface MemoryCard {
  text: string;
  imageUrl?: string;
}

const SIZES: Record<MemoryGrid, { cols: number; rows: number; pairs: number }> = {
  '3x4': { cols: 3, rows: 4, pairs: 6 },
  '4x4': { cols: 4, rows: 4, pairs: 8 },
  '4x5': { cols: 4, rows: 5, pairs: 10 },
};

export function memoryGridSize(grid: MemoryGrid): { cols: number; rows: number; pairs: number } {
  return { ...SIZES[grid] };
}

/** layout[cell] = card, card = 2·pair + side (0 — a, 1 — b). Фішер—Єйтс із seededRng. */
export function memoryLayout(pairs: number, seed: number): number[] {
  const rng = seededRng(seed);
  const items = Array.from({ length: pairs * 2 }, (_, i) => i);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function memoryPairOf(layout: readonly number[], cell: number): number {
  return Math.floor(layout[cell] / 2);
}

export function memoryCardAt(
  question: { pairs: readonly { a: MemoryCard; b: MemoryCard }[] },
  layout: readonly number[],
  cell: number,
): MemoryCard {
  const card = layout[cell];
  const pair = question.pairs[Math.floor(card / 2)];
  return card % 2 === 0 ? pair.a : pair.b;
}

export function memoryCardKey(card: MemoryCard): string {
  if (card.imageUrl !== undefined) return 'i:' + card.imageUrl;
  return 't:' + card.text.normalize('NFC').trim().toLocaleLowerCase('uk');
}

/** Бали за швидкість: найшвидший отримує base. max(1, …) і на fastestMs, і на ownMs - щоб нульовий час не дав ні нуля, ні ділення на нуль. */
export function memoryPoints(base: number, fastestMs: number, ownMs: number): number {
  return Math.round((base * Math.max(1, fastestMs)) / Math.max(1, ownMs));
}
