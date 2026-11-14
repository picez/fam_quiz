import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { JIGSAW_HOLD_REFRESH_MS, jigsawFits, seededRng, shuffle, type PlayerJigsaw, type PublicJigsaw } from '@quiz/shared';
import { errorText } from '../i18n';
import type { Send, SendResult } from './types';

/** too_soon (частота сервера): той самий шматочок іде знову за стільки. */
export const JIGSAW_RETRY_MS = 200;
/** Без ack так довго — обрив: «немає зв'язку», спроба знову за JIGSAW_OFFLINE_RETRY_MS. */
export const JIGSAW_ACK_MS = 5000;
export const JIGSAW_OFFLINE_RETRY_MS = 1000;
/** Скільки видно коротку примітку («тримає товариш»). */
export const JIGSAW_NOTICE_MS = 2500;

/** Відмови, після яких шматочок мовчки знову вільний: місце й так видно, а запитання чи час уже скінчилися. */
const SILENT = new Set(['jigsaw_miss', 'jigsaw_stale', 'time_over', 'paused', 'not_started', 'wrong_phase']);

/** FNV-1a 32 біти: рядок → ціле без знаку. */
function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Зерно розкладки запитання: у зрізі немає seed запитання, тож — з його виступів і фото (ті самі для всіх телефонів). */
export function jigsawSeed(jigsaw: PublicJigsaw): number {
  return hashText(`${jigsaw.rows}x${jigsaw.cols}|${jigsaw.tabs}|${jigsaw.photo}`);
}

/**
 * Порядок шматочків у «купці» й початковий поворот кожного (0…3 чверті за годинниковою) для цього гравця:
 * seededRng(seed ^ hash(actorId)) — той самий після перезавантаження, інший у іншого гравця.
 */
export function jigsawPile(rows: number, cols: number, seed: number, actorId: string): { piece: number; rot: number }[] {
  const rng = seededRng((seed ^ hashText(actorId)) >>> 0);
  const order = shuffle(Array.from({ length: rows * cols }, (_, i) => i), rng);
  return order.map((piece) => ({ piece, rot: Math.floor(rng() * 4) }));
}

export interface JigsawLoose {
  piece: number;
  rot: number;
  /** Лівий верхній кут ядра в клітинках рамки; null — у купці. */
  at: { x: number; y: number } | null;
}

export interface JigsawModel {
  /** Поставлені: зріз сервера + оптимістичні (надіслані й прийняті). */
  placed: ReadonlySet<number>;
  /** Ще не поставлені, у порядку купки. */
  loose: JigsawLoose[];
  /**
   * Уся купка в її порядку, з поставленими й тими, що лежать на рамці: місце шматочка в купці не міняється, коли інші йдуть
   * (товариш поставив, свій кидок), тож шматочок під пальцем не з'їжджає.
   */
  pile: readonly number[];
  /** Шматочок у пальці (узятий grab); null — рука порожня. Товариш поставив його чи тримає — стає null. */
  holding: number | null;
  /** Коротка примітка (тримає товариш, інша відмова); null — немає. */
  notice: string | null;
  /** offline — ack не прийшов: шматочок піде знову. */
  status: '' | 'offline';
  /** Зерно розкладки (jigsawSeed). */
  seed: number;
  rotate(piece: number): void;
  grab(piece: number): void;
  drop(piece: number, at: { x: number; y: number } | null): void;
}

/** Відповідь, а як її немає за JIGSAW_ACK_MS — «offline». */
function withTimeout(promise: Promise<SendResult>): Promise<SendResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<SendResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: 'offline' }), JIGSAW_ACK_MS);
  });
  return Promise.race([promise.catch((): SendResult => ({ ok: false, error: 'offline' })), late]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

/**
 * «Пазл» (29c) на телефоні: купка, повороти, прилипання й «тримаю».
 * Купка й початкові повороти — jigsawPile(seed, actorId). Відпущений біля свого місця прямий шматочок (jigsawFits — та сама
 * перевірка, що й на сервері) одразу стає поставленим і йде як player:jigsaw з номером запитання в раунді (view.questionIndex).
 * Відмови: jigsaw_miss / jigsaw_stale / time_over — знову вільний там, де лежить; jigsaw_placed — тихо поставлений (товариш);
 * jigsaw_held — назад у купку з приміткою; too_soon — знову за JIGSAW_RETRY_MS; обрив — знову за JIGSAW_OFFLINE_RETRY_MS.
 * У команді взятий шматочок шле player:jigsaw-hold одразу й кожні JIGSAW_HOLD_REFRESH_MS, доки його не відпустили.
 */
export function useJigsaw(info: PlayerJigsaw, jigsaw: PublicJigsaw, questionIndex: number, actorId: string, send: Send, team = false): JigsawModel {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const seed = useMemo(() => jigsawSeed(jigsaw), [jigsaw.rows, jigsaw.cols, jigsaw.tabs, jigsaw.photo]);
  const pile = useMemo(() => jigsawPile(jigsaw.rows, jigsaw.cols, seed, actorId), [jigsaw.rows, jigsaw.cols, seed, actorId]);
  const order = useMemo(() => pile.map((item) => item.piece), [pile]);
  const grid = { rows: jigsaw.rows, cols: jigsaw.cols };
  const local = useRef<Map<number, { rot: number; at: { x: number; y: number } | null }> | null>(null);
  if (local.current === null) local.current = new Map(pile.map((item) => [item.piece, { rot: item.rot, at: null }]));
  const pieces = local.current;
  /** Надіслані, ack ще немає. */
  const pending = useRef(new Set<number>());
  /** Прийняті сервером (чи поставлені товаришем) — поставлені, навіть поки зріз ще старий. */
  const accepted = useRef(new Set<number>());
  const [holding, setHolding] = useState<number | null>(null);
  const holdingNow = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [offline, setOffline] = useState(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const alive = useRef(true);
  const infoNow = useRef(info);
  infoNow.current = info;
  const sendNow = useRef(send);
  sendNow.current = send;

  const isPlaced = (piece: number) => infoNow.current.placed.includes(piece) || pending.current.has(piece) || accepted.current.has(piece);
  const heldByOther = (piece: number) => infoNow.current.held.some((held) => held.piece === piece);

  const stopHold = () => {
    if (holdTimer.current !== null) clearInterval(holdTimer.current);
    holdTimer.current = null;
    holdingNow.current = null;
    setHolding(null);
  };

  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      if (alive.current) fn();
    }, ms);
    timers.current.add(timer);
  };

  const say = (text: string) => {
    setNotice(text);
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => {
      noticeTimer.current = null;
      if (alive.current) setNotice(null);
    }, JIGSAW_NOTICE_MS);
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (holdTimer.current !== null) clearInterval(holdTimer.current);
      if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
    };
  }, []);

  // Товариш поставив шматочок, що в моїй руці, чи час / пауза закрили пазл: рука порожніє.
  useEffect(() => {
    const piece = holdingNow.current;
    if (piece !== null && (info.placed.includes(piece) || !info.canPlace)) stopHold();
  }, [info]);

  const place = (piece: number, x: number, y: number, rot: number) => {
    pending.current.add(piece);
    void withTimeout(sendNow.current('player:jigsaw', { questionIndex, piece, x, y, rot })).then((result) => {
      if (!alive.current) return;
      setOffline(!result.ok && result.error === 'offline');
      if (result.ok || result.error === 'jigsaw_placed' || result.error === 'jigsaw_done') {
        pending.current.delete(piece);
        accepted.current.add(piece);
      } else if (result.error === 'too_soon' || result.error === 'offline') {
        // Лишається поставленим на екрані, поки повтор не скаже інакше.
        later(() => {
          pending.current.delete(piece);
          if (isPlaced(piece)) {
            bump();
            return;
          }
          if (infoNow.current.canPlace) place(piece, x, y, rot);
          bump();
        }, result.error === 'too_soon' ? JIGSAW_RETRY_MS : JIGSAW_OFFLINE_RETRY_MS);
      } else {
        pending.current.delete(piece);
        if (result.error === 'jigsaw_held') {
          const entry = pieces.get(piece);
          if (entry !== undefined) entry.at = null;
          say(errorText('jigsaw_held'));
        } else if (!SILENT.has(result.error)) say(errorText(result.error));
      }
      bump();
    });
  };

  const sendHold = (piece: number) => {
    void withTimeout(sendNow.current('player:jigsaw-hold', { questionIndex, piece })).then((result) => {
      if (!alive.current || result.ok || holdingNow.current !== piece) return;
      if (result.error === 'jigsaw_held') {
        stopHold();
        const entry = pieces.get(piece);
        if (entry !== undefined) entry.at = null;
        say(errorText('jigsaw_held'));
      } else if (result.error === 'jigsaw_placed' || result.error === 'jigsaw_done') {
        stopHold();
        accepted.current.add(piece);
      }
      bump();
    });
  };

  const rotate = (piece: number) => {
    const entry = pieces.get(piece);
    if (entry === undefined || isPlaced(piece) || heldByOther(piece)) return;
    entry.rot = (entry.rot + 1) % 4;
    // Лежить біля свого місця й тепер прямо — прилипає, як після перетягування.
    if (entry.at !== null && infoNow.current.canPlace && jigsawFits(grid, piece, entry.at.x, entry.at.y, entry.rot)) place(piece, entry.at.x, entry.at.y, entry.rot);
    bump();
  };

  const grab = (piece: number) => {
    if (!pieces.has(piece) || isPlaced(piece) || heldByOther(piece) || !infoNow.current.canPlace) return;
    if (holdingNow.current !== null && holdingNow.current !== piece) stopHold();
    holdingNow.current = piece;
    setHolding(piece);
    if (!team || holdTimer.current !== null) return;
    sendHold(piece);
    holdTimer.current = setInterval(() => {
      if (alive.current && holdingNow.current === piece) sendHold(piece);
    }, JIGSAW_HOLD_REFRESH_MS);
  };

  const drop = (piece: number, at: { x: number; y: number } | null) => {
    if (holdingNow.current === piece) stopHold();
    const entry = pieces.get(piece);
    if (entry === undefined || isPlaced(piece)) return;
    entry.at = at;
    if (at !== null && infoNow.current.canPlace && jigsawFits(grid, piece, at.x, at.y, entry.rot)) place(piece, at.x, at.y, entry.rot);
    bump();
  };

  const placed = new Set<number>([...info.placed, ...pending.current, ...accepted.current]);
  const loose = pile.filter((item) => !placed.has(item.piece)).map((item) => ({ piece: item.piece, rot: pieces.get(item.piece)?.rot ?? item.rot, at: pieces.get(item.piece)?.at ?? null }));
  return { placed, loose, pile: order, holding, notice, status: offline ? 'offline' : '', seed, rotate, grab, drop };
}
