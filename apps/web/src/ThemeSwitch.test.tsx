// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeRoot } from './ThemeRoot';
import { ThemeSwitch } from './ThemeSwitch';
import { resetThemeForTests, setThemeChoice } from './theme-mode';

const html = () => document.documentElement;

function view() {
  return render(
    <>
      <ThemeRoot />
      <ThemeSwitch />
    </>,
  );
}

const select = () => screen.getByRole('combobox', { name: 'Тема' }) as HTMLSelectElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  resetThemeForTests();
  html().classList.remove('is-light');
});

describe('ThemeSwitch and ThemeRoot', () => {
  it('offers dark, light and system, dark by default, with a «this device» hint', () => {
    view();
    expect([...select().options].map((option) => option.textContent)).toEqual(['Темна', 'Світла', 'Як у системі']);
    expect(select().value).toBe('dark');
    expect(document.getElementById(select().getAttribute('aria-describedby') ?? '')?.textContent).toBe('Діє на цьому пристрої.');
    expect(html().classList.contains('is-light')).toBe(false);
  });

  it('picking «Світла» saves it on the device and lights <html> at once', () => {
    view();
    fireEvent.change(select(), { target: { value: 'light' } });
    expect(localStorage.getItem('quiz:theme')).toBe('light');
    expect(html().classList.contains('is-light')).toBe(true);
    fireEvent.change(select(), { target: { value: 'dark' } });
    expect(localStorage.getItem('quiz:theme')).toBeNull();
    expect(html().classList.contains('is-light')).toBe(false);
  });

  it('«Як у системі» follows the system theme live', () => {
    let light = false;
    const handlers = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return light && query === '(prefers-color-scheme: light)';
      },
      media: query,
      addEventListener: (_: string, handler: () => void) => handlers.add(handler),
      removeEventListener: (_: string, handler: () => void) => handlers.delete(handler),
    }));
    view();
    fireEvent.change(select(), { target: { value: 'system' } });
    expect(html().classList.contains('is-light')).toBe(false);
    act(() => {
      light = true;
      for (const handler of handlers) handler();
    });
    expect(html().classList.contains('is-light')).toBe(true);
  });

  it('a choice made elsewhere (another switch) shows up here', () => {
    view();
    act(() => setThemeChoice('light'));
    expect(select().value).toBe('light');
    expect(html().classList.contains('is-light')).toBe(true);
  });
});
