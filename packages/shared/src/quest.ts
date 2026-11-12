/** «Квест із кодом» (29g): чиста логіка — без значень з quiz.ts (quiz.ts імпортує цей файл). */

/** Вікно на введення коду після запитань раунду. */
export const QUEST_WINDOW_MS = 30_000;

/** Нормалізація коду: NFC, верхній регістр, лише літери й цифри («20.07» → «2007», « сова » → «СОВА»). */
export function questKey(raw: string): string {
  return raw
    .normalize('NFC')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Частка бонусу: 1 − k / (n + 1); k обрізається до 0…n. */
export function questShare(after: number, count: number): number {
  const k = Math.min(Math.max(after, 0), Math.max(count, 0));
  return 1 - k / (count + 1);
}

/** Бали бонусу: max(1, round(bonus × questShare)). */
export function questPoints(bonus: number, after: number, count: number): number {
  return Math.max(1, Math.round(bonus * questShare(after, count)));
}

/** Символи коду для того, хто відкрив opened позицій: на позиціях order[0…opened−1] — символ, решта null. */
export function questSlots(code: string, order: readonly number[], opened: number): (string | null)[] {
  const chars = Array.from(code);
  const slots: (string | null)[] = chars.map(() => null);
  const n = Math.min(Math.max(opened, 0), chars.length, order.length);
  for (let i = 0; i < n; i++) {
    const at = order[i]!;
    if (at >= 0 && at < chars.length) slots[at] = chars[at]!;
  }
  return slots;
}

/** Типовий порядок: [0, 1, …, length − 1]. */
export function questDefaultOrder(length: number): number[] {
  return Array.from({ length }, (_, i) => i);
}
