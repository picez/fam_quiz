// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyBrief, type BlitzRow, type PlayerBlitz, PlayerView, Question, RoundInfo } from '@quiz/shared';
import type { Send } from '../live/types';
import { PlayerScreen } from './PlayerScreen';
import { BLINK_MS } from './verdict-blink';

afterEach(cleanup);

const publicQuestion = {
  type: 'single' as const,
  text: 'Столиця України?',
  imageUrl: null,
  video: null,
  timeLimit: 20,
  points: 1000,
  right: [], chain: null, orderLabels: null,
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
  video: null,
  timeLimit: 20,
  points: 1000,
  options: publicQuestion.choices,
  correctId: 'b',
};

const me = { id: 'p1', nickname: 'Олена', score: 0, rank: null, answer: null, result: null, blitz: null, final: null, chain: null };

const view = (over: Partial<PlayerView> = {}): PlayerView => ({
  role: 'player',
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
  it('a video question shows the player and no timer on the phone', () => {
    const withVideo = { ...publicQuestion, video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null };
    show(onQuestion({ question: withVideo, endsAt: null, remainingMs: null }));
    expect(document.querySelector('iframe')?.getAttribute('src')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByRole('button', { name: /Київ/ })).toBeTruthy();
    expect(document.querySelector('.video-mask')).not.toBeNull();
  });

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
  const round: RoundInfo = { index: 1, total: 3, title: 'Фінальний', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null };

  it('announces the round on the intro', () => {
    show(view({ phase: 'intro', round }));
    expect(screen.getByText('Раунд 2 з 3')).toBeTruthy();
    expect(screen.getByText('Фінальний')).toBeTruthy();
  });

  it('the intro explains the round on the phone', () => {
    show(view({ phase: 'intro', round: { ...round, type: 'blitz', description: 'Кіно 90-х', brief: emptyBrief('blitz'), times: null } }));
    expect(screen.getByText('Кіно 90-х')).toBeTruthy();
    expect(screen.getByText('Бали отримує лише той, хто першим правильно відповість.')).toBeTruthy();
  });

  it('the intro of a one-round quiz has no round counter', () => {
    show(view({ phase: 'intro', round: { index: 0, total: 1, title: '', type: 'classic', partial: false, description: '', brief: { ...emptyBrief('classic'), speedBonus: true }, times: null } }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Раунд 1');
    expect(screen.getByText('Відповідають усі: бали отримує кожен, хто відповів правильно.')).toBeTruthy();
    expect(screen.queryByText('Раунд 1 з 1')).toBeNull();
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
  const round: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false, description: '', brief: emptyBrief('blitz'), times: null };
  const blitzMe = (blitz: Partial<NonNullable<PlayerView['me']['blitz']>>, over: Partial<PlayerView['me']> = {}) => ({
    ...me,
    ...over,
    blitz: { position: null, attemptsUsed: 0, attemptsLeft: null, canBuzz: false, deadline: null, canAnswer: false, grade: null, ...blitz },
  });
  const inBlitz = (meState: PlayerView['me']) =>
    onQuestion({ round, question: { ...publicQuestion, type: 'text' as const, choices: [] }, blitz: { queue: [], winner: null, instant: false, rows: [] }, me: meState });

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
    show(onQuestion({ round, spotlight, blitz: { queue: [head], winner: null, instant: false, rows: [] }, me: blitzMe({ position: 1 }) }));
    expect(screen.queryByText(/Відповідає/)).toBeNull();
    cleanup();
    show(onQuestion({ round, spotlight, blitz: { queue: [{ playerId: 'p3', nickname: 'Віра' }], winner: null, instant: false, rows: [] }, me: blitzMe({}) }));
    expect(screen.getByText('Відповідає Віра')).toBeTruthy();
    cleanup();
    show(onQuestion({ round, spotlight, blitz: { queue: [], winner: null, instant: false, rows: [] }, me: blitzMe({}) }));
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
        blitz: { queue: [], winner: { playerId: 'p2', nickname: 'Тарас' }, instant: false, rows: [] },
        me: blitzMe({}),
      }),
    );
    expect(screen.getByText('Першим правильно відповів: Тарас')).toBeTruthy();
  });

  describe('instant blitz', () => {
    const kyiv = { type: 'single' as const, optionId: 'b' };
    const instantView = (
      blitz: Partial<PlayerBlitz>,
      over: Partial<PlayerView> = {},
      meOver: Partial<PlayerView['me']> = {},
      rows: BlitzRow[] = [],
    ) =>
      onQuestion({
        round,
        blitz: { queue: rows.filter((row) => row.grade === null), winner: null, instant: true, rows },
        me: blitzMe({ canAnswer: true, ...blitz }, meOver),
        ...over,
      });
    const row = (playerId: string, nickname: string, grade: BlitzRow['grade'], timeMs = 2000): BlitzRow => ({ playerId, nickname, timeMs, grade, answer: null });

    it('instant blitz: options at once without the buzz button; a tap sends the answer', () => {
      const send = show(instantView({}));
      expect(screen.queryByRole('button', { name: 'Відповісти' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
      expect(send).toHaveBeenCalledWith('player:answer', kyiv);
    });

    it('after sending, the own pick is orange in the same list and the status line says the place', () => {
      show(instantView({ canAnswer: false, position: 2 }, {}, { answer: kyiv }, [row('p2', 'Анна', null), row('p1', 'Олена', null)]));
      expect(document.querySelector('.choice.is-pending')?.textContent).toContain('Київ');
      expect(screen.getByText('Відповідь надіслано · ви 2-й у черзі')).toBeTruthy();
      expect(document.querySelector('ol.blitz-queue')).not.toBeNull();
    });

    it('the own wrong verdict blinks; other rows show no picks', () => {
      vi.useFakeTimers();
      const props = { hostOnline: true, offsetMs: 0, send: vi.fn(async () => ({ ok: true as const })) };
      const sent = instantView({ canAnswer: false, position: 1 }, {}, { answer: kyiv }, [row('p1', 'Олена', null), row('p2', 'Анна', null)]);
      const { rerender } = render(<PlayerScreen view={sent} {...props} />);
      const judged = instantView({ canAnswer: false, position: null, grade: 'wrong' }, {}, { answer: kyiv }, [row('p1', 'Олена', 'wrong'), row('p2', 'Анна', null)]);
      rerender(<PlayerScreen view={judged} {...props} />);
      expect(document.querySelector('.choice.is-wrong.is-blinking')?.textContent).toContain('Київ');
      expect(document.querySelector('.blitz-queue .blitz-mark.is-blinking')).not.toBeNull();
      expect(document.querySelector('.blitz-queue .given')).toBeNull();
      expect(screen.getByText('Неправильно — чекаємо інших')).toBeTruthy();
      vi.useRealTimers();
    });

    it('no answering line above the question in an instant blitz', () => {
      show(instantView({}, {}, {}, [row('p2', 'Анна', null)]));
      expect(screen.queryByText(/Відповідає/)).toBeNull();
    });

    it('after repick the options are tappable again with a note', () => {
      show(instantView({ canAnswer: true, position: 1, deadline: Date.now() + 15_000 }, {}, {}, [row('p1', 'Олена', null)]));
      expect(screen.getByRole('button', { name: /Київ/ })).toBeTruthy();
      expect(screen.getByText('Ведучий просить вибрати ще раз')).toBeTruthy();
      // Відлік вікна — у рядку стану, а не окремим блоком над ним: черга під ним не стрибає.
      const statusRow = document.querySelector('.blitz-status-row');
      expect(statusRow?.querySelector('.timer')).not.toBeNull();
      expect(statusRow?.querySelector('p.blitz-status')).not.toBeNull();
      expect(statusRow?.nextElementSibling?.matches('ol.blitz-queue')).toBe(true);
    });

    it('once the time is over, a player who has not answered sees the options locked in place and a calm note', () => {
      vi.useFakeTimers();
      const props = { hostOnline: true, offsetMs: 0, send: vi.fn(async () => ({ ok: true as const })) };
      render(<PlayerScreen view={instantView({}, { endsAt: Date.now() + 1000 })} {...props} />);
      const before = screen.getByRole('button', { name: /Київ/ });
      expect((before.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false);
      act(() => vi.advanceTimersByTime(1500));
      const after = screen.getByRole('button', { name: /Київ/ });
      // Той самий елемент: варіанти не перебудовуються й не зсуваються.
      expect(after).toBe(before);
      expect((after.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
      expect(screen.getByText('Час вийшов — відповіді більше не приймаються')).toBeTruthy();
      fireEvent.click(after);
      expect(props.send).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('a pause keeps the half-typed answer in place, only disabled', () => {
      const props = { hostOnline: true, offsetMs: 0, send: vi.fn(async () => ({ ok: true as const })) };
      const typed = { question: { ...publicQuestion, type: 'text' as const, choices: [] } };
      const { rerender } = render(<PlayerScreen view={instantView({}, typed)} {...props} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Ки' } });
      rerender(<PlayerScreen view={instantView({}, { ...typed, paused: true, endsAt: null, remainingMs: 9000 })} {...props} />);
      const kept = screen.getByRole('textbox') as HTMLInputElement;
      expect(kept).toBe(input);
      expect(kept.value).toBe('Ки');
      expect((kept.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    });

    it('a repicked head keeps answering past the round timer until its own window ends', () => {
      show(instantView({ canAnswer: true, position: 1, deadline: Date.now() + 15_000 }, { endsAt: Date.now() - 1000 }, {}, [row('p1', 'Олена', null)]));
      expect((screen.getByRole('button', { name: /Київ/ }).closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false);
    });

    it('on locked the winner is shown with the queue; on reveal the own pick and the correct answer are coloured', () => {
      const rows = [row('p1', 'Олена', 'wrong'), row('p3', 'Богдан', 'correct')];
      const blitz = { queue: [], winner: { playerId: 'p3', nickname: 'Богдан' }, instant: true, rows };
      const meState = blitzMe({ grade: 'wrong' }, { answer: kyiv });
      show(view({ phase: 'locked', questionIndex: 0, round, question: publicQuestion, blitz, me: meState }));
      expect(screen.getByText('Першим правильно відповів: Богдан')).toBeTruthy();
      expect(document.querySelector('ol.blitz-queue')).not.toBeNull();
      cleanup();
      show(view({ phase: 'reveal', questionIndex: 0, round, question: publicQuestion, reveal: fullQuestion, blitz, me: meState }));
      expect(document.querySelector('.choice.is-correct')?.textContent).toContain('Київ');
      expect(document.querySelector('ol.blitz-queue')).not.toBeNull();
    });
  });

  it('the button blitz keeps the buzz button and always reserves the answering line', () => {
    show(inBlitz(blitzMe({ canBuzz: true })));
    expect(screen.getByRole('button', { name: 'Відповісти' })).toBeTruthy();
    const line = document.querySelector('p.answering-line');
    expect(line?.textContent).toBe('');
    cleanup();
    show({ ...inBlitz(blitzMe({ canBuzz: true })), blitz: { queue: [{ playerId: 'p2', nickname: 'Анна' }], winner: null, instant: false, rows: [] } });
    expect(document.querySelector('p.answering-line')?.textContent).toBe('Відповідає Анна');
  });

  describe('board round', () => {
    const round: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: null };
    const boardOf = (turn: string, over: Partial<NonNullable<PlayerView['board']>> = {}): NonNullable<PlayerView['board']> => ({
      categories: [
        {
          id: 'k1',
          title: 'Міста',
          cells: [
            { id: 'c1', price: 100, played: false, mark: 'none', kind: 'normal', answerMode: 'phone', penalty: 'none' },
            { id: 'c2', price: 200, played: true, mark: 'none', kind: 'normal', answerMode: 'phone', penalty: 'none' },
          ],
        },
      ],
      order: [
        { playerId: 'p1', nickname: 'Олена' },
        { playerId: 'p2', nickname: 'Анна' },
      ],
      turn: { playerId: turn, nickname: turn === 'p1' ? 'Олена' : 'Анна' },
      cell: null,
      dice: null,
      schedule: [],
      scheduleRepeats: false,
      skipAt: null,
      ...over,
    });
    const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'x2' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };

    it('the phone shows the turn queue under the legend while choosing a cell', () => {
      const olena = { playerId: 'p1', nickname: 'Олена' };
      const anna = { playerId: 'p2', nickname: 'Анна' };
      const schedule = [{ number: 1, order: [olena, anna], done: 1 }];
      show(view({ phase: 'board', round, board: boardOf('p2', { schedule }) }));
      const legend = screen.getByRole('list', { name: 'Види клітинок' });
      const queue = screen.getByText('Черга ходів');
      expect(legend.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(document.querySelector('.turn-schedule .is-turn')?.textContent).toBe('Анна');
    });

    it('the phone shows the legend under the board', () => {
      show(view({ phase: 'board', round, board: boardOf('p2') }));
      const legend = screen.getByRole('list', { name: 'Види клітинок' });
      const scroll = document.querySelector('.gb-scroll') as HTMLElement;
      expect(scroll.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

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

    it('another player watching a board answerer sees the video too', () => {
      const withVideo = { ...publicQuestion, video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null };
      show(onQuestion({ round, question: withVideo, endsAt: null, board: boardOf('p1', { cell: { ...cell, mark: 'none' } }), me: { ...me, id: 'p2' } }));
      expect(document.querySelector('iframe')).not.toBeNull();
      expect(screen.getByText('Відповідає Олена')).toBeTruthy();
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

      show(onQuestion({ round, board: boardOf('p1', { cell: { ...cell, answerMode: 'voice' } }) }));
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

    const olena = { playerId: 'p1', nickname: 'Олена' };
    const anna = { playerId: 'p2', nickname: 'Анна' };
    const diceOf = (mine: number[], waiting: boolean, extra: { tieBreak?: boolean; done?: boolean; annaWaiting?: boolean } = {}) => ({
      rows: [
        { ...olena, throws: mine, waiting },
        { ...anna, throws: [], waiting: extra.annaWaiting ?? true },
      ],
      tieBreak: extra.tieBreak ?? false,
      done: extra.done ?? false,
    });
    const intro = (dice: ReturnType<typeof diceOf>, over: Partial<PlayerView> = {}, board: Partial<NonNullable<PlayerView['board']>> = {}) =>
      view({ phase: 'intro', round, board: boardOf('p1', { turn: null, dice, ...board }), ...over });
    const rollButton = () => screen.queryByRole('button', { name: 'Кинути кубик' }) as HTMLButtonElement | null;

    it('the phone roll button sends once and disappears into the reserved slot', async () => {
      let resolve: (value: { ok: true }) => void = () => {};
      const send = vi.fn(() => new Promise<{ ok: true }>((r) => (resolve = r))) as unknown as Send;
      const { rerender } = render(<PlayerScreen view={intro(diceOf([], true))} hostOnline offsetMs={0} send={send} />);
      const slot = document.querySelector('div.dice-action')!;
      expect(slot.contains(rollButton())).toBe(true);
      fireEvent.click(rollButton()!);
      expect(send).toHaveBeenCalledWith('player:roll', undefined);
      expect(rollButton()!.disabled).toBe(true);
      fireEvent.click(rollButton()!);
      expect(send).toHaveBeenCalledTimes(1);
      await act(async () => resolve({ ok: true }));
      rerender(<PlayerScreen view={intro(diceOf([4], false))} hostOnline offsetMs={0} send={send} />);
      expect(rollButton()).toBeNull();
      expect(document.querySelector('div.dice-action')).toBe(slot);
      expect(slot.textContent).toBe('Кубик кинуто. Чекаємо інших');
    });

    it('the roll button frees itself when the ack never arrives', () => {
      vi.useFakeTimers();
      try {
        const send = vi.fn(() => new Promise<{ ok: true }>(() => {})) as unknown as Send;
        render(<PlayerScreen view={intro(diceOf([], true))} hostOnline offsetMs={0} send={send} />);
        fireEvent.click(rollButton()!);
        expect(rollButton()!.disabled).toBe(true);
        act(() => {
          vi.advanceTimersByTime(3000);
        });
        expect(rollButton()!.disabled).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('the roll button is disabled on pause and hidden for those not in the tie-break', () => {
      show(intro(diceOf([], true), { paused: true }));
      expect(rollButton()!.disabled).toBe(true);
      cleanup();
      show(intro(diceOf([3], false, { tieBreak: true })));
      expect(rollButton()).toBeNull();
      expect(document.querySelector('div.dice-action')?.textContent).toBe('Кубик кинуто. Чекаємо інших');
    });

    it('the phone intro shows the dice rows with the own row marked and then the schedule', () => {
      show(intro(diceOf([], true)));
      expect(document.querySelector('.dice-rows li.is-me')?.textContent).toContain('Олена');
      expect(screen.queryByText('Розклад ходів')).toBeNull();
      cleanup();
      const schedule = [{ number: 1, order: [olena, anna], done: 0 }];
      show(intro({ ...diceOf([5], false, { done: true, annaWaiting: false }) }, {}, { schedule }));
      expect(screen.getByText('Розклад ходів')).toBeTruthy();
      expect(document.querySelector('div.dice-action')).toBeNull();
    });
  });
});


describe('PlayerScreen: blitz cell', () => {
  const round: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: null };
  const anna = { playerId: 'p2', nickname: 'Анна' };
  const blitzBoard = (over: Partial<NonNullable<NonNullable<PlayerView['board']>['cell']>> = {}): NonNullable<PlayerView['board']> => ({
    categories: [],
    order: [anna],
    turn: { playerId: 'p2', nickname: 'Алла' },
    cell: { id: 'c1', category: 'Міста', price: 100, mark: 'none', kind: 'blitz', answerMode: 'phone', penalty: 'none', ...over },
    dice: null,
    schedule: [],
    scheduleRepeats: false,
    skipAt: null,
  });
  const blitzMe = (blitz: PlayerBlitz | null, extra = {}) => ({ ...me, blitz, ...extra });
  const canBuzz = { position: null, attemptsUsed: 0, attemptsLeft: null, canBuzz: true, deadline: null, canAnswer: false, grade: null };

  it('on a blitz cell every player gets the buzz button, the chooser too', () => {
    for (const id of ['p1', 'p2']) {
      show(onQuestion({ round, board: blitzBoard(), me: blitzMe(canBuzz, { id }) }));
      expect(screen.getByRole('button', { name: 'Відповісти' })).toBeTruthy();
      expect(screen.getByText('Бліц')).toBeTruthy();
      expect(screen.getByText('Вибір: Алла')).toBeTruthy();
      expect(screen.queryByText(/^Відповідає Алла/)).toBeNull();
      cleanup();
    }
  });

  it('on a voice blitz cell the head of the queue answers aloud', () => {
    const head = { ...canBuzz, position: 1, canBuzz: false };
    show(onQuestion({ round, board: blitzBoard({ answerMode: 'voice' }), me: blitzMe(head) }));
    expect(screen.getByText('Відповідайте вголос')).toBeTruthy();
    expect(document.querySelector('.inputs')).toBeNull();
  });

  it('a queued non-head on a voice blitz cell is not told to answer aloud', () => {
    const second = { ...canBuzz, position: 2, canBuzz: false };
    show(onQuestion({ round, board: blitzBoard({ answerMode: 'voice' }), me: blitzMe(second) }));
    expect(screen.queryByText('Відповідайте вголос')).toBeNull();
    expect(screen.getByText('Ви 2-й у черзі')).toBeTruthy();
  });

  it('labels own input only when the head answer is shown above it', () => {
    const spotlight = { playerId: 'p3', nickname: 'Віра', answer: { type: 'single' as const, optionId: 'a' }, grade: null };
    const second = { ...canBuzz, position: 2, canBuzz: false };
    show(onQuestion({ round, board: blitzBoard(), spotlight, me: blitzMe(second) }));
    expect(screen.getByText('Ваша відповідь')).toBeTruthy();
    cleanup();
    show(onQuestion({ round, board: blitzBoard(), me: blitzMe(second) }));
    expect(screen.queryByText('Ваша відповідь')).toBeNull();
  });

  it('the blitz cell reveal shows own points and the winner', () => {
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        question: publicQuestion,
        reveal: fullQuestion,
        round,
        board: blitzBoard(),
        blitz: { queue: [], winner: { playerId: 'p3', nickname: 'Віра' }, instant: false, rows: [] },
        me: blitzMe(canBuzz, { result: { accepted: false, accuracy: 0, grade: 'wrong', streakBonus: 0, points: -200 } }),
      }),
    );
    expect(screen.getByText('−200')).toBeTruthy();
    expect(screen.getByText('Першим правильно відповів: Віра')).toBeTruthy();
  });

  it('players see the penalty rule after a blitz cell opens', () => {
    show(onQuestion({ round, board: blitzBoard({ penalty: 'all' }), me: blitzMe(canBuzz) }));
    expect(screen.getByText('Мінус для всіх, хто не відповість правильно')).toBeTruthy();
    expect(screen.getByText(/Відповідає перший, хто натисне/)).toBeTruthy();
  });
});

describe('PlayerScreen: spotlight', () => {
  const round: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: null };
  const boardOf = (turn: { playerId: string; nickname: string }): NonNullable<PlayerView['board']> => ({
    categories: [],
    order: [turn],
    turn,
    cell: { id: 'c1', category: 'Міста', price: 100, mark: 'none', kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const },
    dice: null,
    schedule: [],
    scheduleRepeats: false,
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

  it('the voice chooser sees the options and answers aloud', () => {
    const mine = { playerId: 'p1', nickname: 'Олена' };
    const board = { ...boardOf(mine), cell: { ...boardOf(mine).cell!, answerMode: 'voice' as const } };
    show(onQuestion({ round, board }));
    expect(screen.getByText('Львів').closest('.choice')).not.toBeNull();
    expect(screen.getByText('Київ').closest('.choice')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Київ/ })).toBeNull();
    expect(screen.getByText('Відповідайте вголос')).toBeTruthy();
  });

  it('the voice chooser on a text cell is told to answer aloud once', () => {
    const mine = { playerId: 'p1', nickname: 'Олена' };
    const board = { ...boardOf(mine), cell: { ...boardOf(mine).cell!, answerMode: 'voice' as const } };
    show(onQuestion({ round, board, question: { ...publicQuestion, type: 'text' as const, choices: [] } }));
    expect(screen.getByText('Відповідайте вголос')).toBeTruthy();
    expect(screen.queryByText('Гравець відповідає вголос')).toBeNull();
    expect(document.querySelector('.spotlight-answer.is-waiting')).toBeNull();
  });

  it('a queued blitz player on a voice cell sees the options', () => {
    const board = { ...boardOf(anna), cell: { ...boardOf(anna).cell!, kind: 'blitz' as const, answerMode: 'voice' as const } };
    const queued = { position: 2, attemptsUsed: 0, attemptsLeft: null, canBuzz: false, deadline: null, canAnswer: false, grade: null };
    show(onQuestion({ round, board, me: { ...me, blitz: queued } }));
    expect(screen.getByText('Київ').closest('.choice')).not.toBeNull();
    expect(screen.getByText('Ви 2-й у черзі')).toBeTruthy();
  });

  it('the phone of another player blinks the verdict when the question turns to reveal', () => {
    const answer = { type: 'single' as const, optionId: 'b' };
    const at = (over: Partial<PlayerView>) => (
      <PlayerScreen view={view({ questionIndex: 0, question: publicQuestion, round, board: boardOf(anna), ...over })} hostOnline offsetMs={0} send={vi.fn()} />
    );
    const { rerender } = render(at({ phase: 'question', endsAt: Date.now() + 20_000, spotlight: { ...anna, answer, grade: null } }));
    expect(document.querySelector('.is-blinking')).toBeNull();
    rerender(at({ phase: 'reveal', reveal: fullQuestion, spotlight: { ...anna, answer, grade: 'correct' } }));
    expect(document.querySelector('.choice.is-blinking')).not.toBeNull();
  });

  it('a locked phone keeps the options with the orange answer', () => {
    const spotlight = { ...anna, answer: { type: 'single' as const, optionId: 'a' }, grade: null };
    show(view({ phase: 'locked', questionIndex: 0, question: publicQuestion, round, board: boardOf(anna), spotlight }));
    expect(screen.getByText('Львів').closest('.choice')?.className).toContain('is-pending');
    expect(screen.getByText('Чекаємо на правильну відповідь')).toBeTruthy();
  });

  it('question → locked → reveal blinks once, on reveal', () => {
    vi.useFakeTimers();
    try {
      const answer = { type: 'single' as const, optionId: 'a' };
      const at = (over: Partial<PlayerView>) => (
        <PlayerScreen view={view({ questionIndex: 0, question: publicQuestion, round, board: boardOf(anna), ...over })} hostOnline offsetMs={0} send={vi.fn()} />
      );
      const { rerender } = render(at({ phase: 'question', endsAt: Date.now() + 20_000, spotlight: { ...anna, answer, grade: null } }));
      rerender(at({ phase: 'locked', spotlight: { ...anna, answer, grade: null } }));
      expect(document.querySelector('.choice.is-pending')).not.toBeNull();
      expect(document.querySelector('.is-blinking')).toBeNull();
      rerender(at({ phase: 'reveal', reveal: fullQuestion, spotlight: { ...anna, answer, grade: 'wrong' } }));
      expect(document.querySelector('.choice.is-wrong.is-blinking')).not.toBeNull();
      act(() => vi.advanceTimersByTime(BLINK_MS));
      expect(document.querySelector('.is-blinking')).toBeNull();
      rerender(at({ phase: 'reveal', reveal: fullQuestion, spotlight: { ...anna, answer, grade: 'wrong' } }));
      expect(document.querySelector('.is-blinking')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a voice chooser sees the verdict once, in the result', () => {
    const mine = { playerId: 'p1', nickname: 'Олена' };
    const board = { ...boardOf(mine), cell: { ...boardOf(mine).cell!, answerMode: 'voice' as const } };
    const result = { accepted: true, accuracy: 1, grade: 'correct' as const, streakBonus: 0, points: 100 };
    show(view({ phase: 'reveal', questionIndex: 0, question: publicQuestion, reveal: fullQuestion, round, board, spotlight: { ...mine, answer: null, grade: 'correct' }, me: { ...me, result } }));
    expect(screen.getByText('Правильно!')).toBeTruthy();
    expect(screen.queryByText('Правильно')).toBeNull();
  });

  it('the first render with a verdict does not blink', () => {
    const spotlight = { ...anna, answer: { type: 'single' as const, optionId: 'b' }, grade: 'correct' as const };
    show(view({ phase: 'reveal', questionIndex: 0, question: publicQuestion, reveal: fullQuestion, round, board: boardOf(anna), spotlight }));
    expect(document.querySelector('.choice.is-correct')).not.toBeNull();
    expect(document.querySelector('.is-blinking')).toBeNull();
  });

  it('the chooser sees the choices with the verdict above the result', () => {
    const mine = { playerId: 'p1', nickname: 'Олена' };
    const spotlight = { ...mine, answer: { type: 'single' as const, optionId: 'b' }, grade: 'correct' as const };
    const result = { accepted: true, accuracy: 1, grade: 'correct' as const, streakBonus: 0, points: 100 };
    show(view({ phase: 'reveal', questionIndex: 0, question: publicQuestion, reveal: fullQuestion, round, board: boardOf(mine), spotlight, me: { ...me, result } }));
    const choice = screen.getByText('Київ').closest('.choice');
    expect(choice?.className).toContain('is-correct');
    const verdict = screen.getByText('Правильно!');
    expect(choice!.compareDocumentPosition(verdict) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a sent match answer with the right column names', () => {
    const matchQ = {
      ...publicQuestion,
      type: 'match' as const,
      choices: [{ id: 'a', text: 'Київ' }],
      right: [{ id: 'x', text: 'Дніпро' }],
    };
    show(onQuestion({ question: matchQ, me: { ...me, answer: { type: 'match', links: [{ left: 'a', right: 'x' }] } } }));
    expect(screen.getByText('Київ — Дніпро')).toBeTruthy();
  });
});

describe('PlayerScreen final', () => {
  const round: RoundInfo = { index: 0, total: 1, title: 'Космос', type: 'final', partial: false, description: '', brief: emptyBrief('final'), times: null };
  const info = { theme: 'Космос', placed: 0, total: 2, shown: [], left: 0 };
  const onWager = (limit: number, wager: number | null = null) =>
    view({ phase: 'wager', round, final: info, me: { ...me, score: limit, final: { wager, limit } } });

  it('places and changes a final wager within the limit', async () => {
    const send = show(onWager(400));
    expect(screen.getByText('Ваша ставка від 0 до 400')).toBeTruthy();
    const field = screen.getByLabelText('Ставка') as HTMLInputElement;
    expect(field.getAttribute('max')).toBe('400');
    fireEvent.change(field, { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Поставити' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:wager', { amount: 300 }));
    cleanup();
    show(onWager(400, 300));
    expect(screen.getByText('Ваша ставка: 300')).toBeTruthy();
    expect(screen.getByLabelText('Ставка')).toBeTruthy();
  });

  it('the wager field is styled, has a placeholder and the button waits for a valid amount', () => {
    show(onWager(400));
    const field = screen.getByLabelText('Ставка') as HTMLInputElement;
    expect(field.closest('label')?.className).toContain('field');
    expect(field.getAttribute('placeholder')).toBe('0–400');
    const place = screen.getByRole('button', { name: 'Поставити' }) as HTMLButtonElement;
    expect(place.disabled).toBe(true);
    fireEvent.change(field, { target: { value: '401' } });
    expect(place.disabled).toBe(true);
    fireEvent.change(field, { target: { value: '-1' } });
    expect(place.disabled).toBe(true);
    fireEvent.change(field, { target: { value: '1.5' } });
    expect(place.disabled).toBe(true);
    fireEvent.change(field, { target: { value: '0' } });
    expect(place.disabled).toBe(false);
    fireEvent.change(field, { target: { value: '400' } });
    expect(place.disabled).toBe(false);
  });

  it('shows the server wager error under the form', async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: 'wager_invalid' }));
    show(onWager(400), { send });
    fireEvent.change(screen.getByLabelText('Ставка'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Поставити' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Ставка має бути цілим числом від 0 до вашого рахунку.');
  });

  it('a player with no points can only wager zero', async () => {
    const send = show(onWager(0));
    expect(screen.queryByLabelText('Ставка')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Поставити 0' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:wager', { amount: 0 }));
  });

  it('a player waits for their own reveal, then sees the signed wager', () => {
    const base = { phase: 'reveal' as const, round, final: info, question: publicQuestion, reveal: fullQuestion, questionIndex: 0 };
    show(view({ ...base, me: { ...me, score: 700, final: { wager: 300, limit: 700 } } }));
    expect(screen.getByText('Чекаємо на розкриття')).toBeTruthy();
    cleanup();
    const result = { accepted: true, accuracy: 1, grade: 'correct' as const, streakBonus: 0, points: 300 };
    show(view({ ...base, me: { ...me, score: 1000, result, final: { wager: 300, limit: 700 } } }));
    expect(screen.getByText('+300')).toBeTruthy();
    expect(screen.queryByText('Чекаємо на розкриття')).toBeNull();
  });

  it('the final question shows no points', () => {
    show(onQuestion({ round, final: info, me: { ...me, final: { wager: 100, limit: 100 } } }));
    expect(screen.queryByText(/1000/)).toBeNull();
    expect(screen.getByRole('button', { name: /Київ/ })).toBeTruthy();
  });

  it('a chain question shows the own chain and the personal timer instead of the shared one', () => {
    const chainQuestion = { ...publicQuestion, type: 'chain' as const, choices: [], chain: { first: 'Форель', masks: [['Р', null, null, null]], hintSeconds: 5 } };
    const chain = { solved: 0, masks: [['Р', null, null, null]], hints: 0, hintMs: 5000, canHint: true, deadline: Date.now() + 15_000, remainingMs: null, limitMs: 20_000, timeMs: null };
    show(onQuestion({ question: chainQuestion, endsAt: Date.now() + 20_000, me: { ...me, chain } }));
    expect(screen.getAllByRole('timer')).toHaveLength(1);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('15');
    expect(screen.getByLabelText('Р___')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Перевірити' })).toBeTruthy();
  });

  it('the reveal of a chain says the own time', () => {
    const chainQuestion = { ...publicQuestion, type: 'chain' as const, choices: [], chain: { first: 'Форель', masks: [['Р', null, null, null]], hintSeconds: 5 } };
    const chain = { solved: 1, masks: [['Р', 'и', 'б', 'а']], hints: 0, hintMs: 5000, canHint: false, deadline: null, remainingMs: null, limitMs: 20_000, timeMs: 12_300 };
    show(view({ phase: 'reveal', questionIndex: 0, question: chainQuestion, me: { ...me, chain } }));
    expect(screen.getByText('Ланцюжок пройдено за 12,3 с')).toBeTruthy();
  });

  it('after a chain closes the phone shows the own result and waits for the results, not a correct answer', () => {
    const chainQuestion = { ...publicQuestion, type: 'chain' as const, choices: [], chain: { first: 'Форель', masks: [['Р', null, null, null]], hintSeconds: 5 } };
    const done = { solved: 1, masks: [['Р', 'и', 'б', 'а']], hints: 0, hintMs: 5000, canHint: false, deadline: null, remainingMs: null, limitMs: 20_000, timeMs: 5_800 };
    show(view({ phase: 'locked', questionIndex: 0, question: chainQuestion, me: { ...me, chain: done } }));
    expect(screen.getByRole('heading', { name: 'Ланцюжок пройдено за 5,8 с' })).toBeTruthy();
    expect(screen.getByLabelText('Риба')).toBeTruthy();
    expect(screen.getByText('Чекаємо на результати')).toBeTruthy();
    expect(screen.queryByText('Чекаємо на правильну відповідь')).toBeNull();
    cleanup();
    show(view({ phase: 'locked', questionIndex: 0, question: chainQuestion, me: { ...me, chain: { ...done, solved: 0, masks: [['Р', null, null, null]], timeMs: null } } }));
    expect(screen.getByRole('heading', { name: 'Не встигли пройти ланцюжок' })).toBeTruthy();
  });
});

describe('PlayerScreen round facts', () => {
  const round: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: { min: 20, max: 20 } };

  it('the phone intro shows the round facts', () => {
    show(view({ phase: 'intro', total: 24, round }));
    expect(screen.getByText('24 клітинки · 20 с на кожну')).toBeTruthy();
  });

  it('a board question shows the cell count and what is left', () => {
    show(view({ phase: 'question', round, questionIndex: 4, total: 24, question: publicQuestion, endsAt: null, remainingMs: 20_000, limitMs: 20_000 }));
    expect(screen.getByText('Клітинка 5 з 24 · лишилося 19')).toBeTruthy();
    expect(screen.getByText('/ 20 с')).toBeTruthy();
  });
});
