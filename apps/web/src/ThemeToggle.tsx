import { useSyncExternalStore } from 'react';
import { t } from './i18n';
import { lightThemeOn, setThemeChoice, subscribeTheme } from './theme-mode';

/** Сонце: світлу тему ввімкнено (кнопка натиснута). */
export function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
      </g>
    </svg>
  );
}

/** Місяць: темна тема. */
export function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Швидкий перемикач теми (☀/☾) для меню, гостьової головної та ігрових екранів: перемикає на протилежну тій, що зараз
 * на екрані (темна ↔ світла). «Як у системі» — лише в повному виборі ThemeSwitch (налаштування профілю, вхід, лобі).
 * Сталий доступний підпис «Світла тема» з aria-pressed; підказка title каже, що станеться після натискання.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const light = useSyncExternalStore(subscribeTheme, lightThemeOn);
  return (
    <button
      type="button"
      className={['theme-toggle', className].filter(Boolean).join(' ')}
      aria-pressed={light}
      aria-label={t('themeQuick')}
      title={t(light ? 'themeQuickToDark' : 'themeQuickToLight')}
      onClick={() => setThemeChoice(lightThemeOn() ? 'dark' : 'light')}
    >
      {light ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
