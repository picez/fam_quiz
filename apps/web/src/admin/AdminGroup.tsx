import { useState, type JSX } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ADMIN_REASON_MAX, GROUP_LIMITS, type AdminGroupDetail, type AdminGroupItem, type AdminGroupMember } from '@quiz/shared';
import type { ApiData } from '../api';
import { formatDate } from '../format';
import { errorText, t, type TextKey } from '../i18n';
import { nickText } from '../nick';
import { AdminPager } from './Admin';
import { adminGroup, deleteGroupAsAdmin, passGroupOwner, removeGroupMember, setGroupHidden, setGroupItemHidden } from './admin-api';
import { GroupRowCard } from './AdminGroups';
import { useAdminData } from './useAdminData';

/** Помилки дії, після яких картка застаріла (людини чи запису вже немає, власник змінився): перечитати. */
const STALE_ERRORS = new Set(['member_not_found', 'item_not_found', 'owner_must_transfer']);

/** Картка сімейної групи (63): стан, ховання з причиною, учасники, записи сторінками й видалення за назвою. */
export function AdminGroup(): JSX.Element {
  const { id = '' } = useParams();
  const [page, setPage] = useState(1);
  // keep: перечитування після дії не ховає картку — набрана причина й назва лишаються.
  const state = useAdminData(() => adminGroup(id, page), `${id}:${page}`, { keep: true });
  if (state.status === 'home') return <Navigate to="/" replace />;
  if (state.status === 'loading') return <p className="meta">{t('loading')}</p>;
  if (state.status === 'error') {
    return (
      <>
        <Link className="quiet-link" to="/admin/groups">
          {t('adminGroupBack')}
        </Link>
        <p className="error" role="alert">
          {state.message}
        </p>
        <button type="button" className="btn" onClick={state.reload}>
          {t('prizesRetry')}
        </button>
      </>
    );
  }
  return <GroupView detail={state.data} reload={state.reload} onPage={setPage} />;
}

type Run = () => Promise<ApiData<unknown>>;

function GroupView({ detail, reload, onPage }: { detail: AdminGroupDetail; reload: () => void; onPage: (page: number) => void }): JSX.Element {
  const { group, members, items } = detail;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  /** Підтвердження (null — без нього, дія зворотна) → запит → перечитування; not_found — на головну, інша помилка — у рядок-тривогу. */
  const act = async (confirmText: string | null, run: Run, report: (message: string | null) => void = setError): Promise<boolean> => {
    if (confirmText !== null && !window.confirm(confirmText)) return false;
    setBusy(true);
    report(null);
    const result = await run();
    setBusy(false);
    if (result.ok) return true;
    if (result.error === 'not_found') setGone(true);
    else report(errorText(result.error));
    if (STALE_ERRORS.has(result.error)) reload();
    return false;
  };
  const actAndReload = async (confirmText: string | null, run: Run) => {
    if (await act(confirmText, run)) reload();
  };
  const remove = async () => {
    if (await act(t('adminGroupDeleteConfirm', { name: group.name }), () => deleteGroupAsAdmin(group.id, typed.trim()), setDeleteError)) navigate('/admin/groups');
  };

  if (gone) return <Navigate to="/" replace />;
  const matches = typed.trim() !== '' && typed.trim() === group.name.trim();
  return (
    <div className="admin-player-card">
      <Link className="quiet-link" to="/admin/groups">
        {t('adminGroupBack')}
      </Link>
      <ul className="admin-list is-rows">
        <GroupRowCard row={group} link={false} />
      </ul>
      <p className="error admin-action-line" role="alert">
        {error ?? ''}
      </p>

      <section className="panel admin-card-section">
        {group.hidden === null ? (
          <>
            <label className="field" htmlFor="admin-group-reason">
              <span>{t('adminGroupHideReason')}</span>
              <textarea id="admin-group-reason" value={reason} maxLength={ADMIN_REASON_MAX} rows={2} onChange={(event) => setReason(event.target.value)} />
            </label>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void actAndReload(t('adminGroupHideConfirm', { name: group.name }), () => setGroupHidden(group.id, true, reason))}>
              {t('adminGroupHide')}
            </button>
          </>
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => void actAndReload(null, () => setGroupHidden(group.id, false, ''))}>
            {t('adminGroupRestore')}
          </button>
        )}
      </section>

      <section className="panel admin-card-section">
        <h2>{t('adminGroupMembersTitle')}</h2>
        <ul className="admin-list is-rows">
          {members.map((member) => (
            <MemberRow key={member.id} member={member} groupName={group.name} busy={busy} act={actAndReload} groupId={group.id} />
          ))}
        </ul>
      </section>

      <section className="panel admin-card-section">
        <h2>{t('adminGroupItems')}</h2>
        {items.rows.length === 0 ? (
          <p className="meta">{t('adminGroupItemsEmpty')}</p>
        ) : (
          <ul className="admin-list is-rows">
            {items.rows.map((item) => (
              <ItemRow key={item.id} item={item} busy={busy} onToggle={() => void actAndReload(null, () => setGroupItemHidden(group.id, item.id, !item.hidden))} />
            ))}
          </ul>
        )}
        <AdminPager page={items.page} pages={items.pages} onPage={onPage} />
      </section>

      <section className="panel admin-card-section admin-card-delete admin-group-delete">
        <h2>{t('adminGroupDelete')}</h2>
        <p>{t('adminGroupDeleteLead')}</p>
        <label className="field" htmlFor="admin-group-delete-name">
          <span dir="auto">{t('adminGroupDeleteType', { name: group.name })}</span>
          <input id="admin-group-delete-name" type="text" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} maxLength={GROUP_LIMITS.nameMax + 10} />
        </label>
        <button type="button" className="btn btn-danger" disabled={busy || !matches} onClick={() => void remove()}>
          {t('adminGroupDelete')}
        </button>
        <p className="error admin-card-line" role="alert">
          {deleteError ?? ''}
        </p>
      </section>
    </div>
  );
}

function MemberRow({ member, groupId, groupName, busy, act }: { member: AdminGroupMember; groupId: string; groupName: string; busy: boolean; act: (confirmText: string | null, run: Run) => Promise<void> }): JSX.Element {
  const name = nickText(member.nickname);
  return (
    <li className="admin-card">
      <h3>
        <Link to={`/admin/users/${encodeURIComponent(member.id)}`} dir="auto">
          {name}
        </Link>
      </h3>
      {member.role === 'owner' && <p className="meta">{t('groupRoleOwner')}</p>}
      <p className="meta">{formatDate(member.joinedAt)}</p>
      {member.banned && <p className="admin-mark is-banned">{t('adminGroupBanned')}</p>}
      {member.role !== 'owner' && (
        <div className="admin-actions">
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(t('adminGroupRemoveConfirm', { name, group: groupName }), () => removeGroupMember(groupId, member.id))}>
            {t('adminGroupRemove')}
          </button>
          {!member.banned && (
            <button type="button" className="btn" disabled={busy} onClick={() => void act(t('adminGroupMakeOwnerConfirm', { name, group: groupName }), () => passGroupOwner(groupId, member.id))}>
              {t('adminGroupMakeOwner')}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function ItemRow({ item, busy, onToggle }: { item: AdminGroupItem; busy: boolean; onToggle: () => void }): JSX.Element {
  return (
    <li className="admin-card">
      <p className="meta">
        <span>{t(`itemKind_${item.kind}` as TextKey)}</span> · <span>{formatDate(item.createdAt)}</span>
      </p>
      <blockquote className="admin-note" dir="auto">
        {item.text}
      </blockquote>
      <p className="meta" dir="auto">
        {t('itemBy', { name: item.author === null ? t('deletedPlayer') : nickText(item.author) })}
      </p>
      {item.surprise && <p className="admin-mark">{t('adminGroupSurprise')}</p>}
      {item.hidden && <p className="admin-mark is-banned">{t('adminGroupHidden')}</p>}
      <button type="button" className={item.hidden ? 'btn' : 'btn btn-danger'} disabled={busy} onClick={onToggle}>
        {item.hidden ? t('adminGroupItemShow') : t('adminGroupItemHide')}
      </button>
    </li>
  );
}
