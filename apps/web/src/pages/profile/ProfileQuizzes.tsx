import type { JSX } from 'react';
import { t } from '../../i18n';
import { PopularQuizzes } from '../../profile/PopularQuizzes';
import { SubpageData } from '../../profile/ProfileSubpage';
import { useMyProfile } from '../../profile/useMyProfile';

/** /profile/quizzes: усі свої вікторини, найзіграніші першими. */
export function ProfileQuizzes(): JSX.Element {
  const { state } = useMyProfile();
  return (
    <SubpageData state={state} title={t('profileTileQuizzes')}>
      {(profile) => (
        <section className="profile-section">
          <PopularQuizzes quizzes={profile.quizzes} />
        </section>
      )}
    </SubpageData>
  );
}
