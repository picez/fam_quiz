import { useEffect, useRef, useState } from 'react';
import { SPOT_MAX_WIDTH, SPOT_MIN_WIDTH, SPOTDIFF_FREEZE_MS, type PlayerSpotdiff } from '@quiz/shared';
import type { Send, SendResult } from './types';

/** Скільки живе червоний хрестик промаху. */
export const SPOTDIFF_CROSS_MS = 600;
/** Без ack так довго — обрив: «немає зв'язку» (тап не повторюється: гравець торкнеться ще раз). */
export const SPOTDIFF_ACK_MS = 5000;

export interface SpotMiss {
  id: number;
  x: number;
  y: number;
}

export interface SpotdiffModel {
  /** Власні (командні) знахідки зі зрізу: кільце з'являється, щойно зріз приносить коло. */
  found: PlayerSpotdiff['found'];
  /** Заморозка SPOTDIFF_FREEZE_MS від ack spotdiff_freeze / spotdiff_frozen: тапи не йдуть. */
  frozen: boolean;
  /** Хрестики промахів, кожен живе SPOTDIFF_CROSS_MS. */
  misses: SpotMiss[];
  /** Останній тап лишився без ack. */
  offline: boolean;
  /** Тап у частках картинки при її ширині на екрані (CSS px); ширина затискається в SPOT_MIN_WIDTH…SPOT_MAX_WIDTH. */
  tap(x: number, y: number, width: number): void;
}

function withTimeout(promise: Promise<SendResult>): Promise<SendResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<SendResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: 'offline' }), SPOTDIFF_ACK_MS);
  });
  return Promise.race([promise.catch((): SendResult => ({ ok: false, error: 'offline' })), late]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

/**
 * «Знайди відмінності» (29d) на телефоні: тап іде як player:spotdiff з номером запитання в раунді (view.questionIndex) і шириною
 * картинки. Місць телефон не знає — влучання перевіряє сервер. Відповіді: ok — нічого (коло принесе зріз); spotdiff_miss —
 * хрестик; spotdiff_freeze — хрестик і заморозка; spotdiff_frozen — заморозка; spotdiff_found, too_soon та інше — тихо.
 */
export function useSpotdiff(info: PlayerSpotdiff, questionIndex: number, send: Send): SpotdiffModel {
  const [frozen, setFrozen] = useState(false);
  const [misses, setMisses] = useState<SpotMiss[]>([]);
  const [offline, setOffline] = useState(false);
  const frozenNow = useRef(false);
  const freezeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crossTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);
  const alive = useRef(true);
  const infoNow = useRef(info);
  infoNow.current = info;
  const sendNow = useRef(send);
  sendNow.current = send;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (freezeTimer.current !== null) clearTimeout(freezeTimer.current);
      for (const timer of crossTimers.current) clearTimeout(timer);
      crossTimers.current.clear();
    };
  }, []);

  const freeze = () => {
    frozenNow.current = true;
    setFrozen(true);
    if (freezeTimer.current !== null) clearTimeout(freezeTimer.current);
    freezeTimer.current = setTimeout(() => {
      freezeTimer.current = null;
      frozenNow.current = false;
      if (alive.current) setFrozen(false);
    }, SPOTDIFF_FREEZE_MS);
  };

  const cross = (x: number, y: number) => {
    const id = nextId.current;
    nextId.current += 1;
    setMisses((now) => [...now, { id, x, y }]);
    const timer = setTimeout(() => {
      crossTimers.current.delete(timer);
      if (alive.current) setMisses((now) => now.filter((miss) => miss.id !== id));
    }, SPOTDIFF_CROSS_MS);
    crossTimers.current.add(timer);
  };

  const tap = (x: number, y: number, width: number) => {
    const now = infoNow.current;
    if (frozenNow.current || !now.canTap || now.done) return;
    const w = Math.min(SPOT_MAX_WIDTH, Math.max(SPOT_MIN_WIDTH, Math.round(width)));
    void withTimeout(sendNow.current('player:spotdiff', { questionIndex, x, y, width: w })).then((result) => {
      if (!alive.current) return;
      const lost = !result.ok && result.error === 'offline';
      setOffline((was) => (was === lost ? was : lost));
      if (result.ok) return;
      if (result.error === 'spotdiff_miss' || result.error === 'spotdiff_freeze') cross(x, y);
      if (result.error === 'spotdiff_freeze' || result.error === 'spotdiff_frozen') freeze();
    });
  };

  return { found: info.found, frozen, misses, offline, tap };
}
