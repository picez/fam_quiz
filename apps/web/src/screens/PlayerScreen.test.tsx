// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyBrief, type BlitzRow, type PlayerActiveBuff, type PlayerBlitz, PlayerView, Question, RoundInfo } from '@quiz/shared';
import type { Send } from '../live/types';
import { PlayerScreen } from './PlayerScreen';
import { BLINK_MS } from './verdict-blink';
import { baseMe, teamPlayerView } from './team-test-view';

afterEach(cleanup);

const publicQuestion = {
  type: 'single' as const,
  text: 'Столиця України?',
  imageUrl: null,
  video: null,
  timeLimit: 20,
  points: 1000,
  right: [], chain: null, sort: null, orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
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

const me = { id: 'p1', nickname: 'Олена', score: 0, rank: null, answer: null, result: null, blitz: null, final: null, wipeout: null, survival: null, ladder: null, chain: null, sort: null, survey: null, bluff: null, debuff: null, shop: null, duel: null, buffs: null, overtime: null, tip: null, vote: null, wall: null };

const view = (over: Partial<PlayerView> = {}): PlayerView => ({
  role: 'player',
  phase: 'lobby',
  paused: false,
  blitz: null,
  board: null,
  spotlight: null,
  final: null,
  wipeout: null,
  survival: null,
  ladder: null,
  chain: null,
  sort: null,
  wall: null,
  survey: null,
  bluff: null,
  notice: null,
  buffs: [],
  buffNotice: null,
  debuffNotice: null,
  removed: [],
  splash: null,
  overtime: [],
  guide: null,
  newcomers: false,
  teams: null,
  duel: null,
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
  table: null,
  team: null,
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
  it('a debuffed question wraps the answer area; other phones get the same zone without a debuff', () => {
    const classes = () => [...document.querySelector('main')!.children].map((el) => el.className);
    show(onQuestion({ me: { ...me, debuff: { kind: 'mirror', since: Date.now(), by: null } } }));
    const zone = document.querySelector('[data-debuff="mirror"]')!;
    expect(zone).not.toBeNull();
    expect(zone.querySelector('h1.question')).not.toBeNull();
    expect(zone.querySelectorAll('.choice')).toHaveLength(2);
    const debuffed = classes();
    cleanup();
    show(onQuestion());
    expect(document.querySelector('.debuff-zone')).not.toBeNull();
    expect(document.querySelector('[data-debuff]')).toBeNull();
    expect(document.querySelector('.debuff-zone h1.question')).not.toBeNull();
    // Спершу — постійний (порожній) стовпчик сповіщень і живий регіон аркуша голосування (невидимий).
    expect(classes()).toEqual(['live-notices', 'sr-only vote-live', 'bar', 'question-head', 'debuff-zone']);
    expect(debuffed).toEqual(['live-notices', 'sr-only vote-live', 'bar', 'question-head', 'debuff-zone is-mirror']);
  });

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

  it('the phone shows a long description whole, without clipping', () => {
    show(view({ phase: 'intro', round: { ...round, description: 'а'.repeat(600) } }));
    expect(screen.getByText('а'.repeat(600))).toBeTruthy();
    expect(document.querySelector('.is-fit')).toBeNull();
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
      marks: [],
      marksHidden: false,
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

    it('the chooser of a voice cell has the buff row, the buff panel and the struck-through removed options', () => {
      const four = { ...publicQuestion, choices: [...publicQuestion.choices, { id: 'c', text: 'Одеса' }, { id: 'd', text: 'Харків' }] };
      const voiceCell = boardOf('p1', { cell: { ...cell, answerMode: 'voice' } });
      const activeOf = (kind: 'fifty' | 'hint', removed: string[]) => ({ kind, removed, retry: null, first: null, hint: null, votes: null, spare: false });
      const buffsOf = (kind: 'fifty' | 'hint', removed: string[]) => ({
        slots: [
          { kind: 'fifty' as const, state: kind === 'fifty' ? ('active' as const) : ('blocked' as const), block: kind === 'fifty' ? null : ('taken' as const) },
          { kind: 'hint' as const, state: kind === 'hint' ? ('active' as const) : ('blocked' as const), block: kind === 'hint' ? null : ('taken' as const) },
        ],
        active: activeOf(kind, removed),
      });
      show(onQuestion({ round, question: four, board: voiceCell, removed: ['a', 'c'], me: { ...me, buffs: buffsOf('fifty', ['a', 'c']) } }));
      expect(screen.getByText('Відповідайте вголос')).toBeTruthy();
      expect(document.querySelectorAll('.buff-row button')).toHaveLength(2);
      expect([...document.querySelectorAll('.choice.is-removed')].map((li) => li.textContent)).toEqual(['AЛьвівприбрано', 'CОдесаприбрано']);
      cleanup();
      show(onQuestion({ round, question: four, board: voiceCell, me: { ...me, buffs: buffsOf('hint', []) } }));
      expect(document.querySelector('.buff-row')).not.toBeNull();
      expect(document.querySelector('.buff-panel')).not.toBeNull();
    });

    it('a watcher of a board cell sees the removed options too', () => {
      const four = { ...publicQuestion, choices: [...publicQuestion.choices, { id: 'c', text: 'Одеса' }, { id: 'd', text: 'Харків' }] };
      show(onQuestion({ round, question: four, board: boardOf('p2', { cell }), removed: ['b'] }));
      expect([...document.querySelectorAll('.choice.is-removed')].map((li) => li.textContent)).toEqual(['BКиївприбрано']);
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

    it('under the «Раунд N» splash the roll and duel buttons are off: no blind taps through the layer', () => {
      vi.useFakeTimers();
      try {
        const now = Date.now();
        const send = vi.fn(async () => ({ ok: true as const })) as unknown as Send;
        const rights = { canDeclare: true, opponents: [anna] };
        const splashing = intro(diceOf([], true), {
          splash: { kind: 'round', at: now, until: now + 2500 },
          me: { ...view().me, duel: { rights, tries: [], canAnswer: false, canPick: false } },
        });
        render(<PlayerScreen view={splashing} hostOnline offsetMs={0} send={send} />);
        expect(rollButton()!.disabled).toBe(true);
        expect(screen.getByRole<HTMLButtonElement>('button', { name: '⚔ Дуель' }).disabled).toBe(true);
        fireEvent.click(rollButton()!);
        expect(send).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(2600));
        expect(rollButton()!.disabled).toBe(false);
        expect(screen.getByRole<HTMLButtonElement>('button', { name: '⚔ Дуель' }).disabled).toBe(false);
      } finally {
        vi.useRealTimers();
      }
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

    it('a late answer from a timed-out roll does not free a newer roll in flight', async () => {
      vi.useFakeTimers();
      try {
        const resolvers: Array<(value: { ok: true }) => void> = [];
        const send = vi.fn(() => new Promise<{ ok: true }>((r) => resolvers.push(r))) as unknown as Send;
        render(<PlayerScreen view={intro(diceOf([], true))} hostOnline offsetMs={0} send={send} />);
        fireEvent.click(rollButton()!);
        act(() => {
          vi.advanceTimersByTime(3000);
        });
        expect(rollButton()!.disabled).toBe(false);
        fireEvent.click(rollButton()!);
        expect(send).toHaveBeenCalledTimes(2);
        expect(rollButton()!.disabled).toBe(true);
        // Відповідь першого кидка приходить запізно: другий кидок ще летить, кнопка лишається вимкненою.
        await act(async () => resolvers[0]!({ ok: true }));
        expect(rollButton()!.disabled).toBe(true);
        await act(async () => resolvers[1]!({ ok: true }));
        expect(rollButton()!.disabled).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('no state update after the roll button unmounts', async () => {
      vi.useFakeTimers();
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        let resolve: (value: { ok: false; error: string }) => void = () => {};
        const send = vi.fn(() => new Promise<{ ok: false; error: string }>((r) => (resolve = r))) as unknown as Send;
        const { unmount } = render(<PlayerScreen view={intro(diceOf([], true))} hostOnline offsetMs={0} send={send} />);
        fireEvent.click(rollButton()!);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
        await act(async () => resolve({ ok: false, error: 'not-allowed' }));
        act(() => {
          vi.advanceTimersByTime(3000);
        });
        expect(error).not.toHaveBeenCalled();
      } finally {
        error.mockRestore();
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
    marks: [],
    marksHidden: false,
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
    marks: [],
    marksHidden: false,
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
  const info = { theme: 'Космос', placed: 0, total: 2, shown: [], left: 0, mode: 'classic' as const, bank: 0, split: null };
  const onWager = (limit: number, wager: number | null = null) =>
    view({ phase: 'wager', round, final: info, me: { ...me, score: limit, final: { wager, limit, allIn: false } } });

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
    show(view({ ...base, me: { ...me, score: 700, final: { wager: 300, limit: 700, allIn: false } } }));
    expect(screen.getByText('Чекаємо на розкриття')).toBeTruthy();
    cleanup();
    const result = { accepted: true, accuracy: 1, grade: 'correct' as const, streakBonus: 0, points: 300 };
    show(view({ ...base, me: { ...me, score: 1000, result, final: { wager: 300, limit: 700, allIn: false } } }));
    expect(screen.getByText('+300')).toBeTruthy();
    expect(screen.queryByText('Чекаємо на розкриття')).toBeNull();
  });

  it('all-in places the whole limit at once', async () => {
    const send = show(onWager(1000));
    fireEvent.click(screen.getByRole('button', { name: 'Ва-банк' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:wager', { amount: 1000, allIn: true }));
    cleanup();
    show(view({ phase: 'wager', round, final: info, me: { ...me, score: 1000, final: { wager: 1000, limit: 1000, allIn: true } } }));
    expect(screen.getByText('Ваша ставка: 1000 — ва-банк!')).toBeTruthy();
    cleanup();
    show(onWager(0));
    expect(screen.queryByRole('button', { name: 'Ва-банк' })).toBeNull();
  });

  it('the wager form explains the bank', () => {
    const bank = (mode: 'bank' | 'classic') =>
      view({ phase: 'wager', round, final: { ...info, mode }, me: { ...me, score: 400, final: { wager: null, limit: 400, allIn: false } } });
    show(bank('bank'));
    expect(screen.getByText('Спільний банк: помилка віддає ставку в банк, правильні відповіді його ділять.')).toBeTruthy();
    cleanup();
    show(bank('classic'));
    expect(screen.queryByText(/Спільний банк/)).toBeNull();
  });

  it('the bank result line keeps its place', () => {
    const base = { phase: 'reveal' as const, round, question: publicQuestion, reveal: fullQuestion, questionIndex: 0 };
    const state = (grade: 'correct' | 'wrong', points: number, split: object | null, wager = 500) =>
      view({
        ...base,
        final: { ...info, mode: 'bank' as const, bank: 500, split: split as never },
        me: { ...me, score: 1000, result: { accepted: true, accuracy: grade === 'correct' ? 1 : 0, grade, streakBonus: 0, points }, final: { wager, limit: 1000, allIn: false } },
      });
    const note = () => document.querySelectorAll('.wager-note');
    show(state('wrong', -500, null));
    expect(screen.getByText('Ставка пішла в банк')).toBeTruthy();
    expect(note()).toHaveLength(1);
    cleanup();
    show(state('correct', 0, null));
    expect(screen.getByText('Ставку збережено — чекаємо на розподіл банку')).toBeTruthy();
    expect(note()).toHaveLength(1);
    cleanup();
    show(state('correct', 667, { bank: 1000, refund: false, shares: [{ playerId: 'p1', nickname: 'Олена', wager: 500, share: 667 }] }));
    expect(screen.getByText('+667 з банку')).toBeTruthy();
    expect(note()).toHaveLength(1);
    cleanup();
    show(state('wrong', 0, { bank: 500, refund: true, shares: [] }));
    expect(screen.getByText('Ніхто не відповів правильно — ставки повертаються')).toBeTruthy();
    expect(note()).toHaveLength(1);
    cleanup();
    show(state('correct', 0, { bank: 500, refund: false, shares: [] }, 0));
    expect(screen.getByText('Ставка 0 — частки з банку немає')).toBeTruthy();
  });

  it('the bank note stays honest in the edge cases', () => {
    const base = { phase: 'reveal' as const, round, question: publicQuestion, reveal: fullQuestion, questionIndex: 0 };
    const state = (grade: 'correct' | 'wrong', wager: number, final: object) =>
      view({
        ...base,
        final: { ...info, mode: 'bank' as const, ...final },
        me: { ...me, score: 1000, result: { accepted: grade === 'correct', accuracy: grade === 'correct' ? 1 : 0, grade, streakBonus: 0, points: 0 }, final: { wager, limit: 1000, allIn: false } },
      });
    const note = () => document.querySelector('.wager-note')?.textContent;
    // Переможець зі ставкою 0 ще до розподілу: частки не буде.
    show(state('correct', 0, { bank: 500, left: 1, split: null }));
    expect(note()).toBe('Ставка 0 — частки з банку немає');
    cleanup();
    // Усі праві: банк порожній, кроку розподілу не буде — чекати нічого.
    show(state('correct', 500, { bank: 0, left: 0, split: null }));
    expect(note()).toBe('Ставку збережено');
    cleanup();
    // Поки не всіх розкрито, банк ще може вирости.
    show(state('correct', 500, { bank: 0, left: 2, split: null }));
    expect(note()).toBe('Ставку збережено — чекаємо на розподіл банку');
    cleanup();
    // Правильна відповідь (зі ставкою 0) при поверненні: нейтрально, без «ніхто не відповів правильно».
    show(state('correct', 0, { bank: 500, left: 0, split: { bank: 500, refund: true, shares: [] } }));
    expect(note()).toBe('Ставки повертаються');
    cleanup();
    // Програвший зі ставкою 0 нічого в банк не віддав.
    show(state('wrong', 0, { bank: 0, left: 1, split: null }));
    expect(note()).toBe('Ставка 0 — рахунок без змін');
    cleanup();
    show(state('wrong', 300, { bank: 300, left: 1, split: null }));
    expect(note()).toBe('Ставка пішла в банк');
  });

  it('the final question shows no points', () => {
    show(onQuestion({ round, final: info, me: { ...me, final: { wager: 100, limit: 100, allIn: false } } }));
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

  it('every phone shows the adjustment notice', () => {
    show(view({ notice: { seq: 3, at: Date.now(), nickname: 'Тарас', points: -100 } }));
    expect(screen.getByText('Ведучий: −100 — Тарас')).toBeTruthy();
  });
});

describe('PlayerScreen: sort', () => {
  const sortQ = {
    ...publicQuestion,
    type: 'sort' as const,
    text: 'Розкладіть',
    points: 100,
    choices: [],
    sort: { categories: [{ id: 'c1', text: 'Овочі' }, { id: 'c2', text: 'Фрукти' }], total: 4, lockSeconds: 3 },
  };
  const fullSort: Question = {
    id: 'q1',
    type: 'sort',
    text: 'Розкладіть',
    imageUrl: null,
    video: null,
    timeLimit: 60,
    points: 100,
    categories: [{ id: 'c1', text: 'Овочі' }, { id: 'c2', text: 'Фрукти' }],
    words: [
      { id: 'w1', text: 'Морква', categoryId: 'c1' },
      { id: 'w2', text: 'Яблуко', categoryId: 'c2' },
      { id: 'w3', text: 'Буряк', categoryId: 'c1' },
      { id: 'w4', text: 'Груша', categoryId: 'c2' },
    ],
    lockSeconds: 3,
  };
  const mine = {
    card: { id: 'w1', text: 'Морква' },
    sorted: 0,
    total: 4,
    misses: 0,
    lockedUntil: null,
    lockRemainingMs: null,
    missed: null,
    canSort: true,
    timeMs: null,
    watched: false,
    marks: null,
    live: null,
  };
  const boardRound: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: null };
  const blitzRound: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false, description: '', brief: emptyBrief('blitz'), times: null };
  const olya = { playerId: 'p2', nickname: 'Оля' };
  const sortBoard: NonNullable<PlayerView['board']> = {
    categories: [],
    order: [olya],
    turn: olya,
    cell: { id: 'k1', category: 'Сад', price: 400, mark: 'none', kind: 'normal', answerMode: 'phone', penalty: 'none' },
    dice: null,
    schedule: [],
    scheduleRepeats: false,
    skipAt: null,
    marks: [],
    marksHidden: false,
  };
  const info = (over = {}) => ({ total: 4, rows: [{ playerId: 'p2', nickname: 'Оля', sorted: 2, misses: 0, timeMs: null, points: null, ...over }], winner: null, words: null, live: null });

  it('a sort question on the phone', () => {
    const send = show(onQuestion({ question: sortQ, sort: info(), me: { ...me, sort: mine } }));
    expect(document.querySelector('.debuff-zone .sort-play')).not.toBeNull();
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByText('100 балів за слово')).toBeTruthy();
    expect(document.querySelector('.sort-card')?.textContent).toBe('Морква');
    expect(document.querySelector('.inputs')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Категорія «Фрукти»' }));
    expect(send).toHaveBeenCalledWith('player:sort', { wordId: 'w1', categoryId: 'c2' });
  });

  it('the per-word price uses the right plural and is gone in a final', () => {
    show(onQuestion({ question: { ...sortQ, points: 2 }, sort: info(), me: { ...me, sort: mine } }));
    expect(screen.getByText('2 бали за слово')).toBeTruthy();
    cleanup();
    show(onQuestion({ question: { ...sortQ, points: 1 }, sort: info(), me: { ...me, sort: mine } }));
    expect(screen.getByText('1 бал за слово')).toBeTruthy();
    cleanup();
    const finalRound: RoundInfo = { index: 0, total: 1, title: 'Фінал', type: 'final', partial: false, description: '', brief: emptyBrief('final'), times: null };
    show(onQuestion({ round: finalRound, question: sortQ, sort: null, me: { ...me, sort: mine } }));
    expect(document.querySelector('.sort-play')).not.toBeNull();
    expect(document.querySelector('.sort-points')).toBeNull();
    expect(screen.queryByText(/за слово/)).toBeNull();
  });

  it('a board sort: the chooser plays, the others watch', () => {
    show(onQuestion({ round: boardRound, board: sortBoard, question: sortQ, sort: info(), me: { ...me, sort: null } }));
    expect(screen.getByText('Оля сортує слова')).toBeTruthy();
    expect(screen.getByText('2 з 4')).toBeTruthy();
    expect(screen.getByText('Овочі')).toBeTruthy();
    expect(screen.getByText('Фрукти')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Категорія/ })).toBeNull();
    expect(document.querySelector('.sort-card')).toBeNull();
    expect(document.querySelector('.inputs')).toBeNull();
    expect(screen.queryByText(/Відповідає Оля/)).toBeNull();
  });

  it('a watcher sees all words on the board and how they fall into the categories at the reveal', () => {
    const words = [{ id: 'w3', text: 'Буряк' }, { id: 'w4', text: 'Груша' }, { id: 'w1', text: 'Морква' }, { id: 'w2', text: 'Яблуко' }];
    show(onQuestion({ round: boardRound, board: sortBoard, question: sortQ, sort: { ...info(), words }, me: { ...me, sort: null } }));
    expect([...document.querySelectorAll('.sort-words li')].map((li) => li.textContent)).toEqual(['Буряк', 'Груша', 'Морква', 'Яблуко']);
    cleanup();
    show(view({ phase: 'reveal', questionIndex: 0, round: boardRound, board: sortBoard, question: sortQ, sort: { ...info({ points: 200 }), words }, reveal: fullSort, me: { ...me, sort: null } }));
    expect(document.querySelectorAll('.sort-reveal.is-open li')).toHaveLength(4);
    expect(document.querySelectorAll('.sort-reveal-col')).toHaveLength(2);
    expect(document.querySelector('.sort-words')).toBeNull();
  });

  describe('live sort (11d)', () => {
    const liveOf = (over = {}) => ({
      sorterId: 'p2',
      nickname: 'Оля',
      card: { id: 'w3', text: 'Буряк' },
      missed: null,
      lockedUntil: null,
      lockRemainingMs: null,
      sorted: 0,
      total: 4,
      misses: 0,
      timeMs: null,
      seq: 0,
      columns: [{ id: 'c1', words: [] }, { id: 'c2', words: [] }],
      last: null,
      marks: null,
      ...over,
    });

    it('a board watcher sees the chooser card, not an interactive one', () => {
      show(onQuestion({ round: boardRound, board: sortBoard, question: sortQ, sort: { ...info(), live: liveOf() }, me: { ...me, sort: null } }));
      expect(document.querySelector('.sort-live-card')?.textContent).toBe('Буряк');
      expect(document.querySelector('.sort-card')).toBeNull();
    });

    it('the chooser plays with the own card', () => {
      show(onQuestion({ round: boardRound, board: sortBoard, question: sortQ, sort: info(), me: { ...me, sort: { ...mine, watched: true } } }));
      expect(document.querySelector('.sort-card')?.textContent).toBe('Морква');
      expect(document.querySelector('.sort-live-card')).toBeNull();
    });

    it('the classic reveal shows the own marks', () => {
      const marks = [{ wordId: 'w1', misses: 1, late: false }, { wordId: 'w4', misses: 0, late: true }];
      show(view({ phase: 'reveal', questionIndex: 0, question: sortQ, sort: info(), reveal: fullSort, me: { ...me, sort: { ...mine, card: null, sorted: 3, canSort: false, marks } } }));
      expect(document.querySelector('.sort-reveal.is-open .sort-mark')?.textContent).toBe('✗1');
      const late = [...document.querySelectorAll('li.is-late')];
      expect(late).toHaveLength(1);
      expect(late[0].textContent).toContain('не встиг');
    });

    it('a board watcher sees the chooser marks at the reveal', () => {
      const marks = [{ wordId: 'w2', misses: 2, late: false }];
      show(view({ phase: 'reveal', questionIndex: 0, round: boardRound, board: sortBoard, question: sortQ, sort: { ...info(), live: liveOf({ card: null, marks }) }, reveal: fullSort, me: { ...me, sort: null } }));
      expect(document.querySelector('.sort-reveal.is-open .sort-mark')?.textContent).toBe('✗2');
    });
  });

  it('after the sort the phone shows the own result and later the grouping', () => {
    show(view({ phase: 'locked', questionIndex: 0, question: sortQ, sort: info(), me: { ...me, sort: { ...mine, card: null, sorted: 4, canSort: false, timeMs: 8000 } } }));
    expect(screen.getByRole('heading', { name: 'Усі слова відсортовано за 8,0 с' })).toBeTruthy();
    expect(screen.getByText('Чекаємо на розкриття')).toBeTruthy();
    expect(screen.queryByText('Чекаємо на правильну відповідь')).toBeNull();
    cleanup();
    show(view({ phase: 'locked', questionIndex: 0, question: sortQ, sort: info(), me: { ...me, sort: { ...mine, sorted: 3, canSort: false } } }));
    expect(screen.getByRole('heading', { name: 'Час вийшов: відсортовано 3 з 4' })).toBeTruthy();
    cleanup();
    show(view({ phase: 'locked', round: blitzRound, questionIndex: 0, question: sortQ, sort: { ...info(), winner: olya }, me: { ...me, sort: { ...mine, sorted: 3, canSort: false } } }));
    expect(screen.getByText('Найшвидше все відсортовано: Оля')).toBeTruthy();
    cleanup();
    show(view({ phase: 'locked', round: blitzRound, questionIndex: 0, question: sortQ, sort: info(), me: { ...me, sort: { ...mine, sorted: 3, canSort: false } } }));
    expect(screen.getByText('Ніхто не встиг відсортувати всі слова')).toBeTruthy();
    cleanup();
    const result = { accepted: true, accuracy: 1, grade: 'correct' as const, streakBonus: 0, points: 400 };
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        question: sortQ,
        sort: info({ points: 400 }),
        reveal: fullSort,
        me: { ...me, result, sort: { ...mine, card: null, sorted: 4, canSort: false, timeMs: 8000 } },
      }),
    );
    expect(screen.getByText('Правильна відповідь: Овочі: Морква, Буряк; Фрукти: Яблуко, Груша')).toBeTruthy();
    expect(screen.getByText('+400')).toBeTruthy();
    expect(screen.getByText('Усі слова відсортовано за 8,0 с')).toBeTruthy();
    expect(document.querySelector('.sort-columns')).toBeNull();
  });

  it('the duel button sits in the header and moves nothing', () => {
    const rights = { canDeclare: true, opponents: [{ playerId: 'p2', nickname: 'Петро' }] };
    const duel = { rights: null, tries: [], canAnswer: false, canPick: false };
    const classes = () => [...document.querySelector('main')!.children].map((el) => el.className);
    show(onQuestion({ me: { ...me, duel } }));
    const without = classes();
    expect(screen.queryByRole('button', { name: '⚔ Дуель' })).toBeNull();
    cleanup();
    show(onQuestion({ me: { ...me, duel: { ...duel, rights } } }));
    const button = screen.getByRole('button', { name: '⚔ Дуель' });
    expect(button.closest('header.bar')).not.toBeNull();
    expect(classes()).toEqual(without);
    expect(document.querySelector('h1.question')?.textContent).toBe('Столиця України?');
  });

  it('a declared duel shows the banner next to the toast, outside the page flow', () => {
    const declared = {
      challenger: { playerId: 'p2', nickname: 'Петро' },
      opponent: { playerId: 'p3', nickname: 'Іра' },
      stage: 'declared' as const,
      categories: [{ id: 'dc1', title: 'Столиці', left: 3 }],
      category: null,
      number: 0,
      total: 3,
      question: null,
      accepted: null,
      wins: { challenger: 0, opponent: 0 },
      tries: { challenger: 0, opponent: 0 },
      questionWinner: null,
      winningAnswer: null,
      winner: null,
      stake: 300,
      ending: false,
    };
    show(onQuestion({ duel: declared }));
    expect(document.querySelector('.duel-banner')?.textContent).toBe('⚔ Дуель: Петро — Іра. Почнеться після цього запитання.');
    expect(screen.getByRole('button', { name: /Київ/ })).toBeTruthy();
  });

  it('phase duel shows the duel instead of the game', () => {
    const running = {
      challenger: { playerId: 'p1', nickname: 'Олена' },
      opponent: { playerId: 'p2', nickname: 'Петро' },
      stage: 'question' as const,
      categories: [{ id: 'dc1', title: 'Столиці', left: 2 }],
      category: 'Столиці',
      number: 1,
      total: 3,
      question: 'Столиця Франції?',
      accepted: null,
      wins: { challenger: 0, opponent: 0 },
      tries: { challenger: 0, opponent: 0 },
      questionWinner: null,
      winningAnswer: null,
      winner: null,
      stake: 300,
      ending: false,
    };
    show(
      view({
        phase: 'duel',
        duel: running,
        endsAt: Date.now() + 20_000,
        limitMs: 30_000,
        notice: { seq: 1, at: Date.now(), nickname: 'Тарас', points: 100 },
        me: { ...me, score: 700, duel: { rights: null, tries: [], canAnswer: true, canPick: false } },
      }),
    );
    expect(screen.getByRole('heading', { name: 'Дуель' })).toBeTruthy();
    expect(screen.getByText('Олена 0 : 0 Петро')).toBeTruthy();
    expect(screen.getByLabelText('Ваша відповідь')).toBeTruthy();
    expect(document.querySelector('header.bar .score')?.textContent).toBe('700');
    expect(document.querySelector('.live-notice')).not.toBeNull();
  });

  const buffs = {
    slots: [
      { kind: 'fifty' as const, state: 'ready' as const, block: null },
      { kind: 'double' as const, state: 'ready' as const, block: null },
    ],
    active: null,
  };

  it('the buff row sits under the question for the whole question', () => {
    show(onQuestion({ me: { ...me, buffs } }));
    const zone = document.querySelector('.debuff-zone')!;
    const row = zone.querySelector('.buff-row');
    expect(row).not.toBeNull();
    expect(row!.querySelectorAll('button')).toHaveLength(2);
    // Ряд — після тексту запитання й перед варіантами.
    const children = [...zone.querySelectorAll('h1.question, .buff-row, .choice')];
    expect(children[0].tagName).toBe('H1');
    expect(children[1].className).toBe('buff-row');
    cleanup();
    show(onQuestion());
    expect(document.querySelector('.buff-row')).toBeNull();
    expect(document.querySelector('.buff-why')).toBeNull();
    cleanup();
    show(view({ phase: 'locked', questionIndex: 0, question: publicQuestion, me: { ...me, buffs } }));
    expect(document.querySelector('.buff-row')).toBeNull();
  });

  it('50/50 fades the removed options on the phone, the second try asks again', () => {
    show(onQuestion({ me: { ...me, buffs: { ...buffs, active: { kind: 'fifty', removed: ['a'], retry: null, first: null, hint: null, votes: null, spare: false } } } }));
    const lviv = screen.getByRole('button', { name: 'Львів — прибрано' }) as HTMLButtonElement;
    expect(lviv.disabled).toBe(true);
    expect(lviv.className).toContain('is-removed');
    cleanup();
    const first = { answer: { type: 'single' as const, optionId: 'a' }, points: 0 };
    show(onQuestion({ me: { ...me, buffs: { ...buffs, active: { kind: 'retry', removed: [], retry: 'again', first, hint: null, votes: null, spare: false } } } }));
    expect(screen.getByText('Неправильно, ще одна спроба')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Київ/ })).toBeTruthy();
    cleanup();
    show(onQuestion({ me: { ...me, buffs: { ...buffs, active: { kind: 'retry', removed: [], retry: 'choice', first: { ...first, points: 75 }, hint: null, votes: null, spare: false } } } }));
    expect(screen.getByRole('button', { name: 'Залишити' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Київ/ })).toBeNull();
    cleanup();
    // На паузі вибір чекає.
    show(onQuestion({ paused: true, me: { ...me, buffs: { ...buffs, active: { kind: 'retry', removed: [], retry: 'choice', first: { ...first, points: 75 }, hint: null, votes: null, spare: false } } } }));
    expect((screen.getByRole('button', { name: 'Залишити' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Ще спроба' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("another player's buff only shows a fixed notice", () => {
    const before = onQuestion({ me: { ...me, buffs } });
    const send = vi.fn(async () => ({ ok: true as const }));
    const { rerender } = render(<PlayerScreen view={before} hostOnline offsetMs={0} send={send} />);
    const shape = () => [...document.querySelector('main')!.querySelectorAll('*')].filter((el) => !el.closest('.live-notice')).map((el) => el.tagName + '.' + el.className);
    const was = shape();
    rerender(
      <PlayerScreen
        view={{ ...before, buffs: [{ playerId: 'p2', nickname: 'Петро', kind: 'double' }], buffNotice: { seq: 1, at: Date.now(), playerId: 'p2', nickname: 'Петро', kind: 'double', questionIndex: 0 } }}
        hostOnline
        offsetMs={0}
        send={send}
      />,
    );
    expect(document.querySelector('.live-notice')?.textContent).toBe('Петро: Подвійні бали');
    expect(document.querySelector('.live-notice')?.className).toContain('is-buff');
    expect(shape()).toEqual(was);
  });

  it('extra time shows my own timer', () => {
    const now = Date.now();
    show(onQuestion({ endsAt: now - 1000, me: { ...me, buffs: { ...buffs, active: { kind: 'time', removed: [], retry: null, first: null, hint: null, votes: null, spare: false } }, overtime: { deadline: now + 24_000, remainingMs: null } } }));
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('24');
    expect(screen.getByText('+30 с — ваш час')).toBeTruthy();
    expect(screen.queryByText(/Чекаємо/)).toBeNull();
  });

  it('my own clock is measured against the limit plus my extra time', () => {
    const now = Date.now();
    const active = { kind: 'time' as const, removed: [], retry: null, first: null, hint: null, votes: null, spare: false };
    const { container } = render(
      <PlayerScreen
        view={onQuestion({ endsAt: now - 1000, limitMs: 20_000, me: { ...me, buffs: { ...buffs, active }, overtime: { deadline: now + 29_000, remainingMs: null } } })}
        hostOnline
        offsetMs={0}
        send={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('29');
    expect(screen.getByText('/ 50 с')).toBeTruthy();
    expect(parseFloat((container.querySelector('.timer-bar > span') as HTMLElement).style.width)).toBeCloseTo(58, 0);
  });

  it('others see who the reveal waits for', () => {
    const now = Date.now();
    const overtime = [{ playerId: 'p2', nickname: 'Оля', deadline: now + 24_000, remainingMs: null }];
    show(onQuestion({ endsAt: now + 5000, overtime, me: { ...me, buffs } }));
    expect(screen.queryByText(/Чекаємо/)).toBeNull();
    cleanup();
    show(onQuestion({ endsAt: now - 1000, overtime, me: { ...me, buffs } }));
    expect(screen.getByTitle('Чекаємо: Оля · 0:24')).toBeTruthy();
  });

  it('«waiting for» never adds height: it stands in the question head, also for a board watcher', () => {
    const now = Date.now();
    const overtime = [
      { playerId: 'p2', nickname: 'Оля', deadline: now + 24_000, remainingMs: null },
      { playerId: 'p3', nickname: 'Петро', deadline: now + 12_000, remainingMs: null },
    ];
    const shape = () => [...document.querySelector('main')!.children].map((el) => el.className);
    // Без бафів у самого гравця (глядач на полі): me.buffs === null.
    show(onQuestion({ endsAt: now + 5000, overtime }));
    const before = shape();
    cleanup();
    show(onQuestion({ endsAt: now - 1000, overtime }));
    expect(shape()).toEqual(before);
    const line = document.querySelector('.question-head .buff-wait')!;
    expect(line.textContent).toBe('Чекаємо: Оля · 0:24, Петро · 0:12');
    // Рядок стоїть на місці підпису запитання, а підпис лишається (прихований) і тримає висоту.
    expect(document.querySelector('.question-head .meta.is-hidden')).not.toBeNull();
    cleanup();
    show(onQuestion({ endsAt: now - 1000, overtime, me: { ...me, buffs } }));
    expect(shape()).toEqual(before);
  });

  it('the again prompt does not push the options down', () => {
    const first = { answer: { type: 'single' as const, optionId: 'a' }, points: 0 };
    const zoneShape = () => [...document.querySelector('.debuff-content, .debuff-zone')!.querySelectorAll('*')].map((el) => el.tagName);
    show(onQuestion({ me: { ...me, buffs: { ...buffs, active: { kind: 'retry', removed: [], retry: 'armed', first: null, hint: null, votes: null, spare: false } } } }));
    const armed = zoneShape();
    cleanup();
    show(onQuestion({ me: { ...me, buffs: { ...buffs, active: { kind: 'retry', removed: [], retry: 'again', first, hint: null, votes: null, spare: false } } } }));
    expect(zoneShape()).toEqual(armed);
    expect(document.querySelector('.buff-why')?.textContent).toBe('Неправильно, ще одна спроба');
  });
});

describe('PlayerScreen: buffs with others', () => {
  const slots = [
    { kind: 'hint' as const, state: 'active' as const, block: null },
    { kind: 'audience' as const, state: 'blocked' as const, block: 'taken' as const },
    { kind: 'swap' as const, state: 'blocked' as const, block: 'taken' as const },
  ];
  const activeOf = (over: Partial<PlayerActiveBuff>): PlayerActiveBuff => ({ kind: 'hint', removed: [], retry: null, first: null, hint: null, votes: null, spare: false, ...over });
  const withActive = (active: PlayerActiveBuff | null) => ({ slots, active });

  it('a hint arrives inside the panel without moving the answer', () => {
    const send = vi.fn(async () => ({ ok: true as const }));
    const waiting = onQuestion({ me: { ...me, buffs: withActive(activeOf({ hint: { state: 'waiting', text: null } })) } });
    const { rerender } = render(<PlayerScreen view={waiting} hostOnline offsetMs={0} send={send} />);
    const zone = () => document.querySelector('.debuff-zone')!;
    const shape = () => [...zone().children].map((el) => el.tagName + '.' + el.className);
    const panel = document.querySelector('.debuff-zone .buff-panel')!;
    expect(panel.textContent).toContain('Ведучий думає…');
    // Панель — одразу під рядом бафів.
    expect(panel.previousElementSibling?.className).toBe('buff-bar');
    const before = shape();
    rerender(
      <PlayerScreen
        view={{ ...waiting, me: { ...me, buffs: withActive(activeOf({ hint: { state: 'text', text: 'Місто на Дніпрі' } })) } }}
        hostOnline
        offsetMs={0}
        send={send}
      />,
    );
    expect(document.querySelector('.buff-panel')).toBe(panel);
    expect(panel.textContent).toContain('? Місто на Дніпрі');
    expect(shape()).toEqual(before);
    expect(screen.getByRole('button', { name: /Київ/ })).toBeTruthy();
  });

  it('a hint given aloud says so in the panel', () => {
    show(onQuestion({ me: { ...me, buffs: withActive(activeOf({ hint: { state: 'aloud', text: null } })) } }));
    const panel = document.querySelector('.debuff-zone .buff-panel')!;
    expect(panel.textContent).toBe('Ведучий підказав уголос');
    expect(screen.getByRole('button', { name: /Київ/ })).toBeTruthy();
  });

  it('voters get a sheet over the page', () => {
    const answered = { ...me, answer: { type: 'single' as const, optionId: 'b' } };
    show(onQuestion({ me: { ...answered, vote: { asker: { playerId: 'p2', nickname: 'Оля' }, endsAt: Date.now() + 15_000, remainingMs: null } } }));
    const sheet = document.querySelector('.vote-sheet')!;
    expect(sheet).not.toBeNull();
    // Аркуш — поза зоною запитання, на рівні main; «Відповідь прийнято» на місці.
    expect(sheet.closest('.debuff-zone')).toBeNull();
    expect(sheet.parentElement?.tagName).toBe('MAIN');
    expect(sheet.querySelector('strong')?.textContent).toBe('Оля питає зал: як думаєте?');
    expect(document.querySelector('.debuff-zone .sent h2')?.textContent).toBe('Відповідь прийнято');
  });

  it('the spare question replaces the question on my phone only', () => {
    const spare = { ...publicQuestion, text: 'Найдовша річка України?', choices: [{ id: 's1', text: 'Дніпро' }, { id: 's2', text: 'Дунай' }] };
    show(onQuestion({ question: spare, me: { ...me, buffs: withActive(activeOf({ kind: 'swap', spare: true })) } }));
    expect(screen.getByText('Найдовша річка України?')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Дніпро/ })).toBeTruthy();
    const tag = document.querySelector('.question-meta .spare-tag')!;
    expect(tag.textContent).toBe('Запасне запитання');
    // У тому самому рядку підпису, без нового блоку.
    expect(tag.parentElement?.className).toBe('meta');
    expect(document.querySelector('.buff-why')?.textContent).toBe('⇄ Запасне запитання: щонайменше 20 с');
    expect(document.querySelector('.buff-panel')).toBeNull();
    cleanup();
    show(onQuestion({ me: { ...me, buffs: withActive(null) } }));
    expect(document.querySelector('.spare-tag')).toBeNull();
  });

  it('after a swap the answer field starts empty', () => {
    const send = vi.fn(async () => ({ ok: true as const }));
    const textQuestion = { ...publicQuestion, type: 'text' as const, choices: [] };
    const main = onQuestion({ question: textQuestion, me: { ...me, buffs: withActive(null) } });
    const { rerender } = render(<PlayerScreen view={main} hostOnline offsetMs={0} send={send} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Київ' } });
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Київ');
    const swapped = { ...main, question: { ...textQuestion, text: 'Найдовша річка?' }, me: { ...me, buffs: withActive(activeOf({ kind: 'swap', spare: true })) } };
    rerender(<PlayerScreen view={swapped} hostOnline offsetMs={0} send={send} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
  });

  it("another player's audience changes nothing on my screen", () => {
    const send = vi.fn(async () => ({ ok: true as const }));
    const before = onQuestion({ me: { ...me, buffs: withActive(null) } });
    const { rerender } = render(<PlayerScreen view={before} hostOnline offsetMs={0} send={send} />);
    const shape = () => [...document.querySelector('main')!.querySelectorAll('*')].filter((el) => !el.closest('.live-notice')).map((el) => el.tagName + '.' + el.className);
    const was = shape();
    rerender(
      <PlayerScreen
        view={{ ...before, buffs: [{ playerId: 'p2', nickname: 'Оля', kind: 'audience' }], buffNotice: { seq: 1, at: Date.now(), playerId: 'p2', nickname: 'Оля', kind: 'audience', questionIndex: 0 } }}
        hostOnline
        offsetMs={0}
        send={send}
      />,
    );
    expect(document.querySelector('.live-notice')).not.toBeNull();
    expect(document.querySelector('.vote-sheet')).toBeNull();
    expect(shape()).toEqual(was);
  });
});

describe('PlayerScreen: splashes', () => {
  const T = 1_000_000;
  const at = (kind: NonNullable<PlayerView['splash']>['kind'], ms: number) => ({ kind, at: T, until: T + ms });
  const classic: RoundInfo = { index: 1, total: 3, title: 'Столиці', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null };
  const buffs = {
    slots: [{ kind: 'fifty' as const, state: 'ready' as const, block: null }],
    active: null,
  };
  const timed = () => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
  };
  afterEach(() => vi.useRealTimers());

  it('the phone shows a smaller splash over a question that is already in place', () => {
    timed();
    show(onQuestion({ round: classic, endsAt: T + 21_200, limitMs: 20_000, splash: at('question', 1200) }));
    const layer = document.querySelector('.splash.is-question.is-phone');
    expect(layer?.textContent).toContain('Запитання 1');
    const choice = screen.getByRole('button', { name: /Київ/ });
    expect(choice).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(document.querySelector('.splash')).toBeNull();
    // Той самий вузол: під шаром нічого не перемонтовано й не зсунуто.
    expect(screen.getByRole('button', { name: /Київ/ })).toBe(choice);
  });

  it('a tap during the question splash sends nothing; answers and buffs open after it', () => {
    timed();
    const send = show(onQuestion({ round: classic, endsAt: T + 21_200, limitMs: 20_000, splash: at('question', 1200), me: { ...me, buffs } }));
    expect((document.querySelector('fieldset.inputs') as HTMLFieldSetElement).disabled).toBe(true);
    expect(document.querySelector('main.player')?.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    const buff = document.querySelector('.buff-row button')!;
    expect(buff.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(buff);
    expect(document.querySelector('.buff-why')?.textContent).toBe('Запитання ще не почалося.');
    expect(send).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect((document.querySelector('fieldset.inputs') as HTMLFieldSetElement).disabled).toBe(false);
    expect(document.querySelector('.buff-row button')!.getAttribute('aria-disabled')).toBe('false');
    expect(document.querySelector('main.player')?.hasAttribute('aria-busy')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    expect(send).toHaveBeenCalledWith('player:answer', { type: 'single', optionId: 'b' });
  });

  it('round, cell, duel and podium splashes reach the phone too', () => {
    timed();
    show(view({ phase: 'intro', round: classic, splash: at('round', 2500) }));
    expect(document.querySelector('.splash.is-round.is-phone')?.textContent).toContain('Раунд 2');
    cleanup();
    const cell = { id: 'c1', category: 'Міста', price: 300, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
    const board = { categories: [], order: [], cell, turn: { playerId: 'p1', nickname: 'Олена' }, dice: null, schedule: [] } as unknown as NonNullable<PlayerView['board']>;
    show(onQuestion({ board, endsAt: T + 21_000, limitMs: 20_000, splash: at('cell', 1000) }));
    expect(document.querySelector('.splash.is-cell.is-phone .splash-flip')?.textContent).toContain('Міста · 300');
    expect((document.querySelector('fieldset.inputs') as HTMLFieldSetElement).disabled).toBe(true);
    cleanup();
    const duel = {
      challenger: { playerId: 'p1', nickname: 'Олена' },
      opponent: { playerId: 'p2', nickname: 'Петро' },
      stage: 'category' as const,
      categories: [{ id: 'dc1', title: 'Столиці', left: 2 }],
      category: null,
      number: 0,
      total: 3,
      question: null,
      accepted: null,
      wins: { challenger: 0, opponent: 0 },
      tries: { challenger: 0, opponent: 0 },
      questionWinner: null,
      winningAnswer: null,
      winner: null,
      stake: 300,
      ending: false,
    };
    show(view({ phase: 'duel', duel, splash: at('duel', 2000) }));
    expect(document.querySelector('.splash.is-duel.is-phone')?.textContent).toContain('Петро');
    cleanup();
    const standings = [{ participantId: 'p1', nickname: 'Олена', score: 500, totalTimeMs: 1, rank: 1 }];
    show(view({ phase: 'finished', standings, splash: at('podium', 2500) }));
    expect(document.querySelector('.splash.is-podium.is-phone')?.textContent).toContain('Підсумки');
  });

  it('an answer refused before the start explains why', async () => {
    const send: Send = vi.fn(async () => ({ ok: false as const, error: 'not_started' }));
    show(onQuestion(), { send });
    fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Запитання ще не почалося.'));
  });
});

describe('PlayerScreen: «Як грати»', () => {
  it('shows the same guide page shorter and no lobby line', () => {
    const guide = { page: 0, pages: [{ kind: 'phone' as const }, { kind: 'questions' as const, types: [{ type: 'single' as const, top: '' }] }] };
    show(view({ phase: 'guide', guide, newcomers: true }));
    expect(screen.getByRole('heading', { name: 'Відповідайте з телефона' })).toBeTruthy();
    expect(document.querySelector('.guide.is-phone')).not.toBeNull();
    expect(screen.queryByText('Ви в грі. Чекаємо на старт.')).toBeNull();
  });
});

describe('PlayerScreen: explanations for newcomers', () => {
  it('the tip sits above the question and answering still works', () => {
    const send = show(onQuestion({ newcomers: true, me: { ...me, tip: 'single' } }));
    const tip = screen.getByRole('note');
    expect(tip.textContent).toContain('Торкніться одного правильного варіанта.');
    const heading = screen.getByRole('heading', { name: 'Столиця України?' });
    expect(tip.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    expect(send).toHaveBeenCalledWith('player:answer', { type: 'single', optionId: 'b' });
  });
  it('the order tip uses the label of this question', () => {
    const ordered = { ...publicQuestion, type: 'order' as const, orderLabels: { top: 'Найбільший', bottom: 'Найменший' } };
    show(onQuestion({ newcomers: true, question: ordered, me: { ...me, tip: 'order' } }));
    expect(screen.getByRole('note').textContent).toContain('зверху — найбільший');
  });
  it('no tip without one in the view', () => {
    show(onQuestion({ newcomers: true }));
    expect(screen.queryByRole('note')).toBeNull();
  });
  it('the round intro has a reminder only with explanations on', () => {
    const round: RoundInfo = { index: 0, total: 2, title: 'Розминка', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null };
    show(view({ phase: 'intro', round, newcomers: true }));
    expect(screen.getByText('Як проходить раунд')).toBeTruthy();
    expect(screen.getByText('Запитання йдуть по черзі; кожен відповідає у своєму телефоні.')).toBeTruthy();
    cleanup();
    show(view({ phase: 'intro', round }));
    expect(screen.queryByText('Як проходить раунд')).toBeNull();
  });
});

describe('PlayerScreen: table and menu', () => {
  const rows = [{ participantId: 'p1', nickname: 'Олена', score: 0, totalTimeMs: 0, rank: 1 }];
  it('the header has «Таблиця» during a question, none in the lobby; «До меню» after the game', () => {
    show(view({ phase: 'question', questionIndex: 0, question: publicQuestion, table: { rows, full: true } }));
    expect(document.querySelector('header.bar')?.contains(screen.getByRole('button', { name: 'Таблиця' }))).toBe(true);
    expect(screen.queryByRole('link', { name: 'До меню' })).toBeNull();
    cleanup();
    show(view());
    expect(screen.queryByRole('button', { name: 'Таблиця' })).toBeNull();
    cleanup();
    show(view({ phase: 'finished', questionIndex: 1, standings: rows }));
    expect(screen.getByRole('link', { name: 'До меню' }).getAttribute('href')).toBe('/');
  });

  it('the header has «Дебафи» only when the view has a shop, between «Дуель» and «Таблиця»; purchases toast on the phone', () => {
    show(view({ phase: 'question', questionIndex: 0, question: publicQuestion, table: { rows, full: true } }));
    expect(screen.queryByRole('button', { name: 'Дебафи' })).toBeNull();
    cleanup();
    const shop = { items: [{ kind: 'fog' as const, price: 200 }], targets: [{ playerId: 'p2', nickname: 'Петро', busy: false, offline: false }], block: null };
    const debuffNotice = { seq: 1, at: Date.now(), buyer: { playerId: 'p2', nickname: 'Петро' }, target: { playerId: 'p3', nickname: 'Іра' } };
    show(view({ phase: 'question', questionIndex: 0, question: publicQuestion, table: { rows, full: true }, debuffNotice, me: { ...me, shop } }));
    const header = document.querySelector('header.bar')!;
    const shopButton = screen.getByRole('button', { name: 'Дебафи' });
    expect(header.contains(shopButton)).toBe(true);
    expect(shopButton.nextElementSibling).toBe(screen.getByRole('button', { name: 'Таблиця' }));
    expect(shopButton.classList.contains('table-button')).toBe(true);
    expect(screen.getByText('Петро насилає дебаф на гравця Іра')).toBeTruthy();
    // Усі сповіщення — в одному стовпчику .live-notices.
    expect(screen.getByText('Петро насилає дебаф на гравця Іра').parentElement?.className).toBe('live-notices');
    cleanup();
    // Жертві — ні: її банер, коли дебаф спрацює, сам назве покупця.
    show(view({ phase: 'question', questionIndex: 0, question: publicQuestion, debuffNotice: { ...debuffNotice, target: { playerId: me.id, nickname: me.nickname } } }));
    expect(screen.queryByText(/насилає дебаф/)).toBeNull();
  });

  const sliderQuestion = { ...publicQuestion, type: 'slider' as const, choices: [], slider: { min: 0, max: 100, step: 1, unit: '%' } };

  it('a slider question renders the slider and sends the value', async () => {
    const send = show(onQuestion({ question: sliderQuestion }));
    fireEvent.change(screen.getByLabelText('Повзунок'), { target: { value: '57' } });
    fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:answer', { type: 'slider', value: 57 }));
  });

  it('a revealing picture is not full while answering, also after the answer, and full once locked', () => {
    const revealing = { ...publicQuestion, imageUrl: '/a.png', reveal: 'blur' as const };
    show(onQuestion({ question: revealing, limitMs: 20_000, endsAt: Date.now() + 15_000 }));
    expect(Number(document.querySelector('.question-image[data-stage]')!.getAttribute('data-stage'))).toBeLessThan(10);
    expect(screen.getByText(/Картинка проявляється: що раніше відповіси, то більше балів\./)).toBeTruthy();
    cleanup();
    show(
      onQuestion({
        question: revealing,
        limitMs: 20_000,
        endsAt: Date.now() + 15_000,
        me: { ...me, answer: { type: 'single', optionId: 'b' } },
      }),
    );
    expect(screen.getByText('Відповідь прийнято')).toBeTruthy();
    expect(Number(document.querySelector('.question-image[data-stage]')!.getAttribute('data-stage'))).toBeLessThan(10);
    cleanup();
    show(view({ phase: 'locked', questionIndex: 0, question: revealing, limitMs: 20_000 }));
    expect(document.querySelector('img.question-image[data-stage]')!.getAttribute('data-stage')).toBe('10');
  });

  it('the slider reveal shows my answer against the correct one', () => {
    const correct: Question = { id: 'q2', type: 'slider', text: 'Скільки?', imageUrl: null, video: null, timeLimit: 20, points: 1000, min: 0, max: 100, step: 1, correct: 50, tolerance: 2, unit: '%' };
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        question: sliderQuestion,
        reveal: correct,
        me: { ...me, answer: { type: 'slider', value: 57 }, result: { grade: 'wrong', points: 0, streakBonus: 0 } as never },
      }),
    );
    expect(screen.getByText('Твоя відповідь: 57 % · правильна: 50 % (± 2)')).toBeTruthy();
  });
});

describe('PlayerScreen: «Who am I?» and pin (10c)', () => {
  const CLUES = ['Народився 1814 року', 'Був художником', 'Засланий у солдати', 'Автор «Заповіту»', 'Автор «Кобзаря»'];
  const cluesQuestion = {
    ...publicQuestion,
    type: 'clues' as const,
    text: 'Хто я?',
    choices: [],
    clues: { total: 5, shown: CLUES.slice(0, 2), nextAt: Date.now() + 5000, byHost: false, intervalSeconds: 8 },
  };
  const cluesFull: Question = { id: 'q3', type: 'clues', text: 'Хто я?', imageUrl: null, video: null, timeLimit: 45, points: 1000, clues: CLUES, accepted: ['Шевченко'], interval: 8 };
  const pinQuestion = { ...publicQuestion, type: 'pin' as const, text: 'Де Львів?', choices: [], pin: { map: 'ukraine' as const, aspect: 16 / 11 } };
  const pinFull: Question = {
    id: 'q4',
    type: 'pin',
    text: 'Де Львів?',
    imageUrl: null,
    video: null,
    timeLimit: 30,
    points: 1000,
    map: 'ukraine',
    aspect: 16 / 11,
    target: { x: 0.1, y: 0.3 },
    fullRadius: 3,
    zeroRadius: 15,
  };

  it('clues: the opened clues, the current share and the answer field; the list stays after the answer', async () => {
    const send = show(onQuestion({ question: cluesQuestion }));
    expect(screen.getByText('Народився 1814 року')).toBeTruthy();
    expect(screen.getByText('Був художником')).toBeTruthy();
    expect(screen.queryByText('Засланий у солдати')).toBeNull();
    expect(screen.getByText('Підказка 2 з 5: правильна відповідь зараз — 80 % ціни')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Ваша відповідь'), { target: { value: 'Шевченко' } });
    fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:answer', { type: 'clues', value: 'Шевченко' }));
    cleanup();
    show(onQuestion({ question: cluesQuestion, me: { ...me, answer: { type: 'clues', value: 'Шевченко' } } }));
    expect(screen.getByText('Відповідь прийнято')).toBeTruthy();
    expect(screen.getByText('Був художником')).toBeTruthy();
    expect(document.querySelectorAll('.clue.is-hidden')).toHaveLength(3);
  });

  it('pin: the map frame with zoom buttons, a tap and «Відповісти» send the pin', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 300, height: 150, right: 300, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });
    try {
      const send = show(onQuestion({ question: pinQuestion }));
      expect(screen.getByRole('button', { name: 'Наблизити' })).toBeTruthy();
      // Основа точки — лише в рамці, без окремої картинки запитання.
      expect(document.querySelectorAll('img')).toHaveLength(1);
      const frame = screen.getByRole('group', { name: 'Мапа: торкнися, щоб поставити точку' });
      fireEvent.pointerDown(frame, { pointerId: 1, clientX: 150, clientY: 30 });
      fireEvent.pointerUp(frame, { pointerId: 1, clientX: 150, clientY: 30 });
      fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
      await waitFor(() => expect(send).toHaveBeenCalledWith('player:answer', { type: 'pin', x: 0.5, y: 0.2 }));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('pin under the question splash: the map ignores taps', () => {
    const now = Date.now();
    show(onQuestion({ question: pinQuestion, splash: { kind: 'question', at: now - 100, until: now + 3000 } }));
    const frame = screen.getByRole('group', { name: 'Мапа: торкнися, щоб поставити точку' });
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(document.querySelector('.pin-mark.is-mine')).toBeNull();
    expect(screen.getByRole('button', { name: 'Наблизити' }).matches(':disabled')).toBe(true);
  });

  it('pin reveal: my pin, the correct point and both circles', () => {
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        question: pinQuestion,
        reveal: pinFull,
        me: { ...me, answer: { type: 'pin', x: 0.12, y: 0.3 }, result: { grade: 'correct', points: 1000, streakBonus: 0 } as never },
      }),
    );
    expect(screen.getByRole('img', { name: 'Олена' }).classList.contains('is-best')).toBe(true);
    expect(document.querySelector('.pin-target')).not.toBeNull();
    expect(document.querySelector('.pin-circle-full')).not.toBeNull();
    expect(document.querySelector('.pin-circle-zero')).not.toBeNull();
    expect(screen.getByText(/^Точка за .* % від правильної$/)).toBeTruthy();
  });

  it('clues reveal: all clues without placeholders and the correct answer', () => {
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        question: { ...cluesQuestion, clues: { ...cluesQuestion.clues, nextAt: null } },
        reveal: cluesFull,
        me: { ...me, answer: { type: 'clues', value: 'Шевченко' }, result: { grade: 'correct', points: 800, streakBonus: 0 } as never },
      }),
    );
    for (const clue of CLUES) expect(screen.getByText(clue)).toBeTruthy();
    expect(document.querySelector('.clue.is-hidden')).toBeNull();
    expect(screen.getByText('Правильна відповідь: Шевченко')).toBeTruthy();
  });

  describe('wall, poll and word cloud (10d)', () => {
    const TILES = Array.from({ length: 16 }, (_, i) => `Плитка ${i}`);
    const wallPublic = { ...publicQuestion, type: 'wall' as const, choices: [], points: 1000, wall: { tiles: TILES, size: 4, groupCount: 4, maxMistakes: 3 } };
    const group = (n: number, name: string) => ({ id: `g${n}`, name, tiles: [0, 1, 2, 3].map((k) => ({ id: `t${n}${k}`, text: TILES[n * 4 + k] })) });
    const wallFull: Question = {
      id: 'w1', type: 'wall', text: 'Стіна', imageUrl: null, video: null, round: null, points: 1000, timeLimit: 90, mistakes: 3,
      groups: [group(0, 'Річки'), group(1, 'Міста'), group(2, 'Фрукти'), group(3, 'Кольори')],
    } as unknown as Question;
    const playerWall = { found: [], mistakes: 0, maxMistakes: 3, locked: false, solved: false, canGuess: true };

    it('wall on the question: sixteen tiles and the check button', () => {
      show(onQuestion({ question: wallPublic, me: { ...me, wall: playerWall } }));
      expect(document.querySelectorAll('.wall-tile')).toHaveLength(16);
      expect(screen.getByRole('button', { name: 'Перевірити' })).toBeTruthy();
    });

    it('wall reveal: own grid, groups with names and the result line', () => {
      show(
        view({
          phase: 'reveal',
          questionIndex: 0,
          question: wallPublic,
          reveal: wallFull,
          me: {
            ...me,
            wall: { ...playerWall, found: [{ tiles: [0, 1, 2, 3], color: 0 }, { tiles: [4, 5, 6, 7], color: 1 }], canGuess: false },
            answer: { type: 'wall', found: 2, groups: 4, mistakes: 1, timeMs: null },
            result: { accepted: true, accuracy: 0.5, grade: 'correct', streakBonus: 0, points: 500 },
          },
        }),
      );
      for (const name of ['Річки', 'Міста', 'Фрукти', 'Кольори']) expect(screen.getByText(name)).toBeTruthy();
      expect(screen.getByText('Груп: 2 з 4 · 500')).toBeTruthy();
      expect(document.querySelectorAll('.wall-tile.is-found')).toHaveLength(8);
    });

    it('a spectator on a board cell sees the chooser wall without buttons', () => {
      const chooser = { playerId: 'p2', nickname: 'Тарас', found: 1, mistakes: 0, locked: false, solved: false, points: null, tiles: [[0, 1, 2, 3]] };
      show(
        onQuestion({
          question: wallPublic,
          wall: { groupCount: 4, rows: [chooser] },
          board: { turn: { playerId: 'p2', nickname: 'Тарас' }, cell: null } as never,
          me: { ...me, wall: null },
        }),
      );
      expect(document.querySelectorAll('.wall-tile')).toHaveLength(16);
      expect(screen.queryByRole('button', { name: 'Перевірити' })).toBeNull();
      expect(document.querySelectorAll('button.wall-tile')).toHaveLength(0);
      expect(document.querySelectorAll('.wall-tile.is-found')).toHaveLength(4);
    });

    const pollPublic = {
      ...publicQuestion,
      type: 'poll' as const,
      points: 0,
      choices: [
        { id: 'a', text: 'Зима' },
        { id: 'b', text: 'Літо' },
      ],
    };
    const pollFull = { ...fullQuestion, type: 'poll', points: 0, options: pollPublic.choices } as unknown as Question;

    it('a poll after the vote: accepted, no points and no verdict', () => {
      show(onQuestion({ question: pollPublic, me: { ...me, answer: { type: 'poll', optionId: 'b' } } }));
      expect(screen.getByText('Голос прийнято')).toBeTruthy();
      expect(screen.getByText('Літо')).toBeTruthy();
      expect(document.querySelector('main')!.textContent).not.toMatch(/бал/);
      expect(document.querySelector('[class*="verdict"]')).toBeNull();
    });

    it('a poll on the reveal: results are on the stage, own pick kept', () => {
      show(
        view({
          phase: 'reveal',
          questionIndex: 0,
          question: pollPublic,
          reveal: pollFull,
          me: { ...me, answer: { type: 'poll', optionId: 'b' }, result: null },
        }),
      );
      expect(screen.getByText('Результати — на екрані.')).toBeTruthy();
      expect(screen.getByText('Літо')).toBeTruthy();
      expect(screen.queryByText('Неправильно')).toBeNull();
      expect(screen.queryByText('Правильно!')).toBeNull();
    });

    it('a word cloud: the input before, the words after the vote', () => {
      const cloud = { ...publicQuestion, type: 'wordcloud' as const, points: 0, choices: [], cloud: { words: 3 } };
      const { unmount } = render(
        <PlayerScreen view={onQuestion({ question: cloud })} hostOnline offsetMs={0} send={vi.fn(async () => ({ ok: true as const }))} />,
      );
      expect(screen.getByLabelText('Слово 1')).toBeTruthy();
      unmount();
      show(onQuestion({ question: cloud, me: { ...me, answer: { type: 'wordcloud', words: ['Каштани', 'Дніпро'] } } }));
      expect(screen.getByText('Голос прийнято')).toBeTruthy();
      expect(screen.getByText('Каштани, Дніпро')).toBeTruthy();
    });
  });

  describe('survey (10e)', () => {
    const surveyPublic = { ...publicQuestion, type: 'survey' as const, choices: [], points: 1000, survey: { answers: 3, rows: 5 } };
    const surveyFull = { ...fullQuestion, type: 'survey', rows: [] } as unknown as Question;
    const sent = { type: 'survey' as const, values: ['Яблуко', 'ананас'] };
    const closedRow = (rank: number) => ({ rank, open: false, text: null, popularity: null, by: null });

    it('the input on the question: three fields', () => {
      show(onQuestion({ question: surveyPublic }));
      expect(screen.getAllByRole('textbox')).toHaveLength(3);
    });

    it('after sending: the sent screen with the own answers', () => {
      show(onQuestion({ question: surveyPublic, me: { ...me, answer: sent } }));
      expect(screen.getByText('Відповіді надіслано')).toBeTruthy();
      expect(screen.getByText('Яблуко')).toBeTruthy();
      expect(screen.getByText('ананас')).toBeTruthy();
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    });

    it('the reveal: own lines with place and popularity, misses, and the board is on the stage', () => {
      show(
        view({
          phase: 'reveal',
          questionIndex: 0,
          question: surveyPublic,
          reveal: surveyFull,
          me: {
            ...me,
            answer: sent,
            survey: {
              lines: [
                { value: 'Яблуко', rank: 1, text: 'Яблуко', popularity: 32, pending: false },
                { value: 'ананас', rank: null, text: null, popularity: null, pending: false },
              ],
            },
            result: { accepted: false, accuracy: 0.32, grade: 'partial', streakBonus: 0, points: 320 },
          },
        }),
      );
      expect(screen.getByText('Яблуко — місце 1, 32')).toBeTruthy();
      expect(screen.getByText('ананас — немає на табло')).toBeTruthy();
      expect(screen.getByText('Табло — на екрані')).toBeTruthy();
      expect(document.querySelector('main')!.textContent).not.toContain('Правильна відповідь');
    });

    it('a row not opened yet stays a plain answer: the phone does not spoil the reveal', () => {
      show(
        view({
          phase: 'reveal',
          questionIndex: 0,
          question: surveyPublic,
          reveal: surveyFull,
          me: {
            ...me,
            answer: sent,
            survey: {
              lines: [
                { value: 'Яблуко', rank: null, text: null, popularity: null, pending: true },
                { value: 'ананас', rank: null, text: null, popularity: null, pending: false },
              ],
            },
          },
        }),
      );
      expect(screen.getByText('Яблуко')).toBeTruthy();
      expect(screen.queryByText(/місце/)).toBeNull();
      expect(screen.getByText('ананас — немає на табло')).toBeTruthy();
    });

    it('the board reveal shows the survey board, not a spotlight line, to the spectator and the chooser', () => {
      const spotlight = { playerId: 'p2', nickname: 'Тарас', answer: sent, grade: 'partial' as const };
      for (const chooser of ['p2', 'p1']) {
        show(
          view({
            phase: 'reveal',
            questionIndex: 0,
            question: surveyPublic,
            reveal: surveyFull,
            spotlight: { ...spotlight, playerId: chooser },
            survey: { source: 'host', total: 5, shown: 5, rows: [1, 2, 3, 4, 5].map(closedRow) },
            board: { turn: { playerId: chooser, nickname: 'Тарас' }, cell: null } as never,
          }),
        );
        // Глядач бачить табло; вибравший — власні рядки в результаті.
        if (chooser === 'p2') expect(document.querySelectorAll('.survey-row')).toHaveLength(5);
        expect(document.querySelector('.spotlight-answer')).toBeNull();
        cleanup();
      }
    });

    it('a spectator on a board cell sees the survey board', () => {
      show(
        onQuestion({
          question: surveyPublic,
          survey: { source: 'host', total: 5, shown: 0, rows: [1, 2, 3, 4, 5].map(closedRow) },
          board: { turn: { playerId: 'p2', nickname: 'Тарас' }, cell: null } as never,
        }),
      );
      expect(document.querySelectorAll('.survey-row.is-closed')).toHaveLength(5);
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    });
  });
  describe('bluff (10f)', () => {
    const bluffPublic = { ...publicQuestion, type: 'bluff' as const, choices: [], points: 1000 };
    const bluffFull = { ...fullQuestion, type: 'bluff' } as unknown as Question;
    const opt = (id: string, text: string) => ({ id, text, open: false, kind: null, authors: null, pickedBy: null, removed: false });
    const options = [opt('b1', 'Рим'), opt('b2', 'Мілан'), opt('b3', 'Барселона'), opt('b4', 'Париж'), opt('b5', 'Лондон')];
    const info = (over: Record<string, unknown> = {}) => ({ stage: 'lies' as const, written: 1, picked: 0, options: [], shown: 0, total: 0, lastOpenedId: null, lies: null, ...over });
    const mine = (over: Record<string, unknown> = {}) => ({ ...me, bluff: { lie: null, own: [], pick: null, truth: null, fooled: null, ...over } });

    it('the lies phase: a field; after sending, the own lie and the counter', () => {
      show(onQuestion({ question: bluffPublic, bluff: info(), me: mine() }));
      expect(screen.getByLabelText('Твоя вигадка')).toBeTruthy();
      cleanup();
      show(onQuestion({ question: bluffPublic, bluff: info({ written: 1 }), me: mine({ lie: 'Рим' }) }));
      expect(screen.getByText('Твоя вигадка: «Рим». Чекаємо на інших.')).toBeTruthy();
      expect(screen.getByText('Вигадали 1 з 2')).toBeTruthy();
      expect(screen.queryByLabelText('Твоя вигадка')).toBeNull();
    });

    it('the choice phase: the list with the own lie disabled; after picking, the pick', () => {
      show(onQuestion({ question: bluffPublic, bluff: info({ stage: 'choice', options }), me: mine({ lie: 'Мілан', own: ['b2'] }) }));
      expect(screen.getByText('Що з цього правда?')).toBeTruthy();
      expect((screen.getByRole('button', { name: /Мілан/ }) as HTMLButtonElement).disabled).toBe(true);
      cleanup();
      show(onQuestion({ question: bluffPublic, bluff: info({ stage: 'choice', options, picked: 1 }), me: mine({ pick: 'b3' }) }));
      expect(screen.getByText('Твій вибір: «Барселона»')).toBeTruthy();
      expect(screen.getByText('Вибрали 1 з 2')).toBeTruthy();
      expect(screen.queryByText('Що з цього правда?')).toBeNull();
    });

    it('a pick the host removed brings the list back', () => {
      show(onQuestion({ question: bluffPublic, bluff: info({ stage: 'choice', options: options.filter((o) => o.id !== 'b3') }), me: mine({ pick: null }) }));
      expect(screen.getByText('Що з цього правда?')).toBeTruthy();
    });

    it('the host removing the pick shows a one-line notice, and picking again clears it', () => {
      const send: Send = vi.fn(async () => ({ ok: true as const }));
      const node = (v: PlayerView) => <PlayerScreen view={v} hostOnline offsetMs={0} send={send} />;
      const { rerender } = render(node(onQuestion({ question: bluffPublic, bluff: info({ stage: 'choice', options, picked: 1 }), me: mine({ pick: 'b3' }) })));
      expect(screen.queryByText('Ведучий прибрав цей варіант — вибери інший')).toBeNull();
      rerender(node(onQuestion({ question: bluffPublic, bluff: info({ stage: 'choice', options: options.filter((o) => o.id !== 'b3') }), me: mine({ pick: null }) })));
      expect(screen.getByText('Ведучий прибрав цей варіант — вибери інший')).toBeTruthy();
      rerender(node(onQuestion({ question: bluffPublic, bluff: info({ stage: 'choice', options: options.filter((o) => o.id !== 'b3'), picked: 1 }), me: mine({ pick: 'b1' }) })));
      expect(screen.queryByText('Ведучий прибрав цей варіант — вибери інший')).toBeNull();
    });

    it('tapping an option the host just removed says so instead of a generic error', async () => {
      const send: Send = vi.fn(async () => ({ ok: false as const, error: 'not_found' as const }));
      show(onQuestion({ question: bluffPublic, bluff: info({ stage: 'choice', options }), me: mine() }), { send });
      fireEvent.click(screen.getByRole('button', { name: 'Париж' }));
      expect(await screen.findByText('Цей варіант щойно прибрали — вибери інший')).toBeTruthy();
    });

    it('a player who wrote a lie but never picked gets «Ти не вибирав варіант», with the fooled count', () => {
      show(
        view({
          phase: 'reveal',
          questionIndex: 0,
          question: bluffPublic,
          reveal: bluffFull,
          bluff: info({ stage: 'reveal', options, shown: 3, total: 3, lastOpenedId: 'b1' }),
          me: { ...mine({ lie: 'Рим', pick: null, truth: false, fooled: 2 }), result: { accepted: false, accuracy: 0, grade: 'wrong', streakBonus: 0, points: 1000 } },
        }),
      );
      expect(screen.getByText('Ти не вибирав варіант')).toBeTruthy();
      expect(screen.queryByText('Не вгадав')).toBeNull();
      expect(screen.getByText('На твою вигадку купилися: 2')).toBeTruthy();
    });

    it('the choice timer ignores the audio lead of a long clip: no «Слухайте»', () => {
      const audio = { duration: 100, clip: { source: 'file', url: '/uploads/abcdef0123456789.mp3', start: 0, duration: 100 } };
      show(onQuestion({ question: { ...bluffPublic, audio } as never, bluff: info({ stage: 'choice', options }), me: mine(), limitMs: 30_000, remainingMs: 28_000, endsAt: null }));
      expect(screen.queryByText('🎵 Слухайте')).toBeNull();
    });

    it('the input is disabled during the pause', () => {
      show(onQuestion({ question: bluffPublic, bluff: info(), me: mine(), paused: true }));
      expect((screen.getByLabelText('Твоя вигадка') as HTMLInputElement).closest('fieldset')!.disabled).toBe(true);
    });

    it('the reveal before the truth: the board, a hint and no score', () => {
      show(
        view({
          phase: 'reveal',
          questionIndex: 0,
          question: bluffPublic,
          reveal: bluffFull,
          bluff: info({ stage: 'reveal', options, shown: 0, total: 3 }),
          me: mine({ lie: 'Рим' }),
        }),
      );
      expect(document.querySelectorAll('li.bluff-row')).toHaveLength(5);
      expect(screen.getByText('Правду відкриють останньою')).toBeTruthy();
      expect(screen.queryByText('Ти знайшов правду!')).toBeNull();
      expect(document.querySelector('.earned')).toBeNull();
    });

    it('a silent player gets a neutral line once every option is open, not the waiting hint', () => {
      show(
        view({
          phase: 'reveal',
          questionIndex: 0,
          question: bluffPublic,
          reveal: bluffFull,
          bluff: info({ stage: 'reveal', options, shown: 3, total: 3, lastOpenedId: 'b1' }),
          me: mine(),
        }),
      );
      expect(screen.getByText('Ти не брав участі в цьому запитанні')).toBeTruthy();
      expect(screen.queryByText('Правду відкриють останньою')).toBeNull();
    });

    it('a merged lie marks every own option', () => {
      show(onQuestion({ question: bluffPublic, bluff: info({ stage: 'choice', options }), me: mine({ lie: 'Рим', own: ['b1', 'b2'] }) }));
      expect((screen.getByRole('button', { name: /Рим/ }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: /Мілан/ }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Париж' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('the reveal after the truth: the verdict, the fooled and the points', () => {
      show(
        view({
          phase: 'reveal',
          questionIndex: 0,
          question: bluffPublic,
          reveal: bluffFull,
          bluff: info({ stage: 'reveal', options, shown: 3, total: 3, lastOpenedId: 'b1' }),
          me: {
            ...mine({ lie: 'Рим', truth: true, fooled: 1 }),
            result: { accepted: true, accuracy: 1, grade: 'correct', streakBonus: 0, points: 1500 },
          },
        }),
      );
      expect(screen.getByText('Ти знайшов правду!')).toBeTruthy();
      expect(screen.getByText('На твою вигадку купилися: 1')).toBeTruthy();
      expect(document.querySelector('.earned')!.textContent).toContain('1');
      expect(screen.queryByText('Правду відкриють останньою')).toBeNull();
    });
  });

  describe('wipeout', () => {
    const wipeoutRound: RoundInfo = { index: 0, total: 1, title: '', type: 'wipeout', partial: false, description: '', brief: emptyBrief('wipeout'), times: null };
    const ladder = (over: Partial<NonNullable<PlayerView['wipeout']>> = {}): NonNullable<PlayerView['wipeout']> => ({
      ladder: [100, 200, 300],
      current: 2,
      done: 3,
      rows: [{ playerId: 'p1', nickname: 'Олена', status: 'in', bank: 300, step: null, decision: null }],
      inCount: 1,
      decide: { endsAt: Date.now() + 8_000, remainingMs: null, decided: 0, total: 1 },
      ...over,
    });
    const own = (over: Partial<NonNullable<PlayerView['me']['wipeout']>> = {}) => ({ ...me, wipeout: { status: 'in' as const, bank: 300, decision: null, canDecide: true, ...over } });
    const standings = [{ participantId: 'p1', nickname: 'Олена', score: 0, totalTimeMs: 0, rank: 1 }];

    it('shows the decision buttons and the ladder instead of the standings on the leaderboard', async () => {
      const send = show(view({ phase: 'leaderboard', round: wipeoutRound, wipeout: ladder(), me: own(), standings: null }));
      expect(document.querySelector('.standings:not(.wipeout-players)')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Забрати 300' }));
      expect(send).toHaveBeenCalledWith('player:wipeout', { take: true });
      // Рішення одне: поки відповіді немає, другий дотик не йде.
      fireEvent.click(screen.getByRole('button', { name: 'Далі' }));
      expect(send).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      await act(async () => {});
      fireEvent.click(screen.getByRole('button', { name: 'Далі' }));
      expect(send).toHaveBeenLastCalledWith('player:wipeout', { take: false });
      expect(document.querySelector('.wipeout-ladder')).not.toBeNull();
    });

    it('a burned player watches instead of answering', () => {
      show(onQuestion({ round: wipeoutRound, wipeout: ladder({ decide: null }), me: own({ status: 'burned', bank: 0, canDecide: false }) }));
      expect(screen.getByText('Ти вже не граєш у цьому раунді — дивись.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Київ/ })).toBeNull();
      expect(document.querySelector('.inputs')).toBeNull();
    });

    it('the reveal shows the bank, not points for the question', () => {
      show(
        view({
          phase: 'reveal',
          questionIndex: 0,
          question: publicQuestion,
          round: wipeoutRound,
          wipeout: ladder({ decide: null }),
          me: { ...own({ canDecide: false }), result: { accepted: true, accuracy: 1, grade: 'correct', streakBonus: 0, points: 300 } },
        }),
      );
      expect(screen.getByText('Банк: 300')).toBeTruthy();
      expect(screen.queryByText(/\+300/)).toBeNull();
    });

    it('a player who left earlier sees no verdict on a later reveal', () => {
      const gone = ladder({ decide: null, rows: [{ playerId: 'p1', nickname: 'Олена', status: 'took', bank: 300, step: 0, decision: null }] });
      show(view({ phase: 'reveal', questionIndex: 1, question: publicQuestion, round: wipeoutRound, wipeout: gone, me: own({ status: 'took', canDecide: false }) }));
      expect(screen.getByText('Ти дивишся')).toBeTruthy();
      expect(screen.queryByText('Неправильно')).toBeNull();
      expect(screen.queryByText('Банк: 300')).toBeNull();
    });

    it('a player burned on this very step still sees the burn', () => {
      const burnt = ladder({ decide: null, rows: [{ playerId: 'p1', nickname: 'Олена', status: 'burned', bank: 0, step: 2, decision: null }] });
      show(view({ phase: 'reveal', questionIndex: 2, question: publicQuestion, round: wipeoutRound, wipeout: burnt, me: own({ status: 'burned', bank: 0, canDecide: false }) }));
      expect(screen.getByText('Банк згорів')).toBeTruthy();
      expect(screen.queryByText('Ти дивишся')).toBeNull();
    });

    it('the round end sums the round up', () => {
      show(view({ phase: 'round_end', round: wipeoutRound, wipeout: ladder({ decide: null }), me: own({ status: 'took', bank: 300, canDecide: false }), standings }));
      expect(screen.getByText('Забрано 300')).toBeTruthy();
    });
  });

  describe('ladder (10i)', () => {
    const ladderRound: RoundInfo = { index: 0, total: 1, title: '', type: 'ladder', partial: false, description: '', brief: emptyBrief('ladder'), times: null };
    type Own = NonNullable<PlayerView['me']['ladder']>;
    const own = (over: Partial<Own> = {}) => ({
      ...me,
      ladder: { role: 'contestant' as const, canLifeline: true, hint: null, canDecide: false, hallClosed: false, hallPoints: null, won: null, ...over },
    });
    const info = (over: Partial<NonNullable<PlayerView['ladder']>> = {}): NonNullable<PlayerView['ladder']> => ({
      contestant: { playerId: 'p1', nickname: 'Олена' },
      pick: 'host',
      drawn: false,
      steps: [
        { level: 100, safe: false, state: 'passed' },
        { level: 300, safe: false, state: 'passed' },
        { level: 1000, safe: true, state: 'current' },
        { level: 3000, safe: false, state: 'ahead' },
        { level: 10000, safe: false, state: 'ahead' },
      ],
      current: 2,
      timer: false,
      lifelines: [
        { kind: 'fifty', state: 'ready' },
        { kind: 'audience', state: 'ready' },
        { kind: 'hint', state: 'ready' },
      ],
      fifty: null,
      audience: null,
      hint: null,
      contestantPick: null,
      hall: { answered: 0, total: 1, right: null },
      decision: null,
      outcome: null,
      banked: 300,
      guaranteed: 1000,
      ...over,
    });
    const standings = [{ participantId: 'p1', nickname: 'Олена', score: 0, totalTimeMs: 0, rank: 1 }];
    const asked = (over: Partial<PlayerView> = {}) => onQuestion({ round: ladderRound, endsAt: null, ladder: info(), me: own(), ...over });

    it('the contestant sees the lifelines and a field without the removed options, and no buff row', () => {
      show(asked({ ladder: info({ fifty: ['a'] }) }));
      expect(screen.getByRole('button', { name: '50/50' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Зал' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Підказка' })).toBeTruthy();
      expect(document.querySelectorAll('.is-removed')).toHaveLength(1);
      expect(document.querySelector('.buff-row')).toBeNull();
    });

    it('a lifeline tap sends player:lifeline', () => {
      const send = show(asked());
      fireEvent.click(screen.getByRole('button', { name: '50/50' }));
      expect(send).toHaveBeenCalledWith('player:lifeline', { kind: 'fifty' });
    });

    it('the hall sees the banner with its points and no lifelines', () => {
      show(asked({ me: own({ role: 'hall', canLifeline: false, hallPoints: 10 }) }));
      expect(screen.getByText('Драбину проходить Олена. Відповідай за себе: правильно — +10.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: '50/50' })).toBeNull();
      expect(document.querySelector('.buff-row')).toBeNull();
    });

    it('the hall field is disabled once the hall has voted', () => {
      show(asked({ me: own({ role: 'hall', canLifeline: false, hallClosed: true }) }));
      expect(screen.getByText('Зал уже проголосував — на це запитання відповідати пізно.')).toBeTruthy();
      expect(document.querySelector('fieldset.inputs')!.hasAttribute('disabled')).toBe(true);
    });

    it('the contestant gets a final-answer line after answering', () => {
      show(asked({ me: { ...own({ canLifeline: false }), answer: { type: 'single', optionId: 'b' } } }));
      expect(screen.getByText('Остаточна відповідь прийнята.')).toBeTruthy();
    });

    it('the intro names who climbs', () => {
      show(view({ phase: 'intro', round: ladderRound, ladder: info(), me: own() }));
      expect(screen.getByText('Ти йдеш на драбину!')).toBeTruthy();
      cleanup();
      show(view({ phase: 'intro', round: ladderRound, ladder: info(), me: own({ role: 'hall' }) }));
      expect(screen.getByText('Драбину проходить Олена')).toBeTruthy();
      cleanup();
      show(view({ phase: 'intro', round: ladderRound, ladder: info({ contestant: null }), me: own({ role: 'hall' }) }));
      expect(screen.getByText('Ведучий вибирає, хто піде на драбину…')).toBeTruthy();
    });

    it('the reveal shows the step, not points, to the contestant', () => {
      const result = { accepted: true, accuracy: 1, grade: 'correct' as const, streakBonus: 0, points: 0 };
      show(view({ phase: 'reveal', questionIndex: 0, question: publicQuestion, round: ladderRound, ladder: info(), me: { ...own({ canLifeline: false }), result } }));
      expect(screen.getByText('Правильно! 1000 у кишені.')).toBeTruthy();
      expect(document.querySelector('.result')!.classList.contains('is-correct')).toBe(true);
      expect(document.querySelector('.earned')).toBeNull();
    });

    it('a wrong answer says so without a sum', () => {
      const result = { accepted: true, accuracy: 0, grade: 'wrong' as const, streakBonus: 0, points: 0 };
      show(view({ phase: 'reveal', questionIndex: 0, question: publicQuestion, round: ladderRound, ladder: info(), me: { ...own({ canLifeline: false }), result } }));
      expect(screen.getByText('Неправильно.')).toBeTruthy();
      expect(document.querySelector('.result')!.classList.contains('is-wrong')).toBe(true);
    });

    it('the hall sees its points at the reveal as usual', () => {
      const result = { accepted: true, accuracy: 1, grade: 'correct' as const, streakBonus: 0, points: 10 };
      show(view({ phase: 'reveal', questionIndex: 0, question: publicQuestion, round: ladderRound, ladder: info(), me: { ...own({ role: 'hall', canLifeline: false }), result } }));
      expect(document.querySelector('.earned')!.textContent).toContain('10');
    });

    it('the leaderboard shows the decision and the ladder instead of the standings; take sends player:ladder', () => {
      const send = show(view({ phase: 'leaderboard', round: ladderRound, ladder: info({ decision: 'pending', banked: 1000 }), me: own({ canDecide: true, canLifeline: false }), standings: null }));
      expect(document.querySelector('.standings')).toBeNull();
      expect(document.querySelector('.ladder-board')).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Забрати 1000' }));
      expect(send).toHaveBeenCalledWith('player:ladder', { take: true });
    });

    it('the decision stays on a pause but its buttons are disabled', () => {
      show(view({ phase: 'leaderboard', paused: true, round: ladderRound, ladder: info({ decision: 'pending' }), me: own({ canDecide: false, canLifeline: false }), standings: null }));
      expect(screen.getByRole('button', { name: 'Граю далі' }).hasAttribute('disabled')).toBe(true);
    });

    it('others wait while the contestant decides, then see the outcome from the guaranteed sum', () => {
      show(view({ phase: 'leaderboard', round: ladderRound, ladder: info({ decision: 'pending' }), me: own({ role: 'hall' }), standings: null }));
      expect(screen.getByText('Олена вирішує: грати далі чи забрати гроші…')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Граю далі/ })).toBeNull();
      cleanup();
      // Після помилки — гарантована сума з підсумку, а не останній пройдений рівень (banked).
      show(
        view({
          phase: 'leaderboard',
          round: ladderRound,
          ladder: info({ banked: 3000, guaranteed: 1000, outcome: { kind: 'wrong', passed: 4, points: 1000 } }),
          me: own({ role: 'hall' }),
          standings: null,
        }),
      );
      expect(screen.getByText('Помилка — Олена отримує 1000')).toBeTruthy();
      expect(document.querySelector('.ladder-state')!.textContent).not.toContain('3000');
      cleanup();
      // Учасник вийшов — рядок без порожнього імені.
      show(
        view({
          phase: 'leaderboard',
          round: ladderRound,
          ladder: info({ contestant: null, outcome: { kind: 'stopped', passed: 1, points: 0 } }),
          me: own({ role: 'hall' }),
          standings: null,
        }),
      );
      expect(document.querySelector('.ladder-state')!.textContent).toBe('Драбину зупинено: учасник вийшов');
    });

    it('play on shows the keep-going line', () => {
      show(view({ phase: 'leaderboard', round: ladderRound, ladder: info({ decision: 'go' }), me: own({ canLifeline: false }), standings: null }));
      expect(screen.getByText('Граємо далі!')).toBeTruthy();
    });

    it('the round end tells the contestant the prize', () => {
      show(view({ phase: 'round_end', round: ladderRound, ladder: info(), me: own({ won: 1000, canLifeline: false }), standings }));
      expect(screen.getByText('Твій виграш: 1000')).toBeTruthy();
    });
  });

  describe('survival', () => {
    const survivalRound: RoundInfo = { index: 0, total: 1, title: '', type: 'survival', partial: false, description: '', brief: emptyBrief('survival'), times: null };
    type Own = NonNullable<PlayerView['me']['survival']>;
    const own = (over: Partial<Own> = {}) => ({
      ...me,
      survival: { status: 'alive' as const, outAfter: null, ghostCorrect: null, canAnswerTrial: false, trialAnswer: null, canPickDoor: false, door: null, result: null, bonus: null, ...over },
    });
    const board = (over: Partial<NonNullable<PlayerView['survival']>> = {}): NonNullable<PlayerView['survival']> => ({
      current: 0,
      total: 3,
      target: 1,
      bonus: 500,
      trialKind: 'luck',
      trialsLeft: 0,
      rows: [
        { playerId: 'p1', nickname: 'Олена', status: 'alive', outAfter: null, ghost: null, answer: null, trial: null, door: null },
        { playerId: 'p2', nickname: 'Іван', status: 'ghost', outAfter: 1, ghost: null, answer: null, trial: null, door: null },
      ],
      aliveCount: 1,
      ghostCount: 1,
      ghosts: { answered: 0, right: null },
      verdict: null,
      trial: null,
      ending: false,
      ...over,
    });
    const standings = [{ participantId: 'p1', nickname: 'Олена', score: 0, totalTimeMs: 0, rank: 1 }];

    it('a ghost sees the banner and the answer field, and answers for themselves', () => {
      const send = show(onQuestion({ round: survivalRound, survival: board(), me: own({ status: 'ghost', outAfter: 1 }) }));
      expect(screen.getByText('Ти привид: відповідай для себе — балів не буде.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
      expect(send).toHaveBeenCalledWith('player:answer', { type: 'single', optionId: 'b' });
    });

    it('a ghost who answered sees the for-yourself line', () => {
      show(onQuestion({ round: survivalRound, survival: board(), me: { ...own({ status: 'ghost', outAfter: 1 }), answer: { type: 'single', optionId: 'b' } } }));
      expect(screen.getByText('Відповідь для себе прийнято.')).toBeTruthy();
    });

    it('a living player gets no ghost banner', () => {
      show(onQuestion({ round: survivalRound, survival: board(), me: own() }));
      expect(screen.queryByText(/Ти привид/)).toBeNull();
    });

    it('the ghost reveal says guessed or not, without points', () => {
      const result = { accepted: true, accuracy: 1, grade: 'correct' as const, streakBonus: 0, points: 300 };
      show(view({ phase: 'reveal', questionIndex: 0, question: publicQuestion, round: survivalRound, survival: board(), me: { ...own({ status: 'ghost', ghostCorrect: true, outAfter: 1 }), result } }));
      expect(screen.getByText('Відгадав(-ла) — для себе.')).toBeTruthy();
      expect(screen.queryByText(/\+300/)).toBeNull();
      cleanup();
      show(view({ phase: 'reveal', questionIndex: 0, question: publicQuestion, round: survivalRound, survival: board(), me: own({ status: 'ghost', ghostCorrect: false, outAfter: 1 }) }));
      expect(screen.getByText('Не відгадав(-ла).')).toBeTruthy();
    });

    it('a player on the edge is told so under the verdict', () => {
      show(view({ phase: 'reveal', questionIndex: 0, question: publicQuestion, round: survivalRound, survival: board(), me: own({ status: 'edge' }) }));
      expect(screen.getByText('Ти на межі — зараз випробування.')).toBeTruthy();
    });

    it('the leaderboard shows the trial and the board instead of the standings', async () => {
      const luck = { kind: 'luck' as const, fellBack: false, stage: 'open' as const, endsAt: Date.now() + 10_000, remainingMs: null, limitMs: 10_000, done: 0, total: 1, question: null, reveal: null };
      const rows = [{ playerId: 'p1', nickname: 'Олена', status: 'edge' as const, outAfter: null, ghost: null, answer: null, trial: 'pending' as const, door: null }];
      const send = show(view({ phase: 'leaderboard', round: survivalRound, survival: board({ rows, trial: luck, verdict: 'trial' }), me: own({ status: 'edge', canPickDoor: true }), standings: null }));
      expect(document.querySelector('.standings')).toBeNull();
      expect(document.querySelector('.survival-board')).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Двері 3' }));
      expect(send).toHaveBeenCalledWith('player:door', { door: 2 });
    });

    it('a survival question answer goes out as player:trial', () => {
      const question = { ...publicQuestion, id: 't1' };
      const trial = { kind: 'question' as const, fellBack: false, stage: 'open' as const, endsAt: Date.now() + 10_000, remainingMs: null, limitMs: 10_000, done: 0, total: 1, question, reveal: null };
      const send = show(view({ phase: 'leaderboard', round: survivalRound, survival: board({ trial, verdict: 'trial' }), me: own({ status: 'edge', canAnswerTrial: true }), standings: null }));
      fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
      expect(send).toHaveBeenCalledWith('player:trial', { answer: { type: 'single', optionId: 'b' } });
    });

    it('without a trial the leaderboard shows the verdict and the board', () => {
      show(view({ phase: 'leaderboard', round: survivalRound, survival: board({ verdict: 'all_wrong' }), me: own(), standings: null }));
      expect(screen.getByText('Помилилися всі — ніхто не вибуває.')).toBeTruthy();
      expect(document.querySelector('.survival-board')).not.toBeNull();
      cleanup();
      show(view({ phase: 'leaderboard', round: survivalRound, survival: board({ verdict: 'all_right' }), me: own(), standings: null }));
      expect(screen.getByText('Усі вціліли.')).toBeTruthy();
    });

    it('the round end shows the bonus to the living and the drop-out question to the ghost', () => {
      show(view({ phase: 'round_end', round: survivalRound, survival: board(), me: own({ bonus: 500 }), standings }));
      expect(screen.getByText('Ти дожив(-ла) до кінця: +500')).toBeTruthy();
      cleanup();
      show(view({ phase: 'round_end', round: survivalRound, survival: board(), me: own({ status: 'ghost', outAfter: 2 }), standings }));
      expect(screen.getByText('Ти вибув(-ла) після запитання 2.')).toBeTruthy();
    });

    it('the finished screen of a game that ends on a survival round shows the bonus or when you dropped out', () => {
      show(view({ phase: 'finished', round: survivalRound, survival: board(), me: own({ bonus: 500 }), standings }));
      expect(screen.getByText('Ти дожив(-ла) до кінця: +500')).toBeTruthy();
      cleanup();
      show(view({ phase: 'finished', round: survivalRound, survival: board(), me: own({ status: 'ghost', outAfter: 4 }), standings }));
      expect(screen.getByText('Ти вибув(-ла) після запитання 4.')).toBeTruthy();
    });
  });
});

describe('PlayerScreen: teams', () => {
  const asQuestion = (team: Parameters<typeof teamPlayerView>[1] = {}, over: Partial<PlayerView> = {}) =>
    teamPlayerView({ phase: 'question', questionIndex: 0, question: publicQuestion, endsAt: Date.now() + 20_000, ...over }, team);
  const noCaptain = { captain: false, canAct: false, memberId: 'u3' };

  it('the header shows the person, the score is the team score, and the team strip sits under it', () => {
    show(teamPlayerView({ me: { ...baseMe, score: 120 } }));
    const bar = document.querySelector('header.bar')!;
    expect(bar.querySelector('span')?.textContent).toBe('Оля');
    expect(bar.querySelector('.score')?.textContent).toBe('120');
    expect(document.querySelector('.team-bar')?.textContent).toContain('Сині');
    expect(screen.getByText('Ти капітан')).toBeTruthy();
  });

  it('a solo single tap still submits at once', () => {
    const send = show(onQuestion());
    fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    expect(send).toHaveBeenCalledWith('player:answer', { type: 'single', optionId: 'b' });
    expect(send).not.toHaveBeenCalledWith('player:draft', expect.anything());
  });

  it('a team that is only a board spectator does not switch to the watch screen', () => {
    const board = {
      categories: [],
      order: [],
      turn: { playerId: 'team-a', nickname: 'Червоні' },
      cell: { id: 'c1', category: 'Т', price: 100, kind: 'question', mark: 'none', answerMode: 'typed' },
      dice: null,
    } as unknown as PlayerView['board'];
    show(asQuestion(noCaptain, { board }));
    expect(screen.queryByText(/радьте вголос/)).toBeNull();
  });

  it('on a spoken cell teammates are told to answer aloud, not to watch the captain', () => {
    const board = {
      categories: [],
      order: [],
      turn: { playerId: 'team-b', nickname: 'Сині' },
      cell: { id: 'c1', category: 'Т', price: 100, kind: 'question', mark: 'none', answerMode: 'voice' },
      dice: null,
    } as unknown as PlayerView['board'];
    show(asQuestion(noCaptain, { board }));
    expect(screen.getByText('Відповідайте вголос')).toBeTruthy();
    expect(screen.queryByText(/радьте вголос/)).toBeNull();
  });

  it('on the board teammates are told the captain picks the cell', () => {
    const board = {
      categories: [],
      order: [],
      turn: { playerId: 'team-b', nickname: 'Сині' },
      cell: null,
      marks: [],
      schedule: [],
      dice: null,
    } as unknown as PlayerView['board'];
    show(teamPlayerView({ phase: 'board', board }, noCaptain));
    expect(screen.getByText('Капітан Оля вибирає клітинку')).toBeTruthy();
  });

  it('the lobby shows the team picker', () => {
    show(teamPlayerView({}, { canPick: true }));
    expect(document.querySelectorAll('.team-pick')).toHaveLength(2);
  });

  it('a teammate on a classic question watches instead of answering', () => {
    show(asQuestion({ ...noCaptain, draft: { type: 'single', optionId: 'b' } }));
    expect(screen.getByText('Відповідає капітан Оля — радьте вголос')).toBeTruthy();
    expect(document.querySelector('.choice.is-draft')).not.toBeNull();
    expect(document.querySelector('.inputs')).toBeNull();
    expect(screen.queryByRole('button', { name: /Київ/ })).toBeNull();
  });

  it('the captain picks, the draft goes out after 250 ms, and Відповісти sends the answer', () => {
    vi.useFakeTimers();
    try {
      const send = show(asQuestion());
      fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
      expect(send).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(send).toHaveBeenCalledWith('player:draft', { draft: { type: 'single', optionId: 'b' } });
      fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
      expect(send).toHaveBeenLastCalledWith('player:answer', { type: 'single', optionId: 'b' });
      expect(screen.getByText('Ти відповідаєш за команду')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a teammate answers a poll on their own', () => {
    const poll = { ...publicQuestion, type: 'poll' as const };
    const send = show(asQuestion(noCaptain, { question: poll }));
    expect(document.querySelector('.choice.is-draft')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    expect(send).toHaveBeenCalledWith('player:answer', { type: 'poll', optionId: 'b' });
  });

  describe('blitz', () => {
    const round: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false, description: '', brief: emptyBrief('blitz'), times: null };
    const text = { ...publicQuestion, type: 'text' as const, choices: [] };
    const blitzMe = (blitz: Partial<NonNullable<PlayerView['me']['blitz']>>) => ({
      ...baseMe,
      blitz: { position: null, attemptsUsed: 0, attemptsLeft: null, canBuzz: true, deadline: null, canAnswer: false, grade: null, ...blitz },
    });
    const blitz = { queue: [], winner: null, instant: false, rows: [] };

    it('a teammate can buzz; after the buzz is theirs they get the answer field', () => {
      const send = show(asQuestion({ ...noCaptain, canAct: true }, { round, question: text, blitz, me: blitzMe({}) }));
      fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
      expect(send).toHaveBeenCalledWith('player:buzz');
      cleanup();
      show(asQuestion({ ...noCaptain, canAct: true, buzzerId: 'u3' }, { round, question: text, blitz, me: blitzMe({ position: 1, canBuzz: false }) }));
      expect(screen.getByRole('textbox')).toBeTruthy();
      expect(screen.getByText('Відповідає Петро')).toBeTruthy();
    });

    it('while another teammate answers, the rest watch', () => {
      show(asQuestion({ ...noCaptain, buzzerId: 'u2' }, { round, question: text, blitz, me: blitzMe({ position: 1, canBuzz: false }) }));
      expect(screen.getByText('Відповідає Оля — радьте вголос')).toBeTruthy();
      expect(screen.queryByText(/Відповідає капітан/)).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('the draft of a buzzer is marked neutrally, not as the captain choice', () => {
      const draft = { type: 'text' as const, value: 'Київ' };
      show(asQuestion({ ...noCaptain, buzzerId: 'u2', draft }, { round, question: text, blitz, me: blitzMe({ position: 1, canBuzz: false }) }));
      expect(document.querySelector('.team-draft .draft-mark')?.textContent).toBe('чернетка');
    });

    it('an offline buzzer falls back to the captain wording', () => {
      show(asQuestion({ ...noCaptain, buzzerId: 'u4' }, { round, question: text, blitz, me: blitzMe({ position: 1, canBuzz: false }) }));
      expect(screen.queryByText(/Ната/)).toBeNull();
    });
  });

  it('a teammate sees the captain decide in «Ва-банк» and gets no buttons', () => {
    const round: RoundInfo = { index: 0, total: 1, title: '', type: 'wipeout', partial: false, description: '', brief: emptyBrief('wipeout'), times: null };
    const ladder = {
      ladder: [100, 200, 300],
      current: 2,
      done: 3,
      rows: [{ playerId: 'team-b', nickname: 'Сині', status: 'in' as const, bank: 300, step: null, decision: null }],
      inCount: 1,
      decide: { endsAt: Date.now() + 8_000, remainingMs: null, decided: 0, total: 1 },
    };
    const own = { ...baseMe, wipeout: { status: 'in' as const, bank: 300, decision: null, canDecide: true } };
    show(teamPlayerView({ phase: 'leaderboard', round, wipeout: ladder, me: own }, noCaptain));
    expect(screen.getByText('Капітан вирішує за команду…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Забрати 300' })).toBeNull();
    cleanup();
    show(teamPlayerView({ phase: 'leaderboard', round, wipeout: ladder, me: own }));
    expect(screen.getByRole('button', { name: 'Забрати 300' })).toBeTruthy();
  });

  it('a teammate sees the captain place the final wager', () => {
    show(teamPlayerView({ phase: 'wager', me: { ...baseMe, final: { wager: null, limit: 500, allIn: false } } }, noCaptain));
    expect(screen.getByText('Капітан ставить за команду')).toBeTruthy();
    expect(document.querySelector('.wager-form')).toBeNull();
  });

  it('a debuff acts on the captain phone only; teammates get a strip', () => {
    const me = { ...baseMe, debuff: { kind: 'mirror' as const, since: Date.now(), by: null } };
    show(asQuestion({}, { me }));
    expect(document.querySelector('[data-debuff="mirror"]')).not.toBeNull();
    expect(screen.queryByText(/На капітані дебаф/)).toBeNull();
    cleanup();
    show(asQuestion(noCaptain, { me }));
    expect(document.querySelector('[data-debuff]')).toBeNull();
    expect(screen.getByText(/На капітані дебаф: /)).toBeTruthy();
  });

  it('the captain of a duelling team gets the duelist picker', () => {
    show(teamPlayerView({ phase: 'question', questionIndex: 0, question: publicQuestion }, { canPickDuelist: true, duelistId: 'u2' }));
    expect(screen.getByText('Хто з команди піде на дуель?')).toBeTruthy();
  });
});
