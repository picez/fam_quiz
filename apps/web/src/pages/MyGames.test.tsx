// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
  ...over,
});

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
        <Route path="/login" element={<p>сторінка входу</p>} />
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

  it('explains how games get here when there are none', async () => {
    vi.mocked(myHistory).mockResolvedValue({ ok: true, data: [] });
    open();
    expect(await screen.findByText(/Тут з’являться ігри, у які ви зіграли/)).toBeTruthy();
    expect(screen.queryByText(/перемог/)).toBeNull();
  });

  it('sends a visitor to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });
});
