// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDetail, GameSummary, Question } from '@quiz/shared';
import { getGame, listGames, me } from '../api';
import { GameHistory } from './GameHistory';
import { History } from './History';

vi.mock('../api', () => ({ me: vi.fn(), listGames: vi.fn(), getGame: vi.fn() }));

const summary: GameSummary = {
  id: 'g1',
  title: 'Географія',
  code: '123456',
  status: 'finished',
  startedAt: '2026-10-12T15:30:00.000Z',
  finishedAt: '2026-10-12T15:50:00.000Z',
  playerCount: 2,
  questionsPlayed: 6,
  questionCount: 6,
};

const base = { imageUrl: null, timeLimit: 20, points: 1000 };
const singleQ: Question = {
  ...base,
  id: 'q1',
  type: 'single',
  text: 'Столиця України?',
  options: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
  ],
  correctId: 'b',
};
const textQ: Question = { ...base, id: 'q2', type: 'text', text: 'Перлина біля моря?', accepted: ['Одеса'] };
const matchQ: Question = {
  ...base,
  id: 'q3',
  type: 'match',
  text: 'З’єднайте місто з річкою',
  pairs: [
    { left: { id: 'a', text: 'Київ' }, right: { id: 'x', text: 'Дніпро' } },
    { left: { id: 'b', text: 'Львів' }, right: { id: 'y', text: 'Полтва' } },
    { left: { id: 'c', text: 'Ужгород' }, right: { id: 'z', text: 'Уж' } },
  ],
};

const detail: GameDetail = {
  id: 'g1',
  title: 'Географія',
  code: '123456',
  status: 'finished',
  startedAt: summary.startedAt,
  finishedAt: summary.finishedAt,
  questionsPlayed: 2,
  questionCount: 2,
  rounds: [{ title: 'Раунд 1', type: 'classic' }],
  standings: [
    { participantId: 'p1', nickname: 'Олена', score: 2000, rank: 1, correct: 2 },
    { participantId: 'p2', nickname: 'Тарас', score: 0, rank: 2, correct: 0 },
  ],
  questions: [
    { index: 0, roundIndex: 0, text: 'Столиця України?', type: 'single', answered: 2, accepted: 1, cell: null, question: singleQ, responses: [] },
    { index: 1, roundIndex: 0, text: 'Перлина біля моря?', type: 'text', answered: 1, accepted: 1, cell: null, question: textQ, responses: [] },
  ],
};

/** Підставна сторінка входу: показує адресу, на яку людину повернуть після входу. */
function LoginStub() {
  return <p>{`сторінка входу ${useLocation().search}`}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
});
afterEach(cleanup);

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<GameHistory />} />
        <Route path="/login" element={<LoginStub />} />
      </Routes>
    </MemoryRouter>,
  );

describe('History', () => {
  it('lists the games with their date, status and size', async () => {
    vi.mocked(listGames).mockResolvedValue({ ok: true, data: [summary] });
    open('/history');
    const link = await screen.findByRole('link', { name: 'Географія' });
    expect(link.getAttribute('href')).toBe('/history/g1');
    expect(screen.getByText(/жовт.*завершено/)).toBeTruthy();
    expect(screen.getByText('Гравців: 2')).toBeTruthy();
    expect(screen.getByText('Запитань зіграно: 6 з 6')).toBeTruthy();
  });

  it('says in words that a game was interrupted or is still running', async () => {
    vi.mocked(listGames).mockResolvedValue({
      ok: true,
      data: [
        { ...summary, id: 'g2', status: 'aborted', questionsPlayed: 2 },
        { ...summary, id: 'g3', status: 'running', finishedAt: null, questionsPlayed: 1 },
      ],
    });
    open('/history');
    expect(await screen.findByText(/перервано/)).toBeTruthy();
    expect(screen.getByText(/триває/)).toBeTruthy();
    expect(screen.getByText('Запитань зіграно: 2 з 6')).toBeTruthy();
  });

  it('explains what will appear here when there are no games yet', async () => {
    vi.mocked(listGames).mockResolvedValue({ ok: true, data: [] });
    open('/history');
    expect(await screen.findByText(/Тут з’являться ігри, які ви провели/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Мої вікторини' }).getAttribute('href')).toBe('/quizzes');
  });

  it('sends a visitor to sign in and back to the history afterwards', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/history');
    expect(await screen.findByText('сторінка входу ?next=%2Fhistory')).toBeTruthy();
    expect(listGames).not.toHaveBeenCalled();
  });
});

describe('GameHistory', () => {
  it('shows the final table and how each question went', async () => {
    vi.mocked(getGame).mockResolvedValue({ ok: true, data: detail });
    open('/history/g1');
    expect(await screen.findByRole('heading', { name: 'Географія' })).toBeTruthy();
    expect(getGame).toHaveBeenCalledWith('g1');

    const rows = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(rows[0]).toContain('Олена');
    expect(rows[0]).toContain('2000');
    expect(rows[0]).toContain('правильних: 2');
    expect(rows.some((row) => row?.includes('Столиця України?') && row.includes('відповіли 2, правильно 1'))).toBe(true);
    expect(screen.getByRole('link', { name: 'Історія ігор' }).getAttribute('href')).toBe('/history');
    // Текст запитання й статистика стоять в окремих рядках: інакше на телефоні текст стискається.
    for (const list of screen.getAllByRole('list')) expect(list.className).toContain('stacked');
  });

  it('shows a game without places or players without looking broken', async () => {
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        status: 'aborted',
        questionsPlayed: 1,
        standings: [{ participantId: 'p1', nickname: 'Олена', score: 500, rank: null, correct: 1 }],
        questions: detail.questions.slice(0, 1),
      },
    });
    open('/history/g1');
    expect(await screen.findByText(/перервано/)).toBeTruthy();
    expect(screen.getByText('Запитань зіграно: 1 з 2')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    cleanup();

    vi.mocked(getGame).mockResolvedValue({ ok: true, data: { ...detail, standings: [], questions: [] } });
    open('/history/g1');
    expect(await screen.findByText('У цій грі не було гравців.')).toBeTruthy();
  });

  it('says so when the game does not exist or belongs to someone else', async () => {
    vi.mocked(getGame).mockResolvedValue({ ok: false, error: 'not_found' });
    open('/history/g9');
    expect((await screen.findByRole('alert')).textContent).toBe('Не знайдено.');
  });

  it('sends the host to sign in when the session has ended', async () => {
    vi.mocked(getGame).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/history/g1');
    expect(await screen.findByText('сторінка входу ?next=%2Fhistory%2Fg1')).toBeTruthy();
  });
});

describe('GameHistory: answers', () => {
  const answered: GameDetail = {
    ...detail,
    questions: [
      {
        index: 0,
        roundIndex: 0,
        text: matchQ.text,
        type: 'match',
        answered: 2,
        accepted: 1,
        cell: null,
        question: matchQ,
        responses: [
          { nickname: 'Олена', answer: { type: 'match', links: [{ left: 'a', right: 'x' }, { left: 'b', right: 'y' }, { left: 'c', right: 'z' }] }, accepted: true },
          { nickname: 'Тарас', answer: null, accepted: false },
        ],
      },
      {
        index: 1,
        roundIndex: 0,
        text: singleQ.text,
        type: 'single',
        answered: 1,
        accepted: 0,
        cell: null,
        question: singleQ,
        responses: [{ nickname: 'Віра', answer: { type: 'single', optionId: 'a' }, accepted: false }],
      },
    ],
  };

  it("shows each player's answer, a match answer as pairs and a missed attempt as a dash", async () => {
    vi.mocked(getGame).mockResolvedValue({ ok: true, data: answered });
    const { container } = open('/history/g1');
    const [matchBlock, singleBlock] = await screen.findAllByText(/^Відповіді \(\d\)$/);
    expect(matchBlock.textContent).toBe('Відповіді (2)');
    expect(singleBlock.textContent).toBe('Відповіді (1)');
    fireEvent.click(matchBlock);
    const details = container.querySelectorAll('details.responses');
    const rows = [...details[0].querySelectorAll('li.is-correct, li.is-wrong')];
    expect(rows[0].textContent).toContain('Олена');
    expect([...rows[0].querySelectorAll('li.match-row')].map((li) => li.textContent)).toEqual(['Київ — Дніпро', 'Львів — Полтва', 'Ужгород — Уж']);
    expect(rows[0].className).toContain('is-correct');
    expect(rows[1].textContent).toBe('Тарас—');
    expect(rows[1].className).toContain('is-wrong');
    expect(details[1].textContent).toContain('Віра');
    expect(details[1].textContent).toContain('Львів');
  });

  it('shows no answers block for a question nobody answered', async () => {
    vi.mocked(getGame).mockResolvedValue({ ok: true, data: detail });
    const { container } = open('/history/g1');
    expect(await screen.findByText('Столиця України?')).toBeTruthy();
    expect(container.querySelector('details.responses')).toBeNull();
  });
});

describe('GameHistory: rounds', () => {
  it('groups the questions under the round titles', async () => {
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        rounds: [
          { title: 'Розминка', type: 'classic' },
          { title: 'Бліц', type: 'classic' },
        ],
        questions: [
          { index: 0, roundIndex: 0, text: 'Столиця України?', type: 'single', answered: 2, accepted: 1, cell: null, question: singleQ, responses: [] },
          { index: 1, roundIndex: 1, text: 'Перлина біля моря?', type: 'text', answered: 1, accepted: 1, cell: null, question: textQ, responses: [] },
        ],
      },
    });
    open('/history/g1');
    expect(await screen.findByText('Розминка')).toBeTruthy();
    expect(screen.getByText('Бліц')).toBeTruthy();
    expect(screen.getByText('Перлина біля моря?')).toBeTruthy();
  });

  it('names untitled rounds «Раунд N» and numbers the questions inside each round', async () => {
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        rounds: [
          { title: '', type: 'classic' },
          { title: '', type: 'classic' },
        ],
        questions: [
          { index: 0, roundIndex: 0, text: 'Столиця України?', type: 'single', answered: 2, accepted: 1, cell: null, question: singleQ, responses: [] },
          { index: 1, roundIndex: 1, text: 'Перлина біля моря?', type: 'text', answered: 1, accepted: 1, cell: null, question: textQ, responses: [] },
        ],
      },
    });
    const { container } = open('/history/g1');
    expect(await screen.findByText('Раунд 1')).toBeTruthy();
    expect(screen.getByText('Раунд 2')).toBeTruthy();
    const numbers = [...container.querySelectorAll('.round-group .rank')].map((el) => el.textContent);
    expect(numbers).toEqual(['1', '1']);
  });

  it('looks as before for a game of a single round', async () => {
    vi.mocked(getGame).mockResolvedValue({ ok: true, data: detail });
    open('/history/g1');
    expect(await screen.findByText('Столиця України?')).toBeTruthy();
    expect(screen.queryByText('Раунд 1')).toBeNull();
  });

  it('shows a board question with its cell, chooser and points', async () => {
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        rounds: [{ title: 'Поле', type: 'board' }],
        questions: [
          { index: 0, roundIndex: 0, text: 'Столиця України?', type: 'single', answered: 1, accepted: 1, cell: { category: 'Міста', price: 100, multiplier: 2, chooser: 'Анна', points: 100 }, question: singleQ, responses: [] },
          { index: 1, roundIndex: 0, text: 'Перлина біля моря?', type: 'text', answered: 1, accepted: 0, cell: { category: 'Ріки', price: 200, multiplier: 1, chooser: null, points: null }, question: textQ, responses: [] },
        ],
      },
    });
    open('/history/g1');
    expect(await screen.findByText('Міста · 100')).toBeTruthy();
    expect(screen.getByText('×2')).toBeTruthy();
    expect(screen.getByText('Анна: +100')).toBeTruthy();
    expect(screen.getByText('Ріки · 200')).toBeTruthy();
    expect(screen.getByText('гравця вилучено')).toBeTruthy();
  });
});
