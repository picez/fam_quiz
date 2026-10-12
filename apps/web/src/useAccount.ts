import { useEffect, useState } from 'react';
import { me, type Account } from './api';

export type AccountState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'signed-in'; account: Account };

/** Хто зараз увійшов. Запитує сервер один раз під час появи сторінки. */
export function useAccount(): AccountState {
  const [state, setState] = useState<AccountState>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    void me().then((result) => {
      if (!current) return;
      setState(
        result.ok
          ? { status: 'signed-in', account: { id: result.id, name: result.name, email: result.email } }
          : { status: 'anonymous' },
      );
    });
    return () => {
      current = false;
    };
  }, []);

  return state;
}
