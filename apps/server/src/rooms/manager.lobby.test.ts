import { describe, expect, it } from 'vitest';
import { makeQuiz, single, withId } from '@quiz/engine/testing';
import { FakeScheduler } from '../testing/fake-scheduler';
import type { SavedGameData } from './continuation';
import { RoomManager, joinableOf, type Identity, type RoomEvent } from './manager';

const HOST: Identity = { role: 'host', playerId: null };

function setup() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  return { scheduler, manager };
}

describe('room lobby settings', () => {
  it('defaults', () => {
    const { manager, scheduler } = setup();
    const room = manager.create(makeQuiz([single]), 'u1');
    expect(room.lobby).toEqual({ visibility: 'friends', password: null, openedAt: scheduler.now() });
    expect(manager.create(makeQuiz([single])).lobby.visibility).toBe('hidden');
  });

  it('setLobby works in the lobby and emits changed, wrong_phase afterwards', () => {
    const { manager } = setup();
    const room = manager.create(makeQuiz([single]), 'u1');
    const events: string[] = [];
    manager.onEvent((_room, event) => events.push(event.type));
    expect(manager.setLobby(room, { visibility: 'all', password: 'сова42' })).toEqual({ ok: true });
    expect(room.lobby).toMatchObject({ visibility: 'all', password: 'сова42' });
    expect(events).toContain('changed');
    const joined = manager.join(room.code, 'Оля', null);
    if (!joined.ok) throw new Error(joined.error);
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.setLobby(room, { visibility: 'hidden', password: null })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('survives restore and never reaches state or views', () => {
    const { manager, scheduler } = setup();
    const room = manager.create(makeQuiz([single]), 'u1');
    manager.setLobby(room, { visibility: 'all', password: 'сова42' });
    const snap = manager.snapshot(room);
    expect(snap.lobby).toEqual(room.lobby);
    const next = new RoomManager(scheduler, () => 0.5);
    const restored = next.restore(JSON.parse(JSON.stringify(snap)));
    expect(restored?.lobby).toEqual(room.lobby);
    expect(JSON.stringify(manager.snapshot(room).state)).not.toContain('сова42');
    expect(JSON.stringify(manager.view(room, HOST))).not.toContain('сова42');
    expect(JSON.stringify(manager.view(room, { role: 'stage', playerId: null }))).not.toContain('сова42');
  });

  it('old saved room gets defaults', () => {
    const { manager, scheduler } = setup();
    const room = manager.create(makeQuiz([single]), 'u1');
    const snap = JSON.parse(JSON.stringify(manager.snapshot(room)));
    const expected = { visibility: 'friends', password: null, openedAt: snap.savedAt };
    const fresh = () => new RoomManager(scheduler, () => 0.5);
    expect(fresh().restore({ ...snap, lobby: undefined })?.lobby).toEqual(expected);
    expect(fresh().restore({ ...snap, lobby: { visibility: 'x', password: 5 } })?.lobby).toEqual(expected);
    expect(fresh().restore({ ...snap, hostUserId: null, lobby: undefined })?.lobby.visibility).toBe('hidden');
  });
});

describe('joinableOf', () => {
  it('lobby, started, continued, finished', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    let saved: SavedGameData | null = null;
    manager.onEvent((_room, event: RoomEvent) => {
      if (event.type === 'closed' && event.saved !== undefined) saved = event.saved;
    });
    const room = manager.create(makeQuiz([single, withId(single, 'second')]), 'u1');
    manager.connect(room, HOST);
    expect(joinableOf(room)).toBe('lobby');
    const joined = manager.join(room.code, 'Оля', 'u2');
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(joinableOf(room)).toBeNull();
    manager.host(room, { type: 'next' });
    manager.host(room, { type: 'next' });
    scheduler.advance(60_000);
    expect(manager.host(room, { type: 'save' })).toEqual({ ok: true });
    if (saved === null) throw new Error('not saved');
    const result = manager.continueSaved(room.id, 'u1', JSON.parse(JSON.stringify(saved)));
    if (!result.ok) throw new Error(result.error);
    expect(result.room.state.phase).not.toBe('lobby');
    expect(joinableOf(result.room)).toBe('late');
    expect(result.room.lobby).toMatchObject({ visibility: 'friends', password: null });
    result.room.state = { ...result.room.state, phase: 'finished' };
    expect(joinableOf(result.room)).toBeNull();
  });
});
