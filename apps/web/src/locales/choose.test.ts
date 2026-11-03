// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveMyLocale } from '../api';
import { activateLocaleForTests, t } from '../i18n';
import { LOCALE_STORAGE_KEY, applyDocument, chooseLocale, detectLocale, initLocale, resetChoiceForTests, switchLocale, syncAccountLocale } from './choose';
import { currentLocale } from './current';
import { loadMessages } from './load';

vi.mock('../api', () => ({ saveMyLocale: vi.fn(async () => ({ ok: true })) }));
vi.mock('./locales', async (importOriginal) => {
  const original = await importOriginal<typeof import('./locales')>();
  const ENABLED_LOCALES = ['uk', 'en', 'de', 'ar'] as const;
  return { ...original, ENABLED_LOCALES, isEnabled: (locale: string) => (ENABLED_LOCALES as readonly string[]).includes(locale) };
});
vi.mock('./load', () => ({ loadMessages: vi.fn(async () => ({ ui: { appName: 'Quiz' }, help: {} })) }));

const enabled = ['uk', 'en', 'de', 'ar'] as const;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetChoiceForTests();
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
  activateLocaleForTests('uk');
  applyDocument('uk');
});

describe('detectLocale', () => {
  it('prefers a stored enabled locale', () => {
    expect(detectLocale({ stored: 'de', browser: ['en-US'], enabled })).toBe('de');
  });

  it('ignores an unknown stored value and takes the first browser language by its primary subtag', () => {
    expect(detectLocale({ stored: 'ru', browser: ['de-AT', 'en'], enabled })).toBe('de');
    expect(detectLocale({ stored: null, browser: ['ru-RU', 'en-GB'], enabled })).toBe('en');
    expect(detectLocale({ stored: null, browser: ['ar-EG'], enabled })).toBe('ar');
  });

  it('falls back to uk', () => {
    expect(detectLocale({ stored: null, browser: ['fr-FR'], enabled })).toBe('uk');
    expect(detectLocale({ stored: null, browser: ['ru-RU'], enabled })).toBe('uk');
    expect(detectLocale({ stored: 'pl', browser: ['pl-PL'], enabled })).toBe('uk');
    expect(detectLocale({ stored: null, browser: [], enabled })).toBe('uk');
  });
});

describe('applyDocument', () => {
  it('sets lang and dir on <html> and the title', () => {
    applyDocument('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    applyDocument('uk');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('uk');
    expect(document.title).toBe(t('appName'));
  });
});

describe('initLocale', () => {
  it('reads localStorage before the browser and activates the result', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    expect(await initLocale()).toBe('en');
    expect(currentLocale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Quiz');
  });

  it('stays in uk when the dictionary fails to load', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ar');
    vi.mocked(loadMessages).mockRejectedValueOnce(new Error('offline'));
    expect(await initLocale()).toBe('uk');
    expect(currentLocale()).toBe('uk');
    expect(document.documentElement.lang).toBe('uk');
  });
});

describe('switchLocale', () => {
  it('lets the latest request win when an earlier load is slower', async () => {
    let finishDe: (value: { ui: Record<string, string>; help: Record<string, string> }) => void = () => undefined;
    vi.mocked(loadMessages).mockImplementationOnce(() => new Promise((resolve) => (finishDe = resolve)));
    const slow = switchLocale('de');
    const fast = switchLocale('en');
    expect(await fast).toBe(true);
    expect(currentLocale()).toBe('en');
    finishDe({ ui: {}, help: {} });
    expect(await slow).toBe(false);
    expect(currentLocale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('chooseLocale', () => {
  it('saves to localStorage and the profile for an account', async () => {
    expect(await chooseLocale('en', { signedIn: true })).toEqual({ saved: true });
    expect(currentLocale()).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(saveMyLocale).toHaveBeenCalledWith('en');
  });

  it('does not call the server for a guest', async () => {
    expect(await chooseLocale('en', { signedIn: false })).toEqual({ saved: true });
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(saveMyLocale).not.toHaveBeenCalled();
  });

  it('keeps the choice when the profile save fails, and a stale profile does not undo it', async () => {
    vi.mocked(saveMyLocale).mockResolvedValueOnce({ ok: false, error: 'offline' });
    expect(await chooseLocale('en', { signedIn: true })).toEqual({ saved: false });
    expect(currentLocale()).toBe('en');
    await syncAccountLocale('uk', 'a');
    expect(currentLocale()).toBe('en');
  });
});

describe('syncAccountLocale', () => {
  it('switches to the profile locale and remembers it on this device', async () => {
    await syncAccountLocale('en', 'a');
    expect(currentLocale()).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(saveMyLocale).not.toHaveBeenCalled();
  });

  it('sends the current locale once when the profile has none', async () => {
    activateLocaleForTests('en');
    await syncAccountLocale(null, 'a');
    await syncAccountLocale(null, 'a');
    expect(saveMyLocale).toHaveBeenCalledTimes(1);
    expect(saveMyLocale).toHaveBeenCalledWith('en');
  });

  it('does nothing for an empty profile in uk', async () => {
    await syncAccountLocale(null, 'a');
    await syncAccountLocale(undefined, 'a');
    expect(currentLocale()).toBe('uk');
    expect(saveMyLocale).not.toHaveBeenCalled();
  });

  it('ignores a disabled profile locale', async () => {
    await syncAccountLocale('pl', 'a');
    expect(currentLocale()).toBe('uk');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    expect(saveMyLocale).not.toHaveBeenCalled();
  });

  it('forgets the previous account choice when another account signs in', async () => {
    await syncAccountLocale(null, 'a');
    await chooseLocale('en', { signedIn: true });
    vi.mocked(saveMyLocale).mockClear();
    await syncAccountLocale('de', 'b');
    expect(currentLocale()).toBe('de');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de');
  });

  it('fills an empty profile of the next account once', async () => {
    await syncAccountLocale(null, 'a');
    await chooseLocale('en', { signedIn: true });
    vi.mocked(saveMyLocale).mockClear();
    await syncAccountLocale(null, 'b');
    await syncAccountLocale(null, 'b');
    expect(saveMyLocale).toHaveBeenCalledTimes(1);
    expect(saveMyLocale).toHaveBeenCalledWith('en');
  });

  it('does not remount a live game: the profile locale only goes to localStorage', async () => {
    for (const path of ['/play/123456', '/host/123456', '/stage/123456']) {
      window.history.replaceState(null, '', path);
      await syncAccountLocale('en', 'a');
      expect(currentLocale()).toBe('uk');
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
      localStorage.clear();
    }
    window.history.replaceState(null, '', '/quizzes');
    await syncAccountLocale('en', 'a');
    expect(currentLocale()).toBe('en');
  });
});
