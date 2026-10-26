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
  teams: false,
};

const base = { imageUrl: null, video: null, timeLimit: 20, points: 1000 };
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
    { participantId: 'p1', nickname: 'Олена', score: 2000, rank: 1, correct: 2, rounds: [], breakdown: { parts: [], plus: 0, minus: 0 } },
    { participantId: 'p2', nickname: 'Тарас', score: 0, rank: 2, correct: 0, rounds: [], breakdown: { parts: [], plus: 0, minus: 0 } },
  ],
  questions: [
    { index: 0, roundIndex: 0, text: 'Столиця України?', type: 'single', answered: 2, accepted: 1, cell: null, question: singleQ, responses: [], final: null },
    { index: 1, roundIndex: 0, text: 'Перлина біля моря?', type: 'text', answered: 1, accepted: 1, cell: null, question: textQ, responses: [], final: null },
  ],  adjustments: [],
  teams: false,
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
    expect(screen.queryByText('Командна гра')).toBeNull();
  });

  it('marks a team game in the list', async () => {
    vi.mocked(listGames).mockResolvedValue({ ok: true, data: [{ ...summary, teams: true, playerCount: 4 }] });
    open('/history');
    await screen.findByRole('link', { name: 'Географія' });
    expect(screen.getByText('Командна гра')).toBeTruthy();
    expect(screen.getByText('Гравців: 4')).toBeTruthy();
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
  });

  it('switches between hosted and played games', () => {
    vi.mocked(listGames).mockResolvedValue({ ok: true, data: [] });
    open('/history');
    const hosted = screen.getByRole('link', { name: 'Проведені' });
    expect(hosted.getAttribute('href')).toBe('/history');
    expect(hosted.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Зіграні' }).getAttribute('href')).toBe('/me');
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

  it('a team game is marked and every team shows its line-up', async () => {
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        teams: true,
        standings: [
          { participantId: 't1', nickname: 'Червоні', score: 2000, rank: 1, correct: 2, rounds: [], breakdown: { parts: [], plus: 0, minus: 0 }, members: ['Оля', 'Петро'] },
          { participantId: 't2', nickname: 'Сині', score: 0, rank: 2, correct: 0, rounds: [], breakdown: { parts: [], plus: 0, minus: 0 }, members: [] },
        ],
      },
    });
    open('/history/g1');
    expect(await screen.findByText('Командна гра')).toBeTruthy();
    expect(screen.getByText('Склад: Оля, Петро')).toBeTruthy();
    expect(screen.getAllByText(/^Склад:/)).toHaveLength(1);
  });

  describe('points per round (11f)', () => {
    const scored: GameDetail = {
      ...detail,
      rounds: [
        { title: 'Розминка', type: 'classic' },
        { title: 'Ривок', type: 'classic' },
        { title: 'Фінал', type: 'final' },
      ],
      standings: [
        {
          participantId: 'p1',
          nickname: 'Оля',
          score: 250,
          rank: 1,
          correct: 2,
          rounds: [550, -100, -200],
          breakdown: {
            parts: [
              { source: 'answers', plus: 1000, minus: -500 },
              { source: 'final', plus: 0, minus: -200 },
              { source: 'host', plus: 50, minus: 0 },
            ],
            plus: 1050,
            minus: -700,
          },
        },
        { participantId: 'p2', nickname: 'Тарас', score: 0, rank: 2, correct: 0, rounds: [0, 0, 0], breakdown: { parts: [], plus: 0, minus: 0 } },
      ],
    };

    it('shows the participant × round table and opens a row plus / minus', async () => {
      vi.mocked(getGame).mockResolvedValue({ ok: true, data: scored });
      open('/history/g1');
      await screen.findByRole('heading', { name: 'Географія' });
      const section = document.querySelector('section.history-scores')!;
      expect(section.querySelector('h2')!.textContent).toBe('Бали за раундами');
      expect(Array.from(section.querySelectorAll('th.round')).map((th) => th.textContent)).toEqual(['Р1', 'Р2', 'Р3']);
      expect(section.querySelector('th.round')!.getAttribute('title')).toBe('Розминка');
      fireEvent.click(screen.getByRole('button', { name: '«+ / −» для Оля' }));
      const text = section.querySelector('.score-breakdown')!.textContent!;
      expect(text).toContain('Відповіді +1000');
      expect(text).toContain('Помилки −500');
      expect(text).toContain('Фінал −200');
    });

    it('has no table when no round has points', async () => {
      vi.mocked(getGame).mockResolvedValue({ ok: true, data: detail });
      open('/history/g1');
      await screen.findByRole('heading', { name: 'Географія' });
      expect(document.querySelector('section.history-scores')).toBeNull();
    });

    it('a team game shows the line-up under the name in the table', async () => {
      vi.mocked(getGame).mockResolvedValue({
        ok: true,
        data: { ...scored, teams: true, standings: [{ ...scored.standings[0], nickname: 'Червоні', members: ['Оля', 'Петро'] }] },
      });
      open('/history/g1');
      await screen.findByRole('heading', { name: 'Географія' });
      expect(document.querySelector('section.history-scores .standing-members')!.textContent).toBe('Оля, Петро');
    });
  });

  it('a solo game has no team mark and no line-ups', async () => {
    vi.mocked(getGame).mockResolvedValue({ ok: true, data: detail });
    open('/history/g1');
    await screen.findByRole('heading', { name: 'Географія' });
    expect(screen.queryByText('Командна гра')).toBeNull();
    expect(screen.queryByText(/^Склад:/)).toBeNull();
  });

  it('shows a game without places or players without looking broken', async () => {
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        status: 'aborted',
        questionsPlayed: 1,
        standings: [{ participantId: 'p1', nickname: 'Олена', score: 500, rank: null, correct: 1, rounds: [], breakdown: { parts: [], plus: 0, minus: 0 } }],
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
          { nickname: 'Олена', answer: { type: 'match', links: [{ left: 'a', right: 'x' }, { left: 'b', right: 'y' }, { left: 'c', right: 'z' }] }, accepted: true, buff: null, spare: null },
          { nickname: 'Тарас', answer: null, accepted: false, buff: null, spare: null },
        ],
        final: null,
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
        responses: [{ nickname: 'Віра', answer: { type: 'single', optionId: 'a' }, accepted: false, buff: null, spare: null }],
        final: null,
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

  it('history answers show the buff they were given with', async () => {
    const buffed: GameDetail = {
      ...answered,
      questions: [
        {
          ...answered.questions[1],
          answered: 2,
          responses: [
            { nickname: 'Віра', answer: { type: 'single', optionId: 'b' }, accepted: true, buff: 'double', spare: null },
            { nickname: 'Тарас', answer: { type: 'single', optionId: 'a' }, accepted: false, buff: null, spare: null },
          ],
        },
      ],
    };
    vi.mocked(getGame).mockResolvedValue({ ok: true, data: buffed });
    const { container } = open('/history/g1');
    fireEvent.click(await screen.findByText('Відповіді (2)'));
    const rows = [...container.querySelectorAll('details.responses li')];
    const tag = rows[0].querySelector('.buff-tag');
    expect(tag?.textContent).toBe('×2');
    expect(tag?.getAttribute('aria-label')).toBe('Баф: Подвійні бали');
    expect(tag?.getAttribute('title')).toBe('Подвійні бали');
    // Значок стоїть поруч з ім'ям в одному рядку, а відповідь — під ними.
    expect(tag?.parentElement?.className).toBe('responses-who');
    expect(tag?.previousElementSibling?.className).toBe('responses-name');
    expect(tag?.parentElement?.nextElementSibling?.className).toBe('responses-answer');
    expect(rows[1].querySelector('.buff-tag')).toBeNull();
  });

  it('history shows the spare text and reads the answer against it', async () => {
    const spare: Question = { id: 's1', type: 'boolean', text: 'Чорне море солоніше за Азовське?', imageUrl: null, video: null, timeLimit: 20, points: 1000, correct: true };
    const swapped: GameDetail = {
      ...answered,
      questions: [
        {
          ...answered.questions[1],
          answered: 2,
          responses: [
            { nickname: 'Оля', answer: { type: 'boolean', value: true }, accepted: true, buff: 'swap', spare },
            { nickname: 'Тарас', answer: { type: 'single', optionId: 'a' }, accepted: false, buff: null, spare: null },
          ],
        },
      ],
    };
    vi.mocked(getGame).mockResolvedValue({ ok: true, data: swapped });
    const { container } = open('/history/g1');
    fireEvent.click(await screen.findByText('Відповіді (2)'));
    const rows = [...container.querySelectorAll('details.responses li')];
    const mark = rows[0].querySelector('.spare-tag');
    expect(mark?.textContent).toBe('запасне');
    expect(mark?.getAttribute('title')).toBe('Чорне море солоніше за Азовське?');
    expect(rows[0].querySelector('.spare-text')?.textContent).toBe('Запасне: Чорне море солоніше за Азовське?');
    expect(rows[0].querySelector('.responses-answer')?.textContent).toBe('Так');
    expect(rows[1].querySelector('.spare-tag')).toBeNull();
    expect(rows[1].querySelector('.spare-text')).toBeNull();
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
          { index: 0, roundIndex: 0, text: 'Столиця України?', type: 'single', answered: 2, accepted: 1, cell: null, question: singleQ, responses: [], final: null },
          { index: 1, roundIndex: 1, text: 'Перлина біля моря?', type: 'text', answered: 1, accepted: 1, cell: null, question: textQ, responses: [], final: null },
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
          { index: 0, roundIndex: 0, text: 'Столиця України?', type: 'single', answered: 2, accepted: 1, cell: null, question: singleQ, responses: [], final: null },
          { index: 1, roundIndex: 1, text: 'Перлина біля моря?', type: 'text', answered: 1, accepted: 1, cell: null, question: textQ, responses: [], final: null },
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
          { index: 0, roundIndex: 0, text: 'Столиця України?', type: 'single', answered: 1, accepted: 1, cell: { category: 'Міста', price: 100, multiplier: 2, chooser: 'Анна', points: 100, kind: 'normal', scores: [] }, question: singleQ, responses: [], final: null },
          { index: 1, roundIndex: 0, text: 'Перлина біля моря?', type: 'text', answered: 1, accepted: 0, cell: { category: 'Ріки', price: 200, multiplier: 1, chooser: null, points: null, kind: 'normal', scores: [] }, question: textQ, responses: [], final: null },
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

  it('shows a blitz cell with everyone’s points', async () => {
    const scores = [
      { nickname: 'Богдан', points: 200 },
      { nickname: 'Анна', points: -200 },
      { nickname: 'Віра', points: -200 },
    ];
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        rounds: [{ title: 'Поле', type: 'board' }],
        questions: [
          { index: 0, roundIndex: 0, text: 'Столиця України?', type: 'single', answered: 2, accepted: 1, cell: { category: 'Міста', price: 100, multiplier: 2, chooser: 'Анна', points: -200, kind: 'blitz', scores }, question: singleQ, responses: [], final: null },
        ],
      },
    });
    open('/history/g1');
    expect(await screen.findByText('Бліц')).toBeTruthy();
    expect(screen.getByText('Богдан: +200, Анна: −200, Віра: −200')).toBeTruthy();
    expect(screen.queryByText('Анна: −200')).toBeNull();
  });
});

describe('GameHistory: adjustments', () => {
  it('the game history shows host adjustments under their round, also in a round without questions', async () => {
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        rounds: [
          { title: 'Розминка', type: 'classic' },
          { title: 'Поле', type: 'board' },
        ],
        adjustments: [
          { seq: 1, roundIndex: 0, afterQuestion: 0, nickname: 'Оля', points: -100, source: 'host' },
          { seq: 2, roundIndex: 0, afterQuestion: 2, nickname: 'Петро', points: 75, source: 'host' },
          { seq: 3, roundIndex: 1, afterQuestion: 2, nickname: 'Оля', points: 50, source: 'host' },
        ],
      },
    });
    const { container } = open('/history/g1');
    expect(await screen.findByText('Бали від ведучого: Оля −100, Петро +75')).toBeTruthy();
    const groups = [...container.querySelectorAll('.round-group')];
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelector('.history-adjustments')?.textContent).toBe('Бали від ведучого: Оля −100, Петро +75');
    expect(groups[1].querySelector('.round-title')?.textContent).toBe('Поле');
    expect(groups[1].querySelector('.history-adjustments')?.textContent).toBe('Бали від ведучого: Оля +50');
    expect(groups[1].querySelector('ol')).toBeNull();
  });

  it('shows no adjustments line in a game without them', async () => {
    vi.mocked(getGame).mockResolvedValue({ ok: true, data: detail });
    const { container } = open('/history/g1');
    expect(await screen.findByText('Столиця України?')).toBeTruthy();
    expect(container.querySelector('.history-adjustments')).toBeNull();
  });
});

describe('GameHistory: duels', () => {
  it('duel transfers show as duel lines, host points stay separate', async () => {
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        adjustments: [
          { seq: 1, roundIndex: 0, afterQuestion: 2, nickname: 'Оля', points: 100, source: 'host' },
          { seq: 2, roundIndex: 0, afterQuestion: 2, nickname: 'Іра', points: 300, source: 'duel' },
          { seq: 3, roundIndex: 0, afterQuestion: 2, nickname: 'Оля', points: -300, source: 'duel' },
          { seq: 5, roundIndex: 0, afterQuestion: 2, nickname: 'Петро', points: 200, source: 'duel' },
        ],
      },
    });
    const { container } = open('/history/g1');
    expect(await screen.findByText('Бали від ведучого: Оля +100')).toBeTruthy();
    const lines = [...container.querySelectorAll('p.meta.history-duel')].map((line) => line.textContent);
    expect(lines).toEqual(['Дуель: Іра +300, Оля −300', 'Дуель: Петро +200']);
  });
});

describe('GameHistory final', () => {
  it('shows final wagers and results', async () => {
    const finalQuestion = {
      ...detail.questions[0],
      final: {
        mode: 'classic' as const,
        entries: [
          { nickname: 'Анна', answer: null, wager: 300, points: 300, accepted: true },
          { nickname: 'Богдан', answer: null, wager: 200, points: -200, accepted: false },
        ],
      },
    };
    vi.mocked(getGame).mockResolvedValue({ ok: true, data: { ...detail, rounds: [{ title: 'Космос', type: 'final' }], questions: [finalQuestion] } });
    open('/history/g1');
    expect(await screen.findByText('Ставки фіналу')).toBeTruthy();
    const win = screen.getByText('Анна: ставка 300, +300');
    const loss = screen.getByText('Богдан: ставка 200, −200');
    expect(win.className).toContain('is-correct');
    expect(loss.className).toContain('is-wrong');
  });

  it('a bank final is titled as a shared bank and shows the stored wager', async () => {
    const finalQuestion = {
      ...detail.questions[0],
      final: {
        mode: 'bank' as const,
        entries: [
          { nickname: 'Богдан', answer: null, wager: 400, points: 667, accepted: true },
          { nickname: 'Анна', answer: null, wager: 1000, points: -1000, accepted: false },
        ],
      },
    };
    vi.mocked(getGame).mockResolvedValue({ ok: true, data: { ...detail, rounds: [{ title: 'Космос', type: 'final' }], questions: [finalQuestion] } });
    open('/history/g1');
    expect(await screen.findByText('Ставки фіналу · спільний банк')).toBeTruthy();
    expect(screen.queryByText('Ставки фіналу')).toBeNull();
    expect(screen.getByText('Богдан: ставка 400, +667').className).toContain('is-correct');
    expect(screen.getByText('Анна: ставка 1000, −1000').className).toContain('is-wrong');
  });
});

describe('GameHistory sort', () => {
  it('a sort question in the history', async () => {
    const sortQ: Question = {
      ...base,
      id: 'q5',
      type: 'sort',
      text: 'Розкладіть',
      lockSeconds: 3,
      categories: [
        { id: 'c1', text: 'Овочі' },
        { id: 'c2', text: 'Фрукти' },
      ],
      words: [
        { id: 'w1', text: 'Морква', categoryId: 'c1' },
        { id: 'w2', text: 'Яблуко', categoryId: 'c2' },
        { id: 'w3', text: 'Буряк', categoryId: 'c1' },
        { id: 'w4', text: 'Груша', categoryId: 'c2' },
      ],
    };
    const sorted = (nickname: string, n: number, timeMs: number | null, misses: number) => ({
      nickname,
      answer: { type: 'sort' as const, sorted: n, total: 4, misses, timeMs },
      buff: null,
      spare: null,
      accepted: n === 4,
    });
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        questions: [
          { index: 0, roundIndex: 0, text: 'Розкладіть', type: 'sort', answered: 2, accepted: 1, cell: null, question: sortQ, responses: [sorted('Олена', 4, 8000, 1), sorted('Тарас', 3, null, 0)], final: null },
        ],
      },
    } as never);
    open('/history/g1');
    expect(await screen.findByText('Відсортовано 4 з 4 за 8,0 с, помилок: 1')).toBeTruthy();
    expect(screen.getByText('Відсортовано 3 з 4, помилок: 0')).toBeTruthy();
    expect(screen.getByText('Правильна відповідь: Овочі: Морква, Буряк; Фрукти: Яблуко, Груша')).toBeTruthy();
  });
});

describe('GameHistory pin (10c)', () => {
  it('shows the map with the target, the circles, every answer as a named mark (nearest highlighted) and the distance of each answer', async () => {
    const pinQ: Question = { ...base, id: 'q6', type: 'pin', text: 'Де Львів?', map: 'ukraine', aspect: 16 / 11, target: { x: 0.1, y: 0.4 }, fullRadius: 3, zeroRadius: 15 };
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        questions: [
          {
            index: 0, roundIndex: 0, text: 'Де Львів?', type: 'pin', answered: 1, accepted: 1, cell: null, question: pinQ,
            responses: [
              { nickname: 'Богдан', answer: { type: 'pin', x: 0.3, y: 0.5 }, buff: null, spare: null, accepted: false },
              { nickname: 'Олена', answer: { type: 'pin', x: 0.12, y: 0.4 }, buff: null, spare: null, accepted: true },
            ],
            final: null,
          },
        ],
      },
    } as never);
    open('/history/g1');
    expect(await screen.findByText('Точка за 2,0 % від правильної')).toBeTruthy();
    expect(document.querySelector('.history-pin .pin-target')).not.toBeNull();
    expect(document.querySelectorAll('.history-pin svg.pin-layer circle')).toHaveLength(2);
    const marks = [...document.querySelectorAll('.history-pin .pin-mark')];
    expect(marks.map((mark) => mark.getAttribute('aria-label'))).toEqual(['Богдан', 'Олена']);
    expect(document.querySelector('.history-pin .pin-mark.is-best')?.getAttribute('aria-label')).toBe('Олена');
    expect(document.querySelector('.history-pin .pin-mark.is-best .pin-label')?.textContent).toBe('Олена');
  });
});

describe('GameHistory wall, poll and word cloud (10d)', () => {
  it('shows the wall groups, the poll bars, the cloud words with counts and votes without a correct count', async () => {
    const wallQ: Question = {
      ...base,
      id: 'w1',
      type: 'wall',
      text: 'Знайдіть групи',
      mistakes: 3,
      groups: ['Річки', 'Міста', 'Гори'].map((name, g) => ({ id: `g${g}`, name, tiles: [0, 1, 2].map((n) => ({ id: `t${g}${n}`, text: `${name}${n}` })) })),
    };
    const options = [
      { id: 'a', text: 'Весна' },
      { id: 'b', text: 'Літо' },
    ];
    const pollQ: Question = { ...base, id: 'p1', type: 'poll', text: 'Яка пора?', points: 0, options };
    const cloudQ: Question = { ...base, id: 'c1', type: 'wordcloud', text: 'Київ — це?', points: 0, words: 3 };
    const vote = (nickname: string, answer: unknown) => ({ nickname, answer, accepted: false, buff: null, spare: null });
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        questions: [
          { index: 0, roundIndex: 0, text: wallQ.text, type: 'wall', answered: 1, accepted: 1, cell: null, question: wallQ, responses: [], final: null },
          {
            index: 1, roundIndex: 0, text: pollQ.text, type: 'poll', answered: 2, accepted: 0, cell: null, question: pollQ,
            responses: [vote('Олена', { type: 'poll', optionId: 'b' }), vote('Тарас', { type: 'poll', optionId: 'b' })],
            final: null,
          },
          {
            index: 2, roundIndex: 0, text: cloudQ.text, type: 'wordcloud', answered: 2, accepted: 0, cell: null, question: cloudQ,
            responses: [vote('Олена', { type: 'wordcloud', words: ['Каштани', 'Дніпро'] }), vote('Тарас', { type: 'wordcloud', words: ['каштани'] })],
            final: null,
          },
        ],
      },
    } as never);
    open('/history/g1');
    expect(await screen.findByText('Річки')).toBeTruthy();
    expect(screen.getByText('Гори')).toBeTruthy();
    expect(screen.getAllByText('Проголосували: 2')).toHaveLength(2);
    expect(screen.getByText('100 % · 2')).toBeTruthy();
    expect(screen.getByText('0 % · 0')).toBeTruthy();
    expect(screen.getByText('Каштани · 2')).toBeTruthy();
    expect(screen.getByText('Дніпро · 1')).toBeTruthy();
    expect(screen.getAllByText(/правильно/)).toHaveLength(1);
  });

  it('words the host hid show as приховано in the cloud list and in the answers, and the most frequent spelling is used', async () => {
    const cloudQ: Question = { ...base, id: 'c1', type: 'wordcloud', text: 'Київ — це?', points: 0, words: 3 };
    const vote = (nickname: string, words: string[]) => ({ nickname, answer: { type: 'wordcloud', words }, accepted: false, buff: null, spare: null });
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        questions: [
          {
            index: 0, roundIndex: 0, text: cloudQ.text, type: 'wordcloud', answered: 3, accepted: 0, cell: null, question: cloudQ, cloudHidden: ['лайка'],
            responses: [vote('Олена', ['Каштани', 'Лайка']), vote('Тарас', ['каштани']), vote('Віра', ['каштани', 'ЛАЙКА'])],
            final: null,
          },
        ],
      },
    } as never);
    open('/history/g1');
    expect(await screen.findByText('каштани · 3')).toBeTruthy();
    expect(screen.getByText('приховано · 2')).toBeTruthy();
    expect(screen.queryByText(/лайка/i)).toBeNull();
    expect(screen.getAllByText('каштани, приховано').length + screen.getAllByText('Каштани, приховано').length).toBeGreaterThan(0);
  });
});

describe('GameHistory survey (10e)', () => {
  it('shows the board with names, the cloud caption and the answers with hit marks', async () => {
    const rows = [
      { id: 'r1', text: 'Яблуко', popularity: 32, accepted: ['яблучко'] },
      { id: 'r2', text: 'Банан', popularity: 25, accepted: [] },
    ];
    const hostQ = { ...base, id: 's1', type: 'survey', text: 'Назвіть фрукт', answers: 3, rows } as unknown as Question;
    const cloudQ = { ...base, id: 's2', type: 'survey', text: 'Що ви назвали?', answers: 3, cloudId: 'c1', rows } as unknown as Question;
    const vote = (nickname: string, values: string[], hits: (string | null)[]) => ({ nickname, answer: { type: 'survey', values, rows: hits }, accepted: true, buff: null, spare: null });
    const spare = { nickname: 'Запасний', answer: { type: 'survey', values: ['Банан'], rows: ['r2'] }, accepted: true, buff: null, spare: { text: 'Інше', type: 'text' } };
    const responses = [spare, vote('Олена', ['яблучко', 'ананас'], ['r1', null]), vote('Тарас', ['Банан'], ['r2'])];
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        questions: [
          { index: 0, roundIndex: 0, text: hostQ.text, type: 'survey', answered: 2, accepted: 2, cell: null, question: hostQ, responses, final: null },
          { index: 1, roundIndex: 0, text: cloudQ.text, type: 'survey', answered: 2, accepted: 2, cell: null, question: cloudQ, responses, final: null, surveyFromCloud: true },
        ],
      },
    } as never);
    open('/history/g1');
    expect(await screen.findAllByText('Яблуко')).toHaveLength(2);
    expect(screen.getAllByText('Олена').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Дошка з хмари слів')).toHaveLength(1);
    expect(screen.getAllByText('яблучко ✓, ананас ✗')).toHaveLength(2);
    for (const board of document.querySelectorAll('.history-survey')) expect(board.textContent).not.toContain('Запасний');
  });
});

describe('GameHistory bluff (10f)', () => {
  it('shows the bluff board with kinds, authors, buyers and the removed lie, and the answers', async () => {
    const bluffQ = { ...base, id: 'b1', type: 'bluff', text: 'Ейфелеву вежу хотіли поставити в …', accepted: ['Барселона'], lies: ['Мілан', 'Лісабон'], choiceTime: 30 } as unknown as Question;
    const answer = { type: 'bluff', lie: 'Рим', pick: 'Мілан', fooled: 1 };
    const responses = [{ nickname: 'Віра', answer, accepted: false, buff: null, spare: null }];
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        questions: [
          {
            index: 0,
            roundIndex: 0,
            text: bluffQ.text,
            type: 'bluff',
            answered: 1,
            accepted: 0,
            cell: null,
            question: bluffQ,
            responses,
            final: null,
            bluff: {
              options: [
                { text: 'Мілан', kind: 'spare', authors: [], pickedBy: ['Віра'], removed: false },
                { text: 'Рим', kind: 'lie', authors: ['Оля', 'Петро'], pickedBy: ['Віра'], removed: false },
                { text: 'Барселона', kind: 'truth', authors: [], pickedBy: [], removed: false },
                { text: 'Дурня', kind: 'lie', authors: ['Іван'], pickedBy: [], removed: true },
              ],
            },
          },
        ],
      },
    } as never);
    open('/history/g1');
    expect(await screen.findByText('Вигадка: Оля, Петро')).toBeTruthy();
    expect(screen.getByText('Правда')).toBeTruthy();
    expect(screen.getAllByText('Купилися: Віра').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Прибрано')).toBeTruthy();
    expect(screen.getByText('вигадка «Рим» · вибір «Мілан» ✗ · купилися: 1')).toBeTruthy();
  });
});
