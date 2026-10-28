import { useEffect, useRef, useState } from 'react';
import type { ResumeLobby, ResumeOption } from '@quiz/shared';
import { resumeOptions } from '../api';
import { formatDate } from '../format';
import { t } from '../i18n';
import { fillFromGame, parsePoints, resumeOptionText, resumeRoundText, unmatchedIn, type ResumeDraft } from '../resume';

type Lookup =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'error' }
  | { status: 'pick'; options: ResumeOption[] }
  | { status: 'filled'; option: ResumeOption };

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
    onChange(fillFromGame(draftRef.current, info, option));
    setLookup({ status: 'filled', option });
  };

  // Подія toggle приходить і тоді, коли open змінив сам React: однаковий стан нічого не міняє.
  const toggle = (open: boolean) => {
    if (open !== draftRef.current.open) onChange({ ...draftRef.current, open });
  };

  const look = async () => {
    setLookup({ status: 'loading' });
    const result = await resumeOptions(code);
    if (!alive.current) return;
    if (!result.ok) setLookup({ status: 'error' });
    else if (result.data.length === 0) setLookup({ status: 'none' });
    else if (result.data.length === 1) fill(result.data[0]);
    else setLookup({ status: 'pick', options: result.data });
  };

  const round = Math.max(0, Math.min(draft.roundIndex, info.rounds.length - 1));
  const carried = info.participants.filter(({ id }) => {
    const value = parsePoints(draft.points[id] ?? '0');
    return value !== null && value !== 0;
  }).length;
  // Учасники лобі змінюються й після «Підставити»: список без пари рахується з поточних.
  const unmatched = lookup.status === 'filled' ? unmatchedIn(info, lookup.option) : [];

  return (
    <details className="panel resume-panel" open={draft.open} onToggle={(event) => toggle(event.currentTarget.open)}>
      <summary>{t('resumeTitle')}</summary>
      <p className="meta">{t('resumeHint')}</p>
      <div className="field">
        <label htmlFor="resume-round">{t('resumeRound')}</label>
        <select id="resume-round" value={round} onChange={(event) => onChange({ ...draft, roundIndex: Number(event.target.value) })}>
          {info.rounds.map((_, index) => (
            <option key={index} value={index}>
              {resumeRoundText(info, index)}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="btn resume-fill" disabled={lookup.status === 'loading'} onClick={() => void look()}>
        {t('resumeFill')}
      </button>
      {lookup.status === 'loading' && (
        <p className="meta" role="status">
          {t('resumeLoading')}
        </p>
      )}
      {lookup.status === 'none' && (
        <p className="meta" role="status">
          {t('resumeNone')}
        </p>
      )}
      {lookup.status === 'error' && (
        <p className="error" role="alert">
          {t('resumeError')}
        </p>
      )}
      {lookup.status === 'pick' && (
        <section className="resume-pick" aria-labelledby="resume-pick-title">
          <h3 id="resume-pick-title">{t('resumePick')}</h3>
          {lookup.options.map((option) => (
            <button key={option.gameId} type="button" className="btn" onClick={() => fill(option)}>
              {resumeOptionText(info, option, formatDate(option.startedAt))}
            </button>
          ))}
        </section>
      )}
      {lookup.status === 'filled' && (
        <>
          <p className="meta resume-filled" role="status">
            {t('resumeFilled', { date: formatDate(lookup.option.startedAt) })}
          </p>
          {unmatched.length > 0 && <p className="meta resume-unmatched">{t('resumeUnmatched', { names: unmatched.join(', ') })}</p>}
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
              {/* Текстове поле: «42 434» і «−500» розбирає parsePoints; числове поле браузера їх відкинуло б. */}
              <input
                id={id}
                type="text"
                autoComplete="off"
                aria-invalid={bad || undefined}
                aria-describedby={bad ? `${id}-error` : undefined}
                value={text}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => onChange({ ...draft, points: { ...draft.points, [participant.id]: event.target.value } })}
              />
              {bad && (
                <p id={`${id}-error`} className="error resume-invalid">
                  {t('resumeInvalid')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="meta resume-summary">{t('resumeSummary', { round: resumeRoundText(info, round), count: carried, total: info.participants.length })}</p>
      <p className="meta">{t('resumeLater')}</p>
    </details>
  );
}
