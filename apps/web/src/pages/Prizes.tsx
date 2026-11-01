import type { PrizeContent, PrizeItem } from '@quiz/shared';
import { useState, type JSX } from 'react';
import { Navigate } from 'react-router-dom';
import { createPrize, deletePrize, myPrizes, updatePrize } from '../api';
import { errorText, t } from '../i18n';
import { PrizeEditor } from '../prizes/PrizeEditor';
import { prizeSummary } from '../trophy/trophy-meta';
import { usePrivateData } from '../usePrivateData';

const LOGIN = '/login?next=%2Fprizes';

/** «Мої призи» (/prizes): склад призів власника. */
export function Prizes(): JSX.Element {
  const state = usePrivateData(myPrizes);
  if (state.status === 'signed-out') return <Navigate to={LOGIN} replace />;
  if (state.status === 'loading') return <main className="app wide"><p className="meta">{t('loading')}</p></main>;
  if (state.status === 'error')
    return (
      <main className="app wide">
        <p className="error" role="alert">
          {state.message}
        </p>
      </main>
    );
  return <Store initial={state.data} />;
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
  };

  return (
    <main className="app wide prizes-page">
      <h1>{t('prizesTitle')}</h1>
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
    </main>
  );
}
