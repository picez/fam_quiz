import { useEffect, useState } from 'react';
import { isLocale } from '@quiz/shared';
import { me, type Account } from './api';
import { syncAccountEasy } from './easy-mode';
import { syncAccountLocale } from './locales/choose';

export type AccountState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  /** Не вдалося з'ясувати, чи людина увійшла (немає зв'язку, збій сервера). */
  | { status: 'unknown'; error: string }
  | { status: 'signed-in'; account: Account };

/**
 * Остання відповідь «увійшла як …»: нова сторінка стартує з неї й одразу вантажить свої дані, а /api/me перевіряє
 * сесію паралельно (stale-while-revalidate). Без цього кожен перехід чекав /api/me, а вже потім — дані сторінки.
 * Кешуємо лише «увійшла»: застаріле «не увійшла» відразу відправило б людину на /login.
 */
let known: AccountState | null = null;
/** Один запит /api/me на всіх, хто питає водночас (меню, сторінка, usePrivateData). */
let pending: Promise<AccountState> | null = null;

function check(): Promise<AccountState> {
  pending ??= me()
    .then((result): AccountState => {
      if (result.ok) {
        const locale = isLocale(result.locale) ? result.locale : null;
        // Мова з профілю перемагає мову пристрою; порожній профіль дістає поточну.
        void syncAccountLocale(locale, result.id);
        // «Легкий режим» (31): профіль вмикає його лише на пристрої, що ще не вибирав.
        const easyMode = result.easyMode === true;
        syncAccountEasy(easyMode, result.id);
        return { status: 'signed-in', account: { id: result.id, name: result.name, email: result.email, admin: result.admin === true, locale, easyMode } };
      }
      // Лише відповідь «немає сесії» означає, що людина не увійшла; будь-який інший збій нічого про це не каже.
      if (result.error === 'unauthorized') {
        syncAccountEasy(false, null);
        return { status: 'anonymous' };
      }
      return { status: 'unknown', error: result.error };
    })
    .then((state) => {
      if (state.status === 'signed-in') known = state;
      else if (state.status === 'anonymous') known = null;
      return state;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Вхід, вихід чи зміна сесії: забуваємо, хто був на сторінці (і тести — між собою). */
export function forgetAccount(): void {
  known = null;
  pending = null;
  // «Легкий режим» із профілю (31) гасне одразу після виходу; вибір самого пристрою лишається.
  syncAccountEasy(false, null);
}

/** Хто увійшов. Запитує сервер під час появи й щоразу, коли змінюється refresh; до відповіді лишає попередній (чи відомий) стан. */
export function useAccount(refresh?: unknown): AccountState {
  const [state, setState] = useState<AccountState>(() => known ?? { status: 'loading' });

  useEffect(() => {
    let current = true;
    void check().then((next) => {
      if (current) setState((prev) => (sameState(prev, next) ? prev : next));
    });
    return () => {
      current = false;
    };
  }, [refresh]);

  return state;
}

/** Та сама людина з тими самими полями — той самий стан: перевірка не перемальовує сторінку даремно. */
function sameState(a: AccountState, b: AccountState): boolean {
  if (a.status !== b.status) return false;
  if (a.status === 'signed-in' && b.status === 'signed-in') {
    const x = a.account;
    const y = b.account;
    return x.id === y.id && x.name === y.name && x.email === y.email && x.admin === y.admin && x.locale === y.locale && x.easyMode === y.easyMode;
  }
  if (a.status === 'unknown' && b.status === 'unknown') return a.error === b.error;
  return true;
}
