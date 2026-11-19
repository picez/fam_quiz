import { describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, single, text } from '@quiz/engine/testing';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity, type Room, type RoomEvent } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const STAGE: Identity = { role: 'stage', playerId: null };
const quiz = () => makeRoundsQuiz([classicRound('r1', [single, text])]);

function setup() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5, { pacing: false });
  const events: { room: Room; event: RoomEvent }[] = [];
  manager.onEvent((room, event) => events.push({ room, event }));
  return { scheduler, manager, events };
}

function hosted(manager: RoomManager, userId: string | null): { room: Room; playerId: string } {
  const room = manager.create(quiz(), userId, userId === null ? null : 'q1');
  manager.connect(room, HOST);
  const joined = manager.join(room.code, 'Тарас');
  if (!joined.ok) throw new Error(joined.error);
  manager.connect(room, { role: 'player', playerId: joined.playerId });
  return { room, playerId: joined.playerId };
}

describe('admin closing and watching rooms (53)', () => {
  it('closeByAdmin closes a lobby with «closed» and ends a running game like the host', () => {
    const { manager, events } = setup();
    const lobby = hosted(manager, 'u1').room;
    events.length = 0;
    expect(manager.closeByAdmin(lobby.code)).toBe('closed');
    expect(manager.get(lobby.code)).toBeUndefined();
    expect(events.some((e) => e.room === lobby && e.event.type === 'closed')).toBe(true);

    const running = hosted(manager, null).room;
    expect(manager.host(running, { type: 'start' })).toEqual({ ok: true });
    expect(running.state.phase).not.toBe('lobby');
    expect(running.state.phase).not.toBe('finished');
    expect(manager.closeByAdmin(running.code)).toBe('ended');
    expect(running.state.phase).toBe('finished');
    expect(manager.get(running.code)).toBe(running);
    const finishedState = running.state;
    expect(manager.closeByAdmin(running.code)).toBe('finished');
    expect(running.state).toBe(finishedState);
    expect(manager.closeByAdmin('999999')).toBe('not_found');
  });

  it('actedAt follows every step', () => {
    const { scheduler, manager } = setup();
    const { room } = hosted(manager, 'u1');
    const created = scheduler.now();
    expect(room.actedAt).toBe(created);
    scheduler.advance(5_000);
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(room.actedAt).toBe(created + 5_000);
  });

  it('actedAt is never saved with the room and restarts at the restore', () => {
    const { scheduler, manager } = setup();
    const { room } = hosted(manager, 'u1');
    const saved = manager.snapshot(room);
    expect(JSON.stringify(saved)).not.toContain('actedAt');
    const other = new RoomManager(scheduler, () => 0.5, { pacing: false });
    scheduler.advance(7_000);
    const restored = other.restore(saved);
    expect(restored?.actedAt).toBe(scheduler.now());
  });

  it('connectionCount sums host, stage and players across rooms', () => {
    const { manager } = setup();
    const first = hosted(manager, 'u1');
    manager.connect(first.room, STAGE);
    manager.connect(first.room, { role: 'player', playerId: first.playerId });
    const second = manager.create(quiz(), 'u2', 'q2');
    const joined = manager.join(second.code, 'Олена');
    if (!joined.ok) throw new Error(joined.error);
    // first: host 1 + stage 1 + player 2 = 4; second: player 1 = 1.
    manager.connect(second, { role: 'player', playerId: joined.playerId });
    expect(manager.connectionCount()).toBe(5);
    manager.disconnect(first.room, STAGE);
    expect(manager.connectionCount()).toBe(4);
  });

  it('closeHostedBy still closes a banned host\'s lobby and ends his game', () => {
    const { manager, events } = setup();
    const lobby = hosted(manager, 'u1').room;
    const running = hosted(manager, 'u1').room;
    expect(manager.host(running, { type: 'start' })).toEqual({ ok: true });
    events.length = 0;
    expect(manager.closeHostedBy('u1')).toBe(2);
    expect(manager.get(lobby.code)).toBeUndefined();
    expect(events.some((e) => e.room === lobby && e.event.type === 'closed')).toBe(true);
    expect(running.state.phase).toBe('finished');
    expect(manager.closeHostedBy('u1')).toBe(0);
  });
});
