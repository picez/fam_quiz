import { useEffect, useState } from 'react';
import { me, type Account } from './api';

export type AccountState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  /** Не вдалося з'ясувати, чи людина увійшла (немає зв'язку, збій сервера). */
  | { status: 'unknown'; error: string }
  | { status: 'signed-in'; account: Account };

/** Хто зараз увійшов. Запитує сервер один раз під час появи сторінки. */
export function useAccount(): AccountState {
  const [state, setState] = useState<AccountState>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    void me().then((result) => {
      if (!current) return;
      if (result.ok) setState({ status: 'signed-in', account: { id: result.id, name: result.name, email: result.email } });
      // Лише відповідь «немає сесії» означає, що людина не увійшла; будь-який інший збій нічого про це не каже.
      else if (result.error === 'unauthorized') setState({ status: 'anonymous' });
      else setState({ status: 'unknown', error: result.error });
    });
    return () => {
      current = false;
    };
  }, []);

  return state;
}
