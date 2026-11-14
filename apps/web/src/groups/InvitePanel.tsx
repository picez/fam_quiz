import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import type { FriendCard, GroupDetail } from '@quiz/shared';
import { cancelGroupInvite, getMyFriends, inviteToGroup, refreshGroupCode } from '../api';
import { errorText, t } from '../i18n';
import { nickText } from '../nick';
import { Avatar } from '../profile/Avatar';

/** Посилання вступу в групу на цьому сайті. */
export function groupJoinUrl(code: string): string {
  return `${window.location.origin}/groups/join/${code}`;
}

/**
 * «Запросити» (12k, лише власнику): посилання з «Копіювати посилання», QR і «Нове посилання»;
 * «Запросити друзів» — друзі без учасників і запрошених; «Чекають відповіді» зі «Скасувати запрошення».
 */
export function InvitePanel({ group, onChanged }: { group: GroupDetail; onChanged: () => void }) {
  const [code, setCode] = useState(group.inviteCode ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendCard[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setCode(group.inviteCode ?? ''), [group.inviteCode]);
  const owner = group.role === 'owner';
  // Друзів просить лише власник: учасник панелі не бачить.
  useEffect(() => {
    if (!owner) return;
    let current = true;
    void getMyFriends().then((result) => {
      if (current) setFriends(result.ok ? result.data : []);
    });
    return () => {
      current = false;
    };
  }, [owner]);

  if (group.role !== 'owner' || group.inviteCode === undefined) return null;
  const url = groupJoinUrl(code);
  const pending = group.pending ?? [];
  const taken = new Set([...group.members.map((m) => m.id), ...pending.map((p) => p.user.id)]);
  const free = (friends ?? []).filter((friend) => !taken.has(friend.id));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setError(null);
      setStatus(t('groupInviteCopied'));
    } catch {
      setStatus(null);
      setError(t('groupInviteCopyFailed'));
    }
  };
  const refresh = async () => {
    if (!window.confirm(t('groupInviteRefreshConfirm'))) return;
    const result = await refreshGroupCode(group.id);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    setError(null);
    setCode(result.inviteCode);
    setStatus(t('groupInviteRefreshed'));
  };
  const send = async () => {
    const result = await inviteToGroup(group.id, picked);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    setError(null);
    setPicked([]);
    setStatus(t('groupInviteSent'));
    onChanged();
  };
  const cancel = async (userId: string) => {
    const result = await cancelGroupInvite(group.id, userId);
    if (result.ok) onChanged();
    else setError(errorText(result.error));
  };

  return (
    <section className="profile-section group-invite-panel">
      <h2>{t('groupInviteTitle')}</h2>
      <p className="meta">{t('groupInviteLinkHint')}</p>
      <input className="group-invite-link" readOnly value={url} aria-label={t('groupInviteTitle')} onFocus={(event) => event.currentTarget.select()} />
      <div className="group-invite-actions">
        {typeof navigator.clipboard?.writeText === 'function' && (
          <button type="button" className="btn btn-small btn-primary" onClick={() => void copy()}>
            {t('groupInviteCopy')}
          </button>
        )}
        <button type="button" className="btn btn-small" onClick={() => void refresh()}>
          {t('groupInviteRefresh')}
        </button>
      </div>
      <div className="group-invite-qr">
        <QRCodeSVG value={url} size={168} title={t('groupInviteQr')} bgColor="#F3EAEA" fgColor="#060505" marginSize={2} />
      </div>
      {status !== null && (
        <p className="meta" role="status">
          {status}
        </p>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <h3>{t('groupInviteFriends')}</h3>
      {friends !== null && free.length === 0 ? (
        <p className="meta">{t('groupInviteFriendsEmpty')}</p>
      ) : (
        <>
          <ul className="group-invite-friends">
            {free.map((friend) => (
              <li key={friend.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={picked.includes(friend.id)}
                    onChange={(event) => setPicked((ids) => (event.target.checked ? [...ids, friend.id] : ids.filter((id) => id !== friend.id)))}
                  />
                  <Avatar profile={friend} size="small" />
                  <span>{nickText(friend.nickname)}</span>
                </label>
              </li>
            ))}
          </ul>
          {free.length > 0 && (
            <button type="button" className="btn btn-small btn-primary" disabled={picked.length === 0} onClick={() => void send()}>
              {t('groupInviteSend')}
            </button>
          )}
        </>
      )}
      {pending.length > 0 && (
        <>
          <h3>{t('groupInvitePending')}</h3>
          <ul className="group-invite-pending">
            {pending.map((invite) => (
              <li key={invite.user.id}>
                <Avatar profile={invite.user} size="small" />
                <span className="group-member-name">{nickText(invite.user.nickname)}</span>
                <button type="button" className="btn btn-small" onClick={() => void cancel(invite.user.id)}>
                  {t('groupInviteCancel')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
