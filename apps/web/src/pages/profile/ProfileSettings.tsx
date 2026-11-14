import { useState, type JSX } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signOut } from '../../api';
import { EasyModeSwitch } from '../../EasyModeSwitch';
import { forgetAccount } from '../../useAccount';
import { t } from '../../i18n';
import { LanguageSwitcher } from '../../locales/LanguageSwitcher';
import { nickText } from '../../nick';
import { Avatar } from '../../profile/Avatar';
import { ProfileEditor } from '../../profile/ProfileEditor';
import { SubpageData } from '../../profile/ProfileSubpage';
import { useMyProfile } from '../../profile/useMyProfile';
import { PushSettings } from '../../push/PushSettings';
import { disablePush } from '../../push/push-client';

/** /profile/settings: нікнейм і аватар (?edit=1 — форма одразу відкрита), мова, сповіщення, пошта, адмінка, вихід. */
export function ProfileSettings(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [editing, setEditing] = useState(params.get('edit') === '1');
  const [leaving, setLeaving] = useState(false);
  const { state, reload } = useMyProfile();

  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    // Спершу прибираємо підписку цього пристрою, поки сесія жива; збій чи зависання (понад 3 с) виходу не блокує.
    await Promise.race([disablePush().catch(() => undefined), new Promise<void>((done) => setTimeout(done, 3_000))]);
    await signOut();
    forgetAccount();
    navigate('/');
  };

  return (
    <SubpageData state={state} title={t('profileTileSettings')}>
      {(profile) => (
        <>
          <section className="profile-section settings-row">
            <h2>{t('settingsNickAvatar')}</h2>
            {editing ? (
              <ProfileEditor
                profile={profile}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  reload();
                }}
              />
            ) : (
              <div className="settings-identity">
                <Avatar profile={profile} size="small" />
                <strong>{nickText(profile.nickname)}</strong>
                <button type="button" className="btn btn-small" onClick={() => setEditing(true)}>
                  {t('editProfile')}
                </button>
              </div>
            )}
          </section>
          <LanguageSwitcher signedIn className="profile-section" />
          <section className="profile-section settings-row">
            <h2>{t('easyModeLabel')}</h2>
            <EasyModeSwitch />
          </section>
          <PushSettings />
          <section className="profile-section settings-row">
            <h2>{t('settingsEmail')}</h2>
            <p className="meta">{profile.email}</p>
          </section>
          <div className="toolbar">
            <Link to={`/profile/${encodeURIComponent(profile.id)}`}>{t('publicProfileLink')}</Link>
            {state.status === 'ready' && state.account.admin && (
              <Link className="btn" to="/admin">
                {t('profileAdminLink')}
              </Link>
            )}
          </div>
          <div className="toolbar">
            <button type="button" className="btn" disabled={leaving} onClick={() => void leave()}>
              {t('signOut')}
            </button>
          </div>
        </>
      )}
    </SubpageData>
  );
}
