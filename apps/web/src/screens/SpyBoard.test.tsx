// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { SpyInfo, SpyRow } from '@quiz/shared';
import { countText, t } from '../i18n';
import { SpyBoard } from './SpyBoard';

afterEach(cleanup);

const row = (id: string, nickname: string, word: string | null, over: Partial<SpyRow> = {}): SpyRow => ({ id, nickname, word, voters: null, spy: null, points: null, ...over });

const voteInfo: SpyInfo = {
  stage: 'vote',
  written: 3,
  voted: 0,
  total: 3,
  rows: [row('p1', 'Оля', 'аромат'), row('p2', 'Петро', 'листя'), row('p3', 'Тарас', null)],
  playersWord: null,
  spyHint: null,
  spyName: null,
  caught: null,
  guess: null,
  guessed: null,
};

const revealInfo = (over: Partial<SpyInfo> = {}): SpyInfo => ({
  ...voteInfo,
  stage: 'reveal',
  voted: 3,
  rows: [
    row('p1', 'Оля', 'аромат', { voters: [], spy: false, points: 1000 }),
    row('p2', 'Петро', 'листя', { voters: ['Оля', 'Тарас', 'Ганна'], spy: true, points: 500 }),
    row('p3', 'Тарас', 'ранок', { voters: [], spy: false, points: 1000 }),
  ],
  playersWord: 'кава',
  spyHint: 'Її п’ють зранку',
  spyName: 'Петро',
  caught: true,
  guess: 'кава',
  guessed: true,
  ...over,
});

const lineOf = (name: string) => [...document.querySelectorAll<HTMLElement>('.spy-row')].find((li) => li.querySelector('.name')?.textContent === name)!;

describe('SpyBoard', () => {
  it('vote shows associations with names only', () => {
    render(<SpyBoard info={voteInfo} />);
    expect(screen.getByText(t('spyVoteTitle'))).toBeTruthy();
    expect(lineOf('Оля').querySelector('.spy-line')!.textContent).toBe('Оля — аромат');
    expect(lineOf('Тарас').querySelector('.spy-word')!.className).toContain('is-empty');
    expect(document.querySelector('.spy-votes')).toBeNull();
    expect(document.querySelector('.spy-row.is-spy')).toBeNull();
    expect(document.body.textContent).not.toContain('кава');
    expect(document.body.textContent).not.toContain('чай');
  });

  it('words shows no rows', () => {
    render(<SpyBoard info={{ ...voteInfo, stage: 'words', rows: null }} />);
    expect(document.querySelector('.spy-board')).toBeNull();
  });

  it('guess shows the last chance without a name', () => {
    render(<SpyBoard info={{ ...voteInfo, stage: 'guess', voted: 3 }} />);
    expect(screen.getByText(t('spyGuessStage'))).toBeTruthy();
    expect(document.querySelector('.spy-title')).toBeNull();
    expect(document.querySelector('.spy-row.is-spy')).toBeNull();
  });

  it('reveal without a hint has no hint line', () => {
    render(<SpyBoard info={revealInfo({ spyHint: null })} />);
    expect(screen.getByText(t('spyRevealWord', { word: 'кава' }))).toBeTruthy();
    expect(screen.queryByText(/Підказка шпигуну/)).toBeNull();
  });

  it('reveal', () => {
    render(<SpyBoard info={revealInfo()} />);
    expect(screen.getByText(t('spyRevealSpy', { name: 'Петро' }))).toBeTruthy();
    expect(screen.getByText(t('spyRevealWord', { word: 'кава' }))).toBeTruthy();
    expect(screen.getByText(t('spyRevealHint', { hint: 'Її п’ють зранку' }))).toBeTruthy();
    expect(screen.getByText(t('spyCaught'))).toBeTruthy();
    const petro = lineOf('Петро');
    expect(petro.className).toContain('is-spy');
    expect(petro.querySelector('.spy-votes')!.textContent).toBe(countText('spyVotes', 3, { count: 3 }));
    expect(petro.querySelector('.spy-votes')!.textContent).toBe('3 голоси');
    expect(petro.querySelector('.spy-voters')!.textContent).toBe('Оля, Тарас, Ганна');
    expect(screen.getByText(t('spyGuessed', { points: 500 }))).toBeTruthy();
    expect(screen.getByText('…і вгадав слово: +500')).toBeTruthy();
  });

  it('a missed guess names the guess', () => {
    render(<SpyBoard info={revealInfo({ guess: 'какао', guessed: false })} />);
    expect(screen.getByText(t('spyMissedGuess', { guess: 'какао' }))).toBeTruthy();
  });

  it('locked shows the wait line instead of the title and hint, rows stay', () => {
    render(<SpyBoard info={voteInfo} locked />);
    expect(screen.getByText(t('waitReveal'))).toBeTruthy();
    expect(screen.queryByText(t('spyVoteTitle'))).toBeNull();
    expect(screen.queryByText(t('spyVoteHint'))).toBeNull();
    expect(document.querySelectorAll('.spy-row')).toHaveLength(3);
  });

  it('not caught', () => {
    render(<SpyBoard info={revealInfo({ caught: false, guess: null, guessed: false })} />);
    expect(screen.getByText(t('spyHidden'))).toBeTruthy();
    expect(screen.queryByText(t('spyCaught'))).toBeNull();
    expect(document.querySelector('.spy-guess')).toBeNull();
  });

  it('spyGone when the spy left', () => {
    render(<SpyBoard info={revealInfo({ spyName: null, caught: false, guessed: false, guess: null })} />);
    expect(screen.getByText(t('spyGone'))).toBeTruthy();
    expect(screen.queryByText(t('spyHidden'))).toBeNull();
  });

  it('is-many past 12 rows', () => {
    const many = (n: number): SpyInfo => ({ ...voteInfo, rows: Array.from({ length: n }, (_, i) => row(`p${i}`, `n${i}`, `w${i}`)) });
    const { unmount } = render(<SpyBoard info={many(12)} />);
    expect(document.querySelector('.spy-board')!.className).not.toContain('is-many');
    unmount();
    render(<SpyBoard info={many(24)} />);
    expect(document.querySelector('.spy-board')!.className).toContain('is-many');
    expect(document.querySelectorAll('.spy-row')).toHaveLength(24);
  });

  it('rows wrap at 320 px and use theme colours', () => {
    const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
    const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
    const rule = (selector: string) => {
      const start = css.indexOf(`\n${selector} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    };
    expect(rule('.spy-board')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(rule('.spy-line')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule('.spy-me-word')).toMatch(/overflow-wrap:\s*anywhere/);
    const start = css.indexOf('/* «Шпигун» (38)');
    expect(start).toBeGreaterThan(0);
    const section = css.slice(start, css.indexOf('/* «Шпигун»: кінець */'));
    for (const [, value, unit] of section.matchAll(/(?:^|[\s;{])(?:min-|max-)?width:\s*([\d.]+)(px|rem)/g)) {
      expect(Number(value) * (unit === 'rem' ? 16 : 1)).toBeLessThanOrEqual(320);
    }
    // Лише змінні теми — світла тема без окремих правил.
    expect(section).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });
});
