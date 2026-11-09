import type { PrizeItem, Showcase as ShowcaseData } from '@quiz/shared';
import { useState, type JSX } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { deletePrize, myPrizes } from '../api';
import { errorText, t } from '../i18n';
import { loginFor, ProfileSubpage } from '../profile/ProfileSubpage';
import { PinButton } from '../profile/PinButton';
import { Showcase } from '../profile/Showcase';
import { awardCaption } from '../profile/ShowcaseShelf';
import { useMyProfile } from '../profile/useMyProfile';
import { usePins } from '../profile/usePins';
import { prizeSummary } from '../trophy/trophy-meta';
import { usePrivateData, type PrivateData } from '../usePrivateData';

/** Підсторінка «Призи» (/profile/prizes і аліас /prizes): виграні нагороди й склад призів для своїх ігор. */
export function Prizes(): JSX.Element {
  const location = useLocation();
  const store = usePrivateData(myPrizes);
  const { state: profile } = useMyProfile();
  if (store.status === 'signed-out' || profile.status === 'signed-out') return <Navigate to={loginFor(location.pathname + location.search)} replace />;
  return (
    <ProfileSubpage title={t('profileTilePrizes')} className="prizes-page">
      {profile.status === 'ready' && profile.data.showcase.awards.length === 0 && profile.data.showcase.title === null ? (
        <section className="profile-section showcase is-own">
          <h2>{t('showcaseTitle')}</h2>
          <p className="meta">{t('noAwardsYet')}</p>
        </section>
      ) : profile.status === 'ready' ? (
        <Awards showcase={profile.data.showcase} />
      ) : (
        <Pending state={profile} title={t('showcaseTitle')} />
      )}
      {store.status === 'ready' ? <Store initial={store.data} /> : <Pending state={store} title={t('prizesTitle')} />}
    </ProfileSubpage>
  );
}

/** Виграні нагороди з кнопкою 📌 на кожній; повідомлення (ліміт, помилка) — над сіткою. */
function Awards({ showcase }: { showcase: ShowcaseData }): JSX.Element {
  const { busy, message, isPinned, toggle } = usePins(showcase.pins);
  return (
    <>
      <p className="pin-message" role="status">
        {message}
      </p>
      <Showcase
        showcase={showcase}
        own
        renderPin={(award) => {
          const pin = { kind: 'prize', id: award.id } as const;
          return <PinButton pinned={isPinned(pin)} busy={busy} name={`${awardCaption(award)} · ${award.quizTitle}`} onClick={() => void toggle(pin)} />;
        }}
      />
    </>
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

/** Склад призів; новий приз і зміна наявного — у повноекранному редакторі (/profile/prizes/new, /profile/prizes/:id). */
function Store({ initial }: { initial: PrizeItem[] }): JSX.Element {
  const navigate = useNavigate();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const remove = async (item: PrizeItem) => {
    if (!window.confirm(t('prizeDeleteConfirm', { name: item.content.name }))) return;
    setError(null);
    const result = await deletePrize(item.id);
    if (!result.ok) return setError(errorText(result.error));
    setItems((list) => list.filter((entry) => entry.id !== item.id));
  };

  return (
    <section className="profile-section prize-store">
      <h2>{t('prizesTitle')}</h2>
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={() => navigate('/profile/prizes/new')}>
          {t('prizeNew')}
        </button>
      </div>
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
                {/* Зарезервований приз лише переглядають: змінити його можна, коли він знову вільний. */}
                <button type="button" className="btn btn-small" onClick={() => navigate(`/profile/prizes/${item.id}`)}>
                  {t(item.status === 'reserved' ? 'prizeViewOpen' : 'prizeEdit')}
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
