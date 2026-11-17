// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { HostSpy as HostSpyInfo, SpyRow } from '@quiz/shared';
import { t } from '../i18n';
import { HostSpy } from './HostSpy';

afterEach(cleanup);

const row = (id: string, nickname: string, word: string | null, over: Partial<SpyRow> = {}): SpyRow => ({ id, nickname, word, voters: [], spy: id === 'p2', points: null, ...over });

const spy = (over: Partial<HostSpyInfo> = {}): HostSpyInfo => ({
  stage: 'words',
  written: 2,
  voted: 0,
  total: 3,
  rows: [row('p1', 'Оля', 'аромат'), row('p2', 'Петро', 'листя'), row('p3', 'Тарас', null)],
  spyId: 'p2',
  playersWord: 'кава',
  spyWord: 'чай',
  spyName: 'Петро',
  caught: false,
  guess: null,
  guessed: false,
  ...over,
});

const lineOf = (name: string) => [...document.querySelectorAll<HTMLElement>('.spy-row')].find((li) => li.querySelector('.name')?.textContent === name)!;

describe('HostSpy', () => {
  it('the spy, both words and live associations from the words stage', () => {
    render(<HostSpy spy={spy()} />);
    expect(screen.getByText(t('spyRevealSpy', { name: 'Петро' }))).toBeTruthy();
    expect(screen.getByText(t('spyRevealWords', { players: 'кава', spy: 'чай' }))).toBeTruthy();
    expect(screen.getByText(t('answeredOf', { answered: 2, total: 3 }))).toBeTruthy();
    expect(lineOf('Оля').querySelector('.spy-line')!.textContent).toBe('Оля — аромат');
    expect(lineOf('Петро').className).toContain('is-spy');
    // Поки нічого не закрито — ні «викрито», ні «непомічений».
    expect(screen.queryByText(t('spyHidden'))).toBeNull();
  });

  it('live votes on the vote stage', () => {
    const rows = [row('p1', 'Оля', 'аромат'), row('p2', 'Петро', 'листя', { voters: ['Оля', 'Тарас'] }), row('p3', 'Тарас', null)];
    render(<HostSpy spy={spy({ stage: 'vote', voted: 2, rows })} />);
    expect(screen.getByText(t('votedOf', { voted: 2, total: 3 }))).toBeTruthy();
    expect(lineOf('Петро').querySelector('.spy-voters')!.textContent).toBe('Оля, Тарас');
    expect(lineOf('Петро').querySelector('.spy-votes')!.textContent).toBe('2 голоси');
  });

  it('after the close: caught, the guess and points', () => {
    const rows = [row('p1', 'Оля', 'аромат', { points: 1000 }), row('p2', 'Петро', 'листя', { voters: ['Оля', 'Тарас'], points: 0 }), row('p3', 'Тарас', null, { points: 1000 })];
    render(<HostSpy spy={spy({ stage: 'guess', voted: 3, rows, caught: true, guess: 'какао', guessed: false })} />);
    expect(screen.getByText(t('spyCaught'))).toBeTruthy();
    expect(screen.getByText(t('spyMissedGuess', { guess: 'какао' }))).toBeTruthy();
    expect(lineOf('Оля').querySelector('.spy-points')!.textContent).toBe('+1000');
    expect(screen.queryByText(t('spyGuessStage'))).toBeNull();
  });

  it('the last chance is shown while the spy guesses', () => {
    render(<HostSpy spy={spy({ stage: 'guess', voted: 3, caught: true })} />);
    expect(screen.getByText(t('spyGuessStage'))).toBeTruthy();
  });

  it('a removed spy', () => {
    render(<HostSpy spy={spy({ spyName: null })} />);
    expect(screen.getByText(t('spyGone'))).toBeTruthy();
  });
});
