import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_CODE,
  CHALLENGE_DAYS,
  CHALLENGE_SKIP_ROUNDS,
  CHALLENGE_SKIP_SETTINGS,
  CHALLENGE_SKIP_TYPES,
  GROUP_CODE_ALPHABET,
  autopilotCheck,
  challengeDaysLeft,
  challengeQuiz,
  DEFAULT_RULES,
  quizSchema,
  type Quiz,
} from './index';

const base = (id: string, patch: object = {}) => ({
  id,
  text: 'Яка річка тече через Київ?',
  imageUrl: null,
  video: null,
  timeLimit: 25,
  points: 1000,
  ...patch,
});
const single = (id: string, patch: object = {}) =>
  base(id, {
    type: 'single',
    options: [
      { id: 'a', text: 'Дніпро' },
      { id: 'b', text: 'Сян' },
    ],
    correctId: 'a',
    ...patch,
  });
const boolean = (id: string) => base(id, { type: 'boolean', text: 'Львів — на заході України?', correct: true });
const text = (id: string) => base(id, { type: 'text', text: 'Столиця України?', accepted: ['Київ'] });
const poll = (id: string) =>
  base(id, {
    type: 'poll',
    points: 0,
    options: [
      { id: 'a', text: 'Одеса' },
      { id: 'b', text: 'Харків' },
    ],
  });
const wordcloud = (id: string) => base(id, { type: 'wordcloud', words: 3, points: 0 });
const thinkalike = (id: string) => base(id, { type: 'thinkalike', text: 'Назви місто' });
const spy = (id: string) => base(id, { type: 'spy', accepted: ['Дніпро'], spyWord: 'Дністер', voteTime: 25 });
const bluff = (id: string) => base(id, { type: 'bluff', accepted: ['Дніпро'], lies: ['Сян', 'Буг'], choiceTime: 25 });
const drawing = (id: string) => base(id, { type: 'drawing', accepted: ['Річка'] });
const surveyRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, text: `Місто ${i}`, popularity: 10 + i, accepted: [] }));
const survey = (id: string, rows: number, patch: object = {}) =>
  base(id, { type: 'survey', text: 'Назвіть місто України', rows: surveyRows(rows), answers: 1, ...patch });

const classic = (id: string, questions: object[]) => ({
  id,
  type: 'classic',
  title: '',
  speedBonus: true,
  shuffleOptions: false,
  rules: DEFAULT_RULES,
  questions,
});
const blitz = (id: string) => ({
  id,
  type: 'blitz',
  title: '',
  shuffleOptions: false,
  answerWindow: null,
  attempts: null,
  check: 'auto',
  rules: { ...DEFAULT_RULES, partial: null },
  questions: [single(`${id}q0`), single(`${id}q1`)],
});
const truth = (id: string) => ({ id, type: 'truth', title: '', points: 500, timeLimit: 25 });
const think = (id: string) => ({
  id,
  type: 'think',
  title: '',
  lives: 3,
  points: 500,
  questions: Array.from({ length: 3 }, (_, i) =>
    base(`${id}q${i}`, { type: 'think', text: 'Назви місто', points: 0, words: [{ word: 'Київ', synonyms: [] }] }),
  ),
});
const auction = (id: string) => ({
  id,
  type: 'auction',
  title: '',
  shuffleOptions: false,
  check: 'auto',
  bidMode: 'step',
  bidStep: 50,
  loss: 'bid',
  questions: [single(`${id}q`, { betsCut: 1 })],
});
const final = (id: string) => ({
  id,
  type: 'final',
  title: '',
  shuffleOptions: false,
  check: 'auto',
  wagerMode: 'classic',
  questions: [single(`${id}q`)],
});
const ladder = (id: string) => ({
  id,
  type: 'ladder',
  title: '',
  shuffleOptions: false,
  questions: Array.from({ length: 5 }, (_, i) =>
    single(`${id}q${i}`, {
      options: [
        { id: 'a', text: 'Дніпро' },
        { id: 'b', text: 'Сян' },
        { id: 'c', text: 'Буг' },
        { id: 'd', text: 'Прип’ять' },
      ],
    }),
  ),
  levels: [100, 200, 300, 400, 500],
  safe: [],
  pick: 'lowest',
  lifelines: [],
  timer: true,
});
const board = (id: string) => ({
  id,
  type: 'board',
  title: '',
  shuffleOptions: false,
  answerMode: 'phone',
  check: 'auto',
  rules: DEFAULT_RULES,
  categories: [0, 1, 2].map((c) => ({
    id: `${id}c${c}`,
    title: `Т${c}`,
    cells: [0, 1, 2].map((i) => ({ mark: 'none', kind: 'normal', penalty: 'none', question: single(`${id}c${c}i${i}`) })),
  })),
});

const quiz = (rounds: object[], settings: object = {}, extra: object = {}): Quiz =>
  quizSchema.parse({ title: 'Україна', description: '', settings: { leaderboard: 'each', debuffs: [], ...settings }, rounds, ...extra });
const duels = {
  categories: [0, 1].map((c) => ({
    id: `dc${c}`,
    title: `К${c}`,
    questions: [0, 1, 2].map((i) => ({ id: `dc${c}q${i}`, text: 'Столиця України?', accepted: ['Київ'] })),
  })),
  questionsPerDuel: 3,
  timeLimit: 25,
  stake: 100,
};
const none = { rounds: [], questions: [], settings: [] };

describe('challengeQuiz', () => {
  it('keeps a solo quiz as is', () => {
    const q = quiz([classic('r0', [single('a'), boolean('b'), text('c')]), blitz('r1')]);
    const before = JSON.parse(JSON.stringify(q)) as Quiz;
    const out = challengeQuiz(q);
    expect(out.quiz).toEqual(q);
    expect(out.skipped).toEqual(none);
    expect(q).toEqual(before);
  });

  it('drops questions that need other players', () => {
    const q = quiz([
      classic('r0', [single('a'), poll('b'), wordcloud('c'), thinkalike('d'), spy('e'), bluff('f'), drawing('g'), boolean('h')]),
    ]);
    const out = challengeQuiz(q);
    expect(out.quiz?.rounds[0]).toMatchObject({ questions: [{ id: 'a' }, { id: 'h' }] });
    expect(out.skipped).toEqual({ rounds: [], questions: [{ index: 0, count: 6 }], settings: [] });
  });

  it('survey stays without the cloud, or goes without rows', () => {
    const q = quiz([
      classic('r0', [wordcloud('cl'), survey('s1', 4, { cloudId: 'cl' }), survey('s2', 0, { cloudId: 'cl' }), single('a')]),
    ]);
    const out = challengeQuiz(q);
    const kept = (out.quiz?.rounds[0] as { questions: { id: string }[] }).questions;
    expect(kept.map((x) => x.id)).toEqual(['s1', 'a']);
    expect(kept[0]).not.toHaveProperty('cloudId');
    expect((kept[0] as unknown as { rows: unknown[] }).rows).toHaveLength(4);
    expect(out.skipped.questions).toEqual([{ index: 0, count: 2 }]);
    expect(q.rounds[0]).toMatchObject({ questions: [{}, { cloudId: 'cl' }, {}, {}] });
  });

  it('drops whole rounds', () => {
    const q = quiz([classic('r0', [single('a')]), truth('r1'), think('r2'), auction('r3'), classic('r4', [poll('p')])]);
    const out = challengeQuiz(q);
    expect(out.quiz?.rounds.map((r) => r.id)).toEqual(['r0']);
    expect(out.skipped.rounds).toEqual([
      { index: 1, type: 'truth', reason: 'type' },
      { index: 2, type: 'think', reason: 'type' },
      { index: 3, type: 'auction', reason: 'type' },
      { index: 4, type: 'classic', reason: 'empty' },
    ]);
    expect(out.skipped.questions).toEqual([]);
  });

  it('drops teams, duels and the debuff shop', () => {
    const rounds = [classic('r0', [single('a'), single('b'), single('c'), single('d'), single('e'), single('f')])];
    const q = quiz(
      rounds,
      { teams: { count: 2, names: ['Лис', 'Вовк'] }, debuffs: ['freeze'] },
      { duels },
    );
    const out = challengeQuiz(q);
    expect(out.quiz?.settings).not.toHaveProperty('teams');
    expect(out.quiz).not.toHaveProperty('duels');
    expect(out.quiz?.settings.debuffShop).toBe(false);
    expect(out.skipped.settings).toEqual(['teams', 'duels', 'debuffShop']);
    expect(q.settings.teams).toBeDefined();
    expect(q.duels).toBeDefined();

    const plain = challengeQuiz(quiz(rounds, { debuffs: [] }));
    expect(plain.quiz?.settings.debuffShop).toBeUndefined();
    expect(plain.skipped.settings).toEqual([]);
  });

  it('the snapshot is valid and the autopilot can run it', () => {
    const q = quiz(
      [
        classic('r0', [single('a'), poll('b'), wordcloud('cl'), survey('s', 4, { cloudId: 'cl' }), bluff('d')]),
        truth('r1'),
        think('r2'),
        auction('r3'),
        board('r4'),
        ladder('r5'),
        final('r6'),
      ],
      { teams: { count: 2, names: ['Лис', 'Вовк'] }, debuffs: ['freeze'] },
      { duels },
    );
    const out = challengeQuiz(q);
    expect(out.quiz).not.toBeNull();
    expect(quizSchema.safeParse(out.quiz).success).toBe(true);
    expect(autopilotCheck(out.quiz as Quiz).blocked).toEqual([]);
  });

  it('nothing left', () => {
    const q = quiz([truth('r0'), classic('r1', [poll('p')])]);
    const out = challengeQuiz(q);
    expect(out.quiz).toBeNull();
    expect(out.skipped.rounds).toHaveLength(2);
  });

  it('lists what it skips', () => {
    expect([...CHALLENGE_SKIP_ROUNDS]).toEqual(['truth', 'think', 'auction']);
    expect([...CHALLENGE_SKIP_TYPES]).toEqual(['poll', 'wordcloud', 'thinkalike', 'spy', 'bluff', 'drawing']);
    expect([...CHALLENGE_SKIP_SETTINGS]).toEqual(['teams', 'duels', 'debuffShop']);
  });
});

describe('challenge code and days', () => {
  it('accepts 12 characters of the group alphabet only', () => {
    const ok = GROUP_CODE_ALPHABET.slice(0, 12);
    expect(CHALLENGE_CODE.test(ok)).toBe(true);
    expect(CHALLENGE_CODE.test(ok.slice(0, 11))).toBe(false);
    expect(CHALLENGE_CODE.test(`${ok}a`)).toBe(false);
    for (const bad of ['0', 'l', 'o', 'A']) expect(CHALLENGE_CODE.test(`${ok.slice(0, 11)}${bad}`)).toBe(false);
  });

  it('counts the days left, rounding up, never below 0', () => {
    const now = Date.UTC(2026, 10, 18);
    const at = (ms: number) => new Date(now + ms).toISOString();
    const day = 86_400_000;
    expect(CHALLENGE_DAYS).toBe(7);
    expect(challengeDaysLeft(at(CHALLENGE_DAYS * day), now)).toBe(7);
    expect(challengeDaysLeft(at(1), now)).toBe(1);
    expect(challengeDaysLeft(at(-5000), now)).toBe(0);
  });
});
