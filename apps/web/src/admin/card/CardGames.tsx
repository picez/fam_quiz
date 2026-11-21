import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import type { AdminUserDetail } from '@quiz/shared';
import { formatDate, num } from '../../format';
import { countText, t } from '../../i18n';
import { nickText } from '../../nick';
import { CardFold } from './CardFold';

/** Останні ігри (→ адмінський перегляд гри), вікторини (→ перегляд вікторини) й історія банів (58). */
export function CardGames({ detail }: { detail: AdminUserDetail }): JSX.Element {
  const { games, quizzes, bans } = detail.card;
  return (
    <>
      <CardFold title={t('adminCardGames')} count={games.length}>
        {games.length === 0 ? (
          <p className="meta">{t('adminCardNoGames')}</p>
        ) : (
          <ul className="admin-card-lines">
            {games.map((game) => (
              <li key={game.gameId}>
                <Link to={`/admin/games/${encodeURIComponent(game.gameId)}`} dir="auto">
                  {game.title}
                </Link>
                <span className="meta">{t('adminCardGameLine', { date: formatDate(game.startedAt), place: game.rank ?? '–', of: game.playerCount, score: num(game.score) })}</span>
              </li>
            ))}
          </ul>
        )}
      </CardFold>
      <CardFold title={t('adminCardQuizzes')} count={quizzes.length}>
        {quizzes.length === 0 ? (
          <p className="meta">{t('adminCardNoQuizzes')}</p>
        ) : (
          <ul className="admin-card-lines">
            {quizzes.map((quiz) => (
              <li key={quiz.id}>
                <Link to={`/admin/quizzes/${encodeURIComponent(quiz.id)}`} dir="auto">
                  {quiz.title}
                </Link>
                <span className="meta">{`${countText('questionCount', quiz.questions, { count: quiz.questions })} · ${formatDate(quiz.updatedAt)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </CardFold>
      <CardFold title={t('adminCardBans')} count={bans.length}>
        {bans.length === 0 ? (
          <p className="meta">{t('adminCardNoBans')}</p>
        ) : (
          <ul className="admin-card-lines">
            {bans.map((ban, at) => (
              <li key={at}>
                <span>{t(ban.kind === 'ban' ? 'adminCardBanLine' : 'adminCardUnbanLine', { date: formatDate(ban.at), admin: nickText(ban.admin) })}</span>
                {ban.reason !== null && <span className="meta">{t('adminReasonShown', { reason: ban.reason })}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardFold>
    </>
  );
}
