// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyBrief, type HostView, Question, RoundInfo } from '@quiz/shared';
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
const single: Question = { id: 'q1', type: 'single', text: 'Столиця України?', imageUrl: null, video: null, timeLimit: 20, points: 1000, options, correctId: 'b' };
const textQuestion: Question = { id: 'q2', type: 'text', text: 'Перлина біля моря?', imageUrl: null, video: null, timeLimit: 20, points: 1000, accepted: ['Одеса'] };
const publicOf = (q: Question) => ({ type: q.type, text: q.text, imageUrl: null, video: null, timeLimit: 20, points: 1000, choices: q.type === 'single' ? options : [], right: [], chain: null, orderLabels: null });

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
  final: null,
  chain: null,
  round: null,
  questionIndex: -1,
  total: 2,
  question: null,
  endsAt: null,
  remainingMs: null,
  playerCount: 2,
  answeredCount: 0,
  limitMs: null,
  held: false,
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
  it('a video question has the player, the close button and no ±15 s', () => {
    const untimed = { ...publicOf(single), video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null };
    show(view({ phase: 'question', questionIndex: 0, question: untimed, correct: single, endsAt: null, remainingMs: null }));
    expect(document.querySelector('iframe')).not.toBeNull();
    expect(button('Закрити запитання')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '−15 с' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+15 с' })).toBeNull();
  });

  it('shows the code, the players and their connection state in the lobby', () => {
    show(view());
    expect(screen.getByText('123 456')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText(/немає зв’язку/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href')).toBe('http://quiz.test/stage/123456#s');
  });

  it('the invite button is only in the lobby', () => {
    show(view());
    expect(screen.getByRole('button', { name: 'Запросити друзів' })).toBeTruthy();
    cleanup();
    show(during('question', single));
    expect(screen.queryByRole('button', { name: 'Запросити друзів' })).toBeNull();
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

  it('names a picture answer by the letter players saw after a shuffle, like the correct answer', () => {
    const pic = '/uploads/abcdefabcdefabcd.png';
    const pictured: Question = { ...single, options: [{ id: 'a', text: 'Львів' }, { id: 'b', text: '', imageUrl: pic }], correctId: 'b' } as Question;
    // Показано у зворотному порядку: картинка під літерою A, хоча в автора вона B.
    const shown = [{ id: 'b', text: '', imageUrl: pic }, { id: 'a', text: 'Львів' }];
    show(
      during('reveal', pictured, {
        question: { ...publicOf(pictured), choices: shown },
        responses: [
          { playerId: 'p1', nickname: 'Олена', answer: { type: 'single', optionId: 'b' }, timeMs: 4000, accepted: true, grade: 'correct' as const, streakBonus: 0, points: 900, overridden: false },
        ],
      }),
    );
    expect(screen.getByText('Правильна відповідь: A. картинка')).toBeTruthy();
    const given = screen.getByText('Картинка A');
    expect(given.className).toBe('given');
    expect(given.closest('li')?.textContent).toContain('Олена');
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
  const round = (over: Partial<RoundInfo> = {}): RoundInfo => ({ index: 0, total: 2, title: 'Розминка', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null, ...over });

  it('shows the round intro with a «start round» main action', () => {
    const send = show(view({ phase: 'intro', round: round() }));
    expect(screen.getAllByText(/Раунд 1 з 2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Розминка/).length).toBeGreaterThan(0);
    fireEvent.click(button('Почати раунд'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
  });

  it('the host sees the round summary to read it aloud', () => {
    show(view({ phase: 'intro', round: round({ description: 'Кіно 90-х', brief: { ...emptyBrief('classic'), speedBonus: true }, times: null }) }));
    expect(screen.getByText('Кіно 90-х')).toBeTruthy();
    expect(screen.getByText('Якщо є таймер, швидша правильна відповідь дає більше балів.')).toBeTruthy();
  });

  it('the intro of a one-round quiz has no round counter', () => {
    show(view({ phase: 'intro', round: round({ total: 1, title: '', brief: { ...emptyBrief('classic'), speedBonus: true }, times: null }) }));
    expect(screen.queryByText(/Раунд 1 з 1/)).toBeNull();
    expect(button('Почати раунд')).toBeTruthy();
    expect(screen.getByText('Якщо є таймер, швидша правильна відповідь дає більше балів.')).toBeTruthy();
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
  const round: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false, description: '', brief: emptyBrief('blitz'), times: null };
  const blitz = (over: Partial<NonNullable<HostView['blitz']>> = {}): NonNullable<HostView['blitz']> => ({
    voice: false,
    manual: true,
    winner: null,
    instant: false,
    rows: [],
    queue: [
      { playerId: 'p1', nickname: 'Олена', answer: { type: 'text', value: 'Одеса' }, deadline: null },
      { playerId: 'p2', nickname: 'Тарас', answer: null, deadline: null },
    ],
    attempts: [{ playerId: 'p2', nickname: 'Тарас', answer: null, grade: 'wrong', points: -1000 }],
    ...over,
  });

  it('judges the head of the queue in a manual blitz round', async () => {
    const spotlight = { playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Одеса' }, grade: null };
    const send = show(during('question', textQuestion, { round, blitz: blitz(), spotlight }));
    expect(screen.getByText('пише…')).toBeTruthy();
    expect(screen.getByText('не встиг')).toBeTruthy();
    expect(screen.getByText(/у черзі: 2/)).toBeTruthy();
    fireEvent.click(button('Правильно'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p1', correct: true }));
    fireEvent.click(button('Неправильно'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p1', correct: false }));
  });

  it('the host sees each pick in the instant queue and the head orange with accept and repick', () => {
    const spotlight = { playerId: 'p2', nickname: 'Тарас', answer: { type: 'text' as const, value: 'Київ' }, grade: null };
    const rows = [
      { playerId: 'p1', nickname: 'Олена', timeMs: 1200, grade: 'wrong' as const, answer: { type: 'text' as const, value: 'Одеса' } },
      { playerId: 'p2', nickname: 'Тарас', timeMs: 2500, grade: null, answer: { type: 'text' as const, value: 'Київ' } },
    ];
    show(during('question', textQuestion, { round, spotlight, answeredCount: 2, blitz: blitz({ manual: false, instant: true, rows, attempts: [], queue: [{ playerId: 'p2', nickname: 'Тарас', answer: spotlight.answer, deadline: null }] }) }));
    const list = document.querySelector('.blitz-queue');
    expect(list?.querySelectorAll('.given').length).toBe(2);
    expect(list?.querySelectorAll('li')[1]?.classList.contains('is-pending')).toBe(true);
    expect(list?.querySelectorAll('li')[0]?.classList.contains('is-pending')).toBe(false);
    expect(button('Прийняти')).toBeTruthy();
    expect(button('Перевибрати')).toBeTruthy();
    // Одна панель «Черга» — жива черга миттєвого бліцу; старих панелей черги й спроб немає.
    expect(screen.getAllByText('Черга')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Черга' }).closest('.panel')?.querySelector('ol.blitz-queue')).toBe(list);
    expect(screen.queryByText('Спроби')).toBeNull();
    expect(screen.getByText(/Відповіли 2 з 2/)).toBeTruthy();
  });

  it('the button blitz host panel is unchanged', () => {
    show(during('question', textQuestion, { round, blitz: blitz({ instant: false }) }));
    expect(screen.getByText('Черга')).toBeTruthy();
    expect(screen.getByText('Спроби')).toBeTruthy();
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
    const boardRound: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: true, description: '', brief: emptyBrief('board'), times: null };
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
            { id: 'c1', price: 100, played: false, mark: 'x2', kind: 'normal', answerMode: 'phone', penalty: 'none' },
            { id: 'c2', price: 200, played: true, mark: 'none', kind: 'normal', answerMode: 'phone', penalty: 'none' },
          ],
        },
      ],
      order: three.map((p) => ({ playerId: p.id, nickname: p.nickname })),
      turn: { playerId: 'p1', nickname: 'Олена' },
      cell: null,
      dice: null,
      schedule: [],
      scheduleRepeats: false,
      skipAt: null,
      manual: false,
      answer: null,
      ...over,
    });
    const onBoard = (over: Partial<HostView> = {}, board = boardOf()) =>
      view({ phase: 'board', round: boardRound, players: three, playerCount: 3, board, ...over });

    const diceOf = (waiting: string[], done = false) => ({
      rows: three.map((p) => ({ playerId: p.id, nickname: p.nickname, throws: waiting.includes(p.id) ? [] : [4], waiting: waiting.includes(p.id) })),
      tieBreak: false,
      done,
    });
    const onIntro = (board = boardOf({ turn: null })) => view({ phase: 'intro', round: boardRound, players: three, playerCount: 3, board });

    it('sets the board order with arrows, starts the dice, rolls for the rest and keeps the join order', async () => {
      const order = [three[2], three[0], three[1]].map((p) => ({ playerId: p.id, nickname: p.nickname }));
      const send = show(onIntro(boardOf({ turn: null, order })));
      expect(screen.getByText('Порядок ходів')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Кинути за тих, хто лишився' })).toBeNull();
      // порядок у панелі береться з board.order: Іра, Олена, Тарас
      fireEvent.click(button('Опустити Іра'));
      expect(send).toHaveBeenCalledWith('host:order', { playerIds: ['p1', 'p3', 'p2'] });
      // кнопки розблоковуються, коли відповідь на попередню дію прийшла
      await waitFor(() => expect((button('Кидати кубики') as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(button('Кидати кубики'));
      expect(send).toHaveBeenCalledWith('host:dice', undefined);
      cleanup();

      const rolling = show(onIntro(boardOf({ turn: null, order, dice: diceOf(['p2']) })));
      expect((button('Кидати кубики') as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(button('Кинути за тих, хто лишився'));
      expect(rolling).toHaveBeenCalledWith('host:roll', undefined);
      await waitFor(() => expect((button('За порядком приєднання') as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(button('За порядком приєднання'));
      expect(rolling).toHaveBeenCalledWith('host:order', { playerIds: ['p1', 'p2', 'p3'] });
      cleanup();

      show(onIntro(boardOf({ turn: null, dice: diceOf([], true) })));
      expect((button('Кидати кубики') as HTMLButtonElement).disabled).toBe(false);
      expect(screen.queryByRole('button', { name: 'Кинути за тих, хто лишився' })).toBeNull();
    });

    it('the host start button waits for the dice and names who has not rolled', () => {
      show(onIntro(boardOf({ turn: null, dice: diceOf(['p2', 'p3']) })));
      expect((button('Почати раунд') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('Ще не кинули: Тарас, Іра. Можна кинути за них.')).toBeTruthy();
      cleanup();
      show(onIntro(boardOf({ turn: null, dice: diceOf([], true) })));
      expect((button('Почати раунд') as HTMLButtonElement).disabled).toBe(false);
      expect(screen.queryByText(/Ще не кинули/)).toBeNull();
    });

    it('the host sees the dice rows and the schedule', () => {
      const schedule = [{ number: 1, order: three.map((p) => ({ playerId: p.id, nickname: p.nickname })), done: 0 }];
      show(onIntro(boardOf({ turn: null, dice: diceOf([], true), schedule })));
      expect(document.querySelector('.dice-rows')).not.toBeNull();
      expect(screen.getByText('Розклад ходів')).toBeTruthy();
    });

    it('the host shows the turn queue under the legend', () => {
      const order = three.map((p) => ({ playerId: p.id, nickname: p.nickname }));
      show(onBoard({}, boardOf({ turn: { playerId: 'p1', nickname: 'Олена' }, schedule: [{ number: 1, order, done: 0 }] })));
      const legend = screen.getByRole('list', { name: 'Види клітинок' });
      const queue = screen.getByText('Черга ходів');
      expect(legend.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(document.querySelector('.turn-schedule .is-turn')?.textContent).toBe('Олена');
    });

    it('the host shows the legend under the board', () => {
      show(onBoard());
      const legend = screen.getByRole('list', { name: 'Види клітинок' });
      const scroll = document.querySelector('.gb-scroll') as HTMLElement;
      expect(scroll.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    it('the host sees the countdown when an absent answerer will close an untimed cell', () => {
      const away = three.map((p) => (p.id === 'p1' ? { ...p, connected: false } : p));
      const untimed = { ...publicOf(single), video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null };
      show(
        view({
          phase: 'question',
          questionIndex: 0,
          question: untimed,
          correct: single,
          round: boardRound,
          players: away,
          playerCount: 3,
          board: boardOf({ skipAt: Date.now() + 20_000 }),
        }),
      );
      expect(screen.getByText(/Олена відключений, клітинка закриється через 20 с/)).toBeTruthy();
    });

    it('grades a voice answer during the question', async () => {
      const send = show(
        during('question', single, {
          round: boardRound,
          players: three,
          board: boardOf({ manual: true, cell: { id: 'c1', category: 'Міста', price: 100, mark: 'x2', kind: 'normal' as const, answerMode: 'voice' as const, penalty: 'none' as const } }),
        }),
      );
      expect(screen.getByText('Відповідає Олена')).toBeTruthy();
      expect(screen.getByText('×2')).toBeTruthy();
      expect(screen.queryByText(/відповіли/)).toBeNull();
      fireEvent.click(button('Зарахувати'));
      expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'correct' });
      expect(button('Частково')).toBeTruthy();
    });

    it('the host sees the options when one player answers', () => {
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
      const spotlight = { playerId: 'p1', nickname: 'Олена', answer: { type: 'single' as const, optionId: 'a' }, grade: 'wrong' as const };
      show(during('reveal', single, { round: boardRound, players: three, spotlight, board: boardOf({ cell }) }));
      const choices = document.querySelector('.choices');
      expect(choices).not.toBeNull();
      expect(screen.getByText('Львів').closest('.choice')?.className).toContain('is-wrong');
      expect(screen.getByText('Київ').closest('.choice')?.className).toContain('is-correct');
      expect(screen.queryByText('Торкніться варіанта, який назвав гравець')).toBeNull();
      expect(choices?.querySelector('button')).toBeNull();
    });

    it('the host taps the option a voice player named', () => {
      const voiceCell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'voice' as const, penalty: 'none' as const };
      const send = show(during('question', single, { round: boardRound, players: three, endsAt: Date.now() + 20_000, board: boardOf({ manual: true, cell: voiceCell }) }));
      expect(screen.getByText('Торкніться варіанта, який назвав гравець')).toBeTruthy();
      fireEvent.click(button(/Київ/));
      expect(send).toHaveBeenCalledWith('host:name', { answer: { type: 'single', optionId: 'b' } });
      cleanup();
      // Позначка ведучого помаранчева, але це не відповідь з телефона: панелі «Прийняти»/«Перевибрати» немає.
      const named = { playerId: 'p1', nickname: 'Олена', answer: { type: 'single' as const, optionId: 'b' }, grade: null };
      show(during('question', single, { round: boardRound, players: three, endsAt: Date.now() + 20_000, spotlight: named, board: boardOf({ manual: true, cell: voiceCell }) }));
      expect(button(/Київ/).className).toContain('is-pending');
      expect(screen.queryByRole('heading', { name: 'Відповідь чекає на рішення' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Прийняти' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Перевибрати' })).toBeNull();
      cleanup();
      // На усній бліц-клітинці позначки немає.
      show(
        during('question', single, {
          round: boardRound,
          players: three,
          endsAt: Date.now() + 20_000,
          board: boardOf({ manual: true, cell: { ...voiceCell, kind: 'blitz' } }),
          blitz: { voice: true, manual: true, queue: [], winner: null, attempts: [], instant: false, rows: [] },
        }),
      );
      expect(document.querySelector('.choices')).not.toBeNull();
      expect(screen.queryByRole('button', { name: /Київ/ })).toBeNull();
      expect(screen.queryByText('Торкніться варіанта, який назвав гравець')).toBeNull();
    });

    it('shows a phone answer awaiting a grade and hides grading without one', () => {
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'x2' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
      const spotlight = { playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Одеса' }, grade: null };
      show(during('question', textQuestion, { round: boardRound, players: three, spotlight, board: boardOf({ manual: true, cell, answer: spotlight.answer }) }));
      expect(screen.getAllByText('Одеса').length).toBeGreaterThan(0);
      expect(button('Неправильно')).toBeTruthy();
      cleanup();
      show(during('question', textQuestion, { round: boardRound, players: three, board: boardOf({ manual: true, cell }) }));
      expect(screen.queryByRole('button', { name: 'Правильно' })).toBeNull();
    });

    it('grades a pending board answer by hand and can still re-pick', () => {
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
      const spotlight = { playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Одеса' }, grade: null };
      const send = show(
        during('question', textQuestion, { round: boardRound, players: three, spotlight, board: boardOf({ manual: true, cell, answer: spotlight.answer }) }),
      );
      fireEvent.click(button('Правильно'));
      expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'correct' });
      fireEvent.click(button('Частково'));
      expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'partial' });
      fireEvent.click(button('Перевибрати'));
      expect(send).toHaveBeenCalledWith('host:repick', { playerId: 'p1' });
    });

    it('renders no multiplier for unmarked cells, on the board and on the open cell', () => {
      const unmarked = boardOf().categories[0].cells.map((cell) => ({ ...cell, mark: 'none' as const }));
      show(onBoard({}, boardOf({ categories: [{ id: 'k1', title: 'Міста', cells: unmarked }] })));
      expect(document.body.textContent).not.toContain('×');
      cleanup();
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
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


  describe('timing and pending answers', () => {
    const pendingSpot = { playerId: 'p1', nickname: 'Олена', answer: { type: 'single' as const, optionId: 'a' }, grade: null };

    it('adds or removes 15 seconds while the timer runs and respects the limits', () => {
      const send = show(during('question', single, { endsAt: Date.now() + 20_000 }));
      fireEvent.click(button('+15 с'));
      expect(send).toHaveBeenCalledWith('host:time', { seconds: 15 });
      fireEvent.click(button('−15 с'));
      expect(send).toHaveBeenCalledWith('host:time', { seconds: -15 });
      cleanup();
      show(during('question', single, { endsAt: Date.now() + 5_000 }));
      expect(button('−15 с').disabled).toBe(true);
      expect(button('+15 с').disabled).toBe(false);
      cleanup();
      show(during('question', single, { endsAt: null, remainingMs: 120_000, paused: true }));
      expect(button('+15 с').disabled).toBe(true);
      expect(button('−15 с').disabled).toBe(false);
      cleanup();
      show(during('reveal', single));
      expect(screen.queryByRole('button', { name: '+15 с' })).toBeNull();
    });

    it('accepts or re-picks a pending answer in an automatic round', () => {
      const send = show(during('question', single, { endsAt: Date.now() + 20_000, spotlight: pendingSpot }));
      expect(screen.getByRole('heading', { name: 'Відповідь чекає на рішення' })).toBeTruthy();
      fireEvent.click(button('Прийняти'));
      expect(send).toHaveBeenCalledWith('host:accept', { playerId: 'p1' });
    });

    it('re-picks a pending answer naming its player', () => {
      const send = show(during('question', single, { endsAt: Date.now() + 20_000, spotlight: pendingSpot }));
      fireEvent.click(button('Перевибрати'));
      expect(send).toHaveBeenCalledWith('host:repick', { playerId: 'p1' });
    });

    it('sends accept once and disables the pending buttons until the ack', async () => {
      let done: () => void = () => {};
      const send: Send = vi.fn(() => new Promise<{ ok: true }>((resolve) => (done = () => resolve({ ok: true }))));
      show(during('question', single, { endsAt: Date.now() + 20_000, spotlight: pendingSpot }), send);
      fireEvent.click(button('Прийняти'));
      expect(button('Прийняти').disabled).toBe(true);
      expect(button('Перевибрати').disabled).toBe(true);
      fireEvent.click(button('Прийняти'));
      fireEvent.click(button('Перевибрати'));
      expect(send).toHaveBeenCalledTimes(1);
      done();
      await waitFor(() => expect(button('Прийняти').disabled).toBe(false));
    });

  describe('blitz cell', () => {
    const boardRound: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: null };
    const bob = { playerId: 'p2', nickname: 'Богдан' };
    const blitzCell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'blitz' as const, answerMode: 'phone' as const, penalty: 'none' as const };
    const cellBoard = (over: Partial<NonNullable<HostView['board']>> = {}): NonNullable<HostView['board']> => ({
      categories: [
        {
          id: 'k1',
          title: 'Міста',
          cells: [{ id: 'c1', price: 100, played: false, mark: 'x2', kind: 'blitz', answerMode: 'phone', penalty: 'none' }],
        },
      ],
      order: [{ playerId: 'p1', nickname: 'Олена' }, bob],
      turn: { playerId: 'p1', nickname: 'Олена' },
      cell: null,
      dice: null,
      schedule: [],
      scheduleRepeats: false,
      skipAt: null,
      manual: false,
      answer: null,
      ...over,
    });

    it('a blitz cell has the close-cell button and judge buttons for a voice head', () => {
      const head = { ...bob, answer: null, deadline: null };
      const send = show(
        during('question', textQuestion, {
          round: boardRound,
          endsAt: Date.now() + 20_000,
          board: cellBoard({ manual: true, cell: { ...blitzCell, answerMode: 'voice' } }),
          blitz: { voice: true, manual: true, queue: [head], winner: null, attempts: [], instant: false, rows: [] },
        }),
      );
      expect(screen.getByText('Відповідає Богдан')).toBeTruthy();
      expect(screen.getByText('Вибір: Олена')).toBeTruthy();
      expect(screen.queryByText('Відповідає Олена')).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Відповіді' })).toBeNull();
      fireEvent.click(button('Правильно'));
      expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p2', correct: true });
      fireEvent.click(button('Закрити клітинку'));
      expect(send).toHaveBeenCalledWith('host:lock', undefined);
    });

    it('a manual pending answer on a blitz cell is judged, not graded', () => {
      const spotlight = { ...bob, answer: { type: 'text' as const, value: 'Одеса' }, grade: null };
      const send = show(
        during('question', textQuestion, {
          round: boardRound,
          endsAt: Date.now() + 20_000,
          spotlight,
          board: cellBoard({ manual: true, cell: blitzCell, answer: spotlight.answer }),
          blitz: { voice: false, manual: true, queue: [{ ...bob, answer: spotlight.answer, deadline: null }], winner: null, attempts: [], instant: false, rows: [] },
        }),
      );
      expect(screen.queryByRole('button', { name: 'Частково' })).toBeNull();
      fireEvent.click(button('Неправильно'));
      expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p2', correct: false });
      expect(send).not.toHaveBeenCalledWith('host:override', expect.anything());
    });

    it('the host board marks blitz cells', () => {
      const { container } = render(
        <HostScreen
          view={view({ phase: 'board', round: boardRound, board: cellBoard() })}
          code="123456"
          stageUrl="http://quiz.test/stage/123456#s"
          joinUrl="http://quiz.test/play/123456"
          send={vi.fn(async () => ({ ok: true as const }))}
        />,
      );
      expect(container.querySelector('.gb-kind')?.textContent).toBe('Бліц');
    });
  });

    it('judges a pending blitz head by hand', () => {
      const blitzRound: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false, description: '', brief: emptyBrief('blitz'), times: null };
      const head = { playerId: 'p1', nickname: 'Олена', answer: pendingSpot.answer, deadline: null };
      const send = show(
        during('question', single, {
          round: blitzRound,
          endsAt: Date.now() + 20_000,
          spotlight: pendingSpot,
          blitz: { voice: false, manual: true, queue: [head], winner: null, attempts: [], instant: false, rows: [] },
        }),
      );
      expect(screen.getAllByRole('button', { name: 'Неправильно' })).toHaveLength(1);
      fireEvent.click(button('Неправильно'));
      expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p1', correct: false });
      expect(button('Перевибрати')).toBeTruthy();
    });
  });
});

describe('HostScreen final', () => {
  const finalRound: RoundInfo = { index: 0, total: 1, title: 'Космос', type: 'final', partial: false, description: '', brief: emptyBrief('final'), times: null };
  const three = [
    { id: 'p1', nickname: 'Анна', connected: true, score: 1000, streak: 0 },
    { id: 'p2', nickname: 'Богдан', connected: true, score: 500, streak: 0 },
    { id: 'p3', nickname: 'Віра', connected: true, score: 300, streak: 0 },
  ];
  const info = { theme: 'Космос', placed: 2, total: 3, shown: [], left: 0 };
  const entry = (playerId: string, nickname: string, over: object = {}) => ({
    playerId,
    nickname,
    answer: { type: 'single' as const, optionId: 'b' },
    grade: 'correct' as const,
    wager: 300,
    before: 1000,
    after: 1300,
    ...over,
  });
  const hostFinal = (over: object = {}) => ({ ...info, wagers: [], entries: [], manual: false, pending: [], ...over });

  it('shows who has wagered and opens the final question', () => {
    const send = show(
      view({
        phase: 'wager',
        round: finalRound,
        players: three,
        final: hostFinal({
          wagers: [
            { playerId: 'p1', nickname: 'Анна', wager: 300, limit: 1000 },
            { playerId: 'p2', nickname: 'Богдан', wager: 200, limit: 500 },
            { playerId: 'p3', nickname: 'Віра', wager: null, limit: 300 },
          ],
        }),
      }),
    );
    expect(screen.getByText('Поставили 2 з 3')).toBeTruthy();
    expect(screen.getByText('ще думає')).toBeTruthy();
    expect(document.querySelector('.wager-list li')?.textContent).toContain('300');
    fireEvent.click(button('Показати запитання'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
  });

  it('starts the final from the intro', () => {
    show(view({ phase: 'intro', round: finalRound, players: three }));
    expect(button('Почати фінал')).toBeTruthy();
  });

  it('lets the host end the round during the wagers', () => {
    show(view({ phase: 'wager', round: { ...finalRound, total: 2 }, players: three, final: hostFinal() }));
    expect(button('Завершити раунд')).toBeTruthy();
  });

  it('shows silent players next to the answers while the question is open', () => {
    show(
      during('question', single, {
        round: finalRound,
        players: three,
        final: hostFinal(),
        responses: [
          { playerId: 'p1', nickname: 'Анна', answer: { type: 'single', optionId: 'b' }, grade: 'correct', accepted: true, points: 0, streakBonus: 0, overridden: false, timeMs: 1000 },
        ],
      }),
    );
    expect(screen.getAllByText('ще думає')).toHaveLength(2);
    expect(screen.queryByText('не відповів')).toBeNull();
    // До рішення ведучого в рядку лише відповідь: жодного «не зараховано» чи балів.
    expect(screen.queryByText('не зараховано')).toBeNull();
    expect(screen.queryByText('зараховано')).toBeNull();
  });

  it('calls the silent players «не відповів» once the question is closed', () => {
    show(during('locked', single, { round: finalRound, players: three, final: hostFinal(), responses: [] }));
    expect(screen.getAllByText('не відповів')).toHaveLength(3);
    expect(screen.queryByText('ще думає')).toBeNull();
  });

  it('has no ±15 s buttons in an untimed final', () => {
    show(during('question', single, { round: finalRound, players: three, final: hostFinal(), endsAt: null, remainingMs: null }));
    expect(screen.queryByRole('button', { name: '−15 с' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+15 с' })).toBeNull();
  });

  it('lists each player once on the final reveal and marks wrong rows with a cross', () => {
    show(
      during('reveal', single, {
        round: finalRound,
        players: three,
        responses: [
          { playerId: 'p2', nickname: 'Богдан', answer: { type: 'single', optionId: 'a' }, grade: 'wrong', accepted: false, points: -200, streakBonus: 0, overridden: false, timeMs: 1000 },
        ],
        final: hostFinal({
          left: 1,
          shown: [entry('p2', 'Богдан', { grade: 'wrong', wager: 200, before: 500, after: 300 })],
          entries: [
            entry('p2', 'Богдан', { grade: 'wrong', wager: 200, before: 500, after: 300 }),
            entry('p1', 'Анна', { before: 1000, after: 1300 }),
          ],
        }),
      }),
    );
    expect(screen.queryByText('Відповіді')).toBeNull();
    expect(screen.getAllByText('Богдан').filter((node) => node.closest('.rows li') !== null && node.className === 'name')).toHaveLength(2);
    expect(document.querySelectorAll('.wager-list li .name')).toHaveLength(2);
    expect(document.querySelector('.wager-list li.is-wrong .tag.is-wrong')?.textContent).toBe('✗');
    expect(document.querySelector('.wager-list li.is-correct .tag.is-correct')).toBeNull();
  });

  it('reveals the next final player and regrades an entry', () => {
    const send = show(
      during('reveal', single, {
        round: finalRound,
        players: three,
        final: hostFinal({
          left: 2,
          shown: [entry('p3', 'Віра')],
          entries: [
            entry('p3', 'Віра', { before: 300, after: 600 }),
            entry('p2', 'Богдан', { grade: 'wrong', wager: 200, before: 500, after: 300 }),
            entry('p1', 'Анна', { answer: null, grade: 'wrong', after: 700 }),
          ],
        }),
      }),
    );
    expect(screen.getByText('Розкрито 1 з 3')).toBeTruthy();
    expect(screen.getByText('500 → 300')).toBeTruthy();
    // Мовчазного гравця оцінити не можна.
    expect(screen.getAllByRole('button', { name: 'Зарахувати' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Не зараховувати' })).toHaveLength(1);
    fireEvent.click(button('Наступний гравець'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
    fireEvent.click(button('Зарахувати'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p2', grade: 'correct' });
  });

  it('regrades a correct entry to wrong', () => {
    const send = show(
      during('reveal', single, {
        round: finalRound,
        players: three,
        final: hostFinal({ left: 0, shown: [entry('p1', 'Анна')], entries: [entry('p1', 'Анна')] }),
      }),
    );
    fireEvent.click(button('Не зараховувати'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'wrong' });
  });

  it('goes on with the usual next button once everyone is revealed', () => {
    show(during('reveal', single, { round: finalRound, players: three, final: hostFinal({ left: 0 }) }));
    expect(button('Далі')).toBeTruthy();
  });

  it('grades pending manual final answers', () => {
    const send = show(
      during('locked', textQuestion, {
        round: finalRound,
        players: three,
        final: hostFinal({
          manual: true,
          pending: [{ playerId: 'p1', nickname: 'Анна', answer: { type: 'text', text: 'Марс' } }],
        }),
      }),
    );
    fireEvent.click(button('Не зараховувати'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'wrong' });
  });

  it('the host sees chain progress for every player', () => {
    const chainQ: Question = { id: 'q3', type: 'chain', text: 'Ланцюжок', imageUrl: null, video: null, timeLimit: 20, points: 1000, words: ['Форель', 'Риба'], hintSeconds: 5 };
    const info = {
      total: 1,
      rows: [
        { playerId: 'p1', nickname: 'Олена', solved: 1, hints: 1, timeMs: 8000, points: null },
        { playerId: 'p2', nickname: 'Тарас', solved: 0, hints: 0, timeMs: null, points: null },
      ],
    };
    show(view({ phase: 'question', questionIndex: 0, question: { ...publicOf(single), type: 'chain', choices: [], chain: { first: 'Форель', masks: [['Р', null, null, null]], hintSeconds: 5 } }, correct: chainQ, endsAt: Date.now() + 20_000, chain: info }));
    expect(screen.getByRole('heading', { name: 'Ланцюжок' })).toBeTruthy();
    expect(document.querySelector('.chain-board')?.textContent).toContain('8,0 с');
    expect(document.querySelector('.chain-board')?.textContent).toContain('0 з 1');
    // Бали ланцюжка рахуються при закритті: панель «Відповіді» з нулями не показується.
    expect(document.querySelector('.chain-board .is-out')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Відповіді' })).toBeNull();
  });
});

describe('HostScreen timer and round facts', () => {
  it('the host sees the timer with the full time and its state', () => {
    show(during('question', single, { endsAt: Date.now() + 20_000, limitMs: 30_000 }));
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByText('/ 30 с')).toBeTruthy();
    cleanup();
    show(during('question', single, { endsAt: null, remainingMs: 20_000, limitMs: 30_000, paused: true }));
    expect(screen.getAllByText('Пауза').length).toBeGreaterThan(0);
  });

  it('the host timer says the answer waits for the host', () => {
    show(during('question', single, { endsAt: null, remainingMs: 20_000, limitMs: 30_000, held: true }));
    const timer = screen.getByRole('timer');
    expect(timer.querySelector('.timer-status')?.textContent).toBe('Чекає рішення ведучого');
    expect(timer.querySelector('.timer-total')).toBeNull();
  });

  it('the video title is masked during the question and open at the reveal', () => {
    const untimed = { ...publicOf(single), video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null };
    show(view({ phase: 'question', questionIndex: 0, question: untimed, correct: single, endsAt: null, remainingMs: null }));
    expect(document.querySelector('.video-mask')).not.toBeNull();
    cleanup();
    show(view({ phase: 'reveal', questionIndex: 0, question: untimed, correct: single, endsAt: null, remainingMs: null }));
    expect(document.querySelector('iframe')).not.toBeNull();
    expect(document.querySelector('.video-mask')).toBeNull();
  });

  it('no timer for a video question on the host', () => {
    const untimed = { ...publicOf(single), video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null };
    show(view({ phase: 'question', questionIndex: 0, question: untimed, correct: single, endsAt: null, remainingMs: null }));
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('the host intro shows the round facts', () => {
    const round: RoundInfo = { index: 0, total: 1, title: 'Місто', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: { min: 30, max: 60 } };
    show(view({ phase: 'intro', round, total: 10 }));
    expect(screen.getByText('10 запитань · 30–60 с на кожне')).toBeTruthy();
  });
});
