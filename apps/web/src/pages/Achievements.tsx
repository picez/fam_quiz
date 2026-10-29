import type { AchievementCard, AchievementsPage } from '@quiz/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getAchievements, getMyAchievements } from '../api';
import { ACHIEVEMENT_ICONS } from '../achievement-meta';
import { groupCards } from '../achievements';
import { formatDay } from '../format';
import { errorText, t, type TextKey } from '../i18n';
import { usePrivateData } from '../usePrivateData';

const LOGIN = '/login?next=%2Fachievements';
const NAME = '\u0000';

/** Свої ачівки (/achievements, лише після входу) чи чужі (/profile/:id/achievements, лише отримані). */
export function Achievements() {
  const { id } = useParams();
  return id === undefined ? <OwnAchievements /> : <PublicAchievements key={id} id={id} />;
}

function OwnAchievements() {
  const state = usePrivateData(getMyAchievements);
  if (state.status === 'signed-out') return <Navigate to={LOGIN} replace />;
  if (state.status === 'loading') return <Shell><p className="meta">{t('loading')}</p></Shell>;
  if (state.status === 'error') return <Failure message={state.message} />;
  return <PageView page={state.data} />;
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
  if (state.status === 'loading') return <Shell><p className="meta">{t('loading')}</p></Shell>;
  if (state.status === 'error') return <Failure message={state.message} />;
  return <PageView page={state.page} />;
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="app wide achievements-page">{children}</main>;
}

function Failure({ message }: { message: string }) {
  return (
    <Shell>
      <p className="error" role="alert">
        {message}
      </p>
    </Shell>
  );
}

function PageView({ page }: { page: AchievementsPage }) {
  const { profile } = page;
  const groups = groupCards(page.items);
  // Ім’я в заголовку «Ачівки: Оля» — посилання на профіль; текст навколо береться з перекладу.
  const [before = '', after = ''] = t('achievementsOf', { name: NAME }).split(NAME);
  return (
    <Shell>
      {page.own ? (
        <h1 className="brand">{t('achievementsTitle')}</h1>
      ) : (
        <h1 className="brand">
          {before}
          <Link to={`/profile/${encodeURIComponent(profile.id)}`}>{profile.nickname}</Link>
          {after}
        </h1>
      )}
      <p className="achievements-count">{t('achievementsCount', { earned: page.earned, total: page.total })}</p>
      {!page.own && groups.length === 0 && <p className="meta">{t('achievementsEmptyPublic')}</p>}
      {groups.map(({ group, items }) => (
        <section key={group} className="achievement-group" aria-labelledby={`g-${group}`}>
          <h2 id={`g-${group}`}>{t(`achievementGroup_${group}` as TextKey)}</h2>
          <ul className="achievement-cards">
            {items.map((item) => (
              <CardView key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </Shell>
  );
}

function CardView({ item }: { item: AchievementCard }) {
  const name = t(`achievement_${item.id}` as TextKey);
  const progress = !item.earned ? item.progress : null;
  return (
    <li
      className={item.earned ? 'achievement-card' : 'achievement-card is-locked'}
      aria-label={item.earned ? undefined : t('achievementLockedLabel', { name })}
    >
      <span className="achievement-icon" aria-hidden="true">
        {ACHIEVEMENT_ICONS[item.id]}
      </span>
      <h3>{name}</h3>
      <p className="achievement-joke">{t(`achievementJoke_${item.id}` as TextKey)}</p>
      <p className="achievement-hint">{t(`achievementHint_${item.id}` as TextKey)}</p>
      {item.earned && (
        <p className="achievement-date">
          {item.earnedAt === null ? t('achievementEarnedLongAgo') : t('achievementEarnedOn', { date: formatDay(item.earnedAt) })}
        </p>
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
