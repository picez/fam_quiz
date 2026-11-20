// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { setCurrentLocale } from '../locales/current';
import { resetThemeForTests, setThemeChoice } from '../theme-mode';
import { pageSnapshot } from './problem-page';

afterEach(() => {
  setCurrentLocale('uk');
  resetThemeForTests();
  localStorage.clear();
});

describe('pageSnapshot', () => {
  it('the snapshot has the path without query or hash, screen, language and theme', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 740 });
    setThemeChoice('light');
    setCurrentLocale('pl');
    expect(pageSnapshot('/play/123456?x=1#tok')).toEqual({ path: '/play/123456', screen: '360x740', lang: 'pl', theme: 'light', browser: navigator.userAgent });
  });

  it('a dark theme and another site become dark and /', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    setThemeChoice('dark');
    const page = pageSnapshot('//evil.example/x');
    expect(page.path).toBe('/');
    expect(page.theme).toBe('dark');
    expect(page.screen).toBe('1280x800');
  });
});
