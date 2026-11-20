import { DELETED_FACT, DELETED_NICKNAME } from '@quiz/shared';
import { t } from './i18n';

/** Нік профілю для показу: порожній (профіль без ніка) замінюється локалізованою заміткою, маркер видаленого гравця (58) — перекладом. */
export function nickText(nickname: string | null): string {
  if (!nickname) return t('defaultNickname');
  return nickname === DELETED_NICKNAME ? t('deletedPlayer') : nickname;
}

/**
 * Копія даних з сервера, де маркери видаленого акаунта (58), що лежать у базі українською — нік DELETED_NICKNAME і факт DELETED_FACT, —
 * замінено текстом активної мови. Для сторінки гри: імена там у багатьох полях (рядки, ціль дебафу, художник, автор факту, місця).
 */
export function deletedShown<T>(value: T): T {
  if (value === DELETED_NICKNAME) return t('deletedPlayer') as T;
  if (value === DELETED_FACT) return t('deletedFact') as T;
  if (Array.isArray(value)) return value.map((item: unknown) => deletedShown(item)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deletedShown(item)])) as T;
  }
  return value;
}
