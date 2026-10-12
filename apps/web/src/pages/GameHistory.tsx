import { Link, Navigate, useParams } from 'react-router-dom';
import { getGame } from '../api';
import { formatDate } from '../format';
import { t } from '../i18n';
import { usePrivateData } from '../usePrivateData';

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
                <span className="score">{row.score}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {game.questions.length > 0 && (
        <section className="panel">
          <h2>{t('questionsTitle')}</h2>
          <ol className="rows stacked">
            {game.questions.map((question) => (
              <li key={question.index}>
                <span className="rank">{question.index + 1}</span>
                <span className="name">{question.text}</span>
                <span className="tag">{t('answeredStat', { answered: question.answered, accepted: question.accepted })}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
