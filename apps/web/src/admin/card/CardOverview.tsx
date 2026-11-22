import type { JSX } from 'react';
import type { AdminUserDetail } from '@quiz/shared';
import { formatDate, num } from '../../format';
import { t } from '../../i18n';
import { Avatar } from '../../profile/Avatar';
import { CardFold } from './CardFold';

/** Огляд (58): аватар, реєстрація, остання активність, рівень і лічильники. */
export function CardOverview({ detail }: { detail: AdminUserDetail }): JSX.Element {
  const { user, card } = detail;
  const o = card.overview;
  return (
    <CardFold title={t('adminCardOverview')} open className="admin-card-overview">
      <div className="admin-card-grid">
        <Avatar profile={{ id: user.id, nickname: user.nickname, avatar: o.avatar }} size="medium" />
        <div>
          <p className="meta">{t('adminCardRegistered', { date: formatDate(o.registeredAt) })}</p>
          <p className="meta">{o.lastSeenAt === null ? t('adminCardNeverSeen') : t('adminCardLastSeen', { date: formatDate(o.lastSeenAt) })}</p>
          <p>
            <strong>{t('adminCardLevel', { level: o.level, xp: num(o.xp) })}</strong>
          </p>
          <p className="meta">{t('adminCardCounts', { games: num(o.games), wins: num(o.wins), quizzes: num(o.quizzes), friends: num(o.friends), groups: num(o.groups) })}</p>
        </div>
      </div>
    </CardFold>
  );
}
