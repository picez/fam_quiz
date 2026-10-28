// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen as dom } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUFF_KINDS,
  DEBUFF_KINDS,
  emptyBrief,
  type BluffInfo,
  type BoardInfo,
  type BuffKind,
  type GuidePage,
  type PlayerView,
  type Question,
  type RoundInfo,
  type StageView,
} from '@quiz/shared';
import type { Send } from '../live/types';
import { ladderInfo } from './ladder-fixtures';
import { PlayerScreen } from './PlayerScreen';
import { StageScreen } from './StageScreen';
import { baseMe, publicQuestion, teamPlayerView, teamsView } from './team-test-view';

afterEach(cleanup);

/**
 * Сторож 11h: у грі без ведучого жоден досяжний екран телефона й сцени не каже «ведучий».
 * Тексти, що згадують ведучого, але в автопілоті недосяжні (ручна перевірка, коригування балів, дебафи від ведучого), тут не рендеряться навмисно.
 */
const WORD = /ведуч/i;

const fullQuestion: Question = { id: 'q1', type: 'single', text: publicQuestion.text, imageUrl: null, video: null, timeLimit: 20, points: 1000, options: publicQuestion.choices, correctId: 'b' };

const stageBase = (over: Partial<StageView> = {}): StageView => ({
  role: 'stage',
  autopilot: true,
  facts: null,
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
  cloud: null,
  survey: null,
  cloudVoters: null,
  ...over,
});

const author = { cloud: null, bluff: null, people: [] };
/** Зріз учасника без команди; autopilot: true; isAuthor — автор чи ні. */
const phoneBase = (isAuthor: boolean, over: Partial<PlayerView> = {}): PlayerView =>
  teamPlayerView({ autopilot: true, author: isAuthor ? author : null, teams: null, team: null, me: { ...baseMe, id: 'p1', nickname: 'Олена' }, ...over });

const round = (type: RoundInfo['type']): RoundInfo => ({ index: 0, total: 2, title: 'Раунд', type, partial: false, brief: emptyBrief(type), description: '', times: null });

const guidePages: GuidePage[] = [
  { kind: 'phone' },
  { kind: 'teams', count: 2 },
  { kind: 'rounds', rounds: (['classic', 'blitz', 'board', 'final', 'wipeout', 'survival', 'ladder'] as const).map((type) => emptyBrief(type)) },
  { kind: 'questions', types: [{ type: 'single', top: '' }, { type: 'order', top: 'Найбільший' }] },
  { kind: 'buffs', buffs: [...BUFF_KINDS] },
  { kind: 'debuffs', debuffs: [...DEBUFF_KINDS] },
  { kind: 'duels', after: 3, questions: 3, stake: 300, final: false },
];

const board = (dice: BoardInfo['dice']): BoardInfo => ({
  categories: [{ id: 'k1', title: 'Міста', cells: [{ id: 'c1', price: 100, played: false, mark: 'none', kind: 'normal', answerMode: 'phone', penalty: 'none' }] }],
  order: [{ playerId: 'p1', nickname: 'Олена' }],
  turn: null,
  cell: null,
  dice,
  schedule: [],
  scheduleRepeats: false,
  skipAt: null,
  marks: [],
  marksHidden: false,
});
const dice = { rows: [{ playerId: 'p1', nickname: 'Олена', throws: [], waiting: true }], tieBreak: false, done: false };

const bluffInfo = (over: Partial<BluffInfo> = {}): BluffInfo => ({ stage: 'choice', written: 1, picked: 0, options: [], shown: 0, total: 0, lastOpenedId: null, lies: null, ...over });
const bluffQuestion = { ...publicQuestion, type: 'bluff' as const, choices: [] };
const bluffMine = (pick: string | null) => ({ lie: 'Рим', own: [], pick, truth: null, fooled: null });
const spareOption = { id: 'b2', text: 'Мілан', open: true, kind: 'spare' as const, authors: [], pickedBy: [], removed: false };

const hintBuffs = {
  slots: BUFF_KINDS.map((kind: BuffKind) => (kind === 'hint' ? { kind, state: 'blocked', block: 'unfit_host' } : { kind, state: 'ready' })),
  active: null,
} as unknown as NonNullable<PlayerView['me']['buffs']>;

const duel = {
  challenger: { playerId: 'p1', nickname: 'Оля' },
  opponent: { playerId: 'p2', nickname: 'Петро' },
  stage: 'declared',
  categories: [],
  category: null,
  number: 1,
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
} as unknown as NonNullable<PlayerView['duel']>;

interface Screen {
  name: string;
  phone?: (isAuthor: boolean) => PlayerView;
  stage?: StageView;
}

const pendingSpot = { playerId: 'p1', nickname: 'Олена', answer: { choiceIds: ['b'] } as never, grade: null };
const manualBlitz = { queue: [{ playerId: 'p1', nickname: 'Олена' }], winner: null, instant: false, rows: [] };
const mineBlitz = { position: 1, attemptsUsed: 1, attemptsLeft: null, canBuzz: false, deadline: null, canAnswer: false, grade: null };
const manualBoard: BoardInfo = {
  ...board(null),
  turn: { playerId: 'p1', nickname: 'Олена' },
  cell: { id: 'c1', category: 'Міста', price: 100, mark: 'none', kind: 'normal', answerMode: 'phone', penalty: 'none' },
};

const noTeam = { ...teamPlayerView().team!, teamId: null, canPick: false };
const open = { endsAt: Date.now() + 20_000 };

const screens: Screen[] = [
  { name: 'solo lobby', phone: (a) => phoneBase(a), stage: stageBase() },
  { name: 'team lobby, form host', phone: (a) => phoneBase(a, { teams: teamsView({ form: 'host' }), team: noTeam }), stage: stageBase({ teams: teamsView({ form: 'host' }) }) },
  { name: 'team lobby, form dice', phone: (a) => phoneBase(a, { teams: teamsView({ form: 'dice', dice }), team: noTeam }), stage: stageBase({ teams: teamsView({ form: 'dice', dice }) }) },
  ...guidePages.map(
    (page, index): Screen => ({
      name: `guide ${page.kind}`,
      phone: (a) => phoneBase(a, { phase: 'guide', guide: { page: index, pages: guidePages } }),
      stage: stageBase({ phase: 'guide', guide: { page: index, pages: guidePages } }),
    }),
  ),
  { name: 'board intro with dice', phone: (a) => phoneBase(a, { phase: 'intro', round: round('board'), board: board(dice) }), stage: stageBase({ phase: 'intro', round: round('board'), board: board(dice) }) },
  {
    name: 'ladder intro without a contestant',
    phone: (a) => phoneBase(a, { phase: 'intro', round: round('ladder'), ladder: ladderInfo({ contestant: null }), me: { ...baseMe, ladder: { role: 'hall' } as never } }),
    stage: stageBase({ phase: 'intro', round: round('ladder'), ladder: ladderInfo({ contestant: null }) }),
  },
  {
    name: 'classic question with the blocked hint buff',
    phone: (a) => phoneBase(a, { phase: 'question', questionIndex: 0, question: publicQuestion, ...open, me: { ...baseMe, buffs: hintBuffs } }),
    stage: stageBase({ phase: 'question', questionIndex: 0, question: publicQuestion, ...open }),
  },
  {
    name: 'ladder question with an off hint',
    phone: (a) => {
      const own = { role: 'contestant', canLifeline: true, hint: null, canDecide: false, hallClosed: false, hallPoints: null, won: null } as never;
      return phoneBase(a, {
        phase: 'question',
        round: round('ladder'),
        questionIndex: 0,
        question: publicQuestion,
        ...open,
        ladder: ladderInfo({ lifelines: [{ kind: 'fifty', state: 'ready' }, { kind: 'hint', state: 'off' }] }),
        me: { ...baseMe, ladder: own },
      });
    },
    stage: stageBase({ phase: 'question', round: round('ladder'), questionIndex: 0, question: publicQuestion, ...open, ladder: ladderInfo({ lifelines: [{ kind: 'fifty', state: 'ready' }, { kind: 'hint', state: 'off' }] }) }),
  },
  {
    name: 'bluff choice',
    phone: (a) =>
      phoneBase(a, {
        phase: 'question',
        questionIndex: 0,
        question: bluffQuestion,
        ...open,
        bluff: bluffInfo({ options: [{ id: 'b1', text: 'Рим', open: false, kind: null, authors: null, pickedBy: null, removed: false }], total: 1 }),
        me: { ...baseMe, bluff: bluffMine(null) },
      }),
  },
  {
    name: 'bluff reveal with a spare lie',
    phone: (a) =>
      phoneBase(a, {
        phase: 'reveal',
        questionIndex: 0,
        question: bluffQuestion,
        reveal: fullQuestion,
        bluff: bluffInfo({ stage: 'reveal', shown: 1, total: 1, options: [spareOption] }),
        me: { ...baseMe, bluff: bluffMine('b2') },
      }),
    stage: stageBase({ phase: 'reveal', questionIndex: 0, question: bluffQuestion, reveal: fullQuestion, bluff: bluffInfo({ stage: 'reveal', shown: 1, total: 1, options: [spareOption] }) }),
  },
  {
    name: 'declared duel after the reveal',
    phone: (a) => phoneBase(a, { phase: 'reveal', questionIndex: 0, question: publicQuestion, reveal: fullQuestion, duel }),
    stage: stageBase({ phase: 'reveal', questionIndex: 0, question: publicQuestion, reveal: fullQuestion, duel: duel as never }),
  },
  {
    name: 'paused',
    phone: (a) => phoneBase(a, { phase: 'question', questionIndex: 0, question: publicQuestion, paused: true, endsAt: null, remainingMs: 12_000 }),
    stage: stageBase({ phase: 'question', questionIndex: 0, question: publicQuestion, paused: true, endsAt: null, remainingMs: 12_000 }),
  },
  { name: 'finished', phone: (a) => phoneBase(a, { phase: 'finished' }), stage: stageBase({ phase: 'finished' }) },
  {
    name: 'a hint buff toast',
    phone: (a) =>
      phoneBase(a, {
        phase: 'question',
        questionIndex: 0,
        question: publicQuestion,
        ...open,
        buffNotice: { seq: 1, at: Date.now(), playerId: 'p2', nickname: 'Петро', kind: 'hint', questionIndex: 0 },
      }),
  },
  // Ручний бліц і ручна клітинка лишаються ручними: автопілот оцінює відповідь за ключем на крок пізніше, тож очікування видно.
  {
    name: 'manual blitz, own answer pending',
    phone: (a) =>
      phoneBase(a, {
        phase: 'question',
        round: round('blitz'),
        questionIndex: 0,
        question: publicQuestion,
        ...open,
        held: true,
        blitz: manualBlitz,
        spotlight: pendingSpot,
        me: { ...baseMe, id: 'p1', nickname: 'Олена', blitz: mineBlitz },
      }),
    stage: stageBase({ phase: 'question', round: round('blitz'), questionIndex: 0, question: publicQuestion, ...open, held: true, blitz: manualBlitz, spotlight: pendingSpot }),
  },
  {
    name: 'manual blitz, another player pending',
    phone: (a) =>
      phoneBase(a, {
        phase: 'question',
        round: round('blitz'),
        questionIndex: 0,
        question: publicQuestion,
        ...open,
        held: true,
        blitz: manualBlitz,
        spotlight: { ...pendingSpot, playerId: 'p2', nickname: 'Петро' },
        me: { ...baseMe, id: 'p1', nickname: 'Олена', blitz: { ...mineBlitz, position: null, canBuzz: false } },
      }),
  },
  {
    name: 'instant blitz, own answer being checked',
    phone: (a) =>
      phoneBase(a, {
        phase: 'question',
        round: round('blitz'),
        questionIndex: 0,
        question: publicQuestion,
        ...open,
        blitz: { ...manualBlitz, instant: true, rows: [{ playerId: 'p1', nickname: 'Олена', timeMs: 1200, grade: null, answer: null }] },
        me: { ...baseMe, id: 'p1', nickname: 'Олена', blitz: mineBlitz },
      }),
  },
  {
    name: 'manual board cell, own answer pending',
    phone: (a) =>
      phoneBase(a, {
        phase: 'question',
        round: round('board'),
        questionIndex: 0,
        question: publicQuestion,
        ...open,
        held: true,
        board: manualBoard,
        spotlight: pendingSpot,
        me: { ...baseMe, id: 'p1', nickname: 'Олена' },
      }),
    stage: stageBase({ phase: 'question', round: round('board'), questionIndex: 0, question: publicQuestion, ...open, held: true, board: manualBoard, spotlight: pendingSpot }),
  },
];

/** Увесь текст екрана: вміст, title й aria-label усіх елементів. */
function textOf(container: HTMLElement): string {
  const attrs = [...container.querySelectorAll('[title],[aria-label]')].map((el) => `${el.getAttribute('title') ?? ''} ${el.getAttribute('aria-label') ?? ''}`);
  return `${container.textContent ?? ''} ${attrs.join(' ')}`;
}

const send: Send = vi.fn(async () => ({ ok: true as const }));
const phone = (view: PlayerView) =>
  render(<PlayerScreen view={view} hostOnline offsetMs={0} send={send} code="123456" stageUrl="http://quiz.test/stage/123456#tok" stageOnline />);
const stage = (view: StageView) => render(<StageScreen view={view} code="123456" joinUrl="http://quiz.test/play/123456" offsetMs={0} hostOnline />);

describe('a game with no host never says «ведучий»', () => {
  for (const screen of screens) {
    if (screen.phone !== undefined) {
      const make = screen.phone;
      for (const isAuthor of [true, false]) {
        it(`phone (${isAuthor ? 'author' : 'player'}): ${screen.name}`, () => {
          const { container } = phone(make(isAuthor));
          expect(textOf(container).match(/.{0,40}ведуч.{0,40}/gi)).toBeNull();
        });
      }
    }
    if (screen.stage !== undefined) {
      const view = screen.stage;
      it(`stage: ${screen.name}`, () => {
        const { container } = stage(view);
        expect(textOf(container).match(/.{0,40}ведуч.{0,40}/gi)).toBeNull();
      });
    }
  }

  it('a bluff pick that disappears says the author removed it, without the word', () => {
    const pickable = bluffInfo({ options: [{ id: 'b1', text: 'Рим', open: false, kind: null, authors: null, pickedBy: null, removed: false }], total: 1 });
    const withPick = phoneBase(false, { phase: 'question', questionIndex: 0, question: bluffQuestion, ...open, bluff: pickable, me: { ...baseMe, bluff: bluffMine('b1') } });
    const { container, rerender } = phone(withPick);
    rerender(<PlayerScreen view={{ ...withPick, me: { ...baseMe, bluff: bluffMine(null) } }} hostOnline offsetMs={0} send={send} code="123456" stageOnline />);
    expect(container.textContent).toContain('Автор гри прибрав цей варіант');
    expect(textOf(container)).not.toMatch(WORD);
  });

  it('the blocked hint buff explains itself on a tap and in the help sheet without the word', () => {
    const { container } = phone(phoneBase(false, { phase: 'question', questionIndex: 0, question: publicQuestion, ...open, me: { ...baseMe, buffs: hintBuffs } }));
    fireEvent.click(dom.getByRole('button', { name: 'Підказка' }));
    expect(container.querySelector('.buff-why')?.textContent).toBe('Для цього запитання підказки немає.');
    fireEvent.click(dom.getByRole('button', { name: 'Що роблять бафи' }));
    expect(textOf(document.body)).not.toMatch(WORD);
  });

  it('a pending answer under the autopilot says it is checked by the key, on the phone and the timer', () => {
    const view = screens.find((one) => one.name === 'manual blitz, own answer pending')!.phone!(false);
    phone(view);
    expect(dom.getByText('Перевіряємо відповідь за ключем…')).toBeTruthy();
    expect(document.querySelector('.timer-status')?.textContent).toBe('Перевіряємо за ключем');
    cleanup();
    phone(screens.find((one) => one.name === 'instant blitz, own answer being checked')!.phone!(false));
    expect(dom.getByText('Перевіряємо вашу відповідь за ключем…')).toBeTruthy();
  });

  it('a retry buff blocked on a manual board cell explains itself without the word', () => {
    const buffs = { slots: [{ kind: 'retry', state: 'blocked', block: 'unfit_manual' }], active: null } as unknown as NonNullable<PlayerView['me']['buffs']>;
    const { container } = phone(phoneBase(false, { phase: 'question', round: round('board'), questionIndex: 0, question: publicQuestion, ...open, board: manualBoard, me: { ...baseMe, id: 'p1', nickname: 'Олена', buffs } }));
    fireEvent.click(dom.getByRole('button', { name: 'Друга спроба' }));
    expect(container.querySelector('.buff-why')?.textContent).toBe('Відповідь тут перевіряють після здачі — другої спроби немає.');
  });

  it('the guard sees the word: the same team lobby with a host says «Ведучий»', () => {
    const { container } = phone(phoneBase(false, { autopilot: false, teams: teamsView({ form: 'host' }), team: noTeam }));
    expect(textOf(container)).toMatch(WORD);
  });
});
