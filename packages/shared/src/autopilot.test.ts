import { describe, expect, it } from 'vitest';
import {
  AUTOPILOT_BLOCKS,
  AUTOPILOT_CHANGES,
  DEFAULT_RULES,
  autopilotCheck,
  autopilotIntroMs,
  autopilotQuiz,
  quizSchema,
  type Quiz,
  type Round,
} from './index';

const single = (id: string, patch: object = {}) => ({
  id,
  type: 'single',
  text: 'Столиця України?',
  imageUrl: null,
  video: null,
  timeLimit: 20,
  points: 1000,
  options: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
  ],
  correctId: 'b',
  ...patch,
});
const four = (id: string, patch: object = {}) =>
  single(id, {
    options: [
      { id: 'a', text: 'Один' },
      { id: 'b', text: 'Два' },
      { id: 'c', text: 'Три' },
      { id: 'd', text: 'Чотири' },
    ],
    ...patch,
  });
const list = (prefix: string, count: number, patch: object = {}) =>
  Array.from({ length: count }, (_, i) => single(`${prefix}${i}`, patch));
const classic = (id: string, questions: object[], patch: object = {}) => ({
  id,
  type: 'classic',
  title: '',
  speedBonus: true,
  shuffleOptions: false,
  rules: DEFAULT_RULES,
  questions,
  ...patch,
});
const blitz = (id: string, patch: object = {}) => ({
  id,
  type: 'blitz',
  title: '',
  shuffleOptions: false,
  answerWindow: null,
  attempts: null,
  check: 'auto',
  rules: { ...DEFAULT_RULES, partial: null },
  questions: list(`${id}q`, 2),
  ...patch,
});
const board = (id: string, patch: object = {}, cellPatches: object[] = []) => ({
  id,
  type: 'board',
  title: '',
  shuffleOptions: false,
  answerMode: 'phone',
  check: 'auto',
  rules: DEFAULT_RULES,
  categories: [0, 1, 2].map((c) => ({
    id: `${id}c${c}`,
    title: `К${c}`,
    cells: [0, 1, 2].map((i) => ({
      mark: 'none',
      kind: 'normal',
      penalty: 'none',
      ...(cellPatches[c * 3 + i] ?? {}),
      question: single(`${id}c${c}i${i}`),
    })),
  })),
  ...patch,
});
const final = (id: string, patch: object = {}) => ({
  id,
  type: 'final',
  title: '',
  shuffleOptions: false,
  check: 'auto',
  wagerMode: 'classic',
  questions: [single(`${id}q`)],
  ...patch,
});
const ladder = (id: string, patch: object = {}, questionPatch: object = {}) => ({
  id,
  type: 'ladder',
  title: '',
  shuffleOptions: false,
  questions: Array.from({ length: 5 }, (_, i) => four(`${id}q${i}`, questionPatch)),
  levels: [100, 200, 300, 400, 500],
  safe: [],
  pick: 'lowest',
  lifelines: [],
  timer: true,
  ...patch,
});
const wipeout = (id: string) => ({ id, type: 'wipeout', title: '', shuffleOptions: false, questions: list(`${id}q`, 5) });
const survival = (id: string) => ({
  id,
  type: 'survival',
  title: '',
  speedBonus: false,
  shuffleOptions: false,
  rules: DEFAULT_RULES,
  questions: list(`${id}q`, 3),
  trials: list(`${id}t`, 1),
  trial: 'question',
  survivors: 1,
  bonus: 0,
});

const quiz = (rounds: object[], settings: object = {}): Quiz =>
  quizSchema.parse({ title: 'Т', description: '', settings: { leaderboard: 'each', ...settings }, rounds });
const codes = (q: Quiz) => autopilotCheck(q).changed;

describe('autopilot constants', () => {
  it('lists the changes in table order and blocks nothing', () => {
    expect([...AUTOPILOT_CHANGES]).toEqual(['voice', 'manual', 'ladder_pick', 'hint', 'untimed']);
    expect([...AUTOPILOT_BLOCKS]).toEqual([]);
  });
});

describe('autopilotCheck and autopilotQuiz', () => {
  it('leaves a plain classic quiz alone', () => {
    const q = quiz([classic('r0', list('a', 2))]);
    expect(autopilotCheck(q)).toEqual({ blocked: [], changed: [] });
    expect(autopilotQuiz(q)).toEqual(q);
  });

  it('turns a voice board into phone; a manual board keeps its check (the autopilot judges by the key)', () => {
    const q = quiz([
      classic('r0', list('a', 1)),
      board('r1', { answerMode: 'voice', check: 'manual' }, [{ answerMode: 'phone' }, { kind: 'blitz' }]),
    ]);
    const before = JSON.parse(JSON.stringify(q)) as Quiz;
    expect(codes(q)).toEqual([
      { code: 'voice', rounds: [1] },
      { code: 'manual', rounds: [1] },
    ]);
    const out = autopilotQuiz(q);
    const round = out.rounds[1] as Extract<Round, { type: 'board' }>;
    expect(round.answerMode).toBe('phone');
    expect(round.check).toBe('manual');
    expect(round.categories.flatMap((c) => c.cells).some((cell) => cell.answerMode === 'voice')).toBe(false);
    expect(q).toEqual(before);
  });

  it('a voice cell in a phone board counts as voice', () => {
    const q = quiz([board('r0', {}, [{}, {}, { answerMode: 'voice' }])]);
    expect(codes(q)).toEqual([{ code: 'voice', rounds: [0] }]);
    const round = autopilotQuiz(q).rounds[0] as Extract<Round, { type: 'board' }>;
    expect(round.categories[0].cells[2].answerMode).toBe('phone');
  });

  it('a manual final becomes automatic; a manual blitz keeps its buzzer and check (judged by the key)', () => {
    const q = quiz([blitz('r0', { check: 'manual' }), classic('r1', list('a', 1)), final('r2', { check: 'manual' })]);
    expect(codes(q)).toEqual([{ code: 'manual', rounds: [0, 2] }]);
    const out = autopilotQuiz(q);
    expect(out.rounds.map((r) => ('check' in r ? r.check : null))).toEqual(['manual', null, 'auto']);
  });

  it('a host-picked ladder contestant is drawn, the lowest stays', () => {
    const host = quiz([ladder('r0', { pick: 'host' })]);
    expect(codes(host)).toEqual([{ code: 'ladder_pick', rounds: [0] }]);
    expect((autopilotQuiz(host).rounds[0] as Extract<Round, { type: 'ladder' }>).pick).toBe('random');
    expect(codes(quiz([ladder('r0', { pick: 'lowest' })]))).toEqual([]);
  });

  it('the hint buff needs a hint on every question of classic and board rounds', () => {
    const buffs = { buffs: ['hint'] };
    expect(codes(quiz([classic('r0', [single('a', { hint: 'Річка' }), single('b')])], buffs))).toEqual([{ code: 'hint', rounds: [0] }]);
    expect(codes(quiz([classic('r0', [single('a', { hint: 'Річка' })])], buffs))).toEqual([]);
    expect(codes(quiz([classic('r0', [single('a')])]))).toEqual([]);
    expect(codes(quiz([final('r0')], buffs))).toEqual([]);
  });

  it('the hint buff with swap also needs a hint on the spares that can come in', () => {
    const hinted = (id: string) => single(id, { hint: 'Річка' });
    const withSpares = (rounds: object[], settings: object, spares?: object[]): Quiz =>
      quizSchema.parse({ title: 'Т', description: '', settings: { leaderboard: 'each', ...settings }, rounds, ...(spares === undefined ? {} : { spares }) });
    // Загальні запасні — для класики (і поля, коли в категоріях запасних немає).
    const general = { buffs: ['hint', 'swap'] };
    expect(codes(withSpares([classic('r0', [hinted('a')])], general, [single('s1')]))).toEqual([{ code: 'hint', rounds: [0] }]);
    expect(codes(withSpares([classic('r0', [hinted('a')])], general, [hinted('s1')]))).toEqual([]);
    // Без swap запасні не приходять.
    expect(codes(withSpares([classic('r0', [hinted('a')])], { buffs: ['hint'] }, [single('s1')]))).toEqual([]);
    // Поле з запасними в категоріях: пул — категорії цього поля, загальні запасні не важать.
    const hintedBoard = (id: string, spare?: object) => {
      const round = board(id);
      return {
        ...round,
        categories: round.categories.map((c, i) => ({
          ...c,
          cells: c.cells.map((cell) => ({ ...cell, question: { ...cell.question, hint: 'Річка' } })),
          ...(i === 0 && spare !== undefined ? { spares: [spare] } : {}),
        })),
      };
    };
    expect(codes(withSpares([hintedBoard('r0', single('s1'))], general))).toEqual([{ code: 'hint', rounds: [0] }]);
    expect(codes(withSpares([hintedBoard('r0', hinted('s1'))], general, [single('s2')]))).toEqual([]);
    // Поле без запасних у категоріях бере загальні.
    expect(codes(withSpares([hintedBoard('r1')], general, [single('s3')]))).toEqual([{ code: 'hint', rounds: [0] }]);
    expect(codes(withSpares([hintedBoard('r1')], general, [hinted('s3')]))).toEqual([]);
  });

  it('every conversion leaves its input unchanged', () => {
    const q = quiz([
      board('r0', { answerMode: 'voice', check: 'manual' }, [{ answerMode: 'voice' }, { kind: 'blitz', penalty: 'all' }]),
      blitz('r1', { check: 'manual' }),
      ladder('r2', { pick: 'host' }),
      final('r3', { check: 'manual' }),
    ]);
    const before = JSON.parse(JSON.stringify(q)) as Quiz;
    const out = autopilotQuiz(q);
    expect(out).not.toBe(q);
    expect(q).toEqual(before);
  });

  it('a blitz cell of a manual board keeps its kind and penalty', () => {
    const q = quiz([board('r0', { check: 'manual' }, [{ kind: 'blitz', penalty: 'all', answerMode: 'voice' }])]);
    const cell = (autopilotQuiz(q).rounds[0] as Extract<Round, { type: 'board' }>).categories[0].cells[0];
    expect(cell).toMatchObject({ kind: 'blitz', penalty: 'all', answerMode: 'phone' });
  });

  it('a video on a board cell is reported as untimed and kept', () => {
    const q = quiz([board('r0', {}, [])]);
    const round = q.rounds[0] as Extract<Round, { type: 'board' }>;
    const withVideo: Quiz = {
      ...q,
      rounds: [{ ...round, categories: round.categories.map((c, i) => (i === 0 ? { ...c, cells: c.cells.map((cell, j) => (j === 0 ? { ...cell, question: { ...cell.question, video: { id: 'dQw4w9WgXcQ', start: 0 } } } : cell)) } : c)) }],
    };
    const parsed = quizSchema.parse(withVideo);
    expect(codes(parsed)).toEqual([{ code: 'untimed', rounds: [0] }]);
    const kept = (autopilotQuiz(parsed).rounds[0] as Extract<Round, { type: 'board' }>).categories[0].cells[0].question.video;
    expect(kept).toEqual({ id: 'dQw4w9WgXcQ', start: 0 });
  });

  it('a ladder hint lifeline needs a hint on every question', () => {
    expect(codes(quiz([classic('r0', list('a', 1)), ladder('r1', { lifelines: ['hint'] })]))).toEqual([{ code: 'hint', rounds: [1] }]);
    expect(codes(quiz([ladder('r0', { lifelines: ['hint'] }, { hint: 'Підказка' })]))).toEqual([]);
    expect(codes(quiz([ladder('r0', { lifelines: ['fifty'] })]))).toEqual([]);
  });

  it('videos and an untimed ladder are reported and left as they are', () => {
    const q = quiz([
      classic('r0', [single('a', { video: { id: 'dQw4w9WgXcQ', start: 0 } })]),
      classic('r1', list('b', 1)),
      classic('r2', list('c', 1)),
      ladder('r3', { timer: false }),
    ]);
    expect(codes(q)).toEqual([{ code: 'untimed', rounds: [0, 3] }]);
    expect(autopilotQuiz(q)).toEqual(q);
  });

  it('orders the changes by the list, not by round', () => {
    const q = quiz([ladder('r0', { pick: 'host' }), blitz('r1', { check: 'manual' }), board('r2', { answerMode: 'voice' })]);
    expect(codes(q)).toEqual([
      { code: 'voice', rounds: [2] },
      { code: 'manual', rounds: [1] },
      { code: 'ladder_pick', rounds: [0] },
    ]);
  });

  it('the converted quiz passes the schema for every format', () => {
    const q = quiz([
      classic('r0', list('a', 2)),
      blitz('r1', { check: 'manual' }),
      board('r2', { answerMode: 'voice', check: 'manual' }, [{ answerMode: 'voice' }, { kind: 'blitz', answerMode: 'voice' }]),
      wipeout('r3'),
      survival('r4'),
      ladder('r5', { pick: 'host' }),
      final('r6', { check: 'manual' }),
    ]);
    expect(() => quizSchema.parse(autopilotQuiz(q))).not.toThrow();
    // Лишається лише ручна перевірка бліцу й поля: її автопілот оцінює за ключем без перетворення.
    expect(codes(autopilotQuiz(q))).toEqual([{ code: 'manual', rounds: [1, 2] }]);
  });
});

describe('autopilotIntroMs', () => {
  const withDescription = (description?: string) =>
    quiz([classic('r0', list('a', 1), description === undefined ? {} : { description })]).rounds[0];
  it('adds a second per sixty characters of the description', () => {
    expect(autopilotIntroMs(withDescription())).toBe(8000);
    expect(autopilotIntroMs(withDescription('а'))).toBe(9000);
    expect(autopilotIntroMs(withDescription('а'.repeat(60)))).toBe(9000);
    expect(autopilotIntroMs(withDescription('а'.repeat(61)))).toBe(10_000);
    expect(autopilotIntroMs(withDescription('а'.repeat(130)))).toBe(11_000);
    expect(autopilotIntroMs(withDescription('а'.repeat(600)))).toBe(18_000);
  });
  it('ignores the spaces around the description', () => {
    expect(autopilotIntroMs({ ...withDescription(), description: `   ${'а'.repeat(60)}   ` } as Round)).toBe(9000);
  });
  it('stops at twenty seconds', () => {
    expect(autopilotIntroMs({ ...withDescription(), description: 'а'.repeat(1000) } as Round)).toBe(20_000);
  });
});
