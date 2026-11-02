import { describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, single, text } from '@quiz/engine/testing';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity, type Room, type RoomEvent } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const quiz = () => makeRoundsQuiz([classicRound('r1', [single, text])]);

function setup() {
  const manager = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
  const events: { room: Room; event: RoomEvent }[] = [];
  manager.onEvent((room, event) => events.push({ room, event }));
  return { manager, events };
}

function hosted(manager: RoomManager, userId: string): Room {
  const room = manager.create(quiz(), userId, 'q1');
  manager.connect(room, HOST);
  const joined = manager.join(room.code, 'Тарас');
  if (!joined.ok) throw new Error(joined.error);
  manager.connect(room, { role: 'player', playerId: joined.playerId });
  return room;
}

function started(manager: RoomManager, userId: string): Room {
  const room = hosted(manager, userId);
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  return room;
}

describe('closeHostedBy (ban, 21a)', () => {
  it('closes the lobby, ends running games (hosted and autopilot), leaves finished and other hosts alone', () => {
    const { manager, events } = setup();
    const lobby = hosted(manager, 'u1');
    const running = started(manager, 'u1');
    const finished = started(manager, 'u1');
    expect(manager.host(finished, { type: 'end' })).toEqual({ ok: true });
    expect(finished.state.phase).toBe('finished');
    const finishedState = finished.state;

    const created = manager.createAutopilot(quiz(), 'u1', 'q1', 'Марта');
    if (!created.ok) throw new Error(created.error);
    const pilot = created.room;
    manager.connect(pilot, { role: 'player', playerId: created.playerId });
    const joined = manager.join(pilot.code, 'Олена');
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(pilot, { role: 'player', playerId: joined.playerId });
    expect(manager.author(pilot, created.playerId, { type: 'start' })).toEqual({ ok: true });
    expect(pilot.state.phase).not.toBe('finished');

    const other = started(manager, 'u2');
    const otherPhase = other.state.phase;
    expect(otherPhase).not.toBe('lobby');

    events.length = 0;
    expect(manager.closeHostedBy('u1')).toBe(3);

    expect(manager.get(lobby.code)).toBeUndefined();
    expect(events.some((e) => e.room === lobby && e.event.type === 'closed')).toBe(true);
    expect(running.state.phase).toBe('finished');
    expect(pilot.state.phase).toBe('finished');
    expect(finished.state).toBe(finishedState);
    expect(manager.get(finished.code)).toBe(finished);
    expect(other.state.phase).toBe(otherPhase);
    expect(manager.get(other.code)).toBe(other);
  });

  it('nobody hosting → 0', () => {
    const { manager } = setup();
    hosted(manager, 'u1');
    expect(manager.closeHostedBy('nobody')).toBe(0);
  });
});
