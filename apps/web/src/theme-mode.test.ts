// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyThemeClass, lightThemeOn, resetThemeForTests, setThemeChoice, subscribeTheme, themeChoice } from './theme-mode';

const html = () => document.documentElement;

/** matchMedia з керованою темою системи: change() перемикає її й кличе слухачів. */
function systemTheme(light: boolean) {
  let matches = light;
  const handlers = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === '(prefers-color-scheme: light)' ? matches : false;
    },
    media: query,
    addEventListener: (_: string, handler: () => void) => handlers.add(handler),
    removeEventListener: (_: string, handler: () => void) => handlers.delete(handler),
  }));
  return {
    change(next: boolean) {
      matches = next;
      for (const handler of handlers) handler();
    },
    handlers,
  };
}

beforeEach(() => {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#060505';
  document.head.append(meta);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  resetThemeForTests();
  html().classList.remove('is-light');
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
});

describe('theme store', () => {
  it('without a key the theme is dark', () => {
    systemTheme(true);
    expect(themeChoice()).toBe('dark');
    expect(lightThemeOn()).toBe(false);
  });

  it('setThemeChoice writes quiz:theme (dark removes it) and tells the listeners', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTheme(listener);
    setThemeChoice('light');
    expect(localStorage.getItem('quiz:theme')).toBe('light');
    expect(lightThemeOn()).toBe(true);
    setThemeChoice('system');
    expect(localStorage.getItem('quiz:theme')).toBe('system');
    setThemeChoice('dark');
    expect(localStorage.getItem('quiz:theme')).toBeNull();
    expect(themeChoice()).toBe('dark');
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    setThemeChoice('light');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('reads a saved choice and ignores unknown values', () => {
    localStorage.setItem('quiz:theme', 'light');
    expect(themeChoice()).toBe('light');
    localStorage.setItem('quiz:theme', 'sepia');
    expect(themeChoice()).toBe('dark');
  });

  it('«system» follows prefers-color-scheme and notifies when the system flips', () => {
    const system = systemTheme(false);
    setThemeChoice('system');
    expect(lightThemeOn()).toBe(false);
    const listener = vi.fn();
    const unsubscribe = subscribeTheme(listener);
    system.change(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(lightThemeOn()).toBe(true);
    unsubscribe();
    // Останній слухач пішов — за системою більше не стежимо.
    expect(system.handlers.size).toBe(0);
  });

  it('works without matchMedia: «system» is dark', () => {
    vi.stubGlobal('matchMedia', undefined);
    setThemeChoice('system');
    expect(lightThemeOn()).toBe(false);
    expect(() => subscribeTheme(() => undefined)()).not.toThrow();
  });

  it('private mode: setThemeChoice does not throw and the theme holds until a reload', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => setThemeChoice('light')).not.toThrow();
    expect(lightThemeOn()).toBe(true);
  });

  it('applyThemeClass puts is-light on <html> and recolours the browser bar', () => {
    const meta = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
    setThemeChoice('light');
    applyThemeClass();
    expect(html().classList.contains('is-light')).toBe(true);
    expect(meta()).toBe('#f7f2f1');
    setThemeChoice('dark');
    applyThemeClass();
    expect(html().classList.contains('is-light')).toBe(false);
    expect(meta()).toBe('#060505');
  });
});
