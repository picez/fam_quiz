import { isAnti, type AchievementCard, type AchievementsPage } from '@quiz/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { getAchievements, getMyAchievements, setHideAnti } from '../api';
import { ACHIEVEMENT_ICONS } from '../achievement-meta';
import { groupCards } from '../achievements';
import { formatDay } from '../format';
import { errorText, t, type TextKey } from '../i18n';
import { PinButton } from '../profile/PinButton';
import { loginFor, ProfileSubpage } from '../profile/ProfileSubpage';
import { usePins } from '../profile/usePins';
import { usePrivateData } from '../usePrivateData';
import { nickText } from '../nick';

const NAME = '\u0000';

/** Свої ачівки (/profile/achievements і аліас /achievements, лише після входу) чи чужі (/profile/:id/achievements, лише отримані). */
export function Achievements() {
  const { id } = useParams();
  return id === undefined ? <OwnAchievements /> : <PublicAchievements key={id} id={id} />;
}

function OwnAchievements() {
  const location = useLocation();
  const state = usePrivateData(getMyAchievements);
  const pinning = usePins();
  if (state.status === 'signed-out') return <Navigate to={loginFor(location.pathname + location.search)} replace />;
  if (state.status === 'loading') return <Shell><p className="meta">{t('loading')}</p></Shell>;
  if (state.status === 'error') return <Failure message={state.message} />;
  return <PageView page={state.data} pinning={pinning} />;
}

type Loaded = { status: 'loading' } | { status: 'ready'; page: AchievementsPage } | { status: 'error'; message: string };

function PublicAchievements({ id }: { id: string }) {
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    void getAchievements(id).then((result) => {
      if (!current) return;
      if (result.ok) setState({ status: 'ready', page: result.data });
      else setState({ status: 'error', message: result.error === 'not_found' ? t('profileNotFound') : errorText(result.error) });
    });
    return () => {
      current = false;
    };
  }, [id]);
  // Без заголовка, поки вантажимо: інакше «Досягнення» блимне перед «Досягнення: Оля».
  if (state.status === 'loading') return <Shell title={null} back={profileOf(id)}><p className="meta">{t('loading')}</p></Shell>;
  if (state.status === 'error') return <Failure back={profileOf(id)} message={state.message} />;
  return <PageView page={state.page} />;
}

/** Чужі ачівки ведуть назад на профіль їхнього власника. */
const profileOf = (id: string) => `/profile/${encodeURIComponent(id)}`;

function Shell({ title = t('profileTileAchievements'), back, children }: { title?: ReactNode | null; back?: string; children: ReactNode }) {
  return (
    <ProfileSubpage title={title} back={back} className="achievements-page">
      {children}
    </ProfileSubpage>
  );
}

function Failure({ back, message }: { back?: string; message: string }) {
  return (
    <Shell back={back}>
      <p className="error" role="alert">
        {message}
      </p>
    </Shell>
  );
}

/** Закріплення на вітрині — лише на своїй сторінці. */
type Pinning = ReturnType<typeof usePins>;

function PageView({ page, pinning }: { page: AchievementsPage; pinning?: Pinning }) {
  const { profile } = page;
  const groups = groupCards(page.items);
  // Ім’я в заголовку «Ачівки: Оля» — посилання на профіль; текст навколо береться з перекладу.
  const [before = '', after = ''] = t('achievementsOf', { name: NAME }).split(NAME);
  const title = page.own ? (
    t('profileTileAchievements')
  ) : (
    <>
      {before}
      <Link to={profileOf(profile.id)}>{nickText(profile.nickname)}</Link>
      {after}
    </>
  );
  return (
    <Shell title={title} back={page.own ? undefined : profileOf(profile.id)}>
      <p className="achievements-count">{t('achievementsCount', { earned: page.earned, total: page.total })}</p>
      {pinning !== undefined && (
        <p className="pin-message" role="status">
          {pinning.message}
        </p>
      )}
      {!page.own && groups.length === 0 && <p className="meta">{t('achievementsEmptyPublic')}</p>}
      {groups.map(({ group, items }) => (
        <section key={group} className="achievement-group" aria-labelledby={`g-${group}`}>
          <h2 id={`g-${group}`}>{t(`achievementGroup_${group}` as TextKey)}</h2>
          {group === 'anti' && page.own && <HideAntiSwitch initial={page.hideAnti ?? false} />}
          <ul className="achievement-cards">
            {items.map((item) => (
              <CardView key={item.id} item={item} pinning={page.own ? pinning : undefined} />
            ))}
          </ul>
        </section>
      ))}
    </Shell>
  );
}

/** Перемикач «Ховати антидосягнення від інших» (12j): одразу зберігає; на час запиту — busy; збій — назад і текст помилки. */
function HideAntiSwitch({ initial }: { initial: boolean }) {
  const [hide, setHide] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const change = async (next: boolean) => {
    setHide(next);
    setBusy(true);
    setStatus(null);
    const result = await setHideAnti(next);
    setBusy(false);
    if (result.ok) {
      setHide(result.data.hideAnti);
      setStatus({ ok: true, text: t('hideAntiSaved') });
    } else {
      setHide(!next);
      setStatus({ ok: false, text: errorText(result.error) });
    }
  };
  return (
    <div className="hide-anti">
      <label className="hide-anti-label">
        <input type="checkbox" checked={hide} disabled={busy} aria-describedby="hide-anti-hint" onChange={(event) => void change(event.target.checked)} />
        {t('hideAntiLabel')}
      </label>
      <p id="hide-anti-hint" className="hide-anti-hint">
        {t('hideAntiHint')}
      </p>
      <p className={status?.ok === false ? 'hide-anti-status error' : 'hide-anti-status'} role="status">
        {status?.text ?? ''}
      </p>
    </div>
  );
}

function CardView({ item, pinning }: { item: AchievementCard; pinning?: Pinning }) {
  const name = t(`achievement_${item.id}` as TextKey);
  const progress = !item.earned ? item.progress : null;
  const className = ['achievement-card', ...(item.earned ? [] : ['is-locked']), ...(isAnti(item.id) ? ['is-anti'] : [])].join(' ');
  return (
    <li className={className}>
      <span className="achievement-icon" aria-hidden="true">
        {ACHIEVEMENT_ICONS[item.id]}
      </span>
      {/* Закрита картка: «ще не отримано» читач екрана чує в заголовку, а решта картки лишається доступною як є. */}
      <h3>
        {name}
        {!item.earned && <span className="sr-only">{t('achievementLockedNote')}</span>}
      </h3>
      <p className="achievement-joke">{t(`achievementJoke_${item.id}` as TextKey)}</p>
      <p className="achievement-hint">{t(`achievementHint_${item.id}` as TextKey)}</p>
      {item.earned && (
        <p className="achievement-date">
          {item.earnedAt === null ? t('achievementEarnedLongAgo') : t('achievementEarnedOn', { date: formatDay(item.earnedAt) })}
        </p>
      )}
      {item.earned && pinning !== undefined && (
        <PinButton
          pinned={pinning.isPinned({ kind: 'achievement', id: item.id })}
          busy={pinning.busy || pinning.pins === null}
          name={name}
          onClick={() => void pinning.toggle({ kind: 'achievement', id: item.id })}
        />
      )}
      {progress !== null && (
        <>
          <progress max={progress.goal} value={progress.current} aria-label={name} />
          <p className="achievement-progress">{t('achievementProgress', { current: progress.current, goal: progress.goal })}</p>
        </>
      )}
    </li>
  );
}
