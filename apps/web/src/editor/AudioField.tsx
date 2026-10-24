import { AUDIO_LIMITS, LIMITS, videoLink, type QuestionAudio, type Video } from '@quiz/shared';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { uploadAudio } from '../api';
import { errorText, t } from '../i18n';
import { NumberField } from './QuestionEditor';

interface Props {
  audio: QuestionAudio | undefined;
  /** Час запитання, с: для підказки про відкладений таймер. */
  timeLimit: number;
  onChange: (audio: QuestionAudio | undefined) => void;
  /** «Лише звук» знято: повернути YouTube-аудіо у відео. */
  onToVideo: (video: Video) => void;
}

const ACCEPT = [...AUDIO_LIMITS.types, '.mp3', '.ogg', '.m4a'].join(',');
const isAllowed = (file: File) =>
  (AUDIO_LIMITS.types as readonly string[]).includes(file.type) || (file.type === '' && /\.(mp3|ogg|m4a)$/i.test(file.name));

/** Скільки секунд триває файл: читається з метаданих; NaN, якщо браузер не відповів за 3 с. */
function fileSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    let src: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let probe: HTMLAudioElement | null = null;
    const finish = (seconds: number) => {
      clearTimeout(timer);
      probe?.removeAttribute('src');
      if (src !== null) URL.revokeObjectURL(src);
      resolve(seconds);
    };
    try {
      src = URL.createObjectURL(file);
      const made = new Audio();
      probe = made;
      made.preload = 'metadata';
      made.onloadedmetadata = () => finish(made.duration);
      made.onerror = () => finish(Number.NaN);
      timer = setTimeout(() => finish(Number.NaN), 3000);
      made.src = src;
    } catch {
      finish(Number.NaN);
    }
  });
}

/** Типова тривалість фрагмента нового файла: не довша за типову й не довша за сам файл. */
const initialDuration = (seconds: number) =>
  Number.isFinite(seconds) && seconds > 0
    ? Math.max(LIMITS.minAudioSeconds, Math.min(Math.round(seconds), LIMITS.defaultAudioSeconds))
    : LIMITS.defaultAudioSeconds;

/** Аудіо до запитання: файл (завантаження, фрагмент, прослуховування) або YouTube «лише звук». */
export function AudioField({ audio, timeLimit, onChange, onToVideo }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const latest = useRef(onChange);
  latest.current = onChange;
  const mounted = useRef(true);
  const player = useRef<HTMLAudioElement | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stop = () => {
    clearTimeout(stopTimer.current);
    player.current?.pause();
    player.current = null;
    setPlaying(false);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(stopTimer.current);
      player.current?.pause();
    };
  }, []);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Той самий файл можна вибрати ще раз після помилки.
    event.target.value = '';
    if (file === undefined) return;
    if (!isAllowed(file)) return setError(errorText('bad_audio'));
    if (file.size > AUDIO_LIMITS.maxBytes) return setError(errorText('audio_too_large'));
    setError(null);
    setBusy(true);
    stop();
    const [result, seconds] = await Promise.all([uploadAudio(file), fileSeconds(file)]);
    if (!mounted.current) return;
    setBusy(false);
    if (result.ok) latest.current({ source: 'file', url: result.url, start: 0, duration: initialDuration(seconds) });
    else setError(errorText(result.error));
  };

  const preview = () => {
    if (audio?.source !== 'file') return;
    if (playing) return stop();
    const clip = new Audio();
    player.current = clip;
    setPlaying(true);
    clip.onended = stop;
    const begin = Number.isFinite(audio.start) ? audio.start : 0;
    const seconds = Number.isFinite(audio.duration) ? audio.duration : LIMITS.defaultAudioSeconds;
    // Позицію можна ставити, лише коли метадані вже відомі.
    clip.onloadedmetadata = () => {
      clip.currentTime = begin;
      void Promise.resolve(clip.play()).catch(stop);
      stopTimer.current = setTimeout(stop, seconds * 1000);
    };
    clip.onerror = stop;
    clip.src = audio.url;
  };

  const hint =
    audio !== undefined && Number.isFinite(audio.duration) && Number.isFinite(timeLimit) && audio.duration > timeLimit
      ? t('audioLeadHint', { audio: audio.duration, time: timeLimit, total: audio.duration + timeLimit })
      : t('audioParallelHint');

  const picker = (label: 'addAudio' | 'replaceAudio') => (
    <label className={busy ? 'btn btn-small file-pick is-busy' : 'btn btn-small file-pick'}>
      <span>{t(busy ? 'uploading' : label)}</span>
      <input type="file" accept={ACCEPT} disabled={busy} onChange={pick} />
    </label>
  );

  const errorLine = error !== null && (
    <p className="error" role="alert">
      {error}
    </p>
  );

  if (audio === undefined) {
    return (
      <div className="audio-field">
        <div className="toolbar">{picker('addAudio')}</div>
        {errorLine}
      </div>
    );
  }

  const setDuration = (duration: number) => onChange({ ...audio, duration });

  if (audio.source === 'youtube') {
    return (
      <div className="audio-field">
        <p className="meta">{t('audioYoutube', { link: videoLink({ id: audio.id, start: Number.isFinite(audio.start) ? audio.start : 0 }) })}</p>
        <NumberField label={t('audioDuration')} value={audio.duration} onChange={setDuration} />
        <label className="check">
          <input type="checkbox" checked onChange={() => onToVideo({ id: audio.id, start: audio.start })} />
          <span>{t('audioOnlyOn')}</span>
        </label>
        <p className="meta">{hint}</p>
      </div>
    );
  }

  return (
    <div className="audio-field">
      <p className="meta">{t('audioFile')}</p>
      <div className="toolbar">
        <button type="button" className="btn btn-small" aria-pressed={playing} onClick={preview}>
          {t('audioPreview')}
        </button>
      </div>
      <div className="pair">
        <NumberField label={t('audioStart')} value={audio.start} onChange={(start) => onChange({ ...audio, start })} />
        <NumberField label={t('audioDuration')} value={audio.duration} onChange={setDuration} />
      </div>
      <p className="meta">{hint}</p>
      <div className="toolbar">
        {picker('replaceAudio')}
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            stop();
            setError(null);
            onChange(undefined);
          }}
        >
          {t('removeAudio')}
        </button>
      </div>
      {errorLine}
    </div>
  );
}
