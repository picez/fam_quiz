import type { OwnProfile } from '@quiz/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyProfile } from '../api';
import { usePrivateData, type PrivateData } from '../usePrivateData';
import { useAccount } from '../useAccount';
import { cachedMyProfile, forgetMyProfile, rememberMyProfile } from './my-profile-cache';

export { forgetMyProfile };

/**
 * Свій профіль; reload перечитує його, а поки вантажиться — лишає останні готові дані: сторінка не блимає й не губить прокрутку.
 * Нова підсторінка показує останній профіль одразу (кеш у my-profile-cache), а свіжий запит оновлює числа за мить.
 * Сторінки з формою правки (нік, вигляд) беруть cached: false: форма не має стартувати зі старих значень і потім їх перезаписати.
 */
export function useMyProfile(options: { cached?: boolean } = {}): { state: PrivateData<OwnProfile>; reload: () => void } {
  const useCache = options.cached !== false;
  const [version, setVersion] = useState(0);
  const fresh = usePrivateData(getMyProfile, String(version));
  const account = useAccount();
  const last = useRef<PrivateData<OwnProfile> | null>(null);
  const freshData = fresh.status === 'ready' ? fresh.data : null;
  if (fresh.status === 'ready') last.current = fresh;
  // Кеш пишемо в ефекті й лише коли дані справді нові: старий екземпляр не вертає в кеш дані до правки.
  useEffect(() => {
    if (freshData !== null) rememberMyProfile(freshData);
  }, [freshData]);
  let state = fresh;
  if (fresh.status === 'loading') {
    const cached = useCache && account.status === 'signed-in' ? cachedMyProfile(account.account.id) : null;
    if (cached !== null && account.status === 'signed-in') {
      state = { status: 'ready', data: cached, account: account.account };
    } else if (last.current !== null) {
      state = last.current;
    }
  }
  const reload = useCallback(() => {
    // Після правки (нік, вигляд, налаштування) інші підсторінки не мають показувати стару версію.
    forgetMyProfile();
    setVersion((value) => value + 1);
  }, []);
  return { state, reload };
}
