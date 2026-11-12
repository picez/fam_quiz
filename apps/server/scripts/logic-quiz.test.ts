import { describe, expect, it } from 'vitest';
import { BUFF_KINDS, DEBUFF_KINDS, LIMITS, ROUND_TYPES, allSpares, questionsOf, quizSchema, roundTrials, type Question } from '@quiz/shared';
import { LOGIC_FILES, LOGIC_PHOTOS, logicQuiz } from './logic-quiz';
import { answerLeaks, moreLessLeaks, problems } from './logic/check';

const quiz = logicQuiz((key) => `/uploads/${`k${key}`.padEnd(16, 'x')}.png`);
const played: Question[] = [...questionsOf(quiz), ...quiz.rounds.flatMap(roundTrials)];

describe('the «Логіка й дедукція» quiz', () => {
  it('passes every check of logic/check.ts, puzzle answers included', () => {
    expect(problems).toEqual([]);
  });

  it('the more or less leak check looks at each pair on its own, option texts included', () => {
    const option = (text: string, value: string) => ({ text, value });
    const pair = (id: string, prompt: string, a: ReturnType<typeof option>, b: ReturnType<typeof option>) => ({ id, prompt, a, b, correct: 'a' as const, points: 100 });
    const q = {
      id: 'q', type: 'moreless', text: 'Порівняйте', hint: null, imageUrl: null, video: null, audio: null, timeLimit: 60, points: 300,
      pairs: [
        pair('p1', 'Що вище?', option('Говерла (2061 м)', '2061 м'), option('Ейфелева вежа', '330 м')),
        // 1233 км стоїть у тексті іншої пари — це не витік цієї.
        pair('p2', 'Що довше?', option('Рейн', '2850 км'), option('Дунай', '1233 км')),
        pair('p3', 'Що довше: 1233 км чи ні?', option('Дніпро', '2201 км'), option('Десна', '1130 км')),
        pair('p4', 'Що глибше?', option('Світязь', '58 м'), option('Синевир, 22 м завглибшки', '22 м')),
      ],
    } as unknown as Extract<Question, { type: 'moreless' }>;
    expect(moreLessLeaks(q)).toEqual([
      '«Порівняйте» p1: value «2061 м» appears in the question',
      '«Порівняйте» p4: value «22 м» appears in the question',
    ]);
  });

  it('a drawing (28c) whose word or spelling stands in the text is a leak', () => {
    const q = (text: string) =>
      ({ id: 'q', type: 'drawing', text, hint: null, imageUrl: null, video: null, audio: null, timeLimit: 60, points: 100, accepted: ['маяк', 'маячок'] }) as unknown as Question;
    expect(answerLeaks(q('Що на малюнку?'))).toEqual([]);
    expect(answerLeaks(q('Намалюйте маяк!'))).toEqual(['«Намалюйте маяк!»: answer «маяк» appears in the question']);
    expect(answerLeaks(q('Що це, маячок?'))).toEqual(['«Що це, маячок?»: answer «маячок» appears in the question']);
  });

  it('passes the quiz schema within the limits', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(played.length).toBeGreaterThanOrEqual(130);
    expect(played.length).toBeLessThanOrEqual(LIMITS.maxQuizQuestions);
    expect(allSpares(quiz).length).toBeGreaterThanOrEqual(2);
  });

  it('uses most round and question types, all buffs and debuffs, duels', () => {
    // «Ва-банк» не вмістився: десять раундів — межа.
    expect(new Set(quiz.rounds.map((r) => r.type))).toEqual(new Set(ROUND_TYPES.filter((type) => type !== 'wipeout' && type !== 'bets' && type !== 'auction' && type !== 'truth' && type !== 'puzzles' && type !== 'quest'))); // 28b: новий тип раунду, сід-скрипти не змінюються; 28d: так само «Головоломки»; 29g: так само «Квест із кодом»
    const types = new Set(played.map((q) => q.type));
    for (const type of ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'sort', 'slider', 'clues', 'pin', 'wall', 'bluff'] as const) expect(types).toContain(type);
    expect(played.some((q) => q.reveal)).toBe(true);
    expect(quiz.settings.buffs).toEqual([...BUFF_KINDS]);
    expect(quiz.settings.debuffs).toEqual([...DEBUFF_KINDS]);
    expect(quiz.duels?.categories).toHaveLength(3);
  });

  it('shows every drawn picture and photo once and gives the hardest puzzles hints', () => {
    const urls = played.map((q) => q.imageUrl).concat(allSpares(quiz).map((q) => q.imageUrl)).filter(Boolean);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toHaveLength(LOGIC_FILES.length + Object.keys(LOGIC_PHOTOS).length);
    expect(played.filter((q) => q.hint).length).toBeGreaterThanOrEqual(15);
  });

  it('never times a question under 20 seconds', () => {
    expect([...played, ...allSpares(quiz)].filter((q) => q.timeLimit < 20).map((q) => q.text)).toEqual([]);
  });
});
