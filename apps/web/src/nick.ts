import { t } from './i18n';

/** Нік профілю для показу: порожній (профіль без ніка) замінюється локалізованою заміткою. */
export function nickText(nickname: string | null): string {
  return nickname ? nickname : t('defaultNickname');
}
