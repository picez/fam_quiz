import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BOT_USER_ID, QUESTION_TYPES, type Question, type Quiz } from '@quiz/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/client';
import { game, libraryEntry, quiz as quizTable, user } from '../src/db/schema';
import { createTestDb } from '../src/testing/test-db';
import {
  DEFAULT_DIR,
  SEED_NAMES,
  answerKeys,
  contentTokens,
  dbRecords,
  findRepeats,
  formatFindings,
  mediaKey,
  normText,
  readExport,
  recordsOf,
  seedRecords,
  writeExport,
  type Finding,
  type QRecord,
} from './question-db';

// Тексти тут вигадані й навмисне дивні: тести сідів шукають свої запитання в усіх .ts теки scripts.
const base = { imageUrl: null, video: null, timeLimit: 30, points: 10 };
const single = (id: string, text: string, correct: string, imageUrl: string | null = null): Question =>
  ({ ...base, id, text, imageUrl, type: 'single', options: [{ id: `${id}a`, text: correct }, { id: `${id}b`, text: 'Хибний варіант' }], correctId: `${id}a` }) as Question;
const textQ = (id: string, text: string, accepted: string[]): Question => ({ ...base, id, text, type: 'text', accepted }) as Question;

const classic = (id: string, title: string, questions: Question[]) => ({
  id,
  type: 'classic' as const,
  title,
  speedBonus: false,
  shuffleOptions: false,
  rules: { penalty: 'none' as const, partial: null, streak: null, multiplier: 1 as const },
  questions,
});

describe('normText and content words', () => {
  it('folds case, every apostrophe and punctuation', () => {
    const variants = ['Пам’ять «Зорянки»!', "пам'ять зорянки", 'ПАМʼЯТЬ — зорянки?', 'пам‘ять, зорянки', 'пам`ять зорянки'];
    expect(new Set(variants.map(normText))).toEqual(new Set(["пам'ять зорянки"]));
  });

  it('drops stop words and question stems, keeps rare words, numbers and short Latin symbols', () => {
    expect(contentTokens('Скільки хвостів у вигаданого дракона Зоряна?')).toEqual(['хвост', 'вигадан', 'дракон', 'зорян']);
    expect(contentTokens('Хто це?')).toEqual([]);
    expect(contentTokens('Яке слово тут зайве?')).toEqual(['зайв']);
    expect(contentTokens('Який елемент позначають символом Xq у 1999 році?')).toContain('xq');
    expect(contentTokens('Який елемент позначають символом Xq у 1999 році?')).toContain('1999');
  });

  it('stems inflected forms together', () => {
    expect(contentTokens('столиця Зорянії')).toEqual(contentTokens('столиці Зорянія'));
  });

  it('keeps answer keys but not yes/no', () => {
    expect(answerKeys(['Так', 'Ні', '«Зорян»', ' зорян '])).toEqual(['зорян']);
  });

  it('turns media into comparable keys', () => {
    expect(mediaKey('/uploads/abcdef0123456789.jpg')).toBe('upload:abcdef0123456789.jpg');
  });
});

describe('export from the database', () => {
  let db: Db;
  const queries: string[] = [];
  const ownerQuiz = randomUUID();
  const botQuiz = randomUUID();
  const deletedGame = randomUUID();

  beforeAll(async () => {
    db = await createTestDb({ onQuery: (query) => queries.push(query) });
    await db.insert(user).values([
      { id: 'family', name: 'Родина', email: 'family@example.com' },
      { id: BOT_USER_ID, name: 'Бот', email: 'bot@example.com' },
    ]);
    const owned: Quiz = {
      title: 'Сімейна тестова',
      description: '',
      settings: { leaderboard: 'each' },
      rounds: [
        classic('r1', 'Перший', [single('q1', 'Якого кольору вигаданий дракон Зорян?', 'Бузковий'), textQ('q2', 'Як звали кота-астронавта з казки?', ['Мурчик'])]),
        {
          id: 'r2',
          type: 'board',
          title: 'Поле',
          categories: [
            {
              id: 'c1',
              title: 'Казки',
              cells: [{ price: 100, kind: 'normal', question: textQ('q3', 'Що ховав чарівний гарбуз Тимко?', ['Ключ']) }],
              spares: [textQ('q4', 'Скільки дзвіночків у шапці блазня Гриця?', ['Сім'])],
            },
          ],
        },
        {
          ...classic('r3', 'Виживання', [textQ('q5', 'Яку пісню співав місяць над ставом?', ['Колискову'])]),
          type: 'survival',
          trials: [textQ('q6', 'Котра зірка спала на хмарі?', ['Північна'])],
          trial: 'question',
          survivors: 1,
          bonus: 0,
        },
      ] as Quiz['rounds'],
    };
    await db.insert(quizTable).values([
      {
        id: ownerQuiz,
        ownerId: 'family',
        title: owned.title,
        description: '',
        settings: {
          ...owned.settings,
          spares: [textQ('q7', 'Хто пофарбував паркан у смужку?', ['Їжак'])],
          duels: { categories: [{ id: 'd1', title: 'Дуель', questions: [{ id: 'dq1', text: 'Столиця Зорянії?', accepted: ['Зоряград'] }] }], questionsPerDuel: 1, timeLimit: 30, stake: 0 },
        },
        rounds: owned.rounds,
      },
      { id: botQuiz, ownerId: BOT_USER_ID, title: 'Бот тестовий', description: '', settings: { leaderboard: 'each' }, rounds: [classic('b1', 'Бот', [textQ('bq', 'Чим снідав робот Гвинтик?', ['Олією'])])] },
    ]);
    // Знімок бібліотеки: те саме плюс запитання, яке автор потім прибрав.
    await db.insert(libraryEntry).values({
      quizId: ownerQuiz,
      ownerId: 'family',
      title: owned.title,
      description: '',
      language: 'uk',
      snapshot: { ...owned, rounds: [classic('r1', 'Перший', [single('q1', 'Якого кольору вигаданий дракон Зорян?', 'Бузковий'), textQ('q9', 'Що загубив равлик на ярмарку?', ['Мушлю'])])] },
      questionCount: 2,
      roundTypes: ['classic'],
      listed: true,
      openedAt: new Date(),
      updatedAt: new Date(),
    });
    // Гра з видаленої вікторини, старого формату (список запитань без раундів).
    await db.insert(game).values({
      id: deletedGame,
      quizId: null,
      hostId: 'family',
      code: '1',
      status: 'finished',
      title: 'Видалена',
      quizSnapshot: { title: 'Видалена', description: '', settings: { leaderboard: 'each', speedBonus: false, shuffleOptions: false }, questions: [textQ('g1', 'Де ночувала сова Соломія?', ['У дуплі'])] },
      startedAt: new Date(),
    });
    queries.length = 0;
  });

  it('reads every quiz of every owner, with board cells, spares, survival trials and duels', async () => {
    const records = await dbRecords(db);
    const own = records.filter((r) => r.source === `db:${ownerQuiz}` && r.from === 'quiz');
    expect(own.map((r) => r.text)).toEqual([
      'Якого кольору вигаданий дракон Зорян?',
      'Як звали кота-астронавта з казки?',
      'Що ховав чарівний гарбуз Тимко?',
      'Скільки дзвіночків у шапці блазня Гриця?',
      'Яку пісню співав місяць над ставом?',
      'Котра зірка спала на хмарі?',
      'Хто пофарбував паркан у смужку?',
      'Столиця Зорянії?',
    ]);
    expect(own[0]).toMatchObject({ type: 'single', answers: ['Бузковий'], options: ['Бузковий', 'Хибний варіант'], keys: ['бузковий'], quizTitle: 'Сімейна тестова', roundTitle: 'Перший', ownerId: 'family' });
    expect(own[2].roundTitle).toBe('Поле / Казки');
    expect(own[3].roundTitle).toBe('Поле / Казки (запасне)');
    expect(own[5].roundTitle).toBe('Виживання (виживання)');
    expect(own[7]).toMatchObject({ type: 'duel', answers: ['Зоряград'] });
    expect(records.filter((r) => r.source === `db:${botQuiz}`).map((r) => r.ownerId)).toEqual([BOT_USER_ID]);
  });

  it('adds from snapshots only what the live quiz no longer has, and old-format games', async () => {
    const records = await dbRecords(db);
    expect(records.filter((r) => r.from === 'library').map((r) => r.text)).toEqual(['Що загубив равлик на ярмарку?']);
    expect(records.filter((r) => r.from === 'game')).toMatchObject([{ source: `db:game:${deletedGame}`, text: 'Де ночувала сова Соломія?', quizTitle: 'Видалена' }]);
  });

  it('only reads, in a READ ONLY transaction', async () => {
    queries.length = 0;
    await dbRecords(db);
    expect(queries[0]).toBe('set transaction read only');
    expect(queries.length).toBeGreaterThan(1);
    expect(queries.slice(1).filter((q) => !/^\s*select\b/i.test(q))).toEqual([]);
  });

  it('writes the JSONL file and a summary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'question-db-'));
    const records = await dbRecords(db);
    const { file, summary } = writeExport(records, dir);
    expect(readExport(file)).toEqual(records);
    expect(summary).toContain(`Records: ${records.length}`);
    expect(readFileSync(join(dir, 'summary.txt'), 'utf8')).toContain('By type:');
  });
});

describe('the export folder', () => {
  it('is .superpowers/question-db, which git ignores', () => {
    expect(DEFAULT_DIR.replace(/\\/g, '/')).toMatch(/\/\.superpowers\/question-db$/);
    const ignore = readFileSync(join(import.meta.dirname, '../../../.gitignore'), 'utf8').split(/\r?\n/);
    expect(ignore).toContain('.superpowers/');
  });
});

describe('seeds', () => {
  it('builds every seed of seed-demo in memory (party-media is party with pictures)', () => {
    const source = readFileSync(join(import.meta.dirname, 'seed-demo.ts'), 'utf8');
    const listed = /const SEEDS = \[([^\]]*)\]/.exec(source)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    expect([...SEED_NAMES].sort()).toEqual(listed.filter((name) => name !== 'party-media').sort());
  });

  it('finds every question type the seeds use, duels and spares included', () => {
    const records = seedRecords();
    const types = new Set(records.map((r) => r.type));
    expect(QUESTION_TYPES.filter((type) => type !== 'poll' && type !== 'wordcloud' && !types.has(type))).toEqual([]);
    expect(types.has('duel')).toBe(true);
    expect(records.some((r) => r.roundTitle === '(запасні)')).toBe(true);
    expect(records.every((r) => r.source.startsWith('seed:') && r.from === 'seed')).toBe(true);
    // Медіа сідів — джерело, а не адреса-заглушка.
    expect(records.flatMap((r) => r.media).filter((m) => !/^(yt|wiki|file|upload):/.test(m))).toEqual([]);
  });
});

// ---------------------------------------------------------------- рівні схожості

let n = 0;
function rec(source: string, text: string, fields: Partial<QRecord> = {}): QRecord {
  n += 1;
  const answers = fields.answers ?? [];
  return {
    id: `${source}#x${n}#0`,
    source,
    from: source.startsWith('seed:') ? 'seed' : 'quiz',
    quizId: source.startsWith('db:') ? source.slice(3) : null,
    ownerId: null,
    quizTitle: fields.quizTitle ?? source,
    roundTitle: 'Раунд',
    type: 'text',
    text,
    answers,
    options: [],
    items: [],
    media: [],
    norm: normText(text),
    keys: answerKeys(answers),
    ...fields,
  };
}
const levels = (findings: Finding[]) => findings.map((f) => [f.level, f.a.text || f.a.answers[0], f.b.text || f.b.answers[0]]);

describe('findRepeats', () => {
  it('exact: the same normalised text', () => {
    const pool = [rec('seed:demo', 'Якого кольору вигаданий дракон Зорян?', { answers: ['Бузковий'] }), rec('db:q1', 'якого кольору вигаданий дракон «Зорян»', { answers: ['Синій'] })];
    expect(levels(findRepeats(['demo'], pool))).toEqual([['exact', 'Якого кольору вигаданий дракон Зорян?', 'якого кольору вигаданий дракон «Зорян»']]);
  });

  it('near: a rephrase with the same content words', () => {
    const pool = [
      rec('seed:demo', 'Яка ріка вигаданої країни Зорянії найдовша?', { answers: ['Срібнянка'] }),
      rec('db:q1', 'Найдовша ріка вигаданої країни Зорянія — яка?', { answers: ['Срібнянка'] }),
      rec('db:q2', 'Яка гора вигаданої країни Зорянії найвища?', { answers: ['Білоглав'] }),
    ];
    const findings = findRepeats(['demo'], pool);
    expect(levels(findings)).toEqual([['near', 'Яка ріка вигаданої країни Зорянії найдовша?', 'Найдовша ріка вигаданої країни Зорянія — яка?']]);
    expect(findings[0].score).toBeCloseTo(1);
  });

  it('no noise from generic stems: short texts repeat only with the same answer', () => {
    const pool = [
      rec('seed:demo', 'Хто це?', { answers: ['Зорян'], media: ['upload:a.jpg'] }),
      rec('db:q1', 'Хто це?', { answers: ['Тимко'], media: ['upload:b.jpg'] }),
      rec('seed:demo', 'Скільки ніг у зорянського жука?', { answers: ['6'] }),
      rec('db:q2', 'Скільки ніг у зорянського павука?', { answers: ['8'] }),
      rec('seed:demo', 'Яке слово тут зайве?', { answers: ['кит'] }),
      rec('db:q3', 'Яке слово тут зайве?', { answers: ['сом'] }),
    ];
    expect(findRepeats(['demo'], pool)).toEqual([]);
    const same = [rec('seed:demo', 'Хто це?', { answers: ['Зорян'] }), rec('db:q1', 'Хто це?', { answers: ['Зорян'] })];
    expect(levels(findRepeats(['demo'], same))).toEqual([['exact', 'Хто це?', 'Хто це?']]);
  });

  it('near on items: the same wall, list or order with a different instruction', () => {
    const items = ['Зоряград', 'Срібнянка', 'Білоглав', 'Тимківка'];
    const pool = [
      rec('seed:demo', 'Розставте з півночі на південь', { type: 'order', items, answers: [items.join(' > ')] }),
      rec('db:q1', 'Розставте за населенням', { type: 'order', items: [...items].reverse(), answers: [[...items].reverse().join(' > ')] }),
    ];
    expect(findRepeats(['demo'], pool).map((f) => [f.level, f.detail.startsWith('items')])).toEqual([['near', true]]);
  });

  it('same fact: the same answer and two rare shared words, as a warning', () => {
    const filler = Array.from({ length: 40 }, (_, i) => rec('db:filler', `Звичайне питання про ярмарок номер ${i} у місті`, { answers: [`відповідь ${i}`] }));
    const pool = [
      rec('seed:demo', 'Який чарівник подарував Зорянії золотий компас?', { answers: ['Тимофій'] }),
      rec('db:q1', 'Кому з героїв казки дістався від чарівника компас, коли той вирушав у мандри до моря?', { answers: ['Тимофій'] }),
      ...filler,
    ];
    expect(levels(findRepeats(['demo'], pool))).toEqual([['fact', 'Який чарівник подарував Зорянії золотий компас?', 'Кому з героїв казки дістався від чарівника компас, коли той вирушав у мандри до моря?']]);
  });

  it('same media: the same YouTube video or picture', () => {
    const pool = [
      rec('seed:demo', 'Хто співає цю пісню про Зорянію?', { answers: ['Тимко'], media: ['yt:AAAAAAAAAAA'] }),
      rec('db:q1', 'У якому році вийшла ця пісня?', { answers: ['1999'], media: ['yt:AAAAAAAAAAA'] }),
      rec('seed:demo', 'Що за місто на цій картинці?', { answers: ['Зоряград'], media: ['wiki:file:zoriagrad.jpg'] }),
      rec('seed:big1', 'Картинка проявляється: що це за будівля?', { answers: ['Ратуша'], media: ['wiki:file:zoriagrad.jpg'] }),
    ];
    expect(findRepeats(['demo'], pool).map((f) => [f.level, f.detail]).sort()).toEqual([
      ['media', 'wiki:file:zoriagrad.jpg'],
      ['media', 'yt:AAAAAAAAAAA'],
    ]);
  });

  it('compares the seed with itself and with other seeds, each pair once', () => {
    const pool = [
      rec('seed:demo', 'Якого кольору вигаданий дракон Зорян?'),
      rec('seed:demo', 'Якого кольору вигаданий дракон Зорян?'),
      rec('seed:big1', 'Якого кольору вигаданий дракон Зорян?'),
    ];
    expect(findRepeats(['demo', 'big1'], pool)).toHaveLength(3);
  });

  it("skips the seed's own records: its copy on the site (same title) and the quizzes named in excludeQuizIds", () => {
    const pool = [
      rec('seed:demo', 'Якого кольору вигаданий дракон Зорян?', { quizTitle: 'Демо Зорянії' }),
      rec('seed:demo', 'Хто пофарбував паркан у смужку на вигаданому хуторі?', { quizTitle: 'Демо Зорянії' }),
      rec('db:copy', 'Якого кольору вигаданий дракон Зорян?', { quizTitle: 'Демо Зорянії' }),
      rec('db:copy', 'Хто пофарбував паркан у смужку на вигаданому хуторі?', { quizTitle: 'Демо зорянії' }),
      rec('db:renamed', 'Якого кольору вигаданий дракон Зорян?', { quizTitle: 'Демо (стара назва)' }),
    ];
    expect(findRepeats(['demo'], pool).map((f) => f.b.source)).toEqual(['db:renamed']);
    expect(findRepeats(['demo'], pool, { excludeQuizIds: ['renamed'] })).toEqual([]);
    // Інший сід бачить копію на сайті через запис сіда demo, а не двічі.
    const other = rec('seed:big1', 'Якого кольору вигаданий дракон Зорян?');
    expect(findRepeats(['big1'], [...pool, other]).map((f) => f.b.source).sort()).toEqual(['db:renamed', 'seed:demo']);
  });

  it('reports the worst level of a pair, and thresholds are configurable', () => {
    const pool = [
      rec('seed:demo', 'Яка ріка вигаданої країни Зорянії найдовша?', { answers: ['Срібнянка'], media: ['yt:BBBBBBBBBBB'] }),
      rec('db:q1', 'Найдовша ріка вигаданої країни Зорянія — яка?', { answers: ['Срібнянка'], media: ['yt:BBBBBBBBBBB'] }),
    ];
    const [finding] = findRepeats(['demo'], pool);
    expect(finding.level).toBe('near');
    expect(finding.detail).toContain('media');
    expect(findRepeats(['demo'], pool, { thresholds: { near: 1.01 } }).map((f) => f.level)).toEqual(['media']);
    expect(formatFindings(findRepeats(['demo'], pool))).toContain('Repeats — exact: 0, near: 1, media: 0, fact: 0');
  });

  it('records of a real quiz keep their own text and answers', () => {
    const quiz: Quiz = { title: 'T', description: '', settings: { leaderboard: 'each' }, rounds: [classic('r', '', [textQ('t', 'Що загубив равлик?', ['Мушлю'])])] as Quiz['rounds'] };
    expect(recordsOf(quiz, { source: 'seed:demo', from: 'seed', quizId: null, ownerId: null, quizTitle: 'T' })).toMatchObject([{ roundTitle: 'Раунд 1', text: 'Що загубив равлик?', answers: ['Мушлю'], keys: ['мушлю'] }]);
  });
});
