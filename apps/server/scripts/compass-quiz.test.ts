import { describe, expect, it } from 'vitest';
import { QUESTION_TYPES, ROUND_TYPES, allSpares, boardSpareSource, duelShortfall, questionsOf, quizSchema, type Quiz } from '@quiz/shared';
import { compassQuiz } from './compass-quiz';
import { demoQuiz } from './demo-quiz';
import { eruditeQuiz } from './erudite-quiz';
import { mosaicQuiz } from './mosaic-quiz';
import { movieQuiz } from './movie-quiz';
import { partyQuiz } from './party-quiz';
import { schoolQuiz } from './school-quiz';

/** Типи, що з'явилися після цієї вікторини (10e і далі): її ще не оновлено під них. */
const LATER_TYPES = new Set<string>(['survey', 'bluff']);

const key = (text: string) => text.trim().toLocaleLowerCase('uk');

describe('the «Компас» quiz', () => {
  it('passes the quiz schema', () => {
    const result = quizSchema.safeParse(compassQuiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });

  it('has every round type and every question type', () => {
    expect(new Set(compassQuiz.rounds.map((r) => r.type))).toEqual(new Set(ROUND_TYPES));
    expect(compassQuiz.rounds.filter((r) => r.type === 'classic').length).toBeGreaterThanOrEqual(2);
    expect(new Set(questionsOf(compassQuiz).map((q) => q.type))).toEqual(new Set(QUESTION_TYPES.filter((type) => !LATER_TYPES.has(type))));
  });

  it('is a full evening with unique question texts that do not repeat other demo quizzes', () => {
    const texts = questionsOf(compassQuiz).map((q) => key(q.text));
    expect(texts.length).toBeGreaterThanOrEqual(70);
    expect(texts.length).toBeLessThanOrEqual(90);
    expect(new Set(texts).size).toBe(texts.length);
    const spares = allSpares(compassQuiz).map((q) => key(q.text));
    expect(new Set([...texts, ...spares]).size).toBe(texts.length + spares.length);
    const others = new Set(
      [demoQuiz, eruditeQuiz, mosaicQuiz, movieQuiz, partyQuiz(), schoolQuiz].flatMap((quiz: Quiz) => [...questionsOf(quiz), ...allSpares(quiz)].map((q) => key(q.text))),
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
});
