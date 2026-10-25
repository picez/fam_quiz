import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, CloseReason, GameView, ServerToClientEvents, SocketAuth, SortTilt } from '@quiz/shared';
import { freshSplash } from '../clock';
import type { Send, SendResult } from './types';

/** Остання команда звуку від ведучого; seq зростає, тож кожна нова — окрема. */
export type AudioCommand = { action: 'replay' | 'stop'; seq: number };

export type Status = 'connecting' | 'live' | 'offline' | 'restarting' | 'unauthorized';

/** Пауза перед ручним перепідключенням, коли socket.io не робить цього сам. */
export const RETRY_MS = 1500;

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
  const [offsetMs, setOffsetMs] = useState(0);
  const [closed, setClosed] = useState<CloseReason | null>(null);
  // Останній нахил картки сортування за тим, хто сортує (11d); тимчасовий, у зріз стану не потрапляє.
  const [tilts, setTilts] = useState<Record<string, SortTilt>>({});
  const socketRef = useRef<GameSocket | null>(null);

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
    setTilts({});
    if (code === undefined || role === undefined || token === undefined) return;
    const socket: GameSocket = io({ auth: { code, role, token }, transports: ['websocket'] });
    socketRef.current = socket;
    // Сервер перезапускається: socket.io сам не повторює після розриву сервером чи відмови
    // проміжної функції, тож перепідключаємо вручну. Вилученого гравця й закриту гру — ні.
    let gone = false;
    let restarting = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
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
      if (next.paused) setTilts({});
      setHostOnline(meta.hostOnline);
      setStageOnline(meta.stageOnline ?? true);
      setOffsetMs(meta.serverNow - Date.now());
      setStatus('live');
    });
    socket.on('audio', (command) => setAudioCommand(command));
    socket.on('sort:tilt', (tilt) => setTilts((prev) => ({ ...prev, [tilt.sorterId]: tilt })));
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

  return { view, status, hostOnline, stageOnline, audioCommand, offsetMs, closed, tilts, send };
}
