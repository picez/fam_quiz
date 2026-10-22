import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameInvite } from '@quiz/shared';
import { dismissInvite } from '../api';
import { errorText, t } from '../i18n';
import { Avatar } from './Avatar';

/** Блок «Вас запросили» угорі профілю; порожній список не малює нічого. */
export function InviteList({ invites, onDismissed }: { invites: GameInvite[]; onDismissed: (code: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  if (invites.length === 0) return null;
  const dismiss = async (code: string) => {
    const result = await dismissInvite(code);
    if (result.ok) {
      setError(null);
      onDismissed(code);
    } else setError(errorText(result.error));
  };
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
                onClick={() => void dismiss(invite.code)}
              >
                {t('inviteDismiss')}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
