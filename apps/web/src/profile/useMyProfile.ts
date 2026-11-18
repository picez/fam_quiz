import type { OwnProfile } from '@quiz/shared';
import { useCallback, useRef, useState } from 'react';
import { getMyProfile } from '../api';
import { usePrivateData, type PrivateData } from '../usePrivateData';
import { useAccount } from '../useAccount';

/**
 * Останній свій профіль, спільний для підсторінок: нова підсторінка показує його одразу, а свіжий запит
 * оновлює числа за мить. Лише в пам'яті (там email, друзі) і лише для одного акаунта.
 */
let shared: { accountId: string; data: OwnProfile } | null = null;

/** Забуває останній профіль: під час виходу з акаунта та в тестах. */
export function forgetMyProfile(): void {
  shared = null;
}

/** Свій профіль; reload перечитує його, а поки вантажиться — лишає останні готові дані: сторінка не блимає й не губить прокрутку. */
export function useMyProfile(): { state: PrivateData<OwnProfile>; reload: () => void } {
  const [version, setVersion] = useState(0);
  const fresh = usePrivateData(getMyProfile, String(version));
  const account = useAccount();
  const last = useRef<PrivateData<OwnProfile> | null>(null);
  if (fresh.status === 'ready') {
    last.current = fresh;
    shared = { accountId: fresh.account.id, data: fresh.data };
  }
  let state = fresh;
  if (fresh.status === 'loading') {
    if (shared !== null && account.status === 'signed-in' && shared.accountId === account.account.id) {
      state = { status: 'ready', data: shared.data, account: account.account };
    } else if (last.current !== null) {
      state = last.current;
    }
  }
  const reload = useCallback(() => {
    // Після правки (нік, вигляд, налаштування) інші підсторінки не мають показувати стару версію.
    shared = null;
    setVersion((value) => value + 1);
  }, []);
  return { state, reload };
}
