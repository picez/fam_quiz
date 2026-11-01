import { describe, expect, it } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import { GAME_STATE_VERSION } from '@quiz/engine';
import type { Quiz } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import type { SavedGameData } from './continuation';
import { AUTOPILOT_EMPTY_MS, HOST_ABSENCE_MS, RoomManager, type Identity, type Room, type RoomEvent, type SavedRoom } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const quiz = (): Quiz => makeQuiz([single, text, single]);

/** Ведучий 'u1' на пульті, Олена ('u2') і Тарас (гість) на зв'язку, лобі. */
function setup(hostUserId: string | null = 'u1') {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(quiz(), hostUserId, null);
  const events: RoomEvent[] = [];
  manager.onEvent((_room, event) => events.push(event));
  manager.connect(room, HOST);
  const enter = (nickname: string, userId: string | null) => {
    const joined = manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    const identity: Identity = { role: 'player', playerId: joined.playerId };
    manager.connect(room, identity);
    return { ...joined, identity };
  };
  const olena = enter('Олена', 'u2');
  const taras = enter('Тарас', null);
  const host = (action: Parameters<RoomManager['host']>[1]) => expect(manager.host(room, action)).toEqual({ ok: true });
  return { scheduler, manager, room, events, olena, taras, host };
}

type Ctx = ReturnType<typeof setup>;

/** Запитання 1 зіграно: розкриття, потім таблиця. */
function toLeaderboard(ctx: Ctx) {
  ctx.host({ type: 'start' });
  ctx.host({ type: 'next' });
  ctx.manager.answer(ctx.room, ctx.olena.playerId, correct);
  ctx.manager.answer(ctx.room, ctx.taras.playerId, wrong);
  expect(ctx.room.state.phase).toBe('locked');
  ctx.host({ type: 'next' });
  expect(ctx.room.state.phase).toBe('reveal');
  ctx.host({ type: 'next' });
  expect(ctx.room.state.phase).toBe('leaderboard');
}

const closedEvents = (events: RoomEvent[]) => events.filter((e): e is Extract<RoomEvent, { type: 'closed' }> => e.type === 'closed');
const savedOf = (events: RoomEvent[]): SavedGameData => {
  const last = events.at(-1);
  if (last?.type !== 'closed' || last.saved === undefined) throw new Error(`last event is ${JSON.stringify(last?.type)}, not closed with saved`);
  return last.saved;
};

describe('the checkpoint (13b)', () => {
  it('follows every rest point between questions and stays put during a question', () => {
    const ctx = setup();
    const { room } = ctx;
    expect(room.checkpoint).toBeNull();
    ctx.host({ type: 'start' });
    expect(room.checkpoint?.state.phase).toBe('intro');
    const intro = room.checkpoint;
    ctx.host({ type: 'next' });
    expect(room.state.phase).toBe('question');
    expect(room.checkpoint).toBe(intro);
    ctx.manager.answer(room, ctx.olena.playerId, correct);
    ctx.host({ type: 'lock' });
    expect(room.checkpoint).toBe(intro);
    ctx.host({ type: 'next' });
    expect(room.checkpoint?.state.phase).toBe('reveal');
    ctx.scheduler.advance(5000);
    ctx.host({ type: 'next' });
    expect(room.checkpoint?.state.phase).toBe('leaderboard');
    const at = ctx.scheduler.now();
    expect(room.checkpoint?.at).toBe(at);
    ctx.scheduler.advance(3000);
    ctx.host({ type: 'next' });
    expect(room.state.phase).toBe('question');
    expect(room.state.questionIndex).toBe(1);
    expect(room.checkpoint?.state.phase).toBe('leaderboard');
    expect(room.checkpoint?.at).toBe(at);
  });
});

describe('«save and continue later» by hand (13b)', () => {
  it('in the middle of question 2 saves the leaderboard after question 1 and closes the room', () => {
    const ctx = setup();
    const { room, manager, events } = ctx;
    toLeaderboard(ctx);
    ctx.host({ type: 'next' });
    expect(room.state.questionIndex).toBe(1);
    expect(manager.answer(room, ctx.olena.playerId, { type: 'text', value: 'Київ' })).toEqual({ ok: true });
    ctx.host({ type: 'adjust', playerId: ctx.taras.playerId, points: 50 });

    expect(manager.host(room, { type: 'save' })).toEqual({ ok: true });
    expect(manager.get(room.code)).toBeUndefined();
    const saved = savedOf(events);
    expect(saved.state.phase).toBe('leaderboard');
    expect(saved.state.questionIndex).toBe(0);
    expect(saved.state.plays).toHaveLength(1);
    expect(saved.state.plays[1]).toBeUndefined();
    expect(saved.state.adjustments).toEqual([]);
    expect(saved.stateVersion).toBe(GAME_STATE_VERSION);
    expect(saved.playerUsers).toEqual([[ctx.olena.playerId, 'u2']]);
    expect(saved.quizId).toBeNull();
    expect(saved.at).toBe(room.checkpoint?.at);
    // Після закриття — жодного таймера й жодної дії.
    expect(ctx.scheduler.pending()).toEqual([]);
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: false, error: 'game_not_found' });
  });

  it('is refused in the lobby, after the finish and without a host account', () => {
    const lobby = setup();
    expect(lobby.manager.host(lobby.room, { type: 'save' })).toEqual({ ok: false, error: 'wrong_phase' });

    const finished = setup();
    toLeaderboard(finished);
    finished.host({ type: 'end' });
    expect(finished.room.state.phase).toBe('finished');
    expect(finished.manager.host(finished.room, { type: 'save' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(finished.manager.get(finished.room.code)).toBe(finished.room);

    const guest = setup(null);
    toLeaderboard(guest);
    expect(guest.manager.host(guest.room, { type: 'save' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(guest.manager.get(guest.room.code)).toBe(guest.room);
    expect(closedEvents(guest.events)).toEqual([]);
  });

  it('on the intro of round one (before any question) is allowed', () => {
    const ctx = setup();
    ctx.host({ type: 'start' });
    expect(ctx.manager.host(ctx.room, { type: 'save' })).toEqual({ ok: true });
    expect(savedOf(ctx.events).state.phase).toBe('intro');
  });
});

describe('ten minutes without the host (13b)', () => {
  it('save a game that reached a question instead of ending it', () => {
    const ctx = setup();
    toLeaderboard(ctx);
    ctx.host({ type: 'next' });
    ctx.manager.disconnect(ctx.room, HOST);
    ctx.scheduler.advance(HOST_ABSENCE_MS - 1);
    expect(ctx.manager.get(ctx.room.code)).toBe(ctx.room);
    ctx.scheduler.advance(1);
    expect(ctx.manager.get(ctx.room.code)).toBeUndefined();
    expect(savedOf(ctx.events).state.phase).toBe('leaderboard');
    expect(ctx.room.state.phase).not.toBe('finished');
  });

  it('still end the game without a host account', () => {
    const ctx = setup(null);
    toLeaderboard(ctx);
    ctx.host({ type: 'next' });
    ctx.manager.disconnect(ctx.room, HOST);
    ctx.scheduler.advance(HOST_ABSENCE_MS);
    expect(ctx.room.state.phase).toBe('finished');
    expect(ctx.manager.get(ctx.room.code)).toBe(ctx.room);
  });

  it('still end the game on the intro before the first question', () => {
    const ctx = setup();
    ctx.host({ type: 'start' });
    ctx.manager.disconnect(ctx.room, HOST);
    ctx.scheduler.advance(HOST_ABSENCE_MS);
    expect(ctx.room.state.phase).toBe('finished');
    expect(closedEvents(ctx.events)).toEqual([]);
  });
});

/** Автопілот: автор Марта ('u1') і Тарас (гість) на зв'язку, таблиця після кожного запитання. */
function autopilot() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const created = manager.createAutopilot(makeQuiz([single, text, single], { leaderboard: 'each' }), 'u1', 'q1', 'Марта');
  if (!created.ok) throw new Error(created.error);
  const { room } = created;
  const events: RoomEvent[] = [];
  manager.onEvent((_room, event) => events.push(event));
  const author: Identity = { role: 'player', playerId: created.playerId };
  manager.connect(room, author);
  const joined = manager.join(room.code, 'Тарас');
  if (!joined.ok) throw new Error(joined.error);
  const taras: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, taras);
  expect(manager.author(room, created.playerId, { type: 'start' })).toEqual({ ok: true });
  return { scheduler, manager, room, events, author, taras, authorId: created.playerId, tarasId: joined.playerId };
}

/** Автопілот на запитанні 2: запитання 1 відповіли й автопілот провів розкриття й таблицю. */
function botAtQuestion2() {
  const ctx = autopilot();
  const { scheduler, room, manager } = ctx;
  for (let i = 0; i < 100 && room.state.phase !== 'question'; i++) scheduler.advance(500);
  expect(room.state.questionIndex).toBe(0);
  manager.answer(room, ctx.authorId, correct);
  manager.answer(room, ctx.tarasId, correct);
  for (let i = 0; i < 200 && !(room.state.phase === 'question' && room.state.questionIndex === 1); i++) scheduler.advance(500);
  expect(room.state.phase).toBe('question');
  expect(room.state.questionIndex).toBe(1);
  return ctx;
}

describe('a bot game (13b)', () => {
  it('a bot game keeps running when the author is away for 10 minutes while others stay connected', () => {
    const ctx = autopilot();
    const { scheduler, room, manager } = ctx;
    for (let i = 0; i < 100 && room.state.phase !== 'question'; i++) scheduler.advance(500);
    expect(manager.author(room, ctx.authorId, { type: 'pause' })).toEqual({ ok: true });
    manager.disconnect(room, ctx.author);
    scheduler.advance(HOST_ABSENCE_MS - 1);
    expect(room.state.paused).toBe(true);
    scheduler.advance(1);
    expect(manager.get(room.code)).toBe(room);
    expect(room.state.paused).toBe(false);
    const phase = room.state.phase;
    expect(phase).toBe('question');
    // Автопілот веде далі: запитання спливає, далі розкриття.
    scheduler.advance(60_000);
    expect(manager.get(room.code)).toBe(room);
    expect(closedEvents(ctx.events)).toEqual([]);
    expect(room.state.phase).not.toBe(phase);
  });

  it('a bot game with nobody connected for 30 minutes is saved and closed', () => {
    const ctx = botAtQuestion2();
    const { scheduler, room, manager } = ctx;
    manager.disconnect(room, ctx.author);
    manager.disconnect(room, ctx.taras);
    scheduler.advance(HOST_ABSENCE_MS);
    expect(manager.get(room.code)).toBe(room);
    scheduler.advance(AUTOPILOT_EMPTY_MS - HOST_ABSENCE_MS - 1);
    expect(manager.get(room.code)).toBe(room);
    expect(closedEvents(ctx.events)).toEqual([]);
    scheduler.advance(1);
    expect(manager.get(room.code)).toBeUndefined();
    const saved = savedOf(ctx.events);
    expect(saved.state.questionIndex).toBe(0);
    expect(saved.state.phase).toBe('leaderboard');
    expect(saved.playerUsers).toEqual([[ctx.authorId, 'u1']]);

    const back = botAtQuestion2();
    back.manager.disconnect(back.room, back.author);
    back.manager.disconnect(back.room, back.taras);
    back.scheduler.advance(AUTOPILOT_EMPTY_MS - 1);
    back.manager.connect(back.room, back.taras);
    expect(back.scheduler.pending()).not.toContain(1);
    back.scheduler.advance(AUTOPILOT_EMPTY_MS);
    expect(back.manager.get(back.room.code)).toBe(back.room);
    expect(closedEvents(back.events)).toEqual([]);
  });

  it('the author can save; another player cannot', () => {
    const ctx = botAtQuestion2();
    expect(ctx.manager.author(ctx.room, ctx.tarasId, { type: 'save' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(ctx.manager.get(ctx.room.code)).toBe(ctx.room);
    expect(ctx.manager.author(ctx.room, ctx.authorId, { type: 'save' })).toEqual({ ok: true });
    expect(ctx.manager.get(ctx.room.code)).toBeUndefined();
    expect(savedOf(ctx.events).state.questionIndex).toBe(0);
  });
});

describe('the checkpoint across a restart (13b)', () => {
  it('goes into the snapshot and comes back; an old row without it comes back with none', () => {
    const ctx = setup();
    toLeaderboard(ctx);
    ctx.host({ type: 'next' });
    const saved = viaJson(ctx.manager.snapshot(ctx.room));
    expect(saved.checkpoint?.state.phase).toBe('leaderboard');
    ctx.manager.freeze();

    const next = new RoomManager(ctx.scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.checkpoint?.state.phase).toBe('leaderboard');
    expect(back.checkpoint?.state.questionIndex).toBe(0);
    next.freeze();

    const { checkpoint: _dropped, ...old } = saved;
    const third = new RoomManager(ctx.scheduler, () => 0.5);
    const oldBack = third.restore(old as SavedRoom) as Room;
    expect(oldBack.checkpoint).toBeNull();
    third.freeze();

    // Зламане поле не піднімається.
    const fourth = new RoomManager(ctx.scheduler, () => 0.5);
    const broken = fourth.restore({ ...old, checkpoint: { state: {}, at: 'x' } } as unknown as SavedRoom) as Room;
    expect(broken.checkpoint).toBeNull();
  });

  it('a room without a checkpoint writes none into the snapshot', () => {
    const ctx = setup();
    expect('checkpoint' in ctx.manager.snapshot(ctx.room)).toBe(false);
  });
});
