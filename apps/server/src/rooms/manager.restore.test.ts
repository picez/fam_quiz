import { describe, expect, it, vi } from 'vitest';
import { blitzRound, classicRound, clues, makeQuiz, makeRoundsQuiz, single, text } from '@quiz/engine/testing';
import { defaultTeams, SPLASH_MS, type Round } from '@quiz/shared';
import { GAME_STATE_VERSION } from '@quiz/engine';
import { FakeScheduler } from '../testing/fake-scheduler';
import { AUTOPILOT_EMPTY_MS, HOST_ABSENCE_MS, RoomManager, isSavedRoom, type Identity, type Room, type RoomEvent } from './manager';

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
    expect(isSavedRoom({ ...saved, stateVersion: 15 })).toBe(true);
    expect(isSavedRoom({ ...saved, stateVersion: GAME_STATE_VERSION + 1 })).toBe(false);
    expect(isSavedRoom({ ...saved, stateVersion: 1 })).toBe(false);
    expect(isSavedRoom({ ...saved, v: 2 })).toBe(false);
    expect(isSavedRoom({ ...saved, hostToken: undefined })).toBe(false);
    expect(isSavedRoom({ ...saved, state: {} })).toBe(false);
    expect(isSavedRoom(null)).toBe(false);
    expect(isSavedRoom('room')).toBe(false);
  });

  it('keeps an undo across a restart; a version 14 snapshot is still readable', () => {
    const { scheduler, manager, room, olena } = midQuestion();
    expect(manager.host(room, { type: 'adjust', playerId: olena.playerId, points: 50 })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'undo', target: { seq: 1 } })).toEqual({ ok: true });
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    expect(isSavedRoom({ ...saved, stateVersion: 14 })).toBe(true);
    const back = new RoomManager(scheduler, () => 0.5).restore(saved) as Room;
    expect(back.state.adjustments.at(-1)).toMatchObject({ seq: 2, source: 'undo', points: -50, undoes: { seq: 1 }, batch: 2 });
    expect(back.state.players.map((p) => p.score)).toEqual(room.state.players.map((p) => p.score));
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

describe('a team room restored after a restart (10j)', () => {
  /** Командна кімната: Олена, Тарас, Іра, Марко в лобі. */
  function teamLobby(rounds: Round[] = [classicRound('r1', [single])]) {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeRoundsQuiz(rounds, { teams: defaultTeams(2) }), 'u1');
    manager.connect(room, HOST);
    const people = ['Олена', 'Тарас', 'Іра', 'Марко'].map((name) => {
      const joined = manager.join(room.code, name);
      if (!joined.ok) throw new Error('join');
      manager.connect(room, { role: 'player', playerId: joined.playerId });
      return joined;
    });
    return { scheduler, manager, room, people };
  }

  it('a lobby with dice comes back: the same members, teams and throws, people return with their tokens', () => {
    const { scheduler, manager, room, people } = teamLobby();
    manager.host(room, { type: 'team-form', form: 'dice' });
    manager.host(room, { type: 'team-dice' });
    expect(manager.teamRoll(room, people[0].playerId)).toEqual({ ok: true });
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    expect(saved.stateVersion).toBe(GAME_STATE_VERSION);
    expect(isSavedRoom(saved)).toBe(true);

    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.state.teams?.list).toEqual(room.state.teams?.list);
    expect(back.state.teams?.dice).toEqual(room.state.teams?.dice);
    expect(back.state.teams?.members.map((m) => m.id)).toEqual(people.map((p) => p.playerId));
    for (const person of people) expect(next.identify(room.code, 'player', person.token)?.identity.playerId).toBe(person.playerId);
    next.connect(back, { role: 'player', playerId: people[1].playerId });
    expect(next.teamRoll(back, people[1].playerId)).toEqual({ ok: true });
    expect(next.teamRoll(back, people[0].playerId)).toEqual({ ok: false, error: 'not_your_turn' });
  });

  it('a game in the middle of a blitz comes back with the buzzers, and the one who buzzed still answers', () => {
    const { scheduler, manager, room, people } = teamLobby([blitzRound('b1', [text], { check: 'manual' })]);
    const [red, blue] = room.state.teams!.list.map((t) => t.id);
    people.forEach((person, i) => manager.host(room, { type: 'team-assign', memberId: person.playerId, teamId: i < 2 ? red : blue }));
    manager.host(room, { type: 'start' });
    manager.host(room, { type: 'next' });
    const taras = people[1];
    expect(manager.buzz(room, taras.playerId)).toEqual({ ok: true });
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    expect(saved.stateVersion).toBe(GAME_STATE_VERSION);

    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.state.plays[0].buzzers).toEqual({ [red]: taras.playerId });
    expect(back.state.players.map((p) => p.id)).toEqual([red, blue]);
    expect(back.state.teams?.members.every((m) => !m.connected)).toBe(true);
    next.connect(back, HOST);
    for (const person of people) next.connect(back, { role: 'player', playerId: person.playerId });
    expect(next.host(back, { type: 'resume' })).toEqual({ ok: true });
    expect(next.answer(back, taras.playerId, { type: 'text', value: 'Одеса' })).toEqual({ ok: true });
  });

  it('a solo room of state version 9 still comes back', () => {
    const { scheduler, manager, room, taras } = midQuestion();
    const saved = { ...viaJson(manager.snapshot(room)), stateVersion: 9 };
    manager.freeze();
    expect(isSavedRoom(saved)).toBe(true);
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.state.teams).toBeUndefined();
    next.connect(back, HOST);
    next.connect(back, { role: 'player', playerId: taras.playerId });
    expect(next.host(back, { type: 'resume' })).toEqual({ ok: true });
    expect(next.answer(back, taras.playerId, correct)).toEqual({ ok: true });
  });
});

describe('an autopilot room restored after a restart (11g)', () => {
  /** Автопілот на розкритті першого запитання, 2 с з 6: до кроку лишається 4000 мс. */
  function autopilotReveal() {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const created = manager.createAutopilot(makeQuiz([single, text], { leaderboard: 'each' }), 'u1', 'q1', 'Марта');
    if (!created.ok) throw new Error(created.error);
    const { room } = created;
    const taras = manager.join(room.code, 'Тарас');
    if (!taras.ok) throw new Error(taras.error);
    for (const playerId of [created.playerId, taras.playerId]) manager.connect(room, { role: 'player', playerId });
    expect(manager.author(room, created.playerId, { type: 'start' })).toEqual({ ok: true });
    scheduler.advance(8000);
    manager.answer(room, created.playerId, correct);
    manager.answer(room, taras.playerId, correct);
    scheduler.advance(1500);
    expect(room.state.phase).toBe('reveal');
    scheduler.advance(2000);
    expect(room.state.autopilot?.at).toBe(scheduler.now() + 4000);
    return { scheduler, manager, room, author: created, taras };
  }

  it('comes back paused for nobody with the time left, waits 30 min for anyone (not 10 for a host), and goes on 3 s after someone returns', () => {
    const { scheduler, manager, room, taras } = autopilotReveal();
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    expect(isSavedRoom(saved)).toBe(true);

    scheduler.advance(60_000);
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.state.phase).toBe('reveal');
    expect(back.state.paused).toBe(true);
    expect(back.state.autopilot).toMatchObject({ hold: 'nobody', left: 4000, at: null });
    expect(scheduler.pending()).toEqual([AUTOPILOT_EMPTY_MS]);
    expect(next.identify(room.code, 'host', room.hostToken)).toBeNull();
    expect(next.hostOnline(back)).toBe(true);

    next.connect(back, { role: 'player', playerId: taras.playerId });
    expect(scheduler.pending()).toEqual([3000]);
    scheduler.advance(2999);
    expect(back.state.paused).toBe(true);
    scheduler.advance(1);
    expect(back.state.paused).toBe(false);
    scheduler.advance(3999);
    expect(back.state.phase).toBe('reveal');
    scheduler.advance(1);
    expect(back.state.phase).toBe('leaderboard');
  });

  it('ends the game when nobody comes back in 30 minutes', () => {
    const { scheduler, manager, room } = autopilotReveal();
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    scheduler.advance(AUTOPILOT_EMPTY_MS - 1);
    expect(back.state.phase).toBe('reveal');
    scheduler.advance(1);
    expect(back.state.phase).toBe('finished');
  });

  it('an author pause stays an author pause after the restart', () => {
    const { scheduler, manager, room, author } = autopilotReveal();
    expect(manager.author(room, author.playerId, { type: 'pause' })).toEqual({ ok: true });
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.state.autopilot).toMatchObject({ hold: 'author', left: 4000 });
    next.connect(back, { role: 'player', playerId: author.playerId });
    scheduler.advance(10_000);
    expect(back.state.paused).toBe(true);
    expect(next.author(back, author.playerId, { type: 'resume' })).toEqual({ ok: true });
    scheduler.advance(4000);
    expect(back.state.phase).toBe('leaderboard');
  });

  it('a room of state version 13 (no autopilot) comes back hosted: paused, 10 minutes for the host', () => {
    const { scheduler, manager, room, taras } = midQuestion();
    const saved = { ...viaJson(manager.snapshot(room)), stateVersion: 13 };
    manager.freeze();
    expect(isSavedRoom(saved)).toBe(true);
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.state.autopilot).toBeUndefined();
    expect(back.state.paused).toBe(true);
    expect(scheduler.pending()).toEqual([HOST_ABSENCE_MS]);
    next.connect(back, { role: 'player', playerId: taras.playerId });
    expect(back.state.paused).toBe(true);
    expect(next.identify(room.code, 'host', room.hostToken)?.room).toBe(back);
  });
});

describe('own-pace clues across a restart (12c)', () => {
  it('a restored room keeps the clues a player opened, and a reconnecting phone sees them', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeRoundsQuiz([classicRound('r1', [{ ...clues, cluePace: 'self' }])]), 'u1', 'q1');
    manager.connect(room, HOST);
    const olena = manager.join(room.code, 'Олена', 'u2');
    if (!olena.ok) throw new Error('join');
    const identity: Identity = { role: 'player', playerId: olena.playerId };
    manager.connect(room, identity);
    manager.host(room, { type: 'start' });
    manager.host(room, { type: 'next' });
    scheduler.advance(SPLASH_MS.question);
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: true });
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: true });
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    expect(saved.stateVersion).toBe(16);
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    next.connect(back, identity);
    expect(next.view(back, identity)?.question?.clues?.shown).toHaveLength(3);
  });
});
