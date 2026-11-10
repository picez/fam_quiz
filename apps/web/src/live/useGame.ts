import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { REACTION_SHOW_MS, type ClientToServerEvents, type CloseReason, type GameView, type HostDrafts, type Reaction, type ServerToClientEvents, type SocketAuth, type SortTilt } from '@quiz/shared';
import { freshSplash } from '../clock';
import { dropReaction, upsertReaction } from '../reactions';
import { emptyDrawing, needsSync, reduceDrawing, type DrawingModel } from './drawing';
import type { Send, SendResult } from './types';

/** Остання команда звуку від ведучого; seq зростає, тож кожна нова — окрема. */
export type AudioCommand = { action: 'replay' | 'stop'; seq: number };

export type Status = 'connecting' | 'live' | 'offline' | 'restarting' | 'unauthorized';

/** Пауза перед ручним перепідключенням, коли socket.io не робить цього сам. */
export const RETRY_MS = 1500;
/** «Малюнок» (28c): скільки чекати знімка, що йде слідом за першим зрізом після підключення, перш ніж просити самому. */
export const DRAW_SNAPSHOT_WAIT_MS = 2000;
/** Повтор draw:sync після too_soon (вікно сервера — 2 на секунду). */
export const DRAW_SYNC_RETRY_MS = 600;

/** Ключ тексту для екрана без гри чи смуги над грою. */
export const statusTextKey = (status: Status): 'offline' | 'restarting' | 'connecting' =>
  status === 'offline' ? 'offline' : status === 'restarting' ? 'restarting' : 'connecting';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Тримає сокет гри: поточний зріз стану, стан зв'язку й надсилання подій. */
export function useGame(auth: SocketAuth | null) {
  const [view, setView] = useState<GameView | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [hostOnline, setHostOnline] = useState(true);
  const [stageOnline, setStageOnline] = useState(true);
  const [audioCommand, setAudioCommand] = useState<AudioCommand | null>(null);
  // Останній дотик «Нагороди на сцені» (12d), лише для сцени; у стан не потрапляє.
  const [awardsSeq, setAwardsSeq] = useState<number | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [closed, setClosed] = useState<CloseReason | null>(null);
  // Останній нахил картки сортування за тим, хто сортує (11d); тимчасовий, у зріз стану не потрапляє.
  const [tilts, setTilts] = useState<Record<string, SortTilt>>({});
  // Останній пакет живих виборів для пульта (12b); лише в пам'яті, з новим запитанням чи розривом зникає.
  const [drafts, setDrafts] = useState<HostDrafts | null>(null);
  // Остання реакція кожної людини (13a), REACTION_SHOW_MS; лише в пам'яті, з розривом зникає.
  const [reactions, setReactions] = useState<Reaction[]>([]);
  // Малюнок поточного запитання (28c): знімок + операції; лише в пам'яті, з розривом зникає.
  const [drawing, setDrawing] = useState<DrawingModel | null>(null);
  const socketRef = useRef<GameSocket | null>(null);
  // Запит повного малюнка; живе в ефекті сокета, назовні — requestSync.
  const syncRef = useRef<() => void>(() => {});

  const code = auth?.code;
  const role = auth?.role;
  const token = auth?.token;

  useEffect(() => {
    // Скидається й тоді, коли токена вже немає: інакше «вилучено» з минулої гри
    // спрацювало б на щойно отриманий новий токен.
    setView(null);
    setStatus('connecting');
    setClosed(null);
    setAudioCommand(null);
    setAwardsSeq(null);
    setTilts({});
    setDrafts(null);
    setReactions([]);
    setDrawing(null);
    if (code === undefined || role === undefined || token === undefined) return;
    const socket: GameSocket = io({ auth: { code, role, token }, transports: ['websocket'] });
    socketRef.current = socket;
    // Сервер перезапускається: socket.io сам не повторює після розриву сервером чи відмови
    // проміжної функції, тож перепідключаємо вручну. Вилученого гравця й закриту гру — ні.
    let gone = false;
    let restarting = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    // Таймери зникнення реакцій: кожна живе REACTION_SHOW_MS від приходу.
    const reactionTimers = new Set<ReturnType<typeof setTimeout>>();
    // Запитання, на якому зібрано нахили: нове запитання їх скидає.
    let tiltsAt: number | null = null;
    // Малюнок (28c). fresh — ще не було зрізу після (пере)підключення; snapshotDue — сервер от-от надішле знімок
    // (сервер шле його раніше за перший зріз; старий сервер — слідом), тож самому не просити; snapshotIn — знімок
    // цього підключення вже прийшов (раніше за зріз), чекати нічого; syncing — запит уже в польоті.
    let model: DrawingModel | null = null;
    let lastView: GameView | null = null;
    let fresh = true;
    let snapshotDue = false;
    let snapshotIn = false;
    let syncing = false;
    let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
    let syncRetry: ReturnType<typeof setTimeout> | null = null;
    const setModel = (next: DrawingModel | null) => {
      model = next;
      setDrawing(next);
    };
    const stopDrawingTimers = () => {
      if (snapshotTimer !== null) clearTimeout(snapshotTimer);
      if (syncRetry !== null) clearTimeout(syncRetry);
      snapshotTimer = null;
      syncRetry = null;
    };
    const requestSync = () => {
      if (snapshotDue || syncing || !socket.connected) return;
      syncing = true;
      socket.emit('draw:sync', (result) => {
        syncing = false;
        if (result.ok || result.error !== 'too_soon' || syncRetry !== null) return;
        syncRetry = setTimeout(() => {
          syncRetry = null;
          if (lastView !== null && needsSync(model, lastView)) requestSync();
        }, DRAW_SYNC_RETRY_MS);
      });
    };
    syncRef.current = requestSync;
    const checkDrawing = (next: GameView) => {
      lastView = next;
      if (fresh) {
        fresh = false;
        // На «Малюнку» сервер шле знімок разом із першим зрізом: якщо його ще немає — чекаємо, а не просимо вдруге.
        snapshotDue = next.drawing !== undefined && !snapshotIn;
        if (snapshotDue)
          snapshotTimer = setTimeout(() => {
            snapshotTimer = null;
            snapshotDue = false;
            if (lastView !== null && needsSync(model, lastView)) requestSync();
          }, DRAW_SNAPSHOT_WAIT_MS);
      }
      if (next.drawing === undefined) {
        if (model !== null) setModel(null);
        return;
      }
      // Нове запитання без жодного штриха: малюнок порожній, просити нічого.
      if ((model === null || model.questionIndex !== next.questionIndex) && next.drawing.rev === 0) setModel(emptyDrawing(next.questionIndex));
      if (needsSync(model, next)) requestSync();
    };
    const again = () => {
      if (retry === null)
        retry = setTimeout(() => {
          retry = null;
          socket.connect();
        }, RETRY_MS);
    };

    socket.on('state', (next, meta) => {
      // Заставка, що скінчилася до відправлення, відкидається за часом сервера, а не за годинником пристрою.
      restarting = false;
      setView(freshSplash(next, meta.serverNow));
      if (next.paused || (tiltsAt !== null && tiltsAt !== next.questionIndex)) setTilts({});
      if (tiltsAt !== null && tiltsAt !== next.questionIndex) setDrafts(null);
      tiltsAt = next.questionIndex;
      setHostOnline(meta.hostOnline);
      setStageOnline(meta.stageOnline ?? true);
      setOffsetMs(meta.serverNow - Date.now());
      setStatus('live');
      checkDrawing(next);
    });
    socket.on('drawing', (event) => {
      if (event.kind === 'sync') {
        if (fresh) snapshotIn = true;
        snapshotDue = false;
        if (snapshotTimer !== null) clearTimeout(snapshotTimer);
        snapshotTimer = null;
      }
      const next = reduceDrawing(model, event);
      if (next !== model) setModel(next);
      if (next.stale) requestSync();
    });
    socket.on('audio', (command) => setAudioCommand(command));
    socket.on('awards', (step) => setAwardsSeq(step.seq));
    socket.on('sort:tilt', (tilt) => setTilts((prev) => ({ ...prev, [tilt.sorterId]: tilt })));
    socket.on('host:drafts', (batch) => setDrafts(batch));
    socket.on('reaction', (reaction) => {
      setReactions((prev) => upsertReaction(prev, reaction));
      const timer = setTimeout(() => {
        reactionTimers.delete(timer);
        setReactions((prev) => (prev.some((entry) => entry.seq === reaction.seq) ? dropReaction(prev, reaction.seq) : prev));
      }, REACTION_SHOW_MS);
      reactionTimers.add(timer);
    });
    socket.on('closed', (reason) => {
      gone = true;
      setClosed(reason);
    });
    socket.on('restarting', () => {
      restarting = true;
      setStatus('restarting');
    });
    socket.on('disconnect', (reason) => {
      setTilts({});
      setDrafts(null);
      // Після перезапуску сервера лічильник seq почнеться знову: старі таймери не мусять прибрати нову реакцію.
      for (const timer of reactionTimers) clearTimeout(timer);
      reactionTimers.clear();
      setReactions([]);
      // Малюнок: модель забувається, наступне підключення знову чекає на свій знімок.
      stopDrawingTimers();
      setModel(null);
      fresh = true;
      snapshotDue = false;
      snapshotIn = false;
      syncing = false;
      if (gone) return;
      if (reason === 'io server disconnect') {
        restarting = true;
        again();
      }
      setStatus(restarting ? 'restarting' : 'offline');
    });
    socket.on('connect_error', (error) => {
      if (error.message === 'unauthorized') {
        setStatus('unauthorized');
        socket.close();
      } else if (error.message === 'restarting') {
        restarting = true;
        setStatus('restarting');
        again();
      } else {
        setStatus(restarting ? 'restarting' : 'offline');
        if (!socket.active) again();
      }
    });

    return () => {
      if (retry !== null) clearTimeout(retry);
      for (const timer of reactionTimers) clearTimeout(timer);
      stopDrawingTimers();
      syncRef.current = () => {};
      socket.close();
      socketRef.current = null;
    };
  }, [code, role, token]);

  const send = useCallback<Send>((event, payload) => {
    return new Promise<SendResult>((resolve) => {
      const socket = socketRef.current;
      if (socket === null || !socket.connected) {
        resolve({ ok: false, error: 'offline' });
        return;
      }
      const emit = socket.emit.bind(socket) as (event: string, ...args: unknown[]) => void;
      if (payload === undefined) emit(event, resolve);
      else emit(event, payload, resolve);
    });
  }, []);

  /** Забуває живі вибори й нахили (12b): пульт вимкнув чи знову ввімкнув «наживо», а сервер надішле свіжі. */
  const forgetLive = useCallback(() => {
    setTilts({});
    setDrafts(null);
  }, []);

  /** Просить у сервера повний малюнок (28c), напр. після відмови ack художникові; поки знімок і так іде чи запит у польоті — нічого. */
  const requestSync = useCallback(() => syncRef.current(), []);

  return { view, status, hostOnline, stageOnline, audioCommand, awardsSeq, reactions, offsetMs, closed, tilts, drafts, forgetLive, send, drawing, requestSync };
}
