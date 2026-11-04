import type { JSX } from 'react';
import { t } from '../../i18n';
import { nickText } from '../../nick';
import { LevelCard } from '../../profile/LevelCard';
import { SubpageData } from '../../profile/ProfileSubpage';
import { useMyProfile } from '../../profile/useMyProfile';

/** /profile/looks: нагороди рівнів і вибір вигляду ніка. */
export function ProfileLooks(): JSX.Element {
  const { state, reload } = useMyProfile();
  return (
    <SubpageData state={state} title={t('profileTileLooks')}>
      {(profile) => <LevelCard level={profile.level} nickname={nickText(profile.nickname)} profile={profile} onSaved={reload} />}
    </SubpageData>
  );
}
