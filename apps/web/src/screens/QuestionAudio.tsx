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
}

type PlayState = 'idle' | 'playing' | 'stopped' | 'blocked' | 'failed';

/** Браузер ще не дозволив звук: на сторінку не було жодного дотику. */
const needsTouch = () => (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === false;

/**
 * Грає фрагмент: файл через <audio>, YouTube — у прихованій рамці.
 * Автостарт раз на questionKey, коли ready; нова command.seq — «ще раз» чи «стоп»;
 * пауза гри ставить звук на паузу; через duration с від старту (без пауз) фрагмент зупиняється.
 */
export function QuestionAudio({ clip, questionKey, ready, paused, command }: Props) {
  const media = useRef<HTMLAudioElement | null>(null);
  // React отвʼязує ref до очищення ефектів: останній елемент тримаємо окремо, щоб при виході його можна було зупинити.
  const lastMedia = useRef<HTMLAudioElement | null>(null);
  const setMedia = (element: HTMLAudioElement | null) => {
    media.current = element;
    if (element !== null) lastMedia.current = element;
  };
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<PlayState>('idle');
  const [plays, setPlays] = useState(0);
  // Змінний стан відтворення живе в ref: таймер і команди читають його без перемальовувань.
  const run = useRef({ active: false, running: false, held: false, remaining: 0, since: 0, token: 0, seek: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedKey = useRef<string | null>(null);
  const lastSeq = useRef<number | null>(command?.seq ?? null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const clipRef = useRef(clip);
  clipRef.current = clip;

  const youtube = useCallback((func: string, args: unknown[] = []) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), YOUTUBE_ORIGIN);
  }, []);

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Зупиняє звук і скидає відлік фрагмента. */
  const halt = useCallback(
    (next: PlayState | null) => {
      const r = run.current;
      r.token += 1;
      r.active = false;
      r.running = false;
      r.held = false;
      clearTimer();
      lastMedia.current?.pause();
      if (clipRef.current.source === 'youtube') youtube('pauseVideo');
      if (next !== null) setState(next);
    },
    [youtube],
  );

  /** Запускає (з початку) або продовжує фрагмент. */
  const begin = useCallback(
    (fromStart: boolean) => {
      const r = run.current;
      const current = clipRef.current;
      if (fromStart) {
        r.token += 1;
        r.remaining = current.duration * 1000;
        r.active = true;
        r.held = false;
        r.seek = true;
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
        if (seek) element.currentTime = current.start;
        try {
          void Promise.resolve(element.play()).catch((error: unknown) => {
            if (run.current.token !== token) return;
            halt((error as { name?: string } | null)?.name === 'NotAllowedError' ? 'blocked' : 'failed');
          });
        } catch {
          halt('failed');
        }
      } else {
        if (seek) youtube('seekTo', [current.start, true]);
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
    media.current?.pause();
    if (clipRef.current.source === 'youtube') youtube('pauseVideo');
  }, [youtube]);

  // Нове запитання чи вихід: звук і таймер зупиняються.
  useEffect(
    () => () => {
      halt(null);
    },
    [questionKey, halt],
  );

  // Автостарт: раз на ключ запитання, коли можна починати.
  useEffect(() => {
    if (!ready || startedKey.current === questionKey) return;
    startedKey.current = questionKey;
    setPlays(0);
    if (needsTouch()) {
      run.current.active = false;
      setState('blocked');
      return;
    }
    begin(true);
  }, [ready, questionKey, begin]);

  // Нова команда ведучого.
  useEffect(() => {
    if (command === null || command.seq === lastSeq.current) return;
    lastSeq.current = command.seq;
    if (command.action === 'stop') halt('stopped');
    else begin(true);
  }, [command, begin, halt]);

  // Пауза гри.
  useEffect(() => {
    const r = run.current;
    if (paused) suspend();
    else if (r.held) {
      r.held = false;
      begin(false);
    }
  }, [paused, suspend, begin]);

  const onFrameLoad = () => {
    const target = frame.current?.contentWindow;
    target?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YOUTUBE_ORIGIN);
    // Команди, надіслані до завантаження рамки, пропали: повторюємо, якщо звук має грати.
    if (run.current.running && clipRef.current.source === 'youtube') {
      youtube('seekTo', [clipRef.current.start, true]);
      youtube('playVideo');
    }
  };

  const playing = state === 'playing';
  return (
    <div className={playing ? 'audio-card is-playing' : 'audio-card'} data-state={state} data-plays={plays}>
      {clip.source === 'file' ? (
        <audio
          ref={setMedia}
          src={clip.url}
          preload="auto"
          onEnded={() => halt('stopped')}
          onError={() => halt('failed')}
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
      {state === 'blocked' && (
        <button type="button" className="btn btn-primary" onClick={() => begin(true)}>
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
