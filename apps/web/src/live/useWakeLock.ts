import { useEffect } from 'react';

interface Sentinel {
  released: boolean;
  release(): Promise<void>;
}
interface WakeLockApi {
  request(type: 'screen'): Promise<Sentinel>;
}

/**
 * Антигугл (12e): екран телефона гравця не гасне, поки active (від входу до кінця гри, лобі теж) — інакше телефон, що
 * лежить на столі, заблокувався б і розблокування на новому запитанні виглядало б виходом із гри. Браузер знімає блокування,
 * коли сторінку сховано, тож на поверненні (visible) воно береться знову. Відмова чи старий браузер без Wake Lock — тиша.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (api === undefined) return;
    let alive = true;
    let sentinel: Sentinel | null = null;
    const drop = (lock: Sentinel) => void lock.release().catch(() => {});
    const acquire = () => {
      if (sentinel !== null && !sentinel.released) return;
      let asked: Promise<Sentinel>;
      try {
        asked = api.request('screen');
      } catch {
        return;
      }
      asked.then(
        (lock) => {
          if (alive) sentinel = lock;
          else drop(lock);
        },
        () => {},
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel !== null) drop(sentinel);
    };
  }, [active]);
}
