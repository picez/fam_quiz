import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { GROUP_LIMITS, type GroupInviteCard, type GroupsPage } from '@quiz/shared';
import { acceptGroupInvite, createGroup, declineGroupInvite, getGroups } from '../api';
import { GroupForm } from '../groups/GroupForm';
import { countText, errorText, t } from '../i18n';
import { nickText } from '../nick';
import { Avatar } from '../profile/Avatar';
import { loginFor, ProfileSubpage } from '../profile/ProfileSubpage';
import { announceGroupInvitesChanged } from '../useGroupInvites';
import { usePrivateData } from '../usePrivateData';

async function loadGroups() {
  const result = await getGroups();
  return result.ok ? { ok: true as const, data: { groups: result.groups, invites: result.invites } } : result;
}

/** «Групи» (12k): запрошення, картки моїх груп і «Створити групу». */
export function Groups() {
  const location = useLocation();
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const state = usePrivateData<GroupsPage>(loadGroups, String(version));
  const [declined, setDeclined] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (state.status === 'signed-out') return <Navigate to={loginFor(location.pathname + location.search)} replace />;

  const accept = async (invite: GroupInviteCard) => {
    const result = await acceptGroupInvite(invite.group.id);
    if (!result.ok) {
      setError(errorText(result.error));
      // Запрошення могло зникнути (група видалена, скасоване): перечитуємо список, помилка лишається.
      setVersion((v) => v + 1);
      announceGroupInvitesChanged();
      return;
    }
    announceGroupInvitesChanged();
    navigate(`/profile/groups/${encodeURIComponent(invite.group.id)}`);
  };
  const decline = async (invite: GroupInviteCard) => {
    const result = await declineGroupInvite(invite.group.id);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    setError(null);
    setDeclined((ids) => [...ids, invite.group.id]);
    announceGroupInvitesChanged();
  };

  return (
    <ProfileSubpage title={t('profileTileGroups')} className="groups-page">
      <p className="meta groups-intro">{t('groupsIntro')}</p>
      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          {state.data.invites.some((invite) => !declined.includes(invite.group.id)) && (
            <section className="profile-section group-invites">
              <h2>{t('groupsInvitesTitle')}</h2>
              <ul>
                {state.data.invites
                  .filter((invite) => !declined.includes(invite.group.id))
                  .map((invite) => (
                    <li key={invite.group.id}>
                      {invite.from !== null && <Avatar profile={invite.from} size="small" />}
                      <span className="invite-text">
                        {t('groupInviteLine', { from: invite.from === null ? t('groupFormerMember') : nickText(invite.from.nickname), emoji: invite.group.emoji, name: invite.group.name })}
                      </span>
                      <span className="invite-actions">
                        <button type="button" className="btn btn-small btn-primary" onClick={() => void accept(invite)}>
                          {t('groupInviteAccept')}
                        </button>
                        <button type="button" className="btn btn-small" onClick={() => void decline(invite)}>
                          {t('groupInviteDecline')}
                        </button>
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
          {error !== null && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {state.data.groups.length === 0 ? (
            <p className="meta groups-empty">{t('groupsEmpty')}</p>
          ) : (
            <ul className="group-cards">
              {state.data.groups.map((group) => (
                <li key={group.id}>
                  <Link className="group-card" to={`/profile/groups/${encodeURIComponent(group.id)}`}>
                    <span className="group-card-emoji" aria-hidden="true">
                      {group.emoji}
                    </span>
                    <span className="group-card-body">
                      <h2 className="group-card-name">{group.name}</h2>
                      <span className="meta">
                        {countText('groupPeople', group.people, { count: group.people })} · {countText('groupItems', group.items, { count: group.items })}
                        {group.role === 'owner' && ` · ${t('groupRoleOwner')}`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {creating ? (
            <section className="profile-section group-create">
              <GroupForm
                submit="groupCreateSubmit"
                onCancel={() => setCreating(false)}
                onSubmit={async (input) => {
                  const result = await createGroup(input);
                  if (!result.ok) return result.error;
                  navigate(`/profile/groups/${encodeURIComponent(result.id)}`);
                  return null;
                }}
              />
            </section>
          ) : (
            <div className="groups-create">
              <button
                type="button"
                className="btn btn-primary"
                disabled={state.data.groups.length >= GROUP_LIMITS.groupsPerUser}
                onClick={() => setCreating(true)}
              >
                {t('groupsCreate')}
              </button>
              {state.data.groups.length >= GROUP_LIMITS.groupsPerUser && <p className="meta">{t('err_too_many_groups')}</p>}
            </div>
          )}
        </>
      )}
    </ProfileSubpage>
  );
}
