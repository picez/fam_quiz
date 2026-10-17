import { useRef, useState } from 'react';
import type { ClientToServerEvents, Grade, HostView } from '@quiz/shared';
import { answerText, correctText, num, questionClass, questionLabel, roundLabel, streaksOf } from '../format';
import { errorText, t, type TextKey } from '../i18n';
import type { Send } from '../live/types';
import { QuestionImage } from './QuestionImage';
import { Standings } from './Standings';

interface Props {
  view: HostView;
  code: string;
  stageUrl: string;
  joinUrl: string;
  send: Send;
}

type HostEvent = keyof ClientToServerEvents;

/** Єдина головна дія кожного етапу. */
const MAIN_ACTION: Partial<Record<HostView['phase'], { label: TextKey; event: HostEvent }>> = {
  lobby: { label: 'start', event: 'host:start' },
  intro: { label: 'startRound', event: 'host:next' },
  question: { label: 'lock', event: 'host:lock' },
  locked: { label: 'reveal', event: 'host:next' },
  reveal: { label: 'next', event: 'host:next' },
  leaderboard: { label: 'nextQuestion', event: 'host:next' },
  round_end: { label: 'nextRound', event: 'host:next' },
};

/** Етапи, на яких раунд ще триває й його можна завершити достроково. */
const IN_ROUND: HostView['phase'][] = ['intro', 'question', 'locked', 'reveal', 'leaderboard'];

export function HostScreen({ view, code, stageUrl, joinUrl, send }: Props) {
  const [error, setError] = useState<string | null>(null);
  const { phase, correct, round } = view;
  const inRound = round !== null && IN_ROUND.includes(phase);
  const lastRound = round !== null && round.index === round.total - 1;
  const live = phase !== 'lobby' && phase !== 'finished';
  const main = MAIN_ACTION[phase];
  const blitz = view.blitz;
  // У бліці оцінка остаточна: змінювати її на reveal не можна.
  const canGrade = phase === 'reveal' && correct?.type === 'text' && round?.type !== 'blitz';

  const act = async (event: HostEvent, payload?: unknown) => {
    const result = await send(event, payload);
    setError(result.ok ? null : errorText(result.error));
  };

  // Кроки гри йдуть по одному: подвійний дотик не має перескочити етап.
  const [stepping, setStepping] = useState(false);
  const steppingRef = useRef(false);
  const step = (event: HostEvent) => {
    if (steppingRef.current) return;
    const release = () => {
      steppingRef.current = false;
      setStepping(false);
    };
    steppingRef.current = true;
    setStepping(true);
    // Якщо підтвердження загубилося, кнопка не має лишитися заблокованою назавжди.
    const fallback = setTimeout(release, 3000);
    void act(event).finally(() => {
      clearTimeout(fallback);
      release();
    });
  };

  const endGame = () => {
    if (window.confirm(t('endConfirm'))) void act('host:end');
  };

  const endRound = () => {
    // В останньому раунді завершення раунду є завершенням гри.
    if (window.confirm(t(lastRound ? 'endConfirm' : 'endRoundConfirm'))) void act('host:end-round');
  };

  const judge = (playerId: string, correct: boolean) => void act('host:judge', { playerId, correct });

  const grade = (playerId: string, value: Grade) => void act('host:override', { playerId, grade: value });

  const kick = (playerId: string, name: string) => {
    if (window.confirm(t('kickConfirm', { name }))) void act('host:kick', { playerId });
  };

  return (
    <main className="app host">
      <header className="bar">
        <span>{t('hostTitle')}</span>
        <strong className="code">{`${code.slice(0, 3)} ${code.slice(3)}`}</strong>
      </header>

      {view.paused && (
        <p className="banner" role="status">
          {t('paused')}
        </p>
      )}

      <p className="meta">
        {t(`phase_${phase}`)}
        {round !== null && (phase === 'intro' || phase === 'round_end') && `, ${t('roundOf', { index: round.index + 1, total: round.total })}`}
        {view.questionIndex >= 0 && phase !== 'intro' && phase !== 'round_end' && `, ${questionLabel(round, view.questionIndex, view.total)}`}
        {phase === 'question' &&
          `, ${blitz === null ? t('answeredOf', { answered: view.answeredCount, total: view.playerCount }) : t('blitzQueued', { count: blitz.queue.length })}`}
      </p>

      {phase === 'intro' && round !== null && (
        <section className="panel">
          <p className="meta">{t('roundOf', { index: round.index + 1, total: round.total })}</p>
          <h1 className="question">{roundLabel(round.title, round.index, round.type)}</h1>
        </section>
      )}

      {view.question !== null && phase !== 'finished' && (
        <section className="panel">
          <h1 className={questionClass(view.question.text)}>{view.question.text}</h1>
          <QuestionImage url={view.question.imageUrl} />
          {correct !== null && <p className="answer">{t('correctAnswer', { answer: correctText(correct, view.question.choices) })}</p>}
        </section>
      )}

      {view.question !== null && live && blitz !== null && (
        <>
          {/* Після закриття запитання черги вже немає: лишаються тільки спроби. */}
          {phase === 'question' && (
            <section className="panel">
              <h2>{t('blitzQueue')}</h2>
              {blitz.queue.length === 0 ? (
                <p className="meta">{t('noResponses')}</p>
              ) : (
                <ul className="rows">
                  {blitz.queue.map((entry, index) => (
                    <li key={entry.playerId}>
                      <span className="name">{entry.nickname}</span>
                      <span className="given">{entry.answer === null ? t('blitzTyping') : answerText(entry.answer, correct)}</span>
                      {blitz.manual && index === 0 && entry.answer !== null && (
                        <>
                          <button type="button" className="btn btn-small" onClick={() => judge(entry.playerId, true)}>
                            {t('judgeCorrect')}
                          </button>
                          <button type="button" className="btn btn-small" onClick={() => judge(entry.playerId, false)}>
                            {t('judgeWrong')}
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {blitz.attempts.length > 0 && (
            <section className="panel">
              <h2>{t('blitzAttemptsTitle')}</h2>
              <ul className="rows">
                {blitz.attempts.map((attempt, index) => (
                  <li key={`${attempt.playerId}-${index}`}>
                    <span className="name">{attempt.nickname}</span>
                    <span className="given">{attempt.answer === null ? t('blitzMissed') : answerText(attempt.answer, correct)}</span>
                    <span className={attempt.grade === 'wrong' ? 'tag is-wrong' : 'tag is-correct'}>
                      {t(attempt.grade === 'correct' ? 'accepted' : 'rejected')}
                    </span>
                    <span className="score">{num(attempt.points)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {view.question !== null && live && blitz === null && (
        <section className="panel">
          <h2>{t('responses')}</h2>
          {view.responses.length === 0 ? (
            <p className="meta">{t('noResponses')}</p>
          ) : (
            <ul className="rows">
              {view.responses.map((response) => (
                <li key={response.playerId}>
                  <span className="name">{response.nickname}</span>
                  <span className="given">{answerText(response.answer, correct)}</span>
                  <span className={response.grade === 'wrong' ? 'tag is-wrong' : 'tag is-correct'}>
                    {t(response.grade === 'partial' ? 'partialTag' : response.accepted ? 'accepted' : 'rejected')}
                    {response.overridden && `, ${t('changedByHost')}`}
                  </span>
                  <span className="score">{num(response.points)}</span>
                  {response.streakBonus > 0 && <span className="streak-bonus">{t('streakBonusLine', { points: response.streakBonus })}</span>}
                  {canGrade && (
                    <>
                      {response.grade !== 'correct' && (
                        <button type="button" className="btn btn-small" onClick={() => grade(response.playerId, 'correct')}>
                          {t('accept')}
                        </button>
                      )}
                      {round?.partial === true && response.grade !== 'partial' && (
                        <button type="button" className="btn btn-small" onClick={() => grade(response.playerId, 'partial')}>
                          {t('gradePartial')}
                        </button>
                      )}
                      {response.grade !== 'wrong' && (
                        <button type="button" className="btn btn-small" onClick={() => grade(response.playerId, 'wrong')}>
                          {t('reject')}
                        </button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {phase === 'round_end' && round !== null && (
        <section className="panel">
          <h2>{t('roundResults', { index: round.index + 1 })}</h2>
          <Standings standings={view.standings} streaks={streaksOf(view.players)} />
        </section>
      )}

      {phase === 'finished' ? (
        <section className="panel">
          <h2>{t('gameOver')}</h2>
          <Standings standings={view.standings} />
        </section>
      ) : (
        <section className="panel">
          <h2>{`${t('players')}: ${view.players.length}`}</h2>
          <ul className="rows">
            {view.players.map((player) => (
              <li key={player.id}>
                <span className="name">{player.nickname}</span>
                {!player.connected && <span className="tag is-wrong">{t('disconnected')}</span>}
                {player.streak >= 2 && <span className="streak">{t('streakMark', { count: player.streak })}</span>}
                <span className="score">{num(player.score)}</span>
                <button type="button" className="btn btn-small" onClick={() => kick(player.id, player.nickname)}>
                  {t('kick')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="links">
        <a href={stageUrl} target="_blank" rel="noreferrer">
          {t('stageLink')}
        </a>
        <span className="meta">{`${t('joinLink')}: ${joinUrl}`}</span>
      </nav>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <footer className="actions">
        {live && (
          <>
            {inRound && !lastRound && (
              <button type="button" className="btn btn-danger" onClick={endRound}>
                {t('endRound')}
              </button>
            )}
            <button type="button" className="btn btn-danger" onClick={inRound && lastRound ? endRound : endGame}>
              {t('end')}
            </button>
            <button
              type="button"
              className={view.paused ? 'btn btn-primary' : 'btn'}
              disabled={stepping}
              onClick={() => step(view.paused ? 'host:resume' : 'host:pause')}
            >
              {t(view.paused ? 'resume' : 'pause')}
            </button>
          </>
        )}
        {main !== undefined && !view.paused && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={stepping || (phase === 'lobby' && view.players.length === 0)}
            onClick={() => step(main.event)}
          >
            {t(main.label)}
          </button>
        )}
      </footer>
    </main>
  );
}
