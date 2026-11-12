import { AUDIO_LIMITS, AUDIO_URL, LIMITS, MELODY_STEPS, YOUTUBE_ID, parseYouTubeLink, videoLink, type MelodyTrack, type Question } from '@quiz/shared';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { uploadAudio } from '../api';
import { errorText, t } from '../i18n';
import { useMelodyClip } from '../live/useMelodyClip';
import { ACCEPT, fileSeconds, isAllowed } from './AudioField';
import type { MelodyQuestion } from './draft';
import { NumberField, Rows } from './QuestionEditor';

export type { MelodyQuestion } from './draft';

/** Трек, який уже можна слухати: файл із завантаженою адресою чи відео з ідентифікатором. */
const playable = (track: MelodyTrack) => (track.source === 'file' ? AUDIO_URL.test(track.url) : YOUTUBE_ID.test(track.id));

/**
 * «Мелодія за нотами» в редакторі (29e): «Файл / YouTube», секунда початку, прослуховування шматків 1, 2, 4, 8 і 16 с
 * (так, як їх почують гравці) і прийнятні написання назви.
 */
export function MelodyEditor({ question, onChange }: { question: MelodyQuestion; onChange: (q: Question) => void }) {
  const latest = useRef({ question, onChange });
  latest.current = { question, onChange };
  const { track } = question;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Тривалість щойно завантаженого файла: застерігає, що останні шматки обріжуться. Для вже збереженого файла невідома.
  const [fileLength, setFileLength] = useState<number | null>(null);
  const [link, setLink] = useState(() => (track.source === 'youtube' && YOUTUBE_ID.test(track.id) ? videoLink({ id: track.id, start: track.start }) : ''));
  const [badLink, setBadLink] = useState(false);
  const lastFile = useRef('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const ready = playable(track);
  // Порожній трек грати нічим: хук тримає безпечний, але його рамка чи <audio> не малюються.
  const clip = useMelodyClip(track, { paused: false, live: true });

  const setTrack = (next: MelodyTrack) => onChange({ ...question, track: next });

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Той самий файл можна вибрати ще раз після помилки.
    event.target.value = '';
    if (file === undefined) return;
    if (!isAllowed(file)) return setError(errorText('bad_audio'));
    if (file.size > AUDIO_LIMITS.maxBytes) return setError(errorText('audio_too_large'));
    setError(null);
    setBusy(true);
    clip.stop();
    const [result, seconds] = await Promise.all([uploadAudio(file), fileSeconds(file)]);
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) return setError(errorText(result.error));
    const { question: current, onChange: emit } = latest.current;
    // Поки файл вантажився, ведучий міг перемкнути джерело на YouTube: тоді файл відкидається.
    if (current.track.source !== 'file') return;
    setFileLength(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    emit({ ...current, track: { source: 'file', url: result.url, start: current.track.start } });
  };

  const source = (next: 'file' | 'youtube') => {
    if (next === track.source) return;
    clip.stop();
    setError(null);
    setBadLink(false);
    setFileLength(null);
    // Залитий файл не губиться, якщо ведучий заглянув у YouTube й повернувся.
    if (track.source === 'file' && track.url !== '') lastFile.current = track.url;
    setTrack(next === 'file' ? { source: 'file', url: lastFile.current, start: track.start } : { source: 'youtube', id: '', start: track.start });
    if (next === 'file') setLink('');
  };

  const changeLink = (value: string) => {
    setLink(value);
    const parsed = parseYouTubeLink(value);
    if (parsed === null) {
      setBadLink(value.trim() !== '');
      // Стерте посилання не лишає старого відео в треку.
      if (value.trim() === '' && track.source === 'youtube' && track.id !== '') {
        clip.stop();
        setTrack({ source: 'youtube', id: '', start: track.start });
      }
      return;
    }
    setBadLink(false);
    clip.stop();
    setTrack({ source: 'youtube', id: parsed.id, start: parsed.start });
  };

  const rows = question.accepted.map((text, index) => ({ id: String(index), text }));
  const need = track.start + MELODY_STEPS[MELODY_STEPS.length - 1];
  const shortFile = track.source === 'file' && fileLength !== null && Number.isFinite(track.start) && fileLength < need;

  return (
    <div className="melody-editor">
      <div className="melody-source" role="group" aria-label={t('melodySourceLabel')}>
        <button type="button" className={track.source === 'file' ? 'btn btn-small is-active' : 'btn btn-small'} aria-pressed={track.source === 'file'} onClick={() => source('file')}>
          {t('melodySourceFile')}
        </button>
        <button type="button" className={track.source === 'youtube' ? 'btn btn-small is-active' : 'btn btn-small'} aria-pressed={track.source === 'youtube'} onClick={() => source('youtube')}>
          {t('melodySourceYoutube')}
        </button>
      </div>

      {track.source === 'file' ? (
        <div className="melody-file">
          <label className={busy ? 'btn btn-small file-pick is-busy' : 'btn btn-small file-pick'}>
            <span>{t(busy ? 'uploading' : ready ? 'replaceAudio' : 'addAudio')}</span>
            <input type="file" accept={ACCEPT} disabled={busy} onChange={pick} />
          </label>
          {ready && <p className="meta">{t('audioFile')}</p>}
        </div>
      ) : (
        <label className="field melody-link">
          <span>{t('melodyLinkLabel')}</span>
          <input value={link} placeholder={t('melodyLinkPlaceholder')} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => changeLink(event.target.value)} />
          {badLink && <small className="error">{t('melodyBadLink')}</small>}
        </label>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <NumberField label={t('melodyStart')} value={track.start} onChange={(start) => setTrack({ ...track, start })} />
      {shortFile && (
        <p className="meta melody-short" role="status">
          {t('melodyShortFile', { need })}
        </p>
      )}

      {ready && clip.element}
      <div className="melody-previews" role="group" aria-label={t('audioPreview')}>
        {MELODY_STEPS.map((seconds) => (
          <button
            type="button"
            key={seconds}
            className={clip.playing === seconds ? 'btn btn-small is-active' : 'btn btn-small'}
            aria-pressed={clip.playing === seconds}
            disabled={!ready}
            // Дотик і є жестом для звуку: play() викликається тут же, без ефектів.
            onClick={() => (clip.playing === seconds ? clip.stop() : clip.play(seconds))}
          >
            {t('melodyPreview', { seconds })}
          </button>
        ))}
      </div>
      {clip.state === 'blocked' && (
        <p className="meta" role="status">
          {t('melodyBlocked')}
        </p>
      )}
      {clip.state === 'failed' && (
        <p className="error" role="status">
          {t('melodyFailed')}
        </p>
      )}

      <Rows
        rows={rows}
        min={1}
        max={LIMITS.maxAccepted}
        maxLength={LIMITS.answerText}
        label="spellingN"
        removeLabel="removeSpelling"
        addLabel="addSpelling"
        rowClass={() => 'is-correct'}
        makeRow={() => ({ id: String(rows.length), text: '' })}
        onChange={(next) => onChange({ ...question, accepted: next.map((row) => row.text) })}
      />
      <p className="meta">{t('melodyAcceptedHint')}</p>
    </div>
  );
}
