import { useState, type FormEvent } from 'react';
import type { Answer, PlayerBlitz, PlayerView } from '@quiz/shared';
import { correctText, markText, pickedText, shownChoices, num, questionClass, questionLabel, roundLabel, signed } from '../format';
import { errorText, t } from '../i18n';
import { RoundBriefing } from './RoundBriefing';
import { Timer } from '../live/Timer';
import type { Send } from '../live/types';
import { AnswerInput } from './AnswerInput';
import { BlitzCellNotes, Board } from './Board';
import { QuestionImage } from './QuestionImage';
import { YouTubePlayer } from './YouTubePlayer';
import { SpotlightChoices } from './SpotlightChoices';
import { Standings } from './Standings';

interface Props {
  view: PlayerView;
  hostOnline: boolean;
  offsetMs: number;
  send: Send;
}

function Result({ view }: { view: PlayerView }) {
  const { result } = view.me;
  const title =
    result === null
      ? t('resultNone')
      : result.grade === 'correct'
        ? t('resultCorrect')
        : result.grade === 'partial'
          ? t('resultPartial')
          : t('resultWrong');
  const tone = result === null || result.points <= 0 ? 'is-wrong' : 'is-correct';
  return (
    <section className={`result ${tone}`}>
      <h2>{title}</h2>
      {result !== null && result.points !== 0 && <p className="earned">{signed(result.points)}</p>}
      {result !== null && result.streakBonus > 0 && <p className="streak-bonus">{t('streakBonusLine', { points: result.streakBonus })}</p>}
      {view.reveal !== null && <p>{t('correctAnswer', { answer: correctText(view.reveal, view.question?.choices) })}</p>}
      {view.blitz !== null && (
        <p className="winner">
          {view.blitz.winner === null ? t('blitzNoWinner') : t('blitzWinner', { name: view.blitz.winner.nickname })}
        </p>
      )}
    </section>
  );
}

/** Ставка гравця у фіналі: числове поле (його можна змінити) або єдина ставка 0. */
function WagerForm({
  final,
  send,
  onError,
}: {
  final: { wager: number | null; limit: number };
  send: Send;
  onError: (message: string | null) => void;
}) {
  const [value, setValue] = useState(final.wager === null ? '' : String(final.wager));
  const place = async (amount: number) => {
    const result = await send('player:wager', { amount });
    onError(result.ok ? null : errorText(result.error));
  };
  const amount = value.trim() === '' ? Number.NaN : Number(value);
  const valid = Number.isInteger(amount) && amount >= 0 && amount <= final.limit;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) void place(amount);
  };
  return (
    <section className="wager-form">
      {final.limit > 0 ? (
        <form onSubmit={submit}>
          <p className="lead">{t('finalWagerPrompt', { limit: final.limit })}</p>
          <label className="field">
            <span className="meta">{t('finalWagerLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={final.limit}
              step={1}
              placeholder={t('finalWagerPlaceholder', { limit: final.limit })}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            {t('finalPlace')}
          </button>
        </form>
      ) : (
        <>
          <p className="lead">{t('finalZeroScore')}</p>
          <button type="button" className="btn btn-primary" onClick={() => void place(0)}>
            {t('finalPlaceZero')}
          </button>
        </>
      )}
      {final.wager !== null && <p className="wager-mine">{t('finalMyWager', { wager: final.wager })}</p>}
    </section>
  );
}

/** Результат гравця у фіналі: «+ставка» або «−ставка» і новий рахунок; до свого розкриття очікування. */
function FinalResult({ view }: { view: PlayerView }) {
  const { result } = view.me;
  if (result === null) return <p className="lead">{t('finalWaitReveal')}</p>;
  const won = result.grade === 'correct';
  return (
    <section className={`result ${won ? 'is-correct' : 'is-wrong'}`}>
      <h2>{t(won ? 'resultCorrect' : 'resultWrong')}</h2>
      <p className="wager-delta">{signed(result.points)}</p>
      <p>{t('finalNewScore', { score: num(view.me.score) })}</p>
      {view.reveal !== null && <p>{t('correctAnswer', { answer: correctText(view.reveal, view.question?.choices) })}</p>}
    </section>
  );
}

export function PlayerScreen({ view, hostOnline, offsetMs, send }: Props) {
  const [error, setError] = useState<string | null>(null);
  const { me, phase, question } = view;

  const submit = async (answer: Answer) => {
    const result = await send('player:answer', answer);
    setError(result.ok ? null : errorText(result.error));
  };

  const board = view.board;
  const chooserIsMe = board?.turn?.playerId === me.id;
  const chooserName = board?.turn?.nickname ?? '';
  const { spotlight } = view;
  // Хто відповідає: власник помаранчевої відповіді, інакше вибравший на полі чи голова черги бліцу.
  // Червона відповідь бліцу вже минула, тож її автор не «відповідає».
  // На бліц-клітинці вибравший лише обирає: відповідає голова черги.
  const blitzCell = board?.cell?.kind === 'blitz';
  const answering =
    (spotlight?.grade === null ? spotlight : null) ?? (blitzCell ? null : board?.turn) ?? view.blitz?.queue[0] ?? null;
  const othersAnswer = answering !== null && answering.playerId !== me.id;
  const myPending = spotlight !== null && spotlight.grade === null && spotlight.playerId === me.id;

  const pick = async (cellId: string) => {
    const result = await send('player:pick', { cellId });
    setError(result.ok ? null : errorText(result.error));
  };

  const place = me.rank !== null && <p className="place">{t('yourPlace', { rank: me.rank, total: view.playerCount })}</p>;

  return (
    <main className="app player">
      <header className="bar">
        <span>{me.nickname}</span>
        <strong className="score">{num(me.score)}</strong>
      </header>

      {view.paused && (
        <p className="banner" role="status">
          {t(hostOnline ? 'paused' : 'waitingHost')}
        </p>
      )}

      {phase === 'lobby' && <p className="lead">{t('inLobby')}</p>}

      {phase === 'intro' && view.round !== null && (
        <>
          {view.round.total > 1 && <p className="meta">{t('roundOf', { index: view.round.index + 1, total: view.round.total })}</p>}
          <h1 className="question">{roundLabel(view.round.title, view.round.index, view.round.type)}</h1>
          <RoundBriefing brief={view.round.brief} description={view.round.description} />
        </>
      )}

      {phase === 'wager' && me.final !== null && (
        <>
          {view.round !== null && <p className="meta">{roundLabel(view.round.title, view.round.index, view.round.type)}</p>}
          <WagerForm key={me.final.limit} final={me.final} send={send} onError={setError} />
        </>
      )}

      {phase === 'board' && board !== null && (
        <>
          <p className="lead">{chooserIsMe ? t('yourPick') : t('boardChooser', { name: chooserName })}</p>
          <Board board={board} onPick={chooserIsMe ? (cellId) => void pick(cellId) : undefined} disabled={view.paused} />
        </>
      )}

      {phase === 'question' && question !== null && (
        <>
          <div className="question-head">
            <p className="meta">{questionLabel(view.round, view.questionIndex, view.total)}</p>
            <Timer view={view} offsetMs={offsetMs} />
          </div>
          {board !== null && board.cell !== null && (
            <p className="meta">
              {t('cellTitle', { category: board.cell.category, price: board.cell.price })}
              {board.cell.mark !== 'none' && <span className="cell-mark">{markText(board.cell.mark)}</span>}
              {board.cell.kind === 'blitz' && <span className="cell-mark">{t('cellBlitz')}</span>}
            </p>
          )}
          {board !== null && <BlitzCellNotes board={board} />}
          {othersAnswer && <p className="lead">{t('boardAnswering', { name: answering.nickname })}</p>}
          <h1 className={questionClass(question.text)}>{question.text}</h1>
          <QuestionImage url={question.imageUrl} />
          <YouTubePlayer video={question.video} />
          {myPending ? (
            <section className="sent">
              <SpotlightChoices question={question} spotlight={spotlight} reveal={null} />
              <p className="lead">{t('pendingWait')}</p>
            </section>
          ) : me.blitz !== null ? (
            <>
              {(me.blitz.position === null || (spotlight !== null && spotlight.playerId !== me.id)) && (
                <SpotlightChoices question={question} spotlight={spotlight} reveal={null} />
              )}
              <BlitzTurn
                view={view}
                labelled={spotlight !== null && spotlight.playerId !== me.id}
                blitz={me.blitz}
                voice={board?.cell?.answerMode === 'voice'}
                offsetMs={offsetMs}
                onSubmit={submit}
                send={send}
                onError={setError}
              />
            </>
          ) : board !== null && !chooserIsMe ? (
            <SpotlightChoices question={question} spotlight={spotlight} reveal={null} />
          ) : board !== null && board.cell?.answerMode === 'voice' && me.answer === null ? (
            <p className="lead">{t('answerAloud')}</p>
          ) : me.answer !== null ? (
            <section className="sent">
              <h2>{t('answerSent')}</h2>
              <p>{pickedText(me.answer, shownChoices(question))}</p>
            </section>
          ) : (
            // На паузі поле лишається на місці, інакше гравець втратив би вже введене.
            <fieldset className="inputs" disabled={view.paused}>
              <AnswerInput key={view.questionIndex} question={question} onSubmit={submit} />
            </fieldset>
          )}
        </>
      )}

      {phase === 'locked' && (
        <>
          <h1 className={questionClass(question?.text ?? '')}>{question?.text}</h1>
          <p className="lead">{t('waitReveal')}</p>
        </>
      )}

      {phase === 'reveal' && (
        <>
          <h1 className={questionClass(question?.text ?? '')}>{question?.text}</h1>
          {view.final !== null ? (
            <FinalResult view={view} />
          ) : board !== null && !chooserIsMe && view.blitz === null ? (
            <section className="result">
              {question !== null && <SpotlightChoices question={question} spotlight={spotlight} reveal={view.reveal} />}
              <h2>{t('boardAnswered', { name: chooserName })}</h2>
              {view.reveal !== null && <p>{t('correctAnswer', { answer: correctText(view.reveal, question?.choices) })}</p>}
            </section>
          ) : (
            <Result view={view} />
          )}
        </>
      )}

      {phase === 'leaderboard' && view.standings !== null && (
        <>
          {place}
          <Standings standings={view.standings} highlightId={me.id} limit={5} />
        </>
      )}

      {phase === 'round_end' && view.standings !== null && (
        <>
          <h1 className="question">{t('roundResults', { index: (view.round?.index ?? 0) + 1 })}</h1>
          {place}
          <Standings standings={view.standings} highlightId={me.id} limit={5} />
        </>
      )}

      {phase === 'finished' && (
        <>
          <h1 className="question">{t('gameOver')}</h1>
          {place}
          {view.standings !== null && <Standings standings={view.standings} highlightId={me.id} />}
        </>
      )}

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

/** Хід гравця в запитанні бліцу: кнопка, місце в черзі й поле відповіді. */
function BlitzTurn({
  view,
  blitz,
  voice,
  labelled,
  offsetMs,
  onSubmit,
  send,
  onError,
}: {
  view: PlayerView;
  blitz: PlayerBlitz;
  voice: boolean;
  /** Над полем стоїть відповідь голови черги: власне поле підписуємо. */
  labelled: boolean;
  offsetMs: number;
  onSubmit: (answer: Answer) => void;
  send: Send;
  onError: (message: string | null) => void;
}) {
  const { me, question } = view;
  if (question === null) return null;

  const buzz = async () => {
    const result = await send('player:buzz');
    onError(result.ok ? null : errorText(result.error));
  };

  if (blitz.position !== null) {
    if (me.answer !== null) {
      return (
        <section className="sent">
          <h2>{t('blitzSent', { position: blitz.position })}</h2>
          <p>{pickedText(me.answer, shownChoices(question))}</p>
        </section>
      );
    }
    return (
      <>
        <p className="blitz-place">{t('blitzPlace', { position: blitz.position })}</p>
        {/* Сервер зсуває вікно лише після продовження, тож на паузі відлік вікна не показуємо. */}
        {blitz.deadline !== null && !view.paused && <Timer view={{ endsAt: blitz.deadline, remainingMs: null }} offsetMs={offsetMs} />}
        {voice ? (
          blitz.position === 1 ? <p className="lead">{t('answerAloud')}</p> : null
        ) : (
          <>
            {labelled && <h2 className="meta">{t('blitzYourAnswer')}</h2>}
            <fieldset className="inputs" disabled={view.paused}>
              <AnswerInput key={`${view.questionIndex}-${blitz.attemptsUsed}`} question={question} onSubmit={onSubmit} />
            </fieldset>
          </>
        )}
      </>
    );
  }

  const out = blitz.attemptsLeft === 0;
  return (
    <>
      {(out || blitz.attemptsUsed > 0) && <p className="blitz-note">{t(out ? 'blitzOut' : 'blitzRetry')}</p>}
      {!out && (
        <button type="button" className="btn btn-primary btn-buzz" disabled={!blitz.canBuzz} onClick={() => void buzz()}>
          {t('buzz')}
        </button>
      )}
    </>
  );
}
