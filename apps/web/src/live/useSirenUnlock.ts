import { useEffect } from 'react';
import { sirenReady, unlockSiren } from '../siren';

/** Жести, що дають браузеру право на звук (не pointerdown: iOS його жестом для звуку не рахує). */
const GESTURES = ['touchend', 'click', 'keydown'] as const;

/**
 * Антигугл (12e): сторінка гравця розблоковує сирену тривоги першим жестом. Слухачі (capture на document) лишаються весь час:
 * iOS призупиняє чи перериває контекст після фону, тож поки він не running, наступний жест будить його знову; коли грає — нічого.
 */
export function useSirenUnlock(): void {
  useEffect(() => {
    const unlock = () => {
      if (!sirenReady()) unlockSiren();
    };
    for (const name of GESTURES) document.addEventListener(name, unlock, true);
    return () => {
      for (const name of GESTURES) document.removeEventListener(name, unlock, true);
    };
  }, []);
}
