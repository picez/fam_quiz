import { useId, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { t, type TextKey } from '../i18n';

type Counted = 'prizes' | 'achievements';

interface Tile {
  to: string;
  icon: string;
  label: TextKey;
  count?: Counted;
}

/**
 * 79: розділи профілю трьома блоками. «Вікторини» є в меню, «Вподобані» — вкладка «Вікторин», тож у профілі їх немає;
 * «Групи» малюються окремо (число й бейдж запрошень).
 */
const ACHIEVEMENTS: Tile[] = [
  { to: '/profile/achievements', icon: '🏅', label: 'profileTileAchievements', count: 'achievements' },
  { to: '/profile/prizes', icon: '🎁', label: 'profileTilePrizes', count: 'prizes' },
  { to: '/profile/stats', icon: '📊', label: 'profileTileStats' },
  { to: '/profile/levels', icon: '⭐', label: 'profileTileLevel' },
];
const SETTINGS: Tile[] = [
  { to: '/profile/looks', icon: '🎨', label: 'profileTileLooks' },
  { to: '/profile/settings', icon: '⚙️', label: 'profileTileSettings' },
];

/** Групи (12k): число груп (null — ще вантажиться) і запрошень у групи. */
export interface GroupsTile {
  count: number | null;
  invites: number;
}

/** Плитка-посилання: число в куті (span.tile-count), ім'я посилання «Призи, 2»; extra — додаткові частини імені й бейдж. */
function TileLink({ tile, count, extra = [], badge }: { tile: Tile; count: number | null; extra?: string[]; badge?: number }): JSX.Element {
  const label = t(tile.label);
  const name = [label, ...(count === null ? [] : [String(count)]), ...extra].join(', ');
  return (
    <Link className="profile-tile" to={tile.to} aria-label={name === label ? undefined : name}>
      {count !== null && (
        <span className="tile-count" aria-hidden="true">
          {count}
        </span>
      )}
      <span className="tile-icon" aria-hidden="true">
        {tile.icon}
      </span>
      <span className="tile-label">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="menu-badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </Link>
  );
}

/** Блок із заголовком h2: section з aria-labelledby (для читача екрана — окремий регіон). */
function Block({ title, kind, children, after }: { title: TextKey; kind: string; children: JSX.Element | JSX.Element[]; after?: JSX.Element | null }): JSX.Element {
  const id = useId();
  return (
    <section className={`profile-block profile-block-${kind}${after ? ' has-after' : ''}`} aria-labelledby={id}>
      <h2 id={id} className="profile-block-title">
        {t(title)}
      </h2>
      <div className="profile-block-tiles">{children}</div>
      {after}
    </section>
  );
}

/**
 * nav.profile-tiles (aria-label t('profileTilesLabel')): три блоки — «Мої здобутки» (досягнення й призи з числом, статистика, рівень),
 * «Люди» (друзі; групи з числом і бейджем запрошень, ім'я «Групи, 2, Запрошень: 1»; під плитками — people, напр. рядки ліги),
 * «Налаштування» (вигляд, налаштування).
 */
export function ProfileTiles({ counts, groups, people }: { counts: Record<Counted, number>; groups: GroupsTile; people?: JSX.Element | null }): JSX.Element {
  const invites = groups.invites > 0 ? [t('invitesBadge', { count: groups.invites })] : [];
  return (
    <nav className="profile-tiles" aria-label={t('profileTilesLabel')}>
      <Block title="profileBlockAchievements" kind="achievements">
        {ACHIEVEMENTS.map((tile) => (
          <TileLink key={tile.to} tile={tile} count={tile.count === undefined ? null : counts[tile.count]} />
        ))}
      </Block>
      <Block title="profileBlockPeople" kind="people" after={people}>
        <TileLink tile={{ to: '/profile/friends', icon: '👥', label: 'profileTileFriends' }} count={null} />
        <TileLink tile={{ to: '/profile/groups', icon: '👪', label: 'profileTileGroups' }} count={groups.count} extra={invites} badge={groups.invites} />
      </Block>
      <Block title="profileBlockSettings" kind="settings">
        {SETTINGS.map((tile) => (
          <TileLink key={tile.to} tile={tile} count={null} />
        ))}
      </Block>
    </nav>
  );
}
