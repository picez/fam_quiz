import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { GroupDetail } from '@quiz/shared';
import { deleteGroup, getGroup, updateGroup } from '../api';
import { GroupForm } from '../groups/GroupForm';
import { InvitePanel } from '../groups/InvitePanel';
import { ItemList } from '../groups/ItemList';
import { MemberList } from '../groups/MemberList';
import { countText, t, type TextKey } from '../i18n';
import { loginFor, ProfileSubpage } from '../profile/ProfileSubpage';
import { usePrivateData } from '../usePrivateData';

type Tab = 'items' | 'people' | 'settings';
const TABS: { tab: Tab; label: TextKey }[] = [
  { tab: 'items', label: 'groupTabItems' },
  { tab: 'people', label: 'groupTabPeople' },
  { tab: 'settings', label: 'groupTabSettings' },
];

/** Сторінка групи (12k): вкладки «Записи» · «Учасники» · «Налаштування» (лише власнику); вкладка — у ?tab=. */
export function GroupPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [version, setVersion] = useState(0);
  const state = usePrivateData(async () => {
    const result = await getGroup(id);
    if (!result.ok) return result;
    const { ok: _ok, ...group } = result;
    return { ok: true as const, data: group as GroupDetail };
  }, `${id}:${version}`);
  // Збережені налаштування: сервер повертає групу, перечитувати (і губити «Збережено») не треба.
  const [saved, setSaved] = useState<{ key: string; group: GroupDetail } | null>(null);
  const reload = () => {
    setSaved(null);
    setVersion((v) => v + 1);
  };

  if (state.status === 'signed-out') return <Navigate to={loginFor(location.pathname + location.search)} replace />;
  if (state.status !== 'ready') {
    return (
      <ProfileSubpage title={null} back="/profile/groups">
        {state.status === 'loading' ? (
          <p className="meta">{t('loading')}</p>
        ) : (
          <>
            <p className="error" role="alert">
              {state.message}
            </p>
            <Link to="/profile/groups">{t('profileTileGroups')}</Link>
          </>
        )}
      </ProfileSubpage>
    );
  }

  const group = saved !== null && saved.key === `${id}:${version}` ? saved.group : state.data;
  const owner = group.role === 'owner';
  const tabs = TABS.filter((entry) => owner || entry.tab !== 'settings');
  const asked = params.get('tab');
  const tab: Tab = tabs.some((entry) => entry.tab === asked) ? (asked as Tab) : 'items';
  const open = (next: Tab) => setParams(next === 'items' ? {} : { tab: next });

  return (
    <ProfileSubpage title={`${group.emoji} ${group.name}`} back="/profile/groups" className="group-page">
      {group.description !== '' && <p className="group-description">{group.description}</p>}
      <p className="meta">
        {countText('groupPeople', group.people, { count: group.people })} · {countText('groupItems', group.items, { count: group.items })}
      </p>
      <div role="tablist" className="group-tabs" aria-label={t('groupTabsLabel')}>
        {tabs.map((entry) => (
          <button
            key={entry.tab}
            type="button"
            role="tab"
            id={`group-tab-${entry.tab}`}
            aria-selected={entry.tab === tab}
            aria-controls={`group-panel-${entry.tab}`}
            className={entry.tab === tab ? 'chip is-on' : 'chip'}
            onClick={() => open(entry.tab)}
          >
            {t(entry.label)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`group-panel-${tab}`} aria-labelledby={`group-tab-${tab}`}>
        {tab === 'items' && <ItemList group={group} />}
        {tab === 'people' && (
          <>
            <InvitePanel group={group} onChanged={reload} />
            <MemberList group={group} onChanged={reload} onLeft={() => navigate('/profile/groups')} />
          </>
        )}
        {tab === 'settings' && owner && (
          <>
            <section className="profile-section">
              <GroupForm
                initial={{ name: group.name, emoji: group.emoji, description: group.description }}
                submit="save"
                done={t('groupSaved')}
                onSubmit={async (input) => {
                  const result = await updateGroup(group.id, input);
                  if (!result.ok) return result.error;
                  const { ok: _ok, ...fresh } = result;
                  setSaved({ key: `${id}:${version}`, group: fresh as GroupDetail });
                  return null;
                }}
              />
            </section>
            <section className="profile-section group-danger">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (!window.confirm(t('groupDeleteConfirm', { name: group.name }))) return;
                  void deleteGroup(group.id).then((result) => {
                    if (result.ok) navigate('/profile/groups');
                  });
                }}
              >
                {t('groupDelete')}
              </button>
            </section>
          </>
        )}
      </div>
    </ProfileSubpage>
  );
}
