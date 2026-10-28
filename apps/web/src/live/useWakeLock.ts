import { useEffect, useState } from 'react';

interface Sentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener?(type: 'release', listener: () => void): void;
  removeEventListener?(type: 'release', listener: () => void): void;
}
interface WakeLockApi {
  request(type: 'screen'): Promise<Sentinel>;
}

/** Жести, після яких браузер охочіше дає блокування екрана (як у useSirenUnlock). */
const GESTURES = ['touchend', 'click', 'keydown'] as const;

/**
 * Антигугл (12e): екран телефона гравця не гасне, поки active (від входу до кінця гри, лобі теж) — інакше телефон, що
 * лежить на столі, заблокувався б і розблокування на новому запитанні виглядало б виходом із гри. Браузер знімає блокування,
 * коли сторінку сховано (і може зняти саме: економія заряду), тож воно береться знову на поверненні (visible), на подію
 * release сентинела, поки сторінку видно, і на жест (capture на document; деякі браузери дають його лише в жесті).
 * Повертає true, коли Wake Lock немає чи браузер відмовив і блокування зараз не тримається; інакше false.
 */
export function useWakeLock(active: boolean): boolean {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!active) {
      setBlocked(false);
      return;
    }
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (api === undefined) {
      setBlocked(true);
      return () => setBlocked(false);
    }
    let alive = true;
    let sentinel: Sentinel | null = null;
    let asking = false;
    const drop = (lock: Sentinel) => void lock.release().catch(() => {});
    const onRelease = () => {
      if (alive && document.visibilityState === 'visible') acquire();
    };
    function acquire(): void {
      if (asking || (sentinel !== null && !sentinel.released)) return;
      let asked: Promise<Sentinel>;
      try {
        asked = api.request('screen');
      } catch {
        setBlocked(true);
        return;
      }
      asking = true;
      asked.then(
        (lock) => {
          asking = false;
          if (!alive) {
            drop(lock);
            return;
          }
          sentinel?.removeEventListener?.('release', onRelease);
          sentinel = lock;
          lock.addEventListener?.('release', onRelease);
          setBlocked(false);
        },
        () => {
          asking = false;
          if (alive) setBlocked(true);
        },
      );
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    for (const name of GESTURES) document.addEventListener(name, acquire, true);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      for (const name of GESTURES) document.removeEventListener(name, acquire, true);
      if (sentinel !== null) {
        sentinel.removeEventListener?.('release', onRelease);
        drop(sentinel);
      }
      setBlocked(false);
    };
  }, [active]);
  return blocked;
}
