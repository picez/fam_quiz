import { isLocale } from '@quiz/shared';
import { useId, useState, useSyncExternalStore } from 'react';
import { t } from '../i18n';
import { chooseLocale, languageSaveFailed, subscribeLanguageSave } from './choose';
import { currentLocale, subscribeLocale } from './current';
import { ENABLED_LOCALES, LOCALE_NAMES } from './locales';

/** Вибір мови інтерфейсу: лише увімкнені мови, самоназвами. Поки увімкнена тільки uk, поля немає (і обгортки теж). */
export function LanguageSwitcher({ signedIn, className }: { signedIn: boolean; className?: string }) {
  const id = useId();
  const locale = useSyncExternalStore(subscribeLocale, currentLocale);
  const failed = useSyncExternalStore(subscribeLanguageSave, languageSaveFailed);
  // Поки вантажиться словник, поле вже показує вибране.
  const [pending, setPending] = useState<string | null>(null);
  if (ENABLED_LOCALES.length < 2) return null;

  return (
    <div className={className === undefined ? 'language-switcher' : `language-switcher ${className}`}>
      <label className="field" htmlFor={id}>
        <span>{t('languageLabel')}</span>
        <select
          id={id}
          value={pending ?? locale}
          onChange={(event) => {
            const next = event.target.value;
            if (!isLocale(next)) return;
            setPending(next);
            void chooseLocale(next, { signedIn })
              .catch(() => ({ saved: true }))
              .finally(() => setPending(null));
          }}
        >
          {ENABLED_LOCALES.map((option) => (
            <option key={option} value={option} lang={option}>
              {LOCALE_NAMES[option]}
            </option>
          ))}
        </select>
      </label>
      {failed && (
        <p className="error" role="alert">
          {t('languageSaveFailed')}
        </p>
      )}
    </div>
  );
}
