import { useCallback, useEffect, useState } from 'react';
import type { ApiData } from '../api';
import { errorText } from '../i18n';

export type AdminData<T> =
  | { status: 'loading' }
  /** Сервер відповів «not_found»: для не-адміна адмінки не існує, веде на головну. */
  | { status: 'home' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

/** Читає адмін-API; `key` змінюється — читає знову; `reload` перечитує тим самим ключем. */
export function useAdminData<T>(load: () => Promise<ApiData<T>>, key: string): AdminData<T> & { reload: () => void } {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ key: string; result: ApiData<T> } | null>(null);
  const full = `${key}#${version}`;

  useEffect(() => {
    let current = true;
    void load().then((result) => {
      if (current) setState({ key: full, result });
    });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  const reload = useCallback(() => setVersion((n) => n + 1), []);
  if (state === null || state.key !== full) return { status: 'loading', reload };
  if (state.result.ok) return { status: 'ready', data: state.result.data, reload };
  if (state.result.error === 'not_found') return { status: 'home', reload };
  return { status: 'error', message: errorText(state.result.error), reload };
}
