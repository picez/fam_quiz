// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView, Question, RoundInfo } from '@quiz/shared';
import type { Send } from '../live/types';
import { PlayerScreen } from './PlayerScreen';

afterEach(cleanup);

const publicQuestion = {
  type: 'single' as const,
  text: 'Столиця України?',
  imageUrl: null,
  timeLimit: 20,
  points: 1000,
  choices: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
  ],
};

const fullQuestion: Question = {
  id: 'q1',
  type: 'single',
  text: 'Столиця України?',
  imageUrl: null,
  timeLimit: 20,
  points: 1000,
  options: publicQuestion.choices,
  correctId: 'b',
};

const me = { id: 'p1', nickname: 'Олена', score: 0, rank: null, answer: null, result: null, blitz: null };

const view = (over: Partial<PlayerView> = {}): PlayerView => ({
  role: 'player',
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
  me,
  reveal: null,
  standings: null,
  ...over,
});

const onQuestion = (over: Partial<PlayerView> = {}) =>
  view({ phase: 'question', questionIndex: 0, question: publicQuestion, endsAt: Date.now() + 20_000, ...over });

function show(current: PlayerView, options: { hostOnline?: boolean; send?: Send } = {}) {
  const send: Send = options.send ?? vi.fn(async () => ({ ok: true as const }));
  render(<PlayerScreen view={current} hostOnline={options.hostOnline ?? true} offsetMs={0} send={send} />);
  return send;
}

describe('PlayerScreen', () => {
  it('shows the nickname, the score and a waiting message in the lobby', () => {
    show(view({ me: { ...me, score: 1250 } }));
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText('1250')).toBeTruthy();
    expect(screen.getByText('Ви в грі. Чекаємо на старт.')).toBeTruthy();
  });

  it('lets the player answer an open question', () => {
    const send = show(onQuestion());
    expect(screen.getByText('Столиця України?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    expect(send).toHaveBeenCalledWith('player:answer', { type: 'single', optionId: 'b' });
  });

  it('shows the answer already given instead of the input, also after a page reload', () => {
    show(onQuestion({ me: { ...me, answer: { type: 'single', optionId: 'b' } } }));
    expect(screen.getByText('Відповідь прийнято')).toBeTruthy();
    expect(screen.getByText(/Київ/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Львів/ })).toBeNull();
  });

  it('explains why an answer was refused', async () => {
    const send: Send = vi.fn(async () => ({ ok: false as const, error: 'time_over' }));
    show(onQuestion(), { send });
    fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Час на відповідь вийшов.'));
  });

  it('says the game is paused, or that the host is away', () => {
    show(onQuestion({ paused: true, endsAt: null, remainingMs: 12_000 }));
    expect(screen.getByRole('status').textContent).toBe('Пауза');
    cleanup();

    show(onQuestion({ paused: true, endsAt: null, remainingMs: 12_000 }), { hostOnline: false });
    expect(screen.getByRole('status').textContent).toBe('Чекаємо на ведучого');
  });

  it('keeps what the player has entered through a pause, with the input disabled', () => {
    const textQuestion = { ...publicQuestion, type: 'text' as const, choices: [] };
    const props = { hostOnline: true, offsetMs: 0, send: vi.fn(async () => ({ ok: true as const })) };
    const { rerender } = render(<PlayerScreen view={onQuestion({ question: textQuestion })} {...props} />);
    fireEvent.change(screen.getByLabelText('Ваша відповідь'), { target: { value: 'Мукач' } });

    const pausedView = onQuestion({ question: textQuestion, paused: true, endsAt: null, remainingMs: 9000 });
    rerender(<PlayerScreen view={pausedView} {...props} />);
    const paused = screen.getByLabelText('Ваша відповідь') as HTMLInputElement;
    expect(paused.value).toBe('Мукач');
    expect(paused.closest('fieldset')?.disabled).toBe(true);

    rerender(<PlayerScreen view={onQuestion({ question: textQuestion })} {...props} />);
    const resumed = screen.getByLabelText('Ваша відповідь') as HTMLInputElement;
    expect(resumed.value).toBe('Мукач');
    expect(resumed.closest('fieldset')?.disabled).toBe(false);
  });

  it('waits for the reveal once the question is locked', () => {
    show(view({ phase: 'locked', questionIndex: 0, question: publicQuestion }));
    expect(screen.getByText('Чекаємо на правильну відповідь')).toBeTruthy();
  });

  it('shows a correct result with the points earned', () => {
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        question: publicQuestion,
        reveal: fullQuestion,
        me: {
          ...me,
          score: 750,
          answer: { type: 'single', optionId: 'b' },
          result: { accepted: true, accuracy: 1, grade: 'correct', streakBonus: 0, points: 750 },
        },
      }),
    );
    expect(screen.getByText('Правильно!')).toBeTruthy();
    expect(screen.getByText('+750')).toBeTruthy();
    expect(screen.getByText('Правильна відповідь: B. Київ')).toBeTruthy();
  });

  it('distinguishes a wrong answer, a partial one and no answer', () => {
    const reveal = { phase: 'reveal' as const, questionIndex: 0, question: publicQuestion, reveal: fullQuestion };

    show(view({ ...reveal, me: { ...me, result: { accepted: false, accuracy: 0, grade: 'wrong', streakBonus: 0, points: 0 } } }));
    expect(screen.getByText('Неправильно')).toBeTruthy();
    cleanup();

    show(view({ ...reveal, me: { ...me, result: { accepted: false, accuracy: 0.5, grade: 'partial', streakBonus: 0, points: 500 } } }));
    expect(screen.getByText('Частково правильно')).toBeTruthy();
    expect(screen.getByText('+500')).toBeTruthy();
    cleanup();

    show(view(reveal));
    expect(screen.getByText('Ви не відповіли')).toBeTruthy();
  });

  it('shows the place on the leaderboard and at the end', () => {
    const standings = [
      { participantId: 'p2', nickname: 'Тарас', score: 900, totalTimeMs: 1, rank: 1 },
      { participantId: 'p1', nickname: 'Олена', score: 750, totalTimeMs: 1, rank: 2 },
    ];
    show(view({ phase: 'leaderboard', questionIndex: 0, standings, me: { ...me, score: 750, rank: 2 } }));
    expect(screen.getByText('Ваше місце: 2 з 2')).toBeTruthy();
    expect(screen.getByText('Тарас')).toBeTruthy();
    cleanup();

    show(view({ phase: 'finished', questionIndex: 1, standings, me: { ...me, score: 750, rank: 2 } }));
    expect(screen.getByText('Гру завершено')).toBeTruthy();
    expect(screen.getByText('Ваше місце: 2 з 2')).toBeTruthy();
  });
});

describe('PlayerScreen: question image', () => {
  const imageUrl = '/uploads/0123456789abcdef0123456789abcdef.png';
  const withImage = () =>
    show(view({ phase: 'question', questionIndex: 0, question: { ...publicQuestion, imageUrl }, endsAt: Date.now() + 20_000 }));

  it('shows the image above the answers', () => {
    withImage();
    expect(document.querySelector('img.question-image')?.getAttribute('src')).toBe(imageUrl);
  });

  it('removes the image that failed to load and keeps the answers usable', () => {
    withImage();
    fireEvent.error(document.querySelector('img.question-image')!);
    expect(document.querySelector('.question-image')).toBeNull();
    expect(screen.getByRole('button', { name: /Київ/ })).toBeTruthy();
  });
});

describe('PlayerScreen: rounds', () => {
  const round: RoundInfo = { index: 1, total: 3, title: 'Фінальний', type: 'classic', partial: false };

  it('announces the round on the intro', () => {
    show(view({ phase: 'intro', round }));
    expect(screen.getByText('Раунд 2 з 3')).toBeTruthy();
    expect(screen.getByText('Фінальний')).toBeTruthy();
  });

  it('shows the round results with the place', () => {
    const standings = [
      { participantId: 'p2', nickname: 'Тарас', score: 900, totalTimeMs: 1, rank: 1 },
      { participantId: 'p1', nickname: 'Олена', score: 750, totalTimeMs: 1, rank: 2 },
    ];
    show(view({ phase: 'round_end', round, standings, me: { ...me, score: 750, rank: 2 } }));
    expect(screen.getByText('Підсумки раунду 2')).toBeTruthy();
    expect(screen.getByText('Ваше місце: 2 з 2')).toBeTruthy();
  });

  it('shows a negative result with a real minus and the streak bonus on its own line', () => {
    const reveal = { phase: 'reveal' as const, questionIndex: 0, question: publicQuestion, reveal: fullQuestion, round };
    show(view({ ...reveal, me: { ...me, score: -1000, result: { accepted: false, accuracy: 0, grade: 'wrong', streakBonus: 0, points: -1000 } } }));
    expect(screen.getAllByText('−1000').length).toBeGreaterThan(0);
    cleanup();

    show(view({ ...reveal, me: { ...me, score: 850, result: { accepted: true, accuracy: 1, grade: 'correct', streakBonus: 100, points: 850 } } }));
    expect(screen.getByText('+850')).toBeTruthy();
    expect(screen.getByText('+100 за серію')).toBeTruthy();
  });

  it('names the round next to the question number when there are several', () => {
    show(onQuestion({ round, total: 4, questionIndex: 1 }));
    expect(screen.getByText(/Запитання 2 з 4/)).toBeTruthy();
    expect(screen.getByText(/Раунд 2/)).toBeTruthy();
  });
});

describe('PlayerScreen: blitz', () => {
  const round: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false };
  const blitzMe = (blitz: Partial<NonNullable<PlayerView['me']['blitz']>>, over: Partial<PlayerView['me']> = {}) => ({
    ...me,
    ...over,
    blitz: { position: null, attemptsUsed: 0, attemptsLeft: null, canBuzz: false, deadline: null, ...blitz },
  });
  const inBlitz = (meState: PlayerView['me']) =>
    onQuestion({ round, question: { ...publicQuestion, type: 'text', choices: [] }, blitz: { queue: [], winner: null }, me: meState });

  it('shows the buzz button and sends player:buzz', async () => {
    const send = show(inBlitz(blitzMe({ canBuzz: true })));
    fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:buzz'));
  });

  it('shows the place in the queue and the answer input after buzzing', () => {
    show(inBlitz(blitzMe({ position: 2 })));
    expect(screen.getByText('Ви 2-й у черзі')).toBeTruthy();
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(document.querySelector('.btn-buzz')).toBeNull();
  });

  it('hides the answer-window countdown during a pause', () => {
    const queued = blitzMe({ position: 1, deadline: Date.now() + 5000 });
    show(inBlitz(queued));
    expect(screen.getAllByRole('timer')).toHaveLength(2);
    cleanup();
    show({ ...inBlitz(queued), paused: true, endsAt: null, remainingMs: 9000 });
    expect(screen.getAllByRole('timer').map((timer) => timer.getAttribute('aria-label'))).toEqual(['9']);
  });

  it('confirms a sent answer with the place in the queue', () => {
    show(inBlitz(blitzMe({ position: 1 }, { answer: { type: 'text', value: 'Одеса' } })));
    expect(screen.getByText('Відповідь надіслано, ви 1-й у черзі')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says when attempts are used up', () => {
    show(inBlitz(blitzMe({ attemptsUsed: 1, attemptsLeft: 0 })));
    expect(screen.getByText('Спроби вичерпано')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Відповісти' })).toBeNull();
  });

  it('says a wrong attempt over the button when tries remain', () => {
    show(inBlitz(blitzMe({ attemptsUsed: 1, attemptsLeft: 1, canBuzz: true })));
    expect(screen.getByText('Неправильно, спробуйте ще')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Відповісти' })).toBeTruthy();
  });

  it('names the current head, not the last wrong answer, as answering', () => {
    const spotlight = { playerId: 'p2', nickname: 'Тарас', answer: { type: 'single' as const, optionId: 'a' }, grade: 'wrong' as const };
    const head = { playerId: 'p1', nickname: 'Олена' };
    show(onQuestion({ round, spotlight, blitz: { queue: [head], winner: null }, me: blitzMe({ position: 1 }) }));
    expect(screen.queryByText(/Відповідає/)).toBeNull();
    cleanup();
    show(onQuestion({ round, spotlight, blitz: { queue: [{ playerId: 'p3', nickname: 'Віра' }], winner: null }, me: blitzMe({}) }));
    expect(screen.getByText('Відповідає Віра')).toBeTruthy();
    cleanup();
    show(onQuestion({ round, spotlight, blitz: { queue: [], winner: null }, me: blitzMe({}) }));
    expect(screen.queryByText(/Відповідає/)).toBeNull();
  });

  it('shows the winner line at the reveal', () => {
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        round,
        question: publicQuestion,
        reveal: fullQuestion,
        blitz: { queue: [], winner: { playerId: 'p2', nickname: 'Тарас' } },
        me: blitzMe({}),
      }),
    );
    expect(screen.getByText('Першим правильно відповів: Тарас')).toBeTruthy();
  });

  describe('board round', () => {
    const round: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false };
    const boardOf = (turn: string, over: Partial<NonNullable<PlayerView['board']>> = {}): NonNullable<PlayerView['board']> => ({
      categories: [
        {
          id: 'k1',
          title: 'Міста',
          cells: [
            { id: 'c1', price: 100, played: false, mark: null },
            { id: 'c2', price: 200, played: true, mark: null },
          ],
        },
      ],
      order: [
        { playerId: 'p1', nickname: 'Олена' },
        { playerId: 'p2', nickname: 'Анна' },
      ],
      turn: { playerId: turn, nickname: turn === 'p1' ? 'Олена' : 'Анна' },
      cell: null,
      answerMode: 'phone',
      rolls: 0,
      skipAt: null,
      ...over,
    });
    const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'x2' as const };

    it('lets the chooser pick a cell and others wait', async () => {
      const send = show(view({ phase: 'board', round, board: boardOf('p1') }));
      expect(screen.getByText('Ваш хід: виберіть клітинку')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Міста, 100' }));
      expect(send).toHaveBeenCalledWith('player:pick', { cellId: 'c1' });
      cleanup();

      show(view({ phase: 'board', round, board: boardOf('p2') }));
      expect(screen.getByText('Вибирає Анна')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Міста, 100' })).toBeNull();
    });

    it('renders no multiplier for an unmarked cell', () => {
      show(onQuestion({ round, board: boardOf('p2', { cell: { ...cell, mark: 'none' } }) }));
      expect(screen.getByText('Відповідає Анна')).toBeTruthy();
      expect(document.body.textContent).not.toContain('×');
    });

    it('disables the chooser board while the game is paused', () => {
      show(view({ phase: 'board', round, paused: true, board: boardOf('p1') }));
      expect((screen.getByRole('button', { name: 'Міста, 100' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('only the chooser gets the answer input', () => {
      show(onQuestion({ round, board: boardOf('p2', { cell }) }));
      expect(screen.getByText('Відповідає Анна')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Київ/ })).toBeNull();
      cleanup();

      show(onQuestion({ round, board: boardOf('p1', { cell, answerMode: 'voice' }) }));
      expect(screen.getByText('Відповідайте вголос')).toBeTruthy();
      cleanup();

      show(onQuestion({ round, board: boardOf('p1', { cell }) }));
      expect(screen.getByRole('button', { name: /Київ/ })).toBeTruthy();
    });

    it('tells the others who answered and shows the correct answer', () => {
      show(view({ phase: 'reveal', round, questionIndex: 0, question: publicQuestion, reveal: fullQuestion, board: boardOf('p2', { cell }) }));
      expect(screen.getByText('Відповідав Анна')).toBeTruthy();
      expect(screen.getByText(/Правильна відповідь: B. Київ/)).toBeTruthy();
    });
  });
});

describe('PlayerScreen: spotlight', () => {
  const round: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false };
  const boardOf = (turn: { playerId: string; nickname: string }): NonNullable<PlayerView['board']> => ({
    categories: [],
    order: [turn],
    turn,
    cell: { id: 'c1', category: 'Міста', price: 100, mark: 'none' },
    answerMode: 'phone',
    rolls: 0,
    skipAt: null,
  });
  const anna = { playerId: 'p2', nickname: 'Анна' };

  it('shows the full question with the pending answer to a player who is not answering', () => {
    const spotlight = { ...anna, answer: { type: 'single' as const, optionId: 'a' }, grade: null };
    show(onQuestion({ round, board: boardOf(anna), spotlight }));
    const lead = screen.getByText('Відповідає Анна');
    const title = screen.getByRole('heading', { name: 'Столиця України?' });
    expect(lead.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Львів').closest('.choice')?.className).toContain('is-pending');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.querySelector('.inputs')).toBeNull();
  });

  it('the answering player sees their own pending answer and a waiting note', () => {
    const mine = { playerId: 'p1', nickname: 'Олена' };
    const spotlight = { ...mine, answer: { type: 'single' as const, optionId: 'a' }, grade: null };
    show(onQuestion({ round, board: boardOf(mine), spotlight, me: { ...me, answer: spotlight.answer } }));
    expect(screen.getByText('Львів').closest('.choice')?.className).toContain('is-pending');
    expect(screen.getByText('Чекаємо на рішення ведучого')).toBeTruthy();
    expect(screen.queryByText(/Відповідає/)).toBeNull();
  });

  it('shows the verdict colours with the correct option at the reveal to a bystander', () => {
    const spotlight = { ...anna, answer: { type: 'single' as const, optionId: 'a' }, grade: 'wrong' as const };
    show(view({ phase: 'reveal', questionIndex: 0, question: publicQuestion, reveal: fullQuestion, round, board: boardOf(anna), spotlight }));
    expect(screen.getByText('Львів').closest('.choice')?.className).toContain('is-wrong');
    expect(screen.getByText('Київ').closest('.choice')?.className).toContain('is-correct');
  });
});
