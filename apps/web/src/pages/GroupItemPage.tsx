import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { GroupDetail, GroupItem } from '@quiz/shared';
import { createGroupItem, getGroup, getGroupItems, updateGroupItem } from '../api';
import { ItemForm } from '../groups/ItemForm';
import { t } from '../i18n';
import { loginFor, ProfileSubpage } from '../profile/ProfileSubpage';
import { usePrivateData } from '../usePrivateData';

type Loaded = { group: GroupDetail; item: GroupItem | null };

/** Новий запис (/profile/groups/:id/new) і зміна свого (/profile/groups/:id/items/:itemId) (12k). */
export function GroupItemPage() {
  const { id = '', itemId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const back = `/profile/groups/${encodeURIComponent(id)}`;
  const state = usePrivateData<Loaded>(async () => {
    const group = await getGroup(id);
    if (!group.ok) return group;
    const { ok: _ok, ...detail } = group;
    if (itemId === undefined) return { ok: true, data: { group: detail as GroupDetail, item: null } };
    const items = await getGroupItems(id);
    if (!items.ok) return items;
    // Чужий чи невидимий запис змінювати не можна: його немає серед своїх.
    const item = items.data.find((each) => each.id === itemId && each.mine);
    return item === undefined ? { ok: false, error: 'item_not_found' } : { ok: true, data: { group: detail as GroupDetail, item } };
  }, `${id}:${itemId ?? ''}`);

  if (state.status === 'signed-out') return <Navigate to={loginFor(location.pathname + location.search)} replace />;
  const title = itemId === undefined ? t('itemNewTitle') : t('itemEditTitle');
  return (
    <ProfileSubpage title={title} back={back} className="group-item-page">
      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <ItemForm
          members={state.data.group.members}
          initial={state.data.item ?? undefined}
          onCancel={() => navigate(back)}
          onSubmit={async (input) => {
            const item = state.data.item;
            const result = item === null ? await createGroupItem(id, input) : await updateGroupItem(id, item.id, input);
            if (!result.ok) return result.error;
            navigate(back);
            return null;
          }}
        />
      )}
    </ProfileSubpage>
  );
}
