import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, CloseReason, GameView, ServerToClientEvents, SocketAuth } from '@quiz/shared';
import type { Send, SendResult } from './types';

export type Status = 'connecting' | 'live' | 'offline' | 'unauthorized';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Тримає сокет гри: поточний зріз стану, стан зв'язку й надсилання подій. */
export function useGame(auth: SocketAuth | null) {
  const [view, setView] = useState<GameView | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [hostOnline, setHostOnline] = useState(true);
  const [offsetMs, setOffsetMs] = useState(0);
  const [closed, setClosed] = useState<CloseReason | null>(null);
  const socketRef = useRef<GameSocket | null>(null);

  const code = auth?.code;
  const role = auth?.role;
  const token = auth?.token;

  useEffect(() => {
    if (code === undefined || role === undefined || token === undefined) return;
    setStatus('connecting');
    setClosed(null);
    const socket: GameSocket = io({ auth: { code, role, token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('state', (next, meta) => {
      setView(next);
      setHostOnline(meta.hostOnline);
      setOffsetMs(meta.serverNow - Date.now());
      setStatus('live');
    });
    socket.on('closed', (reason) => setClosed(reason));
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', (error) => {
      if (error.message === 'unauthorized') {
        setStatus('unauthorized');
        socket.close();
      } else {
        setStatus('offline');
      }
    });

    return () => {
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

  return { view, status, hostOnline, offsetMs, closed, send };
}
