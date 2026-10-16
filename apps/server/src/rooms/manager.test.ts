import { describe, expect, it } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import { FakeScheduler } from '../testing/fake-scheduler';
import {
  FINISHED_TTL_MS,
  HOST_ABSENCE_MS,
  LOBBY_TTL_MS,
  RoomManager,
  type Identity,
  type Room,
  type RoomEvent,
} from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

function setup() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(makeQuiz([single, text]));
  const events: RoomEvent[] = [];
  manager.onEvent((_room, event) => events.push(event));
  return { scheduler, manager, room, events };
}

/** Гравець, що увійшов і відкрив одне з'єднання. */
function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { ...joined, identity };
}

/** Кімната з ведучим і двома гравцями на першому запитанні. */
function playing() {
  const ctx = setup();
  ctx.manager.connect(ctx.room, HOST);
  const olena = enter(ctx.manager, ctx.room, 'Олена');
  const taras = enter(ctx.manager, ctx.room, 'Тарас');
  expect(ctx.manager.host(ctx.room, { type: 'start' })).toEqual({ ok: true });
  return { ...ctx, olena, taras };
}

describe('rooms', () => {
  it('creates a room with a six-digit code and separate tokens', () => {
    const { manager, room } = setup();
    expect(room.code).toMatch(/^\d{6}$/);
    expect(room.hostToken).not.toBe(room.stageToken);
    expect(manager.get(room.code)).toBe(room);
    expect(room.state.phase).toBe('lobby');
  });

  it('gives every room its own code', () => {
    const { manager } = setup();
    const codes = Array.from({ length: 50 }, () => manager.create(makeQuiz([single])).code);
    expect(new Set(codes).size).toBe(50);
  });

  it('identifies host, stage and player by their tokens', () => {
    const { manager, room } = setup();
    const joined = manager.join(room.code, 'Олена');
    if (!joined.ok) throw new Error(joined.error);

    expect(manager.identify(room.code, 'host', room.hostToken)?.identity).toEqual(HOST);
    expect(manager.identify(room.code, 'stage', room.stageToken)?.identity).toEqual({ role: 'stage', playerId: null });
    expect(manager.identify(room.code, 'player', joined.token)?.identity).toEqual({
      role: 'player',
      playerId: joined.playerId,
    });
  });

  it('rejects a wrong token, a token of another role and an unknown code', () => {
    const { manager, room } = setup();
    expect(manager.identify(room.code, 'host', 'nope')).toBeNull();
    expect(manager.identify(room.code, 'host', room.stageToken)).toBeNull();
    expect(manager.identify(room.code, 'player', room.hostToken)).toBeNull();
    expect(manager.identify('000000x', 'host', room.hostToken)).toBeNull();
  });
});

describe('joining', () => {
  it('reports an unknown code and a taken nickname', () => {
    const { manager, room } = setup();
    expect(manager.join('nope', 'Олена')).toEqual({ ok: false, error: 'game_not_found' });
    manager.join(room.code, 'Олена');
    expect(manager.join(room.code, ' олена ')).toEqual({ ok: false, error: 'nickname_taken' });
  });

  it('keeps a player disconnected until a connection opens', () => {
    const { manager, room } = setup();
    const joined = manager.join(room.code, 'Олена');
    if (!joined.ok) throw new Error(joined.error);
    expect(room.state.players[0].connected).toBe(false);

    manager.connect(room, { role: 'player', playerId: joined.playerId });
    expect(room.state.players[0].connected).toBe(true);
  });

  it('keeps a player connected while any of their tabs is open', () => {
    const { manager, room } = setup();
    const { identity } = enter(manager, room, 'Олена');
    manager.connect(room, identity);

    manager.disconnect(room, identity);
    expect(room.state.players[0].connected).toBe(true);

    manager.disconnect(room, identity);
    expect(room.state.players[0].connected).toBe(false);
  });
});

describe('views', () => {
  it('builds the view that matches the identity', () => {
    const { manager, room } = setup();
    const { identity } = enter(manager, room, 'Олена');
    expect(manager.view(room, HOST)?.role).toBe('host');
    expect(manager.view(room, { role: 'stage', playerId: null })?.role).toBe('stage');
    expect(manager.view(room, identity)?.role).toBe('player');
    expect(manager.view(room, { role: 'player', playerId: 'ghost' })).toBeNull();
  });
});

describe('playing', () => {
  it('starts the game and notifies listeners', () => {
    const { room, events } = playing();
    expect(room.state.phase).toBe('question');
    expect(events.at(-1)).toEqual({ type: 'changed' });
  });

  it('passes engine errors through', () => {
    const { manager, room } = playing();
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('locks the question when both players have answered', () => {
    const { manager, room, scheduler, olena, taras } = playing();
    scheduler.advance(10_000);
    expect(manager.answer(room, olena.playerId, correct)).toEqual({ ok: true });
    expect(manager.answer(room, taras.playerId, wrong)).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');
    expect(room.state.players.map((p) => p.score)).toEqual([750, 0]);
  });

  it('locks the question when the time runs out', () => {
    const { room, scheduler } = playing();
    scheduler.advance(19_999);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('locked');
  });

  it('stops the timer on pause and continues with the same remaining time', () => {
    const { manager, room, scheduler } = playing();
    scheduler.advance(5000);
    manager.host(room, { type: 'pause' });
    scheduler.advance(60_000);
    expect(room.state.phase).toBe('question');

    manager.host(room, { type: 'resume' });
    scheduler.advance(14_999);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('locked');
  });

  it('lets the host accept a rejected answer on reveal', () => {
    const { manager, room, olena, taras } = playing();
    manager.answer(room, olena.playerId, correct);
    manager.answer(room, taras.playerId, wrong);
    manager.host(room, { type: 'next' });
    expect(manager.host(room, { type: 'override', playerId: taras.playerId, grade: 'correct' })).toEqual({ ok: true });
    expect(room.state.players[1].score).toBe(1000);
  });

  it('ends the round on an open question: given answers count, late ones and the timer do not', () => {
    const { manager, room, scheduler, olena, taras } = playing();
    manager.answer(room, olena.playerId, correct);
    expect(manager.host(room, { type: 'end-round' })).toEqual({ ok: true });
    // Раунд у вікторині один, тож гра закінчується.
    expect(room.state.phase).toBe('finished');
    expect(room.state.players[0].score).toBe(1000);
    expect(manager.answer(room, taras.playerId, correct)).toEqual({ ok: false, error: 'wrong_phase' });
    scheduler.advance(60_000);
    expect(room.state.phase).toBe('finished');
  });
});

describe('host absence', () => {
  it('pauses the game with the remaining time when the host connection drops', () => {
    const { manager, room, scheduler } = playing();
    scheduler.advance(5000);
    manager.disconnect(room, HOST);
    expect(room.state.paused).toBe(true);
    expect(room.state.remainingMs).toBe(15_000);

    scheduler.advance(60_000);
    expect(room.state.phase).toBe('question');
  });

  it('ends the game after ten minutes without the host', () => {
    const { manager, room, scheduler } = playing();
    manager.disconnect(room, HOST);
    scheduler.advance(HOST_ABSENCE_MS - 1);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('finished');
  });

  it('keeps the game paused and alive when the host returns in time', () => {
    const { manager, room, scheduler } = playing();
    manager.disconnect(room, HOST);
    scheduler.advance(60_000);
    manager.connect(room, HOST);
    scheduler.advance(HOST_ABSENCE_MS);
    expect(room.state.phase).toBe('question');
    expect(room.state.paused).toBe(true);
    expect(manager.host(room, { type: 'resume' })).toEqual({ ok: true });
  });

  it('does not pause while the host still has another connection', () => {
    const { manager, room } = playing();
    manager.connect(room, HOST);
    manager.disconnect(room, HOST);
    expect(room.state.paused).toBe(false);
  });

  it('does not pause a lobby', () => {
    const { manager, room } = setup();
    manager.connect(room, HOST);
    manager.disconnect(room, HOST);
    expect(room.state.paused).toBe(false);
  });
});

describe('kicking', () => {
  it('removes the player, revokes the token and announces it', () => {
    const { manager, room, events, olena } = playing();
    expect(manager.host(room, { type: 'kick', playerId: olena.playerId })).toEqual({ ok: true });
    expect(room.state.players.map((p) => p.nickname)).toEqual(['Тарас']);
    expect(manager.identify(room.code, 'player', olena.token)).toBeNull();
    expect(events).toContainEqual({ type: 'kicked', playerId: olena.playerId });
  });

  it('ignores the late disconnect of a kicked player', () => {
    const { manager, room, olena } = playing();
    manager.host(room, { type: 'kick', playerId: olena.playerId });
    expect(() => manager.disconnect(room, olena.identity)).not.toThrow();
  });

  it('is refused once the game has finished', () => {
    const { manager, room, olena } = playing();
    manager.host(room, { type: 'end' });
    expect(manager.host(room, { type: 'kick', playerId: olena.playerId })).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('expiry', () => {
  it('closes a lobby that was not started within two hours', () => {
    const { manager, room, scheduler, events } = setup();
    scheduler.advance(LOBBY_TTL_MS - 1);
    expect(manager.get(room.code)).toBe(room);
    scheduler.advance(1);
    expect(manager.get(room.code)).toBeUndefined();
    expect(events.at(-1)).toEqual({ type: 'closed' });
  });

  it('does not close a game that is running', () => {
    const { manager, room, scheduler } = playing();
    manager.host(room, { type: 'pause' });
    scheduler.advance(LOBBY_TTL_MS * 2);
    expect(manager.get(room.code)).toBe(room);
  });

  it('closes a finished room after thirty minutes', () => {
    const { manager, room, scheduler } = playing();
    manager.host(room, { type: 'end' });
    scheduler.advance(FINISHED_TTL_MS - 1);
    expect(manager.get(room.code)).toBe(room);
    scheduler.advance(1);
    expect(manager.get(room.code)).toBeUndefined();
  });

  it('refuses actions on a closed room and does not revive its timers', () => {
    const { manager, room, scheduler, olena } = playing();
    manager.host(room, { type: 'end' });
    scheduler.advance(FINISHED_TTL_MS);
    const phase = room.state.phase;

    expect(manager.host(room, { type: 'start' })).toEqual({ ok: false, error: 'game_not_found' });
    expect(manager.answer(room, olena.playerId, correct)).toEqual({ ok: false, error: 'game_not_found' });
    manager.disconnect(room, HOST);
    scheduler.advance(HOST_ABSENCE_MS * 2);
    expect(room.state.phase).toBe(phase);
    expect(room.state.paused).toBe(false);
  });
});

describe('timer drift', () => {
  it('locks the question even when the timer fires a millisecond early', () => {
    const scheduler = new FakeScheduler(1);
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeQuiz([single]));
    enter(manager, room, 'Олена');
    manager.host(room, { type: 'start' });

    scheduler.advance(20_000);
    expect(room.state.phase).toBe('locked');
  });
});

describe('host presence', () => {
  it('reports whether the host has an open connection and announces changes', () => {
    const { manager, room, events } = setup();
    expect(manager.hostOnline(room)).toBe(false);

    manager.connect(room, HOST);
    expect(manager.hostOnline(room)).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'changed' });

    events.length = 0;
    manager.disconnect(room, HOST);
    expect(manager.hostOnline(room)).toBe(false);
    expect(events).toContainEqual({ type: 'changed' });
  });
});

describe('accounts behind a room', () => {
  it('remembers the quiz and the host account a room was created from', () => {
    const { manager } = setup();
    const room = manager.create(makeQuiz([single]), 'host-user', 'quiz-1');
    expect([room.hostUserId, room.quizId]).toEqual(['host-user', 'quiz-1']);
    expect(manager.create(makeQuiz([single])).quizId).toBeNull();
  });

  it('links a player to an account when they join signed in, and forgets it when they are kicked', () => {
    const { manager, room } = setup();
    const signedIn = manager.join(room.code, 'Олена', 'user-1');
    const anonymous = manager.join(room.code, 'Тарас');
    if (!signedIn.ok || !anonymous.ok) throw new Error('join failed');
    expect([...room.playerUsers]).toEqual([[signedIn.playerId, 'user-1']]);

    manager.host(room, { type: 'kick', playerId: signedIn.playerId });
    expect(room.playerUsers.size).toBe(0);
  });
});
