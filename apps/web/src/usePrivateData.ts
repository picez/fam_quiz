import { useEffect, useRef, useState } from 'react';
import type { Account, ApiData } from './api';
import { errorText } from './i18n';
import { useAccount } from './useAccount';

export type PrivateData<T> =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T; account: Account };

type Loaded<T> = { key: string; result: ApiData<T> };

/**
 * Дані, які бачить лише людина, що увійшла. Спершу з'ясовує, хто на сторінці, потім
 * завантажує; закінчену сесію показує так само, як відсутню.
 */
export function usePrivateData<T>(load: () => Promise<ApiData<T>>, key = ''): PrivateData<T> {
  const account = useAccount();
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const loader = useRef(load);
  loader.current = load;
  const signedIn = account.status === 'signed-in';

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    void loader.current().then((result) => {
      if (current) setLoaded({ key, result });
    });
    return () => {
      current = false;
    };
  }, [signedIn, key]);

  if (account.status === 'anonymous') return { status: 'signed-out' };
  if (account.status === 'unknown') return { status: 'error', message: errorText(account.error) };
  if (account.status === 'loading' || loaded === null || loaded.key !== key) return { status: 'loading' };
  if (loaded.result.ok) return { status: 'ready', data: loaded.result.data, account: account.account };
  return loaded.result.error === 'unauthorized'
    ? { status: 'signed-out' }
    : { status: 'error', message: errorText(loaded.result.error) };
}
