import { useEffect, useState } from 'react';
import { isLocale } from '@quiz/shared';
import { me, type Account } from './api';
import { syncAccountLocale } from './locales/choose';

export type AccountState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  /** Не вдалося з'ясувати, чи людина увійшла (немає зв'язку, збій сервера). */
  | { status: 'unknown'; error: string }
  | { status: 'signed-in'; account: Account };

/** Хто увійшов. Запитує сервер під час появи й щоразу, коли змінюється refresh; до відповіді лишає попередній стан. */
export function useAccount(refresh?: unknown): AccountState {
  const [state, setState] = useState<AccountState>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    void me().then((result) => {
      if (!current) return;
      if (result.ok) {
        const locale = isLocale(result.locale) ? result.locale : null;
        setState({ status: 'signed-in', account: { id: result.id, name: result.name, email: result.email, admin: result.admin === true, locale } });
        // Мова з профілю перемагає мову пристрою; порожній профіль дістає поточну.
        void syncAccountLocale(locale);
      }
      // Лише відповідь «немає сесії» означає, що людина не увійшла; будь-який інший збій нічого про це не каже.
      else if (result.error === 'unauthorized') setState({ status: 'anonymous' });
      else setState({ status: 'unknown', error: result.error });
    });
    return () => {
      current = false;
    };
  }, [refresh]);

  return state;
}
