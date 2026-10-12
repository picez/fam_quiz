import { useState } from 'react';
import type { ClientToServerEvents, HostView } from '@quiz/shared';
import { answerText, correctText } from '../format';
import { errorText, t, type TextKey } from '../i18n';
import type { Send } from '../live/types';
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
  question: { label: 'lock', event: 'host:lock' },
  locked: { label: 'reveal', event: 'host:next' },
  reveal: { label: 'next', event: 'host:next' },
  leaderboard: { label: 'nextQuestion', event: 'host:next' },
};

export function HostScreen({ view, code, stageUrl, joinUrl, send }: Props) {
  const [error, setError] = useState<string | null>(null);
  const { phase, correct } = view;
  const live = phase !== 'lobby' && phase !== 'finished';
  const main = MAIN_ACTION[phase];
  const canGrade = phase === 'reveal' && correct?.type === 'text';

  const act = async (event: HostEvent, payload?: unknown) => {
    const result = await send(event, payload);
    setError(result.ok ? null : errorText(result.error));
  };

  const endGame = () => {
    if (window.confirm(t('endConfirm'))) void act('host:end');
  };

  return (
    <main className="app host">
      <header className="bar">
        <span>{t('hostTitle')}</span>
        <strong className="code">{`${code.slice(0, 3)} ${code.slice(3)}`}</strong>
      </header>

      <p className="meta">
        {t(`phase_${phase}`)}
        {view.questionIndex >= 0 && `, ${t('questionOf', { index: view.questionIndex + 1, total: view.total })}`}
        {phase === 'question' && `, ${t('answeredOf', { answered: view.answeredCount, total: view.playerCount })}`}
      </p>

      {view.question !== null && phase !== 'finished' && (
        <section className="panel">
          <h1 className="question">{view.question.text}</h1>
          {correct !== null && <p className="answer">{t('correctAnswer', { answer: correctText(correct) })}</p>}
        </section>
      )}

      {view.question !== null && live && (
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
                  <span className={response.accepted ? 'tag is-correct' : 'tag is-wrong'}>
                    {t(response.accepted ? 'accepted' : 'rejected')}
                    {response.overridden && `, ${t('changedByHost')}`}
                  </span>
                  <span className="score">{response.points}</span>
                  {canGrade && (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => act('host:override', { playerId: response.playerId, accepted: !response.accepted })}
                    >
                      {t(response.accepted ? 'reject' : 'accept')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
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
                <span className="score">{player.score}</span>
                <button type="button" className="btn btn-small" onClick={() => act('host:kick', { playerId: player.id })}>
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
            <button type="button" className="btn" onClick={() => act(view.paused ? 'host:resume' : 'host:pause')}>
              {t(view.paused ? 'resume' : 'pause')}
            </button>
            <button type="button" className="btn btn-danger" onClick={endGame}>
              {t('end')}
            </button>
          </>
        )}
        {main !== undefined && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={phase === 'lobby' && view.players.length === 0}
            onClick={() => act(main.event)}
          >
            {t(main.label)}
          </button>
        )}
      </footer>
    </main>
  );
}
