import { useEffect, useState, type CSSProperties } from 'react';
import type { PaceWindow } from '@quiz/shared';
import { t } from './i18n';

/** Запас поверх кінця вікна: кнопка вмикається трохи пізніше, ніж дозволяє сервер (11b). */
export const PACE_MARGIN_MS = 100;
/** Крок перемальовування смужки, мс. */
export const PACE_TICK_MS = 100;

/** Частка вікна, що минула (0…1), або null — чекати не треба (немає вікна чи воно скінчилося з запасом). */
export function paceProgress(window: PaceWindow | null, serverNow: number): number | null {
  if (window === null) return null;
  const end = window.until + PACE_MARGIN_MS;
  if (serverNow >= end) return null;
  const span = end - window.from;
  if (span <= 0) return null;
  return Math.min(1, Math.max(0, (serverNow - window.from) / span));
}

/** Атрибути кнопки, що чекає вікна: заповнення (--pace), підказка «Ще мить…» і aria-busy; progress null — жодних. */
export function paceAttrs(progress: number | null): { style?: CSSProperties; title?: string; 'aria-busy'?: true } {
  if (progress === null) return {};
  return { style: { '--pace': progress } as CSSProperties, title: t('err_too_soon'), 'aria-busy': true };
}

/** paceProgress на поточну мить (Date.now() + offsetMs); перемальовує кожні PACE_TICK_MS, поки вікно триває. */
export function usePace(window: PaceWindow | null, offsetMs: number): number | null {
  const [, setTick] = useState(0);
  const from = window?.from;
  const until = window?.until;
  const progress = paceProgress(window, Date.now() + offsetMs);
  const running = progress !== null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), PACE_TICK_MS);
    return () => clearInterval(id);
  }, [running, from, until, offsetMs]);
  return progress;
}
