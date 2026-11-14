import type { NickLooks, OwnLevel, ProfileCard, ProfileStats } from '@quiz/shared';
import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { countText, t } from '../i18n';
import { useNickFont } from '../nick-fonts';
import { MotifHero } from '../motifs/Motifs';
import { nickText } from '../nick';
import { nickNameClass, NickFx } from '../screens/Nick';
import { Avatar } from './Avatar';
import { AvatarFrame } from './AvatarFrame';
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
 * header.profile-head у MotifHero: аватар у AvatarFrame (рамка фото; без неї кільце томое), h1 нік + nick-title, під ним ряд плашок як у макеті:
 * суцільна «Рів. N» (ProfileLevelMark) і контурна «🏆 N перемог», editTo → посилання t('editProfile'), progress → LevelBar, HeadlineStats, children (дії).
 */
export function ProfileHeader(props: {
  profile: ProfileCard;
  level: number;
  looks: NickLooks;
  title: string | null;
  stats: ProfileStats;
  progress?: OwnLevel['progress'];
  editTo?: string;
  children?: ReactNode;
}): JSX.Element {
  const { profile, level, looks, title, stats, progress, editTo, children } = props;
  useNickFont(looks.font);
  return (
    <MotifHero className="profile-hero">
      <header className="profile-head">
        <div className="profile-id">
          <AvatarFrame frame={looks.photo}>
            <Avatar profile={profile} size="large" />
          </AvatarFrame>
          <div className="profile-id-text">
            <h1 className="brand">
              <NickFx effect={looks.effect}>
                <span className={nickNameClass(looks.color, looks.font)} dir="auto">
                  {nickText(profile.nickname)}
                </span>
              </NickFx>
              {title !== null && <span className="nick-title">{title}</span>}
            </h1>
            <p className="profile-pills">
              <ProfileLevelMark level={level} badge={looks.badge} />
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
