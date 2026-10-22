import { gameStats } from '@quiz/shared';
import { Link, Navigate } from 'react-router-dom';
import { myHistory } from '../api';
import { formatDate } from '../format';
import { countText, t } from '../i18n';
import { usePrivateData } from '../usePrivateData';

export function MyGames() {
  const state = usePrivateData(myHistory);

  if (state.status === 'signed-out') return <Navigate to="/login?next=%2Fme" replace />;

  const summary = state.status === 'ready' && state.data.length > 0 ? gameStats(state.data) : null;

  return (
    <main className="app wide">
      <header className="bar">
        <Link className="quiet-link" to="/">
          {t('backHome')}
        </Link>
      </header>
      <h1 className="brand">{t('myGamesTitle')}</h1>

      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && state.data.length === 0 && <p className="lead">{t('myGamesEmpty')}</p>}

      {summary !== null && (
        <dl className="stats">
          <div className="stat">
            <dd>{summary.games}</dd>
            <dt>{countText('statGames', summary.games)}</dt>
          </div>
          <div className="stat">
            <dd>{summary.wins}</dd>
            <dt>{countText('statWins', summary.wins)}</dt>
          </div>
          <div className="stat">
            <dd>{summary.accuracy === null ? '–' : `${summary.accuracy}%`}</dd>
            <dt>{t('statAccuracy')}</dt>
          </div>
        </dl>
      )}

      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="quiz-list">
          {state.data.map((game) => (
            <li className="panel" key={`${game.gameId}:${game.nickname}`}>
              <h2>{game.title}</h2>
              <p className="meta">{`${formatDate(game.startedAt)}, ${t(`status_${game.status}`)}, ${t('playedAs', { nickname: game.nickname })}`}</p>
              <p className="place">
                {game.rank === null ? t('noPlace') : t('placeOf', { rank: game.rank, total: game.playerCount })}
              </p>
              <p>{t('yourResult', { score: game.score, points: countText('pointsWord', game.score), correct: game.correct, total: game.questionsPlayed })}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
