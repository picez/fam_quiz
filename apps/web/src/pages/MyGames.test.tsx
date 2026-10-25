// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayedGame } from '@quiz/shared';
import { me, myHistory } from '../api';
import { MyGames } from './MyGames';

vi.mock('../api', () => ({ me: vi.fn(), myHistory: vi.fn() }));

const played = (over: Partial<PlayedGame>): PlayedGame => ({
  gameId: 'g1',
  title: 'Географія',
  status: 'finished',
  startedAt: '2026-10-12T15:30:00.000Z',
  nickname: 'Олена',
  score: 2000,
  rank: 1,
  playerCount: 5,
  correct: 4,
  answered: 5,
  questionsPlayed: 5,
  team: null,
  ...over,
});

/** Підставна сторінка входу: показує адресу, на яку людину повернуть після входу. */
function LoginStub() {
  return <p>{`сторінка входу ${useLocation().search}`}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
});
afterEach(cleanup);

const open = () =>
  render(
    <MemoryRouter initialEntries={['/me']}>
      <Routes>
        <Route path="/me" element={<MyGames />} />
        <Route path="/login" element={<LoginStub />} />
      </Routes>
    </MemoryRouter>,
  );

const stat = (label: string) => screen.getByText(label).closest('.stat')?.textContent;

describe('MyGames', () => {
  it('lists played games with the place and the result', async () => {
    vi.mocked(myHistory).mockResolvedValue({ ok: true, data: [played({})] });
    open();
    expect(await screen.findByRole('heading', { name: 'Географія' })).toBeTruthy();
    expect(screen.getByText('1 місце з 5')).toBeTruthy();
    expect(screen.getByText('2000 балів, правильних відповідей: 4 з 5')).toBeTruthy();
    expect(screen.getByText(/ви грали як Олена/)).toBeTruthy();
  });

  it('sums up the games, wins and share of correct answers', async () => {
    vi.mocked(myHistory).mockResolvedValue({
      ok: true,
      data: [
        played({ gameId: 'g1', rank: 1, correct: 4, questionsPlayed: 5 }),
        played({ gameId: 'g2', rank: 3, correct: 2, questionsPlayed: 5 }),
        played({ gameId: 'g3', rank: null, status: 'aborted', correct: 0, questionsPlayed: 0 }),
      ],
    });
    open();
    await screen.findAllByRole('heading', { name: 'Географія' });
    expect(stat('гри')).toContain('3');
    expect(stat('перемога')).toContain('1');
    expect(stat('правильних відповідей')).toContain('60%');
    expect(screen.getByText(/перервано/)).toBeTruthy();
    expect(screen.getByText('без місця')).toBeTruthy();
  });

  it("a team game shows the player's team chip and the team's place", async () => {
    vi.mocked(myHistory).mockResolvedValue({
      ok: true,
      data: [played({ gameId: 'g1', team: 'Сині', rank: 1, playerCount: 2 }), played({ gameId: 'g2', team: null })],
    });
    const { container } = open();
    await screen.findAllByRole('heading', { name: 'Географія' });
    expect(screen.getByText('Команда «Сині»')).toBeTruthy();
    expect(screen.getAllByText('Команда «Сині»')).toHaveLength(1);
    expect(screen.getByText('1 місце з 2')).toBeTruthy();
    expect(stat('перемоги')).toContain('2');
    expect(container.querySelectorAll('.team-chip')).toHaveLength(1);
  });

  it('explains how games get here when there are none', async () => {
    vi.mocked(myHistory).mockResolvedValue({ ok: true, data: [] });
    open();
    expect(await screen.findByText(/Тут з’являться ігри, у які ви зіграли/)).toBeTruthy();
    expect(screen.queryByText(/перемог/)).toBeNull();
  });

  it('sends a visitor to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('сторінка входу ?next=%2Fme')).toBeTruthy();
  });

  it('explains a failed session check instead of asking a signed-in person to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'offline' });
    open();
    expect((await screen.findByRole('alert')).textContent).toBe('Немає зв’язку із сервером.');
    expect(screen.queryByText(/сторінка входу/)).toBeNull();
  });
});

describe('MyGames: what counts as a win', () => {
  it('does not count first place with no points or with nobody to beat', async () => {
    vi.mocked(myHistory).mockResolvedValue({
      ok: true,
      data: [
        played({ gameId: 'won', rank: 1, score: 2000, playerCount: 5 }),
        played({ gameId: 'nobody-scored', rank: 1, score: 0, playerCount: 3, correct: 0 }),
        played({ gameId: 'alone', rank: 1, score: 900, playerCount: 1 }),
        played({ gameId: 'running', rank: null, status: 'running', score: 500 }),
      ],
    });
    open();
    await screen.findAllByRole('heading', { name: 'Географія' });
    expect(stat('перемога')).toContain('1');
    expect(stat('гри')).toContain('4');
  });
});
