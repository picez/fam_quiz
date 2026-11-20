// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { GameDetail } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminGame } from './AdminGame';

const game: GameDetail = {
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Карпати',
  code: 'ABCD',
  status: 'finished',
  startedAt: '2026-10-10T10:00:00.000Z',
  finishedAt: '2026-10-10T11:00:00.000Z',
  questionsPlayed: 0,
  questionCount: 0,
  teams: false,
  autopilot: false,
  rounds: [],
  standings: [{ participantId: 'p1', nickname: 'Оля', score: 1200, rank: 1, correct: 4, rounds: [], breakdown: {} as GameDetail['standings'][number]['breakdown'] }],
  firstRound: 0,
  questions: [],
  adjustments: [],
  facts: { awards: [], table: [] },
};

let urls: string[];
const stub = (status: number, data: unknown) => {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = () =>
  render(
    <MemoryRouter initialEntries={[`/admin/games/${game.id}`]}>
      <Routes>
        <Route path="/admin/games/:id" element={<AdminGame />} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('AdminGame (58)', () => {
  it('loads the game through the admin route and shows it like the history page', async () => {
    stub(200, game);
    open();
    expect(await screen.findByRole('heading', { name: 'Карпати' })).toBeTruthy();
    expect(urls).toEqual([`/api/admin/games/${game.id}`]);
    expect(screen.getByText('Оля')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Підсумки' })).toBeTruthy();
    expect(screen.queryByRole('main')).toBeNull();
  });

  it('goes home on 404', async () => {
    stub(404, { error: 'not_found' });
    open();
    expect(await screen.findByText('головна')).toBeTruthy();
  });
});
