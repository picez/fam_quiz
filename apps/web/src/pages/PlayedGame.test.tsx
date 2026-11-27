// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayedGameDetail, Question } from '@quiz/shared';
import { getPlayedGame, me } from '../api';
import { PlayedGame } from './PlayedGame';

vi.mock('../api', () => ({ me: vi.fn(), getPlayedGame: vi.fn() }));

const base = { imageUrl: null, video: null, timeLimit: 20, points: 1000 };
const single = { ...base, id: 'q1', type: 'single', text: 'Столиця України?', options: [{ id: 'a', text: 'Львів' }, { id: 'b', text: 'Київ' }], correctId: 'b' } satisfies Question;
const text = { ...base, id: 'q4', type: 'text', text: 'Яке місто називають перлиною біля моря?', accepted: ['Одеса'] } satisfies Question;
const cloud = { ...base, id: 'q16', type: 'wordcloud', text: 'З чим асоціюється Київ?', points: 0, words: 3 } satisfies Question;

const detail: PlayedGameDetail = {
  gameId: 'g1',
  title: 'Географія',
  startedAt: '2026-10-12T15:30:00.000Z',
  autopilot: false,
  nickname: 'Олена',
  team: null,
  teams: false,
  rank: 2,
  score: 1500,
  playerCount: 3,
  standings: [
    { rank: 1, nickname: 'Тарас', score: 2000, me: false },
    { rank: 2, nickname: 'Олена', score: 1500, me: true },
    { rank: 3, nickname: 'Іра', score: 0, me: false },
  ],
  questions: [
    { index: 0, roundIndex: 0, text: single.text, type: 'single', question: single, mine: [{ answer: { type: 'single', optionId: 'b' }, accepted: true, spare: null }] },
    { index: 1, roundIndex: 0, text: text.text, type: 'text', question: text, mine: [{ answer: { type: 'text', value: 'Львів' }, accepted: false, spare: null }] },
    { index: 2, roundIndex: 0, text: cloud.text, type: 'wordcloud', question: cloud, mine: [] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(getPlayedGame).mockResolvedValue({ ok: true, data: detail });
});
afterEach(cleanup);

const open = () =>
  render(
    <MemoryRouter initialEntries={['/me/g1']}>
      <Routes>
        <Route path="/me/:id" element={<PlayedGame />} />
      </Routes>
    </MemoryRouter>,
  );

describe('PlayedGame (79)', () => {
  it('shows the place, the final standings with me marked, and a link to all stats', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Географія' })).toBeTruthy();
    expect(getPlayedGame).toHaveBeenCalledWith('g1');
    expect(screen.getByText(/ти грав\(-ла\) як Олена/)).toBeTruthy();
    expect(screen.getByText('2 місце з 3')).toBeTruthy();
    const table = screen.getByRole('heading', { name: 'Підсумки' }).closest('section')!;
    const rows = [...table.querySelectorAll('li')];
    expect(rows.map((row) => row.querySelector('.name')!.textContent)).toEqual(['Тарас', 'Олена', 'Іра']);
    expect(rows[1]!.classList.contains('is-me')).toBe(true);
    expect(screen.getByRole('link', { name: /Уся статистика/ }).getAttribute('href')).toBe('/profile/stats');
    expect(screen.getByRole('link', { name: /Назад/ }).getAttribute('href')).toBe('/me');
  });

  it('lists my answers with right / wrong, the right answer, and no verdict for an unscored question', async () => {
    open();
    const answers = (await screen.findByRole('heading', { name: 'Твої відповіді' })).closest('section')!;
    const items = [...answers.querySelectorAll('ol > li')] as HTMLElement[];
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText('Запитання 1')).toBeTruthy();
    expect(within(items[0]!).getByText('Правильно')).toBeTruthy();
    expect(items[0]!.classList.contains('is-correct')).toBe(true);
    expect(within(items[1]!).getByText('Неправильно')).toBeTruthy();
    expect(within(items[1]!).getByText('Твоя відповідь: Львів')).toBeTruthy();
    expect(within(items[1]!).getByText('Правильна відповідь: Одеса')).toBeTruthy();
    expect(within(items[2]!).getByText('Без відповіді')).toBeTruthy();
    expect(within(items[2]!).queryByText(/Правильна відповідь/)).toBeNull();
    expect(within(items[2]!).queryByText('Неправильно')).toBeNull();
  });

  it('a failed load offers a retry', async () => {
    vi.mocked(getPlayedGame).mockResolvedValueOnce({ ok: false, error: 'offline' });
    open();
    expect(await screen.findByRole('button', { name: 'Спробувати ще раз' })).toBeTruthy();
  });
});
