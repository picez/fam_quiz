// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostView, Question, RoundInfo } from '@quiz/shared';
import type { Send } from '../live/types';
import { HostScreen } from './HostScreen';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const options = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
];
const single: Question = { id: 'q1', type: 'single', text: 'Столиця України?', imageUrl: null, timeLimit: 20, points: 1000, options, correctId: 'b' };
const textQuestion: Question = { id: 'q2', type: 'text', text: 'Перлина біля моря?', imageUrl: null, timeLimit: 20, points: 1000, accepted: ['Одеса'] };
const publicOf = (q: Question) => ({ type: q.type, text: q.text, imageUrl: null, timeLimit: 20, points: 1000, choices: q.type === 'single' ? options : [] });

const players = [
  { id: 'p1', nickname: 'Олена', connected: true, score: 750, streak: 0 },
  { id: 'p2', nickname: 'Тарас', connected: false, score: 0, streak: 0 },
];

const view = (over: Partial<HostView> = {}): HostView => ({
  role: 'host',
  phase: 'lobby',
  paused: false,
  blitz: null,
  board: null,
  spotlight: null,
  round: null,
  questionIndex: -1,
  total: 2,
  question: null,
  endsAt: null,
  remainingMs: null,
  playerCount: 2,
  answeredCount: 0,
  players,
  correct: null,
  responses: [],
  standings: [],
  ...over,
});

const during = (phase: HostView['phase'], q: Question, over: Partial<HostView> = {}) =>
  view({ phase, questionIndex: 0, question: publicOf(q), correct: q, ...over });

function show(current: HostView, send: Send = vi.fn(async () => ({ ok: true as const }))) {
  render(
    <HostScreen
      view={current}
      code="123456"
      stageUrl="http://quiz.test/stage/123456#s"
      joinUrl="http://quiz.test/play/123456"
      send={send}
    />,
  );
  return send;
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('HostScreen', () => {
  it('shows the code, the players and their connection state in the lobby', () => {
    show(view());
    expect(screen.getByText('123 456')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText(/немає зв’язку/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href')).toBe('http://quiz.test/stage/123456#s');
  });

  it('starts the game, and cannot start without players', () => {
    const send = show(view());
    fireEvent.click(button('Почати гру'));
    expect(send).toHaveBeenCalledWith('host:start', undefined);
    cleanup();

    show(view({ players: [], playerCount: 0 }));
    expect(button('Почати гру').disabled).toBe(true);
  });

  it('offers exactly one main action for each phase', () => {
    const cases: [HostView, string, string][] = [
      [during('question', single), 'Закрити запитання', 'host:lock'],
      [during('locked', single), 'Показати відповідь', 'host:next'],
      [during('reveal', single), 'Далі', 'host:next'],
      [view({ phase: 'leaderboard', questionIndex: 0 }), 'Наступне запитання', 'host:next'],
    ];
    for (const [current, label, event] of cases) {
      const send = show(current);
      fireEvent.click(button(label));
      expect(send).toHaveBeenCalledWith(event, undefined);
      cleanup();
    }
  });

  it('shows the correct answer to the host while the question is open', () => {
    show(during('question', single));
    expect(screen.getByText('Правильна відповідь: B. Київ')).toBeTruthy();
  });

  it('pauses and resumes', () => {
    const send = show(during('question', single));
    fireEvent.click(button('Пауза'));
    expect(send).toHaveBeenCalledWith('host:pause', undefined);
    cleanup();

    const paused = show(during('question', single, { paused: true }));
    fireEvent.click(button('Продовжити'));
    expect(paused).toHaveBeenCalledWith('host:resume', undefined);
  });

  it('ends the game only after confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const send = show(during('question', single));
    fireEvent.click(button('Завершити гру'));
    expect(send).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(button('Завершити гру'));
    expect(send).toHaveBeenCalledWith('host:end', undefined);
  });

  it('lists responses with what each player answered', () => {
    show(
      during('reveal', single, {
        responses: [
          { playerId: 'p1', nickname: 'Олена', answer: { type: 'single', optionId: 'b' }, timeMs: 4000, accepted: true, grade: 'correct' as const, streakBonus: 0, points: 900, overridden: false },
        ],
      }),
    );
    const row = screen.getByText('Київ').closest('li');
    expect(row?.textContent).toContain('Олена');
    expect(row?.textContent).toContain('зараховано');
    expect(row?.textContent).toContain('900');
  });

  it('lets the host accept or reject text answers on reveal', () => {
    const responses = [
      { playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Адеса' }, timeMs: 4000, accepted: false, grade: 'wrong' as const, streakBonus: 0, points: 0, overridden: false },
      { playerId: 'p2', nickname: 'Тарас', answer: { type: 'text' as const, value: 'Одеса' }, timeMs: 5000, accepted: true, grade: 'correct' as const, streakBonus: 0, points: 875, overridden: false },
    ];
    const send = show(during('reveal', textQuestion, { responses }));
    fireEvent.click(button('Зарахувати'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'correct' });
    fireEvent.click(button('Відхилити'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p2', grade: 'wrong' });
  });

  it('does not offer manual grading for choice questions or before reveal', () => {
    const responses = [
      { playerId: 'p1', nickname: 'Олена', answer: { type: 'single' as const, optionId: 'a' }, timeMs: 4000, accepted: false, grade: 'wrong' as const, streakBonus: 0, points: 0, overridden: false },
    ];
    show(during('reveal', single, { responses }));
    expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
    cleanup();

    const textResponses = [{ ...responses[0], answer: { type: 'text' as const, value: 'Адеса' } }];
    show(during('question', textQuestion, { responses: textResponses }));
    expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
  });

  it('removes a player only after confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const send = show(view());
    fireEvent.click(screen.getAllByRole('button', { name: 'Вилучити' })[1]);
    expect(send).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith('Вилучити гравця «Тарас» із гри?');

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Вилучити' })[1]);
    expect(send).toHaveBeenCalledWith('host:kick', { playerId: 'p2' });
  });

  it('ignores a second tap while the first action is still on its way', () => {
    const send: Send = vi.fn(() => new Promise<never>(() => {}));
    show(during('locked', single), send);
    fireEvent.click(button('Показати відповідь'));
    fireEvent.click(button('Показати відповідь'));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('makes a pause obvious and offers to resume as the main action', () => {
    show(during('question', single, { paused: true }));
    expect(screen.getByRole('status').textContent).toBe('Пауза');
    expect(button('Продовжити').className).toContain('btn-primary');
    expect(screen.queryByRole('button', { name: 'Закрити запитання' })).toBeNull();
  });

  it('explains a refused action', async () => {
    const send: Send = vi.fn(async () => ({ ok: false as const, error: 'no_players' }));
    show(view(), send);
    fireEvent.click(button('Почати гру'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Потрібен хоча б один гравець.'));
  });

  it('shows the final standings and no game actions once finished', () => {
    const standings = [{ participantId: 'p1', nickname: 'Олена', score: 750, totalTimeMs: 1, rank: 1 }];
    show(view({ phase: 'finished', questionIndex: 1, standings }));
    expect(screen.getAllByText('Гру завершено').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Завершити гру' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Вилучити' })).toBeNull();
  });
});

describe('HostScreen: question image', () => {
  it('shows the image of the current question', () => {
    const imageUrl = '/uploads/0123456789abcdef0123456789abcdef.png';
    show(view({ phase: 'question', questionIndex: 0, question: { ...publicOf(single), imageUrl }, correct: single }));
    expect(document.querySelector('img.question-image')?.getAttribute('src')).toBe(imageUrl);
  });
});

describe('HostScreen: rounds', () => {
  const round = (over: Partial<RoundInfo> = {}): RoundInfo => ({ index: 0, total: 2, title: 'Розминка', type: 'classic', partial: false, ...over });

  it('shows the round intro with a «start round» main action', () => {
    const send = show(view({ phase: 'intro', round: round() }));
    expect(screen.getAllByText(/Раунд 1 з 2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Розминка/).length).toBeGreaterThan(0);
    fireEvent.click(button('Почати раунд'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
  });

  it('offers «next round» after the round results', () => {
    const send = show(view({ phase: 'round_end', round: round(), questionIndex: 1 }));
    fireEvent.click(button('Наступний раунд'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
  });

  it('numbers the question inside the round and names the round when there are several', () => {
    show(during('question', single, { round: round(), total: 5, questionIndex: 1 }));
    expect(screen.getByText(/Запитання 2 з 5/)).toBeTruthy();
    expect(screen.getByText(/Раунд 1/)).toBeTruthy();
    cleanup();
    show(during('question', single, { round: round({ total: 1 }), total: 5, questionIndex: 1 }));
    expect(screen.queryByText(/Раунд 1/)).toBeNull();
  });

  it('ends the round only after confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const send = show(during('question', single, { round: round() }));
    fireEvent.click(button('Завершити раунд'));
    expect(send).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(button('Завершити раунд'));
    expect(send).toHaveBeenCalledWith('host:end-round', undefined);
  });

  it('calls the end-round action «finish the game» in the last round', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const send = show(during('question', single, { round: round({ index: 1 }) }));
    expect(screen.queryByRole('button', { name: 'Завершити раунд' })).toBeNull();
    fireEvent.click(button('Завершити гру'));
    expect(send).toHaveBeenCalledWith('host:end-round', undefined);
  });

  it('does not offer to end the round in the lobby or at the round results', () => {
    show(view({ round: round() }));
    expect(screen.queryByRole('button', { name: 'Завершити раунд' })).toBeNull();
    cleanup();
    show(view({ phase: 'round_end', round: round() }));
    expect(screen.queryByRole('button', { name: 'Завершити раунд' })).toBeNull();
  });

  it('offers «partially» only when the round allows it', () => {
    const responses = [
      { playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Адеса' }, timeMs: 4000, accepted: false, grade: 'wrong' as const, streakBonus: 0, points: 0, overridden: false },
    ];
    show(during('reveal', textQuestion, { responses, round: round() }));
    expect(screen.queryByRole('button', { name: 'Частково' })).toBeNull();
    cleanup();

    const send = show(during('reveal', textQuestion, { responses, round: round({ partial: true }) }));
    fireEvent.click(button('Частково'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'partial' });
  });

  it('marks a streak of two or more next to the nickname and prints negative points with a minus', () => {
    const hot = [
      { id: 'p1', nickname: 'Олена', connected: true, score: -500, streak: 3 },
      { id: 'p2', nickname: 'Тарас', connected: true, score: 0, streak: 1 },
    ];
    show(view({ phase: 'leaderboard', round: round(), questionIndex: 0, players: hot }));
    expect(screen.getByText('🔥 3')).toBeTruthy();
    expect(screen.queryByText('🔥 1')).toBeNull();
    expect(screen.getByText('−500')).toBeTruthy();
  });
});

describe('HostScreen: blitz', () => {
  const round: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false };
  const blitz = (over: Partial<NonNullable<HostView['blitz']>> = {}): NonNullable<HostView['blitz']> => ({
    manual: true,
    winner: null,
    queue: [
      { playerId: 'p1', nickname: 'Олена', answer: { type: 'text', value: 'Одеса' }, deadline: null },
      { playerId: 'p2', nickname: 'Тарас', answer: null, deadline: null },
    ],
    attempts: [{ playerId: 'p2', nickname: 'Тарас', answer: null, grade: 'wrong', points: -1000 }],
    ...over,
  });

  it('judges the head of the queue in a manual blitz round', async () => {
    const send = show(during('question', textQuestion, { round, blitz: blitz() }));
    expect(screen.getByText('пише…')).toBeTruthy();
    expect(screen.getByText('не встиг')).toBeTruthy();
    expect(screen.getByText(/у черзі: 2/)).toBeTruthy();
    fireEvent.click(button('Правильно'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p1', correct: true }));
    fireEvent.click(button('Неправильно'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p1', correct: false }));
  });

  it('has no judge buttons in an automatic blitz round', () => {
    show(during('question', textQuestion, { round, blitz: blitz({ manual: false }) }));
    expect(screen.queryByRole('button', { name: 'Правильно' })).toBeNull();
  });

  it('does not offer grade changes after a blitz reveal', () => {
    show(
      during('reveal', textQuestion, {
        round,
        blitz: blitz({ queue: [] }),
        responses: [
          { playerId: 'p2', nickname: 'Тарас', answer: { type: 'text', value: 'Київ' }, timeMs: 1, accepted: false, grade: 'wrong', streakBonus: 0, points: -1000, overridden: false },
        ],
      }),
    );
    expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
  });

  it('hides the queue once the question is closed', () => {
    show(during('reveal', textQuestion, { round, blitz: blitz({ queue: [] }) }));
    expect(screen.queryByText('Черга')).toBeNull();
    expect(screen.queryByText('Ще ніхто не відповів')).toBeNull();
    expect(screen.getByText('не встиг')).toBeTruthy();
  });

  describe('board round', () => {
    const boardRound: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: true };
    const three = [
      { id: 'p1', nickname: 'Олена', connected: true, score: 0, streak: 0 },
      { id: 'p2', nickname: 'Тарас', connected: true, score: 0, streak: 0 },
      { id: 'p3', nickname: 'Іра', connected: true, score: 0, streak: 0 },
    ];
    const boardOf = (over: Partial<NonNullable<HostView['board']>> = {}): NonNullable<HostView['board']> => ({
      categories: [
        {
          id: 'k1',
          title: 'Міста',
          cells: [
            { id: 'c1', price: 100, played: false, mark: 'x2' },
            { id: 'c2', price: 200, played: true, mark: null },
          ],
        },
      ],
      order: three.map((p) => ({ playerId: p.id, nickname: p.nickname })),
      turn: { playerId: 'p1', nickname: 'Олена' },
      cell: null,
      answerMode: 'phone',
      rolls: 0,
      skipAt: null,
      manual: false,
      answer: null,
      ...over,
    });
    const onBoard = (over: Partial<HostView> = {}, board = boardOf()) =>
      view({ phase: 'board', round: boardRound, players: three, playerCount: 3, board, ...over });

    it('sets the board order with arrows, dice and join order', async () => {
      const order = [three[2], three[0], three[1]].map((p) => ({ playerId: p.id, nickname: p.nickname }));
      const send = show(view({ phase: 'intro', round: boardRound, players: three, playerCount: 3, board: boardOf({ turn: null, order }) }));
      expect(screen.getByText('Порядок ходів')).toBeTruthy();
      // порядок у панелі береться з board.order: Іра, Олена, Тарас
      fireEvent.click(button('Опустити Іра'));
      expect(send).toHaveBeenCalledWith('host:order', { playerIds: ['p1', 'p3', 'p2'] });
      // кнопки розблоковуються, коли відповідь на попередню дію прийшла
      await waitFor(() => expect((button('Кинути кубик') as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(button('Кинути кубик'));
      expect(send).toHaveBeenCalledWith('host:roll', undefined);
      await waitFor(() => expect((button('За порядком приєднання') as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(button('За порядком приєднання'));
      expect(send).toHaveBeenCalledWith('host:order', { playerIds: ['p1', 'p2', 'p3'] });
    });

    it('picks a cell for the chooser and skips a turn', async () => {
      const send = show(onBoard());
      expect(screen.getByText('Вибирає Олена')).toBeTruthy();
      fireEvent.click(button('Міста, 100'));
      expect(send).toHaveBeenCalledWith('host:pick', { cellId: 'c1' });
      fireEvent.click(button('Пропустити хід'));
      expect(send).toHaveBeenCalledWith('host:skip', undefined);
    });

    it('shows the countdown for an absent chooser and a waiting turn on pause', () => {
      const away = three.map((p) => (p.id === 'p1' ? { ...p, connected: false } : p));
      show(onBoard({ players: away }, boardOf({ skipAt: Date.now() + 20_000 })));
      expect(screen.getByText(/Олена відключений, хід пропуститься через 20 с/)).toBeTruthy();
      cleanup();
      show(onBoard({ players: away, paused: true }, boardOf({ skipAt: null })));
      expect(screen.getByText('Олена відключений, гра на паузі, хід чекає')).toBeTruthy();
    });

    it('grades a voice answer during the question', async () => {
      const send = show(
        during('question', single, {
          round: boardRound,
          players: three,
          board: boardOf({ answerMode: 'voice', manual: true, cell: { id: 'c1', category: 'Міста', price: 100, mark: 'x2' } }),
        }),
      );
      expect(screen.getByText('Відповідає Олена')).toBeTruthy();
      expect(screen.getByText('×2')).toBeTruthy();
      expect(screen.queryByText(/відповіли/)).toBeNull();
      fireEvent.click(button('Зарахувати'));
      expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'correct' });
      expect(button('Частково')).toBeTruthy();
    });

    it('shows a phone answer awaiting a grade and hides grading without one', () => {
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'x2' as const };
      show(during('question', textQuestion, { round: boardRound, players: three, board: boardOf({ manual: true, cell, answer: { type: 'text', value: 'Одеса' } }) }));
      expect(screen.getByText('Одеса')).toBeTruthy();
      expect(button('Не зараховувати')).toBeTruthy();
      cleanup();
      show(during('question', textQuestion, { round: boardRound, players: three, board: boardOf({ manual: true, cell }) }));
      expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
    });

    it('renders no multiplier for unmarked cells, on the board and on the open cell', () => {
      const unmarked = boardOf().categories[0].cells.map((cell) => ({ ...cell, mark: 'none' as const }));
      show(onBoard({}, boardOf({ categories: [{ id: 'k1', title: 'Міста', cells: unmarked }] })));
      expect(document.body.textContent).not.toContain('×');
      cleanup();
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const };
      show(during('question', single, { round: boardRound, players: three, board: boardOf({ cell }) }));
      expect(screen.getByText('Відповідає Олена')).toBeTruthy();
      expect(document.body.textContent).not.toContain('×');
    });

    it('does not show a stale question number in the board phase', () => {
      show(onBoard({ questionIndex: 0 }));
      expect(document.body.textContent).not.toMatch(/Запитання \d/);
    });

    it('disables the order buttons while an order send is pending', async () => {
      let done: () => void = () => {};
      const send: Send = vi.fn(() => new Promise<{ ok: true }>((resolve) => (done = () => resolve({ ok: true }))));
      const order = three.map((p) => ({ playerId: p.id, nickname: p.nickname }));
      show(view({ phase: 'intro', round: boardRound, players: three, playerCount: 3, board: boardOf({ turn: null, order }) }), send);
      fireEvent.click(button('Опустити Олена'));
      expect((button('Опустити Тарас') as HTMLButtonElement).disabled).toBe(true);
      expect((button('За порядком приєднання') as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(button('Опустити Тарас'));
      expect(send).toHaveBeenCalledTimes(1);
      done();
      await waitFor(() => expect((button('За порядком приєднання') as HTMLButtonElement).disabled).toBe(false));
    });
  });
});
