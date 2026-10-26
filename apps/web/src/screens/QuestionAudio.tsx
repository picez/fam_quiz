import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuestionAudio as Clip } from '@quiz/shared';
import { t } from '../i18n';
import type { AudioCommand } from '../live/useGame';
import { YOUTUBE_ORIGIN, youtubeEmbedUrl } from './YouTubePlayer';

interface Props {
  clip: Clip;
  /** Ключ запитання (раунд:номер): новий ключ — фрагмент грає з початку. */
  questionKey: string;
  /** Чи можна починати: етап question і заставка скінчилась. */
  ready: boolean;
  paused: boolean;
  command: AudioCommand | null;
  /** Скільки мс запитання вже минуло в мить автостарту: фрагмент грає лише залишок, а повністю минулий не грає. */
  elapsedMs?: number | (() => number);
  /** Іде заставка: команди «ще раз» у цей час ігноруються. */
  splash?: boolean;
}

type PlayState = 'idle' | 'playing' | 'stopped' | 'blocked' | 'failed';

const LISTEN_INTERVAL_MS = 250;
/** Скільки разів повторюємо «listening» (≈10 с), поки плеєр не відгукнеться. */
const LISTEN_MAX_TICKS = 40;
/** Скільки чекаємо, поки YouTube підтвердить, що грає, перш ніж вважати звук заблокованим. */
export const YOUTUBE_BLOCK_MS = 2000;

/** Браузер ще не дозволив звук: на сторінку не було жодного дотику. */
const needsTouch = () => (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === false;

interface Command {
  func: string;
  args: unknown[];
}

/**
 * Грає фрагмент: файл через <audio>, YouTube — у прихованій рамці.
 * Автостарт раз на questionKey, коли ready; нова command.seq — «ще раз» чи «стоп»;
 * пауза гри ставить звук на паузу; через duration с від старту (без пауз) фрагмент зупиняється.
 * YouTube: команди чекають, поки плеєр відгукнеться, а «не заграло» за 2 с — це заблокований звук.
 */
export function QuestionAudio({ clip, questionKey, ready, paused, command, elapsedMs = 0, splash = false }: Props) {
  const media = useRef<HTMLAudioElement | null>(null);
  // React відв'язує ref до очищення ефектів: останній елемент тримаємо окремо, щоб при виході його можна було зупинити.
  const lastMedia = useRef<HTMLAudioElement | null>(null);
  const setMedia = (element: HTMLAudioElement | null) => {
    media.current = element;
    if (element !== null) lastMedia.current = element;
  };
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<PlayState>('idle');
  const [plays, setPlays] = useState(0);
  // Змінний стан відтворення живе в ref: таймери й команди читають його без перемальовувань.
  const run = useRef({ active: false, running: false, held: false, remaining: 0, since: 0, token: 0, seek: false, seekPos: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedKey = useRef<string | null>(null);
  const lastSeq = useRef<number | null>(command?.seq ?? null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const elapsedRef = useRef(elapsedMs);
  elapsedRef.current = elapsedMs;
  // Свіжий час запитання: пропс (число з останнього рендера) або функція, що читає годинник у мить виклику.
  const elapsedNow = () => Math.max(0, typeof elapsedRef.current === 'function' ? elapsedRef.current() : elapsedRef.current);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  // Звук заблокований після автостарту: дотик має продовжити з поточного часу запитання, а не з початку фрагмента.
  const fromAuto = useRef(false);
  const splashRef = useRef(splash);
  splashRef.current = splash;
  // YouTube: плеєр відповів, черга команд до цього, чи підтвердив він «грає», таймер перевірки.
  const yt = useRef({ ready: false, queue: [] as Command[], state: -1, block: null as ReturnType<typeof setTimeout> | null, poll: null as ReturnType<typeof setInterval> | null });
  // Таймер блокування звертається до halt, оголошеного нижче.
  const haltRef = useRef<(next: PlayState | null) => void>(() => {});

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const clearBlock = () => {
    if (yt.current.block !== null) clearTimeout(yt.current.block);
    yt.current.block = null;
  };

  const post = (message: object) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ ...message, id: 1, channel: 'widget' }), YOUTUBE_ORIGIN);
  };

  const sendNow = useCallback((command: Command) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: command.func, args: command.args, id: 1, channel: 'widget' }), YOUTUBE_ORIGIN);
    if (command.func === 'playVideo') {
      if (yt.current.block !== null) clearTimeout(yt.current.block);
      yt.current.block = setTimeout(() => {
        yt.current.block = null;
        // Буферизація (3) — теж живий звук; заблокований звук лишається в -1 (не почато), 2 (пауза) чи 5 (у черзі).
        if (run.current.active && run.current.running && yt.current.state !== 1 && yt.current.state !== 3) haltRef.current('blocked');
      }, YOUTUBE_BLOCK_MS);
    }
  }, []);

  const youtube = useCallback(
    (func: string, args: unknown[] = []) => {
      if (yt.current.ready) sendNow({ func, args });
      else yt.current.queue.push({ func, args });
    },
    [sendNow],
  );

  /** Зупиняє звук і скидає відлік фрагмента. */
  const halt = useCallback(
    (next: PlayState | null) => {
      const r = run.current;
      r.token += 1;
      r.active = false;
      r.running = false;
      r.held = false;
      clearTimer();
      clearBlock();
      yt.current.state = 2;
      lastMedia.current?.pause();
      if (clipRef.current.source === 'youtube') {
        // Плеєр, що ще не відгукнувся, нічого не грає: команди до нього не потрібні.
        yt.current.queue = [];
        if (yt.current.ready) sendNow({ func: 'pauseVideo', args: [] });
      }
      if (next !== null) setState(next);
    },
    [sendNow],
  );
  haltRef.current = halt;

  /** Запускає (з початку, зі зсувом offsetMs від початку фрагмента) або продовжує фрагмент. */
  const begin = useCallback(
    (fromStart: boolean, offsetMs = 0) => {
      const r = run.current;
      const current = clipRef.current;
      if (fromStart) {
        r.token += 1;
        r.remaining = current.duration * 1000 - offsetMs;
        r.active = true;
        r.held = false;
        r.seek = true;
        r.seekPos = current.start + offsetMs / 1000;
        yt.current.queue = [];
        setPlays((count) => count + 1);
      }
      if (!r.active) return;
      if (pausedRef.current) {
        r.held = true;
        r.running = false;
        clearTimer();
        return;
      }
      const token = r.token;
      r.running = true;
      r.since = Date.now();
      clearTimer();
      timer.current = setTimeout(() => halt('stopped'), Math.max(0, r.remaining));
      setState('playing');
      const seek = r.seek;
      r.seek = false;
      if (current.source === 'file') {
        const element = media.current;
        if (element === null) return;
        if (seek) element.currentTime = r.seekPos;
        try {
          void Promise.resolve(element.play()).catch((error: unknown) => {
            if (run.current.token !== token) return;
            halt((error as { name?: string } | null)?.name === 'NotAllowedError' ? 'blocked' : 'failed');
          });
        } catch {
          halt('failed');
        }
      } else {
        // На iOS Safari відео в чужій (cross-origin) рамці без дотику до самої рамки може не заграти навіть після
        // дотику до сторінки: тоді за YOUTUBE_BLOCK_MS показується «Увімкнути звук», а надійно грає файл.
        if (seek) youtube('seekTo', [r.seekPos, true]);
        youtube('playVideo');
      }
    },
    [halt, youtube],
  );

  /** Пауза гри: зберігає залишок фрагмента. */
  const suspend = useCallback(() => {
    const r = run.current;
    if (!r.active || !r.running) return;
    r.remaining -= Date.now() - r.since;
    r.running = false;
    r.held = true;
    clearTimer();
    clearBlock();
    yt.current.state = 2;
    lastMedia.current?.pause();
    if (clipRef.current.source === 'youtube') {
      yt.current.queue = [];
      if (yt.current.ready) sendNow({ func: 'pauseVideo', args: [] });
    }
  }, [sendNow]);

  // Нове запитання чи вихід: звук і таймер зупиняються.
  useEffect(
    () => () => {
      halt(null);
    },
    [questionKey, halt],
  );

  // Рамка YouTube: слухаємо відповіді плеєра; до першої відповіді повторюємо «listening».
  useEffect(() => {
    if (clip.source !== 'youtube') return;
    const state = yt.current;
    state.ready = false;
    state.queue = [];
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
        for (const queuedCommand of queued) sendNow(queuedCommand);
      }
      const playerState =
        data.event === 'onStateChange'
          ? data.info
          : data.event === 'infoDelivery' && typeof data.info === 'object' && data.info !== null
            ? (data.info as { playerState?: unknown }).playerState
            : undefined;
      if (data.event === 'onError') haltRef.current('failed');
      else if (typeof playerState === 'number') {
        state.state = playerState;
        if (playerState === 1 || playerState === 3) clearBlock();
        else if (playerState === 0 && run.current.active) haltRef.current('stopped');
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (state.poll !== null) clearInterval(state.poll);
      state.poll = null;
      state.ready = false;
    };
  }, [clip.source, sendNow]);

  const onFrameLoad = () => {
    const state = yt.current;
    if (state.ready || state.poll !== null) return;
    let ticks = 0;
    const tick = () => {
      // Плеєр не відгукується (немає мережі, YouTube недоступний): довго не чекаємо.
      if (++ticks > LISTEN_MAX_TICKS) {
        if (state.poll !== null) clearInterval(state.poll);
        state.poll = null;
        haltRef.current('failed');
        return;
      }
      post({ event: 'listening' });
      post({ event: 'command', func: 'addEventListener', args: ['onStateChange'] });
      post({ event: 'command', func: 'addEventListener', args: ['onError'] });
    };
    tick();
    state.poll = setInterval(tick, LISTEN_INTERVAL_MS);
  };

  // Автостарт: раз на ключ запитання, коли можна починати; без того, що вже минуло.
  useEffect(() => {
    if (!ready || startedKey.current === questionKey) return;
    startedKey.current = questionKey;
    setPlays(0);
    const offset = elapsedNow();
    fromAuto.current = true;
    if (offset >= clipRef.current.duration * 1000) {
      run.current.active = false;
      setState('stopped');
      return;
    }
    if (needsTouch()) {
      run.current.active = false;
      setState('blocked');
      return;
    }
    begin(true, offset);
  }, [ready, questionKey, begin]);

  // Нова команда ведучого.
  useEffect(() => {
    if (command === null || command.seq === lastSeq.current) return;
    lastSeq.current = command.seq;
    fromAuto.current = false;
    if (command.action === 'stop') {
      // «Стоп» під час заставки: після неї автостарт уже не має вмикати звук.
      startedKey.current = questionKey;
      halt('stopped');
    } else if (splashRef.current) return;
    else if (needsTouch()) halt('blocked');
    else begin(true);
  }, [command, begin, halt, questionKey]);

  // Пауза гри.
  useEffect(() => {
    const r = run.current;
    if (paused) suspend();
    else if (r.held) {
      r.held = false;
      begin(false);
    }
  }, [paused, suspend, begin]);

  const unlock = () => {
    const offset = fromAuto.current && readyRef.current ? elapsedNow() : 0;
    if (offset >= clipRef.current.duration * 1000) halt('stopped');
    else begin(true, offset);
  };

  const playing = state === 'playing';
  const quiet = state === 'idle' || state === 'stopped';
  return (
    <div className={`audio-card${playing ? ' is-playing' : ''}${quiet ? ' is-quiet' : ''}`} data-state={state} data-plays={plays}>
      {clip.source === 'file' ? (
        <audio
          ref={setMedia}
          src={clip.url}
          preload="auto"
          onEnded={() => halt('stopped')}
          onError={() => halt('failed')}
          onLoadedMetadata={(event) => {
            // Позицію, поставлену до метаданих, браузер міг скинути: ставимо ще раз, поки фрагмент на початку.
            const element = event.currentTarget;
            if (run.current.active && element.currentTime < run.current.seekPos - 0.5) element.currentTime = run.current.seekPos;
          }}
        />
      ) : (
        <iframe
          ref={frame}
          className="audio-only-frame"
          aria-hidden="true"
          tabIndex={-1}
          title=""
          allow="autoplay; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
          src={`${youtubeEmbedUrl({ id: clip.id, start: clip.start }, window.location.origin)}&controls=0`}
          onLoad={onFrameLoad}
        />
      )}
      {playing && <span className="audio-listen">{t('audioListen')}</span>}
      {/* Живий регіон стоїть завжди: читалка почує, коли браузер заблокував звук. */}
      <span className="sr-only" role="status">
        {state === 'blocked' ? t('audioBlocked') : ''}
      </span>
      {state === 'blocked' && (
        <button type="button" className="btn btn-primary" onClick={unlock}>
          {t('audioUnlock')}
        </button>
      )}
      {state === 'failed' && (
        <span className="audio-failed" role="status">
          {t('audioFailed')}
        </span>
      )}
    </div>
  );
}
