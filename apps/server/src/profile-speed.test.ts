import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from './db/client';
import { achievementsPage, careerFacts } from './achievement-store';
import { playerGames, playerHistory } from './history';
import { ownProfile, publicProfile } from './profiles';
import { seedCareer, type CareerFixture } from './testing/career-fixture';
import { createTestDb } from './testing/test-db';
import { versusOf } from './versus';

const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Читання всього знімка вікторини чи всього журналу гри: стовпець у списку select (за ним кома чи from), а не вираз над ним.
 * Перший аргумент функції SQL (`jsonb_path_query_array("quiz_snapshot", …)` у gameTables) — теж вираз: база віддає лише його результат.
 */
const FULL_SNAPSHOT = /(?<!\(\s*(?:"\w+"\.)?)"quiz_snapshot"(\s*,|\s+from\s)/i;
const FULL_PLAYS = /(?<!\(\s*(?:"\w+"\.)?)"plays"(\s*,|\s+from\s)/i;

/** Знімок без випадкових id: кожен UUID (і всередині рядків) стає «<id N>» у порядку першої появи; Date — ISO, Set і Map — масиви. */
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
    if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [walk(k), walk(x)]));
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

    expect(stable({ first, second })).toMatchSnapshot();
  });

  // Задача 2 плану 46 знімає .fails: тоді профіль читає повні знімки й журнали лише ігор з «Ва-банк», «Вибуванням» і «Мільйонером» (і старого формату).
  it.fails('the profile never reads whole quiz snapshots or game logs except for wipeout, survival and ladder games', { timeout: 120_000 }, async () => {
    let recording = false;
    const queries: { query: string; params: unknown[] }[] = [];
    const db = await createTestDb({
      onQuery: (query, params) => {
        if (recording) queries.push({ query, params });
      },
    });
    const career = await seedCareer(db);
    const { userId, friendId } = career;
    const reads = async () => {
      await ownProfile(db, { id: userId, name: 'Оля', email: 'olya@example.com' });
      await publicProfile(db, userId, friendId);
      await achievementsPage(db, userId, true);
      await achievementsPage(db, userId, false);
      await playerHistory(db, userId);
      await versusOf(db, userId, friendId);
    };
    // Перший прохід доповнює історію й синхронізує ачівки; міряємо наступний.
    await reads();
    recording = true;
    await reads();
    recording = false;

    const allowed = new Set([...career.gatedGameIds, ...career.oldFormatGameIds]);
    const whole = queries.filter(({ query }) => FULL_SNAPSHOT.test(query) || FULL_PLAYS.test(query));
    // Повне читання мусить бути обмежене id дозволених ігор: без жодного id воно читало б усі ігри.
    const offending = whole.filter(({ params }) => {
      const ids = params.filter((p): p is string => typeof p === 'string' && UUID.test(p));
      return ids.length === 0 || ids.some((id) => !allowed.has(id));
    });
    expect(queries.length).toBeGreaterThan(0);
    expect(offending.map(({ query }) => query)).toEqual([]);
  });
});
