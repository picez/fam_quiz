// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ChallengePreview, ChallengeResultRow } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChallenge, getChallengeResults, startChallenge } from '../api';
import { formatDay, secondsText } from '../format';
import { savePlayer, saveAuthor, saveLastGame } from '../storage';
import { useAccount } from '../useAccount';
import { ChallengePage } from './ChallengePage';

vi.mock('../api', () => ({ getChallenge: vi.fn(), startChallenge: vi.fn(), getChallengeResults: vi.fn() }));
vi.mock('../useAccount', () => ({ useAccount: vi.fn() }));
vi.mock('../storage', () => ({ savePlayer: vi.fn(), saveAuthor: vi.fn(), saveLastGame: vi.fn() }));

const CODE = 'abcdefghjkmn';
const signedIn = { status: 'signed-in', account: { id: 'u1', name: 'Я', email: 'a@b.c', admin: false, locale: null, easyMode: false } };

const preview = (over: Partial<ChallengePreview> = {}): ChallengePreview => ({
  title: 'Річки України',
  author: { id: 'u2', nickname: 'Олена' },
  expiresAt: new Date(Date.now() + 4.5 * 86_400_000).toISOString(),
  endedAt: null,
  active: true,
  played: 3,
  isAuthor: false,
  mine: 'none',
  canSeeResults: false,
  ...over,
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function show(code = CODE) {
  render(
    <MemoryRouter initialEntries={[`/challenge/${code}`]}>
      <Routes>
        <Route path="/challenge/:code" element={<ChallengePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useAccount).mockReturnValue(signedIn as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ChallengePage', () => {
  it('a guest is asked to sign in', () => {
    vi.mocked(useAccount).mockReturnValue({ status: 'anonymous' } as never);
    show();
    expect(screen.getByText('Увійдіть, щоб прийняти виклик.')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Увійти' });
    expect(link.getAttribute('href')).toBe(`/login?next=${encodeURIComponent(`/challenge/${CODE}`)}`);
    expect(getChallenge).not.toHaveBeenCalled();
  });

  it('a bad or unknown code', async () => {
    show('abc');
    expect(screen.getByText('Виклик не знайдено — можливо, посилання неповне.')).toBeTruthy();
    expect(getChallenge).not.toHaveBeenCalled();
    cleanup();
    vi.mocked(getChallenge).mockResolvedValue({ ok: false, error: 'challenge_not_found' });
    show();
    expect(await screen.findByText('Виклик не знайдено — можливо, посилання неповне.')).toBeTruthy();
  });

  it('before playing: the card, no table', async () => {
    vi.mocked(getChallenge).mockResolvedValue({ ok: true, data: preview() });
    show();
    expect(await screen.findByText('Річки України')).toBeTruthy();
    expect(screen.getByText('від Олена')).toBeTruthy();
    expect(screen.getByText('лишилося 5 днів')).toBeTruthy();
    expect(screen.getByText('зіграли 3 людини')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Почати' })).toBeTruthy();
    expect(screen.getByText('Таблицю видно після власної гри.')).toBeTruthy();
    expect(getChallengeResults).not.toHaveBeenCalled();
    expect(document.querySelector('table')).toBeNull();
  });

  it('start goes to the game', async () => {
    vi.mocked(getChallenge).mockResolvedValue({ ok: true, data: preview() });
    vi.mocked(startChallenge).mockResolvedValue({ ok: true, data: { code: '654321', token: 'tok', playerId: 'p1', stageToken: 'stg' } });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Почати' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/play/654321'));
    expect(startChallenge).toHaveBeenCalledWith(CODE);
    expect(savePlayer).toHaveBeenCalledWith('654321', 'tok');
    expect(saveAuthor).toHaveBeenCalledWith('654321', { stageToken: 'stg' });
    expect(saveLastGame).toHaveBeenCalledWith('654321');
  });

  it('a refused start shows the error', async () => {
    vi.mocked(getChallenge).mockResolvedValue({ ok: true, data: preview() });
    vi.mocked(startChallenge).mockResolvedValue({ ok: false, error: 'challenge_closed' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Почати' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Виклик уже завершено — нових спроб немає.');
    expect(savePlayer).not.toHaveBeenCalled();
  });

  it('a restarting server is retried a few times, then a message and a retry button', async () => {
    vi.mocked(getChallenge).mockResolvedValue({ ok: true, data: preview() });
    vi.mocked(startChallenge).mockResolvedValue({ ok: false, error: 'restarting' });
    show();
    const button = await screen.findByRole('button', { name: 'Почати' });
    vi.useFakeTimers();
    fireEvent.click(button);
    for (let i = 0; i < 6; i += 1) await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(vi.mocked(startChallenge).mock.calls.length).toBe(4);
    expect((screen.getByRole('alert')).textContent).toBe('Сервер перезапускається. Спробуйте за кілька секунд.');
    const retry = screen.getByRole('button', { name: 'Почати' }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    vi.mocked(startChallenge).mockResolvedValue({ ok: true, data: { code: '654321', token: 'tok', playerId: 'p1', stageToken: 'stg' } });
    fireEvent.click(retry);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByTestId('where').textContent).toBe('/play/654321');
  });

  it('return and done', async () => {
    vi.mocked(getChallenge).mockResolvedValue({ ok: true, data: preview({ mine: 'playing', canSeeResults: true }) });
    vi.mocked(getChallengeResults).mockResolvedValue({ ok: true, data: [] });
    show();
    expect(await screen.findByRole('button', { name: 'Продовжити' })).toBeTruthy();
    expect(await screen.findByText('Ще ніхто не зіграв.')).toBeTruthy();
    cleanup();

    const at = '2026-11-10T10:00:00.000Z';
    const rows: ChallengeResultRow[] = [
      { place: 1, nickname: 'Олена', score: 120, timeMs: 23_400, at, done: true, author: true, me: false },
      { place: 2, nickname: 'Я', score: 90, timeMs: 30_000, at, done: true, author: false, me: true },
      { place: 3, nickname: 'Ігор', score: 10, timeMs: 5_000, at, done: false, author: false, me: false },
    ];
    vi.mocked(getChallenge).mockResolvedValue({ ok: true, data: preview({ mine: 'done', canSeeResults: true }) });
    vi.mocked(getChallengeResults).mockResolvedValue({ ok: true, data: rows });
    show();
    expect(await screen.findByText('Ти вже зіграв цей виклик.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Почати' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Продовжити' })).toBeNull();
    const table = await screen.findByRole('table');
    expect(table.querySelectorAll('thead th').length).toBe(5);
    expect(table.querySelector('caption')).not.toBeNull();
    const body = table.querySelectorAll('tbody tr');
    expect(body.length).toBe(3);
    const first = within(body[0] as HTMLElement);
    expect(first.getByText('автор')).toBeTruthy();
    expect(first.getByText('120')).toBeTruthy();
    expect((body[0] as HTMLElement).textContent).toContain(`${secondsText(23_400)} с`);
    expect((body[0] as HTMLElement).textContent).toContain(formatDay(at));
    expect(body[1].classList.contains('is-me')).toBe(true);
    expect(body[0].classList.contains('is-me')).toBe(false);
    expect(within(body[2] as HTMLElement).getByText('не завершено')).toBeTruthy();
  });

  it('an ended challenge', async () => {
    vi.mocked(getChallenge).mockResolvedValue({ ok: true, data: preview({ active: false, endedAt: '2026-11-12T00:00:00.000Z' }) });
    show();
    expect(await screen.findByText('Виклик завершено.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
