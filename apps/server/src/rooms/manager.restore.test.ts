import { describe, expect, it, vi } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import { GAME_STATE_VERSION } from '@quiz/engine';
import { FakeScheduler } from '../testing/fake-scheduler';
import { HOST_ABSENCE_MS, RoomManager, isSavedRoom, type Identity, type Room, type RoomEvent } from './manager';

// Коди кімнат: черга підставлених значень randomInt, далі — справжній.
const codes = vi.hoisted(() => [] as number[]);
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomInt: (min: number, max: number) => codes.shift() ?? actual.randomInt(min, max) };
});

const HOST: Identity = { role: 'host', playerId: null };
const correct = { type: 'single', optionId: 'b' } as const;
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Ведучий, Олена й Тарас; Олена відповіла на перше запитання через 5 с. */
function midQuestion() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(makeQuiz([single, text]), 'u1', 'q1');
  manager.connect(room, HOST);
  const olena = manager.join(room.code, 'Олена', 'u2');
  const taras = manager.join(room.code, 'Тарас');
  if (!olena.ok || !taras.ok) throw new Error('join');
  for (const j of [olena, taras]) manager.connect(room, { role: 'player', playerId: j.playerId });
  manager.host(room, { type: 'start' });
  manager.host(room, { type: 'next' });
  scheduler.advance(5000);
  manager.answer(room, olena.playerId, correct);
  return { scheduler, manager, room, olena, taras };
}

describe('a room restored after a restart', () => {
  it('comes back with the same code, tokens, players and answers, paused at the moment of the snapshot', () => {
    const { scheduler, manager, room, olena, taras } = midQuestion();
    const saved = viaJson(manager.snapshot(room));
    manager.freeze(); // старий процес зупинився: його таймери зняті й не плутають scheduler.pending()
    expect(isSavedRoom(saved)).toBe(true);
    expect(saved.stateVersion).toBe(GAME_STATE_VERSION);

    scheduler.advance(60 * 60_000); // година простою
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.code).toBe(room.code);
    expect(back.id).toBe(room.id);
    expect(next.identify(room.code, 'host', room.hostToken)?.room).toBe(back);
    expect(next.identify(room.code, 'stage', room.stageToken)?.room).toBe(back);
    expect(next.identify(room.code, 'player', olena.token)?.identity.playerId).toBe(olena.playerId);
    expect(back.playerUsers.get(olena.playerId)).toBe('u2');
    expect(back.hostUserId).toBe('u1');
    expect(back.quizId).toBe('q1');
    expect(back.state.plays).toEqual(room.state.plays);
    expect(back.state.plays.at(-1)?.answers).not.toEqual({});
    expect(back.state.paused).toBe(true);
    expect(back.state.remainingMs).toBe(room.state.endsAt! - saved.savedAt);
    expect(back.state.players.every((p) => !p.connected)).toBe(true);
    // поки на паузі — жодного таймера запитання; лише відсутність ведучого
    expect(scheduler.pending()).toEqual([HOST_ABSENCE_MS]);

    next.connect(back, HOST);
    next.connect(back, { role: 'player', playerId: taras.playerId });
    expect(next.host(back, { type: 'resume' })).toEqual({ ok: true });
    expect(scheduler.pending()).toEqual([room.state.endsAt! - saved.savedAt]);
    expect(next.answer(back, taras.playerId, correct)).toEqual({ ok: true });
  });

  it('ends the game when the host does not come back in 10 minutes', () => {
    const { scheduler, manager, room } = midQuestion();
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    scheduler.advance(HOST_ABSENCE_MS - 1);
    expect(back.state.phase).not.toBe('finished');
    scheduler.advance(1);
    expect(back.state.phase).toBe('finished');
  });

  it('refuses a code that is already alive and a snapshot of another version', () => {
    const { scheduler, manager, room } = midQuestion();
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5);
    expect(next.restore(saved)).not.toBeNull();
    expect(next.restore(saved)).toBeNull();
    expect(isSavedRoom({ ...saved, stateVersion: GAME_STATE_VERSION + 1 })).toBe(false);
    expect(isSavedRoom({ ...saved, stateVersion: 1 })).toBe(false);
    expect(isSavedRoom({ ...saved, v: 2 })).toBe(false);
    expect(isSavedRoom({ ...saved, hostToken: undefined })).toBe(false);
    expect(isSavedRoom({ ...saved, state: {} })).toBe(false);
    expect(isSavedRoom(null)).toBe(false);
    expect(isSavedRoom('room')).toBe(false);
  });

  it('a room saved before 10c (state version 2) comes back: version 3 only added Play.clues', () => {
    const { scheduler, manager, room, olena, taras } = midQuestion();
    const saved = { ...viaJson(manager.snapshot(room)), stateVersion: 2 };
    manager.freeze();
    expect(isSavedRoom(saved)).toBe(true);
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.state.plays).toEqual(room.state.plays);
    next.connect(back, HOST);
    next.connect(back, { role: 'player', playerId: taras.playerId });
    expect(next.host(back, { type: 'resume' })).toEqual({ ok: true });
    expect(next.answer(back, taras.playerId, correct)).toEqual({ ok: true });
    expect(back.state.plays.at(-1)?.answers[olena.playerId]).toBeDefined();
  });

  it('a frozen manager restores nothing', () => {
    const { scheduler, manager, room } = midQuestion();
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5);
    next.freeze();
    expect(next.frozen).toBe(true);
    expect(next.restore(saved)).toBeNull();
  });

  it('a lobby comes back unpaused and keeps taking players', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeQuiz([single]));
    expect(manager.join(room.code, 'Олена').ok).toBe(true);
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();

    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.state.phase).toBe('lobby');
    expect(back.state.paused).toBe(false);
    expect(back.state.players.map((p) => p.nickname)).toEqual(['Олена']);
    expect(next.join(room.code, 'Іра').ok).toBe(true);
  });
});

describe('freezing on shutdown', () => {
  it('answers restarting to every action and changes nothing on disconnect or timers', () => {
    const { scheduler, manager, room, taras } = midQuestion();
    const before = room.state;
    manager.freeze();
    expect(manager.frozen).toBe(true);
    expect(manager.answer(room, taras.playerId, correct)).toEqual({ ok: false, error: 'restarting' });
    expect(manager.host(room, { type: 'lock' })).toEqual({ ok: false, error: 'restarting' });
    expect(manager.buyDebuff(room, taras.playerId, taras.playerId, 'fog')).toEqual({ ok: false, error: 'restarting' });
    manager.disconnect(room, { role: 'player', playerId: taras.playerId });
    manager.disconnect(room, HOST);
    scheduler.advance(60_000);
    expect(room.state).toBe(before);
    expect(scheduler.pending()).toEqual([]);
    expect(manager.join(room.code, 'Іра')).toEqual({ ok: false, error: 'restarting' });
    // кімнати лишаються в пам'яті, щоб записати їх на зупинці
    expect(manager.rooms()).toEqual([room]);
  });
});

describe('eviction and reserved codes', () => {
  it('an evicted room leaves memory with a moved event and is not closed', () => {
    const { scheduler, manager, room, taras } = midQuestion();
    const events: RoomEvent[] = [];
    manager.onEvent((_, event) => events.push(event));
    manager.evict(room);
    expect(events).toEqual([{ type: 'moved' }]);
    expect(manager.get(room.code)).toBeUndefined();
    expect(manager.rooms()).toEqual([]);
    expect(manager.answer(room, taras.playerId, correct)).toEqual({ ok: false, error: 'game_not_found' });
    expect(scheduler.pending()).toEqual([]);
  });

  it('a reserved code is not given to a new room, and restoring it frees the reservation', () => {
    const scheduler = new FakeScheduler();
    codes.push(123456);
    const old = new RoomManager(scheduler);
    const saved = viaJson(old.snapshot(old.create(makeQuiz([single]))));
    old.freeze();
    expect(saved.code).toBe('123456');

    const manager = new RoomManager(scheduler);
    manager.setReserved(['123456']);
    codes.push(123456, 654321);
    expect(manager.create(makeQuiz([single])).code).toBe('654321');
    const restored = manager.restore(saved);
    expect(restored?.code).toBe('123456');
    codes.push(123456, 111111);
    expect(manager.create(makeQuiz([single])).code).toBe('111111');
    // restore зняв код з резерву: коли кімната піде, код знову вільний (без нового setReserved)
    manager.evict(restored!);
    codes.push(123456);
    expect(manager.create(makeQuiz([single])).code).toBe('123456');
  });
});
