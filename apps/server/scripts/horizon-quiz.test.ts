import { describe, expect, it } from 'vitest';
import {
  QUESTION_TYPES,
  READY_BUFFS,
  ROUND_TYPES,
  allowedBuffs,
  boardSpareSource,
  cellAnswerMode,
  duelShortfall,
  questionPrice,
  questionsOf,
  quizSchema,
  type Quiz,
} from '@quiz/shared';
import { demoQuiz } from './demo-quiz';
import { partyQuiz } from './party-quiz';
import { movieQuiz } from './movie-quiz';
import { eruditeQuiz } from './erudite-quiz';
import { schoolQuiz } from './school-quiz';
import { mosaicQuiz } from './mosaic-quiz';
import { horizonQuiz } from './horizon-quiz';

/** Типи, що з'явилися після цієї вікторини (10e і далі): її ще не оновлено під них. */
const LATER_TYPES = new Set<string>(['survey', 'bluff']);

/** Тексти всіх запитань вікторини: раунди, загальні запасні, запасні категорій і дуелі. */
const texts = (quiz: Quiz) => [
  ...questionsOf(quiz).map((q) => q.text),
  ...(quiz.spares ?? []).map((q) => q.text),
  ...quiz.rounds.flatMap((r) => (r.type === 'board' ? r.categories.flatMap((c) => (c.spares ?? []).map((q) => q.text)) : [])),
  ...(quiz.duels?.categories ?? []).flatMap((c) => c.questions.map((q) => q.text)),
];
const boards = horizonQuiz.rounds.flatMap((r) => (r.type === 'board' ? [r] : []));
const cells = boards.flatMap((board) => board.categories.flatMap((c) => c.cells.map((cell) => ({ board, cell }))));

describe('the «Горизонт» quiz', () => {
  it('passes the quiz schema', () => {
    const parsed = quizSchema.safeParse(horizonQuiz);
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it('has every round type, two classic rounds and a warm-up', () => {
    const types = horizonQuiz.rounds.map((r) => r.type);
    for (const type of ROUND_TYPES) expect(types).toContain(type);
    expect(types.filter((t) => t === 'classic').length).toBeGreaterThanOrEqual(2);
    expect(types.at(-1)).toBe('final');
    const warmup = horizonQuiz.rounds[0];
    expect(warmup.type === 'classic' && warmup.questions.map((q) => q.type).slice(0, 2)).toEqual(['poll', 'wordcloud']);
    const count = questionsOf(horizonQuiz).length;
    expect(count).toBeGreaterThanOrEqual(70);
    expect(count).toBeLessThanOrEqual(92);
  });

  it('has every question type', () => {
    const types = new Set(questionsOf(horizonQuiz).map((q) => q.type));
    for (const type of QUESTION_TYPES.filter((type) => !LATER_TYPES.has(type))) expect(types.has(type)).toBe(true);
  });

  it('every board has 5–6 categories going 100…500 with ×2, ×3, blitz, voice cells, a pin, a 3×3 wall and spares', () => {
    for (const board of boards) {
      expect(board.categories.length).toBeGreaterThanOrEqual(5);
      expect(board.categories.length).toBeLessThanOrEqual(6);
      for (const category of board.categories) {
        expect(category.cells.map((c) => questionPrice(c.question))).toEqual([100, 200, 300, 400, 500]);
        expect(category.spares?.length).toBe(2);
      }
    }
    expect(boardSpareSource(horizonQuiz)).toBe('category');
    expect(cells.some(({ cell }) => cell.mark === 'x2')).toBe(true);
    expect(cells.some(({ cell }) => cell.mark === 'x3')).toBe(true);
    expect(cells.some(({ cell }) => cell.kind === 'blitz')).toBe(true);
    expect(cells.some(({ board, cell }) => cellAnswerMode(board, cell) === 'voice')).toBe(true);
    expect(cells.some(({ board, cell }) => cell.kind === 'normal' && cellAnswerMode(board, cell) === 'phone' && cell.question.type === 'single')).toBe(true);
    expect(cells.some(({ cell }) => cell.question.type === 'wall' && cell.question.groups.length === 3)).toBe(true);
  });

  it('has a 4×4 wall in a classic round and YouTube audio questions', () => {
    const classic = horizonQuiz.rounds.flatMap((r) => (r.type === 'classic' ? r.questions : []));
    expect(classic.some((q) => q.type === 'wall' && q.groups.length === 4)).toBe(true);
    const audio = questionsOf(horizonQuiz).filter((q) => q.audio?.source === 'youtube');
    expect(audio.length).toBeGreaterThanOrEqual(1);
    expect(audio.every((q) => q.video === null && q.imageUrl === null)).toBe(true);
  });

  it('turns on explanations, buffs, the debuff shop, spares, hints, speed bonus and duels', () => {
    const { settings } = horizonQuiz;
    expect(settings.newcomers).toBe(true);
    expect(allowedBuffs(horizonQuiz)).toEqual([...READY_BUFFS]);
    expect(settings.debuffShop).toBe(true);
    expect(settings.debuffs?.length).toBe(6);
    expect(Object.keys(settings.debuffPrices ?? {}).length).toBe(6);
    expect(horizonQuiz.spares?.map((q) => q.type)).toEqual(['single', 'multi', 'boolean', 'text', 'numeric', 'slider']);
    expect(questionsOf(horizonQuiz).filter((q) => q.hint).length).toBeGreaterThanOrEqual(15);
    expect(horizonQuiz.rounds.every((r) => r.type !== 'classic' || r.speedBonus)).toBe(true);
    expect(horizonQuiz.duels?.categories.length).toBeGreaterThanOrEqual(3);
    expect(duelShortfall(horizonQuiz)).toBeNull();
    expect(questionsOf(horizonQuiz).every((q) => q.imageUrl === null)).toBe(true);
  });

  it('has unique question texts that repeat none of the other demo quizzes', () => {
    const norm = (text: string) => text.trim().toLocaleLowerCase('uk');
    const own = texts(horizonQuiz).map(norm);
    expect(new Set(own).size).toBe(own.length);
    const others = new Set([demoQuiz, partyQuiz(), movieQuiz, eruditeQuiz, schoolQuiz, mosaicQuiz].flatMap(texts).map(norm));
    expect(own.filter((text) => others.has(text))).toEqual([]);
  });
});
