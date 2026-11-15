// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeRoot } from './ThemeRoot';
import { ThemeSwitch } from './ThemeSwitch';
import { ThemeToggle } from './ThemeToggle';
import { resetThemeForTests, setThemeChoice, themeChoice } from './theme-mode';

const html = () => document.documentElement;
const toggle = () => screen.getByRole('button', { name: 'Світла тема' });

function view() {
  return render(
    <>
      <ThemeRoot />
      <ThemeToggle />
    </>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  resetThemeForTests();
  html().classList.remove('is-light');
});

describe('ThemeToggle', () => {
  it('is a toggle button «Світла тема», not pressed in the default dark theme, with a hint of what a click does', () => {
    view();
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(toggle().getAttribute('title')).toBe('Увімкнути світлу тему');
  });

  it('flips dark → light → dark, saves the choice on the device and lights <html>', () => {
    view();
    fireEvent.click(toggle());
    expect(themeChoice()).toBe('light');
    expect(localStorage.getItem('quiz:theme')).toBe('light');
    expect(html().classList.contains('is-light')).toBe(true);
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(toggle().getAttribute('title')).toBe('Увімкнути темну тему');
    fireEvent.click(toggle());
    expect(themeChoice()).toBe('dark');
    expect(html().classList.contains('is-light')).toBe(false);
  });

  it('from «Як у системі» flips to the opposite of what the screen shows now', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-color-scheme: light)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    view();
    act(() => setThemeChoice('system'));
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle());
    expect(themeChoice()).toBe('dark');
    expect(html().classList.contains('is-light')).toBe(false);
  });

  it('stays in step with the full switch on the same screen', () => {
    render(
      <>
        <ThemeRoot />
        <ThemeToggle />
        <ThemeSwitch />
      </>,
    );
    const select = screen.getByRole('combobox', { name: 'Тема' }) as HTMLSelectElement;
    fireEvent.click(toggle());
    expect(select.value).toBe('light');
    fireEvent.change(select, { target: { value: 'dark' } });
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
  });
});
