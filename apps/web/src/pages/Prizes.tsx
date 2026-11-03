import type { PrizeContent, PrizeItem } from '@quiz/shared';
import { useState, type JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { createPrize, deletePrize, myPrizes, updatePrize } from '../api';
import { errorText, t } from '../i18n';
import { PrizeEditor } from '../prizes/PrizeEditor';
import { loginFor, ProfileSubpage } from '../profile/ProfileSubpage';
import { Showcase } from '../profile/Showcase';
import { useMyProfile } from '../profile/useMyProfile';
import { prizeSummary } from '../trophy/trophy-meta';
import { usePrivateData, type PrivateData } from '../usePrivateData';

/** Підсторінка «Призи» (/profile/prizes і аліас /prizes): виграні нагороди й склад призів для своїх ігор. */
export function Prizes(): JSX.Element {
  const location = useLocation();
  const store = usePrivateData(myPrizes);
  const { state: profile } = useMyProfile();
  if (store.status === 'signed-out' || profile.status === 'signed-out') return <Navigate to={loginFor(location.pathname)} replace />;
  return (
    <ProfileSubpage title={t('profileTilePrizes')} className="prizes-page">
      {profile.status === 'ready' && profile.data.showcase.awards.length === 0 && profile.data.showcase.title === null ? (
        <section className="profile-section showcase is-own">
          <h2>{t('showcaseTitle')}</h2>
          <p className="meta">{t('noAwardsYet')}</p>
        </section>
      ) : profile.status === 'ready' ? (
        <Showcase showcase={profile.data.showcase} own />
      ) : (
        <Pending state={profile} title={t('showcaseTitle')} />
      )}
      {store.status === 'ready' ? <Store initial={store.data} /> : <Pending state={store} title={t('prizesTitle')} />}
    </ProfileSubpage>
  );
}

/** Розділ, дані якого ще вантажаться чи не завантажились. */
function Pending({ state, title }: { state: PrivateData<unknown>; title: string }): JSX.Element {
  return (
    <section className="profile-section">
      <h2>{title}</h2>
      {state.status === 'error' ? (
        <p className="error" role="alert">
          {state.message}
        </p>
      ) : (
        <p className="meta">{t('loading')}</p>
      )}
    </section>
  );
}

/** Що робить з редактором сторінка: нічого, новий приз чи зміна наявного. */
type Editing = { mode: 'none' } | { mode: 'new' } | { mode: 'edit'; item: PrizeItem };

function Store({ initial }: { initial: PrizeItem[] }): JSX.Element {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<Editing>({ mode: 'none' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (content: PrizeContent) => {
    setBusy(true);
    setError(null);
    const result = editing.mode === 'edit' ? await updatePrize(editing.item.id, content) : await createPrize(content);
    setBusy(false);
    if (!result.ok) return setError(errorText(result.error));
    const { ok: _ok, ...saved } = result;
    setItems((list) => (editing.mode === 'edit' ? list.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...list]));
    setEditing({ mode: 'none' });
  };

  const remove = async (item: PrizeItem) => {
    if (!window.confirm(t('prizeDeleteConfirm', { name: item.content.name }))) return;
    setError(null);
    const result = await deletePrize(item.id);
    if (!result.ok) return setError(errorText(result.error));
    setItems((list) => list.filter((entry) => entry.id !== item.id));
    setEditing((current) => (current.mode === 'edit' && current.item.id === item.id ? { mode: 'none' } : current));
  };

  return (
    <section className="profile-section prize-store">
      <h2>{t('prizesTitle')}</h2>
      {editing.mode === 'none' ? (
        <div className="toolbar">
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ mode: 'new' })}>
            {t('prizeNew')}
          </button>
        </div>
      ) : (
        <PrizeEditor
          key={editing.mode === 'edit' ? editing.item.id : 'new'}
          initial={editing.mode === 'edit' ? editing.item.content : null}
          busy={busy}
          onSave={(content) => void save(content)}
          onCancel={() => {
            setError(null);
            setEditing({ mode: 'none' });
          }}
        />
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="meta">{t('prizesEmpty')}</p>
      ) : (
        <ul className="prize-list">
          {items.map((item) => (
            <li key={item.id} className="prize-card">
              <div className="prize-card-text">
                <strong>{item.content.name}</strong>
                <span className="meta">{prizeSummary(item.content)}</span>
                {item.status === 'reserved' && (
                  <span className="prize-badge">{t(item.inSavedGame === true ? 'prizeInSavedGame' : 'prizeInGame')}</span>
                )}
              </div>
              <div className="toolbar">
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={item.status === 'reserved'}
                  onClick={() => {
                    setError(null);
                    setEditing({ mode: 'edit', item });
                  }}
                >
                  {t('prizeEdit')}
                </button>
                <button type="button" className="btn btn-small btn-danger" onClick={() => void remove(item)}>
                  {t('prizeDelete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
