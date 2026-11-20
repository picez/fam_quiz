// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DELETED_NICKNAME, type GameDetail } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateLocaleForTests } from '../i18n';
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
    // Адмінка вже має h1: назва гри тут — h2 (сторінка історії гравця лишає h1).
    expect(await screen.findByRole('heading', { name: 'Карпати', level: 2 })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(urls).toEqual([`/api/admin/games/${game.id}`]);
    expect(screen.getByText('Оля')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Підсумки' })).toBeTruthy();
    expect(screen.queryByRole('main')).toBeNull();
  });

  it('shows the stored deleted-player mark in the active language', async () => {
    activateLocaleForTests('en', { ui: { deletedPlayer: 'Deleted player', deletedFact: '(fact deleted)' } });
    try {
      stub(200, { ...game, standings: [{ ...game.standings[0]!, nickname: DELETED_NICKNAME }] });
      open();
      expect(await screen.findByText('Deleted player')).toBeTruthy();
      expect(screen.queryByText(DELETED_NICKNAME)).toBeNull();
    } finally {
      activateLocaleForTests('uk');
    }
  });

  it('links a finished game to its step-by-step replay (65)', async () => {
    stub(200, game);
    open();
    const link = await screen.findByRole('link', { name: 'Повтор по кроках' });
    expect(link.getAttribute('href')).toBe(`/admin/games/${game.id}/replay`);
  });

  it('has no replay link while the game is running (65)', async () => {
    stub(200, { ...game, status: 'running', finishedAt: null });
    open();
    expect(await screen.findByRole('heading', { name: 'Карпати', level: 2 })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Повтор по кроках' })).toBeNull();
  });

  it('goes home on 404', async () => {
    stub(404, { error: 'not_found' });
    open();
    expect(await screen.findByText('головна')).toBeTruthy();
  });
});
