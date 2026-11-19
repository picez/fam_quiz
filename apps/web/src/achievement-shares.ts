import { useEffect, useState } from 'react';
import { achievementScarcity, type AchievementId, type AchievementScarcity, type AchievementShares } from '@quiz/shared';
import { getAchievementShares } from './api';

/** Частки гравців (49): кеш модуля на годину (сервер тримає свій на ту саму годину); поки не прийшло чи при збої — null, блок просто не показується. */
const TTL_MS = 3_600_000;

let cached: { at: number; data: AchievementShares } | null = null;
let inFlight: Promise<AchievementShares | null> | null = null;

function fresh(): AchievementShares | null {
  return cached !== null && Date.now() - cached.at < TTL_MS ? cached.data : null;
}

/** Одночасні читачі діляться одним запитом; збій не кешується. */
function load(): Promise<AchievementShares | null> {
  inFlight ??= Promise.resolve()
    .then(() => getAchievementShares())
    .then((result) => {
      if (!result.ok) return null;
      cached = { at: Date.now(), data: result.data };
      return result.data;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function useAchievementShares(): AchievementShares | null {
  const [shares, setShares] = useState<AchievementShares | null>(fresh);
  useEffect(() => {
    if (fresh() !== null) {
      setShares(fresh());
      return;
    }
    let current = true;
    void load().then((data) => {
      if (current && data !== null) setShares(data);
    });
    return () => {
      current = false;
    };
  }, []);
  return shares;
}

export function forgetAchievementShares(): void {
  cached = null;
  inFlight = null;
}

/** Частка й позначка одного досягнення: 0 власників — «ще ні в кого» (percent 0). */
export function shareOf(shares: AchievementShares, id: AchievementId): { percent: number; tier: AchievementScarcity | null } {
  return achievementScarcity(shares.holders[id] ?? 0, shares.players);
}
