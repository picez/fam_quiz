import { useEffect, useRef, useState } from 'react';
import type { MemoryCellView, PlayerMemory } from '@quiz/shared';
import type { Send, SendResult } from './types';

/** Без ack так довго — обрив: «перевертання» скасовується, рядок «немає зв'язку» (як SPOTDIFF_ACK_MS). */
export const MEMORY_ACK_MS = 5000;

/** Розмір тексту картки за довжиною: ≤ 8 символів — l, ≤ 18 — m, ≤ 28 — s, довші (до MEMORY_TEXT_MAX = 40) — xs. */
export function memoryTextSize(text: string): 'l' | 'm' | 's' | 'xs' {
  const length = [...text.trim()].length;
  return length <= 8 ? 'l' : length <= 18 ? 'm' : length <= 28 ? 's' : 'xs';
}

export type MemoryCellShown = MemoryCellView | 'pending' | null;

export interface MemoryModel {
  /** Вміст лише зі зрізу; 'pending' — тапнуто, вмісту ще немає (анімація «перевертання»). */
  cells: MemoryCellShown[];
  /** info.canFlip (або непара вже закрилась локально), немає 'pending', локальний показ непари скінчився. */
  canFlip: boolean;
  /** Останнє відкриття лишилося без ack. */
  offline: boolean;
  flip(cell: number): void;
}

function withTimeout(promise: Promise<SendResult>): Promise<SendResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<SendResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: 'offline' }), MEMORY_ACK_MS);
  });
  return Promise.race([promise.catch((): SendResult => ({ ok: false, error: 'offline' })), late]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

/**
 * «Пам'ять» (29f) на телефоні: тап по закритій картці йде як player:memory з номером запитання в раунді (view.questionIndex) і
 * одразу стає 'pending'. Вміст приносить лише зріз (ack завжди без вмісту): щойно клітинка в зрізі не null або дошка змінилась
 * (seq більший, ніж при тапі), 'pending' зникає. Відмова (memory_wait, memory_busy, memory_open, too_soon …) чи обрив знімають
 * 'pending' мовчки. Непара (state 'shown') закривається локально через closesInMs, навіть якщо зріз запізнюється.
 */
export function useMemory(info: PlayerMemory, questionIndex: number, send: Send): MemoryModel {
  /** Тапнуті клітинки → seq дошки в мить тапу. */
  const [pending, setPending] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [offline, setOffline] = useState(false);
  /** Зріз, чия непара вже закрилась локально. */
  const [expired, setExpired] = useState<PlayerMemory | null>(null);
  const alive = useRef(true);
  const sendNow = useRef(send);
  sendNow.current = send;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const closesInMs = info.closesInMs;
  useEffect(() => {
    if (closesInMs === null) return;
    if (closesInMs <= 0) {
      setExpired(info);
      return;
    }
    const timer = setTimeout(() => setExpired(info), closesInMs);
    return () => clearTimeout(timer);
  }, [info, closesInMs]);

  // Новий стан дошки — зв'язок є: «немає зв'язку» гасне, не чекаючи наступного тапу.
  useEffect(() => {
    setOffline(false);
  }, [info.seq]);

  const live = (cell: number, seq: number | undefined) => seq !== undefined && info.cells[cell] == null && info.seq <= seq;

  // Прибрати з пам'яті 'pending', які зріз уже розв'язав (рендер і так їх не показує).
  useEffect(() => {
    setPending((now) => {
      let changed = false;
      const next = new Map<number, number>();
      for (const [cell, seq] of now) {
        if (info.cells[cell] == null && info.seq <= seq) next.set(cell, seq);
        else changed = true;
      }
      return changed ? next : now;
    });
  }, [info]);

  const shownGone = expired === info;
  const hasShown = info.cells.some((cell) => cell !== null && cell.state === 'shown');
  const cells: MemoryCellShown[] = info.cells.map((cell, i) => {
    if (cell !== null) return shownGone && cell.state === 'shown' ? null : cell;
    return live(i, pending.get(i)) ? 'pending' : null;
  });
  const anyPending = cells.includes('pending');
  const serverCan = info.canFlip || (hasShown && shownGone && info.busy === null && !info.done && info.result === null);
  const canFlip = serverCan && !anyPending && !(hasShown && !shownGone);

  const flip = (cell: number) => {
    if (!canFlip || cell < 0 || cell >= cells.length || cells[cell] !== null) return;
    const seq = info.seq;
    setPending((now) => new Map(now).set(cell, seq));
    void withTimeout(sendNow.current('player:memory', { questionIndex, cell })).then((result) => {
      if (!alive.current) return;
      const lost = !result.ok && result.error === 'offline';
      setOffline((was) => (was === lost ? was : lost));
      if (result.ok) return;
      setPending((now) => {
        if (now.get(cell) !== seq) return now;
        const next = new Map(now);
        next.delete(cell);
        return next;
      });
    });
  };

  return { cells, canFlip, offline, flip };
}
