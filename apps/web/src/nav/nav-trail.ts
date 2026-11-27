import { sessionMap } from './session-map';

/** Місце в історії вкладки: ключ запису react-router і адреса. */
export type Spot = { key: string; pathname: string; search: string };
/** Звідки людина прийшла на запис і скільки кроків історії назад до тієї сторінки. */
export type BackStep = { from: string; steps: number };

const trail = sessionMap<BackStep>('quiz.nav.trail', 200);
/** BackLink перемальовується, коли RouteEffects дописав слід (ефект іде вже після першого рендеру сторінки). */
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};

export function subscribeTrail(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Слід переходів (76): PUSH на інший шлях — «прийшли з попередньої сторінки, 1 крок»; PUSH на той самий шлях
 * (інший ?query) — та сама сторінка походження, на крок далі; REPLACE — запис заміненого; POP нічого не пише.
 * Перше відкриття вкладки (prev null) забуває застарілий запис цього ключа (свіже відкриття завжди має ключ «default»).
 */
export function recordStep(prev: Spot | null, next: Spot, action: 'PUSH' | 'REPLACE' | 'POP'): void {
  if (prev === null) {
    if (next.key === 'default') trail.remove(next.key);
    changed();
    return;
  }
  if (action === 'POP') return;
  const before = trail.get(prev.key);
  if (action === 'REPLACE') {
    if (before === undefined) trail.remove(next.key);
    else trail.set(next.key, before);
    changed();
    return;
  }
  if (prev.pathname !== next.pathname) trail.set(next.key, { from: prev.pathname + prev.search, steps: 1 });
  else if (before !== undefined) trail.set(next.key, { from: before.from, steps: before.steps + 1 });
  else trail.remove(next.key);
  changed();
}

export function backTarget(key: string): BackStep | null {
  return trail.get(key) ?? null;
}

/** Для тестів: чистий слід. */
export function forgetTrail(): void {
  trail.clear();
}
