import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { t, type TextKey } from '../i18n';

type Counted = 'quizzes' | 'prizes' | 'achievements';

/** Вісім розділів профілю в порядку специфікації; число — лише в трьох перших. */
const TILES: { path: string; icon: string; label: TextKey; count?: Counted }[] = [
  { path: 'quizzes', icon: '📝', label: 'profileTileQuizzes', count: 'quizzes' },
  { path: 'prizes', icon: '🎁', label: 'profileTilePrizes', count: 'prizes' },
  { path: 'achievements', icon: '🏅', label: 'profileTileAchievements', count: 'achievements' },
  { path: 'friends', icon: '👥', label: 'profileTileFriends' },
  { path: 'stats', icon: '📊', label: 'profileTileStats' },
  { path: 'likes', icon: '❤️', label: 'profileTileLikes' },
  { path: 'looks', icon: '🎨', label: 'profileTileLooks' },
  { path: 'settings', icon: '⚙️', label: 'profileTileSettings' },
];

/** Групи (12k): число груп (null — ще вантажиться) і запрошень у групи. */
export interface GroupsTile {
  count: number | null;
  invites: number;
}

/**
 * nav.profile-tiles (aria-label t('profileTilesLabel')): 8 Link-плиток у порядку специфікації; число — span.tile-count, ім'я посилання «Вікторини, 23».
 * Дев'ята — «👪 Групи» на всю ширину (is-wide): число груп і бейдж запрошень, ім'я «Групи, 2, Запрошень: 1».
 */
export function ProfileTiles({ counts, groups }: { counts: Record<Counted, number>; groups: GroupsTile }): JSX.Element {
  const groupsLabel = t('profileTileGroups');
  const groupsName = [groupsLabel, ...(groups.count === null ? [] : [String(groups.count)]), ...(groups.invites > 0 ? [t('invitesBadge', { count: groups.invites })] : [])].join(', ');
  return (
    <nav className="profile-tiles" aria-label={t('profileTilesLabel')}>
      {TILES.map((tile) => {
        const label = t(tile.label);
        const count = tile.count === undefined ? null : counts[tile.count];
        return (
          <Link key={tile.path} className="profile-tile" to={`/profile/${tile.path}`} aria-label={count === null ? undefined : `${label}, ${count}`}>
            {count !== null && (
              <span className="tile-count" aria-hidden="true">
                {count}
              </span>
            )}
            <span className="tile-icon" aria-hidden="true">
              {tile.icon}
            </span>
            <span className="tile-label">{label}</span>
          </Link>
        );
      })}
      <Link className="profile-tile is-wide" to="/profile/groups" aria-label={groupsName === groupsLabel ? undefined : groupsName}>
        {groups.count !== null && (
          <span className="tile-count" aria-hidden="true">
            {groups.count}
          </span>
        )}
        <span className="tile-icon" aria-hidden="true">
          👪
        </span>
        <span className="tile-label">{groupsLabel}</span>
        {groups.invites > 0 && (
          <span className="menu-badge" aria-hidden="true">
            {groups.invites}
          </span>
        )}
      </Link>
    </nav>
  );
}
