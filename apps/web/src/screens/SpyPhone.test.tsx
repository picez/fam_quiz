// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerSpy, SpyInfo, SpyRow } from '@quiz/shared';
import { errorText, t } from '../i18n';
import type { Send } from '../live/types';
import { SpyPhone } from './SpyPhone';

afterEach(cleanup);

const row = (id: string, nickname: string, word: string | null): SpyRow => ({ id, nickname, word, voters: null, spy: null, points: null });

const info = (over: Partial<SpyInfo> = {}): SpyInfo => ({
  stage: 'words',
  written: 1,
  voted: 0,
  total: 4,
  rows: null,
  playersWord: null,
  spyHint: null,
  spyName: null,
  caught: null,
  guess: null,
  guessed: null,
  ...over,
});

const mine = (over: Partial<PlayerSpy> = {}): PlayerSpy => ({ word: 'кава', hint: null, wrote: null, vote: null, spectator: false, guessing: false, guess: null, spy: false, ...over });

const voteRows = [row('p1', 'Оля', 'ранок'), row('p2', 'Тарас', 'аромат'), row('p3', 'Петро', 'листя'), row('p4', 'Ганна', null)];

const ok = () => vi.fn(async () => ({ ok: true as const }));

describe('SpyPhone', () => {
  it('words stage', async () => {
    const send = ok();
    const { rerender } = render(<SpyPhone info={info()} mine={mine()} meId="p1" send={send} />);
    expect(screen.getByText(t('spyYourWord'))).toBeTruthy();
    expect(screen.getByText('кава')).toBeTruthy();
    const field = screen.getByRole('textbox', { name: t('spyWordPrompt') }) as HTMLInputElement;
    expect(field.maxLength).toBe(40);
    expect(screen.getByText(t('answeredOf', { answered: 1, total: 4 }))).toBeTruthy();
    fireEvent.change(field, { target: { value: '  аромат ' } });
    fireEvent.click(screen.getByRole('button', { name: t('submit') }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:spy-word', { text: 'аромат' }));
    rerender(<SpyPhone info={info({ written: 2 })} mine={mine({ wrote: 'аромат' })} meId="p1" send={send} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('аромат')).toBeTruthy();
    expect(screen.getByText(t('spyWaitVote'))).toBeTruthy();
  });

  it('the spy sees only the role and the hint', () => {
    const spyMine = mine({ word: null, hint: "Її п’ють зранку", spy: true });
    const { rerender } = render(<SpyPhone info={info()} mine={spyMine} meId="p1" send={ok()} />);
    expect(screen.getByText(t('spyYouAreSpy'))).toBeTruthy();
    expect(screen.getByText(t('spyHintLine', { hint: "Її п’ють зранку" }))).toBeTruthy();
    expect(screen.getByRole('textbox', { name: t('spyWordPrompt') })).toBeTruthy();
    expect(screen.queryByText(t('spyYourWord'))).toBeNull();
    rerender(<SpyPhone info={info({ stage: 'vote', rows: voteRows })} mine={spyMine} meId="p1" send={ok()} />);
    expect(screen.getByText(t('spyYouAreSpy'))).toBeTruthy();
    expect(screen.getByText(t('spyHintLine', { hint: "Її п’ють зранку" }))).toBeTruthy();
    expect(screen.queryByText(t('spyYourWord'))).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('only the spy sees how to write, and only until the association is sent', () => {
    const { rerender } = render(<SpyPhone info={info()} mine={mine({ word: null, spy: true })} meId="p1" send={ok()} />);
    expect(screen.getByText(t('spyYouHow'))).toBeTruthy();
    rerender(<SpyPhone info={info()} mine={mine({ word: null, spy: true, wrote: 'ранок' })} meId="p1" send={ok()} />);
    expect(screen.queryByText(t('spyYouHow'))).toBeNull();
    rerender(<SpyPhone info={info()} mine={mine()} meId="p1" send={ok()} />);
    expect(screen.queryByText(t('spyYouHow'))).toBeNull();
    rerender(<SpyPhone info={info({ stage: 'vote', rows: voteRows })} mine={mine({ word: null, spy: true })} meId="p1" send={ok()} />);
    expect(screen.queryByText(t('spyYouHow'))).toBeNull();
  });

  it('the role card follows the spy flag', () => {
    render(<SpyPhone info={info()} mine={mine({ word: 'кава', spy: true })} meId="p1" send={ok()} />);
    expect(screen.getByText(t('spyYouAreSpy'))).toBeTruthy();
    expect(screen.queryByText('кава')).toBeNull();
  });

  it('the caught spy still sees the hint while guessing', () => {
    render(<SpyPhone info={info({ stage: 'guess', rows: voteRows })} mine={mine({ word: null, spy: true, guessing: true, hint: "Її п’ють зранку" })} meId="p3" send={ok()} />);
    expect(screen.getByText(t('spyHintLine', { hint: "Її п’ють зранку" }))).toBeTruthy();
    expect(screen.getByText(t('spyCaughtYou'))).toBeTruthy();
  });

  it('the spy without a hint sees only the role', () => {
    render(<SpyPhone info={info()} mine={mine({ word: null, hint: null, spy: true })} meId="p1" send={ok()} />);
    expect(screen.getByText(t('spyYouAreSpy'))).toBeTruthy();
    expect(screen.queryByText(/Підказка/)).toBeNull();
  });

  it('other players still see their word', () => {
    render(<SpyPhone info={info()} mine={mine({ word: 'кава' })} meId="p1" send={ok()} />);
    expect(screen.getByText(t('spyYourWord'))).toBeTruthy();
    expect(screen.getByText('кава')).toBeTruthy();
    expect(screen.queryByText(t('spyYouAreSpy'))).toBeNull();
  });

  it('a refused association shows the reason and keeps the text', async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: 'spy_word' }));
    render(<SpyPhone info={info()} mine={mine()} meId="p1" send={send as unknown as Send} />);
    const field = screen.getByRole('textbox', { name: t('spyWordPrompt') }) as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'кава' } });
    fireEvent.submit(field.closest('form')!);
    expect(await screen.findByText(t('err_spy_word'))).toBeTruthy();
    expect(field.value).toBe('кава');
  });

  it('vote stage', async () => {
    const send = ok();
    const { rerender } = render(<SpyPhone info={info({ stage: 'vote', written: 4, rows: voteRows })} mine={mine({ wrote: 'ранок' })} meId="p1" send={send} />);
    expect(screen.getByText(t('spyVoteTitle'))).toBeTruthy();
    const names = screen.getAllByRole('button').map((button) => button.querySelector('.name')?.textContent);
    expect(names).toEqual(['Тарас', 'Петро', 'Ганна']);
    expect(screen.getByRole('button', { name: /Тарас/ }).textContent).toContain('аромат');
    fireEvent.click(screen.getByRole('button', { name: /Петро/ }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:spy-vote', { playerId: 'p3' }));
    rerender(<SpyPhone info={info({ stage: 'vote', written: 4, voted: 1, rows: voteRows })} mine={mine({ wrote: 'ранок', vote: 'p3' })} meId="p1" send={send} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(t('spyVoted'))).toBeTruthy();
    expect(screen.getByText(t('votedOf', { voted: 1, total: 4 }))).toBeTruthy();
  });

  it('a spy_self error shows its text', async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: 'spy_self' }));
    render(<SpyPhone info={info({ stage: 'vote', rows: voteRows })} mine={mine()} meId="p1" send={send as unknown as Send} />);
    fireEvent.click(screen.getByRole('button', { name: /Тарас/ }));
    expect(await screen.findByText(errorText('spy_self'))).toBeTruthy();
    expect(errorText('spy_self')).toBe(t('err_spy_self'));
  });

  it('guess for the spy only', async () => {
    const send = ok();
    const { unmount } = render(<SpyPhone info={info({ stage: 'guess', rows: voteRows })} mine={mine({ word: null, spy: true, guessing: true })} meId="p3" send={send} />);
    expect(screen.getByText(t('spyCaughtYou'))).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: t('spyPlayersWord') }), { target: { value: 'кава' } });
    fireEvent.click(screen.getByRole('button', { name: t('submit') }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:spy-guess', { text: 'кава' }));
    unmount();
    render(<SpyPhone info={info({ stage: 'guess', rows: voteRows })} mine={mine({ vote: 'p3' })} meId="p1" send={send} />);
    expect(screen.getByText(t('spyGuessStage'))).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(t('spyCaughtYou'))).toBeNull();
  });

  it('spectator', () => {
    const { unmount } = render(<SpyPhone info={info()} mine={mine({ spectator: true })} meId="p9" send={ok()} />);
    expect(screen.getByText(t('spySpectator'))).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    unmount();
    render(<SpyPhone info={info({ stage: 'vote', rows: voteRows })} mine={mine({ spectator: true })} meId="p9" send={ok()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('24 names fit 320 px', () => {
    const rows = Array.from({ length: 24 }, (_, i) => row(`p${i}`, `${'Ганна'.repeat(4)}${i}`, 'а'.repeat(40)));
    render(<SpyPhone info={info({ stage: 'vote', total: 24, rows })} mine={mine()} meId="p0" send={ok()} />);
    expect(screen.getAllByRole('button')).toHaveLength(23);
    const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
    const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
    const rule = (selector: string) => {
      const start = css.indexOf(`\n${selector} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    };
    // Кнопки в одну колонку на всю ширину; довгі імена й слова переносяться, а не розпирають телефон.
    expect(rule('.spy-vote')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(rule('.spy-vote .btn')).toMatch(/width:\s*100%/);
    expect(rule('.spy-vote .btn')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule('.spy-vote .btn')).toMatch(/white-space:\s*normal/);
  });
});

describe('SpyPhone: the cursor (45b)', () => {
  it('the association field gets the cursor', () => {
    render(<SpyPhone info={info()} mine={mine()} meId="p1" send={ok()} />);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: t('spyWordPrompt') }));
  });

  it('a field under a disabled fieldset (pause, splash) gets no cursor until it opens', () => {
    const { rerender } = render(
      <fieldset disabled>
        <SpyPhone info={info()} mine={mine()} meId="p1" send={ok()} />
      </fieldset>,
    );
    const field = screen.getByRole('textbox', { name: t('spyWordPrompt') });
    expect(document.activeElement).not.toBe(field);
    rerender(
      <fieldset disabled={false}>
        <SpyPhone info={info()} mine={mine()} meId="p1" send={ok()} />
      </fieldset>,
    );
    expect(document.activeElement).toBe(field);
  });
});
