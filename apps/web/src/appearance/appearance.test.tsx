// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { easyModeOn, resetEasyForTests } from '../easy-mode';
import { resetThemeForTests, themeChoice } from '../theme-mode';
import { forgetAccount } from '../useAccount';
import { AppearanceControls } from './AppearanceControls';
import { AppearanceMenu } from './AppearanceMenu';

beforeEach(() => {
  localStorage.clear();
  resetThemeForTests();
  resetEasyForTests();
  forgetAccount();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"unauthorized"}', { status: 401 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const wrap = (node: ReactElement) => render(<MemoryRouter>{node}</MemoryRouter>);

describe('AppearanceControls (80)', () => {
  it('has three theme radios in order and writes the choice', () => {
    wrap(<AppearanceControls />);
    const theme = screen.getByRole('group', { name: 'Тема' });
    expect(within(theme).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(['Світла', 'Темна', 'Як у системі']);
    expect((within(theme).getByRole('radio', { name: 'Темна' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(theme).getByRole('radio', { name: 'Світла' }));
    expect(themeChoice()).toBe('light');
    expect((within(theme).getByRole('radio', { name: 'Світла' }) as HTMLInputElement).checked).toBe(true);
  });

  it('turns easy mode on with one tap', () => {
    wrap(<AppearanceControls />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Легкий режим' }));
    expect(easyModeOn()).toBe(true);
  });
});

describe('AppearanceMenu (80)', () => {
  const button = () => screen.getByRole('button', { name: 'Вигляд сайту: тема й легкий режим' });

  it('is a closed popup button with the word «Вигляд»', () => {
    wrap(<AppearanceMenu />);
    expect(button().getAttribute('aria-haspopup')).toBe('dialog');
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(button().textContent).toContain('Вигляд');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens with the chosen theme focused and closes by Escape back to the button', () => {
    wrap(<AppearanceMenu />);
    fireEvent.click(button());
    const dialog = screen.getByRole('dialog', { name: 'Вигляд сайту' });
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(button().getAttribute('aria-controls')).toBe(dialog.id);
    expect(document.activeElement).toBe(within(dialog).getByRole('radio', { name: 'Темна' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('closes on a tap outside and stays open on a tap inside', () => {
    wrap(
      <>
        <AppearanceMenu />
        <p>поза</p>
      </>,
    );
    fireEvent.click(button());
    fireEvent.pointerDown(screen.getByRole('radio', { name: 'Світла' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.pointerDown(screen.getByText('поза'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the second click on the button closes it', () => {
    wrap(<AppearanceMenu />);
    fireEvent.click(button());
    fireEvent.click(button());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
