import { IMAGE_LIMITS, type ProfileCard } from '@quiz/shared';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { saveMyProfile, uploadImage } from '../api';
import { errorText, t } from '../i18n';
import { Avatar } from './Avatar';

const ACCEPT = IMAGE_LIMITS.types.join(',');
const isAllowed = (type: string) => (IMAGE_LIMITS.types as readonly string[]).includes(type);

/** Форма «Змінити нікнейм / аватар»: нікнейм, вибір або прибирання аватара. */
export function ProfileEditor({ profile, onSaved, onCancel }: { profile: ProfileCard; onSaved: () => void; onCancel: () => void }) {
  const [nickname, setNickname] = useState(profile.nickname);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = uploading || saving;

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Той самий файл можна вибрати ще раз після помилки.
    event.target.value = '';
    if (file === undefined) return;
    if (!isAllowed(file.type)) return setError(errorText('bad_image'));
    if (file.size > IMAGE_LIMITS.maxBytes) return setError(errorText('too_large'));
    setError(null);
    setUploading(true);
    const result = await uploadImage(file);
    setUploading(false);
    if (result.ok) setAvatar(result.url);
    else setError(errorText(result.error));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setSaving(true);
    const result = await saveMyProfile({ nickname, avatar });
    setSaving(false);
    if (result.ok) onSaved();
    else setError(errorText(result.error));
  };

  return (
    <form className="profile-editor" onSubmit={(event) => void submit(event)}>
      <Avatar profile={{ id: profile.id, nickname, avatar }} size="large" />
      <div className="profile-editor-fields">
        <label className="field">
          <span>{t('profileNickname')}</span>
          <input value={nickname} maxLength={40} onChange={(event) => setNickname(event.target.value)} />
        </label>
        <div className="toolbar">
          <label className={uploading ? 'btn btn-small file-pick is-busy' : 'btn btn-small file-pick'}>
            <span>{t(uploading ? 'uploading' : 'avatarPick')}</span>
            <input type="file" accept={ACCEPT} disabled={busy} onChange={(event) => void pick(event)} />
          </label>
          {avatar !== null && (
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => setAvatar(null)}>
              {t('avatarRemove')}
            </button>
          )}
        </div>
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="toolbar">
          <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
            {t('save')}
          </button>
          <button type="button" className="btn btn-small" disabled={saving} onClick={onCancel}>
            {t('cancel')}
          </button>
        </div>
      </div>
    </form>
  );
}
