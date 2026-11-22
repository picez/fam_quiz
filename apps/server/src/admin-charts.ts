/** Київські дні для метрик адміна (53, 71): список днів, календарний зсув, тижневі повернення. */
import { kyivDay } from './xp-rules';

/** Скільки днів назад від першого дня графіка потрібні гравці: тиждень для D−13…D−7 від D. */
const RETURN_LOOKBACK = 13;

/** Останні count днів за Києвом до now включно, старіші першими. */
export function kyivDayList(now: Date, count: number): string[] {
  const today = kyivDay(now);
  return Array.from({ length: count }, (_, i) => shiftDay(today, i - (count - 1)));
}

/** Календарна арифметика на Date.UTC без годин: перехід часу не збиває. */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Яка частка акаунтів, що грали в дні D−13…D−7, грала й за D−6…D; null, коли тоді ніхто не грав. */
export function weeklyReturns(byDay: ReadonlyMap<string, ReadonlySet<string>>, day: string): number | null {
  const before = new Set<string>();
  const recent = new Set<string>();
  for (let back = 0; back <= RETURN_LOOKBACK; back += 1) {
    const ids = byDay.get(shiftDay(day, -back));
    if (ids === undefined) continue;
    for (const id of ids) (back <= 6 ? recent : before).add(id);
  }
  if (before.size === 0) return null;
  let both = 0;
  for (const id of before) if (recent.has(id)) both += 1;
  return Math.round((100 * both) / before.size);
}
