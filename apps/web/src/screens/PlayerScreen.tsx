import { useState } from 'react';
import type { Answer, PlayerView } from '@quiz/shared';
import { answerText, correctText, questionClass } from '../format';
import { errorText, t } from '../i18n';
import { Timer } from '../live/Timer';
import type { Send } from '../live/types';
import { AnswerInput } from './AnswerInput';
import { QuestionImage } from './QuestionImage';
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
      : result.accepted
        ? t('resultCorrect')
        : result.accuracy > 0
          ? t('resultPartial')
          : t('resultWrong');
  const tone = result === null || result.points === 0 ? 'is-wrong' : 'is-correct';
  return (
    <section className={`result ${tone}`}>
      <h2>{title}</h2>
      {result !== null && result.points > 0 && <p className="earned">{t('earned', { points: result.points })}</p>}
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

  const place = me.rank !== null && <p className="place">{t('yourPlace', { rank: me.rank, total: view.playerCount })}</p>;

  return (
    <main className="app player">
      <header className="bar">
        <span>{me.nickname}</span>
        <strong className="score">{me.score}</strong>
      </header>

      {view.paused && (
        <p className="banner" role="status">
          {t(hostOnline ? 'paused' : 'waitingHost')}
        </p>
      )}

      {phase === 'lobby' && <p className="lead">{t('inLobby')}</p>}

      {phase === 'question' && question !== null && (
        <>
          <div className="question-head">
            <p className="meta">{t('questionOf', { index: view.questionIndex + 1, total: view.total })}</p>
            <Timer view={view} offsetMs={offsetMs} />
          </div>
          <h1 className={questionClass(question.text)}>{question.text}</h1>
          <QuestionImage url={question.imageUrl} />
          {me.answer !== null ? (
            <section className="sent">
              <h2>{t('answerSent')}</h2>
              <p>{pickedText(me.answer, question.choices)}</p>
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
          <Result view={view} />
        </>
      )}

      {phase === 'leaderboard' && view.standings !== null && (
        <>
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

/** Власна відповідь словами: назви варіантів беруться з показаного запитання. */
function pickedText(answer: Answer, choices: { id: string; text: string }[]): string {
  const name = (id: string) => choices.find((choice) => choice.id === id)?.text ?? id;
  switch (answer.type) {
    case 'single':
      return name(answer.optionId);
    case 'multi':
      return answer.optionIds.map(name).join(', ');
    case 'order':
      return answer.itemIds.map(name).join(' → ');
    default:
      return answerText(answer, null);
  }
}
