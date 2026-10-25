import { describe, expect, it } from 'vitest';
import { LIMITS, QUESTION_TYPES, ROUND_TYPES, allSpares, boardSpareSource, duelShortfall, questionsOf, quizSchema, roundTrials, type Quiz } from '@quiz/shared';
import { createQuiz, getQuiz, updateQuiz } from '../src/quizzes';
import { user } from '../src/db/schema';
import { createTestDb } from '../src/testing/test-db';
import { compassQuiz } from './compass-quiz';
import { demoQuiz } from './demo-quiz';
import { eruditeQuiz } from './erudite-quiz';
import { horizonQuiz } from './horizon-quiz';
import { mosaicQuiz } from './mosaic-quiz';
import { movieQuiz } from './movie-quiz';
import { partyQuiz } from './party-quiz';
import { schoolQuiz } from './school-quiz';
import { showcaseQuiz } from './showcase-quiz';
import { teamsQuiz } from './teams-quiz';

const key = (text: string) => text.trim().toLocaleLowerCase('uk');

describe('the «Компас» quiz', () => {
  it('passes the quiz schema', () => {
    const result = quizSchema.safeParse(compassQuiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });

  it('has every round type and every question type, «100 до 1» from the warm-up cloud, and the new rounds before the final', () => {
    expect(new Set(compassQuiz.rounds.map((r) => r.type))).toEqual(new Set(ROUND_TYPES));
    expect(compassQuiz.rounds.filter((r) => r.type === 'classic').length).toBeGreaterThanOrEqual(2);
    expect(new Set(questionsOf(compassQuiz).map((q) => q.type))).toEqual(new Set(QUESTION_TYPES));
    expect(compassQuiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(compassQuiz.rounds.slice(-4).map((r) => r.type)).toEqual(['wipeout', 'survival', 'ladder', 'final']);
    const survey = questionsOf(compassQuiz).find((q) => q.type === 'survey');
    const cloud = questionsOf(compassQuiz).find((q) => q.type === 'wordcloud');
    expect(survey?.type === 'survey' && survey.cloudId).toBe(cloud?.id);
  });

  it('is a full evening with unique question texts that do not repeat other demo quizzes', () => {
    const texts = questionsOf(compassQuiz).map((q) => key(q.text));
    expect(texts.length).toBeGreaterThanOrEqual(70);
    expect(texts.length).toBeLessThanOrEqual(90);
    expect(new Set(texts).size).toBe(texts.length);
    const spares = [...allSpares(compassQuiz), ...compassQuiz.rounds.flatMap(roundTrials)].map((q) => key(q.text));
    expect(new Set([...texts, ...spares]).size).toBe(texts.length + spares.length);
    const others = new Set(
      [demoQuiz, eruditeQuiz, mosaicQuiz, movieQuiz, partyQuiz(), schoolQuiz, horizonQuiz, showcaseQuiz(), teamsQuiz()].flatMap((quiz: Quiz) =>
        [...questionsOf(quiz), ...allSpares(quiz), ...quiz.rounds.flatMap(roundTrials)].map((q) => key(q.text)),
      ),
    );
    expect([...texts, ...spares].filter((text) => others.has(text))).toEqual([]);
  });

  it('uses the board features: marks, a blitz cell, a voice cell, phone cells, a 3×3 wall and two spares per category', () => {
    const board = compassQuiz.rounds.find((r) => r.type === 'board');
    expect(board?.type).toBe('board');
    if (board?.type !== 'board') return;
    expect(board.categories.length).toBeGreaterThanOrEqual(5);
    const cells = board.categories.flatMap((c) => c.cells);
    for (const category of board.categories) {
      expect(category.cells.map((c) => c.question.points)).toEqual([100, 200, 300, 400, 500]);
      expect(category.spares).toHaveLength(2);
    }
    expect(cells.some((c) => c.mark === 'x2')).toBe(true);
    expect(cells.some((c) => c.mark === 'x3')).toBe(true);
    expect(cells.some((c) => c.kind === 'blitz')).toBe(true);
    expect(cells.some((c) => c.answerMode === 'voice')).toBe(true);
    const wall = cells.find((c) => c.question.type === 'wall');
    expect(wall?.answerMode ?? board.answerMode).toBe('phone');
    expect(wall?.question.type === 'wall' && wall.question.groups.map((g) => g.tiles.length)).toEqual([3, 3, 3]);
    expect(boardSpareSource(compassQuiz)).toBe('category');
  });

  it('turns on the evening settings: newcomers, buffs, a debuff shop, spares, duels, hints, audio and a speed bonus', () => {
    const { settings } = compassQuiz;
    expect(settings.newcomers).toBe(true);
    expect(settings.buffs).toContain('swap');
    expect(settings.debuffShop).toBe(true);
    expect(Object.keys(settings.debuffPrices ?? {}).length).toBe(settings.debuffs?.length);
    expect(compassQuiz.spares?.length).toBeGreaterThan(0);
    expect(compassQuiz.duels?.categories.length).toBeGreaterThan(0);
    expect(duelShortfall(compassQuiz)).toBeNull();
    const questions = questionsOf(compassQuiz);
    expect(questions.filter((q) => q.hint !== undefined).length).toBeGreaterThanOrEqual(20);
    expect(questions.filter((q) => q.audio?.source === 'youtube').length).toBeGreaterThanOrEqual(1);
    expect(questions.some((q) => q.imageUrl !== null)).toBe(false);
    expect(compassQuiz.rounds.some((r) => r.type === 'classic' && r.speedBonus)).toBe(true);
    const walls = questions.filter((q) => q.type === 'wall').map((q) => (q.type === 'wall' ? q.groups.length : 0));
    expect(walls.sort()).toEqual([3, 4]);
    const maps = new Set(questions.map((q) => (q.type === 'pin' ? q.map : null)).filter(Boolean));
    expect(maps).toEqual(new Set(['world', 'europe', 'ukraine']));
  });

  it('replaces an older copy in place, as seed-demo --update does', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'compass-owner', name: 'Власник', email: 'compass@example.com' });
    const id = await createQuiz(db, 'compass-owner', quizSchema.parse(demoQuiz));
    expect(await updateQuiz(db, 'compass-owner', id, quizSchema.parse(compassQuiz))).toBe(true);
    const loaded = await getQuiz(db, 'compass-owner', id);
    expect(loaded?.title).toBe(compassQuiz.title);
    expect(loaded?.rounds).toEqual(quizSchema.parse(compassQuiz).rounds);
    expect([loaded?.duels, loaded?.spares]).toEqual([compassQuiz.duels, compassQuiz.spares]);
  });
});
