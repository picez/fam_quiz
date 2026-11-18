import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from './db/client';
import { achievementsPage, careerFacts } from './achievement-store';
import { forgetPlayedShapes, playerGames, playerHistory } from './history';
import { ownProfile, publicProfile } from './profiles';
import { finishLateGame, seedCareer, type CareerFixture } from './testing/career-fixture';
import { createTestDb } from './testing/test-db';
import { versusOf } from './versus';

const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Читання всього знімка вікторини чи всього журналу гри: будь-яка поява стовпця, крім дозволених проєкцій, що віддають крихту значення, —
 * `->`/`#>` над ним і перший аргумент названих функцій (`jsonb_path_query_array("quiz_snapshot", '$.rounds[*].type')` у gameTables,
 * jsonb_typeof, jsonb_array_length). Будь-яка інша обгортка (`coalesce("quiz_snapshot", …)`, `to_jsonb("plays")`) — повне читання.
 */
const wholeColumn = (column: string) =>
  new RegExp(String.raw`(?<!\b(?:jsonb_path_query_array|jsonb_typeof|jsonb_array_length)\(\s*(?:"\w+"\.)?)"${column}"(?!\s*(?:->|#>))`, 'i');
const FULL_SNAPSHOT = wholeColumn('quiz_snapshot');
const FULL_PLAYS = wholeColumn('plays');

/**
 * Знімок без випадкових id: кожен UUID (і всередині рядків) стає «<id N>» у порядку першої появи; Date — ISO, Set і Map — масиви.
 * Ключі об'єктів обходяться за абеткою: інший порядок ключів у відповіді не перенумеровує id.
 */
function stable(value: unknown): unknown {
  const ids = new Map<string, string>();
  const idOf = (id: string) => {
    const key = id.toLowerCase();
    if (!ids.has(key)) ids.set(key, `<id ${ids.size + 1}>`);
    return ids.get(key)!;
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(UUIDS, idOf);
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(walk);
    if (v instanceof Set) return [...v].map(walk);
    if (v instanceof Map) return [...v.entries()].map(walk);
    if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [walk(k), walk(x)]));
    return v;
  };
  return walk(value);
}

/** Усе, що бачить людина в профілі, на сторінках ачівок, в історії й «Один на один», одним об'єктом (запити — по черзі). */
async function readAll(db: Db, { userId, friendId }: CareerFixture) {
  return {
    history: await playerHistory(db, userId),
    games: await playerGames(db, userId, null),
    own: await ownProfile(db, { id: userId, name: 'Оля', email: 'olya@example.com' }),
    public: await publicProfile(db, userId, friendId),
    achievementsOwn: await achievementsPage(db, userId, true),
    achievementsPublic: await achievementsPage(db, userId, false),
    versus: await versusOf(db, userId, friendId),
    facts: await careerFacts(db, userId),
  };
}

describe('profile speed (46): the safety net', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
    // Кожен тест починає з холодного кешу форм ігор: перше читання йде через завантажувач, наступні — з кешу.
    forgetPlayedShapes();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('the career numbers stay the same on the first and the next profile reads', { timeout: 120_000 }, async () => {
    const db = await createTestDb();
    const career = await seedCareer(db);
    expect(career.gameIds).toHaveLength(26);

    const first = await readAll(db, career);
    const second = await readAll(db, career);

    // Точність особливих ігор, перевірена руками: що віднімається від зіграних запитань, а що ні.
    const byTitle = (title: string) => first.history.find((g) => g.title === title);
    expect(byTitle('Опитування в списку')).toMatchObject({ questionsPlayed: 2, correct: 1, answered: 2 });
    expect(byTitle('Опитування на полі')).toMatchObject({ questionsPlayed: 4, correct: 1, answered: 2 });
    expect(byTitle('Думай інакше')).toMatchObject({ questionsPlayed: 1, correct: 1, answered: 1 });
    expect(byTitle('Правда про гравця')).toMatchObject({ questionsPlayed: 3, correct: 2, answered: 3 });
    expect(byTitle('Ва-банк')).toMatchObject({ questionsPlayed: 2, correct: 2, answered: 2 });
    expect(byTitle('Зіпсований ва-банк')).toMatchObject({ questionsPlayed: 2, correct: 1, answered: 1 });
    expect(byTitle('Вибування')).toMatchObject({ questionsPlayed: 2, correct: 1, answered: 2 });
    expect(byTitle('Мільйонер')).toMatchObject({ questionsPlayed: 2, correct: 2, answered: 2 });
    expect(byTitle('Стара гра')).toMatchObject({ questionsPlayed: 2, correct: 1, answered: 2 });
    expect(byTitle('Командна гра')).toMatchObject({ questionsPlayed: 3, correct: 2, answered: 3, team: 'Сови', rank: 1 });
    expect(byTitle('Ще триває')).toBeUndefined();
    expect(byTitle('Оля веде')).toBeUndefined();

    // Наступного дня Оля дограє ще одну гру: наступне читання наздоганяє її (missedGames) — ачівки з її датою й id.
    vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
    const lateGameId = await finishLateGame(db, career, new Date('2026-11-19T10:00:00Z'));
    const third = await readAll(db, career);
    expect(third.history[0]).toMatchObject({ gameId: lateGameId, title: 'Пізня гра', questionsPlayed: 6, correct: 6 });
    expect(third.achievementsOwn?.items.find((a) => a.id === 'perfect_game')).toMatchObject({ earned: true, earnedAt: '2026-11-19T10:00:00.000Z' });
    expect(third.achievementsOwn?.items.some((a) => a.earnedAt !== null)).toBe(true);

    expect(stable({ first, second, third })).toMatchSnapshot();
  });

  // Запити першого й другого проходів: збирає звичайний тест (щоб збій засіву чи читання не сховався), перевіряє наступний.
  type Spied = { query: string; params: unknown[] }[];
  let spied: { first: Spied; queries: Spied; byRead: Record<string, Spied>; career: CareerFixture } | null = null;

  it('the SQL spy records the first- and second-pass profile reads', { timeout: 120_000 }, async () => {
    let recording: Spied | null = null;
    const first: Spied = [];
    const queries: Spied = [];
    // Запити наступного проходу ще й окремо за кожним читанням.
    const byRead: Record<string, Spied> = {};
    let current: Spied | null = null;
    const db = await createTestDb({
      onQuery: (query, params) => {
        recording?.push({ query, params });
        current?.push({ query, params });
      },
    });
    const career = await seedCareer(db);
    const { userId, friendId } = career;
    const reads = async (split: boolean) => {
      const as = async (name: string, read: () => Promise<unknown>) => {
        current = split ? (byRead[name] = []) : null;
        await read();
        current = null;
      };
      await as('own', () => ownProfile(db, { id: userId, name: 'Оля', email: 'olya@example.com' }));
      await as('public', () => publicProfile(db, userId, friendId));
      await as('achievementsOwn', () => achievementsPage(db, userId, true));
      await as('achievementsPublic', () => achievementsPage(db, userId, false));
      await as('history', () => playerHistory(db, userId));
      await as('versus', () => versusOf(db, userId, friendId));
    };
    // Перший прохід доповнює історію, синхронізує ачівки й наповнює кеш форм ігор; наступний — теплий.
    recording = first;
    await reads(false);
    recording = queries;
    await reads(true);
    recording = null;

    expect(queries.length).toBeGreaterThan(0);
    // Сам запит ігор гравця (playerGames) мусить бути серед записаних, інакше перевірка нижче нічого не бачить.
    expect(queries.some(({ query }) => /from "participant" inner join "game"/i.test(query))).toBe(true);
    spied = { first, queries, byRead, career };
  });

  // Теплий прохід не читає повних знімків і журналів зовсім — крім запасного читання знімка старого формату в gameTables (типи раундів
  // не дістати з SQL; лише id ігор старого формату). Перший прохід читає їх у завантажувачі кешу форм ігор (кожну гру — щонайбільше раз, лише за id)
  // і в доповненні історії першої синхронізації ачівок.
  it('the profile never reads whole quiz snapshots or game logs once the game shapes are cached', () => {
    if (spied === null) throw new Error('the spy test did not run');
    const { first, queries, career } = spied;
    const idsOf = (params: unknown[]) => params.filter((p): p is string => typeof p === 'string' && UUID.test(p));
    const old = new Set(career.oldFormatGameIds);
    // Без жодного id повне читання читало б усі ігри.
    const whole = queries.filter(
      ({ query, params }) => (FULL_SNAPSHOT.test(query) || FULL_PLAYS.test(query)) && (idsOf(params).length === 0 || idsOf(params).some((id) => !old.has(id))),
    );
    expect(whole.map(({ query }) => query)).toEqual([]);

    const loader = /^select "id", "quiz_snapshot", "plays", "questions_played" from "game"/i;
    const loaded = first.filter(({ query }) => loader.test(query)).flatMap(({ params }) => idsOf(params));
    expect(loaded.length).toBeGreaterThan(0);
    expect(new Set(loaded).size).toBe(loaded.length);
  });

  it("one profile request reads the player's games once", () => {
    if (spied === null) throw new Error('the spy test did not run');
    const gamesRead = (spiedRead: Spied | undefined) =>
      (spiedRead ?? []).filter(({ query }) => /from "participant" inner join "game"/i.test(query) && /order by "game"."started_at" desc/i.test(query)).length;
    expect({
      own: gamesRead(spied.byRead.own),
      public: gamesRead(spied.byRead.public),
      achievementsOwn: gamesRead(spied.byRead.achievementsOwn),
    }).toEqual({ own: 1, public: 1, achievementsOwn: 1 });
  });

  it('the first read levels up from the achievements it just wrote', { timeout: 120_000 }, async () => {
    const db = await createTestDb();
    const career = await seedCareer(db);
    const current = { id: career.userId, name: 'Оля', email: 'olya@example.com' };
    // Свіжа кар'єра: achievements_synced_at ще null — перше читання доповнює історію ачівок.
    const first = await ownProfile(db, current);
    const second = await ownProfile(db, current);
    expect(first.achievements.some((a) => a.earned)).toBe(true);
    expect(first.level.progress).toEqual(second.level.progress);
  });
});
