import type { JSX, ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { awaySeconds, type GameReplay, type ReplayEvent, type ReplayRow, type ReplayScore, type ReplayStep } from '@quiz/shared';
import { answerText, correctText, num, questionName } from '../format';
import { t } from '../i18n';
import { nickText } from '../nick';
import { adminGameReplay } from './admin-api';
import { eventLine, priceText, replayTime, verdictText } from './replay-text';
import { useAdminData } from './useAdminData';

/** Номер кроку з адреси (?q= від 1); неправильний — перший. */
function stepFrom(value: string | null, total: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= total ? n - 1 : 0;
}

/** Кроки підряд одного раунду — одна група списку переходу. */
function groupsOf(steps: ReplayStep[]): ReplayStep[][] {
  const groups: ReplayStep[][] = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last[0]!.roundIndex === step.roundIndex) last.push(step);
    else groups.push([step]);
  }
  return groups;
}

function Events({ events }: { events: ReplayEvent[] }): JSX.Element {
  if (events.length === 0) return <p className="meta">{t('adminReplayNoEvents')}</p>;
  return (
    <ul className="replay-events">
      {events.map((event, index) => (
        <li key={index} dir="auto">
          {eventLine(event)}
        </li>
      ))}
    </ul>
  );
}

/** Клітинка рядка: на телефоні підпис поля видно, ширше — він лише для читача екрана (заголовки колонок над списком). */
function Cell({ name, label, children }: { name: string; label: string; children: ReactNode }): JSX.Element {
  return (
    <span className={`replay-cell replay-${name}`}>
      <span className="replay-label">{label}</span>
      <span className="replay-value">{children}</span>
    </span>
  );
}

const COLUMNS = [
  ['player', 'adminReplayPlayer'],
  ['answer', 'adminReplayAnswer'],
  ['time', 'adminReplayTime'],
  ['verdict', 'adminReplayVerdict'],
  ['points', 'adminReplayPoints'],
  ['score', 'adminReplayScore'],
] as const;

function Row({ row, step }: { row: ReplayRow; step: ReplayStep }): JSX.Element {
  const score = step.scores.find((one) => one.nickname === row.nickname);
  const label = (index: number) => t(COLUMNS[index]![1]);
  return (
    <li className="replay-row">
      <Cell name="player" label={label(0)}>
        <span dir="auto">{nickText(row.nickname)}</span>
        {row.answeredBy !== null && (
          <small className="meta" dir="auto">
            {t('adminReplayBy', { name: nickText(row.answeredBy) })}
          </small>
        )}
      </Cell>
      <Cell name="answer" label={label(1)}>
        <span dir="auto">{answerText(row.answer, row.spare ?? step.question)}</span>
        {row.awayMs !== null && <small className="meta history-away">{t('historyAway', { seconds: awaySeconds(row.awayMs) })}</small>}
      </Cell>
      <Cell name="time" label={label(2)}>
        <span dir="ltr">{replayTime(row.timeMs)}</span>
      </Cell>
      <Cell name="verdict" label={label(3)}>
        {verdictText(row.verdict, row.manual)}
      </Cell>
      <Cell name="points" label={label(4)}>
        <span dir="ltr">{num(row.points)}</span>
      </Cell>
      <Cell name="score" label={label(5)}>
        <span dir="ltr">{score === undefined ? '—' : num(score.score)}</span>
      </Cell>
    </li>
  );
}

function Scores({ scores }: { scores: ReplayScore[] }): JSX.Element {
  return (
    <ul className="admin-card-lines">
      {scores.map((score) => (
        <li key={score.nickname}>
          <span dir="auto">{nickText(score.nickname)}</span>
          <span className="score" dir="ltr">
            {num(score.score)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StepCard({ step }: { step: ReplayStep }): JSX.Element {
  const question = step.question;
  const correct = question === null ? '' : correctText(question);
  return (
    <section className="panel admin-card-section replay-step">
      <h3 dir="auto">{question === null ? '—' : questionName(question)}</h3>
      <p className="meta">
        {question !== null && <span>{t(`type_${question.type}`)}</span>}
        {question !== null && ' · '}
        <span>{priceText(step.price, step.multiplier)}</span>
      </p>
      {correct !== '' && <p dir="auto">{t('correctAnswer', { answer: correct })}</p>}
      <div className="replay-head" aria-hidden="true">
        {COLUMNS.map(([name, key]) => (
          <span key={name}>{t(key)}</span>
        ))}
      </div>
      <ol className="replay-rows">
        {step.rows.map((row, index) => (
          <Row key={index} row={row} step={step} />
        ))}
      </ol>
      <h3>{t('adminReplayEvents')}</h3>
      <Events events={step.events} />
    </section>
  );
}

function ReplayView({ replay }: { replay: GameReplay }): JSX.Element {
  const [search, setSearch] = useSearchParams();
  const total = replay.steps.length;
  const at = stepFrom(search.get('q'), total);
  const go = (index: number) => setSearch({ q: String(index + 1) }, { replace: true });
  const step = replay.steps[at];
  const showStart = replay.start.events.length > 0 || replay.start.scores.some((score) => score.score !== 0);
  return (
    <>
      <h2 className="brand" dir="auto">
        {t('adminReplayTitle', { title: replay.title })}
      </h2>
      {!replay.recorded && <p className="meta replay-note">{t('adminReplayNotRecorded')}</p>}
      {showStart && (
        <section className="panel admin-card-section">
          <h3>{t('adminReplayStart')}</h3>
          <Scores scores={replay.start.scores} />
          <Events events={replay.start.events} />
        </section>
      )}
      {step !== undefined && (
        <>
          <nav className="replay-nav" aria-label={t('adminReplayJump')}>
            <label className="field">
              <span>{t('adminReplayJump')}</span>
              <select value={String(at)} onChange={(event) => go(Number(event.target.value))}>
                {groupsOf(replay.steps).map((group) => (
                  <optgroup key={group[0]!.index} label={t('adminReplayRound', { n: group[0]!.roundIndex + 1, title: replay.rounds[group[0]!.roundIndex]?.title ?? '' })}>
                    {group.map((one) => {
                      const n = replay.steps.indexOf(one);
                      return (
                        <option key={n} value={String(n)}>
                          {one.question === null ? String(n + 1) : `${n + 1}. ${questionName(one.question)}`}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="replay-nav-buttons">
              <button type="button" className="btn" disabled={at === 0} onClick={() => go(at - 1)}>
                {t('adminReplayPrev')}
              </button>
              <span className="meta" role="status">
                {t('adminReplayStep', { n: at + 1, total })}
              </span>
              <button type="button" className="btn" disabled={at === total - 1} onClick={() => go(at + 1)}>
                {t('adminReplayNext')}
              </button>
            </div>
          </nav>
          <StepCard step={step} />
        </>
      )}
    </>
  );
}

/** 65: повтор гри по кроках для адміністратора; крок — у ?q= (від 1). */
export function AdminReplay(): JSX.Element {
  const { id = '' } = useParams();
  const state = useAdminData(() => adminGameReplay(id), id);
  if (state.status === 'home') return <Navigate to="/" replace />;
  const back = (
    <header className="bar">
      <Link className="quiet-link" to={`/admin/games/${encodeURIComponent(id)}`}>
        {t('adminReplayBackToGame')}
      </Link>
    </header>
  );
  if (state.status === 'loading') return <p className="meta">{t('loading')}</p>;
  return (
    <div className="admin-replay">
      {back}
      {state.status === 'error' ? (
        <>
          <p className="error" role="alert">
            {state.message}
          </p>
          <button type="button" className="btn" onClick={state.reload}>
            {t('prizesRetry')}
          </button>
        </>
      ) : (
        <ReplayView replay={state.data} />
      )}
    </div>
  );
}
