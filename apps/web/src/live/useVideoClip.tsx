import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import type { Video } from '@quiz/shared';
import { t } from '../i18n';
import { YOUTUBE_BLOCK_MS } from '../screens/QuestionAudio';
import { youtubeEmbedUrl } from '../screens/YouTubePlayer';
import { useYouTubeFrame } from './useYouTubeFrame';

export type VideoPlayState = 'idle' | 'playing' | 'blocked' | 'failed' | 'muted-fallback';

/** Сховати від гравця все, крім кадрів: керування, клавіатуру й логотип (rel, playsinline, iv_load_policy, fs — уже в youtubeEmbedUrl). */
const EMBED_EXTRAS = '&controls=0&disablekb=1&modestbranding=1';

/**
 * Шматки «Відео за фрагментами» (36): play(seconds) показує перші seconds секунд ролика від clip.start у видимій рамці 16:9.
 * Команди seekTo, mute/unMute і playVideo йдуть синхронно в тому самому виклику, що й дотик (iOS пускає відтворення лише з жесту).
 * Таймер зупинки стартує з onStateChange 1, а не з дотику. Поза шматком рамку закриває затулка: не видно превʼю з назвою,
 * кадру паузи, «Більше відео» й кінцевих заставок; поки шматок грає — маски назви зверху й логотипа внизу справа.
 * reveal: true (розкриття) — звук завжди; якщо браузер не дав звук без жесту, відео грає без звуку (state 'muted-fallback'), unmute() — у дотику.
 * element — рендерити один раз.
 */
export function useVideoClip(
  clip: Video,
  opts: { muted: boolean; paused: boolean; live: boolean; reveal?: boolean },
): {
  play(seconds: number): void;
  stop(): void;
  unmute(): void;
  state: VideoPlayState;
  playing: number | null;
  covered: boolean;
  element: JSX.Element;
  duration: number | null;
} {
  const [state, setState] = useState<VideoPlayState>('idle');
  const [playing, setPlaying] = useState<number | null>(null);
  const [covered, setCovered] = useState(true);
  const [duration, setDuration] = useState<number | null>(null);
  // Змінний стан відтворення живе в ref: таймери й події читають його без перемальовувань.
  const run = useRef({ seconds: null as number | null, token: 0, armed: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const block = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const clearBlock = () => {
    if (block.current !== null) clearTimeout(block.current);
    block.current = null;
  };

  const frame = useYouTubeFrame(clip.id, {
    state(playerState, before) {
      if (playerState === 1 || playerState === 3) clearBlock();
      if (playerState === 1 && run.current.seconds !== null) {
        if (before !== 1) arm();
        setCovered(false);
      } else if (playerState === 0 && run.current.seconds !== null) haltRef.current(null);
    },
    error() {
      haltRef.current('failed');
    },
    silent() {
      if (run.current.seconds !== null) haltRef.current('failed');
    },
    duration(seconds) {
      setDuration(seconds);
    },
  });
  const pauseFrame = frame.pause;

  /** Зупиняє відео; next — стан після зупинки (null — тиша). Затулка повертається раніше за pauseVideo. */
  const halt = useCallback(
    (next: VideoPlayState | null) => {
      run.current.token += 1;
      run.current.seconds = null;
      run.current.armed = false;
      clearTimer();
      clearBlock();
      setCovered(true);
      pauseFrame();
      setPlaying(null);
      setState(next ?? 'idle');
    },
    [pauseFrame],
  );
  const haltRef = useRef(halt);
  haltRef.current = halt;

  /** Відео пішло: від цієї миті відлічується тривалість шматка. */
  const arm = () => {
    const seconds = run.current.seconds;
    // Один таймер на запуск: повторне «грає» після буферизації його не перезапускає.
    if (seconds === null || run.current.armed) return;
    run.current.armed = true;
    setCovered(false);
    const token = run.current.token;
    clearTimer();
    timer.current = setTimeout(() => {
      if (run.current.token === token) haltRef.current(null);
    }, seconds * 1000);
  };

  const play = (seconds: number) => {
    if (optsRef.current.paused || !optsRef.current.live) return;
    run.current.token += 1;
    const token = run.current.token;
    run.current.seconds = seconds;
    run.current.armed = false;
    clearTimer();
    clearBlock();
    setCovered(true);
    setPlaying(seconds);
    setState('playing');
    const reveal = optsRef.current.reveal === true;
    // Команди — у цьому ж виклику; плеєр, що ще не відгукнувся, отримає їх у черзі.
    frame.command('seekTo', [clipRef.current.start, true]);
    frame.command(optsRef.current.muted && !reveal ? 'mute' : 'unMute');
    frame.command('playVideo');
    // Уже грав (новий шматок під час старого): події 1 після перемотування може й не бути.
    if (frame.playerState() === 1) arm();
    block.current = setTimeout(() => {
      block.current = null;
      if (run.current.token !== token || frame.playerState() === 1 || frame.playerState() === 3) return;
      if (reveal) {
        // Браузер не дав звук без жесту: розкриття грає без звуку, кнопка вмикає звук дотиком.
        frame.command('mute');
        frame.command('playVideo');
        setState('muted-fallback');
      } else haltRef.current('blocked');
    }, YOUTUBE_BLOCK_MS);
  };

  const stop = () => halt(null);

  const unmute = () => {
    frame.command('unMute');
    setState((current) => (current === 'muted-fallback' ? 'playing' : current));
  };

  // Пауза гри чи кінець запитання — тиша.
  useEffect(() => {
    if ((opts.paused || !opts.live) && run.current.seconds !== null) halt(null);
  }, [opts.paused, opts.live, halt]);

  // Інше відео чи розмонтування: відео зупиняється; тривалість — нового ролика.
  const clipKey = `${clip.id}:${clip.start}`;
  useEffect(
    () => () => {
      haltRef.current(null);
    },
    [clipKey],
  );
  useEffect(() => setDuration(null), [clip.id]);

  // Адреса рамки — одна на відео: зміна start чи звуку не перезавантажує рамку (їх ставлять seekTo і mute/unMute).
  const src = useRef<{ id: string; url: string } | null>(null);
  if (src.current === null || src.current.id !== clip.id) {
    const mute = opts.muted && opts.reveal !== true ? '&mute=1' : '';
    src.current = { id: clip.id, url: `${youtubeEmbedUrl({ id: clip.id, start: clip.start }, window.location.origin)}${EMBED_EXTRAS}${mute}` };
  }

  const element = (
    <div className="videoclip-frame">
      <iframe
        key={clip.id}
        ref={frame.frameRef}
        className="videoclip-iframe"
        tabIndex={-1}
        title={t('videoclipCover')}
        allow="autoplay; encrypted-media"
        referrerPolicy="strict-origin-when-cross-origin"
        src={src.current.url}
        onLoad={frame.onLoad}
      />
      {covered ? (
        <div className="videoclip-cover" role="img" aria-label={t('videoclipCover')}>
          <span aria-hidden="true">🎬</span>
        </div>
      ) : (
        <>
          <div className="videoclip-mask-top" aria-hidden="true" />
          <div className="videoclip-mask-corner" aria-hidden="true" />
        </>
      )}
    </div>
  );

  return { play, stop, unmute, state, playing, covered, element, duration };
}
