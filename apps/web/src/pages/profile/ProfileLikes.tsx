import type { JSX } from 'react';
import { t } from '../../i18n';
import { LikesCard } from '../../profile/LikesCard';
import { SubpageData } from '../../profile/ProfileSubpage';
import { useMyProfile } from '../../profile/useMyProfile';

/** /profile/likes: лайки як автор, ведучий і гравець. */
export function ProfileLikes(): JSX.Element {
  const { state } = useMyProfile();
  return (
    <SubpageData state={state} title={t('profileTileLikes')}>
      {(profile) => <LikesCard likes={profile.likes} />}
    </SubpageData>
  );
}
