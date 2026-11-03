import type { OwnProfile } from '@quiz/shared';
import { useCallback, useRef, useState } from 'react';
import { getMyProfile } from '../api';
import { usePrivateData, type PrivateData } from '../usePrivateData';

/** Свій профіль; reload перечитує його, а поки вантажиться — лишає останні готові дані: сторінка не блимає й не губить прокрутку. */
export function useMyProfile(): { state: PrivateData<OwnProfile>; reload: () => void } {
  const [version, setVersion] = useState(0);
  const fresh = usePrivateData(getMyProfile, String(version));
  const last = useRef<PrivateData<OwnProfile> | null>(null);
  if (fresh.status === 'ready') last.current = fresh;
  const state = fresh.status === 'loading' && last.current !== null ? last.current : fresh;
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { state, reload };
}
