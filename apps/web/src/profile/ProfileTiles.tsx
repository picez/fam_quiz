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

/** nav.profile-tiles (aria-label t('profileTilesLabel')): 8 Link-плиток у порядку специфікації; число — span.tile-count, ім'я посилання «Вікторини, 23». */
export function ProfileTiles({ counts }: { counts: Record<Counted, number> }): JSX.Element {
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
    </nav>
  );
}
