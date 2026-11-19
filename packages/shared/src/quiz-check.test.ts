import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, DEFAULT_SETTINGS, quizSchema, type Question, type Quiz, type Round } from './quiz';
import { QUIZ_CHECK_ERRORS, QUIZ_CHECK_MIN_TIMER, QUIZ_CHECK_WARNINGS, checkSeverity, mediaRefs, quizPlaces, staticIssues, type QuizCheckIssue } from './quiz-check';

const base = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };

const single = {
  ...base,
  id: 'q1',
  type: 'single',
  text: 'Столиця України?',
  options: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
    { id: 'c', text: 'Одеса' },
  ],
  correctId: 'b',
} satisfies Question;

const text = { ...base, id: 'q2', type: 'text', text: 'Яке місто називають перлиною біля моря?', accepted: ['Одеса'] } satisfies Question;
const no = { ...base, id: 'q3', type: 'boolean', text: 'Дунай тече через Харків', correct: false } satisfies Question;

const classic = (id: string, questions: Question[]): Round => ({ id, type: 'classic', title: '', speedBonus: true, shuffleOptions: false, rules: DEFAULT_RULES, questions });
const quizOf = (rounds: Round[], extra: Partial<Quiz> = {}): Quiz => ({ title: 'Перевірка', description: '', settings: { ...DEFAULT_SETTINGS }, rounds, ...extra });

const codes = (issues: QuizCheckIssue[]) => issues.map((i) => i.code);

describe('quiz check codes', () => {
  it('severity comes from the code', () => {
    for (const code of QUIZ_CHECK_ERRORS) expect(checkSeverity(code)).toBe('error');
    for (const code of QUIZ_CHECK_WARNINGS) expect(checkSeverity(code)).toBe('warning');
    expect(QUIZ_CHECK_MIN_TIMER).toBe(25);
  });
});

describe('staticIssues', () => {
  it('a clean quiz has no static issues', () => {
    const quiz = quizOf([classic('r1', [single, text, no])]);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    expect(staticIssues(quiz)).toEqual([]);
  });

  it('finds media in every place, even in a broken quiz', () => {
    const raw = {
      title: 'Медіа',
      rounds: [
        {
          id: 'r1',
          type: 'classic',
          questions: [
            { ...single, id: 'm1', imageUrl: '/uploads/aaaaaaaaaaaaaaaa.jpg', options: [{ id: 'a', text: '', imageUrl: '/uploads/bbbbbbbbbbbbbbbb.png' }, { id: 'b', text: 'Київ' }] },
            { ...text, id: 'm2', audio: { source: 'file', url: '/uploads/cccccccccccccccc.mp3', start: 0, duration: 10 } },
            { ...text, id: 'm3', video: { id: 'E2Evideo001', start: 30 } },
          ],
        },
        { id: 'r2', type: 'classic', questions: [{ ...base, id: 'm4', type: 'videoclip', text: 'Що це за кліп?', clip: { id: 'E2Evideo002', start: 12 }, muted: true, accepted: ['Щедрик'] }] },
      ],
      spares: [{ ...single, id: 'm5', imageUrl: 'https://example.com/x.jpg' }],
    };
    const refs = mediaRefs(raw);
    const storage = refs.filter((r) => r.kind === 'storage');
    expect(storage.map((r) => [r.kind === 'storage' && r.name, r.place.round, r.place.questionId])).toEqual([
      ['aaaaaaaaaaaaaaaa.jpg', 0, 'm1'],
      ['bbbbbbbbbbbbbbbb.png', 0, 'm1'],
      ['cccccccccccccccc.mp3', 0, 'm2'],
    ]);
    expect(refs.filter((r) => r.kind === 'url')).toEqual([{ kind: 'url', url: 'https://example.com/x.jpg', place: { round: null, questionId: 'm5', question: 'Столиця України?' } }]);
    expect(refs.filter((r) => r.kind === 'youtube')).toEqual([
      { kind: 'youtube', id: 'E2Evideo001', start: 30, place: { round: 0, questionId: 'm3', question: text.text } },
      { kind: 'youtube', id: 'E2Evideo002', start: 12, place: { round: 1, questionId: 'm4', question: 'Що це за кліп?' } },
    ]);
    expect(refs).toHaveLength(6);
    expect(quizPlaces(raw).map((p) => [p.round, p.question.id])).toEqual([
      [0, 'm1'],
      [0, 'm2'],
      [0, 'm3'],
      [1, 'm4'],
      [null, 'm5'],
    ]);
  });

  it('structure on raw data', () => {
    const raw = {
      title: 'Зламана',
      rounds: [
        {
          id: 'r1',
          type: 'classic',
          questions: [
            { ...single, id: 's1', correctId: 'zz' },
            { ...base, id: 's2', type: 'multi', text: 'Які міста на Дніпрі?', options: [{ id: 'a', text: 'Київ' }, { id: 'b', text: 'Львів' }], correctIds: [] },
            { ...text, id: 's3', accepted: ['  '] },
            { ...single, id: 's4', options: [{ id: 'a', text: 'Київ' }, { id: 'b', text: 'київ ' }, { id: 'c', text: 'Львів' }], correctId: 'c' },
            { ...single, id: 's5', options: undefined, correctId: 'a' },
            'not a question',
          ],
        },
      ],
    };
    let issues: QuizCheckIssue[] = [];
    expect(() => (issues = staticIssues(raw))).not.toThrow();
    expect(codes(issues)).toContain('schema');
    const of = (id: string) => issues.filter((i) => i.questionId === id && i.code !== 'schema').map((i) => [i.code, i.detail]);
    expect(of('s1')).toEqual([['no_correct', null]]);
    expect(of('s2')).toEqual([['no_correct', null]]);
    expect(of('s3')).toEqual([['empty_answer', null]]);
    expect(of('s4')).toEqual([['duplicate_option', 'Київ']]);
    expect(of('s5')).toEqual([['no_correct', null]]);
    const schema = issues.filter((i) => i.code === 'schema');
    expect(schema.length).toBeLessThanOrEqual(20);
    expect(schema.some((i) => i.questionId === 's5' && i.round === 0 && /^rounds\.0\.questions\.4\.options: /.test(i.detail ?? ''))).toBe(true);
  });

  it('a short timer is a warning, a video question has no timer', () => {
    const short = { ...text, id: 't1', timeLimit: 20 };
    const video = { ...text, id: 't2', timeLimit: 20, video: { id: 'E2Evideo001', start: 0 } };
    const duels = { categories: [{ id: 'dc1', title: 'Столиці', questions: [{ id: 'd1', text: 'Столиця Франції?', accepted: ['Париж'] }] }], questionsPerDuel: 1, timeLimit: 20, stake: 300 };
    const issues = staticIssues(quizOf([classic('r1', [short, video])], { duels }));
    expect(issues).toEqual([
      { code: 'short_timer', round: 0, questionId: 't1', question: text.text, detail: '20' },
      { code: 'short_timer', round: null, questionId: null, question: null, detail: '20' },
    ]);
    expect(checkSeverity('short_timer')).toBe('warning');
  });

  it('leaks: answer in text is an error, in the hint a warning', () => {
    const river = { ...single, id: 'l1', text: 'Яка річка тече через Київ? Дніпро чи Десна?', options: [{ id: 'a', text: 'Дніпро' }, { id: 'b', text: 'Десна' }], correctId: 'a' };
    const hinted = { ...text, id: 'l2', text: 'Найдовша річка України?', accepted: ['Дніпро'], hint: 'Дніпро впадає в Чорне море' };
    const wordPart = { ...text, id: 'l3', text: 'Дніпровський район є в Києві. Яка там річка?', accepted: ['Дніпро'] };
    const number = { ...text, id: 'l4', text: 'Скільки буде 12 мінус 0? 12', accepted: ['12'] };
    const short = { ...text, id: 'l5', text: 'Що кажуть, коли згодні? Ок', accepted: ['Ок'] };
    const clues = { ...base, id: 'l6', type: 'clues', text: 'Хто я?', clues: ['Я поет.', 'Я художник.', 'Мене звати Шевченко.'], accepted: ['Шевченко'], interval: 5 } satisfies Question;
    const quiz = quizOf([classic('r1', [river, hinted, wordPart, number, short, clues])]);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    expect(staticIssues(quiz).map((i) => [i.code, i.questionId, i.detail])).toEqual([
      ['answer_leak', 'l1', 'Дніпро'],
      ['answer_leak', 'l6', 'Шевченко'],
      ['hint_leak', 'l2', 'Дніпро'],
    ]);
  });

  it('a duel answer in its text is a leak', () => {
    const duels = { categories: [{ id: 'dc1', title: 'Столиці', questions: [{ id: 'd1', text: 'Париж — столиця якої країни? Париж', accepted: ['Париж'] }] }], questionsPerDuel: 1, timeLimit: 30, stake: 300 };
    expect(staticIssues(quizOf([classic('r1', [single])], { duels }))).toEqual([
      { code: 'answer_leak', round: null, questionId: 'd1', question: 'Париж — столиця якої країни? Париж', detail: 'Париж' },
    ]);
  });

  it('autopilot blocks per round', () => {
    const think = (id: string): Question => ({ ...base, id, type: 'think', text: 'Напишіть колір веселки', points: 0, words: [] });
    const thinkRound: Round = { id: 'r2', type: 'think', title: '', lives: 3, points: 3000, questions: [think('k1'), think('k2'), think('k3')] };
    const quiz = quizOf([classic('r1', [single]), thinkRound]);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    expect(staticIssues(quiz)).toEqual([{ code: 'autopilot_blocked', round: 1, questionId: null, question: null, detail: 'think_words' }]);
  });

  it('errors come before warnings', () => {
    const short = { ...text, id: 'e1', timeLimit: 20 };
    const leak = { ...text, id: 'e2', text: 'Місто Одеса стоїть біля моря. Яке це місто?', accepted: ['Одеса'] };
    const issues = staticIssues(quizOf([classic('r1', [short]), classic('r2', [leak])]));
    expect(codes(issues)).toEqual(['answer_leak', 'short_timer']);
    const severities = issues.map((i) => checkSeverity(i.code));
    expect(severities.lastIndexOf('error')).toBeLessThan(severities.indexOf('warning'));
  });
});
