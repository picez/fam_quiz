/**
 * Секунди до кінця запитання. offsetMs — різниця «час сервера мінус час пристрою»,
 * тож неточний годинник телефона не зсуває відлік.
 */
export function secondsLeft(
  view: { endsAt: number | null; remainingMs: number | null },
  offsetMs: number,
  nowMs: number,
): number | null {
  if (view.remainingMs !== null) return Math.ceil(view.remainingMs / 1000);
  if (view.endsAt === null) return null;
  return Math.max(0, Math.ceil((view.endsAt - (nowMs + offsetMs)) / 1000));
}

/** Скільки мс заставки лишилося за годинником сервера; 0 — минула. */
export function splashLeft(splash: { until: number }, offsetMs: number, nowMs: number): number {
  return Math.max(0, splash.until - (nowMs + offsetMs));
}

/**
 * Зріз без заставки, що скінчилася до serverNow — часу сервера в мить надсилання.
 * Не залежить від годинника пристрою: після перепідключення минула заставка не з'явиться знову й не замкне поле.
 */
export function freshSplash<V extends { splash: { until: number } | null }>(view: V, serverNow: number): V {
  return view.splash !== null && view.splash.until <= serverNow ? { ...view, splash: null } : view;
}
