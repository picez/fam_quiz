import type { ProfileCard } from '@quiz/shared';
import { t } from '../i18n';

/** Колір літери-запасного аватара: стабільний для одного id. */
function tone(id: string): number {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return sum % 4;
}

/** Аватар: зображення або перша літера нікнейма на тлі одного з чотирьох кольорів (за id). */
export function Avatar({ profile, size }: { profile: ProfileCard; size: 'large' | 'small' }) {
  const label = t('avatarOf', { nickname: profile.nickname });
  if (profile.avatar !== null) {
    return <img className={`avatar avatar-${size}`} src={profile.avatar} alt={label} />;
  }
  const letter = (Array.from(profile.nickname)[0] ?? '').toUpperCase();
  return (
    <span className={`avatar avatar-${size} avatar-tone-${tone(profile.id)}`} role="img" aria-label={label}>
      {letter}
    </span>
  );
}
