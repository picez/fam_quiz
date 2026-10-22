import { Link } from 'react-router-dom';
import type { GameInvite } from '@quiz/shared';
import { dismissInvite } from '../api';
import { t } from '../i18n';
import { Avatar } from './Avatar';

/** Блок «Вас запросили» угорі профілю; порожній список не малює нічого. */
export function InviteList({ invites, onDismissed }: { invites: GameInvite[]; onDismissed: (code: string) => void }) {
  if (invites.length === 0) return null;
  return (
    <section className="profile-section invite-list">
      <h2>{t('invitesTitle')}</h2>
      <ul>
        {invites.map((invite) => (
          <li key={invite.code}>
            <Avatar profile={invite.host} size="small" />
            <span className="invite-text">
              {t('inviteLine', { host: invite.host.nickname, title: invite.title, code: `${invite.code.slice(0, 3)} ${invite.code.slice(3)}` })}
            </span>
            <span className="invite-actions">
              <Link className="btn btn-small btn-primary" to={`/play/${invite.code}`}>
                {t('inviteJoin')}
              </Link>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  void dismissInvite(invite.code).then(() => onDismissed(invite.code));
                }}
              >
                {t('inviteDismiss')}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
