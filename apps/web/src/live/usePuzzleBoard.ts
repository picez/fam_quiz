import { useEffect, useReducer, useRef, useState } from 'react';
import { LIMITS, type PlayerPuzzle } from '@quiz/shared';
import { errorText } from '../i18n';
import type { Send, SendResult } from './types';

/** Пакет клітинок іде не частіше ніж раз на стільки: правки за цей час зливаються в один. */
export const PUZZLE_FLUSH_MS = 250;
/** Без ack так довго — пакет загубився (обрив): назад у чергу, «немає зв'язку». */
export const PUZZLE_ACK_MS = 5000;
/** Після обриву чи паузи черга пробує знову через стільки. */
export const PUZZLE_RETRY_MS = 1000;

/** Запитання вже не те, сітку здано чи час сплив: черга й накладка зникають мовчки — показ іде за сервером. */
const CLEARS = new Set(['puzzle_stale', 'puzzle_done', 'time_over']);
/** Пакет повертається в чергу: частота, обрив, пауза чи заставка. */
const REQUEUES = new Set(['too_soon', 'offline', 'paused', 'not_started']);

export interface PuzzleBoardModel {
  /** Показ: серверні клітинки + накладка ще не підтверджених власних правок. */
  cells: string[];
  /** Вписати клітинку ('' — стерти). Поза canEdit і після «Готово» — нічого. */
  set(i: number, v: string): void;
  /** Дошле чергу й тисне «Готово»; ack — як від сервера. */
  done(): Promise<SendResult>;
  status: '' | 'sending' | 'offline';
  /** Текст відмови, що відкинула пакет (не частота й не обрив); null — немає. */
  error: string | null;
}

/** Відповідь, а як її немає за PUZZLE_ACK_MS — «offline». */
function withTimeout(promise: Promise<SendResult>): Promise<SendResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<SendResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: 'offline' }), PUZZLE_ACK_MS);
  });
  return Promise.race([promise.catch((): SendResult => ({ ok: false, error: 'offline' })), late]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Сітка «Головоломок» (28d) на телефоні: оптимістичні правки, пакети й злиття з сервером.
 * Правка одразу видна (черга); за PUZZLE_FLUSH_MS черга йде одним пакетом (до LIMITS.puzzleBatch клітинок), у польоті — не
 * більше одного, решта чекає ack. Остання правка клітинки перемагає: і в черзі, і над поверненим з відмови пакетом.
 * Після ack значення пакета лишаються накладкою, доки не прийде зріз, новіший за той, що був на мить ack (seq більший):
 * тож запізнілий зріз не відкочує своїх значень, а пізніша правка товариша в тій самій клітинці показується.
 * too_soon, обрив і пауза — пакет назад у чергу; puzzle_stale, puzzle_done, time_over — черга й накладка зникають мовчки.
 */
export function usePuzzleBoard(info: PlayerPuzzle, questionIndex: number, send: Send): PuzzleBoardModel {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [error, setError] = useState<string | null>(null);
  const infoNow = useRef(info);
  infoNow.current = info;
  const sendNow = useRef(send);
  sendNow.current = send;
  const queue = useRef(new Map<number, string>());
  const flight = useRef<Map<number, string> | null>(null);
  const flightDone = useRef<Promise<void> | null>(null);
  /** Підтверджені значення: тримаються, поки seq зрізу не перевищить after (seq на мить ack). */
  const acked = useRef(new Map<number, { v: string; after: number }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const offline = useRef(false);
  /** «Готово» натиснуто: нових правок не приймаємо. */
  const finishing = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  // Новіший зріз уже несе підтверджене: накладка більше не потрібна.
  useEffect(() => {
    for (const [i, entry] of acked.current) if (info.seq > entry.after || info.cells[i] === entry.v) acked.current.delete(i);
  }, [info]);

  const valueAt = (i: number, now: PlayerPuzzle): string => {
    const queued = queue.current.get(i);
    if (queued !== undefined) return queued;
    const flying = flight.current?.get(i);
    if (flying !== undefined) return flying;
    const entry = acked.current.get(i);
    if (entry !== undefined && now.seq <= entry.after) return entry.v;
    return now.cells[i] ?? '';
  };

  const schedule = (delay = PUZZLE_FLUSH_MS) => {
    if (!alive.current || timer.current !== null || flight.current !== null || queue.current.size === 0) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush();
    }, delay);
  };

  const settle = (batch: Map<number, string>, result: SendResult) => {
    if (!alive.current) return;
    flight.current = null;
    flightDone.current = null;
    if (result.ok) {
      offline.current = false;
      const seq = infoNow.current.seq;
      for (const [i, v] of batch) if (!queue.current.has(i)) acked.current.set(i, { v, after: seq });
      schedule();
    } else if (CLEARS.has(result.error)) {
      queue.current.clear();
      acked.current.clear();
    } else if (REQUEUES.has(result.error)) {
      // Новіші правки тих самих клітинок уже в черзі — вони перемагають.
      for (const [i, v] of batch) if (!queue.current.has(i)) queue.current.set(i, v);
      if (result.error === 'offline') offline.current = true;
      schedule(result.error === 'too_soon' ? PUZZLE_FLUSH_MS : PUZZLE_RETRY_MS);
    } else {
      setError(errorText(result.error));
      schedule();
    }
    bump();
  };

  const flush = (): Promise<void> => {
    if (flight.current !== null && flightDone.current !== null) return flightDone.current;
    if (!alive.current || queue.current.size === 0 || !infoNow.current.canEdit) return Promise.resolve();
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const batch = new Map<number, string>();
    for (const [i, v] of queue.current) {
      if (batch.size >= LIMITS.puzzleBatch) break;
      batch.set(i, v);
    }
    for (const i of batch.keys()) queue.current.delete(i);
    flight.current = batch;
    bump();
    const cells = [...batch].map(([i, v]) => ({ i, v }));
    const done = withTimeout(sendNow.current('player:puzzle', { questionIndex, cells })).then((result) => settle(batch, result));
    flightDone.current = done;
    return done;
  };

  // Пауза минула (чи сітку знову можна правити): черга йде далі.
  useEffect(() => {
    if (info.canEdit) schedule();
  }, [info.canEdit]);

  const set = (i: number, v: string) => {
    const now = infoNow.current;
    if (!now.canEdit || now.done || finishing.current || i < 0 || i >= now.cells.length) return;
    if (valueAt(i, now) === v) return;
    queue.current.set(i, v);
    acked.current.delete(i);
    setError(null);
    bump();
    schedule();
  };

  const done = async (): Promise<SendResult> => {
    finishing.current = true;
    // Спершу — уся черга: «Готово» фіксує сітку такою, як її видно.
    for (let tries = 0; alive.current && (flight.current !== null || queue.current.size > 0) && tries < 20; tries += 1) {
      if (flight.current !== null && flightDone.current !== null) {
        await flightDone.current;
        continue;
      }
      await flush();
      if (offline.current) {
        finishing.current = false;
        return { ok: false, error: 'offline' };
      }
      if (queue.current.size > 0 && flight.current === null) await sleep(PUZZLE_FLUSH_MS);
    }
    const result = await withTimeout(sendNow.current('player:puzzle-done', { questionIndex }));
    if (!result.ok && result.error !== 'puzzle_done') finishing.current = false;
    return result;
  };

  const cells = info.cells.map((_, i) => valueAt(i, info));
  const busy = flight.current !== null || queue.current.size > 0;
  return { cells, set, done, status: offline.current ? 'offline' : busy ? 'sending' : '', error };
}
