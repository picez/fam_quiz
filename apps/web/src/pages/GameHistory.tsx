import { Link, Navigate, useParams } from 'react-router-dom';
import { pinDistance, type GameAdjustment, type GameQuestionResult } from '@quiz/shared';
import { getGame } from '../api';
import { answerText, choicesOf, correctText, formatDate, markText, num, pairTexts, roundLabel, signed } from '../format';
import { DEBUFF_ICONS, debuffName } from '../debuff-meta';
import { t } from '../i18n';
import { PairList } from '../screens/MatchView';
import { BuffBadge, SpareMark } from '../screens/Buffs';
import { PinBoard, type PinBoardMark } from '../screens/PinBoard';
import { usePrivateData } from '../usePrivateData';

/** Точки гравців на мініатюрі запитання-точки (відповіді на основне) і найближча з них; для інших типів — порожньо. */
export function historyPinMarks(question: GameQuestionResult): { marks: PinBoardMark[]; nearest: string | undefined } {
  const q = question.question;
  if (q.type !== 'pin') return { marks: [], nearest: undefined };
  const marks: PinBoardMark[] = [];
  question.responses.forEach((response, at) => {
    if (response.spare !== null || response.answer?.type !== 'pin') return;
    marks.push({ playerId: `r${at}`, nickname: response.nickname, x: response.answer.x, y: response.answer.y });
  });
  const best = marks.reduce<PinBoardMark | undefined>((acc, mark) => (acc === undefined || pinDistance(q, mark.x, mark.y) < pinDistance(q, acc.x, acc.y) ? mark : acc), undefined);
  return { marks, nearest: best?.playerId };
}

/** Мініатюра запитання-точки: основа, правильна точка, кола й точки гравців (найближча підсвічена). */
function HistoryPin({ question }: { question: GameQuestionResult }) {
  const q = question.question;
  if (q.type !== 'pin') return null;
  const { marks, nearest } = historyPinMarks(question);
  return (
    <div className="history-pin">
      <PinBoard pin={{ map: q.map, aspect: q.aspect }} imageUrl={q.imageUrl} target={q.target} radii={{ full: q.fullRadius, zero: q.zeroRadius }} marks={marks} highlight={nearest} />
    </div>
  );
}

/** Рядки дуелей: пари 'duel' з сусідніми seq (+N і −N) — один рядок; непарне — окремо. */
export function duelLines(adjustments: GameAdjustment[]): string[] {
  const duel = adjustments.filter((adjustment) => adjustment.source === 'duel').sort((a, b) => a.seq - b.seq);
  const lines: string[] = [];
  for (let at = 0; at < duel.length; at++) {
    const first = duel[at];
    const second = duel[at + 1];
    if (second !== undefined && second.seq === first.seq + 1 && first.points > 0 && second.points === -first.points) {
      lines.push(t('historyDuel', { winner: first.nickname, plus: signed(first.points), loser: second.nickname, minus: signed(second.points) }));
      at++;
    } else {
      lines.push(t('historyDuelOne', { name: first.nickname, points: signed(first.points) }));
    }
  }
  return lines;
}

/** Рядки купівель дебафів (source 'debuff') за seq. */
export function debuffLines(adjustments: GameAdjustment[]): string[] {
  return adjustments
    .filter((adjustment) => adjustment.source === 'debuff' && adjustment.debuff !== undefined)
    .sort((a, b) => a.seq - b.seq)
    .map((adjustment) => {
      const kind = adjustment.debuff!;
      const params = { buyer: adjustment.nickname, debuff: `${DEBUFF_ICONS[kind]} ${debuffName(kind)}`, points: signed(adjustment.points) };
      return adjustment.target ? t('historyDebuff', { ...params, target: adjustment.target }) : t('historyDebuffNoTarget', params);
    });
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
            const purchases = debuffLines(roundAdjustments);
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
                        {question.question.type === 'pin' && <HistoryPin question={question} />}
                        {question.responses.length > 0 && (
                          <details className="responses">
                            <summary>{t('responsesTitle', { count: question.responses.length })}</summary>
                            <ul>
                              {question.responses.map((response, at) => (
                                <li key={at} className={response.accepted ? 'is-correct' : 'is-wrong'}>
                                  <span className="responses-who">
                                    <span className="responses-name">{response.nickname}</span>
                                    {response.buff !== null && <BuffBadge kind={response.buff} />}
                                    {response.spare !== null && <SpareMark spare={response.spare} />}
                                  </span>
                                  {response.spare !== null && <span className="spare-text">{t('spareText', { text: response.spare.text })}</span>}
                                  {response.answer?.type === 'match' ? (
                                    <PairList pairs={pairTexts(response.answer.links, choicesOf(question.question))} tone="" />
                                  ) : (
                                    <span className="responses-answer">{answerText(response.answer, response.spare ?? question.question)}</span>
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
                {purchases.map((line, at) => (
                  <p key={at} className="meta round-adjustments history-debuff">
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
