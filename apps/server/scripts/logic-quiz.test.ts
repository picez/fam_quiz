import { describe, expect, it } from 'vitest';
import { BUFF_KINDS, DEBUFF_KINDS, LIMITS, ROUND_TYPES, allSpares, questionsOf, quizSchema, roundTrials, type Question } from '@quiz/shared';
import { LOGIC_FILES, LOGIC_PHOTOS, logicQuiz } from './logic-quiz';
import { problems } from './logic/check';

const quiz = logicQuiz((key) => `/uploads/${`k${key}`.padEnd(16, 'x')}.png`);
const played: Question[] = [...questionsOf(quiz), ...quiz.rounds.flatMap(roundTrials)];

describe('the «Логіка й дедукція» quiz', () => {
  it('passes every check of logic/check.ts, puzzle answers included', () => {
    expect(problems).toEqual([]);
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
    expect(new Set(quiz.rounds.map((r) => r.type))).toEqual(new Set(ROUND_TYPES.filter((type) => type !== 'wipeout')));
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
