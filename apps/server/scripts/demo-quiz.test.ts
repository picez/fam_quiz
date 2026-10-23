import { describe, expect, it } from 'vitest';
import { READY_BUFFS, allowedBuffs, questionsOf, quizSchema } from '@quiz/shared';
import { createQuiz, getQuiz } from '../src/quizzes';
import { user } from '../src/db/schema';
import { createTestDb } from '../src/testing/test-db';
import { demoQuiz } from './demo-quiz';
import { partyQuiz } from './party-quiz';
import { movieQuiz } from './movie-quiz';
import { eruditeQuiz } from './erudite-quiz';
import { schoolQuiz } from './school-quiz';
import { mosaicQuiz } from './mosaic-quiz';

describe('order labels in the demo quizzes', () => {
  it('ocean and film-year orders carry labels', () => {
    const find = (text: string) => questionsOf(eruditeQuiz).find((q) => q.text.startsWith(text));
    const oceans = find('Розставте океани');
    expect(oceans?.type === 'order' && [oceans.topLabel, oceans.bottomLabel]).toEqual(['Найбільший', 'Найменший']);
    const films = find('Розставте фільми за роком виходу');
    expect(films?.type === 'order' && [films.topLabel, films.bottomLabel]).toEqual(['Найраніше', 'Найпізніше']);
    for (const quiz of [demoQuiz, movieQuiz, eruditeQuiz, schoolQuiz, partyQuiz()]) {
      for (const question of questionsOf(quiz)) {
        if (question.type === 'order') expect([question.text, question.topLabel, question.bottomLabel].every(Boolean)).toBe(true);
      }
    }
  });
});

describe('the seeded demo quiz', () => {
  it('is valid and shows every question type including pairs', () => {
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
    const questions = questionsOf(demoQuiz);
    expect(new Set(questions.map((q) => q.type)).has('match')).toBe(true);
    for (const question of questions) {
      if (question.type !== 'match') continue;
      for (const pair of question.pairs) expect(pair.right.id).not.toBe(pair.left.id.replace('l', 'r'));
    }
  });

  it('has the owner chain in the warm-up round', () => {
    const chain = questionsOf({ ...demoQuiz, rounds: [demoQuiz.rounds[0]] }).find((q) => q.type === 'chain');
    expect(chain?.type === 'chain' && [chain.words[0], chain.words.at(-1)]).toEqual(['Форель', 'Літак']);
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
  });

  it('has a video question in the classic and the blitz round', () => {
    const rounds = demoQuiz.rounds.filter((r) => questionsOf({ ...demoQuiz, rounds: [r] }).some((q) => q.video !== null));
    expect(rounds.map((r) => r.type).sort()).toEqual(['blitz', 'classic']);
    expect(questionsOf(demoQuiz).filter((q) => q.video !== null).length).toBeGreaterThanOrEqual(2);
    expect(questionsOf(partyQuiz()).filter((q) => q.video !== null).length).toBeGreaterThanOrEqual(1);
    expect(quizSchema.safeParse(partyQuiz()).success).toBe(true);
  });

  it('ends with a final round', () => {
    const last = demoQuiz.rounds[demoQuiz.rounds.length - 1];
    expect(last.type).toBe('final');
    expect(last.title).toBe('Фінал: Космос');
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
  });

  it('the movie quiz plays its final with a shared bank', () => {
    expect(movieQuiz.rounds.at(-1)).toMatchObject({ type: 'final', wagerMode: 'bank' });
  });

  it('the movie quiz is valid and covers every round type and the five films', () => {
    expect(quizSchema.safeParse(movieQuiz).success).toBe(true);
    expect(movieQuiz.rounds.map((r) => r.type)).toEqual(['classic', 'blitz', 'board', 'final']);
    const types = new Set(questionsOf(movieQuiz).map((q) => q.type));
    for (const type of ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain']) expect(types.has(type as never)).toBe(true);
    const board = movieQuiz.rounds.find((r) => r.type === 'board');
    expect(board?.type === 'board' && board.categories.length).toBe(5);
  });

  it('the erudite quiz is valid, has every question and round type and twelve themes', () => {
    const parsed = quizSchema.safeParse(eruditeQuiz);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(new Set(eruditeQuiz.rounds.map((r) => r.type))).toEqual(new Set(['classic', 'board', 'blitz', 'final']));
    const questions = questionsOf(eruditeQuiz);
    const types = new Set(questions.map((q) => q.type));
    for (const type of ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'sort']) expect(types.has(type as never)).toBe(true);
    expect(questions.some((q) => q.video !== null)).toBe(true);
    const categories = eruditeQuiz.rounds.flatMap((r) => (r.type === 'board' ? r.categories : []));
    expect(categories).toHaveLength(12);
  });

  it('the erudite quiz sorts animals in the warm-up and trees on the board', () => {
    expect(quizSchema.safeParse(eruditeQuiz).success).toBe(true);
    const warmup = eruditeQuiz.rounds.find((r) => r.id === 'e-warmup');
    const animals = warmup?.type === 'classic' ? warmup.questions.find((q) => q.type === 'sort') : undefined;
    expect(animals?.type === 'sort' && [animals.categories.length, animals.words.length]).toEqual([3, 9]);
    const garden = eruditeQuiz.rounds
      .flatMap((r) => (r.type === 'board' ? r.categories : []))
      .find((c) => c.title === 'Сад і город');
    const sortCell = garden?.cells.find((c) => c.question.type === 'sort');
    expect(sortCell).toMatchObject({ mark: 'x2', kind: 'normal', answerMode: 'phone' });
  });
});

describe('blitz rounds in the demo quizzes', () => {
  it('automatic blitz rounds in the demo quizzes carry no window and one attempt', () => {
    for (const quiz of [demoQuiz, movieQuiz, eruditeQuiz, partyQuiz()]) {
      expect(quizSchema.safeParse(quiz).success).toBe(true);
      for (const round of quiz.rounds) {
        if (round.type === 'blitz' && round.check === 'auto') expect([round.answerWindow, round.attempts]).toEqual([null, 1]);
      }
    }
  });
});

describe('the duel pool of the erudite quiz', () => {
  it('the erudite quiz has a duel pool', () => {
    const pool = eruditeQuiz.duels;
    expect(pool?.categories.map((c) => [c.title, c.questions.length])).toEqual([
      ['Столиці', 5],
      ['Хімічні елементи', 5],
      ['Українська література', 5],
    ]);
    expect([pool?.questionsPerDuel, pool?.timeLimit, pool?.stake]).toEqual([3, 30, 300]);
    expect(quizSchema.safeParse(eruditeQuiz).success).toBe(true);
    for (const category of pool?.categories ?? []) {
      for (const question of category.questions) expect(question.accepted.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('seeding the erudite quiz', () => {
  it('the seeded erudite quiz keeps its duel pool', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'seed-owner', name: 'Власник', email: 'owner@example.com' });
    const id = await createQuiz(db, 'seed-owner', quizSchema.parse(eruditeQuiz));
    const loaded = await getQuiz(db, 'seed-owner', id);
    expect(loaded?.duels).toEqual(eruditeQuiz.duels);
    expect(loaded?.spares).toEqual(eruditeQuiz.spares);
  });
});

describe('the erudite demo quiz buffs', () => {
  it('the erudite quiz gives every player all eight buffs', () => {
    expect(allowedBuffs(eruditeQuiz)).toEqual([...READY_BUFFS]);
    expect(allowedBuffs(eruditeQuiz)).toHaveLength(8);
    expect(quizSchema.safeParse(eruditeQuiz).success).toBe(true);
  });

  it('the erudite quiz has hints and a spare pool of every simple type', () => {
    expect(questionsOf(eruditeQuiz).filter((q) => q.hint).length).toBe(4);
    expect(eruditeQuiz.spares?.map((q) => q.type)).toEqual(['single', 'multi', 'boolean', 'text', 'numeric']);
  });
});

describe('the school quiz', () => {
  const boards = schoolQuiz.rounds.filter((r) => r.type === 'board');
  const price = (question: { type: string; points: number } & Record<string, unknown>) =>
    question.type === 'sort' ? question.points * (question.words as unknown[]).length : question.points;

  it('is valid, has two boards with the school and the fun themes, and a final', () => {
    const parsed = quizSchema.safeParse(schoolQuiz);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(schoolQuiz.rounds.map((r) => r.type)).toEqual(['board', 'board', 'final']);
    expect(boards.map((b) => (b.type === 'board' ? b.categories.map((c) => c.title) : []))).toEqual([
      ['Математика', 'Географія', 'Історія', 'Біологія', 'Зарубіжна література'],
      ['Кіно', 'Серіали', 'Поп-культура', 'Мультфільми', 'Меми', 'Культурні явища'],
    ]);
  });

  it('every category goes 100, 200, 300, 400, 500', () => {
    for (const board of boards) {
      if (board.type !== 'board') continue;
      for (const category of board.categories) expect(category.cells.map((c) => price(c.question as never))).toEqual([100, 200, 300, 400, 500]);
    }
  });

  it('gives all eight buffs, has hints, a spare of every simple type and a duel pool that persists', async () => {
    expect(schoolQuiz.settings.buffs).toHaveLength(8);
    expect(questionsOf(schoolQuiz).filter((q) => q.hint).length).toBeGreaterThanOrEqual(8);
    expect(schoolQuiz.spares?.map((q) => q.type)).toEqual(['single', 'multi', 'boolean', 'text', 'numeric']);
    expect(schoolQuiz.duels?.categories.map((c) => c.questions.length)).toEqual([5, 5, 5]);
    const db = await createTestDb();
    await db.insert(user).values({ id: 'school-owner', name: 'Власник', email: 'school@example.com' });
    const id = await createQuiz(db, 'school-owner', quizSchema.parse(schoolQuiz));
    const loaded = await getQuiz(db, 'school-owner', id);
    expect([loaded?.duels, loaded?.spares]).toEqual([schoolQuiz.duels, schoolQuiz.spares]);
  });
});

describe('the mosaic quiz', () => {
  const boards = mosaicQuiz.rounds.filter((r) => r.type === 'board');
  const price = (question: { type: string; points: number } & Record<string, unknown>) =>
    question.type === 'sort' ? question.points * (question.words as unknown[]).length : question.points;
  /** Тексти всіх запитань вікторини: раунди, запасні й дуелі. */
  const texts = (quiz: typeof mosaicQuiz) => [
    ...questionsOf(quiz).map((q) => q.text),
    ...(quiz.spares ?? []).map((q) => q.text),
    ...(quiz.duels?.categories ?? []).flatMap((c) => c.questions.map((q) => q.text)),
  ];

  it('is valid, has a warm-up with every type, three boards, a blitz and a final', () => {
    const parsed = quizSchema.safeParse(mosaicQuiz);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(mosaicQuiz.rounds.map((r) => r.type)).toEqual(['classic', 'board', 'blitz', 'board', 'board', 'final']);
    const warmup = mosaicQuiz.rounds[0];
    const types = new Set(warmup.type === 'classic' ? warmup.questions.map((q) => q.type) : []);
    for (const type of ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'sort']) expect(types.has(type as never)).toBe(true);
    const blitz = mosaicQuiz.rounds[2];
    expect(blitz.type === 'blitz' && [blitz.check, blitz.answerWindow, blitz.attempts, blitz.questions.length]).toEqual(['auto', null, 1, 10]);
    expect(boards.map((b) => (b.type === 'board' ? b.categories.map((c) => c.title) : []))).toEqual([
      ['Космос', 'Тварини', 'Кухні світу', 'Мови й слова', 'Винаходи', 'Спорт'],
      ['Музика', 'Живопис і архітектура', 'Міфи й легенди', 'Ігри (відео й настільні)', 'Українські традиції', 'Мода й бренди'],
      ['Тіло людини', 'Гроші й економіка', 'Транспорт', 'Хімія навколо нас', 'Рекорди й дивні факти'],
    ]);
    expect(questionsOf(mosaicQuiz).length).toBeGreaterThanOrEqual(100);
  });

  it('every category goes 100, 200, 300, 400, 500', () => {
    for (const board of boards) {
      if (board.type !== 'board') continue;
      for (const category of board.categories) expect(category.cells.map((c) => price(c.question as never))).toEqual([100, 200, 300, 400, 500]);
    }
  });

  it('gives all eight buffs, has hints, a spare of every simple type and a duel pool that persists', async () => {
    expect(allowedBuffs(mosaicQuiz)).toEqual([...READY_BUFFS]);
    expect(questionsOf(mosaicQuiz).filter((q) => q.hint).length).toBeGreaterThanOrEqual(10);
    expect(mosaicQuiz.spares?.map((q) => q.type)).toEqual(['single', 'multi', 'boolean', 'text', 'numeric']);
    expect(mosaicQuiz.spares?.every((q) => q.video === null)).toBe(true);
    expect(mosaicQuiz.duels?.categories.map((c) => c.questions.length)).toEqual([5, 5, 5]);
    expect([mosaicQuiz.duels?.questionsPerDuel, mosaicQuiz.duels?.timeLimit, mosaicQuiz.duels?.stake]).toEqual([3, 30, 300]);
    const db = await createTestDb();
    await db.insert(user).values({ id: 'mosaic-owner', name: 'Власник', email: 'mosaic@example.com' });
    const id = await createQuiz(db, 'mosaic-owner', quizSchema.parse(mosaicQuiz));
    const loaded = await getQuiz(db, 'mosaic-owner', id);
    expect([loaded?.duels, loaded?.spares]).toEqual([mosaicQuiz.duels, mosaicQuiz.spares]);
  });

  it('repeats no question text of the other demo quizzes', () => {
    const norm = (text: string) => text.trim().toLocaleLowerCase('uk');
    const others = new Set([demoQuiz, partyQuiz(), movieQuiz, eruditeQuiz, schoolQuiz].flatMap(texts).map(norm));
    const own = texts(mosaicQuiz).map(norm);
    expect(own.filter((text) => others.has(text))).toEqual([]);
    expect(new Set(own).size).toBe(own.length);
  });
});
