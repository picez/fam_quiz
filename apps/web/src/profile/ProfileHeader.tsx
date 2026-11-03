import type { OwnLevel, ProfileCard, ProfileStats } from '@quiz/shared';
import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { countText, t } from '../i18n';
import { MotifHero, TomoeRing } from '../motifs/Motifs';
import { nickText } from '../nick';
import { Avatar } from './Avatar';
import { LevelBar, ProfileLevelMark } from './LevelCard';

/** Чотири числа: ігор, перемог, влучність, проведено. dl.headline-stats. */
export function HeadlineStats({ stats }: { stats: ProfileStats }): JSX.Element {
  const rows: [value: string, label: string][] = [
    [String(stats.games), countText('statGames', stats.games)],
    [String(stats.wins), countText('statWins', stats.wins)],
    [stats.accuracy === null ? '–' : `${stats.accuracy}%`, t('statAccuracy')],
    [String(stats.hosted), countText('statHosted', stats.hosted)],
  ];
  return (
    <dl className="headline-stats">
      {rows.map(([value, label], index) => (
        <div className="headline-stat" key={index}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * header.profile-head у MotifHero: аватар у TomoeRing (рамка --accent), h1 нік + ProfileLevelMark + nick-title,
 * плашка «🏆 N перемог», editTo → посилання t('editProfile'), progress → LevelBar, HeadlineStats, children (дії).
 */
export function ProfileHeader(props: {
  profile: ProfileCard;
  level: number;
  badge: string | null;
  title: string | null;
  stats: ProfileStats;
  progress?: OwnLevel['progress'];
  editTo?: string;
  children?: ReactNode;
}): JSX.Element {
  const { profile, level, badge, title, stats, progress, editTo, children } = props;
  return (
    <MotifHero className="profile-hero">
      <header className="profile-head">
        <div className="profile-id">
          <TomoeRing>
            <Avatar profile={profile} size="large" />
          </TomoeRing>
          <div className="profile-id-text">
            <h1 className="brand">
              {nickText(profile.nickname)}
              <ProfileLevelMark level={level} badge={badge} />
              {title !== null && <span className="nick-title">{title}</span>}
            </h1>
            <p className="profile-pills">
              <span className="profile-pill">{`🏆 ${stats.wins} ${countText('statWins', stats.wins)}`}</span>
            </p>
            {editTo !== undefined && (
              <Link className="profile-edit" to={editTo}>
                <span aria-hidden="true">✎ </span>
                {t('editProfile')}
              </Link>
            )}
          </div>
        </div>
        {progress !== undefined && <LevelBar progress={progress} />}
        <HeadlineStats stats={stats} />
        {children}
      </header>
    </MotifHero>
  );
}
