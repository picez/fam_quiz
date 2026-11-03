import type { JSX } from 'react';
import { Navigate } from 'react-router-dom';
import { t, type TextKey } from '../i18n';
import { adminStats } from './admin-api';
import { useAdminData } from './useAdminData';
import { nickText } from '../nick';

function Stat({ label, value }: { label: TextKey; value: number }): JSX.Element {
  return (
    <div className="admin-stat">
      <dt>{t(label)}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function AdminStats(): JSX.Element {
  const state = useAdminData(adminStats, 'stats');
  if (state.status === 'home') return <Navigate to="/" replace />;
  if (state.status === 'loading') return <p className="meta">{t('loading')}</p>;
  if (state.status === 'error') {
    return (
      <>
        <p className="error" role="alert">
          {state.message}
        </p>
        <button type="button" className="btn" onClick={state.reload}>
          {t('prizesRetry')}
        </button>
      </>
    );
  }
  const { users, games, quizzes, topQuizzes } = state.data;
  return (
    <>
      <dl className="admin-stats">
        <Stat label="adminUsersTotal" value={users.total} />
        <Stat label="adminUsersNew7" value={users.new7} />
        <Stat label="adminUsersNew30" value={users.new30} />
        <Stat label="adminOnline" value={users.online} />
        <Stat label="adminGamesLive" value={games.live} />
        <Stat label="adminGamesToday" value={games.today} />
        <Stat label="adminGames7" value={games.days7} />
        <Stat label="adminGames30" value={games.days30} />
        <Stat label="adminQuizzesTotal" value={quizzes.total} />
      </dl>
      <h2>{t('adminTopQuizzes')}</h2>
      <ol className="admin-top">
        {topQuizzes.map((quiz) => (
          <li key={quiz.id}>{t('adminTopRow', { title: quiz.title, author: nickText(quiz.author), count: quiz.games })}</li>
        ))}
      </ol>
    </>
  );
}
