import { describe, expect, it } from 'vitest';
import { classicRound, makeQuiz, makeRoundsQuiz, single, truthRound, withId } from '@quiz/engine/testing';
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

describe('player truth facts (28b)', () => {
  const FACT = 'Я стрибала з парашутом';

  function truthRoom() {
    const { manager, scheduler } = setup();
    const room = manager.create(makeRoundsQuiz([truthRound('r1'), classicRound('r2', [single])]), 'u1');
    manager.connect(room, HOST);
    const olena = manager.join(room.code, 'Олена', null);
    const taras = manager.join(room.code, 'Тарас', null);
    if (!olena.ok || !taras.ok) throw new Error('join');
    return { manager, scheduler, room, olena: olena.playerId, taras: taras.playerId };
  }

  it('facts are rate limited and not emitted', () => {
    const { manager, scheduler, room, olena } = truthRoom();
    const events: RoomEvent[] = [];
    manager.onEvent((_room, event) => events.push(event));
    expect(manager.truth(room, olena, FACT)).toEqual({ ok: true });
    expect(manager.truth(room, olena, `${FACT}!`)).toEqual({ ok: true });
    expect(manager.truth(room, olena, `${FACT}!!`)).toEqual({ ok: false, error: 'too_soon' });
    expect(room.state.truth?.facts[olena]?.text).toBe(`${FACT}!`);
    scheduler.advance(1000);
    expect(manager.truth(room, olena, `${FACT}!!`)).toEqual({ ok: true });
    expect(room.state.truth?.facts[olena]?.text).toBe(`${FACT}!!`);
    expect(events.map((e) => e.type)).toContain('changed');
    expect(JSON.stringify(events)).not.toContain('парашут');
  });

  it('a fact sent after the deal is refused', () => {
    const { manager, scheduler, room, olena, taras } = truthRoom();
    expect(manager.truth(room, olena, FACT)).toEqual({ ok: true });
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('intro');
    // на заставці раунду ще можна
    expect(manager.truth(room, taras, 'Я знаю шість мов')).toEqual({ ok: true });
    scheduler.advance(10_000);
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.truth?.deck).toHaveLength(2);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1000);
    expect(manager.truth(room, taras, 'Я бачив північне сяйво')).toEqual({ ok: false, error: 'truth_closed' });
    expect(room.state.truth?.facts[taras]?.text).toBe('Я знаю шість мов');
  });

  it('host truth-hide hides a fact', () => {
    const { manager, room, olena } = truthRoom();
    expect(manager.truth(room, olena, FACT)).toEqual({ ok: true });
    expect(manager.host(room, { type: 'truth-hide', playerId: olena, hidden: true })).toEqual({ ok: true });
    expect(room.state.truth?.facts[olena]?.hidden).toBe(true);
    expect(manager.host(room, { type: 'truth-hide', playerId: 'nobody', hidden: true })).toEqual({ ok: false, error: 'not_found' });
  });
});
