import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiData } from '../api';
import { errorText } from '../i18n';

export type AdminData<T> =
  | { status: 'loading' }
  /** Сервер відповів «not_found»: для не-адміна адмінки не існує, веде на головну. */
  | { status: 'home' }
  | { status: 'error'; message: string }
  /** `stale`: лише з `keep` — останнє перечитування не вдалося, показано попередні дані.
   * `busy`: лише з `keep` — показано попередні дані, а перечитування ще в дорозі. */
  | { status: 'ready'; data: T; stale?: boolean; busy?: boolean };

type Controls = {
  /** Перечитує тим самим ключем (кнопка «Оновити»: завжди). */
  reload: () => void;
  /** Те саме, але пропускає, поки попередній запит ще в дорозі (автооновлення: повільна відповідь не губиться). */
  refresh: () => void;
};

/**
 * Читає адмін-API; `key` змінюється — читає знову; `reload` перечитує тим самим ключем.
 * `keep`: під час `reload` (той самий ключ) лишає попередні дані замість «Завантаження…» — для автооновлення без миготіння;
 * збій перечитування теж лишає попередні дані, з позначкою `stale`.
 */
export function useAdminData<T>(load: () => Promise<ApiData<T>>, key: string, options?: { keep?: boolean }): AdminData<T> & Controls {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ key: string; base: string; result: ApiData<T>; lastOk: { base: string; data: T } | null } | null>(null);
  const pending = useRef(false);
  const full = `${key}#${version}`;

  useEffect(() => {
    let current = true;
    pending.current = true;
    void load()
      .then((result) => {
        if (current) setState((prev) => ({ key: full, base: key, result, lastOk: result.ok ? { base: key, data: result.data } : (prev?.lastOk ?? null) }));
      })
      .finally(() => {
        if (current) pending.current = false;
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  const reload = useCallback(() => setVersion((n) => n + 1), []);
  const refresh = useCallback(() => {
    if (!pending.current) setVersion((n) => n + 1);
  }, []);
  const controls = { reload, refresh };
  const kept = options?.keep === true && state !== null && state.lastOk !== null && state.lastOk.base === key ? state.lastOk : null;
  if (state === null || state.key !== full) return kept !== null ? { status: 'ready', data: kept.data, busy: true, ...controls } : { status: 'loading', ...controls };
  if (state.result.ok) return { status: 'ready', data: state.result.data, ...controls };
  if (state.result.error === 'not_found') return { status: 'home', ...controls };
  if (kept !== null) return { status: 'ready', data: kept.data, stale: true, ...controls };
  return { status: 'error', message: errorText(state.result.error), ...controls };
}
