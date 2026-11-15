import { loadTheme, saveTheme } from './storage';

/**
 * Тема оформлення: «Темна» (типова), «Світла» чи «Як у системі» (prefers-color-scheme).
 * Вибір пристрою — quiz:theme (темна ключа не пише); профілю й сервера не торкається.
 * Ранній клас ставить вбудований скрипт в index.html — там та сама логіка, щоб сторінка не блимала темною.
 */
export type ThemeChoice = 'dark' | 'light' | 'system';

export const THEME_CHOICES: readonly ThemeChoice[] = ['dark', 'light', 'system'];

/** Колір рядка стану браузера (meta theme-color) — тло --stage кожної теми. */
const BAR_COLOR = { dark: '#060505', light: '#f7f2f1' } as const;

const SYSTEM_LIGHT = '(prefers-color-scheme: light)';

/** Вибір цієї вкладки: діє і тоді, коли сховище недоступне (приватний режим), — до перезавантаження. */
let sessionChoice: ThemeChoice | null = null;
const listeners = new Set<() => void>();
/** Стеження за темою системи: одне на всіх слухачів, лише поки хтось підписаний. */
let systemQuery: MediaQueryList | null = null;

const notify = () => {
  for (const listener of listeners) listener();
};

export function themeChoice(): ThemeChoice {
  return sessionChoice ?? loadTheme() ?? 'dark';
}

function systemPrefersLight(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SYSTEM_LIGHT).matches;
}

/** Чи діє світла тема зараз: вибрано «Світла» або «Як у системі» при світлій системі. */
export function lightThemeOn(): boolean {
  const choice = themeChoice();
  return choice === 'light' || (choice === 'system' && systemPrefersLight());
}

/** Людина сама вибрала тему на цьому пристрої. */
export function setThemeChoice(choice: ThemeChoice): void {
  sessionChoice = choice;
  saveTheme(choice);
  notify();
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  if (systemQuery === null && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    systemQuery = window.matchMedia(SYSTEM_LIGHT);
    systemQuery.addEventListener?.('change', notify);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && systemQuery !== null) {
      systemQuery.removeEventListener?.('change', notify);
      systemQuery = null;
    }
  };
}

/** Клас is-light на <html> і колір рядка стану браузера. */
export function applyThemeClass(): void {
  const light = lightThemeOn();
  document.documentElement.classList.toggle('is-light', light);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? BAR_COLOR.light : BAR_COLOR.dark);
}

export function resetThemeForTests(): void {
  sessionChoice = null;
}
