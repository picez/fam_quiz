import { LIMITS, SNIPPET_STEPS, YOUTUBE_ID, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { useVideoClip } from '../live/useVideoClip';
import type { VideoclipQuestion } from './draft';
import { NumberField, Rows } from './QuestionEditor';
import { VideoField } from './VideoField';

export type { VideoclipQuestion } from './draft';

/**
 * «Відео за фрагментами» в редакторі (36): посилання YouTube (t= стає секундою початку), «З якої секунди», «Без звуку / Зі звуком»,
 * перегляд шматків 1, 2, 4, 8 і 16 с так, як їх побачать гравці, і прийнятні написання відповіді.
 */
export function VideoclipEditor({ question, onChange }: { question: VideoclipQuestion; onChange: (q: Question) => void }) {
  const { clip: video, muted } = question;
  const ready = YOUTUBE_ID.test(video.id);
  // Порожнє посилання грати нічим: хук тримає безпечний стан, але рамка не малюється.
  const clip = useVideoClip(video, { muted, paused: false, live: true });

  const rows = question.accepted.map((text, index) => ({ id: String(index), text }));
  const need = video.start + SNIPPET_STEPS[SNIPPET_STEPS.length - 1];
  const shortVideo = ready && clip.duration !== null && Number.isFinite(video.start) && clip.duration < need;

  const sound = (next: boolean) => {
    if (next === muted) return;
    clip.stop();
    onChange({ ...question, muted: next });
  };

  return (
    <div className="melody-editor videoclip-editor">
      <VideoField
        video={ready ? video : null}
        preview={false}
        onChange={(parsed) => {
          clip.stop();
          // Неправильне чи стерте посилання не лишає старого відео; секунда початку лишається.
          onChange({ ...question, clip: parsed === null ? { id: '', start: video.start } : { id: parsed.id, start: parsed.start } });
        }}
      />

      <NumberField label={t('videoclipStart')} value={video.start} onChange={(start) => onChange({ ...question, clip: { ...video, start } })} />

      <div className="melody-source" role="group" aria-label={t('videoclipSoundLabel')}>
        <button type="button" className={muted ? 'btn btn-small is-active' : 'btn btn-small'} aria-pressed={muted} onClick={() => sound(true)}>
          {t('videoclipMuted')}
        </button>
        <button type="button" className={muted ? 'btn btn-small' : 'btn btn-small is-active'} aria-pressed={!muted} onClick={() => sound(false)}>
          {t('videoclipSound')}
        </button>
      </div>
      <p className="meta">{t('videoclipSoundHint')}</p>

      {ready && clip.element}
      {shortVideo && (
        <p className="meta melody-short" role="status">
          {t('videoclipShortVideo', { need })}
        </p>
      )}
      <div className="melody-previews" role="group" aria-label={t('audioPreview')}>
        {SNIPPET_STEPS.map((seconds) => (
          <button
            type="button"
            key={seconds}
            className={clip.playing === seconds ? 'btn btn-small is-active' : 'btn btn-small'}
            aria-pressed={clip.playing === seconds}
            disabled={!ready}
            // Дотик і є жестом для відтворення: play() викликається тут же, без ефектів.
            onClick={() => (clip.playing === seconds ? clip.stop() : clip.play(seconds))}
          >
            {t('videoclipPreview', { seconds })}
          </button>
        ))}
      </div>
      {clip.state === 'blocked' && (
        <p className="meta" role="status">
          {t('videoclipBlocked')}
        </p>
      )}
      {clip.state === 'failed' && (
        <p className="error" role="status">
          {t('videoclipFailed')}
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
      <p className="meta">{t('videoclipAcceptedHint')}</p>
    </div>
  );
}
