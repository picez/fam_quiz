import { Fragment } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { cloudKey, isUnscored, pinDistance, surveyHitsOf, surveyOrder, undoAnswerKey, undoLedger, type GameAdjustment, type BluffInfo, type GameQuestionResult, type SurveyInfo } from '@quiz/shared';
import { getGame } from '../api';
import { answerText, choicesOf, correctText, formatDate, markText, num, pairTexts, roundLabel, signed } from '../format';
import { DEBUFF_ICONS, debuffName } from '../debuff-meta';
import { t, type TextKey } from '../i18n';
import { PairList } from '../screens/MatchView';
import { BuffBadge, SpareMark } from '../screens/Buffs';
import { PinBoard, type PinBoardMark } from '../screens/PinBoard';
import { WallReveal } from '../screens/WallReveal';
import { PollBars } from '../screens/PollBars';
import { BluffBoard } from '../screens/BluffBoard';
import { SurveyBoard } from '../screens/SurveyBoard';
import { ScoreTable } from '../screens/ScoreTable';
import { historyUndoLines } from '../undo-panel';
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

/** Табло «100 до 1» з історії: усе відкрито; автори — нікнейми з відповідей, що влучили в рядок. Не «100 до 1» — null. */
export function historySurvey(question: GameQuestionResult): SurveyInfo | null {
  const q = question.question;
  if (q.type !== 'survey') return null;
  const authors = new Map<string, string[]>();
  for (const response of question.responses) {
    if (response.spare !== null) continue;
    for (const id of new Set(surveyHitsOf(response.answer))) {
      if (id === null) continue;
      const list = authors.get(id) ?? [];
      if (!list.includes(response.nickname)) list.push(response.nickname);
      authors.set(id, list);
    }
  }
  const rows = surveyOrder(q.rows).map((row, index) => ({ rank: index + 1, open: true, text: row.text, popularity: row.popularity, by: authors.get(row.id) ?? [] }));
  return { source: question.surveyFromCloud === true ? 'cloud' : 'host', total: rows.length, shown: rows.length, rows };
}

/** Табло блефу з історії: усе відкрито; варіанти в порядку розкриття, прибрані — в кінці. Не блеф — null. */
export function historyBluff(question: GameQuestionResult): BluffInfo | null {
  if (question.question.type !== 'bluff' || question.bluff === undefined) return null;
  const options = question.bluff.options.map((option, at) => ({
    id: `h${at}`,
    text: option.text,
    open: true,
    kind: option.kind,
    authors: option.authors,
    pickedBy: option.pickedBy,
    removed: option.removed,
  }));
  const shown = options.filter((option) => !option.removed).length;
  return { stage: 'reveal', written: 0, picked: 0, options, shown, total: shown, lastOpenedId: null, lies: null };
}

/** Голоси опитування за варіантами (відповіді на основне запитання). */
export function historyPollCounts(question: GameQuestionResult): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const response of question.responses) {
    if (response.spare === null && response.answer?.type === 'poll') counts[response.answer.optionId] = (counts[response.answer.optionId] ?? 0) + 1;
  }
  return counts;
}

/** Слова хмари з відповідей: зведені через cloudKey, найчастіші першими; текст — найчастіше написання (за рівності — перше). Сховані ведучим — з позначкою. */
// Рахує всі збережені рядки (і вилучених гравців), на відміну від живого cloudTally.
export function historyCloudWords(question: GameQuestionResult): { key: string; text: string; count: number; hidden: boolean }[] {
  const hidden = new Set(question.cloudHidden ?? []);
  const words = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const response of question.responses) {
    if (response.spare !== null || response.answer?.type !== 'wordcloud') continue;
    for (const word of response.answer.words) {
      const key = cloudKey(word);
      const entry = words.get(key) ?? { count: 0, spellings: new Map<string, number>() };
      entry.count++;
      entry.spellings.set(word, (entry.spellings.get(word) ?? 0) + 1);
      words.set(key, entry);
    }
  }
  return [...words.entries()]
    .map(([key, { count, spellings }]) => {
      let text = '';
      let best = 0;
      for (const [spelling, times] of spellings) if (times > best) [text, best] = [spelling, times];
      return { key, text, count, hidden: hidden.has(key) };
    })
    .sort((x, y) => y.count - x.count || x.text.localeCompare(y.text, 'uk'));
}

/** Слова однієї відповіді хмари; сховані ведучим замінені на «приховано». */
function cloudAnswerText(words: string[], hidden: string[] | undefined): string {
  const set = new Set(hidden ?? []);
  return words.map((word) => (set.has(cloudKey(word)) ? t('cloudHiddenWord') : word)).join(', ');
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

/** «Ва-банк»: рядки стану учасників після сходинки. */
export function wipeoutLines(wipeout: NonNullable<GameQuestionResult['wipeout']>): string[] {
  return wipeout.rows.map((row) => {
    const params = { name: row.nickname, bank: num(row.bank) };
    return t(row.status === 'burned' ? 'historyWipeoutBurned' : row.status === 'took' ? 'historyWipeoutTook' : row.status === 'survived' ? 'historyWipeoutSurvived' : 'historyWipeoutIn', params);
  });
}

/** «Вибування»: вердикт, випробування (питання чи двері), привиди. */
export function survivalLines(survival: NonNullable<GameQuestionResult['survival']>): string[] {
  const lines: string[] = [];
  if (survival.verdict === 'all_wrong') lines.push(t('historySurvivalAllWrong'));
  else if (survival.verdict === 'all_right') lines.push(t('historySurvivalAllRight'));
  const trial = survival.trial;
  if (trial !== null) {
    const head = trial.kind === 'question' ? t('historySurvivalTrialQuestion', { question: trial.question ?? '' }) : t('historySurvivalTrialLuck');
    lines.push(trial.fellBack ? `${head} ${t('historySurvivalFellBack')}` : head);
    for (const row of trial.rows) {
      const door = trial.kind === 'luck' && row.door !== null && row.trap !== null ? t(row.auto ? 'historySurvivalDoorAuto' : 'historySurvivalDoor', { door: row.door + 1, trap: row.trap + 1 }) : '';
      const text = t(row.out ? 'historySurvivalOut' : 'historySurvivalSafe', { name: row.nickname });
      const answer = trial.kind === 'question' ? t('historySurvivalAnswer', { answer: answerText(row.answer, trial.trialQuestion ?? null) }) : '';
      const extra = door !== '' ? door : answer;
      lines.push(extra === '' ? text : `${text}, ${extra}`);
    }
  }
  if (survival.ghosts.answered > 0) lines.push(t('historySurvivalGhosts', { right: survival.ghosts.right, answered: survival.ghosts.answered }));
  return lines;
}

/** Рядки бонусу виживання (source 'survival') за seq. */
export function survivalBonusLines(adjustments: GameAdjustment[]): string[] {
  return adjustments
    .filter((adjustment) => adjustment.source === 'survival')
    .sort((a, b) => a.seq - b.seq)
    .map((adjustment) => t('historySurvivalBonus', { name: adjustment.nickname, points: num(adjustment.points) }));
}

/** «Мільйонер»: сходинка, підказки, зал, рішення й підсумок запитання. */
export function ladderLines(ladder: NonNullable<GameQuestionResult['ladder']>, question: GameQuestionResult['question']): string[] {
  const choices = choicesOf(question);
  const text = (id: string) => choices.find((choice) => choice.id === id)?.text ?? id;
  const name = ladder.contestant;
  const step = t('historyLadderStep', { name, n: ladder.step + 1, level: num(ladder.level) });
  const lines = [ladder.safe ? `${step} ${t('historyLadderSafe')}` : step];
  for (const lifeline of ladder.lifelines) {
    if (lifeline.kind === 'fifty' && lifeline.removed !== null) {
      lines.push(t('historyLadderFifty', { options: lifeline.removed.map(text).join(', ') }));
    } else if (lifeline.kind === 'audience' && lifeline.tally !== null && lifeline.tally.cast > 0) {
      const tally = lifeline.tally;
      const list = choices.map((choice) => `${choice.text} ${Math.round(((tally.counts[choice.id] ?? 0) / tally.cast) * 100)} %`).join(', ');
      lines.push(t('historyLadderAudience', { list }));
    } else if (lifeline.kind === 'hint') {
      if (lifeline.hint !== null) lines.push(t('historyLadderHint', { text: lifeline.hint }));
      else if (lifeline.aloud) lines.push(t('historyLadderHintAloud'));
    }
  }
  if (ladder.hall.answered > 0) lines.push(t('historyLadderHall', { right: ladder.hall.right, answered: ladder.hall.answered }));
  if (ladder.outcome !== null) {
    lines.push(t(`historyLadder${{ took: 'Took', wrong: 'Wrong', top: 'Top', stopped: 'Stopped' }[ladder.outcome.kind]}` as TextKey, { name, points: num(ladder.outcome.points) }));
  } else if (ladder.decision === 'go') {
    lines.push(t('historyLadderGo'));
  }
  return lines;
}

/** Рядки виграшу драбини (source 'ladder') за seq. */
export function ladderPrizeLines(adjustments: GameAdjustment[]): string[] {
  return adjustments
    .filter((adjustment) => adjustment.source === 'ladder')
    .sort((a, b) => a.seq - b.seq)
    .map((adjustment) => t('historyLadderPrize', { name: adjustment.nickname, points: num(adjustment.points) }));
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
  const ledger = undoLedger(game.adjustments.map((a) => ({ seq: a.seq, who: a.nickname, source: a.source, undoes: a.undoes })));
  return (
    <main className="app wide">
      {back}
      <h1 className="brand">{game.title}</h1>
      <p className="meta">{`${formatDate(game.startedAt)}, ${t(`status_${game.status}`)}`}</p>
      {game.teams && <p className="meta team-game-mark">{t('historyTeamGame')}</p>}
      {game.autopilot && <p className="meta autopilot-mark">{t('historyAutopilot')}</p>}
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
                <span className="name">
                  {row.nickname}
                  {row.members !== undefined && row.members.length > 0 && (
                    <>
                      {/* Для читача екрана назва й склад — окремими фразами. */}
                      <span className="sr-only">, </span>
                      <small className="team-members">{t('historyMembers', { names: row.members.join(', ') })}</small>
                    </>
                  )}
                </span>
                <span className="tag">{t('correctOf', { correct: row.correct })}</span>
                <span className="score">{num(row.score)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {game.standings.some((row) => row.rounds.length > 0) && (
        <section className="panel history-scores">
          <h2>{t('historyScoresTitle')}</h2>
          <ScoreTable
            size="history"
            rows={game.standings}
            breakdowns={Object.fromEntries(game.standings.map((row) => [row.participantId, row.breakdown]))}
            roundTitles={game.rounds.map((round, index) => roundLabel(round.title, index, round.type))}
          />
        </section>
      )}

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
            const undoLines = historyUndoLines(game, roundIndex);
            const bonuses = [...survivalBonusLines(roundAdjustments), ...ladderPrizeLines(roundAdjustments)];
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
                        <span className="tag">
                          {isUnscored(question.question)
                            ? t('votedStat', { voted: question.answered })
                            : t('answeredStat', { answered: question.answered, accepted: question.accepted })}
                        </span>
                        {question.final !== null && (
                          <div className="wager-list">
                            <h4>{t(question.final.mode === 'bank' ? 'historyFinalBank' : 'historyFinal')}</h4>
                            <ul>
                              {question.final.entries.map((entry, at) => (
                                <li key={at} className={`${entry.accepted ? 'is-correct' : 'is-wrong'}${ledger.answers.has(undoAnswerKey(entry.nickname, question.index)) ? ' is-undone' : ''}`}>
                                  {t('finalHistoryLine', { nickname: entry.nickname, wager: entry.wager, points: signed(entry.points) })}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {question.wipeout !== undefined && (
                          <ul className="wipeout-history">
                            {wipeoutLines(question.wipeout).map((line, at) => (
                              <li key={at} className="meta">
                                {line}
                              </li>
                            ))}
                          </ul>
                        )}
                        {question.survival !== undefined && (
                          <ul className="survival-history">
                            {survivalLines(question.survival).map((line, at) => (
                              <li key={at} className="meta">
                                {line}
                              </li>
                            ))}
                          </ul>
                        )}
                        {question.ladder !== undefined && (
                          <ul className="ladder-history">
                            {ladderLines(question.ladder, question.question).map((line, at) => (
                              <li key={at} className="meta">
                                {line}
                              </li>
                            ))}
                          </ul>
                        )}
                        {question.question.type === 'sort' && (
                          <p className="meta">{t('correctAnswer', { answer: correctText(question.question) })}</p>
                        )}
                        {question.question.type === 'pin' && <HistoryPin question={question} />}
                        {question.question.type === 'wall' && <WallReveal question={question.question} />}
                        {question.question.type === 'poll' && (
                          <PollBars choices={choicesOf(question.question)} counts={historyPollCounts(question)} total={question.answered} />
                        )}
                        {question.question.type === 'survey' && (
                          <div className="history-survey">
                            {question.surveyFromCloud === true && <p className="meta">{t('surveyFromCloudHistory')}</p>}
                            {(() => {
                              const info = historySurvey(question);
                              return info === null ? null : <SurveyBoard info={info} />;
                            })()}
                          </div>
                        )}
                        {question.question.type === 'bluff' && (
                          <div className="history-bluff">
                            {(() => {
                              const info = historyBluff(question);
                              return info === null ? null : <BluffBoard info={info} host />;
                            })()}
                          </div>
                        )}
                        {question.question.type === 'wordcloud' && (
                          <ul className="history-cloud">
                            {historyCloudWords(question).map((word) => (
                              <li key={word.key} className={word.hidden ? 'is-hidden' : undefined}>{`${word.hidden ? t('cloudHiddenWord') : word.text} · ${word.count}`}</li>
                            ))}
                          </ul>
                        )}
                        {question.responses.length > 0 && (
                          <details className="responses">
                            <summary>{t('responsesTitle', { count: question.responses.length })}</summary>
                            <ul>
                              {question.responses.map((response, at) => (
                                <li
                                  key={at}
                                  className={
                                    [
                                      isUnscored(question.question) ? '' : response.accepted ? 'is-correct' : 'is-wrong',
                                      ledger.answers.has(undoAnswerKey(response.nickname, question.index)) ? 'is-undone' : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ') || undefined
                                  }
                                >
                                  <span className="responses-who">
                                    <span className="responses-name">{response.nickname}</span>
                                    {response.buff !== null && <BuffBadge kind={response.buff} />}
                                    {response.spare !== null && <SpareMark spare={response.spare} />}
                                  </span>
                                  {response.spare !== null && <span className="spare-text">{t('spareText', { text: response.spare.text })}</span>}
                                  {response.answer?.type === 'match' ? (
                                    <PairList pairs={pairTexts(response.answer.links, choicesOf(question.question))} tone="" />
                                  ) : (
                                    <span className="responses-answer">
                                      {response.answer?.type === 'wordcloud' && response.spare === null
                                        ? cloudAnswerText(response.answer.words, question.cloudHidden)
                                        : answerText(response.answer, response.spare ?? question.question)}
                                    </span>
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
                    {/* Без скасованих рядок лишається одним текстом; зі скасованими кожне коригування — окремий span. */}
                    {adjustments.every((adjustment) => !ledger.adjustments.has(adjustment.seq))
                      ? `${t('historyAdjustmentsLead')} ${adjustments.map((adjustment) => `${adjustment.nickname} ${signed(adjustment.points)}`).join(', ')}`
                      : [
                          `${t('historyAdjustmentsLead')} `,
                          ...adjustments.map((adjustment, at) => {
                            const text = `${adjustment.nickname} ${signed(adjustment.points)}`;
                            return (
                              <Fragment key={adjustment.seq}>
                                {at > 0 && ', '}
                                <span className={ledger.adjustments.has(adjustment.seq) ? 'is-undone' : undefined}>
                                  {ledger.adjustments.has(adjustment.seq) ? <s>{text}</s> : text}
                                </span>
                              </Fragment>
                            );
                          }),
                        ]}
                  </p>
                )}
                {undoLines.map((line) => (
                  <p key={line.seq} className="meta round-adjustments history-undo">
                    {line.returned ? <s>{line.text}</s> : line.text}
                  </p>
                ))}
                {duels.map((line, at) => (
                  <p key={at} className="meta history-duel">
                    {line}
                  </p>
                ))}
                {bonuses.map((line, at) => (
                  <p key={at} className="meta round-adjustments history-bonus">
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
