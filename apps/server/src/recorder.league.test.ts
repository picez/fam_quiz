import { defaultTeams } from '@quiz/shared';
import type { HostView, PlayerView } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classicRound, makeQuiz, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import * as achievements from './achievement-store';
import type { Db } from './db/client';
import { game, groupMember, leagueGame, leaguePoint, user } from './db/schema';
import { createGroup, deleteGroup } from './group-store';
import * as leagueStore from './league-store';
import { ensureProfile } from './profiles';
import { attachRecorder, type Recorder } from './recorder';
import { RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';
import { startTeamGame, toEnd, toQuestion } from './testing/team-game';

vi.mock('./achievement-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('./achievement-store')>();
  return { ...original, awardGame: vi.fn(original.awardGame) };
});
vi.mock('./league-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('./league-store')>();
  return { ...original, recordLeague: vi.fn(original.recordLeague) };
});

afterEach(async () => {
  vi.mocked(achievements.awardGame).mockReset();
  vi.mocked(achievements.awardGame).mockImplementation((await vi.importActual<typeof import('./achievement-store')>('./achievement-store')).awardGame);
  vi.mocked(leagueStore.recordLeague).mockReset();
  vi.mocked(leagueStore.recordLeague).mockImplementation((await vi.importActual<typeof import('./league-store')>('./league-store')).recordLeague);
});

const HOST = 'host-user';
const ANNA = 'anna-user';
const BOHDAN = 'bohdan-user';
const VIRA = 'vira-user';
const IHOR = 'ihor-user';
const NOW = new Date('2026-11-18T10:00:00Z');
const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const quiz = () => makeQuiz([single, withId(single, 's2')], { speedBonus: false });

/** База з акаунтами й групою «Родина»: ведуча й члени (за замовчуванням — усі, крім Ігоря). */
async function family(members: string[] = [ANNA, BOHDAN, VIRA]) {
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
  const created = await createGroup(db, HOST, { name: 'Родина', emoji: '🌻', description: '' }, NOW);
  if (!created.ok) throw new Error(created.error);
  for (const id of members) await db.insert(groupMember).values({ groupId: created.id, userId: id, role: 'member', joinedAt: NOW });
  return { db, groupId: created.id };
}

function world(db: Db, maxRetries = 30, retryMs = 1) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const recorder: Recorder = attachRecorder(manager, db, (error) => errors.push(error), retryMs, maxRetries);
  return { db, scheduler, manager, recorder, errors };
}

type World = ReturnType<typeof world>;

/** Лобі ведучої для ліги «Родина»: гравці за ніками з акаунтами (null — гість). */
function lobby(w: World, groupId: string, players: [string, string | null][]) {
  const room = w.manager.create(quiz(), HOST, null);
  w.manager.connect(room, { role: 'host', playerId: null });
  const ids: Record<string, string> = {};
  for (const [nickname, userId] of players) {
    const joined = w.manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    w.manager.connect(room, { role: 'player', playerId: joined.playerId });
    ids[nickname] = joined.playerId;
  }
  expect(w.manager.setLeague(room, { groupId, groupName: 'Родина' })).toEqual({ ok: true });
  return { room, ids };
}

/** Дві запитання: right — хто відповідає правильно на кожному (решта — ні); далі до фінішу. */
function play(w: World, room: Room, ids: Record<string, string>, right1: string[], right2: string[]) {
  expect(w.manager.host(room, { type: 'start' })).toEqual({ ok: true });
  for (const rights of [right1, right2]) {
    toQuestion(w.manager, room);
    expect(room.state.phase).toBe('question');
    for (const [nickname, id] of Object.entries(ids)) w.manager.answer(room, id, rights.includes(nickname) ? right : wrong);
    w.manager.host(room, { type: 'lock' });
  }
  toEnd(w.manager, room);
  expect(room.state.phase).toBe('finished');
}

const points = async (db: Db) =>
  (await db.select().from(leaguePoint)).map((row) => [row.userId, row.place, row.points, row.nickname]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
const statusOf = async (db: Db, id: string) => (await db.select().from(game).where(eq(game.id, id)))[0]?.status;
const playerView = (w: World, room: Room, playerId: string) => w.manager.view(room, { role: 'player', playerId }) as PlayerView;
const hostView = (w: World, room: Room) => w.manager.view(room, { role: 'host', playerId: null }) as HostView;

/** Три члени й гість: Анна 2 правильні (як і гість), Богдан 1, Віра 0. */
const FOUR: [string, string | null][] = [
  ['Анна', ANNA],
  ['Богдан', BOHDAN],
  ['Віра', VIRA],
  ['Гість', null],
];
const playFour = (w: World, room: Room, ids: Record<string, string>) => play(w, room, ids, ['Анна', 'Богдан', 'Гість'], ['Анна', 'Гість']);

describe('the family league in the recorder (45)', () => {
  it('a finished league game writes points with the game and tells the room', async () => {
    const { db, groupId } = await family();
    const w = world(db);
    const { room, ids } = lobby(w, groupId, FOUR);
    playFour(w, room, ids);
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    expect(await statusOf(db, room.id)).toBe('finished');
    // Гість ділить з Анною перше місце гри, але місця в лізі не займає.
    expect(await points(db)).toEqual([
      [ANNA, 1, 10, 'Анна'],
      [BOHDAN, 2, 7, 'Богдан'],
      [VIRA, 3, 5, 'Віра'],
    ]);
    const [recorded] = await db.select().from(leagueGame);
    expect(recorded).toMatchObject({ gameId: room.id, groupId, month: '2026-11', members: 3, counted: true });
    expect(playerView(w, room, ids['Анна']).league).toEqual({ group: 'Родина', points: 10 });
    expect(playerView(w, room, ids['Віра']).league).toEqual({ group: 'Родина', points: 5 });
    expect(playerView(w, room, ids['Гість']).league).toEqual({ group: 'Родина' });
    expect(hostView(w, room).league).toEqual({
      group: 'Родина',
      rows: [
        { nickname: 'Анна', points: 10 },
        { nickname: 'Богдан', points: 7 },
        { nickname: 'Віра', points: 5 },
      ],
    });
  });

  it('the league is written in the same transaction: a failure rolls the finish back and the retry writes both once', async () => {
    const { db, groupId } = await family();
    const w = world(db, 30, 300);
    const record = vi.mocked(leagueStore.recordLeague);
    const original = (await vi.importActual<typeof import('./league-store')>('./league-store')).recordLeague;
    // Пише бали, а тоді падає: транзакція має відкотити і їх, і фініш гри.
    record.mockImplementationOnce(async (tx, input) => {
      await original(tx, input);
      throw new Error('league down');
    });
    const { room, ids } = lobby(w, groupId, FOUR);
    playFour(w, room, ids);
    await w.recorder.idle();
    expect(w.errors).toEqual([new Error('league down')]);
    expect(await statusOf(db, room.id)).toBe('running');
    expect(await db.select().from(leagueGame)).toEqual([]);
    expect(await db.select().from(leaguePoint)).toEqual([]);
    expect(hostView(w, room).league).toEqual({ group: 'Родина' });

    await vi.waitFor(async () => expect(await statusOf(db, room.id)).toBe('finished'), { timeout: 3000 });
    await w.recorder.idle();
    expect(w.errors).toHaveLength(1);
    expect(await points(db)).toEqual([
      [ANNA, 1, 10, 'Анна'],
      [BOHDAN, 2, 7, 'Богдан'],
      [VIRA, 3, 5, 'Віра'],
    ]);
    expect(hostView(w, room).league?.rows).toHaveLength(3);
  });

  it('when only the last retry is left, a failing league no longer holds the game back: the game is finished, the loss is told with the game id', async () => {
    const { db, groupId } = await family();
    const w = world(db, 1);
    vi.mocked(leagueStore.recordLeague).mockRejectedValue(new Error('league down'));
    const { room, ids } = lobby(w, groupId, FOUR);
    playFour(w, room, ids);
    await vi.waitFor(() => expect(w.errors).toHaveLength(2));
    await w.recorder.idle();
    expect(w.errors[0]).toEqual(new Error('league down'));
    const last = w.errors[1] as Error;
    expect(last.message).toContain(room.id);
    expect(last.message).toContain('ліги');
    expect(last.cause).toEqual(new Error('league down'));
    expect(await statusOf(db, room.id)).toBe('finished');
    expect(await db.select().from(leaguePoint)).toEqual([]);
  });

  it('team game: the members of the first team get 10 each, of the second 7', async () => {
    const { db, groupId } = await family([ANNA, BOHDAN, VIRA, IHOR]);
    const w = world(db);
    const started = startTeamGame(
      w.manager,
      makeRoundsQuiz([classicRound('r1', [single], { speedBonus: false })], { teams: defaultTeams(2) }),
      [
        ['Анна', 'Богдан'],
        ['Віра', 'Ігор'],
      ],
      { Анна: ANNA, Богдан: BOHDAN, Віра: VIRA, Ігор: IHOR },
      HOST,
    );
    // startTeamGame стартує одразу: позначку, що ставить лобі, кладемо напряму.
    started.room.league = { groupId, groupName: 'Родина' };
    toQuestion(w.manager, started.room);
    expect(w.manager.answer(started.room, started.members['Анна'], right)).toEqual({ ok: true });
    expect(w.manager.answer(started.room, started.members['Віра'], wrong)).toEqual({ ok: true });
    toEnd(w.manager, started.room);
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    expect(await points(db)).toEqual([
      [ANNA, 1, 10, 'Анна'],
      [BOHDAN, 1, 10, 'Богдан'],
      [IHOR, 2, 7, 'Ігор'],
      [VIRA, 2, 7, 'Віра'],
    ]);
    expect(playerView(w, started.room, started.members['Ігор']).league).toEqual({ group: 'Родина', points: 7 });
  });

  it('too few: two members and guests — the host is told, no points', async () => {
    const { db, groupId } = await family();
    const w = world(db);
    const { room, ids } = lobby(w, groupId, [
      ['Анна', ANNA],
      ['Богдан', BOHDAN],
      ['Гість', null],
      ['Ігор', IHOR],
    ]);
    play(w, room, ids, ['Анна'], ['Богдан']);
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    expect(await db.select().from(leaguePoint)).toEqual([]);
    const [recorded] = await db.select().from(leagueGame);
    expect(recorded).toMatchObject({ members: 2, counted: false });
    expect(hostView(w, room).league).toEqual({ group: 'Родина', tooFew: true });
    // Звичайний гравець (не автор автопілота) «замало» не бачить.
    expect(playerView(w, room, ids['Анна']).league).toEqual({ group: 'Родина' });
  });

  it('retries and restarts do not add twice', async () => {
    const { db, groupId } = await family();
    const w = world(db);
    vi.mocked(achievements.awardGame).mockRejectedValueOnce(new Error('db down'));
    const { room, ids } = lobby(w, groupId, FOUR);
    playFour(w, room, ids);
    await w.recorder.idle();
    expect(w.errors).toEqual([new Error('db down')]);
    await vi.waitFor(() => expect(vi.mocked(achievements.awardGame)).toHaveBeenCalledTimes(2));
    await w.recorder.idle();
    const once = [
      [ANNA, 1, 10, 'Анна'],
      [BOHDAN, 2, 7, 'Богдан'],
      [VIRA, 3, 5, 'Віра'],
    ];
    expect(await points(db)).toEqual(once);
    expect(await db.select().from(leagueGame)).toHaveLength(1);

    // Перезапуск: кімната піднята вже finished — у базі нічого не додається, а зрізи — той самий підсумок.
    const saved = w.manager.snapshot(room);
    const next = world(db);
    const back = next.manager.restore(saved);
    if (back === null) throw new Error('not restored');
    await next.recorder.idle();
    expect(next.errors).toEqual([]);
    expect(await points(db)).toEqual(once);
    expect(await db.select().from(leagueGame)).toHaveLength(1);
    expect(playerView(next, back, ids['Богдан']).league).toEqual({ group: 'Родина', points: 7 });
    expect(hostView(next, back).league).toEqual(hostView(w, room).league);
  });

  it('aborted, saved and challenge games count nothing', async () => {
    const { db, groupId } = await family();
    const w = world(db);
    // «Завершити гру» до першого запитання.
    const aborted = lobby(w, groupId, FOUR);
    expect(w.manager.host(aborted.room, { type: 'start' })).toEqual({ ok: true });
    expect(w.manager.host(aborted.room, { type: 'end' })).toEqual({ ok: true });
    expect(aborted.room.state.phase).toBe('finished');
    // «Зберегти й продовжити пізніше».
    const saved = lobby(w, groupId, FOUR);
    expect(w.manager.host(saved.room, { type: 'start' })).toEqual({ ok: true });
    toQuestion(w.manager, saved.room);
    for (const id of Object.values(saved.ids)) w.manager.answer(saved.room, id, right);
    w.manager.host(saved.room, { type: 'lock' });
    toQuestion(w.manager, saved.room);
    expect(w.manager.host(saved.room, { type: 'save' })).toEqual({ ok: true });
    // Спроба виклику: позначку лобі не дає (not_allowed); навіть якщо вона там опинилась, рекордер її не рахує.
    const created = w.manager.createAutopilot(quiz(), ANNA, null, 'Анна', {
      challenge: { id: '55555555-5555-4555-8555-555555555555', code: 'abcdefghjkmn', title: 'Виклик' },
    });
    if (!created.ok) throw new Error(created.error);
    const challenge = created.room;
    expect(w.manager.setLeague(challenge, { groupId, groupName: 'Родина' })).toEqual({ ok: false, error: 'not_allowed' });
    challenge.league = { groupId, groupName: 'Родина' };
    w.manager.connect(challenge, { role: 'player', playerId: created.playerId });
    expect(w.manager.author(challenge, created.playerId, { type: 'start' })).toEqual({ ok: true });
    for (let i = 0; i < 20 && challenge.state.phase !== 'question'; i++) w.scheduler.advance(1000);
    expect(challenge.state.phase).toBe('question');
    w.manager.answer(challenge, created.playerId, right);
    expect(w.manager.author(challenge, created.playerId, { type: 'end' })).toEqual({ ok: true });
    expect(challenge.state.phase).toBe('finished');
    expect(challenge.state.plays.length).toBeGreaterThan(0);

    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    expect(await statusOf(db, saved.room.id)).toBe('saved');
    expect(await statusOf(db, challenge.id)).toBe('finished');
    expect(await db.select().from(leagueGame)).toEqual([]);
    expect(await db.select().from(leaguePoint)).toEqual([]);
    expect(vi.mocked(leagueStore.recordLeague)).not.toHaveBeenCalled();
  });

  it('a group deleted mid-game: the game is recorded finished without points and without an error', async () => {
    const { db, groupId } = await family();
    const w = world(db);
    const { room, ids } = lobby(w, groupId, FOUR);
    expect(w.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    await w.recorder.idle();
    await deleteGroup(db, groupId);
    for (const rights of [['Анна'], ['Богдан']]) {
      toQuestion(w.manager, room);
      for (const [nickname, id] of Object.entries(ids)) w.manager.answer(room, id, rights.includes(nickname) ? right : wrong);
      w.manager.host(room, { type: 'lock' });
    }
    toEnd(w.manager, room);
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    expect(await statusOf(db, room.id)).toBe('finished');
    expect(await db.select().from(leagueGame)).toEqual([]);
    expect(await db.select().from(leaguePoint)).toEqual([]);
    expect(hostView(w, room).league).toEqual({ group: 'Родина' });
  });
});
