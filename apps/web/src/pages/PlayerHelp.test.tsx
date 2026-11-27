// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { easyModeOn, resetEasyForTests } from '../easy-mode';
import { forgetAccount } from '../useAccount';
import { PlayerHelp } from './PlayerHelp';

beforeEach(() => {
  localStorage.clear();
  resetEasyForTests();
  forgetAccount();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"unauthorized"}', { status: 401 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/help/play']}>
      <PlayerHelp />
    </MemoryRouter>,
  );

describe('PlayerHelp (80)', () => {
  it('has seven short sections in order and a way back home', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Як грати');
    // Значок перед назвою — лише для ока (aria-hidden).
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.lastElementChild?.textContent)).toEqual([
      'Як увійти в гру',
      'Як відповідати',
      'Бафи',
      'Оскарження',
      'Не виходь з гри',
      'Легкий режим',
      'Після гри',
    ]);
    expect(screen.getByRole('link', { name: 'Назад: Головна' }).getAttribute('href')).toBe('/');
  });

  it('explains joining with a code and «Відкриті ігри»', () => {
    renderPage();
    const join = screen.getByRole('region', { name: 'Як увійти в гру' });
    expect(join.textContent).toContain('«Код гри»');
    expect(join.textContent).toContain('«Відкриті ігри»');
  });

  it('shows answer types and buffs with their icons and names', () => {
    renderPage();
    const answer = screen.getByRole('region', { name: 'Як відповідати' });
    expect(within(answer).getByText('Один правильний варіант')).toBeTruthy();
    const buffs = screen.getByRole('region', { name: 'Бафи' });
    expect(within(buffs).getByText('½')).toBeTruthy();
    expect(within(buffs).getByText('Подвоює бали за це запитання.')).toBeTruthy();
  });

  it('turns easy mode on in one tap', () => {
    renderPage();
    const easy = screen.getByRole('region', { name: 'Легкий режим' });
    fireEvent.click(within(easy).getByRole('checkbox', { name: 'Легкий режим' }));
    expect(easyModeOn()).toBe(true);
  });

  it('links to the host help', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Довідка ведучого' }).getAttribute('href')).toBe('/help');
  });
});
