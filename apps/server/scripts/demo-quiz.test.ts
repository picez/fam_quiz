import { describe, expect, it } from 'vitest';
import { LIMITS, READY_BUFFS, SURVIVAL_TYPES, WIPEOUT_TYPES, allowedBuffs, boardSpareSource, questionSchema, questionsOf, quizSchema } from '@quiz/shared';
import { createQuiz, getQuiz } from '../src/quizzes';
import { user } from '../src/db/schema';
import { createTestDb } from '../src/testing/test-db';
import { bluff, clues, cloud, demoQuiz, pin, poll, revealing, single, slider, survey, surveyFromCloud, wall, withAudio } from './demo-quiz';
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

  it('demo has a slider and a YouTube audio-only question', () => {
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
    const questions = questionsOf(demoQuiz);
    expect(questions.some((q) => q.type === 'slider' && q.zeroBeyond !== undefined)).toBe(true);
    expect(questions.some((q) => q.audio?.source === 'youtube' && q.video === null)).toBe(true);
  });

  it('the helpers build valid questions', () => {
    const picture = { ...revealing(single('Що на картинці?', ['А', 'Б'], 0), 'blur'), imageUrl: `/uploads/${'b'.repeat(32)}.png` };
    expect(questionSchema.safeParse(picture).success).toBe(true);
    expect(questionSchema.safeParse(slider('Скільки?', { min: 0, max: 10 }, 5, { tolerance: 1, zeroBeyond: 4, unit: 'шт' })).success).toBe(true);
    const audio = withAudio(single('Назвіть гурт', ['Queen', 'ABBA'], 0), { source: 'youtube', id: 'fJ9rUzIMcZQ', start: 0, duration: 15 });
    expect(questionSchema.safeParse(audio).success).toBe(true);
  });

  it('demo has «Who am I?» in classic and on a voice cell, and a pin on the Ukraine map in classic and on a phone cell', () => {
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
    const where = (type: 'clues' | 'pin') =>
      demoQuiz.rounds.flatMap((round) => {
        if (round.type === 'classic') return round.questions.filter((question) => question.type === type).map((question) => ({ round, cell: null, question }));
        if (round.type === 'board') {
          return round.categories.flatMap((category) => category.cells.filter((c) => c.question.type === type).map((c) => ({ round, cell: c, question: c.question })));
        }
        return [];
      });
    const cluesAt = where('clues');
    expect(cluesAt.map((w) => w.round.type)).toEqual(['classic', 'board']);
    const voice = cluesAt[1];
    expect(voice.round.type === 'board' && voice.round.answerMode).toBe('voice');
    expect(voice.cell).toMatchObject({ kind: 'normal' });
    const pins = where('pin');
    expect(pins.map((w) => w.round.type)).toEqual(['classic', 'board']);
    for (const found of pins) expect(found.question.type === 'pin' && found.question.map).toBe('ukraine');
    const phone = pins[1];
    expect(phone.round.type === 'board' && phone.round.answerMode).toBe('phone');
    expect(phone.cell).toMatchObject({ kind: 'normal' });
    expect(phone.cell?.answerMode).toBeUndefined();
    expect(demoQuiz.description).toContain('Хто я?');
    expect(demoQuiz.description).toContain('точк');
  });

  it('the clues and pin helpers build valid questions', () => {
    const own = pin('Де це?', { imageUrl: `/uploads/${'a'.repeat(32)}.png`, aspect: 1.5 }, { x: 0.3, y: 0.6 });
    expect(questionSchema.safeParse({ ...own, imageUrl: `/uploads/${'a'.repeat(32)}.png` }).success).toBe(true);
    expect(own).toMatchObject({ type: 'pin', map: null, aspect: 1.5, fullRadius: 3, zeroRadius: 15 });
    const six = clues('Хто я?', ['а', 'б', 'в', 'г', 'д', 'е'], ['Х'], 8);
    expect(six.timeLimit).toBe(45);
    expect(questionSchema.safeParse(six).success).toBe(true);
    expect(clues('Хто я?', ['а', 'б', 'в'], ['Х'], 6).timeLimit).toBe(40);
  });

  it('demo has a 4×4 wall in classic, a 3×3 wall on a phone board cell, a poll and a word cloud in the warm-up', () => {
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
    const warmup = demoQuiz.rounds.find((r) => r.id === 'r-warmup');
    expect(warmup?.type === 'classic' && warmup.questions.slice(-3).map((x) => x.type)).toEqual(['poll', 'wordcloud', 'bluff']);
    const classic = demoQuiz.rounds.find((r) => r.id === 'r-x3');
    const big = classic?.type === 'classic' ? classic.questions.find((x) => x.type === 'wall') : undefined;
    expect(big?.type === 'wall' && [big.groups.length, big.groups.map((g) => g.tiles.length)]).toEqual([4, [4, 4, 4, 4]]);
    const board = demoQuiz.rounds.find((r) => r.id === 'r-board-phone');
    expect(board?.type === 'board' && board.answerMode).toBe('phone');
    const cells = board?.type === 'board' ? board.categories.flatMap((c) => c.cells) : [];
    const small = cells.find((c) => c.question.type === 'wall');
    expect(small).toMatchObject({ kind: 'normal' });
    expect(small?.question.type === 'wall' && small.question.groups.map((g) => g.tiles.length)).toEqual([3, 3, 3]);
    expect(demoQuiz.description).toContain('стін');
    expect(demoQuiz.description).toContain('опитування');
    expect(demoQuiz.description).toContain('хмар');
    expect(demoQuiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    for (const round of demoQuiz.rounds) {
      const count = questionsOf({ ...demoQuiz, rounds: [round] }).length;
      expect(count).toBeLessThanOrEqual(LIMITS.maxQuestions);
    }
  });

  it('the wall, poll and cloud helpers build valid questions', () => {
    const small = wall('Стіна', [['Фрукти', ['Яблуко', 'Груша', 'Слива']], ['Птахи', ['Сова', 'Лелека', 'Чапля']], ['Метали', ['Мідь', 'Залізо', 'Олово']]], 2, 600, 60);
    expect(questionSchema.safeParse(small).success).toBe(true);
    expect(small).toMatchObject({ type: 'wall', mistakes: 2, points: 600, timeLimit: 60 });
    const ids = small.type === 'wall' ? small.groups.flatMap((g) => g.tiles.map((t) => t.id)) : [];
    expect(new Set(ids).size).toBe(9);
    for (const tileId of ids) expect(tileId).not.toMatch(/Фрукти|Птахи|Метали/);
    const voted = poll('Що краще?', ['А', 'Б']);
    expect(voted).toMatchObject({ type: 'poll', points: 0 });
    expect(questionSchema.safeParse(voted).success).toBe(true);
    const one = cloud('Слово?', 1);
    expect(one).toMatchObject({ type: 'wordcloud', words: 1, points: 0 });
    expect(questionSchema.safeParse(one).success).toBe(true);
    expect(cloud('Слова?')).toMatchObject({ words: LIMITS.maxCloudWords });
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
    expect(schoolQuiz.settings.newcomers).toBe(true);
    expect(questionsOf(schoolQuiz).filter((q) => q.hint).length).toBeGreaterThanOrEqual(8);
    expect(schoolQuiz.spares?.map((q) => q.type)).toEqual(['single', 'multi', 'boolean', 'text', 'numeric']);
    expect(schoolQuiz.duels?.categories.map((c) => c.questions.length)).toEqual([5, 5, 5]);
    const db = await createTestDb();
    await db.insert(user).values({ id: 'school-owner', name: 'Власник', email: 'school@example.com' });
    const id = await createQuiz(db, 'school-owner', quizSchema.parse(schoolQuiz));
    const loaded = await getQuiz(db, 'school-owner', id);
    expect([loaded?.duels, loaded?.spares]).toEqual([schoolQuiz.duels, schoolQuiz.spares]);
    expect(loaded?.rounds).toEqual(quizSchema.parse(schoolQuiz).rounds);
    expect(loaded?.settings.newcomers).toBe(true);
  });

  it('every board category has two spares of simple types, each answerable', () => {
    const categories = boards.flatMap((b) => (b.type === 'board' ? b.categories : []));
    expect(categories).toHaveLength(11);
    for (const category of categories) {
      expect(category.spares?.length, category.title).toBe(2);
      for (const spare of category.spares ?? []) expect(['single', 'multi', 'boolean', 'text', 'numeric']).toContain(spare.type);
    }
    expect(boardSpareSource(schoolQuiz)).toBe('category');
  });

  it('only the school quiz turns explanations on', () => {
    for (const quiz of [demoQuiz, movieQuiz, eruditeQuiz, mosaicQuiz, partyQuiz()]) expect(quiz.settings.newcomers).toBeUndefined();
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

describe('«100 до 1» in the demo quiz', () => {
  it('demo has a host-board survey in r-x3 and a survey from the warm-up word cloud in r-rules', () => {
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
    const find = (roundId: string) => {
      const round = demoQuiz.rounds.find((r) => r.id === roundId);
      return round?.type === 'classic' ? round.questions : [];
    };
    const board = find('r-x3').at(-1);
    expect(board?.type === 'survey' && [board.cloudId, board.rows.length, board.answers]).toEqual([undefined, 6, LIMITS.defaultSurveyAnswers]);
    const fromCloud = find('r-rules').at(-1);
    const warmCloud = find('r-warmup').find((x) => x.type === 'wordcloud');
    expect(warmCloud).toBeDefined();
    expect(fromCloud?.type === 'survey' && fromCloud.cloudId).toBe(warmCloud?.id);
    expect(fromCloud?.type === 'survey' && fromCloud.rows.length).toBeGreaterThanOrEqual(LIMITS.minSurveyRows);
    const order = demoQuiz.rounds.map((r) => r.id);
    expect(order.indexOf('r-warmup')).toBeLessThan(order.indexOf('r-rules'));
    expect(demoQuiz.description).toContain('100 до 1');
    expect(demoQuiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    for (const round of demoQuiz.rounds) {
      expect(questionsOf({ ...demoQuiz, rounds: [round] }).length).toBeLessThanOrEqual(LIMITS.maxQuestions);
    }
  });

  it('the helpers build valid questions', () => {
    const own = survey('Фрукт?', [['Яблуко', 40, ['яблучко']], ['Банан', 30], ['Груша', 20], ['Слива', 10]]);
    expect(questionSchema.safeParse(own).success).toBe(true);
    expect(own).toMatchObject({ type: 'survey', answers: LIMITS.defaultSurveyAnswers, points: 1000, timeLimit: LIMITS.defaultSurveyTime });
    expect(own.type === 'survey' && own.rows.reduce((sum, r) => sum + r.popularity, 0)).toBeLessThanOrEqual(100);
    expect(own.type === 'survey' && own.rows[0].accepted).toEqual(['яблучко']);
    const word = cloud('Слово?');
    const linked = surveyFromCloud('З хмари', word, []);
    expect(linked).toMatchObject({ type: 'survey', rows: [], cloudId: word.id, answers: 2 });
    const quiz = { ...demoQuiz, rounds: [{ id: 'a', type: 'classic' as const, title: 'A', speedBonus: false, shuffleOptions: false, rules: demoQuiz.rounds[0].type === 'classic' ? demoQuiz.rounds[0].rules : (undefined as never), questions: [word, linked] }] };
    expect(quizSchema.safeParse(quiz).success).toBe(true);
  });
});

describe('the bluff in the demo quiz', () => {
  it('demo has a bluff at the end of r-warmup', () => {
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
    const warmup = demoQuiz.rounds.find((r) => r.id === 'r-warmup');
    const last = warmup?.type === 'classic' ? warmup.questions.at(-1) : undefined;
    expect(last?.type).toBe('bluff');
    expect(last?.type === 'bluff' && [last.accepted[0], last.lies.length]).toEqual(['Барселона', 3]);
    expect(demoQuiz.description).toContain('блеф');
    expect(demoQuiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    for (const round of demoQuiz.rounds) {
      expect(questionsOf({ ...demoQuiz, rounds: [round] }).length).toBeLessThanOrEqual(LIMITS.maxQuestions);
    }
  });

  it('the bluff helper builds a valid question', () => {
    const ok = bluff('Факт з …', ['Правда'], ['А', 'Б']);
    expect(questionSchema.safeParse(ok).success).toBe(true);
    expect(ok).toMatchObject({ type: 'bluff', points: 1000, timeLimit: LIMITS.defaultBluffTime, choiceTime: LIMITS.defaultChoiceTime });
    expect(questionSchema.safeParse(bluff('Факт з …', ['Правда'], ['А'])).success).toBe(false);
  });
});

describe('the wipeout round in the demo quiz (10g)', () => {
  it('is valid, has five questions with rising prices and only wipeout types', () => {
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
    const round = demoQuiz.rounds.find((r) => r.type === 'wipeout');
    if (round === undefined || round.type !== 'wipeout') throw new Error('no wipeout round');
    expect(round.questions).toHaveLength(5);
    expect(round.questions.map((question) => question.points)).toEqual([100, 200, 300, 400, 500]);
    expect(round.questions.map((question) => question.type).sort()).toEqual([...WIPEOUT_TYPES].sort());
    expect(demoQuiz.rounds.at(-1)?.type).toBe('final');
    expect(demoQuiz.rounds.at(-3)).toBe(round);
    expect(demoQuiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
  });
});

describe('the survival round in the demo quiz (10h)', () => {
  it('is valid, has five questions and two survival questions of simple types', () => {
    expect(quizSchema.safeParse(demoQuiz).success).toBe(true);
    const round = demoQuiz.rounds.find((r) => r.type === 'survival');
    if (round === undefined || round.type !== 'survival') throw new Error('no survival round');
    expect(round.questions).toHaveLength(5);
    expect(round.trials).toHaveLength(2);
    for (const question of [...round.questions, ...round.trials]) expect(SURVIVAL_TYPES).toContain(question.type);
    expect(demoQuiz.rounds.at(-2)).toBe(round);
    expect(demoQuiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
  });
});
