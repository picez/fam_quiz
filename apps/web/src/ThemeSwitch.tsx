import { useId, useSyncExternalStore } from 'react';
import { t, type TextKey } from './i18n';
import { setThemeChoice, subscribeTheme, THEME_CHOICES, themeChoice, type ThemeChoice } from './theme-mode';

const LABELS: Record<ThemeChoice, TextKey> = { dark: 'themeDark', light: 'themeLight', system: 'themeSystem' };

const isChoice = (value: string): value is ThemeChoice => (THEME_CHOICES as readonly string[]).includes(value);

/** Вибір теми «Темна / Світла / Як у системі»: лише на цьому пристрої, і гостю, і акаунту. */
export function ThemeSwitch({ className }: { className?: string }) {
  const id = useId();
  const choice = useSyncExternalStore(subscribeTheme, themeChoice);

  return (
    <div className={['theme-switch', className].filter(Boolean).join(' ')}>
      <label className="field" htmlFor={id}>
        <span>{t('themeLabel')}</span>
        <select
          id={id}
          value={choice}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            if (isChoice(event.target.value)) setThemeChoice(event.target.value);
          }}
        >
          {THEME_CHOICES.map((option) => (
            <option key={option} value={option}>
              {t(LABELS[option])}
            </option>
          ))}
        </select>
      </label>
      <p className="meta" id={`${id}-hint`}>
        {t('themeHint')}
      </p>
    </div>
  );
}
