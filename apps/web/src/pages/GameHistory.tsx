import { Link, Navigate, useParams } from 'react-router-dom';
import type { GameAdjustment } from '@quiz/shared';
import { getGame } from '../api';
import { answerText, choicesOf, correctText, formatDate, markText, num, pairTexts, roundLabel, signed } from '../format';
import { t } from '../i18n';
import { PairList } from '../screens/MatchView';
import { usePrivateData } from '../usePrivateData';

/** Рядки дуелей: пари 'duel' з сусідніми seq (+ і −) — один рядок; непарне — окремо. */
export function duelLines(adjustments: GameAdjustment[]): string[] {
  const duel = adjustments.filter((adjustment) => adjustment.source === 'duel').sort((a, b) => a.seq - b.seq);
  const lines: string[] = [];
  for (let at = 0; at < duel.length; at++) {
    const first = duel[at];
    const second = duel[at + 1];
    if (second !== undefined && second.seq === first.seq + 1 && first.points > 0 && second.points < 0) {
      lines.push(t('historyDuel', { winner: first.nickname, plus: signed(first.points), loser: second.nickname, minus: signed(second.points) }));
      at++;
    } else {
      lines.push(t('historyDuelOne', { name: first.nickname, points: signed(first.points) }));
    }
  }
  return lines;
}

export function GameHistory() {
  const { id = '' } = useParams();
  const state = usePrivateData(() => getGame(id), id);

  if (state.status === 'signed-out') {
    return <Navigate to={`/login?next=${encodeURIComponent(`/history/${id}`)}`} replace />;
  }

  const back = (
    <header className="bar">
      <Link className="quiet-link" to="/history">
        {t('historyTitle')}
      </Link>
    </header>
  );

  if (state.status !== 'ready') {
    return (
      <main className="app wide">
        {back}
        {state.status === 'loading' ? (
          <p className="meta">{t('loading')}</p>
        ) : (
          <p className="error" role="alert">
            {state.message}
          </p>
        )}
      </main>
    );
  }

  const game = state.data;
  return (
    <main className="app wide">
      {back}
      <h1 className="brand">{game.title}</h1>
      <p className="meta">{`${formatDate(game.startedAt)}, ${t(`status_${game.status}`)}`}</p>
      <p className="meta">{t('questionsProgress', { played: game.questionsPlayed, total: game.questionCount })}</p>

      <section className="panel">
        <h2>{t('standingsTitle')}</h2>
        {game.standings.length === 0 ? (
          <p className="meta">{t('noPlayers')}</p>
        ) : (
          <ol className="standings stacked">
            {game.standings.map((row) => (
              <li key={row.participantId}>
                <span className="rank">{row.rank ?? '–'}</span>
                <span className="name">{row.nickname}</span>
                <span className="tag">{t('correctOf', { correct: row.correct })}</span>
                <span className="score">{num(row.score)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {(game.questions.length > 0 || game.adjustments.length > 0) && (
        <section className="panel">
          <h2>{t('questionsTitle')}</h2>
          {/* Гра з одним раундом виглядає, як раніше: без заголовка раунду; запитання нумеруються в межах раунду, як на живих екранах. */}
          {game.rounds.map((round, roundIndex) => {
            const questions = game.questions.filter((question) => question.roundIndex === roundIndex);
            // Раунд без запитань показується, якщо в ньому ведучий нараховував бали.
            const roundAdjustments = game.adjustments.filter((adjustment) => adjustment.roundIndex === roundIndex);
            const adjustments = roundAdjustments.filter((adjustment) => adjustment.source === 'host');
            const duels = duelLines(roundAdjustments);
            if (questions.length === 0 && roundAdjustments.length === 0) return null;
            return (
              <div key={roundIndex} className="round-group">
                {game.rounds.length > 1 && <h3 className="round-title">{roundLabel(round.title, roundIndex, round.type)}</h3>}
                {questions.length > 0 && (
                  <ol className="rows stacked">
                    {questions.map((question, position) => (
                      <li key={question.index}>
                        <span className="rank">{position + 1}</span>
                        <span className="name">{question.text}</span>
                        {question.cell !== null && (
                          <>
                            <span className="tag">{t('cellTitle', { category: question.cell.category, price: question.cell.price })}</span>
                            {question.cell.multiplier > 1 && <span className="tag">{markText(question.cell.multiplier === 2 ? 'x2' : 'x3')}</span>}
                            {question.cell.kind === 'blitz' && <span className="tag">{t('cellBlitz')}</span>}
                            <span className="meta">
                              {question.cell.kind === 'blitz'
                                ? question.cell.scores.map((score) => `${score.nickname}: ${signed(score.points)}`).join(', ')
                                : question.cell.chooser === null
                                  ? t('cellRemoved')
                                  : question.cell.points === null
                                    ? question.cell.chooser
                                    : `${question.cell.chooser}: ${signed(question.cell.points)}`}
                            </span>
                          </>
                        )}
                        <span className="tag">{t('answeredStat', { answered: question.answered, accepted: question.accepted })}</span>
                        {question.final !== null && (
                          <div className="wager-list">
                            <h4>{t(question.final.mode === 'bank' ? 'historyFinalBank' : 'historyFinal')}</h4>
                            <ul>
                              {question.final.entries.map((entry, at) => (
                                <li key={at} className={entry.accepted ? 'is-correct' : 'is-wrong'}>
                                  {t('finalHistoryLine', { nickname: entry.nickname, wager: entry.wager, points: signed(entry.points) })}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {question.question.type === 'sort' && (
                          <p className="meta">{t('correctAnswer', { answer: correctText(question.question) })}</p>
                        )}
                        {question.responses.length > 0 && (
                          <details className="responses">
                            <summary>{t('responsesTitle', { count: question.responses.length })}</summary>
                            <ul>
                              {question.responses.map((response, at) => (
                                <li key={at} className={response.accepted ? 'is-correct' : 'is-wrong'}>
                                  <span className="responses-name">{response.nickname}</span>
                                  {response.answer?.type === 'match' ? (
                                    <PairList pairs={pairTexts(response.answer.links, choicesOf(question.question))} tone="" />
                                  ) : (
                                    <span className="responses-answer">{answerText(response.answer, question.question)}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                {adjustments.length > 0 && (
                  <p className="meta history-adjustments">
                    {t('historyAdjustments', { list: adjustments.map((adjustment) => `${adjustment.nickname} ${signed(adjustment.points)}`).join(', ') })}
                  </p>
                )}
                {duels.map((line, at) => (
                  <p key={at} className="meta history-duel">
                    {line}
                  </p>
                ))}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
