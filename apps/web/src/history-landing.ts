/** 79: вкладки «Історії» — Проведені · Зіграні · Виклики. */
export type HistoryTab = 'hosted' | 'played' | 'challenges';

export const HISTORY_TAB_PATH: Record<HistoryTab, string> = { hosted: '/history', played: '/me', challenges: '/history/challenges' };

/**
 * Куди відкривати «Історію» з меню (голий /history): вкладка, яку людина вже обрала на цьому пристрої;
 * інакше та, де більше ігор (гравець родини, що ніколи не проводив, одразу бачить «Зіграні»). Порівну чи збій списку (null) — «Проведені».
 */
export function landingTab(saved: HistoryTab | null, hosted: number | null, played: number | null): HistoryTab {
  if (saved !== null) return saved;
  if (hosted === null || played === null) return 'hosted';
  return played > hosted ? 'played' : 'hosted';
}
