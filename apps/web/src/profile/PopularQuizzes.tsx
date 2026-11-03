import type { OwnProfile } from '@quiz/shared';
import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { countText, t } from '../i18n';

/** Вікторини власника: сервер віддає найзіграніші першими; limit — скільки показати (без нього — усі). */
export function PopularQuizzes({ quizzes, limit }: { quizzes: OwnProfile['quizzes']; limit?: number }): JSX.Element {
  if (quizzes.length === 0) return <p className="meta">{t('noQuizzesYet')}</p>;
  const shown = limit === undefined ? quizzes : quizzes.slice(0, limit);
  return (
    <ul className="profile-list popular-quizzes">
      {shown.map((quiz) => (
        <li key={quiz.id}>
          <Link to={`/quizzes/${quiz.id}`}>
            <bdi>{quiz.title}</bdi>{' '}
            <span className="flip-rtl" aria-hidden="true">
              →
            </span>
          </Link>{' '}
          <span className="meta">{`${quiz.plays} ${countText('statGames', quiz.plays)}`}</span>
        </li>
      ))}
    </ul>
  );
}
