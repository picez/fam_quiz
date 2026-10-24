/** Позиція значення на шкалі, % (0…100); поза межами притискається. */
export function scalePct(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

/** Мінімальний відступ між підписами в одному рядку, % довжини шкали. */
export const MARK_GAP_PCT = 8;

/** Рядки підписів: позначки за значенням; кожна йде в перший рядок, де від попередньої не менше gapPct. */
export function layoutMarks<T extends { value: number }>(marks: T[], min: number, max: number, gapPct = MARK_GAP_PCT): (T & { pct: number; row: number })[] {
  const lastInRow: number[] = [];
  return [...marks]
    .sort((a, b) => a.value - b.value)
    .map((mark) => {
      const pct = scalePct(mark.value, min, max);
      let row = lastInRow.findIndex((last) => pct - last >= gapPct);
      if (row === -1) row = lastInRow.length;
      lastInRow[row] = pct;
      return { ...mark, pct, row };
    });
}
