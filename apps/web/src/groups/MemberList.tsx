import { useState } from 'react';
import type { GroupDetail } from '@quiz/shared';
import { leaveGroup, removeGroupMember, transferGroup } from '../api';
import { errorText, t } from '../i18n';
import { nickText } from '../nick';
import { Avatar } from '../profile/Avatar';

/**
 * «Учасники» групи (12k): власник першим з «керує групою», «це ти» біля себе; власнику — «Передати керування» й «Вилучити»
 * біля інших; унизу «Вийти з групи» (власнику неактивна, доки не передасть керування).
 */
export function MemberList({ group, onChanged, onLeft }: { group: GroupDetail; onChanged: () => void; onLeft: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const owner = group.role === 'owner';

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, after: () => void) => {
    const result = await action();
    if (result.ok) {
      setError(null);
      after();
    } else setError(errorText(result.error ?? 'unknown'));
  };

  const hand = (id: string, name: string) => {
    if (!window.confirm(t('groupMakeOwnerConfirm', { name }))) return;
    void run(() => transferGroup(group.id, id), onChanged);
  };
  const remove = (id: string, name: string) => {
    if (!window.confirm(t('groupMemberRemoveConfirm', { name }))) return;
    void run(() => removeGroupMember(group.id, id), onChanged);
  };
  const leave = () => {
    if (!window.confirm(t('groupLeaveConfirm', { name: group.name }))) return;
    void run(() => leaveGroup(group.id), onLeft);
  };

  return (
    <section className="profile-section group-members">
      <ul className="group-member-list">
        {group.members.map((member) => {
          const name = nickText(member.nickname);
          return (
            <li key={member.id}>
              <Avatar profile={member} size="small" />
              <span className="group-member-name">
                {name}
                {member.role === 'owner' && <span className="meta"> · {t('groupRoleOwner')}</span>}
                {member.you && <span className="meta"> · {t('groupYou')}</span>}
              </span>
              {owner && !member.you && (
                <span className="group-member-actions">
                  <button type="button" className="btn btn-small" onClick={() => hand(member.id, name)}>
                    {t('groupMakeOwner')}
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => remove(member.id, name)}>
                    {t('groupMemberRemove')}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="group-leave">
        <button type="button" className="btn" disabled={owner} aria-describedby={owner ? 'group-owner-leave-hint' : undefined} onClick={leave}>
          {t('groupLeave')}
        </button>
        {owner && (
          <p className="meta" id="group-owner-leave-hint">
            {t('groupOwnerLeaveHint')}
          </p>
        )}
      </div>
    </section>
  );
}
