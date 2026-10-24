/** Позиція значення на шкалі, % (0…100); поза межами притискається. */
export function scalePct(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

/** Мінімальний відступ між підписами в одному рядку, % довжини шкали. */
export const MARK_GAP_PCT = 8;

/**
 * Рядки підписів: позначка йде в перший рядок, де від усіх уже поставлених не менше gapPct.
 * Позначка, яку впізнає first, розставляється першою, тож завжди має ім'я; решта — за значенням.
 * З maxRows позначка, якій не знайшлося рядка серед перших maxRows, лишається без підпису: row === null.
 * Результат — за значенням.
 */
export function layoutMarks<T extends { value: number }>(
  marks: T[],
  min: number,
  max: number,
  gapPct = MARK_GAP_PCT,
  maxRows = Infinity,
  first?: (mark: T) => boolean,
): (T & { pct: number; row: number | null })[] {
  const sorted = [...marks].sort((a, b) => a.value - b.value);
  const order = first === undefined ? sorted : [...sorted.filter(first), ...sorted.filter((mark) => !first(mark))];
  const rows: number[][] = [];
  const placed = new Map<T, { pct: number; row: number | null }>();
  for (const mark of order) {
    const pct = scalePct(mark.value, min, max);
    let row: number | null = rows.findIndex((taken) => taken.every((other) => Math.abs(pct - other) >= gapPct));
    if (row === -1) row = rows.length < maxRows ? rows.length : null;
    if (row !== null) (rows[row] ??= []).push(pct);
    placed.set(mark, { pct, row });
  }
  return sorted.map((mark) => ({ ...mark, ...(placed.get(mark) as { pct: number; row: number | null }) }));
}
