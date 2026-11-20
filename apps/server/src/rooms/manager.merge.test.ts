import { makeQuiz, single, text } from '@quiz/engine/testing';
import { describe, expect, it } from 'vitest';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Room } from './manager';

const quiz = () => makeQuiz([single, text], { speedBonus: false });

function enter(manager: RoomManager, room: Room, nickname: string, userId: string | null): string {
  const joined = manager.join(room.code, nickname, userId);
  if (!joined.ok) throw new Error(joined.error);
  manager.connect(room, { role: 'player', playerId: joined.playerId });
  return joined.playerId;
}

/** Гра стартувала й закінчилась (закриття адміном — end() рушія); бали місць — задані. */
function finish(manager: RoomManager, room: Room, scores: Record<string, number>): void {
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  expect(manager.closeByAdmin(room.code)).toBe('ended');
  room.state = { ...room.state, players: room.state.players.map((p) => ({ ...p, score: scores[p.id] ?? p.score })) };
}

describe('merging accounts (66) in the room manager', () => {
  it('a player in a running room is live, a finished room is not', () => {
    const manager = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    const lobby = manager.create(quiz(), 'host-1', null);
    enter(manager, lobby, 'Оля', 'olia');
    const running = manager.create(quiz(), 'host-2', null);
    enter(manager, running, 'Тарас', 'taras');
    expect(manager.host(running, { type: 'start' })).toEqual({ ok: true });

    expect(manager.inLiveGame('olia')).toBe(true);
    expect(manager.inLiveGame('host-1')).toBe(true);
    expect(manager.inLiveGame('taras')).toBe(true);
    expect(manager.inLiveGame('host-2')).toBe(true);
    expect(manager.inLiveGame('nobody')).toBe(false);

    expect(manager.closeByAdmin(running.code)).toBe('ended');
    expect(manager.get(running.code)?.state.phase).toBe('finished');
    expect(manager.inLiveGame('taras')).toBe(false);
    expect(manager.inLiveGame('host-2')).toBe(false);
    expect(manager.inLiveGame('olia')).toBe(true);
  });

  it('rebinding moves seats and the host to the primary and drops a second seat of the same person', () => {
    const manager = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    // S сам у кімнаті: місце переходить на P.
    const alone = manager.create(quiz(), 'host-1', null);
    const sAlone = enter(manager, alone, 'Друга', 'S');
    const guest = enter(manager, alone, 'Гість', null);
    finish(manager, alone, {});
    // Обидва в кімнаті, P набрав більше: місце S стає гостьовим.
    const primaryWins = manager.create(quiz(), 'host-2', null);
    const pWin = enter(manager, primaryWins, 'Головна', 'P');
    const sLose = enter(manager, primaryWins, 'Друга', 'S');
    finish(manager, primaryWins, { [pWin]: 10, [sLose]: 5 });
    // Обидва в кімнаті, S набрав більше: місце S лишається прив'язаним — тепер до P, а місце P стає гостьовим.
    const secondaryWins = manager.create(quiz(), 'host-3', null);
    const pLose = enter(manager, secondaryWins, 'Головна', 'P');
    const sWin = enter(manager, secondaryWins, 'Друга', 'S');
    finish(manager, secondaryWins, { [pLose]: 3, [sWin]: 9 });
    // Рівно — лишається місце P.
    const tie = manager.create(quiz(), 'host-4', null);
    const pTie = enter(manager, tie, 'Головна', 'P');
    const sTie = enter(manager, tie, 'Друга', 'S');
    finish(manager, tie, { [pTie]: 4, [sTie]: 4 });
    // Кімнату вів S: ведучий — P.
    const hosted = manager.create(quiz(), 'S', null);
    const other = enter(manager, hosted, 'Оля', 'olia');
    finish(manager, hosted, {});

    expect(manager.rebindUser('S', 'P')).toBe(4);

    expect(alone.playerUsers.get(sAlone)).toBe('P');
    expect(alone.playerUsers.has(guest)).toBe(false);
    expect(primaryWins.playerUsers.get(pWin)).toBe('P');
    expect(primaryWins.playerUsers.has(sLose)).toBe(false);
    expect(secondaryWins.playerUsers.get(sWin)).toBe('P');
    expect(secondaryWins.playerUsers.has(pLose)).toBe(false);
    expect(tie.playerUsers.get(pTie)).toBe('P');
    expect(tie.playerUsers.has(sTie)).toBe(false);
    expect(hosted.hostUserId).toBe('P');
    expect(hosted.playerUsers.get(other)).toBe('olia');
    for (const room of [alone, primaryWins, secondaryWins, tie, hosted]) {
      expect([...room.playerUsers.values()]).not.toContain('S');
      expect([...room.playerUsers.values()].filter((id) => id === 'P').length).toBeLessThanOrEqual(1);
    }
    expect(primaryWins.forgotten?.has(sLose) ?? false).toBe(false);
    expect(manager.rebindUser('S', 'P')).toBe(0);
  });
});
