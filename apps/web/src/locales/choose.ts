import { isLocale, isRtl, type Locale } from '@quiz/shared';
import { saveMyLocale } from '../api';
import { activateLocale, loadLocale, t } from '../i18n';
import { currentLocale } from './current';
import { ENABLED_LOCALES, isEnabled } from './locales';

/**
 * Яку мову бачить людина. Пріоритет: профіль акаунта → localStorage → navigator.languages → uk.
 * Лише увімкнені мови (ENABLED_LOCALES); вимкнена мова звідусіль ігнорується.
 */

export const LOCALE_STORAGE_KEY = 'quiz:locale';

/** Мова пристрою: збережена (якщо увімкнена), інакше перша мова браузера, чий основний підтег увімкнений («de» з «de-AT»), інакше uk. */
export function detectLocale(input: { stored: string | null; browser: readonly string[]; enabled: readonly Locale[] }): Locale {
  const { stored, browser, enabled } = input;
  const usable = (value: string | null | undefined): value is Locale => isLocale(value) && enabled.includes(value);
  if (usable(stored)) return stored;
  for (const tag of browser) {
    const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
    if (usable(primary)) return primary;
  }
  return 'uk';
}

function readStored(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Приватний режим чи заборонене сховище: мова діє до перезавантаження.
  }
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages !== undefined && navigator.languages.length > 0) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/** <html lang dir> і заголовок вкладки активною мовою. */
export function applyDocument(locale: Locale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
  document.title = t('appName');
}

let latestSwitch = 0;

/**
 * Вантажить словник і робить мову активною. Перемагає останній виклик: якщо поки вантажився
 * повільніший словник, людина вибрала іншу мову, старий запит нічого не вмикає й дає false.
 */
export async function switchLocale(locale: Locale): Promise<boolean> {
  const request = ++latestSwitch;
  try {
    await loadLocale(locale);
  } catch (error) {
    if (request !== latestSwitch) return false;
    throw error;
  }
  if (request !== latestSwitch) return false;
  activateLocale(locale);
  applyDocument(locale);
  return true;
}

/** Старт застосунку (main.tsx): мова з localStorage чи браузера, до першого рендеру. Збій словника — лишається uk. */
export async function initLocale(): Promise<Locale> {
  const locale = detectLocale({ stored: readStored(), browser: browserLanguages(), enabled: ENABLED_LOCALES });
  try {
    if (locale !== 'uk') await switchLocale(locale);
  } catch {
    // Немає зв'язку чи битий чанк: краще українською, ніж порожня сторінка.
  }
  applyDocument(currentLocale());
  return currentLocale();
}

/** Явний вибір у цій вкладці для акаунта: застарілий профіль із /api/me його вже не перебиває. */
let chosen: Locale | null = null;
/** Мову, яку вже запропонували порожньому профілю, не шлемо вдруге (useAccount кличеться в багатьох місцях). */
let offered: Locale | null = null;
/** Чий профіль бачили востаннє: інший акаунт у тій самій вкладці починає з чистого chosen / offered. */
let accountOf: string | null = null;
/** Збереження в профілі йдуть по черзі: швидкі перемикання не перегнать одне одного на сервері. */
let saving: Promise<unknown> = Promise.resolve();

function save(locale: Locale): Promise<boolean> {
  const result = saving.then(() => saveMyLocale(locale)).then((response) => response.ok, () => false);
  saving = result;
  return result;
}

/** Збій збереження в профілі останнього вибору: перемикач показує його й після перемонтування дерева. */
let saveFailed = false;
const failureListeners = new Set<() => void>();

function setSaveFailed(value: boolean): void {
  if (saveFailed === value) return;
  saveFailed = value;
  for (const listener of [...failureListeners]) listener();
}

export function languageSaveFailed(): boolean {
  return saveFailed;
}

export function subscribeLanguageSave(listener: () => void): () => void {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}

/**
 * Людина вибрала мову в перемикачі: словник, localStorage, а для акаунта ще й профіль.
 * Збій профілю не відкочує вибору: мова лишається, saved — false.
 */
export async function chooseLocale(locale: Locale, opts: { signedIn: boolean }): Promise<{ saved: boolean }> {
  if (!isEnabled(locale)) return { saved: true };
  setSaveFailed(false);
  if (!(await switchLocale(locale))) return { saved: true };
  writeStored(locale);
  if (!opts.signedIn) return { saved: true };
  chosen = locale;
  offered = locale;
  const saved = await save(locale);
  // Поки йшло збереження, людина могла вибрати ще раз — тоді про старе вже не кажемо.
  if (chosen === locale) setSaveFailed(!saved);
  return { saved };
}

/** Сторінки живої гри (гравець, пульт, сцена): тут дерево не перемонтовуємо, бо це обірвало б гру. */
const LIVE_GAME_PATH = /^\/(play|host|stage)\//;

function inLiveGame(): boolean {
  return typeof window !== 'undefined' && LIVE_GAME_PATH.test(window.location.pathname);
}

/**
 * Відповідь /api/me: мова профілю, якщо увімкнена, перемагає мову пристрою; порожній профіль один раз дістає поточну мову.
 * Посеред живої гри мова профілю лише пишеться в localStorage: вона ввімкнеться на наступній сторінці чи після перезавантаження.
 */
export async function syncAccountLocale(profile: Locale | null | undefined, accountId: string): Promise<void> {
  if (accountOf !== null && accountOf !== accountId) {
    chosen = null;
    offered = null;
  }
  accountOf = accountId;
  if (chosen !== null) return;
  if (profile === null || profile === undefined) {
    const locale = currentLocale();
    if (locale === 'uk' || offered === locale) return;
    offered = locale;
    if (!(await save(locale))) offered = null;
    return;
  }
  if (!isEnabled(profile)) return;
  offered = profile;
  writeStored(profile);
  if (profile !== currentLocale() && !inLiveGame()) await switchLocale(profile).catch(() => false);
}

/** Для тестів: забуває явний вибір і запропоновану мову. */
export function resetChoiceForTests(): void {
  chosen = null;
  offered = null;
  accountOf = null;
  saveFailed = false;
}
