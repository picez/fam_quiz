import type { JSX } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { isUnscored, type PlayedGameDetail } from '@quiz/shared';
import { getPlayedGame } from '../api';
import { answerText, correctText, formatDate, num } from '../format';
import { countText, t } from '../i18n';
import { BackLink } from '../nav/BackLink';
import { useDocumentTitle } from '../nav/useDocumentTitle';
import { usePrivateData } from '../usePrivateData';
import { Loading, LoadError } from '../ui/PageState';

type PlayedQuestion = PlayedGameDetail['questions'][number];

/** Запитання з балами: «Думай як усі», опитування й хмара не мають правильної відповіді. */
const scored = (question: PlayedQuestion) => !isUnscored(question.question) && question.question.type !== 'think';

/** «Правильно» / «Неправильно» / «Без відповіді»; запитання без балів — лише «Без відповіді», коли її немає. */
function verdictOf(question: PlayedQuestion): 'right' | 'wrong' | 'none' | null {
  if (question.mine.length === 0) return 'none';
  if (!scored(question)) return null;
  return question.mine.some((row) => row.accepted) ? 'right' : 'wrong';
}

const VERDICT_CLASS = { right: 'is-correct', wrong: 'is-wrong', none: 'is-empty' } as const;
const VERDICT_TEXT = { right: 'playedRight', wrong: 'playedWrong', none: 'playedNoAnswer' } as const;
const VERDICT_MARK = { right: '✓', wrong: '✗', none: '–' } as const;

function Answers({ questions }: { questions: PlayedQuestion[] }): JSX.Element {
  return (
    <section className="panel played-answers">
      <h2>{t('playedMineTitle')}</h2>
      <ol className="played-answer-list">
        {questions.map((question) => {
          const verdict = verdictOf(question);
          return (
            <li key={question.index} className={verdict === null ? undefined : VERDICT_CLASS[verdict]}>
              <p className="played-answer-head">
                <span className="meta">{t('playedQuestionNo', { number: question.index + 1 })}</span>
                {verdict !== null && (
                  <span className="tag played-verdict">
                    <span aria-hidden="true">{VERDICT_MARK[verdict]} </span>
                    {t(VERDICT_TEXT[verdict])}
                  </span>
                )}
              </p>
              <p className="played-answer-text" dir="auto">
                {question.text}
              </p>
              {question.mine.map((row, at) => (
                <p key={at} className="played-answer-mine" dir="auto">
                  {t('playedYourAnswer', { answer: answerText(row.answer, row.spare ?? question.question) })}
                </p>
              ))}
              {scored(question) && (
                <p className="meta" dir="auto">
                  {t('correctAnswer', { answer: correctText(question.question) })}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** /me/:id (79): зіграна гра — місце, підсумкова таблиця (як на фінальному екрані) і власні відповіді гравця. */
export function PlayedGame(): JSX.Element {
  const { id = '' } = useParams();
  const state = usePrivateData(() => getPlayedGame(id), id);
  useDocumentTitle(state.status === 'ready' ? state.data.title : null);

  if (state.status === 'signed-out') return <Navigate to={`/login?next=${encodeURIComponent(`/me/${id}`)}`} replace />;

  const back = (
    <header className="bar">
      <BackLink parent="/me" />
    </header>
  );
  if (state.status !== 'ready') {
    return (
      <main className="app wide">
        {back}
        {state.status === 'loading' ? <Loading /> : <LoadError message={state.message} onRetry={state.retry} />}
      </main>
    );
  }

  const game = state.data;
  return (
    <main className="app wide played-game">
      {back}
      <h1 className="brand" dir="auto">
        {game.title}
      </h1>
      <p className="meta">{`${formatDate(game.startedAt)}, ${t('playedAsYou', { nickname: game.nickname })}`}</p>
      {game.autopilot && <p className="meta autopilot-mark">{t('historyAutopilot')}</p>}
      <p className="place">
        {game.rank === null ? t('noPlace') : t('placeOf', { rank: game.rank, total: game.playerCount })}
        {game.team !== null && <span className="tag team-chip">{t('myGamesTeam', { name: game.team })}</span>}
      </p>
      <p className="meta">{`${num(game.score)} ${countText('pointsWord', game.score)}`}</p>
      <Link className="quiet-link" to="/profile/stats">
        {t('playedStatsLink')}{' '}
        <span className="flip-rtl" aria-hidden="true">
          ›
        </span>
      </Link>

      <section className="panel">
        <h2>{t('standingsTitle')}</h2>
        <ol className="standings stacked">
          {game.standings.map((row, at) => (
            <li key={at} className={row.me ? 'is-me' : undefined}>
              <span className="rank">{row.rank ?? '–'}</span>
              <span className="name" dir="auto">
                {row.nickname}
                {row.members !== undefined && row.members.length > 0 && (
                  <>
                    <span className="sr-only">, </span>
                    <small className="team-members">{t('historyMembers', { names: row.members.join(', ') })}</small>
                  </>
                )}
              </span>
              <span className="score" dir="ltr">
                {num(row.score)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {game.questions.length > 0 && <Answers questions={game.questions} />}
    </main>
  );
}
