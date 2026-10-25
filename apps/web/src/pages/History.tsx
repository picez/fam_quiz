import { Link, Navigate } from 'react-router-dom';
import { listGames } from '../api';
import { formatDate } from '../format';
import { t } from '../i18n';
import { usePrivateData } from '../usePrivateData';
import { HistoryTabs } from './HistoryTabs';

export function History() {
  const state = usePrivateData(listGames);

  if (state.status === 'signed-out') return <Navigate to="/login?next=%2Fhistory" replace />;

  return (
    <main className="app wide">
      <HistoryTabs />
      <h1 className="brand">{t('historyTitle')}</h1>

      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && state.data.length === 0 && <p className="lead">{t('historyEmpty')}</p>}
      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="quiz-list">
          {state.data.map((game) => (
            <li className="panel" key={game.id}>
              <h2>
                <Link to={`/history/${game.id}`}>{game.title}</Link>
              </h2>
              <p className="meta">{`${formatDate(game.startedAt)}, ${t(`status_${game.status}`)}`}</p>
              {game.teams && <p className="meta team-game-mark">{t('historyTeamGame')}</p>}
              <p className="meta">{t('playersCount', { count: game.playerCount })}</p>
              <p className="meta">{t('questionsProgress', { played: game.questionsPlayed, total: game.questionCount })}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
