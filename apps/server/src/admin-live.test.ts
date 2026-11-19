import { createGame } from '@quiz/engine';
import { classicRound, makeRoundsQuiz, single, text } from '@quiz/engine/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { liveRooms, liveStatus } from './admin-live';
import type { Db } from './db/client';
import { profile, user } from './db/schema';
import { RoomManager } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';

const threeRounds = () => makeRoundsQuiz([classicRound('r1', [single]), classicRound('r2', [single, text]), classicRound('r3', [text])]);

describe('liveStatus', () => {
  it('tells the lobby, the opening, a question in a round, a pause and the end apart', () => {
    const state = createGame(threeRounds());
    expect(liveStatus(state)).toEqual({ status: 'lobby', round: null });
    expect(liveStatus({ ...state, phase: 'guide', roundIndex: -1 })).toEqual({ status: 'starting', round: null });
    const playing = { ...state, phase: 'question' as const, roundIndex: 1 };
    expect(liveStatus(playing)).toEqual({ status: 'playing', round: { number: 2, of: 3 } });
    expect(liveStatus({ ...playing, paused: true })).toEqual({ status: 'paused', round: { number: 2, of: 3 } });
    expect(liveStatus({ ...playing, phase: 'finished' })).toEqual({ status: 'finished', round: null });
  });
});

describe('liveRooms', () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
    await db.insert(user).values([
      { id: 'olya53', name: 'Оля', email: 'olya53@example.com' },
      { id: 'marta53', name: 'Марта', email: 'marta53@example.com' },
    ]);
    await db.insert(profile).values([
      { userId: 'olya53', nickname: 'Оля 53', nicknameKey: 'оля53' },
      { userId: 'marta53', nickname: 'Марта 53', nicknameKey: 'марта53' },
    ]);
  });

  it('liveRooms shows nicknames and never an email', async () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5, { pacing: false });

    const finished = manager.create(threeRounds(), 'olya53', 'q0');
    manager.connect(finished, { role: 'host', playerId: null });
    const late = manager.join(finished.code, 'Ірина');
    if (!late.ok) throw new Error(late.error);
    manager.connect(finished, { role: 'player', playerId: late.playerId });
    expect(manager.host(finished, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(finished, { type: 'end' })).toEqual({ ok: true });

    scheduler.advance(1_000);
    const mine = manager.create(threeRounds(), 'olya53', 'q1');
    const first = manager.join(mine.code, 'Тарас');
    const second = manager.join(mine.code, 'Олена');
    if (!first.ok || !second.ok) throw new Error('join');
    manager.connect(mine, { role: 'player', playerId: first.playerId });

    scheduler.advance(1_000);
    const guest = manager.create(threeRounds());

    scheduler.advance(1_000);
    const pilot = manager.createAutopilot(threeRounds(), 'marta53', 'q2', 'Марта');
    if (!pilot.ok) throw new Error(pilot.error);

    const list = await liveRooms(db, manager.rooms(), new Date(scheduler.now()));
    expect(list.rooms.map((r) => r.code)).toEqual([pilot.room.code, guest.code, mine.code, finished.code]);
    const [auto, anon, olya, done] = list.rooms;
    expect(olya).toMatchObject({ host: 'Оля 53', autopilot: false, players: { online: 1, total: 2 }, status: 'lobby', round: null });
    expect(olya!.stageUrl).toBe('/stage/' + mine.code + '#' + mine.stageToken);
    expect(olya!.title).toBe(mine.state.quiz.title);
    expect(olya!.openedAt).toBe(new Date(mine.lobby.openedAt).toISOString());
    expect(olya!.actedAt).toBe(new Date(mine.actedAt).toISOString());
    expect(anon).toMatchObject({ host: null, autopilot: false, players: { online: 0, total: 0 } });
    expect(auto).toMatchObject({ host: 'Марта 53', autopilot: true });
    expect(done).toMatchObject({ host: 'Оля 53', status: 'finished' });
    expect(list.at).toBe(new Date(scheduler.now()).toISOString());
    expect(JSON.stringify(list)).not.toContain('@');
  });
});
