import { defaultTeams } from '@quiz/shared';
import type { GameView, PlayerView } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classicRound, makeQuiz, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import type { Db } from './db/client';
import { game, user, xpEntry } from './db/schema';
import { ensureProfile } from './profiles';
import { attachRecorder } from './recorder';
import { FINISHED_TTL_MS, RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';
import { startTeamGame, toEnd, toQuestion } from './testing/team-game';
import * as xp from './xp-store';

vi.mock('./xp-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('./xp-store')>();
  return { ...original, gameXpMoments: vi.fn(original.gameXpMoments) };
});

afterEach(async () => {
  vi.mocked(xp.gameXpMoments).mockReset();
  vi.mocked(xp.gameXpMoments).mockImplementation((await vi.importActual<typeof import('./xp-store')>('./xp-store')).gameXpMoments);
});

const HOST = 'host-user';
const ANNA = 'anna-user';
const BOHDAN = 'bohdan-user';
const VIRA = 'vira-user';
const IHOR = 'ihor-user';
const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const FIVE = [1, 2, 3, 4, 5].map((n) => withId(single, `q${n}`));

async function base() {
  const db = await createTestDb();
  const people: [string, string][] = [
    [HOST, 'Ведуча'],
    [ANNA, 'Анна'],
    [BOHDAN, 'Богдан'],
    [VIRA, 'Віра'],
    [IHOR, 'Ігор'],
  ];
  for (const [id, name] of people) {
    await db.insert(user).values({ id, name, email: `${id}@example.com` });
    await ensureProfile(db, id);
  }
  return db;
}

function world(db: Db, retryMs = 1, maxRetries = 30) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error), retryMs, maxRetries);
  return { db, scheduler, manager, recorder, errors };
}

type World = ReturnType<typeof world>;

/** Лобі ведучої: гравці за ніками з акаунтами (null — гість). */
function lobby(w: World, players: [string, string | null][]) {
  const room = w.manager.create(makeQuiz(FIVE, { speedBonus: false }), HOST, null);
  w.manager.connect(room, { role: 'host', playerId: null });
  const ids: Record<string, string> = {};
  for (const [nickname, userId] of players) {
    const joined = w.manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    w.manager.connect(room, { role: 'player', playerId: joined.playerId });
    ids[nickname] = joined.playerId;
  }
  return { room, ids };
}

/** П'ять запитань: rights[i] — хто відповідає правильно на i-му (решта — ні); далі до фінішу. */
function play(w: World, room: Room, ids: Record<string, string>, rights: string[][]) {
  expect(w.manager.host(room, { type: 'start' })).toEqual({ ok: true });
  for (const names of rights) {
    toQuestion(w.manager, room);
    expect(room.state.phase).toBe('question');
    for (const [nickname, id] of Object.entries(ids)) w.manager.answer(room, id, names.includes(nickname) ? right : wrong);
    w.manager.host(room, { type: 'lock' });
  }
  toEnd(w.manager, room);
  expect(room.state.phase).toBe('finished');
}

const playerView = (w: World, room: Room, playerId: string) => w.manager.view(room, { role: 'player', playerId }) as PlayerView;
const has = (view: GameView | null, key: string) => view !== null && key in view;

const FOUR: [string, string | null][] = [
  ['Анна', ANNA],
  ['Богдан', BOHDAN],
  ['Віра', VIRA],
  ['Гість', null],
];
/** Анна 5 правильних, Богдан 2, Віра 0, гість 1. */
const RIGHTS = [['Анна', 'Богдан'], ['Анна', 'Богдан', 'Гість'], ['Анна'], ['Анна'], ['Анна']];

describe('the xp moment in the recorder (49)', () => {
  it('a finished game tells each phone its own xp', async () => {
    const db = await base();
    const w = world(db);
    const { room, ids } = lobby(w, FOUR);
    expect(w.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    // Поза finished ключа немає ні в кого.
    for (const id of Object.values(ids)) expect(has(playerView(w, room, id), 'xp')).toBe(false);
    await w.recorder.idle();
    // Гра йде далі (start уже натиснуто).
    for (const names of RIGHTS) {
      toQuestion(w.manager, room);
      for (const [nickname, id] of Object.entries(ids)) w.manager.answer(room, id, names.includes(nickname) ? right : wrong);
      w.manager.host(room, { type: 'lock' });
    }
    toEnd(w.manager, room);
    expect(room.state.phase).toBe('finished');
    // До запису: акаунт — «рахуємо», гість — запрошення.
    expect(playerView(w, room, ids['Анна']).xp).toEqual({ account: true, moment: null });
    expect(playerView(w, room, ids['Гість']).xp).toEqual({ account: false });
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    const anna = playerView(w, room, ids['Анна']).xp;
    const bohdan = playerView(w, room, ids['Богдан']).xp;
    const vira = playerView(w, room, ids['Віра']).xp;
    for (const view of [anna, bohdan, vira]) {
      if (view === undefined || !view.account || view.moment === null) throw new Error('no card');
      expect(view.moment.gained).toBeGreaterThan(0);
      expect(view.moment.lines).toContainEqual({ kind: 'join', xp: 50 });
      expect(view.moment.reason).toBeNull();
    }
    // Кожен — своє: правильні відповіді за власними.
    const correctOf = (view: typeof anna) => (view !== undefined && view.account ? view.moment?.lines.find((l) => l.kind === 'correct') : undefined);
    expect(correctOf(anna)).toEqual({ kind: 'correct', xp: 50, count: 5 });
    expect(correctOf(bohdan)).toEqual({ kind: 'correct', xp: 20, count: 2 });
    expect(correctOf(vira)).toBeUndefined();
    expect(playerView(w, room, ids['Гість']).xp).toEqual({ account: false });
    // Сцена й пульт ключа не мають.
    expect(has(w.manager.view(room, { role: 'stage', playerId: null }), 'xp')).toBe(false);
    expect(has(w.manager.view(room, { role: 'host', playerId: null }), 'xp')).toBe(false);
  });

  it('a solo game says why', async () => {
    const db = await base();
    const w = world(db);
    const { room, ids } = lobby(w, [['Анна', ANNA]]);
    play(w, room, ids, [['Анна'], ['Анна'], [], ['Анна'], []]);
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    const view = playerView(w, room, ids['Анна']).xp;
    if (view === undefined || !view.account || view.moment === null) throw new Error('no card');
    expect(view.moment.reason).toBe('few_accounts');
    expect(view.moment.lines.some((l) => l.kind === 'join')).toBe(false);
  });

  it('teams: each member sees their own', async () => {
    const db = await base();
    const w = world(db);
    const started = startTeamGame(
      w.manager,
      makeRoundsQuiz([classicRound('r1', FIVE, { speedBonus: false })], { teams: { ...defaultTeams(2), answerer: 'rotate' } }),
      [
        ['Анна', 'Богдан'],
        ['Віра', 'Ігор'],
      ],
      { Анна: ANNA, Богдан: BOHDAN, Віра: VIRA, Ігор: IHOR },
      HOST,
    );
    const { room, members } = started;
    // Відповідач по черзі (12g): у першій команді правильно відповідає той, чия черга; друга команда — неправильно.
    const answered: Record<string, number> = { Анна: 0, Богдан: 0 };
    for (let i = 0; i < FIVE.length; i++) {
      toQuestion(w.manager, room);
      expect(room.state.phase).toBe('question');
      for (const name of ['Анна', 'Богдан']) if (w.manager.answer(room, members[name], right).ok) answered[name] += 1;
      for (const name of ['Віра', 'Ігор']) w.manager.answer(room, members[name], wrong);
      w.manager.host(room, { type: 'lock' });
    }
    expect(answered['Анна'] + answered['Богдан']).toBe(5);
    expect(answered['Анна']).not.toBe(answered['Богдан']);
    toEnd(w.manager, room);
    expect(room.state.phase).toBe('finished');
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    const card = (name: string) => {
      const view = playerView(w, room, members[name]).xp;
      if (view === undefined || !view.account || view.moment === null) throw new Error(`no card for ${name}`);
      return view.moment;
    };
    const line = (name: string, kind: string) => card(name).lines.find((l) => l.kind === kind);
    for (const name of ['Анна', 'Богдан']) expect(line(name, 'correct')).toEqual({ kind: 'correct', xp: answered[name] * 10, count: answered[name] });
    expect(line('Анна', 'place')).toEqual({ kind: 'place', xp: 100, place: 1 });
    expect(line('Богдан', 'place')).toEqual(line('Анна', 'place'));
    expect(line('Віра', 'place')).toEqual({ kind: 'place', xp: 60, place: 2 });
    expect(line('Ігор', 'place')).toEqual(line('Віра', 'place'));
  });

  it('retries and a restart give the same card and no new rows', async () => {
    const db = await base();
    const w = world(db);
    vi.mocked(xp.gameXpMoments).mockRejectedValueOnce(new Error('db down'));
    const { room, ids } = lobby(w, FOUR);
    play(w, room, ids, RIGHTS);
    await w.recorder.idle();
    expect(w.errors).toEqual([new Error('db down')]);
    // Гра вже записана; поки повтор не дорахував — «рахуємо».
    expect(playerView(w, room, ids['Анна']).xp).toEqual({ account: true, moment: null });
    await vi.waitFor(() => expect(vi.mocked(xp.gameXpMoments)).toHaveBeenCalledTimes(2));
    await w.recorder.idle();
    expect(w.errors).toHaveLength(1);
    const card = playerView(w, room, ids['Анна']).xp;
    if (card === undefined || !card.account || card.moment === null) throw new Error('no card');
    const rows = (await db.select().from(xpEntry)).length;

    // Перезапуск: кімната піднята вже finished — рядків не додається, картка та сама.
    const saved = w.manager.snapshot(room);
    const next = world(db);
    const back = next.manager.restore(saved);
    if (back === null) throw new Error('not restored');
    expect(playerView(next, back, ids['Анна']).xp).toEqual({ account: true, moment: null });
    await next.recorder.idle();
    expect(next.errors).toEqual([]);
    expect(playerView(next, back, ids['Анна']).xp).toEqual(card);
    expect(playerView(next, back, ids['Богдан']).xp).toEqual(playerView(w, room, ids['Богдан']).xp);
    expect((await db.select().from(xpEntry)).length).toBe(rows);
  });

  it('on the last try a failing card does not hold the game back: no card, the loss is told with the game id', async () => {
    const db = await base();
    const w = world(db, 1, 0);
    vi.mocked(xp.gameXpMoments).mockRejectedValue(new Error('db down'));
    const { room, ids } = lobby(w, FOUR);
    play(w, room, ids, RIGHTS);
    await w.recorder.idle();
    expect(w.errors).toHaveLength(1);
    const lost = w.errors[0] as Error;
    expect(lost.message).toContain(room.id);
    expect(lost.cause).toEqual(new Error('db down'));
    expect((await db.select().from(game)).map((row) => row.status)).toEqual(['finished']);
    expect((await db.select().from(xpEntry)).length).toBeGreaterThan(0);
    // Телефон не чекає вічно: ключа немає; гість — як і було.
    expect(has(playerView(w, room, ids['Анна']), 'xp')).toBe(false);
    expect(playerView(w, room, ids['Гість']).xp).toEqual({ account: false });
  });

  it('a closed room is left alone', async () => {
    const db = await base();
    const w = world(db);
    const set = vi.spyOn(w.manager, 'setXpMoments');
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = (await vi.importActual<typeof import('./xp-store')>('./xp-store')).gameXpMoments;
    vi.mocked(xp.gameXpMoments).mockImplementationOnce(async (database, gameId) => {
      await gate;
      return original(database, gameId);
    });
    const { room, ids } = lobby(w, FOUR);
    play(w, room, ids, RIGHTS);
    await vi.waitFor(() => expect(vi.mocked(xp.gameXpMoments)).toHaveBeenCalledTimes(1));
    // Кімната закривається за часом фінішу, поки запис ще йде.
    w.scheduler.advance(FINISHED_TTL_MS + 1000);
    expect(w.manager.get(room.code)).toBeUndefined();
    release();
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    expect(set).not.toHaveBeenCalled();
  });
});
