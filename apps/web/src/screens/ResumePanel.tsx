import { useEffect, useRef, useState } from 'react';
import { RESUME_POINTS_MAX, type ResumeLobby, type ResumeOption } from '@quiz/shared';
import { resumeOptions } from '../api';
import { formatDate } from '../format';
import { t } from '../i18n';
import { fillFromGame, parsePoints, resumeRoundText, type ResumeDraft } from '../resume';

type Lookup =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'pick'; options: ResumeOption[] }
  | { status: 'filled'; startedAt: string; unmatched: string[] };

/** «Продовжити попередню гру» (12r) у лобі ведучого й автора автопілота: стартовий раунд і перенесені бали; значення живуть лише на цьому пристрої до «Почати гру». */
export function ResumePanel({ code, info, draft, onChange }: { code: string; info: ResumeLobby; draft: ResumeDraft; onChange: (draft: ResumeDraft) => void }) {
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' });
  // Свіжий draft для відповіді, що прийшла після правок у полях.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fill = (option: ResumeOption) => {
    const filled = fillFromGame(draftRef.current, info, option);
    onChange(filled.draft);
    setLookup({ status: 'filled', startedAt: option.startedAt, unmatched: filled.unmatched });
  };

  // Подія toggle приходить і тоді, коли open змінив сам React: однаковий стан нічого не міняє.
  const toggle = (open: boolean) => {
    if (open !== draftRef.current.open) onChange({ ...draftRef.current, open });
  };

  const look = async () => {
    setLookup({ status: 'loading' });
    const result = await resumeOptions(code);
    if (!alive.current) return;
    if (!result.ok || result.data.length === 0) setLookup({ status: 'none' });
    else if (result.data.length === 1) fill(result.data[0]);
    else setLookup({ status: 'pick', options: result.data });
  };

  const round = Math.max(0, Math.min(draft.roundIndex, info.rounds.length - 1));
  const carried = info.participants.filter(({ id }) => {
    const value = parsePoints(draft.points[id] ?? '0');
    return value !== null && value !== 0;
  }).length;

  return (
    <details className="panel resume-panel" open={draft.open} onToggle={(event) => toggle(event.currentTarget.open)}>
      <summary>{t('resumeTitle')}</summary>
      <p className="meta">{t('resumeHint')}</p>
      <label className="field">
        {t('resumeRound')}
        <select value={round} onChange={(event) => onChange({ ...draft, roundIndex: Number(event.target.value) })}>
          {info.rounds.map((_, index) => (
            <option key={index} value={index}>
              {resumeRoundText(info, index)}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn resume-fill" disabled={lookup.status === 'loading'} onClick={() => void look()}>
        {t('resumeFill')}
      </button>
      {lookup.status === 'loading' && <p className="meta">{t('resumeLoading')}</p>}
      {lookup.status === 'none' && <p className="meta">{t('resumeNone')}</p>}
      {lookup.status === 'pick' && (
        <section className="resume-pick" aria-labelledby="resume-pick-title">
          <h3 id="resume-pick-title">{t('resumePick')}</h3>
          {lookup.options.map((option) => (
            <button key={option.gameId} type="button" className="btn" onClick={() => fill(option)}>
              {t('resumeOption', {
                date: formatDate(option.startedAt),
                played: option.questionsPlayed,
                total: option.questionCount,
                round: resumeRoundText(info, Math.max(0, Math.min(option.roundIndex, info.rounds.length - 1))),
              })}
            </button>
          ))}
        </section>
      )}
      {lookup.status === 'filled' && (
        <>
          <p className="meta resume-filled">{t('resumeFilled', { date: formatDate(lookup.startedAt) })}</p>
          {lookup.unmatched.length > 0 && <p className="meta resume-unmatched">{t('resumeUnmatched', { names: lookup.unmatched.join(', ') })}</p>}
        </>
      )}
      <ul className="resume-points">
        {info.participants.map((participant) => {
          const text = draft.points[participant.id] ?? '0';
          const bad = parsePoints(text) === null;
          const id = `resume-points-${participant.id}`;
          return (
            <li key={participant.id}>
              <label htmlFor={id} className="resume-name">
                {participant.nickname}
              </label>
              <input
                id={id}
                type="number"
                step="1"
                min={-RESUME_POINTS_MAX}
                max={RESUME_POINTS_MAX}
                aria-label={participant.nickname}
                aria-invalid={bad || undefined}
                value={text}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => onChange({ ...draft, points: { ...draft.points, [participant.id]: event.target.value } })}
              />
              {bad && <p className="error resume-invalid">{t('resumeInvalid')}</p>}
            </li>
          );
        })}
      </ul>
      <p className="meta resume-summary">{t('resumeSummary', { round: resumeRoundText(info, round), count: carried, total: info.participants.length })}</p>
      <p className="meta">{t('resumeLater')}</p>
    </details>
  );
}
