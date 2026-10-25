import { describe, expect, it } from 'vitest';
import { LIMITS, QUESTION_TYPES, ROUND_TYPES, allSpares, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import { compassQuiz } from './compass-quiz';
import { demoQuiz } from './demo-quiz';
import { eruditeQuiz } from './erudite-quiz';
import { horizonQuiz } from './horizon-quiz';
import { mosaicQuiz } from './mosaic-quiz';
import { movieQuiz } from './movie-quiz';
import { partyQuiz } from './party-quiz';
import { schoolQuiz } from './school-quiz';
import { SHOWCASE_IMAGES, showcaseQuiz } from './showcase-quiz';
import { teamsQuiz } from './teams-quiz';

/** Типи запитань і раунди, що з'явилися в підпроєкті 10. */
const NEW_TYPES = ['slider', 'clues', 'pin', 'wall', 'poll', 'wordcloud', 'survey', 'bluff'] as const;
const NEW_ROUNDS = ['wipeout', 'survival', 'ladder'] as const;

const images = Object.fromEntries(SHOWCASE_IMAGES.map((key, i) => [key, `/uploads/${String(i).repeat(16)}.jpg`]));
const plain = showcaseQuiz();
const pictured = showcaseQuiz(images);

const key = (text: string) => text.trim().toLocaleLowerCase('uk');
/** Усі запитання вікторини: раунди, питання на виживання й запасні. */
const everything = (quiz: Quiz): Question[] => [...questionsOf(quiz), ...quiz.rounds.flatMap(roundTrials), ...allSpares(quiz)];

describe('the «Вітрина форматів» quiz', () => {
  it('passes the quiz schema with and without the pictures, within the size limits', () => {
    for (const quiz of [plain, pictured]) {
      const result = quizSchema.safeParse(quiz);
      expect(result.success ? [] : result.error.issues).toEqual([]);
      expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
      expect(everything(quiz).length).toBeLessThanOrEqual(LIMITS.maxQuizQuestions);
    }
  });

  it('has every new question type, audio and both revealing modes', () => {
    const types = new Set(questionsOf(plain).map((q) => q.type));
    for (const type of NEW_TYPES) expect(types.has(type)).toBe(true);
    expect(QUESTION_TYPES).toEqual(expect.arrayContaining([...NEW_TYPES]));
    expect(questionsOf(plain).filter((q) => q.audio?.source === 'youtube').length).toBeGreaterThanOrEqual(1);
    const survey = questionsOf(plain).filter((q) => q.type === 'survey');
    expect(survey.some((q) => q.type === 'survey' && q.cloudId !== undefined)).toBe(true);
    expect(survey.some((q) => q.type === 'survey' && q.cloudId === undefined)).toBe(true);
    const revealed = questionsOf(pictured).filter((q) => q.reveal !== undefined);
    expect(revealed.map((q) => q.reveal).sort()).toEqual(['blur', 'pixels']);
    expect(revealed.every((q) => q.imageUrl !== null)).toBe(true);
  });

  it('without the pictures keeps those questions plain, with no picture wording', () => {
    expect(questionsOf(plain).every((q) => q.reveal === undefined && q.imageUrl === null)).toBe(true);
    expect(questionsOf(plain).some((q) => /картинк/i.test(q.text))).toBe(false);
  });

  it('has every new round, simple types first and the new rounds last, solo', () => {
    const types = plain.rounds.map((r) => r.type);
    for (const type of NEW_ROUNDS) expect(types).toContain(type);
    expect(ROUND_TYPES).toEqual(expect.arrayContaining([...NEW_ROUNDS]));
    expect(types.slice(-3)).toEqual([...NEW_ROUNDS]);
    expect(types.slice(0, -3).every((t) => t === 'classic')).toBe(true);
    const first = plain.rounds[0];
    expect(first.type === 'classic' && first.questions.map((q) => q.type)).toEqual(['poll', 'wordcloud']);
    expect(plain.settings.newcomers).toBe(true);
    expect(plain.settings.teams).toBeUndefined();
  });

  it('has unique question texts that repeat none of the other demo quizzes', () => {
    const own = everything(plain).map((q) => key(q.text));
    expect(new Set(own).size).toBe(own.length);
    const others = new Set(
      [demoQuiz, partyQuiz(), movieQuiz, eruditeQuiz, schoolQuiz, mosaicQuiz, compassQuiz, horizonQuiz, teamsQuiz()].flatMap((quiz) => [
        ...everything(quiz).map((q) => key(q.text)),
        ...(quiz.duels?.categories ?? []).flatMap((c) => c.questions.map((q) => key(q.text))),
      ]),
    );
    expect(own.filter((text) => others.has(text))).toEqual([]);
    const pictures = everything(pictured).map((q) => key(q.text));
    expect(pictures.filter((text) => others.has(text))).toEqual([]);
  });
});
