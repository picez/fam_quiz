// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyBrief, type Question, RoundInfo, StageView } from '@quiz/shared';
import { StageScreen } from './StageScreen';

afterEach(cleanup);

const choices = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
];
const question = { type: 'single' as const, text: 'Столиця України?', imageUrl: null, video: null, timeLimit: 20, points: 1000, choices, right: [], chain: null, orderLabels: null };
const full: Question = { id: 'q1', type: 'single', text: question.text, imageUrl: null, video: null, timeLimit: 20, points: 1000, options: choices, correctId: 'b' };

const view = (over: Partial<StageView> = {}): StageView => ({
  role: 'stage',
  phase: 'lobby',
  paused: false,
  blitz: null,
  board: null,
  spotlight: null,
  final: null,
  chain: null,
  round: null,
  questionIndex: -1,
  total: 3,
  question: null,
  endsAt: null,
  remainingMs: null,
  playerCount: 0,
  answeredCount: 0,
  limitMs: null,
  held: false,
  players: [],
  reveal: null,
  stats: null,
  standings: null,
  ...over,
});

const show = (current: StageView, hostOnline = true) =>
  render(
    <StageScreen view={current} code="123456" joinUrl="http://quiz.test/play/123456" offsetMs={0} hostOnline={hostOnline} />,
  );

describe('StageScreen', () => {
  it('the stage shows the image and the video together, without a timer', () => {
    const both = { ...question, imageUrl: '/uploads/a.png', video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null };
    show(view({ phase: 'question', questionIndex: 0, question: both, endsAt: null, remainingMs: null }));
    expect(document.querySelector('img.question-image')).not.toBeNull();
    expect(document.querySelector('iframe')).not.toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('the video title is masked during the question and open at the reveal', () => {
    const withVideo = { ...question, video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null };
    show(view({ phase: 'question', questionIndex: 0, question: withVideo, endsAt: null, remainingMs: null }));
    expect(document.querySelector('.video-mask')?.textContent).toBe('Назву відео приховано до відповіді');
    cleanup();
    show(view({ phase: 'reveal', questionIndex: 0, question: withVideo, reveal: full }));
    expect(document.querySelector('iframe')).not.toBeNull();
    expect(document.querySelector('.video-mask')).toBeNull();
  });

  it('invites players with the address and the code split for reading aloud', () => {
    show(view());
    expect(screen.getByText('quiz.test')).toBeTruthy();
    expect(screen.getByText('123 456')).toBeTruthy();
    expect(screen.getByText('Чекаємо на перших гравців')).toBeTruthy();
  });

  it('lists the players who joined', () => {
    show(
      view({
        playerCount: 2,
        players: [
          { id: 'p1', nickname: 'Олена', connected: true, streak: 0 },
          { id: 'p2', nickname: 'Тарас', connected: false, streak: 0 },
        ],
      }),
    );
    expect(screen.getByText('У грі: 2')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText('Тарас')).toBeTruthy();
  });

  it('shows the question with lettered options and the answer count', () => {
    show(view({ phase: 'question', questionIndex: 0, question, endsAt: Date.now() + 20_000, playerCount: 12, answeredCount: 7 }));
    expect(screen.getByText('Столиця України?')).toBeTruthy();
    expect(screen.getByText('Запитання 1 з 3 · лишилося 2')).toBeTruthy();
    expect(screen.getByText('Відповіли 7 з 12')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['AЛьвів', 'BКиїв']);
    expect(screen.getByRole('timer')).toBeTruthy();
  });

  it('the stage shows picture options as a grid with letters', () => {
    const pic = '/uploads/abcdefabcdefabcd.png';
    const pictured = { ...question, choices: [{ id: 'a', text: '', imageUrl: pic }, { id: 'b', text: 'Київ', imageUrl: pic }, { id: 'c', text: 'Одеса' }] };
    const { container } = show(view({ phase: 'question', questionIndex: 0, question: pictured, endsAt: Date.now() + 20_000 }));
    const list = container.querySelector('.choices.has-images') as HTMLElement;
    expect(list).toBeTruthy();
    expect(list.querySelectorAll('img')).toHaveLength(2);
    expect([...list.querySelectorAll('.letter')].map((letter) => letter.textContent)).toEqual(['A', 'B', 'C']);
    expect(screen.getByAltText('Картинка A')).toBeTruthy();
  });

  it('tells players to type on their phones for a text question', () => {
    show(view({ phase: 'question', questionIndex: 0, question: { ...question, type: 'text', choices: [] } }));
    expect(screen.getByText('Введіть відповідь на телефоні')).toBeTruthy();
  });

  it('marks the correct option and shows vote counts on reveal', () => {
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        question,
        reveal: full,
        stats: { answered: 3, accepted: 2, counts: { a: 1, b: 2 } },
      }),
    );
    const items = screen.getAllByRole('listitem');
    expect(items[1].className).toContain('is-correct');
    expect(items[0].className).not.toContain('is-correct');
    expect(items[1].textContent).toContain('2');
    expect(screen.getByText('Правильна відповідь: B. Київ')).toBeTruthy();
  });

  it('shows the leaderboard and the final podium', () => {
    const standings = [
      { participantId: 'p1', nickname: 'Олена', score: 900, totalTimeMs: 1, rank: 1 },
      { participantId: 'p2', nickname: 'Тарас', score: 400, totalTimeMs: 1, rank: 2 },
    ];
    show(view({ phase: 'leaderboard', questionIndex: 0, standings }));
    expect(screen.getByText('Рейтинг')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    cleanup();

    show(view({ phase: 'finished', questionIndex: 2, standings }));
    expect(screen.getByText('Переможці')).toBeTruthy();
    expect(screen.getByText('900')).toBeTruthy();
  });

  it('shrinks a long question so the options stay on screen', () => {
    show(view({ phase: 'question', questionIndex: 0, question: { ...question, text: 'Д'.repeat(130) } }));
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('is-long');
    cleanup();

    show(view({ phase: 'question', questionIndex: 0, question: { ...question, text: 'Д'.repeat(250) } }));
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('is-xlong');
  });

  it('says the game is paused, or that the host is away', () => {
    show(view({ phase: 'question', questionIndex: 0, question, paused: true, remainingMs: 9000 }));
    expect(screen.getByRole('status').textContent).toBe('Пауза');
    cleanup();

    show(view({ phase: 'question', questionIndex: 0, question, paused: true, remainingMs: 9000 }), false);
    expect(screen.getByRole('status').textContent).toBe('Чекаємо на ведучого');
  });
});

describe('StageScreen: rounds', () => {
  const round: RoundInfo = { index: 0, total: 2, title: 'Розминка', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null };

  it('announces the round on the intro', () => {
    show(view({ phase: 'intro', round }));
    expect(screen.getByText('Раунд 1 з 2')).toBeTruthy();
    expect(screen.getByText('Розминка')).toBeTruthy();
  });

  it('the intro shows the author note and the rules summary', () => {
    show(view({ phase: 'intro', round: { ...round, description: 'Кіно 90-х', brief: { ...emptyBrief('blitz'), attempts: 1, answerWindow: 15 } } }));
    expect(screen.getByText('Кіно 90-х')).toBeTruthy();
    expect(screen.getByText('Бали отримує лише той, хто першим правильно відповість.')).toBeTruthy();
  });

  it('the intro shows the rules summary without an empty note', () => {
    show(view({ phase: 'intro', round: { ...round, brief: { ...emptyBrief('classic'), speedBonus: true }, times: null } }));
    expect(document.querySelector('.round-brief-note')).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Як нараховуються бали' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('the intro of a one-round quiz shows the rules without a round counter', () => {
    show(view({ phase: 'intro', round: { index: 0, total: 1, title: '', type: 'classic', partial: false, description: '', brief: { ...emptyBrief('classic'), speedBonus: true }, times: null } }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Раунд 1');
    expect(screen.getByText('Відповідають усі: бали отримує кожен, хто відповів правильно.')).toBeTruthy();
    expect(screen.queryByText('Раунд 1 з 1')).toBeNull();
  });

  it('names an untitled round «Раунд N» in the intro heading', () => {
    show(view({ phase: 'intro', round: { ...round, index: 1, title: '' } }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Раунд 2');
  });

  it('shows the standings under «round results» at the end of a round', () => {
    const standings = [{ participantId: 'p1', nickname: 'Олена', score: -300, totalTimeMs: 1, rank: 1 }];
    show(view({ phase: 'round_end', round, standings, players: [{ id: 'p1', nickname: 'Олена', connected: true, streak: 2 }] }));
    expect(screen.getByText('Підсумки раунду 1')).toBeTruthy();
    expect(screen.getByText('−300')).toBeTruthy();
    expect(screen.getByText('🔥 2')).toBeTruthy();
  });

  it('numbers the question inside the round', () => {
    show(view({ phase: 'question', round, questionIndex: 1, total: 5, question, endsAt: Date.now() + 20_000 }));
    expect(screen.getByText(/Запитання 2 з 5/)).toBeTruthy();
    expect(screen.getByText(/Раунд 1/)).toBeTruthy();
  });
});

describe('StageScreen: blitz', () => {
  const round: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false, description: '', brief: emptyBrief('blitz'), times: null };
  const queue = [
    { playerId: 'p1', nickname: 'Олена' },
    { playerId: 'p2', nickname: 'Тарас' },
  ];

  it('shows the blitz queue and the winner at the reveal', () => {
    show(view({ phase: 'question', round, questionIndex: 0, question, blitz: { queue, winner: null, instant: false, rows: [] } }));
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText('Тарас')).toBeTruthy();
    expect(screen.getByText('Перевіряємо')).toBeTruthy();
    cleanup();

    show(view({ phase: 'reveal', round, questionIndex: 0, question, reveal: full, blitz: { queue: [], winner: queue[1], instant: false, rows: [] } }));
    expect(screen.getByText('Першим правильно відповів: Тарас')).toBeTruthy();
    cleanup();

    show(view({ phase: 'reveal', round, questionIndex: 0, question, reveal: full, blitz: { queue: [], winner: null, instant: false, rows: [] } }));
    expect(screen.getByText('Ніхто не відповів правильно')).toBeTruthy();
  });

  it('names the current head, not the last wrong answer, as answering', () => {
    const spotlight = { playerId: 'p2', nickname: 'Тарас', answer: { type: 'single' as const, optionId: 'a' }, grade: 'wrong' as const };
    show(view({ phase: 'question', round, questionIndex: 0, question, spotlight, blitz: { queue: [queue[0]], winner: null, instant: false, rows: [] } }));
    expect(screen.getByText('Відповідає Олена')).toBeTruthy();
    expect(screen.queryByText('Відповідає Тарас')).toBeNull();
    cleanup();
    show(view({ phase: 'question', round, questionIndex: 0, question, spotlight, blitz: { queue: [], winner: null, instant: false, rows: [] } }));
    expect(screen.queryByText(/Відповідає/)).toBeNull();
  });

  describe('instant blitz', () => {
    const instantRound: RoundInfo = { ...round, brief: { ...emptyBrief('blitz'), instant: true } };
    const rows = [
      { playerId: 'p1', nickname: 'Оля', timeMs: 2400, grade: 'wrong' as const, answer: null },
      { playerId: 'p2', nickname: 'Петро', timeMs: 3100, grade: null, answer: null },
    ];
    const instantView = (over: Partial<StageView> = {}) =>
      view({ phase: 'question', round: instantRound, questionIndex: 0, question, playerCount: 3, answeredCount: 2, blitz: { queue: [], winner: null, instant: true, rows }, ...over });

    it('the stage shows no picks and no answering line in an instant blitz until the reveal', () => {
      show(instantView());
      const list = document.querySelector('ol.blitz-queue');
      expect(list?.textContent).toContain('Оля');
      expect(list?.textContent).toContain('2,4 с');
      expect(list?.textContent).toContain('✗');
      expect(document.querySelector('.given')).toBeNull();
      expect(screen.queryByText(/Відповідає/)).toBeNull();
      expect(document.querySelector('.choice.is-pending')).toBeNull();
      expect(screen.getByText(/Відповіли 2 з 3/)).toBeTruthy();
    });

    it('on locked the stage shows the winner, on reveal the picks and the correct option', () => {
      const won = [{ ...rows[0], grade: 'wrong' as const }, { ...rows[1], grade: 'correct' as const }];
      show(instantView({ phase: 'locked', blitz: { queue: [], winner: { playerId: 'p2', nickname: 'Петро' }, instant: true, rows: won } }));
      expect(screen.getByText('Першим правильно відповів: Петро')).toBeTruthy();
      expect(document.querySelector('.given')).toBeNull();
      cleanup();
      const open = won.map((row, index) => ({ ...row, answer: { type: 'single' as const, optionId: index === 0 ? 'a' : 'b' } }));
      show(
        instantView({
          phase: 'reveal',
          reveal: full,
          stats: { answered: 2, accepted: 1, counts: { a: 1, b: 1 } },
          blitz: { queue: [], winner: { playerId: 'p2', nickname: 'Петро' }, instant: true, rows: open },
        }),
      );
      expect(document.querySelectorAll('.blitz-queue .given').length).toBe(2);
      expect(document.querySelector('.choice.is-correct')).not.toBeNull();
      expect(document.querySelectorAll('.choice .count').length).toBe(2);
    });

    it('a row blinks when its verdict arrives', () => {
      const { rerender } = show(instantView());
      expect(document.querySelector('.blitz-mark.is-blinking')).toBeNull();
      const graded = rows.map((row) => (row.playerId === 'p2' ? { ...row, grade: 'correct' as const } : row));
      rerender(
        <StageScreen view={instantView({ blitz: { queue: [], winner: null, instant: true, rows: graded } })} code="123456" joinUrl="http://quiz.test/play/123456" offsetMs={0} hostOnline />,
      );
      expect(document.querySelector('.blitz-mark.is-blinking')).not.toBeNull();
    });

    it('the button blitz reserves the answering line', () => {
      show(view({ phase: 'question', round, questionIndex: 0, question, blitz: { queue: [], winner: null, instant: false, rows: [] } }));
      const line = document.querySelector('p.answering-line');
      expect(line).not.toBeNull();
      expect(line?.textContent).toBe('');
    });
  });

  describe('board round', () => {
    const round: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: null };
    const boardOf = (over: Partial<NonNullable<StageView['board']>> = {}): NonNullable<StageView['board']> => ({
      categories: [
        {
          id: 'k1',
          title: 'Міста',
          cells: [
            { id: 'c1', price: 100, played: false, mark: 'none', kind: 'normal', answerMode: 'phone', penalty: 'none' },
            { id: 'c2', price: 200, played: true, mark: 'none', kind: 'normal', answerMode: 'phone', penalty: 'none' },
          ],
        },
        { id: 'k2', title: 'Ріки', cells: [{ id: 'c3', price: 100, played: false, mark: 'none', kind: 'normal', answerMode: 'phone', penalty: 'none' }] },
      ],
      order: [
        { playerId: 'p1', nickname: 'Олена' },
        { playerId: 'p2', nickname: 'Анна' },
      ],
      turn: { playerId: 'p2', nickname: 'Анна' },
      cell: null,
      rolls: 0,
      skipAt: null,
      ...over,
    });

    it('shows the board with hidden marks, played cells and whose turn it is', () => {
      const { container } = show(view({ phase: 'board', round, board: boardOf() }));
      expect(screen.getByText('Міста')).toBeTruthy();
      expect(screen.getByText('Ріки')).toBeTruthy();
      expect(screen.getAllByText('100')).toHaveLength(2);
      // зіграна клітинка порожня
      expect(screen.queryByText('200')).toBeNull();
      expect(container.textContent).not.toMatch(/×[23]/);
      expect(screen.getAllByText('Вибирає Анна').length).toBeGreaterThan(0);
      expect(container.querySelector('.is-turn')?.textContent).toContain('Анна');
    });

    it('the turn order is its own list, not the order-question list', () => {
      const { container } = show(view({ phase: 'board', round, board: boardOf() }));
      const turns = container.querySelector('ol.turn-order');
      expect(turns?.querySelector('li.is-turn')?.textContent).toBe('Анна');
      expect(container.querySelector('ol.order')).toBeNull();
    });

    it('the board stage shows the legend beside the board', () => {
      const { container } = show(view({ phase: 'board', round, board: boardOf() }));
      const legend = screen.getByRole('list', { name: 'Види клітинок' });
      expect(container.querySelector('.board-with-legend')?.contains(legend)).toBe(true);
    });

    it('shows the cell and the chooser above the question', () => {
      show(
        view({
          phase: 'question',
          round,
          questionIndex: 0,
          question,
          endsAt: Date.now() + 20_000,
          board: boardOf({ cell: { id: 'c1', category: 'Міста', price: 100, mark: 'x3', kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const } }),
        }),
      );
      expect(screen.getByText('Міста · 100')).toBeTruthy();
      expect(screen.getByText('Відповідає Анна')).toBeTruthy();
      expect(screen.getByText('×3')).toBeTruthy();
    });

    it('renders no multiplier for an unmarked cell', () => {
      show(
        view({
          phase: 'question',
          round,
          questionIndex: 0,
          question,
          endsAt: Date.now() + 20_000,
          board: boardOf({ cell: { id: 'c1', category: 'Міста', price: 100, mark: 'none', kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const } }),
        }),
      );
      expect(screen.getByText('Відповідає Анна')).toBeTruthy();
      expect(document.body.textContent).not.toContain('×');
    });

    it('rolls the dice when the roll counter changes', () => {
      const intro = (rolls: number) => (
        <StageScreen
          view={view({ phase: 'intro', round, board: boardOf({ turn: null, rolls }) })}
          code="123456"
          joinUrl="http://quiz.test/play/123456"
          offsetMs={0}
          hostOnline
        />
      );
      const { container, rerender } = render(intro(0));
      expect(container.querySelector('.is-rolling')).toBeNull();
      expect(screen.getByText('Олена')).toBeTruthy();
      rerender(intro(1));
      expect(container.querySelector('.is-rolling')).not.toBeNull();
    });
  });
});

describe('StageScreen: spotlight', () => {
  const round: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: null };
  const board = {
    categories: [],
    order: [{ playerId: 'p2', nickname: 'Анна' }],
    turn: { playerId: 'p2', nickname: 'Анна' },
    cell: { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const },
    rolls: 0,
    skipAt: null,
  };
  const picked = { playerId: 'p2', nickname: 'Анна', answer: { type: 'single' as const, optionId: 'a' } };
  const cls = (text: string) => screen.getByText(text).closest('.choice')?.className ?? '';

  it('colours the pending answer, then the verdict with the correct option at the reveal', () => {
    show(view({ phase: 'question', questionIndex: 0, question, round, board, endsAt: Date.now() + 20_000, spotlight: { ...picked, grade: null } }));
    expect(cls('Львів')).toContain('is-pending');
    expect(document.querySelector('.is-correct')).toBeNull();
    cleanup();
    show(view({ phase: 'reveal', questionIndex: 0, question, round, board, reveal: full, spotlight: { ...picked, grade: 'wrong' } }));
    expect(cls('Львів')).toContain('is-wrong');
    expect(cls('Київ')).toContain('is-correct');
  });
});

describe('StageScreen: match', () => {
  const matchQ = {
    type: 'match' as const,
    text: 'Пари',
    imageUrl: null,
    video: null,
    timeLimit: 20,
    points: 100,
    choices: [
      { id: 'a', text: 'Київ' },
      { id: 'b', text: 'Львів' },
      { id: 'c', text: 'Ужгород' },
    ],
    right: [
      { id: 'z', text: 'Уж' },
      { id: 'x', text: 'Дніпро' },
      { id: 'y', text: 'Полтва' },
    ],
    chain: null,
    orderLabels: null,
  };
  const matchFull: Question = {
    id: 'q',
    type: 'match',
    text: 'Пари',
    imageUrl: null,
    video: null,
    timeLimit: 20,
    points: 100,
    pairs: [
      { left: matchQ.choices[0], right: matchQ.right[1] },
      { left: matchQ.choices[1], right: matchQ.right[2] },
      { left: matchQ.choices[2], right: matchQ.right[0] },
    ],
  };

  it('shows both match columns during the question and only the correct pairs at the reveal', () => {
    const { container } = show(view({ phase: 'question', questionIndex: 0, question: matchQ, endsAt: Date.now() + 20_000 }));
    expect(container.querySelector('.match-columns')).not.toBeNull();
    expect(screen.getByText('З’єднайте пари на телефоні')).toBeTruthy();
    expect(container.querySelector('.match-list')).toBeNull();
    cleanup();
    const done = show(view({ phase: 'reveal', questionIndex: 0, question: matchQ, reveal: matchFull }));
    expect(done.container.querySelectorAll('li.match-row.is-correct').length).toBe(3);
    expect(screen.getByText('Правильні пари')).toBeTruthy();
    expect(screen.queryByText(/Правильна відповідь:/)).toBeNull();
  });

  it('the stage hint names the order labels', () => {
    const orderQ = { ...question, type: 'order' as const, choices };
    const at = { phase: 'question' as const, questionIndex: 0, endsAt: Date.now() + 20_000 };
    const labelled = show(view({ ...at, question: { ...orderQ, orderLabels: { top: 'Захід', bottom: 'Схід' } } }));
    expect(screen.getByText('Розставте на телефоні: зверху — Захід, знизу — Схід')).toBeTruthy();
    labelled.unmount();
    show(view({ ...at, question: { ...orderQ, orderLabels: { top: '', bottom: '' } } }));
    expect(screen.getByText('Розставте в правильному порядку на телефоні')).toBeTruthy();
  });

  it('a voice board cell shows the match columns without the phone hint', () => {
    const round: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: null };
    const board = {
      categories: [],
      order: [{ playerId: 'p2', nickname: 'Анна' }],
      turn: { playerId: 'p2', nickname: 'Анна' },
      cell: { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'voice' as const, penalty: 'none' as const },
      rolls: 0,
      skipAt: null,
    };
    const { container } = show(view({ phase: 'question', questionIndex: 0, question: matchQ, round, board, endsAt: Date.now() + 20_000 }));
    expect(container.querySelector('.match-columns')).not.toBeNull();
    expect(screen.queryByText('З’єднайте пари на телефоні')).toBeNull();
  });

  it("a voice cell shows the options to the stage and the host's mark in orange", () => {
    const round: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: null };
    const board = {
      categories: [],
      order: [{ playerId: 'p2', nickname: 'Анна' }],
      turn: { playerId: 'p2', nickname: 'Анна' },
      cell: { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'voice' as const, penalty: 'none' as const },
      rolls: 0,
      skipAt: null,
    };
    const at = { phase: 'question' as const, questionIndex: 0, round, board, endsAt: Date.now() + 20_000 };
    const marked = show(view({ ...at, question, spotlight: { playerId: 'p2', nickname: 'Анна', answer: { type: 'single', optionId: 'a' }, grade: null } }));
    expect(screen.getByText('Львів').closest('.choice')?.className).toContain('is-pending');
    expect(screen.getByText('Київ').closest('.choice')?.className).not.toContain('is-');
    marked.unmount();
    show(view({ ...at, question: { ...question, type: 'boolean', choices: [] } }));
    expect(screen.getByText('Так')).toBeTruthy();
    expect(screen.getByText('Ні')).toBeTruthy();
  });
  it('the stage shows a blitz cell with the chooser and the queue', () => {
    const round: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: null };
    const board = {
      categories: [],
      order: [{ playerId: 'p1', nickname: 'Алла' }],
      turn: { playerId: 'p1', nickname: 'Алла' },
      cell: { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'blitz' as const, answerMode: 'phone' as const, penalty: 'all' as const },
      rolls: 0,
      skipAt: null,
    };
    show(
      view({
        phase: 'question',
        questionIndex: 0,
        question,
        round,
        board,
        blitz: { queue: [{ playerId: 'p2', nickname: 'Богдан' }], winner: null, instant: false, rows: [] },
        endsAt: Date.now() + 20_000,
      }),
    );
    expect(screen.getByText('Бліц')).toBeTruthy();
    expect(screen.getByText('Вибір: Алла')).toBeTruthy();
    expect(screen.getAllByText('Відповідає Богдан').length).toBeGreaterThan(0);
    expect(screen.queryByText('Відповідає Алла')).toBeNull();
    expect(screen.getByText('Мінус для всіх, хто не відповість правильно')).toBeTruthy();
  });
});

describe('StageScreen final', () => {
  const round: RoundInfo = { index: 0, total: 1, title: 'Космос', type: 'final', partial: false, description: '', brief: emptyBrief('final'), times: null };
  const info = { theme: 'Космос', placed: 1, total: 3, shown: [], left: 0 };
  const entry = (nickname: string, wager: number, before: number, after: number) => ({
    playerId: nickname,
    nickname,
    answer: { type: 'single' as const, optionId: 'b' },
    grade: 'correct' as const,
    wager,
    before,
    after,
  });

  it('explains the wager on the intro only', () => {
    const { unmount } = show(view({ phase: 'intro', round, final: info }));
    expect(screen.getByText('Кожен таємно ставить від 0 до свого рахунку.')).toBeTruthy();
    unmount();
    show(view({ phase: 'wager', round, final: info }));
    expect(screen.queryByText('Кожен таємно ставить від 0 до свого рахунку.')).toBeNull();
  });

  it('shows the theme and how many have wagered', () => {
    show(view({ phase: 'wager', round, final: info }));
    expect(screen.getByText('Космос')).toBeTruthy();
    expect(screen.getByText('Ставки зроблено: 1 з 3')).toBeTruthy();
  });

  it('shows only revealed final players, the latest highlighted', () => {
    show(
      view({
        phase: 'reveal',
        round,
        questionIndex: 0,
        question,
        reveal: full,
        final: { ...info, shown: [entry('Віра', 100, 300, 400), entry('Богдан', 400, 400, 800)], left: 1 },
      }),
    );
    expect(screen.getByText('Віра')).toBeTruthy();
    expect(screen.getByText('Богдан').closest('li')?.className).toContain('wager-latest');
    expect(screen.getByText('Віра').closest('li')?.className).not.toContain('wager-latest');
    // Найновіший зверху: він завжди на екрані.
    expect(document.querySelector('.wager-list li')?.className).toContain('wager-latest');
    expect(screen.getByText('400 → 800')).toBeTruthy();
    expect(screen.getByText('Ставка 400')).toBeTruthy();
    expect(screen.getByText('Ще 1')).toBeTruthy();
    expect(screen.queryByText('Анна')).toBeNull();
  });

  it('hides the video and image during the reveal and keeps the answer', () => {
    const video = { id: 'dQw4w9WgXcQ', start: 0 };
    show(
      view({
        phase: 'reveal',
        round,
        questionIndex: 0,
        question: { ...question, video, imageUrl: '/uploads/a.png' },
        reveal: full,
        final: { ...info, shown: [entry('Віра', 100, 300, 400)], left: 1 },
      }),
    );
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(/Правильна відповідь/)).toBeTruthy();
  });

  it('the score delta is neutral when the score did not change', () => {
    show(
      view({
        phase: 'reveal',
        round,
        questionIndex: 0,
        question,
        reveal: full,
        final: { ...info, shown: [entry('Віра', 0, 300, 300)], left: 0 },
      }),
    );
    const delta = screen.getByText('300 → 300');
    expect(delta.className).not.toContain('is-up');
    expect(delta.className).not.toContain('is-down');
  });

  it('shows the chain with first letters and the progress during the question, the whole chain and the ranking at the reveal', () => {
    const chainQ = { ...question, type: 'chain' as const, choices: [], chain: { first: 'Форель', masks: [['Р', null, null, null]], hintSeconds: 5 } };
    const info = { total: 1, rows: [{ playerId: 'p1', nickname: 'Олена', solved: 1, hints: 0, timeMs: 5000, points: null }] };
    const { unmount } = show(view({ phase: 'question', questionIndex: 0, question: chainQ, endsAt: Date.now() + 20_000, playerCount: 2, answeredCount: 1, chain: info }));
    expect(screen.getByLabelText('Р___')).toBeTruthy();
    expect(screen.getByText('Вгадуйте слова ланцюжка на телефоні')).toBeTruthy();
    expect(screen.getByText('Пройшли 1 з 2')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Риба');
    unmount();
    const full: Question = { id: 'q8', type: 'chain', text: 'Ланцюжок', imageUrl: null, video: null, timeLimit: 20, points: 1000, words: ['Форель', 'Риба'], hintSeconds: 5 };
    show(view({ phase: 'reveal', questionIndex: 0, question: chainQ, reveal: full, chain: { ...info, rows: [{ ...info.rows[0], points: 1000 }] } }));
    expect(document.querySelector('.chain-words.is-correct')).not.toBeNull();
    expect(screen.getByLabelText('Риба')).toBeTruthy();
    expect(document.querySelector('.chain-board .rank')).not.toBeNull();
    expect(screen.queryByText(/Правильна відповідь:/)).toBeNull();
  });

  it('the intro shows the round facts', () => {
    show(view({ phase: 'intro', total: 10, round: { index: 0, total: 1, title: 'Місто', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: { min: 30, max: 60 } } }));
    expect(screen.getByText('10 запитань · 30–60 с на кожне')).toBeTruthy();
  });

  it('a question shows the full time, and the host wait in its place when held', () => {
    show(view({ phase: 'question', questionIndex: 0, question, endsAt: null, remainingMs: 45_000, limitMs: 60_000 }));
    expect(screen.getByText('/ 60 с')).toBeTruthy();
    cleanup();
    const { container } = show(view({ phase: 'question', questionIndex: 0, question, endsAt: null, remainingMs: 45_000, limitMs: 60_000, held: true }));
    expect(screen.getByText('Чекає рішення ведучого')).toBeTruthy();
    expect(screen.queryByText('/ 60 с')).toBeNull();
    expect(container.querySelector('.timer-bar')).not.toBeNull();
  });
});
