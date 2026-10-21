import { useEffect, useRef, useState } from 'react';
import type { ClientToServerEvents, Grade, HostBoard, HostView } from '@quiz/shared';
import { secondsLeft } from '../clock';
import { answerText, correctText, markText, num, questionClass, questionLabel, roundLabel, streaksOf } from '../format';
import { errorText, t, type TextKey } from '../i18n';
import type { Send } from '../live/types';
import { Board } from './Board';
import { QuestionImage } from './QuestionImage';
import { Standings } from './Standings';

interface Props {
  view: HostView;
  code: string;
  stageUrl: string;
  joinUrl: string;
  send: Send;
  /** Різниця «час сервера мінус час пристрою» для відліку до пропуску ходу. */
  offsetMs?: number;
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
const IN_ROUND: HostView['phase'][] = ['intro', 'board', 'question', 'locked', 'reveal', 'leaderboard'];

/** Відлік до автоматичного пропуску ходу відсутнього гравця. */
function SkipNote({ board, view, offsetMs }: { board: HostBoard; view: HostView; offsetMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  const running = board.skipAt !== null;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running, board.skipAt]);

  const chooser = board.turn === null ? undefined : view.players.find((player) => player.id === board.turn?.playerId);
  if (chooser === undefined || chooser.connected) return null;
  const name = chooser.nickname;
  if (board.skipAt !== null) {
    const seconds = secondsLeft({ endsAt: board.skipAt, remainingMs: null }, offsetMs, now) ?? 0;
    return <p className="banner is-away">{t('chooserAwaySkip', { name, seconds })}</p>;
  }
  return view.paused ? <p className="banner is-away">{t('chooserAwayPaused', { name })}</p> : null;
}

export function HostScreen({ view, code, stageUrl, joinUrl, send, offsetMs = 0 }: Props) {
  const [error, setError] = useState<string | null>(null);
  const { phase, correct, round } = view;
  const inRound = round !== null && IN_ROUND.includes(phase);
  const lastRound = round !== null && round.index === round.total - 1;
  const live = phase !== 'lobby' && phase !== 'finished';
  const main = MAIN_ACTION[phase];
  const blitz = view.blitz;
  const board = view.board;
  const chooserId = board?.turn?.playerId ?? null;
  // У полі оцінка йде одразу після відповіді вибравшого: у запитанні лише коли ведучий оцінює вручну.
  const canGradeBoard =
    board !== null &&
    view.question !== null &&
    chooserId !== null &&
    ((phase === 'question' && board.manual && board.answerMode === 'voice') || phase === 'locked' || phase === 'reveal');
  // Відповідь з телефона, що чекає на рішення ведучого (помаранчева).
  const pending = phase === 'question' && view.spotlight !== null && view.spotlight.grade === null ? view.spotlight : null;
  const manualPending = pending !== null && ((board !== null && board.manual) || (blitz !== null && blitz.manual));
  const secondsNow = phase === 'question' ? secondsLeft(view, offsetMs, Date.now()) : null;
  const timeShown = phase === 'question' && (view.endsAt !== null || view.remainingMs !== null);
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

  const adjust = (seconds: number) => void act('host:time', { seconds });

  const grade = (playerId: string, value: Grade) => void act('host:override', { playerId, grade: value });

  // Порядок кола: позиції міняються місцями, ведучий бачить результат одразу.
  // Поки відповідь не прийшла, кнопки вимкнені: інакше другий дотик піде зі старого порядку.
  const [ordering, setOrdering] = useState(false);
  const orderingRef = useRef(false);
  const reorder = (event: HostEvent, payload?: unknown) => {
    if (orderingRef.current) return;
    const release = () => {
      orderingRef.current = false;
      setOrdering(false);
    };
    orderingRef.current = true;
    setOrdering(true);
    const fallback = setTimeout(release, 3000);
    void act(event, payload).finally(() => {
      clearTimeout(fallback);
      release();
    });
  };
  const move = (from: number, to: number) => {
    if (board === null) return;
    const ids = board.order.map((entry) => entry.playerId);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    reorder('host:order', { playerIds: ids });
  };

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
        {view.questionIndex >= 0 && phase !== 'intro' && phase !== 'round_end' && phase !== 'board' && `, ${questionLabel(round, view.questionIndex, view.total)}`}
        {phase === 'question' && board === null &&
          `, ${blitz === null ? t('answeredOf', { answered: view.answeredCount, total: view.playerCount }) : t('blitzQueued', { count: blitz.queue.length })}`}
      </p>

      {phase === 'intro' && round !== null && (
        <section className="panel">
          <p className="meta">{t('roundOf', { index: round.index + 1, total: round.total })}</p>
          <h1 className="question">{roundLabel(round.title, round.index, round.type)}</h1>
        </section>
      )}

      {phase === 'intro' && board !== null && (
        <section className="panel">
          <h2>{t('boardOrder')}</h2>
          <ol className="rows">
            {board.order.map((entry, index) => (
              <li key={entry.playerId}>
                <span className="rank">{index + 1}</span>
                <span className="name">{entry.nickname}</span>
                <button
                  type="button"
                  className="btn btn-small btn-icon"
                  aria-label={t('turnUp', { name: entry.nickname })}
                  disabled={ordering || index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-icon"
                  aria-label={t('turnDown', { name: entry.nickname })}
                  disabled={ordering || index === board.order.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
          <div className="actions">
            <button type="button" className="btn" disabled={ordering} onClick={() => reorder('host:roll')}>
              {t('rollDice')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={ordering}
              onClick={() => reorder('host:order', { playerIds: view.players.map((player) => player.id) })}
            >
              {t('orderByJoin')}
            </button>
          </div>
        </section>
      )}

      {phase === 'board' && board !== null && (
        <section className="panel">
          {board.turn !== null && <p className="lead">{t('boardChooser', { name: board.turn.nickname })}</p>}
          <SkipNote board={board} view={view} offsetMs={offsetMs} />
          <Board board={board} onPick={(cellId) => void act('host:pick', { cellId })} />
          <div className="panel-actions">
            <button type="button" className="btn" onClick={() => void act('host:skip')}>
              {t('skipTurn')}
            </button>
          </div>
        </section>
      )}

      {view.question !== null && phase !== 'finished' && (
        <section className="panel">
          {board !== null && board.cell !== null && (
            <p className="meta">
              {t('cellTitle', { category: board.cell.category, price: board.cell.price })}
              {board.cell.mark !== 'none' && <span className="cell-mark">{markText(board.cell.mark)}</span>}
            </p>
          )}
          {board !== null && board.turn !== null && <p className="lead">{t('boardAnswering', { name: board.turn.nickname })}</p>}
          <h1 className={questionClass(view.question.text)}>{view.question.text}</h1>
          <QuestionImage url={view.question.imageUrl} />
          {correct !== null && <p className="answer">{t('correctAnswer', { answer: correctText(correct, view.question.choices) })}</p>}
        </section>
      )}

      {timeShown && (
        <div className="panel-actions">
          <button type="button" className="btn btn-small" disabled={secondsNow !== null && secondsNow <= 5} onClick={() => adjust(-15)}>
            {t('timeMinus')}
          </button>
          <button type="button" className="btn btn-small" disabled={secondsNow !== null && secondsNow >= 120} onClick={() => adjust(15)}>
            {t('timePlus')}
          </button>
        </div>
      )}

      {pending !== null && (
        <section className="panel">
          <h2>{t('pendingTitle')}</h2>
          <ul className="rows">
            <li>
              <span className="name">{pending.nickname}</span>
              <span className="given">{answerText(pending.answer, correct)}</span>
              <span className="tag is-pending">{t('pendingTitle')}</span>
            </li>
          </ul>
          <div className="actions">
            {!manualPending && (
              <button type="button" className="btn btn-small" onClick={() => void act('host:accept')}>
                {t('acceptAnswer')}
              </button>
            )}
            {manualPending && (
              <>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => (board !== null ? grade(pending.playerId, 'correct') : judge(pending.playerId, true))}
                >
                  {t('judgeCorrect')}
                </button>
                {board !== null && round?.partial === true && (
                  <button type="button" className="btn btn-small" onClick={() => grade(pending.playerId, 'partial')}>
                    {t('gradePartial')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => (board !== null ? grade(pending.playerId, 'wrong') : judge(pending.playerId, false))}
                >
                  {t('judgeWrong')}
                </button>
              </>
            )}
            <button type="button" className="btn btn-small" onClick={() => void act('host:repick')}>
              {t('repick')}
            </button>
          </div>
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
                  {blitz.queue.map((entry) => (
                    <li key={entry.playerId}>
                      <span className="name">{entry.nickname}</span>
                      <span className="given">{entry.answer === null ? t('blitzTyping') : answerText(entry.answer, correct)}</span>
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

      {view.question !== null && live && board !== null && (
        <section className="panel">
          <h2>{t('responses')}</h2>
          <ul className="rows">
            {board.turn !== null && (
              <li>
                <span className="name">{board.turn.nickname}</span>
                {(() => {
                  const response = view.responses.find((entry) => entry.playerId === chooserId);
                  const given = response?.answer ?? board.answer;
                  return (
                    <>
                      <span className="given">
                        {given !== null ? answerText(given, correct) : board.answerMode === 'voice' ? t('answeredAloud') : '—'}
                      </span>
                      {response !== undefined && (
                        <>
                          <span className={response.grade === 'wrong' ? 'tag is-wrong' : 'tag is-correct'}>
                            {t(response.grade === 'partial' ? 'partialTag' : response.accepted ? 'accepted' : 'rejected')}
                          </span>
                          <span className="score">{num(response.points)}</span>
                        </>
                      )}
                    </>
                  );
                })()}
              </li>
            )}
          </ul>
          {canGradeBoard && chooserId !== null && (
            <div className="actions">
              <button type="button" className="btn btn-small" onClick={() => grade(chooserId, 'correct')}>
                {t('accept')}
              </button>
              {round?.partial === true && (
                <button type="button" className="btn btn-small" onClick={() => grade(chooserId, 'partial')}>
                  {t('gradePartial')}
                </button>
              )}
              <button type="button" className="btn btn-small" onClick={() => grade(chooserId, 'wrong')}>
                {t('gradeWrong')}
              </button>
            </div>
          )}
        </section>
      )}

      {view.question !== null && live && blitz === null && board === null && (
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
