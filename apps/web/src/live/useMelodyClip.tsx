import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import type { MelodyTrack } from '@quiz/shared';
import { YOUTUBE_BLOCK_MS } from '../screens/QuestionAudio';
import { YOUTUBE_ORIGIN, youtubeEmbedUrl } from '../screens/YouTubePlayer';

export type MelodyPlayState = 'idle' | 'playing' | 'blocked' | 'failed';

const LISTEN_INTERVAL_MS = 250;
/** Скільки разів повторюємо «listening» (≈10 с), поки плеєр не відгукнеться. */
const LISTEN_MAX_TICKS = 40;

interface Command {
  func: string;
  args: unknown[];
}

/**
 * Шматки «Мелодії за нотами» (29e): play(seconds) грає перші seconds секунд треку від його start.
 * Усе робиться імперативно й синхронно в тому самому виклику, що й дотик (iOS пускає звук лише з жесту): без useEffect між дотиком і play().
 * Таймер зупинки стартує з події «грає» (файл — playing, YouTube — onStateChange 1), а не з дотику: буферизація не з'їдає шматок.
 * element — <audio preload="auto"> або прихована рамка YouTube; рендерити один раз.
 */
export function useMelodyClip(track: MelodyTrack, opts: { paused: boolean; live: boolean }): {
  play(seconds: number): void;
  stop(): void;
  state: MelodyPlayState;
  playing: number | null;
  element: JSX.Element;
} {
  const [state, setState] = useState<MelodyPlayState>('idle');
  const [playing, setPlaying] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  // React відв'язує ref до очищення ефектів: останній елемент тримаємо окремо, щоб при виході його можна було зупинити.
  const lastAudio = useRef<HTMLAudioElement | null>(null);
  const setAudio = (element: HTMLAudioElement | null) => {
    audio.current = element;
    if (element !== null) lastAudio.current = element;
  };
  // Змінний стан відтворення живе в ref: таймери й події читають його без перемальовувань.
  const run = useRef({ seconds: null as number | null, token: 0, armed: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yt = useRef({ ready: false, queue: [] as Command[], state: -1, block: null as ReturnType<typeof setTimeout> | null, poll: null as ReturnType<typeof setInterval> | null });
  const trackRef = useRef(track);
  trackRef.current = track;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const clearBlock = () => {
    if (yt.current.block !== null) clearTimeout(yt.current.block);
    yt.current.block = null;
  };

  const sendNow = useCallback((command: Command) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: command.func, args: command.args, id: 1, channel: 'widget' }), YOUTUBE_ORIGIN);
  }, []);
  const youtube = (func: string, args: unknown[] = []) => {
    if (yt.current.ready) sendNow({ func, args });
    else yt.current.queue.push({ func, args });
  };

  /** Зупиняє звук; next — стан після зупинки (null — тиша). */
  const halt = useCallback(
    (next: MelodyPlayState | null) => {
      run.current.token += 1;
      run.current.seconds = null;
      run.current.armed = false;
      clearTimer();
      clearBlock();
      yt.current.state = 2;
      lastAudio.current?.pause();
      if (trackRef.current.source === 'youtube') {
        yt.current.queue = [];
        if (yt.current.ready) sendNow({ func: 'pauseVideo', args: [] });
      }
      setPlaying(null);
      setState(next ?? 'idle');
    },
    [sendNow],
  );
  const haltRef = useRef(halt);
  haltRef.current = halt;

  /** Звук пішов: від цієї миті відлічується тривалість шматка. */
  const arm = () => {
    const seconds = run.current.seconds;
    // Один таймер на запуск: повторне «грає» після буферизації його не перезапускає.
    if (seconds === null || run.current.armed) return;
    run.current.armed = true;
    const token = run.current.token;
    clearTimer();
    timer.current = setTimeout(() => {
      if (run.current.token === token) halt(null);
    }, seconds * 1000);
  };

  const play = (seconds: number) => {
    if (optsRef.current.paused || !optsRef.current.live) return;
    const current = trackRef.current;
    run.current.token += 1;
    const token = run.current.token;
    run.current.seconds = seconds;
    run.current.armed = false;
    clearTimer();
    clearBlock();
    setPlaying(seconds);
    setState('playing');
    if (current.source === 'file') {
      const element = audio.current;
      if (element === null) return halt('failed');
      element.currentTime = current.start;
      // Уже грає (новий шматок під час старого): події «playing» після перемотування може й не бути.
      if (!element.paused && element.readyState >= 3) arm();
      try {
        void Promise.resolve(element.play()).catch((error: unknown) => {
          if (run.current.token !== token) return;
          halt((error as { name?: string } | null)?.name === 'NotAllowedError' ? 'blocked' : 'failed');
        });
      } catch {
        halt('failed');
      }
      return;
    }
    // YouTube: команди — у цьому ж виклику; плеєр, що ще не відгукнувся, отримає їх у черзі.
    youtube('seekTo', [current.start, true]);
    youtube('playVideo');
    if (yt.current.state === 1) arm();
    yt.current.block = setTimeout(() => {
      yt.current.block = null;
      if (run.current.token === token && yt.current.state !== 1 && yt.current.state !== 3) halt('blocked');
    }, YOUTUBE_BLOCK_MS);
  };

  const stop = () => halt(null);

  // Пауза гри чи кінець запитання — тиша.
  useEffect(() => {
    if ((opts.paused || !opts.live) && run.current.seconds !== null) halt(null);
  }, [opts.paused, opts.live, halt]);

  // Інший трек (нове запитання) чи розмонтування: звук зупиняється.
  const trackKey = track.source === 'file' ? `f:${track.url}:${track.start}` : `y:${track.id}:${track.start}`;
  useEffect(
    () => () => {
      haltRef.current(null);
    },
    [trackKey],
  );

  // Рамка YouTube: слухаємо відповіді плеєра; до першої відповіді повторюємо «listening».
  const source = track.source;
  const ytId = track.source === 'youtube' ? track.id : '';
  useEffect(() => {
    if (source !== 'youtube') return;
    const state = yt.current;
    // Нова рамка (інше відео) ще не слухає: рукостискання починається заново.
    state.ready = false;
    state.queue = [];
    state.state = -1;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== YOUTUBE_ORIGIN) return;
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
        for (const command of queued) sendNow(command);
      }
      const playerState =
        data.event === 'onStateChange' ? data.info : data.event === 'infoDelivery' && typeof data.info === 'object' && data.info !== null ? (data.info as { playerState?: unknown }).playerState : undefined;
      if (data.event === 'onError') haltRef.current('failed');
      else if (typeof playerState === 'number') {
        const before = state.state;
        state.state = playerState;
        if (playerState === 1 || playerState === 3) clearBlock();
        if (playerState === 1 && before !== 1 && run.current.seconds !== null) arm();
        else if (playerState === 0 && run.current.seconds !== null) haltRef.current(null);
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (state.poll !== null) clearInterval(state.poll);
      state.poll = null;
      state.ready = false;
    };
    // arm читає лише ref-и й haltRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, ytId, sendNow]);

  const onFrameLoad = () => {
    const state = yt.current;
    if (state.ready || state.poll !== null) return;
    const post = (message: object) => frame.current?.contentWindow?.postMessage(JSON.stringify({ ...message, id: 1, channel: 'widget' }), YOUTUBE_ORIGIN);
    let ticks = 0;
    const tick = () => {
      if (++ticks > LISTEN_MAX_TICKS) {
        if (state.poll !== null) clearInterval(state.poll);
        state.poll = null;
        // Плеєр не відгукується: «не вийшло» лише якщо хтось уже просив грати.
        if (run.current.seconds !== null) haltRef.current('failed');
        return;
      }
      post({ event: 'listening' });
      post({ event: 'command', func: 'addEventListener', args: ['onStateChange'] });
      post({ event: 'command', func: 'addEventListener', args: ['onError'] });
    };
    tick();
    state.poll = setInterval(tick, LISTEN_INTERVAL_MS);
  };

  const element =
    track.source === 'file' ? (
      <audio
        ref={setAudio}
        src={track.url}
        preload="auto"
        onPlaying={() => arm()}
        onTimeUpdate={(event) => {
          const seconds = run.current.seconds;
          if (seconds !== null && event.currentTarget.currentTime >= trackRef.current.start + seconds) halt(null);
        }}
        onEnded={() => halt(null)}
        onError={() => halt('failed')}
        onLoadedMetadata={(event) => {
          // Позицію, поставлену до метаданих, браузер міг скинути: ставимо ще раз, поки шматок на початку.
          const element = event.currentTarget;
          if (run.current.seconds !== null && element.currentTime < trackRef.current.start - 0.5) element.currentTime = trackRef.current.start;
        }}
      />
    ) : (
      <iframe
        key={track.id}
        ref={frame}
        className="audio-only-frame"
        aria-hidden="true"
        tabIndex={-1}
        title=""
        allow="autoplay; encrypted-media"
        referrerPolicy="strict-origin-when-cross-origin"
        src={`${youtubeEmbedUrl({ id: track.id, start: 0 }, window.location.origin)}&controls=0`}
        onLoad={onFrameLoad}
      />
    );

  return { play, stop, state, playing, element };
}
