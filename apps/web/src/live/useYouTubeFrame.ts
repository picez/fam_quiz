import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { YOUTUBE_ORIGIN } from '../screens/YouTubePlayer';

const LISTEN_INTERVAL_MS = 250;
/** Скільки разів повторюємо «listening» (≈10 с), поки плеєр не відгукнеться. */
const LISTEN_MAX_TICKS = 40;

interface Command {
  func: string;
  args: unknown[];
}

export interface YouTubeFrameEvents {
  /** Новий стан плеєра (onStateChange чи infoDelivery.playerState); before — попередній відомий. */
  state(playerState: number, before: number): void;
  /** onError від плеєра. */
  error(): void;
  /** Плеєр так і не відгукнувся на «listening» (≈10 с). */
  silent?(): void;
  /** infoDelivery.duration: тривалість ролика в секундах. */
  duration?(seconds: number): void;
}

/**
 * Рукостискання з рамкою YouTube (винесено з useMelodyClip, 29e → 36): onLoad рамки шле «listening» і addEventListener(onStateChange/onError),
 * доки плеєр не відгукнеться; команди до відповіді чекають у черзі. id — відео рамки (null — рамки немає): з новим id рукостискання починається заново.
 */
export function useYouTubeFrame(
  id: string | null,
  on: YouTubeFrameEvents,
): {
  frameRef: RefObject<HTMLIFrameElement | null>;
  /** Команда в цьому ж виклику; плеєр, що ще не відгукнувся, отримає її з черги. */
  command(func: string, args?: unknown[]): void;
  /** Зупинка: черга порожніє, pauseVideo — лише плеєру, що вже слухає; стан вважається «пауза» (2). */
  pause(): void;
  /** Останній відомий стан плеєра (-1 — невідомо). */
  playerState(): number;
  /** onLoad рамки: «listening» і addEventListener(onStateChange/onError), до відповіді або LISTEN_MAX_TICKS. */
  onLoad(): void;
} {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const yt = useRef({ ready: false, queue: [] as Command[], state: -1, poll: null as ReturnType<typeof setInterval> | null });
  const onRef = useRef(on);
  onRef.current = on;

  const sendNow = useCallback((command: Command) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: command.func, args: command.args, id: 1, channel: 'widget' }), YOUTUBE_ORIGIN);
  }, []);

  const command = useCallback(
    (func: string, args: unknown[] = []) => {
      if (yt.current.ready) sendNow({ func, args });
      else yt.current.queue.push({ func, args });
    },
    [sendNow],
  );

  const pause = useCallback(() => {
    yt.current.state = 2;
    yt.current.queue = [];
    if (yt.current.ready) sendNow({ func: 'pauseVideo', args: [] });
  }, [sendNow]);

  const playerState = useCallback(() => yt.current.state, []);

  // Слухаємо відповіді плеєра; до першої відповіді onLoad повторює «listening».
  useEffect(() => {
    if (id === null) return;
    const state = yt.current;
    // Нова рамка (інше відео) ще не слухає: рукостискання починається заново.
    state.ready = false;
    state.queue = [];
    state.state = -1;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== YOUTUBE_ORIGIN) return;
      let data: { event?: unknown; info?: unknown } | null;
      try {
        data = JSON.parse(String(event.data)) as { event?: unknown; info?: unknown } | null;
      } catch {
        return;
      }
      if (typeof data !== 'object' || data === null) return;
      if (!state.ready) {
        state.ready = true;
        if (state.poll !== null) clearInterval(state.poll);
        state.poll = null;
        const queued = state.queue;
        state.queue = [];
        for (const queuedCommand of queued) sendNow(queuedCommand);
      }
      const info = data.event === 'infoDelivery' && typeof data.info === 'object' && data.info !== null ? (data.info as { playerState?: unknown; duration?: unknown }) : null;
      const next = data.event === 'onStateChange' ? data.info : info?.playerState;
      if (typeof info?.duration === 'number' && Number.isFinite(info.duration) && info.duration > 0) onRef.current.duration?.(info.duration);
      if (data.event === 'onError') onRef.current.error();
      else if (typeof next === 'number') {
        const before = state.state;
        state.state = next;
        onRef.current.state(next, before);
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (state.poll !== null) clearInterval(state.poll);
      state.poll = null;
      state.ready = false;
    };
  }, [id, sendNow]);

  const onLoad = () => {
    const state = yt.current;
    if (state.ready || state.poll !== null) return;
    const post = (message: object) => frameRef.current?.contentWindow?.postMessage(JSON.stringify({ ...message, id: 1, channel: 'widget' }), YOUTUBE_ORIGIN);
    let ticks = 0;
    const tick = () => {
      if (++ticks > LISTEN_MAX_TICKS) {
        if (state.poll !== null) clearInterval(state.poll);
        state.poll = null;
        onRef.current.silent?.();
        return;
      }
      post({ event: 'listening' });
      post({ event: 'command', func: 'addEventListener', args: ['onStateChange'] });
      post({ event: 'command', func: 'addEventListener', args: ['onError'] });
    };
    tick();
    state.poll = setInterval(tick, LISTEN_INTERVAL_MS);
  };

  return { frameRef, command, pause, playerState, onLoad };
}
