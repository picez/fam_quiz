// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyBrief, type AppealView, type WipeoutInfo, type WipeoutRow, type DuelInfo, type BoardInfo, type Question, RoundInfo, StageView, type SurvivalInfo, type SurvivalRow, type SurvivalTrialInfo } from '@quiz/shared';
import { StageScreen } from './StageScreen';
import { ROLL_MS } from './Dice';
import { ladderInfo } from './ladder-fixtures';
import { teamsView } from './team-test-view';

afterEach(cleanup);

const choices = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
];
const question = { type: 'single' as const, text: 'Столиця України?', imageUrl: null, video: null, timeLimit: 20, points: 1000, choices, right: [], chain: null, sort: null, orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null };
const full: Question = { id: 'q1', type: 'single', text: question.text, imageUrl: null, video: null, timeLimit: 20, points: 1000, options: choices, correctId: 'b' };

const view = (over: Partial<StageView> = {}): StageView => ({
  role: 'stage',
  autopilot: false,
  facts: null,
  appeal: null,
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
  debuffs: [],
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
  sliderMarks: null,
  pinMarks: null,
  wall: null,
  cloud: null, survey: null,
  cloudVoters: null,
  away: [],
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

  it('a long description on the stage is wide and clipped to fit, with the full text in the page', () => {
    const long = 'а'.repeat(600);
    show(view({ phase: 'intro', round: { ...round, description: long } }));
    expect(document.querySelector('.round-brief.is-long')).not.toBeNull();
    expect(document.querySelector('.round-brief-note.is-fit')?.textContent).toBe(long);
  });

  it('the final and ladder intros clip a long description too', () => {
    const long = 'а'.repeat(600);
    const finalRound: RoundInfo = { ...round, type: 'final', description: long, brief: emptyBrief('final') };
    show(view({ phase: 'intro', round: finalRound, final: { theme: 'Космос', placed: 0, total: 3, shown: [], left: 0, mode: 'classic', bank: 0, split: null } }));
    expect(document.querySelector('.round-brief-note.is-fit')).not.toBeNull();
    cleanup();
    const ladderRound: RoundInfo = { ...round, type: 'ladder', description: long, brief: emptyBrief('ladder') };
    show(view({ phase: 'intro', round: ladderRound, ladder: ladderInfo({ contestant: null, current: -1 }) }));
    expect(document.querySelector('.round-brief-note.is-fit')).not.toBeNull();
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

  describe('round end gains (11f)', () => {
    const row = (participantId: string, nickname: string, score: number, rank: number, rounds?: number[]) => ({ participantId, nickname, score, totalTimeMs: 1, rank, rounds });
    const four = [row('a', 'Віра', 2000, 1, [1500, 500]), row('b', 'Оля', 1100, 2, [600, 500]), row('c', 'Петро', 500, 3, [1000, -500]), row('d', 'Марко', 0, 4, [500, -500])];

    it('shows «+N за раунд» beside every row, the best of the round and the biggest climb', () => {
      show(view({ phase: 'round_end', round: { ...round, index: 1 }, standings: four }));
      expect(Array.from(document.querySelectorAll('.round-gain')).map((node) => node.textContent)).toEqual(['+500 за раунд', '+500 за раунд', '−500 за раунд', '−500 за раунд']);
      expect(document.querySelectorAll('.round-gain.is-minus')).toHaveLength(2);
      expect(document.querySelector('.round-best')!.textContent).toBe('Найкращі в раунді: Віра, Оля · +500');
      expect(document.querySelector('.round-climb')!.textContent).toBe('Найбільший ривок: Оля · +1 місце');
    });

    it('the first round has gains but no climb', () => {
      show(view({ phase: 'round_end', round, standings: [row('a', 'Віра', 500, 1, [500]), row('b', 'Оля', 300, 2, [300])] }));
      expect(document.querySelectorAll('.round-gain')).toHaveLength(2);
      expect(document.querySelector('.round-best')!.textContent).toBe('Найкращий у раунді: Віра · +500');
      expect(document.querySelector('.round-climb')).toBeNull();
    });

    it('standings without rounds show neither gains nor highlights', () => {
      show(view({ phase: 'round_end', round: { ...round, index: 1 }, standings: four.map((r) => ({ ...r, rounds: undefined })) }));
      expect(document.querySelector('.round-gain')).toBeNull();
      expect(document.querySelector('.round-highlights')).toBeNull();
    });

    it('with highlights the round end shows seven rows so the stage fits; without them eight', () => {
      const eight = Array.from({ length: 9 }, (_, i) => row(`p${i}`, `Гравець ${i}`, 900 - i * 100, i + 1, [900 - i * 100 - (i === 0 ? 0 : 100), i === 0 ? 0 : 100]));
      show(view({ phase: 'round_end', round: { ...round, index: 1 }, standings: eight }));
      expect(document.querySelector('.round-highlights')).not.toBeNull();
      expect(document.querySelector('.stage-board')!.classList.contains('has-highlights')).toBe(true);
      expect(document.querySelectorAll('.standings li')).toHaveLength(7);
      cleanup();
      show(view({ phase: 'round_end', round: { ...round, index: 1 }, standings: eight.map((r) => ({ ...r, rounds: [r.score, 0] })) }));
      expect(document.querySelector('.round-highlights')).toBeNull();
      expect(document.querySelectorAll('.standings li')).toHaveLength(8);
    });

    it('the leaderboard and the podium stay without gains', () => {
      show(view({ phase: 'leaderboard', questionIndex: 0, standings: four }));
      expect(document.querySelector('.round-gain')).toBeNull();
      cleanup();
      show(view({ phase: 'finished', questionIndex: 2, round: { ...round, index: 1 }, standings: four }));
      expect(document.querySelector('.round-gain')).toBeNull();
      expect(document.querySelector('.round-highlights')).toBeNull();
    });
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

    it('on locked without a winner the stage says nobody answered correctly, like the phones', () => {
      const lost = rows.map((row) => ({ ...row, grade: 'wrong' as const }));
      show(instantView({ phase: 'locked', blitz: { queue: [], winner: null, instant: true, rows: lost } }));
      expect(screen.getByText('Ніхто не відповів правильно')).toBeTruthy();
      expect(document.querySelector('.given')).toBeNull();
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
      dice: null,
      schedule: [],
      scheduleRepeats: false,
      skipAt: null,
      marks: [],
      marksHidden: false,
      ...over,
    });

    const olena = { playerId: 'p1', nickname: 'Олена' };
    const anna = { playerId: 'p2', nickname: 'Анна' };
    const introOf = (board: NonNullable<StageView['board']>) => view({ phase: 'intro', round, board });

    it('the board intro clips a long description to fit the stage', () => {
      show(view({ phase: 'intro', round: { ...round, description: 'а'.repeat(600) }, board: boardOf({ turn: null }) }));
      expect(document.querySelector('.round-brief.is-long .round-brief-note.is-fit')).not.toBeNull();
      // Дві колонки: опис і правила в лівій, кидки й розклад — окремо в правій.
      expect(document.querySelector('.stage-board.is-board-intro > .board-intro-main .round-brief')).not.toBeNull();
      expect(document.querySelector('.stage-board.is-board-intro > .stage-dice')).not.toBeNull();
      expect(document.querySelector('.board-intro-main .stage-dice')).toBeNull();
    });

    it("the board intro shows every player's die and the result next to the name", () => {
      const dice = { rows: [{ ...olena, throws: [5], waiting: false }, { ...anna, throws: [], waiting: true }], tieBreak: false, done: false };
      const { container } = show(introOf(boardOf({ turn: null, dice })));
      const rows = container.querySelector('.dice-rows')!;
      expect(rows.textContent).toContain('Олена');
      expect(rows.querySelectorAll('li')[0]!.querySelector('.dice-value')?.textContent).toBe('5');
      expect(rows.querySelectorAll('li')[1]!.querySelector('.die.is-empty')).not.toBeNull();
      expect(screen.getByText('Кидають: Анна')).toBeTruthy();
      expect(container.querySelector('.turn-schedule')).toBeNull();
    });

    it('the schedule waits until the dice stop', () => {
      vi.useFakeTimers();
      try {
        const waiting = { rows: [{ ...olena, throws: [5], waiting: false }, { ...anna, throws: [], waiting: true }], tieBreak: false, done: false };
        const { container, rerender } = show(introOf(boardOf({ turn: null, dice: waiting })));
        const done = { rows: [{ ...olena, throws: [5], waiting: false }, { ...anna, throws: [2], waiting: false }], tieBreak: false, done: true };
        const schedule = [
          { number: 1, order: [olena, anna], done: 0 },
          { number: 2, order: [anna, olena], done: 0 },
        ];
        rerender(
          <StageScreen view={introOf(boardOf({ turn: null, dice: done, schedule }))} code="123456" joinUrl="http://quiz.test/play/123456" offsetMs={0} hostOnline />,
        );
        expect(container.querySelector('.is-rolling')).not.toBeNull();
        expect(container.querySelector('.turn-schedule')).toBeNull();
        act(() => {
          vi.advanceTimersByTime(ROLL_MS);
        });
        expect(container.querySelector('.is-rolling')).toBeNull();
        expect(screen.getByText('Розклад ходів')).toBeTruthy();
        expect(container.querySelector('li.turn-circle')?.textContent).toBe('Коло 1: Олена → Анна');
      } finally {
        vi.useRealTimers();
      }
    });

    it('without dice the intro shows the schedule from the join order', () => {
      const schedule = [{ number: 1, order: [olena, anna], done: 0 }];
      const { container } = show(introOf(boardOf({ turn: null, schedule })));
      expect(container.querySelector('.turn-schedule')).not.toBeNull();
      expect(container.querySelector('.dice-panel')).toBeNull();
    });

    it('shows the board with hidden marks, played cells and whose turn it is', () => {
      const schedule = [{ number: 1, order: [olena, anna], done: 1 }];
      const { container } = show(view({ phase: 'board', round, board: boardOf({ schedule }) }));
      expect(screen.getByText('Міста')).toBeTruthy();
      expect(screen.getByText('Ріки')).toBeTruthy();
      expect(screen.getAllByText('100')).toHaveLength(2);
      // зіграна клітинка порожня
      expect(screen.queryByText('200')).toBeNull();
      expect(container.textContent).not.toMatch(/×[23]/);
      expect(screen.getAllByText('Вибирає Анна').length).toBeGreaterThan(0);
      expect(container.querySelector('.is-turn')?.textContent).toContain('Анна');
    });

    it('the board aside shows the turn queue with the current circle and the next ones', () => {
      const schedule = [1, 2, 3, 4].map((number) => ({ number, order: [olena, anna], done: number === 1 ? 1 : 0 }));
      const { container } = show(view({ phase: 'board', round, board: boardOf({ schedule }) }));
      const aside = container.querySelector('.board-aside')!;
      expect(aside.textContent).toContain('Черга ходів');
      expect(aside.querySelectorAll('li.turn-circle')).toHaveLength(3);
      expect(aside.querySelector('li.turn-circle .is-turn')?.textContent).toBe('Анна');
      const legend = screen.getByRole('list', { name: 'Види клітинок' });
      const queue = aside.querySelector('.turn-schedule')!;
      expect(legend.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(container.querySelector('ol.turn-order')).toBeNull();
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

    it('on the board the swap tag says the cell has a spare question', () => {
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
      show(
        view({
          phase: 'question',
          round,
          questionIndex: 0,
          question,
          endsAt: Date.now() + 20_000,
          board: boardOf({ cell }),
          buffs: [{ playerId: 'p1', nickname: 'Анна', kind: 'swap' }],
        }),
      );
      const list = screen.getByRole('list', { name: 'Бафи гравців' });
      expect(list.textContent).toBe('⇄ Анна: запасне запитання');
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
    dice: null,
    schedule: [],
    scheduleRepeats: false,
    skipAt: null,
    marks: [],
    marksHidden: false,
  };
  const picked = { playerId: 'p2', nickname: 'Анна', answer: { type: 'single' as const, optionId: 'a' } };
  const cls = (text: string) => screen.getByText(text).closest('.choice')?.className ?? '';

  it('a board question on the stage marks the removed options', () => {
    const four = { ...question, choices: [...choices, { id: 'c', text: 'Одеса' }, { id: 'd', text: 'Харків' }] };
    show(view({ phase: 'question', questionIndex: 0, question: four, round, board, endsAt: Date.now() + 20_000, removed: ['a', 'c'] }));
    const removed = [...document.querySelectorAll('.choice.is-removed')];
    expect(removed.map((li) => li.textContent)).toEqual(['AЛьвівприбрано', 'CОдесаприбрано']);
    expect(document.querySelectorAll('.choice')).toHaveLength(4);
    cleanup();
    show(view({ phase: 'question', questionIndex: 0, question: four, endsAt: Date.now() + 20_000, removed: [] }));
    expect(document.querySelector('.choice.is-removed')).toBeNull();
  });

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
    sort: null,
    orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
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
      dice: null,
      schedule: [],
      scheduleRepeats: false,
      skipAt: null,
      marks: [],
      marksHidden: false,
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
      dice: null,
      schedule: [],
      scheduleRepeats: false,
      skipAt: null,
      marks: [],
      marksHidden: false,
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
      dice: null,
      schedule: [],
      scheduleRepeats: false,
      skipAt: null,
      marks: [],
      marksHidden: false,
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
  const info = { theme: 'Космос', placed: 1, total: 3, shown: [], left: 0, mode: 'classic' as const, bank: 0, split: null };
  const entry = (nickname: string, wager: number, before: number, after: number) => ({
    playerId: nickname,
    nickname,
    answer: { type: 'single' as const, optionId: 'b' },
    grade: 'correct' as const,
    wager,
    allIn: false,
    before,
    after,
    share: null,
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

  const bankRevealView = (final: object) =>
    view({ phase: 'reveal', round, questionIndex: 0, question, reveal: full, final: { ...info, mode: 'bank' as const, ...final } });

  it('an all-in stake is announced on the reveal', () => {
    const { unmount } = show(
      view({ phase: 'reveal', round, questionIndex: 0, question, reveal: full, final: { ...info, shown: [{ ...entry('Віра', 300, 300, 600), allIn: true }], left: 1 } }),
    );
    expect(document.querySelector('.allin-badge')?.textContent).toBe('ВА-БАНК!');
    expect(document.querySelector('.bank-meter')).toBeNull();
    unmount();
    show(view({ phase: 'reveal', round, questionIndex: 0, question, reveal: full, final: { ...info, shown: [entry('Віра', 100, 300, 400)], left: 1 } }));
    expect(document.querySelector('.allin-badge')).toBeNull();
  });

  it('the bank meter keeps its place from the first reveal to the split', () => {
    const { rerender } = show(bankRevealView({ bank: 0, left: 2 }));
    const meter = document.querySelector('.bank-meter');
    expect(meter?.textContent).toBe('Банк: 0');
    const again = (final: object) =>
      rerender(<StageScreen view={bankRevealView(final)} code="123456" joinUrl="http://quiz.test/play/123456" offsetMs={0} hostOnline />);
    again({ bank: 1500, left: 1 });
    expect(document.querySelector('.bank-meter')).toBe(meter);
    expect(meter?.textContent).toBe('Банк: 1500');
    again({ bank: 1500, left: 0, split: { bank: 1500, refund: false, shares: [] } });
    expect(document.querySelector('.bank-meter')).toBe(meter);
    expect(meter?.textContent).toBe('Банк 1500 розділено');
    again({ bank: 1500, left: 0, split: { bank: 1500, refund: true, shares: [] } });
    expect(document.querySelector('.bank-meter')).toBe(meter);
    // На сцені коротко, щоб лічильник лишався в один рядок; повний текст — на телефонах.
    expect(meter?.textContent).toBe('Ставки повернуто');
  });

  it('refund rows say the stake came back, a zero stake has no suffix, nobody gets a share', () => {
    const lost = { ...entry('Богдан', 500, 500, 500), grade: 'wrong' as const };
    const zero = { ...entry('Віра', 0, 300, 300), grade: 'wrong' as const };
    show(bankRevealView({ bank: 500, left: 0, shown: [zero, lost], split: { bank: 500, refund: true, shares: [] } }));
    const row = (name: string) => screen.getByText(name).closest('li')!;
    expect(row('Богдан').querySelector('.wager-stake')?.textContent).toBe('Ставка 500 · ставку повернуто');
    expect(row('Віра').querySelector('.wager-stake')?.textContent).toBe('Ставка 0');
    expect(document.body.textContent).not.toContain('у банк');
    expect(document.body.textContent).not.toContain('з банку');
    // Місце частки є в кожному рядку з першого розкриття, щоб розподіл нічого не зсував.
    expect(document.querySelectorAll('.wager-list li .wager-share')).toHaveLength(2);
  });

  it('the all-in badge sits in the name column, so the other columns stay in place', () => {
    show(bankRevealView({ bank: 0, left: 1, shown: [{ ...entry('Віра', 300, 300, 300), allIn: true }, entry('Богдан', 100, 400, 400)] }));
    const rows = [...document.querySelectorAll('.wager-list li')];
    for (const li of rows) expect([...li.children].map((child) => child.className)).toEqual(['wager-who', 'given', 'tag wager-stake', 'wager-delta', 'wager-share']);
    expect(rows.find((li) => li.textContent?.includes('Віра'))?.querySelector('.wager-who .allin-badge')?.textContent).toBe('ВА-БАНК!');
  });

  it('bank rows say where the stake went and the share after the split', () => {
    const lost = { ...entry('Богдан', 500, 500, 0), grade: 'wrong' as const };
    const kept = { ...entry('Віра', 1000, 1000, 1000), share: null };
    const { rerender } = show(bankRevealView({ bank: 500, left: 0, shown: [kept, lost] }));
    expect(document.body.textContent).toContain('у банк');
    expect(screen.getByText('500 → 0')).toBeTruthy();
    expect(document.body.textContent).toContain('ставку збережено');
    expect(screen.getByText('1000 → 1000')).toBeTruthy();
    expect(screen.queryByText(/з банку/)).toBeNull();
    rerender(
      <StageScreen
        view={bankRevealView({
          bank: 500,
          left: 0,
          shown: [{ ...kept, after: 1642, share: 642 }, lost],
          split: { bank: 500, refund: false, shares: [{ playerId: 'Віра', nickname: 'Віра', wager: 1000, share: 642 }] },
        })}
        code="123456"
        joinUrl="http://quiz.test/play/123456"
        offsetMs={0}
        hostOnline
      />,
    );
    expect(screen.getByText('1000 → 1642')).toBeTruthy();
    expect(screen.getByText('+642 з банку')).toBeTruthy();
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

  describe('sort', () => {
    const categories = [
      { id: 'c1', text: 'Овочі' },
      { id: 'c2', text: 'Фрукти' },
    ];
    const sortQ = { ...question, type: 'sort' as const, choices: [], sort: { categories, total: 4, lockSeconds: 3 } };
    const fullSort: Question = {
      id: 'q9',
      type: 'sort',
      text: 'Розкладіть',
      imageUrl: null,
      video: null,
      timeLimit: 60,
      points: 100,
      lockSeconds: 3,
      categories,
      words: [
        { id: 'w1', text: 'Морква', categoryId: 'c1' },
        { id: 'w2', text: 'Яблуко', categoryId: 'c2' },
        { id: 'w3', text: 'Буряк', categoryId: 'c1' },
        { id: 'w4', text: 'Груша', categoryId: 'c2' },
      ],
    };
    const rows = [
      { playerId: 'p1', nickname: 'Анна', sorted: 4, misses: 0, timeMs: 8000, points: null },
      { playerId: 'p2', nickname: 'Богдан', sorted: 1, misses: 1, timeMs: null, points: null },
    ];
    const info = { total: 4, rows, winner: null, words: null, live: null };

    it('the stage shows the categories and progress, never the words', () => {
      show(view({ phase: 'question', questionIndex: 0, question: sortQ, endsAt: Date.now() + 20_000, playerCount: 2, answeredCount: 1, sort: info }));
      expect(screen.getByText('Овочі')).toBeTruthy();
      expect(screen.getByText('Фрукти')).toBeTruthy();
      expect(screen.getByText('Сортуйте слова на телефоні')).toBeTruthy();
      expect(screen.getByText('Усе відсортували: 1 з 2')).toBeTruthy();
      expect(document.querySelector('.sort-board')?.textContent).toContain('Анна');
      expect(document.body.textContent).not.toContain('Морква');
    });

    it('the finish counter counts only those who sorted everything, not the records at lock', () => {
      // На locked запис є в кожного (answeredCount 2), але закінчила лише Анна.
      show(view({ phase: 'locked', questionIndex: 0, question: sortQ, playerCount: 2, answeredCount: 2, sort: info }));
      expect(screen.getByText('Усе відсортували: 1 з 2')).toBeTruthy();
      cleanup();
      show(view({ phase: 'question', questionIndex: 0, question: sortQ, endsAt: Date.now() + 20_000, playerCount: 2, answeredCount: 0, sort: { ...info, rows: rows.map((r) => ({ ...r, timeMs: null })) } }));
      expect(screen.getByText('Усе відсортували: 0 з 2')).toBeTruthy();
    });

    it('the hint line and the blitz winner line keep their place through locked and reveal', () => {
      const blitz: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false, description: '', brief: emptyBrief('blitz'), times: null };
      const lines = () => [...document.querySelectorAll('.sort-line')].map((line) => line.textContent);
      show(view({ phase: 'question', round: blitz, questionIndex: 0, question: sortQ, endsAt: Date.now() + 20_000, sort: info }));
      expect(lines()).toEqual(['', 'Сортуйте слова на телефоні']);
      cleanup();
      show(view({ phase: 'locked', round: blitz, questionIndex: 0, question: sortQ, sort: { ...info, winner: { playerId: 'p1', nickname: 'Анна' } } }));
      expect(lines()).toEqual(['Найшвидше все відсортовано: Анна', 'Сортуйте слова на телефоні']);
      cleanup();
      show(view({ phase: 'reveal', round: blitz, questionIndex: 0, question: sortQ, reveal: fullSort, sort: { ...info, winner: null } }));
      expect(lines()).toEqual(['Ніхто не встиг відсортувати всі слова', '']);
    });

    it('the stage reveal shows every word by category', () => {
      show(view({ phase: 'reveal', questionIndex: 0, question: sortQ, reveal: fullSort, sort: { ...info, rows: rows.map((r) => ({ ...r, points: 100 })) } }));
      expect(document.querySelectorAll('.sort-reveal-col')).toHaveLength(2);
      expect(screen.getByText('Морква')).toBeTruthy();
      expect(screen.getByText('Груша')).toBeTruthy();
      expect(screen.queryByText(/Правильна відповідь:/)).toBeNull();
    });

    it('the stage shows the board sort words until the reveal', () => {
      const board = { cell: { category: 'Сад', price: 400, kind: 'normal', answerMode: 'phone', mark: 'none' }, turn: { playerId: 'p1', nickname: 'Анна' } } as unknown as BoardInfo;
      const words = [{ id: 'w3', text: 'Буряк' }, { id: 'w4', text: 'Груша' }, { id: 'w1', text: 'Морква' }, { id: 'w2', text: 'Яблуко' }];
      show(view({ phase: 'question', questionIndex: 0, question: sortQ, board, endsAt: Date.now() + 20_000, sort: { ...info, rows: [rows[0]], words } }));
      expect([...document.querySelectorAll('.sort-words li')].map((li) => li.textContent)).toEqual(['Буряк', 'Груша', 'Морква', 'Яблуко']);
      expect(document.querySelector('.sort-reveal.is-open')).toBeNull();
      cleanup();
      show(view({ phase: 'reveal', questionIndex: 0, question: sortQ, board, reveal: fullSort, sort: { ...info, rows: [{ ...rows[0], points: 100 }], words } }));
      expect(document.querySelector('.sort-words')).toBeNull();
      expect(document.querySelector('.sort-reveal.is-open')).not.toBeNull();
    });

    it("a board sort shows the chooser's progress, a blitz shows the winner, a final hides progress", () => {
      const board = { cell: { category: 'Сад', price: 400, kind: 'normal', answerMode: 'phone', mark: 'none' }, turn: { playerId: 'p1', nickname: 'Анна' } } as unknown as BoardInfo;
      show(view({ phase: 'question', questionIndex: 0, question: sortQ, board, endsAt: Date.now() + 20_000, sort: { ...info, rows: [rows[0]] } }));
      expect(document.querySelectorAll('.sort-board li')).toHaveLength(1);
      cleanup();

      const blitz: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false, description: '', brief: emptyBrief('blitz'), times: null };
      show(view({ phase: 'locked', round: blitz, questionIndex: 0, question: sortQ, sort: { ...info, winner: { playerId: 'p1', nickname: 'Анна' } } }));
      expect(screen.getByText('Найшвидше все відсортовано: Анна')).toBeTruthy();
      cleanup();

      show(view({ phase: 'question', questionIndex: 0, question: sortQ, endsAt: Date.now() + 20_000, playerCount: 2, answeredCount: 1, sort: null }));
      expect(document.querySelector('.sort-board')).toBeNull();
      expect(screen.queryByText(/Усе відсортували/)).toBeNull();
      expect(screen.getByText('Відповіли 1 з 2')).toBeTruthy();
    });
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

  it('the stage shows the adjustment notice and the debuff badges in every phase', () => {
    const live = { notice: { seq: 1, at: Date.now(), nickname: 'Оля', points: -100 }, debuffs: [{ playerId: 'p1', nickname: 'Оля' }] };
    for (const phase of ['question', 'leaderboard'] as const) {
      show(view({ ...live, phase, questionIndex: 0, question, standings: [] }));
      expect(document.querySelector('.live-notice')).not.toBeNull();
      expect(document.querySelector('.stage-debuffs')).not.toBeNull();
      cleanup();
    }
    show(view());
    expect(document.querySelector('.live-notice')).toBeNull();
    expect(document.querySelector('.stage-debuffs')).toBeNull();
  });

  it('the stage shows who took which buff, not what it did', () => {
    const four = { ...question, choices: [...choices, { id: 'c', text: 'Одеса' }, { id: 'd', text: 'Харків' }] };
    const buffs = [
      { playerId: 'p1', nickname: 'Оля', kind: 'fifty' as const },
      { playerId: 'p2', nickname: 'Петро', kind: 'double' as const },
    ];
    for (const phase of ['question', 'locked', 'reveal'] as const) {
      show(view({ phase, questionIndex: 0, question: four, endsAt: Date.now() + 10_000, buffs, reveal: phase === 'reveal' ? { ...full, options: four.choices } : null }));
      const list = screen.getByRole('list', { name: 'Бафи гравців' });
      expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['½ Оля', '×2 Петро']);
      // Усі чотири варіанти на місці й без приглушення: що прибрала 50/50, сцена не знає.
      expect(document.querySelectorAll('.choice')).toHaveLength(4);
      expect(document.querySelector('.is-removed')).toBeNull();
      cleanup();
    }
    show(view({ phase: 'question', questionIndex: 0, question: four, endsAt: Date.now() + 10_000 }));
    expect(screen.queryByRole('list', { name: 'Бафи гравців' })).toBeNull();
    cleanup();
    show(view({ phase: 'leaderboard', buffs, standings: [] }));
    expect(screen.queryByRole('list', { name: 'Бафи гравців' })).toBeNull();
  });

  it('the stage says who answers a spare, not what it is', () => {
    const buffs = [{ playerId: 'p1', nickname: 'Оля', kind: 'swap' as const }];
    for (const phase of ['question', 'locked', 'reveal'] as const) {
      show(view({ phase, questionIndex: 0, question, endsAt: Date.now() + 10_000, buffs, reveal: phase === 'reveal' ? full : null }));
      const list = screen.getByRole('list', { name: 'Бафи гравців' });
      expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['⇄ Оля відповідає на запасне']);
      // Сцена показує основне запитання: запасного в її зрізі немає.
      expect(screen.getByText('Столиця України?')).toBeTruthy();
      cleanup();
    }
  });

  it('the stage shows the hint and audience icons only', () => {
    const buffs = [
      { playerId: 'p2', nickname: 'Петро', kind: 'hint' as const },
      { playerId: 'p3', nickname: 'Іра', kind: 'audience' as const },
    ];
    show(view({ phase: 'question', questionIndex: 0, question, endsAt: Date.now() + 10_000, buffs }));
    const list = screen.getByRole('list', { name: 'Бафи гравців' });
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['? Петро', '% Іра']);
    expect(document.querySelector('.buff-panel, .hint-text, .vote-rows')).toBeNull();
  });

  it('the stage never shows a hint, not even at the reveal', () => {
    const buffs = [{ playerId: 'p2', nickname: 'Петро', kind: 'hint' as const }];
    for (const phase of ['question', 'locked', 'reveal'] as const) {
      show(view({ phase, questionIndex: 0, question, endsAt: Date.now() + 10_000, buffs, reveal: phase === 'reveal' ? { ...full, hint: 'Тече через Київ' } : null }));
      expect(document.body.textContent).not.toContain('Тече через Київ');
      cleanup();
    }
  });

  it('the stage waits for a player with extra time', () => {
    const now = Date.now();
    const overtime = [{ playerId: 'p1', nickname: 'Оля', deadline: now + 24_000, remainingMs: null }];
    show(view({ phase: 'question', questionIndex: 0, question, endsAt: now - 500, limitMs: 20_000, overtime }));
    expect(screen.getByTitle('Чекаємо: Оля · 0:24')).toBeTruthy();
    cleanup();
    // Баф узято до спільного кінця: рядок з'явиться лише після нього.
    show(view({ phase: 'question', questionIndex: 0, question, endsAt: now + 6000, limitMs: 20_000, overtime: [{ ...overtime[0], deadline: now + 36_000 }] }));
    expect(screen.queryByText(/Чекаємо:/)).toBeNull();
  });

  it('a buff notice on the stage', () => {
    show(view({ phase: 'question', questionIndex: 0, question, endsAt: Date.now() + 10_000, buffNotice: { seq: 1, at: Date.now(), playerId: 'p2', nickname: 'Оля', kind: 'fifty', questionIndex: 0 } }));
    expect(screen.getByText('Оля: 50/50')).toBeTruthy();
  });
});

const olya = { playerId: 'p1', nickname: 'Оля' };
const petro = { playerId: 'p2', nickname: 'Петро' };
const duelInfo = (patch: Partial<DuelInfo> = {}): DuelInfo => ({
  challenger: olya,
  opponent: petro,
  stage: 'question',
  categories: [
    { id: 'dc1', title: 'Столиці', left: 3 },
    { id: 'dc2', title: 'Хімія', left: 0 },
  ],
  category: 'Столиці',
  number: 2,
  total: 3,
  question: 'Столиця Франції?',
  accepted: null,
  wins: { challenger: 1, opponent: 0 },
  tries: { challenger: 0, opponent: 2 },
  questionWinner: null,
  winningAnswer: null,
  winner: null,
  stake: 300,
  ending: false,
  ...patch,
});

describe('StageScreen: duel', () => {
  it('the stage shows the duel big', () => {
    show(view({ phase: 'duel', duel: duelInfo(), endsAt: Date.now() + 20_000, limitMs: 30_000 }));
    const stage = document.querySelector('.duel-stage') as HTMLElement;
    expect(within(stage).getByText('Оля')).toBeTruthy();
    expect(within(stage).getByText('Петро')).toBeTruthy();
    expect(within(stage).getByText('1 : 0')).toBeTruthy();
    expect(within(stage).getByText('Запитання 2 з 3 · Столиці')).toBeTruthy();
    expect(within(stage).getByText('Столиця Франції?')).toBeTruthy();
    expect(within(stage).getByRole('timer')).toBeTruthy();
    expect(within(stage).getByText('Спроби: Оля 0 · Петро 2')).toBeTruthy();
    expect(within(stage).queryByText(/Правильна відповідь/)).toBeNull();
  });

  it('the stage reveals the duel answer and the result', () => {
    const answered = duelInfo({ stage: 'answer', accepted: ['Париж'], questionWinner: olya, winningAnswer: 'Париж' });
    const first = show(view({ phase: 'duel', duel: answered }));
    expect(screen.getByText('Правильна відповідь: Париж')).toBeTruthy();
    expect(screen.getByText('Це запитання виграє Оля: «Париж»')).toBeTruthy();
    first.unmount();
    const done = show(view({ phase: 'duel', duel: duelInfo({ stage: 'result', winner: olya, wins: { challenger: 2, opponent: 1 } }) }));
    expect(screen.getByText('Перемога в дуелі: Оля!')).toBeTruthy();
    expect(screen.getByText('Оля +300 · Петро −300')).toBeTruthy();
    done.unmount();
    show(view({ phase: 'duel', duel: duelInfo({ stage: 'category', category: null, question: null, number: 0 }) }));
    expect(screen.getByText('Оля вибирає категорію')).toBeTruthy();
    expect(screen.getByText('Столиці · лишилося 3')).toBeTruthy();
    expect(screen.getByText('Хімія · лишилося 0')).toBeTruthy();
  });

  it('a declared duel shows its banner over the round', () => {
    show(view({ phase: 'reveal', duel: duelInfo({ stage: 'declared' }) }));
    expect(document.querySelector('.duel-banner')).not.toBeNull();
  });
});

describe('StageScreen: splashes', () => {
  const T = 1_000_000;
  const at = (kind: NonNullable<StageView['splash']>['kind'], ms: number) => ({ kind, at: T, until: T + ms });
  const round: RoundInfo = { index: 1, total: 3, title: 'Столиці', type: 'classic', partial: false, description: 'Опис', brief: emptyBrief('classic'), times: null };
  const finalInfo = { theme: 'Космос', placed: 0, total: 3, shown: [], left: 0, mode: 'classic' as const, bank: 0, split: null };

  const timed = () => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
  };
  afterEach(() => vi.useRealTimers());

  it('a round splash covers the round intro, which is already in place under it', () => {
    timed();
    show(view({ phase: 'intro', round, splash: at('round', 2500) }));
    const layer = document.querySelector('.splash.is-round');
    expect(layer?.textContent).toContain('Раунд 2');
    expect(layer?.textContent).toContain('Столиці');
    const heading = document.querySelector('h1.question');
    expect(heading?.textContent).toBe('Столиці');
    expect(document.querySelector('.round-brief')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(document.querySelector('.splash')).toBeNull();
    expect(document.querySelector('h1.question')).toBe(heading);
  });

  it('the question is in place under «Запитання N»; the timer shows the full time', () => {
    timed();
    show(view({ phase: 'question', round, questionIndex: 0, question, endsAt: T + 21_200, limitMs: 20_000, splash: at('question', 1200) }));
    expect(document.querySelector('.splash.is-question')).not.toBeNull();
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('20');
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(document.querySelector('.splash')).toBeNull();
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('20');
  });

  it('a picked cell flips on the stage', () => {
    timed();
    const cell = { id: 'c1', category: 'Міста', price: 300, mark: 'x2' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
    const board = { rows: [], cell, turn: null, dice: null, schedule: [] } as unknown as BoardInfo;
    show(view({ phase: 'question', questionIndex: 0, question, board, endsAt: T + 21_000, limitMs: 20_000, splash: at('cell', 1000) }));
    expect(document.querySelector('.splash .splash-flip')?.textContent).toContain('Міста · 300');
  });

  it('the cell flip shows the price in front, the ×2 mark and the blitz and voice colours behind; it goes away after 1 s', () => {
    timed();
    const base = { id: 'c1', category: 'Міста', price: 300, mark: 'x2' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
    const boardOf = (cell: typeof base | Record<string, unknown>) => ({ rows: [], cell, turn: null, dice: null, schedule: [] }) as unknown as BoardInfo;
    const onCell = (cell: typeof base | Record<string, unknown>) =>
      show(view({ phase: 'question', questionIndex: 0, question, board: boardOf(cell), endsAt: T + 21_000, limitMs: 20_000, splash: at('cell', 1000) }));

    onCell(base);
    expect(document.querySelector('.splash-face.is-front .price')?.textContent).toBe('300');
    expect(document.querySelector('.splash-face.is-back .splash-cell-marks')).toBeNull();
    expect(document.querySelector('.splash-surprise')?.textContent).toBe('×2!');
    expect(document.querySelector('.splash-face.is-blitz, .splash-face.is-voice')).toBeNull();
    // Запитання під шаром ще не почалося: aria-busy, поки йде перегортання.
    expect(document.querySelector('.stage-question')?.getAttribute('aria-busy')).toBe('true');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.querySelector('.splash')).toBeNull();
    expect(document.querySelector('.stage-question')?.hasAttribute('aria-busy')).toBe(false);
    cleanup();

    vi.setSystemTime(T);
    onCell({ ...base, mark: 'none', kind: 'blitz' });
    expect(document.querySelectorAll('.splash-face.is-blitz')).toHaveLength(2);
    expect(document.querySelector('.splash-cell-marks')?.textContent).toBe('Бліц');
    cleanup();

    onCell({ ...base, mark: 'none', answerMode: 'voice' });
    expect(document.querySelectorAll('.splash-face.is-voice')).toHaveLength(2);
    expect(document.querySelector('.splash-cell-marks')).toBeNull();
  });

  it('duel and podium splashes go away after their time; the screen under them stays', () => {
    timed();
    show(view({ phase: 'duel', duel: duelInfo({ stage: 'category', category: null, question: null, number: 0 }), splash: at('duel', 2000) }));
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(document.querySelector('.splash.is-duel')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector('.splash')).toBeNull();
    expect(screen.getByText('Оля вибирає категорію')).toBeTruthy();
    cleanup();

    vi.setSystemTime(T);
    const standings = [{ participantId: 'p1', nickname: 'Олена', score: 500, totalTimeMs: 1, rank: 1 }];
    show(view({ phase: 'finished', standings, splash: at('podium', 2500) }));
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(document.querySelector('.splash')).toBeNull();
    expect(screen.getAllByText('Олена').length).toBeGreaterThan(0);
  });

  it('after a pause the splash comes back with its shifted end and plays the rest', () => {
    timed();
    const props = { phase: 'question' as const, round, questionIndex: 0, question, limitMs: 20_000 };
    const { rerender } = show(view({ ...props, endsAt: T + 21_200, splash: at('question', 1200) }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const rerenderWith = (current: StageView) =>
      rerender(<StageScreen view={current} code="123456" joinUrl="http://quiz.test/play/123456" offsetMs={0} hostOnline />);
    rerenderWith(view({ ...props, paused: true, endsAt: null, remainingMs: 20_000, splash: at('question', 1200) }));
    expect(document.querySelector('.splash')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    // Сервер зсунув заставку на паузу: лишилося 700 мс.
    rerenderWith(view({ ...props, endsAt: T + 31_200, splash: { kind: 'question', at: T + 10_000, until: T + 11_200 } }));
    expect(document.querySelector('.splash.is-question')).not.toBeNull();
    expect(document.querySelector('.stage-question')?.getAttribute('aria-busy')).toBe('true');
    act(() => {
      vi.advanceTimersByTime(699);
    });
    expect(document.querySelector('.splash')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector('.splash')).toBeNull();
  });

  it('the final, duel and podium splashes', () => {
    timed();
    const finalRound: RoundInfo = { ...round, type: 'final', title: '' };
    show(view({ phase: 'intro', round: finalRound, final: finalInfo, splash: at('final', 3200) }));
    expect(document.querySelector('.splash.is-final')?.textContent).toContain('Фінал');
    cleanup();
    show(view({ phase: 'duel', duel: duelInfo({ stage: 'category', category: null, question: null, number: 0 }), splash: at('duel', 2000) }));
    expect(document.querySelector('.splash.is-duel')?.textContent).toContain('Дуель!');
    expect(document.querySelector('.splash.is-duel')?.textContent).toContain('Оля');
    cleanup();
    const standings = [{ participantId: 'p1', nickname: 'Олена', score: 500, totalTimeMs: 1, rank: 1 }];
    show(view({ phase: 'finished', standings, splash: at('podium', 2500) }));
    expect(document.querySelector('.splash.is-podium')?.textContent).toContain('Підсумки');
    expect(screen.getAllByText('Олена').length).toBeGreaterThan(0);
  });

  it('no splash while paused', () => {
    timed();
    show(view({ phase: 'question', round, questionIndex: 0, question, paused: true, splash: at('question', 1200) }));
    expect(document.querySelector('.splash')).toBeNull();
    expect(screen.getByRole('status').textContent).toBeTruthy();
  });
});

describe('StageScreen: «Як грати»', () => {
  it('shows the guide page, no splash and no lobby', () => {
    const guide = { page: 0, pages: [{ kind: 'phone' as const }, { kind: 'questions' as const, types: [{ type: 'single' as const, top: '' }] }] };
    const { container } = show(view({ phase: 'guide', guide, newcomers: true }));
    expect(screen.getByRole('heading', { name: 'Відповідайте з телефона' })).toBeTruthy();
    expect(container.querySelector('.guide.is-stage')).not.toBeNull();
    expect(container.querySelector('.splash')).toBeNull();
    expect(container.querySelector('.stage-lobby')).toBeNull();
  });
});

describe('StageScreen: explanations for newcomers', () => {
  const round: RoundInfo = { index: 0, total: 2, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: null };
  it('the intro has the round reminder only with explanations on', () => {
    show(view({ phase: 'intro', round, newcomers: true }));
    expect(screen.getByText('Як проходить раунд')).toBeTruthy();
    expect(screen.getByText(/кубик/)).toBeTruthy();
    cleanup();
    show(view({ phase: 'intro', round }));
    expect(screen.queryByText('Як проходить раунд')).toBeNull();
  });
  it('the stage never shows the type tip', () => {
    show(view({ phase: 'question', questionIndex: 0, question, newcomers: true }));
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('StageScreen: menu', () => {
  it('the podium has a small «До меню» in the corner', () => {
    show(view({ phase: 'finished', questionIndex: 2, standings: [{ participantId: 'p1', nickname: 'Олена', score: 500, totalTimeMs: 1, rank: 1 }] }));
    expect(document.querySelector('a.stage-menu')?.getAttribute('href')).toBe('/');
    cleanup();
    show(view({ phase: 'lobby' }));
    expect(document.querySelector('a.stage-menu')).toBeNull();
  });
});

describe('StageScreen media (10b)', () => {
  const sliderQuestion = { ...question, type: 'slider' as const, choices: [], slider: { min: 0, max: 100, step: 1, unit: '%' } };
  const sliderFull: Question = { id: 'q3', type: 'slider', text: question.text, imageUrl: null, video: null, timeLimit: 20, points: 1000, min: 0, max: 100, step: 1, correct: 50, tolerance: 2, unit: '%' };

  it('plays the clip on a card when the question has an audio source', () => {
    const clip = { source: 'file' as const, url: '/uploads/abcdef0123456789.mp3', start: 0, duration: 10 };
    show(view({ phase: 'question', questionIndex: 0, question: { ...question, audio: { duration: 10, clip } }, endsAt: Date.now() + 20_000, limitMs: 20_000 }));
    expect(document.querySelector('.audio-card')).not.toBeNull();
    expect(document.querySelector('audio')?.getAttribute('src')).toBe(clip.url);
  });

  it('has no audio card without a source', () => {
    show(view({ phase: 'question', questionIndex: 0, question: { ...question, audio: { duration: 10, clip: null } } }));
    expect(document.querySelector('.audio-card')).toBeNull();
  });

  it('hints at the slider on the phones', () => {
    show(view({ phase: 'question', questionIndex: 0, question: sliderQuestion }));
    expect(screen.getByText('Тягніть повзунок на телефоні: від 0 до 100 %')).toBeTruthy();
  });

  it('shows the scale with every mark at the reveal instead of the answer line', () => {
    const sliderMarks = [
      { playerId: 'p1', nickname: 'Оля', value: 51, points: 1000 },
      { playerId: 'p2', nickname: 'Тарас', value: 80, points: 0 },
    ];
    show(view({ phase: 'reveal', questionIndex: 0, question: sliderQuestion, reveal: sliderFull, sliderMarks }));
    expect(document.querySelector('.slider-scale')).not.toBeNull();
    expect(screen.getByLabelText('Оля: 51 %').className).toContain('is-near');
    expect(screen.getByLabelText('Тарас: 80 %')).toBeTruthy();
    expect(document.querySelector('.lead.answer')).toBeNull();
  });

  it('draws a revealing picture on a canvas stage', () => {
    show(view({ phase: 'question', questionIndex: 0, question: { ...question, imageUrl: '/uploads/a.png', reveal: 'pixels' as const }, endsAt: Date.now() + 20_000, limitMs: 20_000 }));
    expect(document.querySelector('canvas[data-stage]')).not.toBeNull();
  });
});

describe('StageScreen clues and pin (10c)', () => {
  const cluesQuestion = { ...question, type: 'clues' as const, choices: [], clues: { total: 5, shown: ['Народився у 1814 році', 'Писав вірші'], nextAt: null, byHost: false, intervalSeconds: 8, self: false, opens: null } };
  const pinQuestion = { ...question, type: 'pin' as const, choices: [], pin: { map: 'world' as const, aspect: 2 } };
  const pinFull: Question = { id: 'q4', type: 'pin', text: question.text, imageUrl: null, video: null, timeLimit: 20, points: 1000, map: 'world', aspect: 2, target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 };
  const cluesFull: Question = { id: 'q5', type: 'clues', text: question.text, imageUrl: null, video: null, timeLimit: 20, points: 1000, clues: ['a', 'b', 'c'], accepted: ['Шевченко'], interval: 8 };

  it('shows the opened clues large with the phone hint', () => {
    show(view({ phase: 'question', questionIndex: 0, question: cluesQuestion }));
    expect(document.querySelector('.clues-list.is-big')).not.toBeNull();
    expect(screen.getByText('Народився у 1814 році')).toBeTruthy();
    expect(screen.getByText('Писав вірші')).toBeTruthy();
    expect(screen.getByText('Відповідайте на телефоні, щойно впізнаєте: що раніше, то більше балів.')).toBeTruthy();
  });

  it('keeps six long clues in the list without extra placeholders', () => {
    const long = 'я'.repeat(150);
    const six = { ...cluesQuestion, clues: { ...cluesQuestion.clues, total: 6, shown: Array.from({ length: 6 }, () => long) } };
    show(view({ phase: 'question', questionIndex: 0, question: six }));
    expect(document.querySelectorAll('.clues-list.is-big .clue')).toHaveLength(6);
    expect(document.querySelector('.clue.is-hidden')).toBeNull();
  });

  it('names the nearest only when it scored', () => {
    const pinMarks = [{ playerId: 'p1', nickname: 'Оля', x: 0.9, y: 0.9, points: 0 }];
    show(view({ phase: 'reveal', questionIndex: 0, question: pinQuestion, reveal: pinFull, pinMarks }));
    expect(screen.queryByText(/Найближче/)).toBeNull();
    expect(document.querySelector('.pin-mark.is-best')).not.toBeNull();
  });

  it('has no phone hint on a voice cell', () => {
    const voice = { ...cluesQuestion, clues: { ...cluesQuestion.clues, byHost: true } };
    show(view({ phase: 'question', questionIndex: 0, question: voice, board: { cell: { kind: 'normal', answerMode: 'voice', category: 'К', price: 100, mark: 'none' } } as unknown as BoardInfo }));
    expect(screen.queryByText(/Відповідайте на телефоні, щойно впізнаєте/)).toBeNull();
  });

  it('shows the map without marks or target during the question', () => {
    show(view({ phase: 'question', questionIndex: 0, question: pinQuestion }));
    expect(document.querySelector('img.pin-base')).not.toBeNull();
    expect(screen.getByText('Ставте точку на телефоні')).toBeTruthy();
    expect(document.querySelector('.pin-mark')).toBeNull();
    expect(document.querySelector('.pin-target')).toBeNull();
  });

  it('shows every pin, the target and both circles at the reveal with the nearest highlighted', () => {
    const pinMarks = [
      { playerId: 'p1', nickname: 'Оля', x: 0.52, y: 0.5, points: 900 },
      { playerId: 'p2', nickname: 'Петро', x: 0.6, y: 0.5, points: 100 },
    ];
    show(view({ phase: 'reveal', questionIndex: 0, question: pinQuestion, reveal: pinFull, pinMarks }));
    expect(document.querySelectorAll('.pin-mark')).toHaveLength(2);
    expect(document.querySelector('.pin-mark.is-best')!.getAttribute('aria-label')).toBe('Оля');
    expect(document.querySelector('.pin-target')).not.toBeNull();
    expect(document.querySelectorAll('svg.pin-layer circle')).toHaveLength(2);
    expect(screen.getByText('Найближче: Оля — 2,0 %')).toBeTruthy();
    expect(document.querySelector('.lead.answer')).toBeNull();
  });

  it('lists every clue at the reveal, then the usual answer line', () => {
    show(view({ phase: 'reveal', questionIndex: 0, question: cluesQuestion, reveal: cluesFull }));
    expect(document.querySelectorAll('.clues-list .clue')).toHaveLength(3);
    expect(document.querySelector('.lead.answer')).not.toBeNull();
  });
});

describe('StageScreen own-pace clues (12c)', () => {
  const opens = [
    { playerId: 'p1', nickname: 'Оля', opened: 1, answered: true },
    { playerId: 'p2', nickname: 'Петро', opened: 3, answered: true },
    { playerId: 'p3', nickname: 'Іра', opened: 2, answered: false },
  ];
  const selfQuestion = { ...question, type: 'clues' as const, choices: [], clues: { total: 5, shown: ['Народився у 1814 році'], nextAt: null, byHost: false, intervalSeconds: 8, self: true, opens } };
  const selfFull: Question = { id: 'q5', type: 'clues', text: question.text, imageUrl: null, video: null, timeLimit: 20, points: 1000, clues: ['a', 'b', 'c', 'd', 'e'], accepted: ['Шевченко'], interval: 8, cluePace: 'self' };

  it('shows only the first clue, the rest as plain placeholders, who opened how many and the own-pace hint', () => {
    show(view({ phase: 'question', questionIndex: 0, question: selfQuestion }));
    expect(document.querySelectorAll('.clues-list .clue:not(.is-hidden)')).toHaveLength(1);
    const hidden = [...document.querySelectorAll('.clues-list .clue.is-hidden')].map((li) => li.textContent);
    expect(hidden).toEqual(['Підказка 2', 'Підказка 3', 'Підказка 4', 'Підказка 5']);
    expect([...document.querySelectorAll('.clue-opens.is-big .clue-open')].map((span) => span.textContent)).toEqual(['Оля 1', 'Петро 3', 'Іра 2']);
    expect(screen.getByText('Кожен відкриває підказки на телефоні сам: що менше підказок, то більше балів.')).toBeTruthy();
    expect(screen.queryByText(/щойно впізнаєте/)).toBeNull();
  });

  it('lists every clue at the reveal with the clue each answered on', () => {
    show(view({ phase: 'reveal', questionIndex: 0, question: selfQuestion, reveal: selfFull }));
    expect(document.querySelectorAll('.clues-list .clue')).toHaveLength(5);
    expect(document.querySelector('.clues-list .clue.is-hidden')).toBeNull();
    expect([...document.querySelectorAll('.clue-opens.is-big.is-revealed .clue-open')].map((span) => span.textContent)).toEqual(['Оля — на підказці 1', 'Петро — на підказці 3', 'Іра — без відповіді']);
  });

  it('says each team opens its own clues in a team game', () => {
    const teams = { teams: [], mode: 'captain' } as unknown as StageView['teams'];
    show(view({ phase: 'question', questionIndex: 0, question: selfQuestion, teams }));
    expect(screen.getByText('Кожна команда відкриває підказки сама: що менше підказок, то більше балів.')).toBeTruthy();
    expect(screen.queryByText(/Кожен відкриває підказки/)).toBeNull();
  });

  it('has no line outside own pace', () => {
    show(view({ phase: 'question', questionIndex: 0, question: { ...selfQuestion, clues: { ...selfQuestion.clues, self: false, opens: null } } }));
    expect(document.querySelector('.clue-opens')).toBeNull();
  });
});

describe('StageScreen: wall, poll and word cloud (10d)', () => {
  const names = ['Річки', 'Міста', 'Гори', 'Озера'];
  const wallFull: Question = {
    id: 'w1',
    type: 'wall',
    text: 'Знайдіть групи',
    imageUrl: null,
    video: null,
    timeLimit: 90,
    points: 1000,
    mistakes: 3,
    groups: names.map((name, g) => ({ id: `g${g}`, name, tiles: [0, 1, 2, 3].map((n) => ({ id: `t${g}${n}`, text: `${name}${n}` })) })),
  };
  const wallQuestion = {
    ...question,
    type: 'wall' as const,
    text: 'Знайдіть групи',
    timeLimit: 90,
    choices: [],
    wall: { tiles: Array.from({ length: 16 }, (_, n) => `Плитка ${n}`), size: 4, groupCount: 4, maxMistakes: 3 },
  };
  const pollOptions = [
    { id: 'a', text: 'Весна' },
    { id: 'b', text: 'Літо' },
    { id: 'c', text: 'Осінь' },
  ];
  const pollQuestion = { ...question, type: 'poll' as const, text: 'Яка пора найкраща?', points: 0, choices: pollOptions };
  const pollFull: Question = { id: 'p1', type: 'poll', text: pollQuestion.text, imageUrl: null, video: null, timeLimit: 20, points: 0, options: pollOptions };
  const cloudQuestion = { ...question, type: 'wordcloud' as const, text: 'З чим асоціюється Київ?', points: 0, choices: [], cloud: { words: 3 } };
  const cloudFull: Question = { id: 'c1', type: 'wordcloud', text: cloudQuestion.text, imageUrl: null, video: null, timeLimit: 30, points: 0, words: 3 };

  it('the wall during the question is 16 plain tiles with no group colours and a hint to use the phone', () => {
    show(view({ phase: 'question', questionIndex: 0, question: wallQuestion, endsAt: Date.now() + 90_000, playerCount: 5, answeredCount: 2 }));
    expect(document.querySelectorAll('.wall-tile')).toHaveLength(16);
    expect(document.querySelector('[class*="wall-color-"]')).toBeNull();
    expect(screen.getByText('Шукайте групи на телефоні')).toBeTruthy();
    expect(screen.getByText('Закінчили стіну: 2 з 5')).toBeTruthy();
    expect(document.querySelector('.lead.answer')).toBeNull();
  });

  it('the wall on the reveal shows the groups with names and the table, without the correct-answer line', () => {
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        question: wallQuestion,
        reveal: wallFull,
        wall: { groupCount: 4, rows: [{ playerId: 'p1', nickname: 'Олена', found: 4, mistakes: 1, locked: false, solved: true, points: 750, tiles: null }] },
      }),
    );
    for (const name of names) expect(screen.getByText(name)).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText('4 / 4')).toBeTruthy();
    expect(document.querySelector('.lead.answer')).toBeNull();
  });

  it('the poll shows plain options during the question and bars with percent on the reveal', () => {
    show(view({ phase: 'question', questionIndex: 0, question: pollQuestion, endsAt: Date.now() + 20_000, playerCount: 4, answeredCount: 3 }));
    expect(screen.getByText('Проголосували 3 з 4')).toBeTruthy();
    expect(document.querySelector('.poll-bars')).toBeNull();
    cleanup();
    show(view({ phase: 'reveal', questionIndex: 0, question: pollQuestion, reveal: pollFull, playerCount: 4, stats: { answered: 4, accepted: null, counts: { a: 1, b: 3 } } }));
    expect(screen.getByText('75 % · 3')).toBeTruthy();
    expect(screen.getByText('25 % · 1')).toBeTruthy();
    expect(screen.queryByText(/Правильна відповідь/)).toBeNull();
    expect(document.querySelector('.lead.answer')).toBeNull();
  });

  it('the cloud shows no words during the question, only the words from the view on the reveal', () => {
    show(view({ phase: 'question', questionIndex: 0, question: cloudQuestion, endsAt: Date.now() + 30_000, playerCount: 4, answeredCount: 1 }));
    expect(screen.getByText('Пишіть до 3 слів на телефоні')).toBeTruthy();
    expect(screen.getByText('Написали 1 з 4')).toBeTruthy();
    expect(document.querySelector('.word-cloud')).toBeNull();
    cleanup();
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        question: cloudQuestion,
        reveal: cloudFull,
        cloud: [
          { key: 'каштани', text: 'каштани', count: 3 },
          { key: 'дніпро', text: 'Дніпро', count: 1 },
        ],
        cloudVoters: 4,
      }),
    );
    expect(screen.getByText('каштани')).toBeTruthy();
    expect(screen.getByText('Дніпро')).toBeTruthy();
    expect(screen.getByText('Написали 4')).toBeTruthy();
    expect(document.querySelector('.lead.answer')).toBeNull();
  });

  it('an empty cloud says nobody wrote anything', () => {
    show(view({ phase: 'reveal', questionIndex: 0, question: cloudQuestion, reveal: cloudFull, cloud: [], cloudVoters: 0 }));
    expect(screen.getByText('Ніхто нічого не написав')).toBeTruthy();
  });

  it('on a board cell the stage shows the chooser wall with the found groups coloured', () => {
    const found = {
      groupCount: 4,
      rows: [{ playerId: 'p1', nickname: 'Олена', found: 1, mistakes: 0, locked: false, solved: false, points: null, tiles: [[0, 1, 2, 3]] }],
    };
    show(view({ phase: 'question', questionIndex: 0, question: wallQuestion, endsAt: Date.now() + 90_000, wall: found }));
    expect(document.querySelectorAll('.wall-tile.is-found.wall-color-0')).toHaveLength(4);
  });
});

describe('StageScreen: survey (10e)', () => {
  const surveyQuestion = { ...question, type: 'survey' as const, text: 'Назвіть фрукт, який люблять діти', choices: [], survey: { answers: 3, rows: 5 } };
  const surveyFull = { id: 's1', type: 'survey', text: surveyQuestion.text, imageUrl: null, video: null, timeLimit: 45, points: 1000, rows: [], answers: 3 } as unknown as Question;
  const texts = ['Яблуко', 'Банан', 'Полуниця', 'Кавун', 'Груша'];
  const board = (shown: number, source: 'host' | 'cloud' = 'host') => ({
    source,
    total: 5,
    shown,
    rows: texts.map((text, at) => {
      const open = at + 1 > 5 - shown;
      return { rank: at + 1, open, text: open ? text : null, popularity: open ? 30 - at : null, by: open ? ['Олена'] : null };
    }),
  });

  it('shows closed rows and the hint, with no correct answer line', () => {
    show(view({ phase: 'question', questionIndex: 0, question: surveyQuestion, endsAt: Date.now() + 45_000, survey: board(0) }));
    expect(document.querySelectorAll('.survey-row.is-closed')).toHaveLength(5);
    expect(screen.getByText('Пишіть до 3 відповідей на телефоні')).toBeTruthy();
    expect(screen.queryByText(/Правильна відповідь/)).toBeNull();
  });

  it('closed rows carry no popularity or authors, and the hint is only while answering', () => {
    show(view({ phase: 'question', questionIndex: 0, question: surveyQuestion, endsAt: Date.now() + 45_000, survey: board(0) }));
    expect(document.querySelectorAll('.survey-pop, .survey-by')).toHaveLength(0);
    cleanup();
    show(view({ phase: 'locked', questionIndex: 0, question: surveyQuestion, survey: board(0) }));
    expect(screen.queryByText('Пишіть до 3 відповідей на телефоні')).toBeNull();
  });

  it('at the reveal only the opened bottom rows have text', () => {
    show(view({ phase: 'reveal', questionIndex: 0, question: surveyQuestion, reveal: surveyFull, survey: board(2) }));
    expect(screen.getByText('Груша')).toBeTruthy();
    expect(screen.getByText('Кавун')).toBeTruthy();
    expect(screen.queryByText('Яблуко')).toBeNull();
    expect(document.querySelectorAll('.survey-row.is-closed')).toHaveLength(3);
    expect(document.querySelector('.lead.answer')).toBeNull();
  });

  it('a board built from the word cloud says so', () => {
    show(view({ phase: 'question', questionIndex: 0, question: surveyQuestion, endsAt: Date.now() + 45_000, survey: board(0, 'cloud') }));
    expect(screen.getByText('Дошка з ваших відповідей у хмарі слів')).toBeTruthy();
  });
});

describe('StageScreen: bluff (10f)', () => {
  const bluffQuestion = { ...question, type: 'bluff' as const, text: 'Вежу хотіли поставити в …', choices: [] };
  const bluffFull = { id: 'bl1', type: 'bluff', text: bluffQuestion.text, imageUrl: null, video: null, timeLimit: 60, points: 1000, accepted: ['Барселона'], lies: ['Мілан', 'Лісабон'], choiceTime: 30 } as unknown as Question;
  const texts = ['Рим', 'Мілан', 'Париж', 'Барселона', 'Лісабон'];
  const info = (stage: 'lies' | 'choice' | 'reveal', shown = 0) => ({
    stage,
    written: 1,
    picked: 0,
    options:
      stage === 'lies'
        ? []
        : texts.map((text, at) => {
            const open = stage === 'reveal' && at < shown;
            return { id: `b${at + 1}`, text, open, kind: open ? (text === 'Барселона' ? ('truth' as const) : ('lie' as const)) : null, authors: open ? (text === 'Барселона' ? [] : ['Олена']) : null, pickedBy: open ? [] : null, removed: false };
          }),
    shown,
    total: stage === 'lies' ? 0 : 5,
    lastOpenedId: null,
    lies: null,
  });

  it('lies phase: the prompt and how many wrote', () => {
    show(view({ phase: 'question', questionIndex: 0, question: bluffQuestion, endsAt: Date.now() + 60_000, bluff: info('lies'), playerCount: 3 }));
    expect(screen.getByText('Вигадайте відповідь на телефоні')).toBeTruthy();
    expect(screen.getByText('Вигадали 1 з 3')).toBeTruthy();
  });

  it('choice phase: five plain tiles with no truth or lie marks', () => {
    show(view({ phase: 'question', questionIndex: 0, question: bluffQuestion, endsAt: Date.now() + 30_000, bluff: info('choice'), playerCount: 3 }));
    expect(document.querySelectorAll('.bluff-row')).toHaveLength(5);
    expect(screen.getByText('Що з цього правда?')).toBeTruthy();
    expect(screen.queryByText('Правда')).toBeNull();
    expect(screen.queryByText(/Вигадка/)).toBeNull();
  });

  it('reveal with shown 2: two opened, no correct answer line', () => {
    show(view({ phase: 'reveal', questionIndex: 0, question: bluffQuestion, reveal: bluffFull, bluff: info('reveal', 2) }));
    expect(screen.getAllByText('Вигадка: Олена')).toHaveLength(2);
    expect(document.querySelectorAll('.bluff-row.is-closed')).toHaveLength(3);
    expect(screen.queryByText(/Правильна відповідь/)).toBeNull();
  });

  it('more than twelve options switch the stage board to three columns', () => {
    const make = (n: number) => Array.from({ length: n }, (_, at) => ({ id: `b${at + 1}`, text: `Вигадка ${at + 1}`, open: false, kind: null, authors: null, pickedBy: null, removed: false }));
    show(view({ phase: 'question', questionIndex: 0, question: bluffQuestion, endsAt: Date.now() + 30_000, bluff: { ...info('choice'), options: make(13), total: 13 }, playerCount: 13 }));
    expect(document.querySelector('.bluff-board.is-dense.is-wide')).not.toBeNull();
    cleanup();
    show(view({ phase: 'question', questionIndex: 0, question: bluffQuestion, endsAt: Date.now() + 30_000, bluff: { ...info('choice'), options: make(12), total: 12 }, playerCount: 12 }));
    expect(document.querySelector('.bluff-board.is-dense')).not.toBeNull();
    expect(document.querySelector('.is-wide')).toBeNull();
  });

  it('the choice timer ignores the audio lead of a long clip: no «Слухайте»', () => {
    const audio = { duration: 100, clip: { source: 'file', url: '/uploads/abcdef0123456789.mp3', start: 0, duration: 100 } };
    show(view({ phase: 'question', questionIndex: 0, question: { ...bluffQuestion, audio } as never, endsAt: Date.now() + 28_000, limitMs: 30_000, bluff: info('choice'), playerCount: 3 }));
    expect(document.querySelector('.timer-status')).toBeNull();
    expect(document.querySelector('.timer-total')).not.toBeNull();
  });

  it('eight options: dense board, whole option text kept, buyers clamped with «+N»', () => {
    const many = Array.from({ length: 8 }, (_, at) => ({ id: `b${at + 1}`, text: `Дуже довга вигадка номер ${at + 1} про те, де саме поставили вежу`, open: true, kind: 'lie' as const, authors: ['Олена'], pickedBy: ['Аня', 'Богдан', 'Віка', 'Гліб', 'Дана', 'Єва'], removed: false }));
    show(view({ phase: 'reveal', questionIndex: 0, question: bluffQuestion, reveal: bluffFull, bluff: { ...info('reveal', 8), options: many, total: 8, shown: 8 } }));
    expect(document.querySelector('.bluff-board.is-dense')).not.toBeNull();
    expect(screen.getByText('Дуже довга вигадка номер 3 про те, де саме поставили вежу')).toBeTruthy();
    expect(screen.getAllByText('Купилися: Аня, Богдан, Віка +3')).toHaveLength(8);
  });

  describe('wipeout', () => {
    const wRow = (id: string, over: Partial<WipeoutRow> = {}): WipeoutRow => ({ playerId: id, nickname: `Гравець ${id}`, status: 'in', bank: 0, step: null, decision: null, choice: null, prev: null, ...over });
    const wInfo = (over: Partial<WipeoutInfo> = {}): WipeoutInfo => ({
      ladder: [100, 200, 300, 400, 500],
      current: 1,
      done: 2,
      rows: [wRow('a', { bank: 300, decision: 'decided' }), wRow('b', { bank: 300, decision: 'pending' })],
      inCount: 2,
      decide: { endsAt: Date.now() + 10_000, remainingMs: null, decided: 1, total: 2 },
      decisions: false,
      ...over,
    });
    const wRound: RoundInfo = { index: 0, total: 1, title: '', type: 'wipeout', partial: false, description: '', brief: emptyBrief('wipeout'), times: null };

    it('leaderboard: the ladder with the player groups, «Вирішили 1 з 2», a timer and no standings table', () => {
      show(view({ phase: 'leaderboard', round: wRound, wipeout: wInfo(), standings: null }));
      expect(document.querySelector('.wipeout-ladder.is-stage')).not.toBeNull();
      expect(screen.getByText('У грі')).toBeTruthy();
      expect(screen.getByText('Вирішили 1 з 2')).toBeTruthy();
      expect(screen.getByRole('timer')).toBeTruthy();
      expect(document.querySelector('.standings')).toBeNull();
    });

    it('leaderboard after the window closes: no countdown', () => {
      show(view({ phase: 'leaderboard', round: wRound, wipeout: wInfo({ decide: null }) }));
      expect(screen.queryByRole('timer')).toBeNull();
      expect(screen.queryByText(/Вирішили/)).toBeNull();
    });

    it('intro: the ladder sits under the briefing', () => {
      show(view({ phase: 'intro', round: wRound, wipeout: wInfo({ current: -1, done: 0, decide: null }) }));
      expect(document.querySelector('.wipeout-ladder.is-stage')).not.toBeNull();
    });

    it('question: a narrow strip with the current rung, no big ladder', () => {
      show(view({ phase: 'question', round: wRound, questionIndex: 1, question, wipeout: wInfo({ decide: null }) }));
      expect(screen.getByText('Сходинка 2 з 5 · 200')).toBeTruthy();
      expect(document.querySelector('.wipeout-ladder')).toBeNull();
    });

    it('question: a bank column beside the question with the players who are in', () => {
      show(view({ phase: 'question', round: wRound, questionIndex: 1, question, wipeout: wInfo({ decide: null, rows: [wRow('a', { bank: 300 }), wRow('b', { bank: 200 })] }) }));
      expect(document.querySelector('.stage-question.has-wipeout-side')).not.toBeNull();
      const side = document.querySelector('aside.wipeout-side') as HTMLElement;
      expect(side.textContent).toContain('У грі · 2');
      expect(side.textContent).toContain('Гравець a');
      expect(side.textContent).toContain('300');
      expect(side.textContent).toContain('Гравець b');
      expect(side.textContent).toContain('200');
    });

    it('reveal: the rung list sits in the side column', () => {
      show(view({ phase: 'reveal', round: wRound, questionIndex: 1, question, reveal: full, wipeout: wInfo({ decide: null, rows: [wRow('a', { bank: 300, prev: 100 })] }) }));
      const side = document.querySelector('aside.wipeout-side') as HTMLElement;
      expect(side.querySelector('.wipeout-step-list.is-stage')).not.toBeNull();
      expect(side.textContent).toContain('100 → 300');
      expect(side.querySelector('h2')?.textContent).toBe('Як пройшли сходинку');
    });

    it('reveal: when the only player left burns, the bar counts those who played the rung', () => {
      const rows = [wRow('a', { status: 'burned', step: 1, prev: 100 }), wRow('b', { status: 'took', bank: 100, step: 0 })];
      show(view({ phase: 'reveal', round: wRound, questionIndex: 1, question, reveal: full, answeredCount: 1, wipeout: wInfo({ decide: null, inCount: 0, rows }) }));
      expect(screen.getByText('Відповіли 1 з 1')).toBeTruthy();
    });

    it('a classic question has no side column', () => {
      show(view({ phase: 'question', questionIndex: 0, question }));
      expect(document.querySelector('.has-wipeout-side')).toBeNull();
      expect(document.querySelector('aside.wipeout-side')).toBeNull();
    });

    it('leaderboard once the window closed: «Рішення» with the choices group', () => {
      const rows = [wRow('a', { bank: 300, choice: 'took' })];
      show(view({ phase: 'leaderboard', round: wRound, wipeout: wInfo({ decide: null, decisions: true, rows }) }));
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Рішення');
      expect(document.querySelector('.wipeout-group.is-choices')).not.toBeNull();
      expect(document.querySelector('.wipeout-players.is-decisions')).not.toBeNull();
      expect(screen.getAllByText('Рішення')).toHaveLength(1);
    });

    it('leaderboard with the window open keeps «Драбина» and the timer', () => {
      show(view({ phase: 'leaderboard', round: wRound, wipeout: wInfo() }));
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Драбина');
      expect(screen.getByRole('timer')).toBeTruthy();
    });
  });

  describe('survival', () => {
    const sRow = (id: string, nickname: string, over: Partial<SurvivalRow> = {}): SurvivalRow => ({ playerId: id, nickname, status: 'alive', outAfter: null, ghost: null, answer: null, trial: null, door: null, ...over });
    const tQuestion = { ...question, text: 'Скільки ніг у павука?', points: 0 };
    const trialOf = (over: Partial<SurvivalTrialInfo> = {}): SurvivalTrialInfo => ({ kind: 'question', fellBack: false, stage: 'open', endsAt: Date.now() + 15_000, remainingMs: null, limitMs: 15_000, done: 1, total: 2, question: tQuestion, reveal: null, ...over });
    const sInfo = (over: Partial<SurvivalInfo> = {}): SurvivalInfo => {
      const rows = over.rows ?? [sRow('a', 'Оля', { status: 'edge', trial: 'done' }), sRow('b', 'Петро', { status: 'edge', trial: 'pending' }), sRow('c', 'Іра')];
      return { current: 1, total: 5, target: 1, bonus: 500, trialKind: 'question', trialsLeft: 1, rows, aliveCount: rows.filter((r) => r.status !== 'ghost').length, ghostCount: rows.filter((r) => r.status === 'ghost').length, ghosts: { answered: 0, right: null }, verdict: 'trial', trial: trialOf(), ending: false, ...over };
    };
    const sRound: RoundInfo = { index: 0, total: 1, title: '', type: 'survival', partial: false, description: '', brief: emptyBrief('survival'), times: null };

    it('intro: the board and «Лишиться 1 · бонус 500» under the briefing', () => {
      show(view({ phase: 'intro', round: sRound, survival: sInfo({ current: -1, trial: null, verdict: null }) }));
      expect(document.querySelector('.survival-board.is-stage')).not.toBeNull();
      expect(screen.getByText('Лишиться 1 · бонус 500')).toBeTruthy();
    });

    it('question: a narrow strip, «Відповіли 1 з 3» counts the alive', () => {
      show(view({ phase: 'question', round: sRound, questionIndex: 1, question, answeredCount: 1, playerCount: 4, survival: sInfo({ trial: null, verdict: null, rows: [sRow('a', 'Оля'), sRow('b', 'Петро'), sRow('c', 'Іра'), sRow('d', 'Марко', { status: 'ghost', outAfter: 1 })] }) }));
      expect(screen.getByText('Запитання 2 з 5 · живих 3 · привидів 1')).toBeTruthy();
      expect(screen.getByText('Відповіли 1 з 3')).toBeTruthy();
      expect(document.querySelector('.survival-board')).toBeNull();
    });

    it('reveal: the edge players and the ghost hits under the answer', () => {
      show(view({ phase: 'reveal', round: sRound, questionIndex: 1, question, reveal: full, survival: sInfo({ trial: null, verdict: 'trial', rows: [sRow('a', 'Оля', { status: 'edge' }), sRow('d', 'Марко', { status: 'ghost', outAfter: 1 })], ghosts: { answered: 2, right: 1 } }) }));
      expect(screen.getByText('Привиди: 1 з 2 відгадали')).toBeTruthy();
      expect(document.querySelector('.survival-edge-line')?.textContent).toContain('Оля');
    });

    it('leaderboard with a question: the question, «Відповіли 1 з 2», a timer and no standings', () => {
      show(view({ phase: 'leaderboard', round: sRound, survival: sInfo(), standings: null }));
      expect(screen.getByText('Скільки ніг у павука?')).toBeTruthy();
      expect(screen.getByText('Відповіли 1 з 2')).toBeTruthy();
      expect(screen.getByRole('timer')).toBeTruthy();
      expect(document.querySelector('.standings')).toBeNull();
      expect(document.querySelector('.survival-board.is-stage')).not.toBeNull();
    });

    it('leaderboard after the close: the right answer and safe / out for each', () => {
      const rows = [sRow('a', 'Оля', { status: 'alive', trial: 'safe' }), sRow('b', 'Петро', { status: 'ghost', outAfter: 2, trial: 'out' })];
      show(view({ phase: 'leaderboard', round: sRound, survival: sInfo({ rows, trial: trialOf({ stage: 'closed', endsAt: null, reveal: full }) }) }));
      expect(screen.getByText('Правильна відповідь: B. Київ')).toBeTruthy();
      expect(screen.getByText('вижив(-ла)')).toBeTruthy();
      expect(screen.getByText('вибуває')).toBeTruthy();
      expect(screen.queryByRole('timer')).toBeNull();
    });

    it('luck: three doors for every player on the edge, then the trap after the close', () => {
      const luck = trialOf({ kind: 'luck', question: null });
      show(view({ phase: 'leaderboard', round: sRound, survival: sInfo({ trial: luck }) }));
      expect(document.querySelectorAll('.survival-edge-rows .survival-doors')).toHaveLength(2);
      expect(document.querySelectorAll('.survival-edge-rows .survival-door')).toHaveLength(6);
      expect(screen.getByText('вибрав(-ла)')).toBeTruthy();
      expect(screen.getByText('думає…')).toBeTruthy();
      expect(screen.queryByText('Пастка!')).toBeNull();
      cleanup();
      const rows = [sRow('a', 'Оля', { status: 'alive', trial: 'safe', door: { picked: 0, auto: false, trap: 2 } }), sRow('b', 'Петро', { status: 'ghost', outAfter: 2, trial: 'out', door: { picked: 1, auto: true, trap: 1 } })];
      show(view({ phase: 'leaderboard', round: sRound, survival: sInfo({ rows, trial: { ...luck, stage: 'closed', endsAt: null } }) }));
      expect(screen.getAllByText('Пастка!')).toHaveLength(2);
      expect(screen.getByText('вибрано самі')).toBeTruthy();
    });

    it('all wrong: the big verdict, no trial', () => {
      show(view({ phase: 'leaderboard', round: sRound, survival: sInfo({ trial: null, verdict: 'all_wrong', rows: [sRow('a', 'Оля', { status: 'edge' })] }) }));
      expect(screen.getByRole('heading', { name: 'Помилилися всі — ніхто не вибуває.' })).toBeTruthy();
      cleanup();
      show(view({ phase: 'leaderboard', round: sRound, survival: sInfo({ trial: null, verdict: 'all_right' }) }));
      expect(screen.getByRole('heading', { name: 'Усі вціліли.' })).toBeTruthy();
    });

    it('round end: the usual table', () => {
      show(view({ phase: 'round_end', round: sRound, survival: sInfo({ trial: null, verdict: null }), standings: [{ playerId: 'a', nickname: 'Оля', score: 500, rank: 1 }] as unknown as StageView['standings'] }));
      expect(document.querySelector('.standings')).not.toBeNull();
      expect(document.querySelector('.survival-board')).toBeNull();
    });
  });

  describe('ladder', () => {
    const lRound: RoundInfo = { index: 0, total: 1, title: '', type: 'ladder', partial: false, description: '', brief: emptyBrief('ladder'), times: null };
    const flat = (el: Element) => (el.textContent ?? '').replace(/\s/g, ' ');

    it('a team ladder in chosen mode names only the contestant team, right under the ladder header (12g)', () => {
      const teams = teamsView({ answerer: 'chosen' });
      teams.teams[1]!.answererId = 'u3';
      show(view({ phase: 'question', round: lRound, questionIndex: 0, question, teams, ladder: ladderInfo({ contestant: { playerId: 'team-b', nickname: 'Сині' } }) }));
      const line = document.querySelector('.stage-ladder > .stage-answerers')!;
      expect(document.querySelector('.stage-ladder > header.bar')!.nextElementSibling).toBe(line);
      expect([...line.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['Сині']);
      expect(line.textContent).toContain('відповідає: Петро');
    });

    it('a team ladder in captain mode has no answerer line (12g)', () => {
      show(view({ phase: 'question', round: lRound, questionIndex: 0, question, teams: teamsView(), ladder: ladderInfo({ contestant: { playerId: 'team-b', nickname: 'Сині' } }) }));
      expect(document.querySelector('.stage-answerers')).toBeNull();
    });

    it('intro: the ladder beside the briefing; «Хто піде на драбину?» until picked, then the nickname and how', () => {
      show(view({ phase: 'intro', round: lRound, ladder: ladderInfo({ contestant: null, current: -1 }) }));
      expect(document.querySelector('.ladder-stage-intro > .ladder-board.is-stage')).not.toBeNull();
      expect(document.querySelector('.ladder-intro-main .round-brief')).not.toBeNull();
      expect(screen.getByText('Хто піде на драбину?')).toBeTruthy();
      cleanup();
      show(view({ phase: 'intro', round: lRound, ladder: ladderInfo({ pick: 'random', drawn: true, current: -1 }) }));
      expect(screen.queryByText('Хто піде на драбину?')).toBeNull();
      expect(screen.getByText('Олена')).toBeTruthy();
      expect(screen.getByText('за жеребом')).toBeTruthy();
    });

    it('question: «🙈 Оля» in the ladder header without seconds, gone without anyone away', () => {
      show(view({ phase: 'question', round: lRound, questionIndex: 2, question, ladder: ladderInfo(), away: ['Оля'] }));
      const line = document.querySelector('.stage-ladder header.bar .away-line') as HTMLElement;
      expect(line.textContent).toBe('🙈 Оля');
      expect(line.title).toBe('Оля');
      expect(within(line).queryByText(/\d+ с/)).toBeNull();
      cleanup();
      show(view({ phase: 'question', round: lRound, questionIndex: 2, question, ladder: ladderInfo() }));
      expect(document.querySelector('.stage-ladder')).not.toBeNull();
      expect(document.querySelector('.away-line')).toBeNull();
    });

    it('question: the question beside the ladder, the removed options dimmed in place, the hall voting', () => {
      show(
        view({
          phase: 'question',
          round: lRound,
          questionIndex: 2,
          question,
          ladder: ladderInfo({
            fifty: ['a'],
            lifelines: [
              { kind: 'fifty', state: 'active' },
              { kind: 'audience', state: 'active' },
            ],
            audience: { state: 'voting', endsAt: null, remainingMs: null, voted: 1, total: 2, tally: null },
          }),
        }),
      );
      expect(document.querySelector('.ladder-board.is-stage')).not.toBeNull();
      expect(screen.getByText('Столиця України?')).toBeTruthy();
      expect(screen.getByText('Київ')).toBeTruthy();
      const removed = document.querySelectorAll('.choice.is-removed');
      expect(removed).toHaveLength(1);
      // Прибраний варіант на своєму місці з літерою й позначкою «прибрано».
      expect(removed[0]).toBe(document.querySelector('.choices > :first-child'));
      expect(removed[0].textContent).toContain('Львів');
      expect(removed[0].getAttribute('aria-label')).toBe('Львів — прибрано');
      expect(within(removed[0] as HTMLElement).getByText('прибрано')).toBeTruthy();
      expect(screen.getByText('Зал голосує: 1 з 2')).toBeTruthy();
      expect(screen.getByText('Зал відповів: 0 з 2')).toBeTruthy();
    });

    it('a closed hall vote shows the tally on the stage', () => {
      show(
        view({
          phase: 'question',
          round: lRound,
          questionIndex: 2,
          question,
          ladder: ladderInfo({ audience: { state: 'closed', endsAt: null, remainingMs: null, voted: 2, total: 2, tally: { cast: 2, counts: { a: 1, b: 1 } } } }),
        }),
      );
      expect(screen.queryByText(/Зал голосує/)).toBeNull();
      expect(document.querySelectorAll('.vote-row')).toHaveLength(2);
    });

    it('a closed hall vote leaves out the options removed by 50/50', () => {
      show(
        view({
          phase: 'question',
          round: lRound,
          questionIndex: 2,
          question,
          ladder: ladderInfo({ fifty: ['a'], audience: { state: 'closed', endsAt: null, remainingMs: null, voted: 1, total: 2, tally: { cast: 1, counts: { b: 1 } } } }),
        }),
      );
      expect(document.querySelectorAll('.vote-row')).toHaveLength(1);
    });

    it('locked: «Остаточна відповідь» next to the contestant pick', () => {
      show(view({ phase: 'locked', round: lRound, questionIndex: 2, question, ladder: ladderInfo({ contestantPick: 'a' }) }));
      const picked = document.querySelector('.choice.is-picked');
      expect(picked).not.toBeNull();
      expect(within(picked as HTMLElement).getByText('Остаточна відповідь')).toBeTruthy();
    });

    it('reveal: the right option green, a wrong pick red, the hall hits with the points', () => {
      show(view({ phase: 'reveal', round: lRound, questionIndex: 2, question, reveal: full, ladder: ladderInfo({ contestantPick: 'a', hall: { answered: 2, total: 2, right: 1 } }) }));
      expect(document.querySelector('.choice.is-correct')?.textContent).toContain('Київ');
      expect(document.querySelector('.choice.is-picked.is-wrong')?.textContent).toContain('Львів');
      expect(flat(document.body)).toContain('Зал: 1 з 2 відгадали — по +100');
    });

    it('leaderboard: «вирішує» with the banked sum, no standings table', () => {
      show(view({ phase: 'leaderboard', round: lRound, standings: null, ladder: ladderInfo({ decision: 'pending' }) }));
      expect(flat(document.body)).toContain('Олена вирішує: грати далі чи забрати 300?');
      expect(document.querySelector('.standings')).toBeNull();
      expect(document.querySelector('.ladder-board.is-stage')).not.toBeNull();
    });

    it('leaderboard: playing on, and the outcome with its points (not the banked sum after a miss)', () => {
      show(view({ phase: 'leaderboard', round: lRound, ladder: ladderInfo({ decision: 'go' }) }));
      expect(screen.getByText('Граємо далі!')).toBeTruthy();
      cleanup();
      show(view({ phase: 'leaderboard', round: lRound, ladder: ladderInfo({ decision: null, outcome: { kind: 'took', passed: 2, points: 300 } }) }));
      expect(flat(document.body)).toContain('Олена забирає 300');
      cleanup();
      show(view({ phase: 'leaderboard', round: lRound, ladder: ladderInfo({ decision: null, banked: 300, guaranteed: 100, outcome: { kind: 'wrong', passed: 2, points: 100 } }) }));
      expect(screen.getByRole('status').textContent).toBe('Помилка — Олена отримує 100');
      cleanup();
      show(view({ phase: 'leaderboard', round: lRound, ladder: ladderInfo({ contestant: null, decision: null, outcome: { kind: 'stopped', passed: 1, points: 0 } }) }));
      expect(screen.getByRole('status').textContent).toBe('Драбину зупинено: учасник вийшов');
    });

    it('round_end: the usual standings table', () => {
      show(view({ phase: 'round_end', round: lRound, ladder: ladderInfo(), standings: [] }));
      expect(document.querySelector('.standings')).not.toBeNull();
    });
  });

  describe('teams', () => {
    const lRound: RoundInfo = { index: 0, total: 2, title: 'Розминка', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null };
    it('the team lobby shows the team columns instead of the player chips', () => {
      show(view({ teams: teamsView({ unassigned: [{ id: 'u9', nickname: 'Ігор', connected: true }] }) }));
      expect(document.querySelectorAll('.stage-team')).toHaveLength(2);
      expect(document.querySelector('.chips')).toBeNull();
      expect(screen.getByText('Без команди: Ігор')).toBeTruthy();
      expect(document.querySelector('.qr')).not.toBeNull();
    });

    it('a solo lobby keeps the chips', () => {
      show(view({ players: [{ id: 'p1', nickname: 'Олена', connected: true, streak: 0 }], playerCount: 1 }));
      expect(document.querySelector('.stage-team')).toBeNull();
      expect(document.querySelector('.chips')!.textContent).toContain('Олена');
    });

    it('the round table lists the teams with the people under the names', () => {
      show(
        view({
          phase: 'round_end',
          round: lRound,
          teams: teamsView(),
          standings: [
            { participantId: 'team-b', nickname: 'Сині', score: 900, totalTimeMs: 0, rank: 1 },
            { participantId: 'team-a', nickname: 'Червоні', score: 400, totalTimeMs: 0, rank: 2 },
          ],
        }),
      );
      const first = document.querySelector('.standings li')!;
      expect(first.classList.contains('team-1')).toBe(true);
      expect(first.querySelector('.standing-members')!.textContent).toBe('Оля, Петро, Ната');
    });

    it('a rotate team question names who answers right under the header, above the question (12g)', () => {
      const teams = teamsView({ answerer: 'rotate' });
      teams.teams[1]!.answererId = 'u3';
      show(view({ phase: 'question', round: lRound, questionIndex: 0, question, teams }));
      const bar = document.querySelector('.stage-question > header.bar')!;
      const line = document.querySelector('.stage-question > .stage-answerers')!;
      expect(bar.nextElementSibling).toBe(line);
      expect(line.compareDocumentPosition(document.querySelector('.stage-question h1')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(line.textContent).toContain('відповідає: Петро');
      expect(line.textContent).toContain('відповідає: Іра');
    });
  });
});

describe('StageScreen: live sort (11d)', () => {
  const categories = [
    { id: 'c1', text: 'Овочі' },
    { id: 'c2', text: 'Фрукти' },
  ];
  const sortQ = { ...question, type: 'sort' as const, choices: [], sort: { categories, total: 4, lockSeconds: 3 } };
  const fullSort: Question = {
    id: 'q9',
    type: 'sort',
    text: 'Розкладіть',
    imageUrl: null,
    video: null,
    timeLimit: 60,
    points: 100,
    lockSeconds: 3,
    categories,
    words: [
      { id: 'w1', text: 'Морква', categoryId: 'c1' },
      { id: 'w2', text: 'Яблуко', categoryId: 'c2' },
      { id: 'w3', text: 'Буряк', categoryId: 'c1' },
      { id: 'w4', text: 'Груша', categoryId: 'c2' },
    ],
  };
  const live = (over = {}) => ({
    sorterId: 'p1',
    nickname: 'Анна',
    card: { id: 'w3', text: 'Буряк' },
    missed: null,
    lockedUntil: null,
    lockRemainingMs: null,
    sorted: 1,
    total: 4,
    misses: 0,
    timeMs: null,
    seq: 1,
    columns: [{ id: 'c1', words: [{ id: 'w1', text: 'Морква' }] }, { id: 'c2', words: [] }],
    last: null,
    marks: null,
    ...over,
  });
  const words = [{ id: 'w3', text: 'Буряк' }, { id: 'w4', text: 'Груша' }, { id: 'w1', text: 'Морква' }, { id: 'w2', text: 'Яблуко' }];
  const rows = [{ playerId: 'p1', nickname: 'Анна', sorted: 1, misses: 0, timeMs: null, points: null }];
  const info = (liveInfo: ReturnType<typeof live> | null) => ({ total: 4, rows, winner: null, words, live: liveInfo }) as never;
  const board = { cell: { category: 'Сад', price: 400, kind: 'normal', answerMode: 'phone', mark: 'none' }, turn: { playerId: 'p1', nickname: 'Анна' } } as unknown as BoardInfo;
  const showTilts = (current: StageView, tilts = {}) =>
    render(<StageScreen view={current} code="123456" joinUrl="http://quiz.test/play/123456" offsetMs={0} hostOnline tilts={tilts} />);

  it('shows the chooser card, filling columns and chips without placed words', () => {
    show(view({ phase: 'question', questionIndex: 0, question: sortQ, board, endsAt: Date.now() + 20_000, sort: info(live()) }));
    expect(document.querySelector('.stage-sort-live .sort-live-card')?.textContent).toBe('Буряк');
    const col = [...document.querySelectorAll('.sort-reveal-col')].find((el) => el.querySelector('h3')?.textContent === 'Овочі')!;
    expect(col.textContent).toContain('Морква');
    expect([...document.querySelectorAll('.sort-words li')].map((li) => li.textContent)).not.toContain('Морква');
    // Слово на картці теж не дублюється чипом.
    expect([...document.querySelectorAll('.sort-words li')].map((li) => li.textContent)).toEqual(['Груша', 'Яблуко']);
  });

  it('the header already names who answers, so the strip has no «сортує слова» line', () => {
    show(view({ phase: 'question', questionIndex: 0, question: sortQ, board, endsAt: Date.now() + 20_000, sort: info(live()) }));
    expect(screen.getByText('Відповідає Анна')).toBeTruthy();
    expect(document.querySelector('.stage-sort-live .sort-watching')).toBeNull();
  });

  it('a tilt highlights the column', () => {
    showTilts(
      view({ phase: 'question', questionIndex: 0, question: sortQ, board, endsAt: Date.now() + 20_000, sort: info(live()) }),
      { p1: { sorterId: 'p1', wordId: 'w3', toward: 'c2', amount: 0.7, seq: 1 } },
    );
    const col = [...document.querySelectorAll('.sort-reveal-col')].find((el) => el.querySelector('h3')?.textContent === 'Фрукти')!;
    expect(col.classList.contains('is-toward')).toBe(true);
  });

  it('the reveal shows the marks', () => {
    show(view({ phase: 'reveal', questionIndex: 0, question: sortQ, board, reveal: fullSort, sort: info(live({ card: null, marks: [{ wordId: 'w1', misses: 1, late: false }] })) }));
    expect(document.querySelector('.sort-mark')?.textContent).toBe('✗1');
  });

  it('a classic sort has no marks and no live card', () => {
    show(view({ phase: 'reveal', questionIndex: 0, question: sortQ, reveal: fullSort, sort: info(null) }));
    expect(document.querySelector('.sort-mark')).toBeNull();
    expect(document.querySelector('.sort-late')).toBeNull();
    expect(document.querySelector('.stage-sort-live')).toBeNull();
    expect(document.querySelector('.sort-reveal.is-open')).not.toBeNull();
  });
});

describe('StageScreen lobby of a game with no host', () => {
  it('says the bot hosts the game; a hosted lobby does not', () => {
    show(view({ autopilot: true }));
    expect(screen.getByText('🤖 Гру веде бот')).toBeTruthy();
    cleanup();
    show(view({ autopilot: false }));
    expect(screen.queryByText(/Гру веде бот/)).toBeNull();
  });
});

describe('StageScreen: facts (12d)', () => {
  const reveal = { accepted: 4, answered: 7, fastest: { names: ['Оля'], timeMs: 2100 }, bluff: null };
  const facts = (over: Partial<NonNullable<StageView['facts']>> = {}): StageView['facts'] => ({ reveal: null, round: null, awards: null, ...over });
  const round: RoundInfo = { index: 0, total: 2, title: '', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null };
  const row = (participantId: string, nickname: string, score: number, rank: number) => ({ participantId, nickname, score, totalTimeMs: 1, rank, rounds: [score] });
  const standings = [row('a', 'Віра', 900, 1), row('b', 'Оля', 500, 2)];
  const cards = [
    { kind: 'lightning' as const, names: ['Оля'], timeMs: 2100, question: { roundIndex: 0, number: 3, text: 'Столиця України?' } },
    { kind: 'sniper' as const, names: ['Віра'], correct: 5, answered: 6 },
    { kind: 'streak' as const, names: ['Петро'], length: 4 },
  ];
  afterEach(() => vi.useRealTimers());

  it('the reveal line stands right under the correct answer; no facts — no line', () => {
    show(view({ phase: 'reveal', questionIndex: 0, question, reveal: full, stats: { answered: 7, accepted: 4, counts: { a: 3, b: 4 } }, facts: facts({ reveal }) }));
    const answer = document.querySelector('.lead.answer')!;
    const line = answer.nextElementSibling!;
    expect(line.classList.contains('reveal-facts')).toBe(true);
    expect(line.classList.contains('is-big')).toBe(true);
    expect(line.textContent).toBe('Правильно 4 з 7 · найшвидше — Оля, 2,1 с');
    cleanup();
    show(view({ phase: 'reveal', questionIndex: 0, question, reveal: full, stats: { answered: 7, accepted: 4, counts: { a: 3, b: 4 } } }));
    expect(document.querySelector('.reveal-facts')).toBeNull();
  });

  it('the wall draws no reveal line even with facts', () => {
    const wallQuestion = { ...question, type: 'wall' as const, text: 'Знайдіть групи', timeLimit: 90, choices: [], wall: { tiles: Array.from({ length: 16 }, (_, n) => `Плитка ${n}`), size: 4, groupCount: 4, maxMistakes: 3 } };
    const wallFull = { id: 'w1', type: 'wall', text: 'Знайдіть групи', imageUrl: null, video: null, timeLimit: 90, points: 1000, mistakes: 3, groups: ['Річки', 'Міста', 'Гори', 'Озера'].map((name, g) => ({ id: `g${g}`, name, tiles: [0, 1, 2, 3].map((n) => ({ id: `t${g}${n}`, text: `${name}${n}` })) })) } as Question;
    show(view({ phase: 'reveal', questionIndex: 0, question: wallQuestion, reveal: wallFull, facts: facts({ reveal }) }));
    expect(document.querySelector('.reveal-facts')).toBeNull();
  });

  it('the bluff reveal names the lie that fooled the most under the board', () => {
    const bluffQuestion = { ...question, type: 'bluff' as const, text: 'Вежу хотіли поставити в …', choices: [] };
    const bluffFull = { id: 'bl1', type: 'bluff', text: bluffQuestion.text, imageUrl: null, video: null, timeLimit: 60, points: 1000, accepted: ['Барселона'], lies: ['Мілан'], choiceTime: 30 } as unknown as Question;
    const options = [
      { id: 'b1', text: 'Мілан', open: true, kind: 'lie' as const, authors: ['Петро'], pickedBy: ['Оля', 'Віра', 'Тарас'], removed: false },
      { id: 'b2', text: 'Барселона', open: true, kind: 'truth' as const, authors: [], pickedBy: [], removed: false },
    ];
    const bluff = { stage: 'reveal' as const, written: 1, picked: 3, options, shown: 2, total: 2, lastOpenedId: null, lies: null };
    show(view({ phase: 'reveal', questionIndex: 0, question: bluffQuestion, reveal: bluffFull, bluff, facts: facts({ reveal: { accepted: 0, answered: 3, fastest: null, bluff: { names: ['Петро'], votes: 3 } } }) }));
    const line = document.querySelector('.stage-bluff .reveal-facts');
    expect(line?.textContent).toBe('Найбільше голосів: вигадка від Петро — 3 голоси');
    expect(line?.previousElementSibling?.classList.contains('bluff-board')).toBe(true);
  });

  it('round end with cards: two columns, «Цікавинки раунду» beside the table, the 11f line in place', () => {
    show(view({ phase: 'round_end', round, standings, facts: facts({ round: cards }) }));
    const board = document.querySelector('.stage-board.is-round-end.has-facts')!;
    expect(board).not.toBeNull();
    const main = board.querySelector(':scope > .round-end-main')!;
    expect(main.querySelector('h1')?.textContent).toBe('Підсумки раунду 1');
    expect(main.querySelector('.standings')).not.toBeNull();
    expect(main.querySelector('.round-best')).not.toBeNull();
    const aside = board.querySelector(':scope > aside.round-facts')!;
    expect(aside.querySelector('h2')?.textContent).toBe('Цікавинки раунду');
    expect(aside.querySelectorAll('.fact-card')).toHaveLength(3);
    expect(aside.querySelector('.fact-cards.is-big')).not.toBeNull();
  });

  it('round end cards never name the round, awards of a game with several rounds do', () => {
    const second = [{ ...cards[0], question: { roundIndex: 0, number: 1, text: 'Столиця України?' } }];
    show(view({ phase: 'round_end', round, standings, facts: facts({ round: second }) }));
    const body = document.querySelector('.fact-lightning .fact-body')?.textContent ?? '';
    expect(body).toContain('запитання 1');
    expect(body).not.toContain('раунду');
    cleanup();
    vi.useFakeTimers();
    const finished = view({ phase: 'finished', round: { ...round, index: 1 }, standings, facts: facts({ awards: second }) });
    const stage = (seq: number | null) => <StageScreen view={finished} code="123456" joinUrl="http://quiz.test/play/123456" offsetMs={0} hostOnline awardsSeq={seq} />;
    const { rerender } = render(stage(null));
    rerender(stage(1));
    expect(document.querySelector('.award-body')?.textContent).toContain('запитання 1 раунду 1');
  });

  it('the podium splash holds the awards: a tap under it opens the award, its 4 s start after the splash', () => {
    const T = 1_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(T);
    const finished = view({ phase: 'finished', round: { ...round, index: 1 }, standings, facts: facts({ awards: cards }), splash: { kind: 'podium', at: T, until: T + 2500 } });
    const stage = (seq: number | null) => <StageScreen view={finished} code="123456" joinUrl="http://quiz.test/play/123456" offsetMs={0} hostOnline awardsSeq={seq} />;
    const { rerender } = render(stage(null));
    expect(document.querySelector('.splash')).not.toBeNull();
    rerender(stage(1));
    expect(document.querySelector('.award-title')?.textContent).toBe('⚡ Блискавка');
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(document.querySelector('.splash')).toBeNull();
    expect(document.querySelector('.award-title')?.textContent).toBe('⚡ Блискавка');
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(document.querySelector('.award-title')?.textContent).toBe('⚡ Блискавка');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector('.award-title')?.textContent).toBe('🎯 Снайпер');
  });

  it('round end without cards keeps the 11f markup', () => {
    show(view({ phase: 'round_end', round, standings, facts: facts({ round: [] }) }));
    const board = document.querySelector('.stage-board.is-round-end')!;
    expect(board.classList.contains('has-facts')).toBe(false);
    expect(board.querySelector('aside')).toBeNull();
    expect(board.querySelector('.round-end-main')).toBeNull();
    expect(board.querySelector(':scope > h1')).not.toBeNull();
    expect(board.querySelector(':scope > .standings')).not.toBeNull();
  });

  it('finished: host taps move the awards over the podium; autopilot goes by itself after 10 s', () => {
    vi.useFakeTimers();
    const finished = view({ phase: 'finished', questionIndex: 2, round: { ...round, index: 1 }, standings, facts: facts({ awards: cards }) });
    const stage = (seq: number | null, current = finished) => <StageScreen view={current} code="123456" joinUrl="http://quiz.test/play/123456" offsetMs={0} hostOnline awardsSeq={seq} />;
    const { rerender } = render(stage(null));
    expect(document.querySelector('.stage-board.is-final')).not.toBeNull();
    rerender(stage(1));
    rerender(stage(2));
    expect(document.querySelector('.stage-board.is-final')).toBeNull();
    expect(document.querySelector('.stage-board.is-award .meta')?.textContent).toBe('Нагороди гри · 2 з 3');
    expect(document.querySelector('.award-title')?.textContent).toBe('🎯 Снайпер');
    cleanup();

    render(stage(null, { ...finished, autopilot: true }));
    expect(document.querySelector('.stage-board.is-final')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(document.querySelector('.award-title')?.textContent).toBe('⚡ Блискавка');
  });
});

describe('StageScreen: away (12e)', () => {
  it('names who left the game in the question header, never the seconds', () => {
    show(view({ phase: 'question', questionIndex: 0, question, endsAt: Date.now() + 20_000, remainingMs: 20_000, playerCount: 3, away: ['Оля', 'Петро'] }));
    const line = document.querySelector('header.bar .away-line') as HTMLElement;
    expect(line.textContent).toBe('🙈 Оля, Петро');
    // Повний перелік — у підказці: довгий рядок обрізається трикрапкою; емодзі — лише для ока.
    expect(line.title).toBe('Оля, Петро');
    expect(line.querySelector('[aria-hidden="true"]')?.textContent).toBe('🙈');
    expect(within(line).queryByText(/\d+ с/)).toBeNull();
  });

  it('stays on the reveal and is gone without anyone away', () => {
    show(view({ phase: 'reveal', questionIndex: 0, question, reveal: full, playerCount: 3, away: ['Оля'] }));
    expect(document.querySelector('header.bar .away-line')?.textContent).toBe('🙈 Оля');
    cleanup();
    show(view({ phase: 'question', questionIndex: 0, question, endsAt: Date.now() + 20_000, remainingMs: 20_000, playerCount: 3 }));
    expect(document.querySelector('.away-line')).toBeNull();
  });
});

describe('StageScreen: appeal (12f)', () => {
  const textQ = { ...question, type: 'text' as const, text: 'Місто біля моря?', choices: [] };
  const textFull: Question = { id: 'q1', type: 'text', text: 'Місто біля моря?', imageUrl: null, video: null, timeLimit: 20, points: 1000, accepted: ['Одеса'] };
  const appeal = (over: Partial<AppealView> = {}): AppealView => ({
    id: 1,
    by: { playerId: 'p2', nickname: 'Оля' },
    reason: 'grade',
    answer: { type: 'text', value: 'Одеська' },
    question: textFull,
    points: 200,
    endsAt: Date.now() + 21_000,
    remainingMs: null,
    yes: 1,
    no: 0,
    waiting: 1,
    outcome: null,
    undone: false,
    ...over,
  });
  const revealed = (over: Partial<StageView> = {}) => view({ phase: 'reveal', questionIndex: 0, question: textQ, reveal: textFull, playerCount: 3, ...over });

  it('shows the open appeal over the reveal: who appeals, the question to the hall, the bar and the counts', () => {
    show(revealed({ appeal: appeal() }));
    const card = document.querySelector('.appeal-card.is-stage') as HTMLElement;
    expect(within(card).getByRole('heading', { name: '⚖️ Оля оскаржує' })).toBeTruthy();
    expect(within(card).getByText('Відповідь «Одеська», правильна — «Одеса». Зарахувати?')).toBeTruthy();
    expect(within(card).getByText('так 1 · ні 0 · ще думає 1')).toBeTruthy();
    expect(card.querySelector('.appeal-bar')).not.toBeNull();
    // Розкриття лишається на місці: картка — окремий шар, а не частина .stage-board.
    expect(screen.getByText('Правильна відповідь: Одеса')).toBeTruthy();
    expect(card.closest('.stage-board')).toBeNull();
  });

  it('after a yes says «⚖️ Зараховано! +200»', () => {
    show(revealed({ appeal: appeal({ outcome: 'yes', endsAt: null, waiting: 0, yes: 2 }) }));
    expect(document.querySelector('.appeal-card.is-stage .appeal-result')?.textContent).toBe('⚖️ Зараховано! +200');
  });

  it('keeps room at the bottom for the card: the stage gets .has-appeal only while the card is shown', () => {
    show(revealed({ appeal: appeal() }));
    expect(document.querySelector('main.app.stage')?.classList.contains('has-appeal')).toBe(true);
    cleanup();
    show(revealed());
    expect(document.querySelector('main.app.stage')?.classList.contains('has-appeal')).toBe(false);
  });

  it('names the other results: kept, the penalty lifted, the host, an undone decision', () => {
    const result = () => document.querySelector('.appeal-card.is-stage .appeal-result')?.textContent;
    show(revealed({ appeal: appeal({ outcome: 'no', endsAt: null, waiting: 0, points: 0, yes: 1, no: 2 }) }));
    expect(result()).toBe('⚖️ Лишається як було · так 1 · ні 2');
    cleanup();
    show(revealed({ appeal: appeal({ reason: 'away', answer: null, outcome: 'yes', endsAt: null, waiting: 0, yes: 2 }) }));
    expect(result()).toBe('⚖️ Штраф знято');
    expect(screen.getByText('Штраф за вихід із гри. Зняти штраф?')).toBeTruthy();
    cleanup();
    show(revealed({ appeal: appeal({ outcome: 'host', endsAt: null, waiting: 0, points: 0 }) }));
    expect(result()).toBe('⚖️ Зараховано ведучим');
    cleanup();
    show(revealed({ appeal: appeal({ outcome: 'yes', endsAt: null, waiting: 0, points: 0, undone: true }) }));
    expect(result()).toBe('⚖️ Рішення залу скасовано');
  });

  it('a team appeal names the team', () => {
    show(revealed({ teams: teamsView(), appeal: appeal({ by: { playerId: 't1', nickname: 'Червоні' } }) }));
    expect(screen.getByRole('heading', { name: '⚖️ Команда «Червоні» оскаржує' })).toBeTruthy();
  });

  it('on a pause the countdown stands at the time left', () => {
    show(revealed({ paused: true, appeal: appeal({ endsAt: null, remainingMs: 25_000 }) }));
    expect(document.querySelector('.appeal-card.is-stage .appeal-time')?.textContent).toBe('0:25');
  });

  it('no appeal — no card', () => {
    show(revealed());
    expect(document.querySelector('.appeal-card')).toBeNull();
  });
});
