import { describe, expect, it } from 'vitest';
import { blitzRound, boardRound, chain, classicRound, finalRound, makeQuiz, makeRoundsQuiz, single, text, withId, withVideo } from '@quiz/engine/testing';
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
  expect(ctx.manager.host(ctx.room, { type: 'next' })).toEqual({ ok: true });
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

  it('a video question sets no question timer and closes when both players answered', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeQuiz([withVideo(single)]));
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    const taras = enter(manager, room, 'Тарас');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(scheduler.pending()).toEqual([]);
    scheduler.advance(600_000);
    expect(room.state.phase).toBe('question');
    expect(manager.answer(room, olena.playerId, correct)).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    expect(manager.answer(room, taras.playerId, wrong)).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');
  });

  it('locks the question when the time runs out', () => {
    const { room, scheduler } = playing();
    scheduler.advance(19_999);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('locked');
  });

  it('host time moves the room timer', () => {
    const { manager, room, scheduler } = playing();
    expect(manager.host(room, { type: 'time', seconds: 15 })).toEqual({ ok: true });
    scheduler.advance(34_999);
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

/** Кімната з ведучим і двома гравцями на першому запитанні бліцу. */
function blitzPlaying(options: Parameters<typeof blitzRound>[2] = {}) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(makeRoundsQuiz([blitzRound('b1', [single, text], options)]));
  manager.connect(room, HOST);
  const olena = enter(manager, room, 'Олена');
  const taras = enter(manager, room, 'Тарас');
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  expect(room.state.phase).toBe('question');
  return { scheduler, manager, room, olena, taras };
}

describe('blitz', () => {
  it('a blitz window expiry is scheduled and burns the attempt', () => {
    const { manager, room, scheduler, olena } = blitzPlaying({ check: 'manual', answerWindow: 5, attempts: 2 });
    expect(manager.buzz(room, olena.playerId)).toEqual({ ok: true });
    expect(scheduler.pending()).toEqual([5000]);

    scheduler.advance(4999);
    expect(room.state.plays[0].blitz?.attempts).toEqual([]);
    scheduler.advance(1);
    expect(room.state.plays[0].blitz?.attempts).toMatchObject([{ playerId: olena.playerId, answer: null, grade: 'wrong' }]);
    expect(room.state.plays[0].blitz?.queue).toEqual([]);
    expect(room.state.phase).toBe('question');
    expect(scheduler.pending()).toEqual([15_000]);
  });

  it('host judge goes through the manager', () => {
    const { manager, room, olena } = blitzPlaying({ check: 'manual' });
    expect(manager.buzz(room, olena.playerId)).toEqual({ ok: true });
    expect(manager.answer(room, olena.playerId, wrong)).toEqual({ ok: true });
    expect(manager.host(room, { type: 'judge', playerId: olena.playerId, correct: true })).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');
    expect(room.state.players.find((p) => p.id === olena.playerId)?.score).toBe(1000);
  });

  it('sleeps while a manual head waits for the host and wakes for the next window after the judge', () => {
    const { manager, room, scheduler, olena, taras } = blitzPlaying({ check: 'manual', answerWindow: 5 });
    manager.buzz(room, olena.playerId);
    manager.answer(room, olena.playerId, correct);
    scheduler.advance(1000);
    manager.buzz(room, taras.playerId);
    // Відповідь Олени чекає на ведучого: годинник стоїть, будити кімнату нема для чого.
    expect(scheduler.pending()).toEqual([]);
    scheduler.advance(60_000);
    expect(room.state.plays[0].blitz?.queue).toHaveLength(2);
    expect(room.state.plays[0].blitz?.attempts).toEqual([]);

    // Олену відхилено: вікно Тараса (5 с) іде від цієї миті, таймер запитання — з того самого залишку.
    expect(manager.host(room, { type: 'judge', playerId: olena.playerId, correct: false })).toEqual({ ok: true });
    expect(scheduler.pending()).toEqual([5000]);
    scheduler.advance(5000);
    expect(room.state.plays[0].blitz?.attempts).toMatchObject([
      { playerId: olena.playerId, grade: 'wrong' },
      { playerId: taras.playerId, answer: null, grade: 'wrong' },
    ]);
    expect(room.state.phase).toBe('locked');
  });

  it('a kick of the waiting head starts the next window from the kick', () => {
    const { manager, room, scheduler, olena, taras } = blitzPlaying({ check: 'manual', answerWindow: 5, attempts: 2 });
    manager.buzz(room, olena.playerId);
    manager.answer(room, olena.playerId, correct);
    scheduler.advance(1000);
    manager.buzz(room, taras.playerId);
    scheduler.advance(6000);
    expect(room.state.plays[0].blitz?.attempts).toEqual([]);

    expect(manager.host(room, { type: 'kick', playerId: olena.playerId })).toEqual({ ok: true });
    expect(room.state.heldAt).toBeNull();
    expect(room.state.plays[0].blitz?.queue).toMatchObject([{ playerId: taras.playerId, answer: null }]);
    expect(scheduler.pending()).toEqual([5000]);
    scheduler.advance(5000);
    expect(room.state.plays[0].blitz?.attempts).toMatchObject([{ playerId: taras.playerId, answer: null, grade: 'wrong' }]);
    expect(room.state.phase).toBe('question');
    expect(scheduler.pending()).toEqual([15_000]);
  });

  it('a pending blitz answer stops the window timer until the host decides', () => {
    const { manager, room, scheduler, olena, taras } = blitzPlaying({ check: 'manual', answerWindow: 5, attempts: 2 });
    manager.buzz(room, olena.playerId);
    scheduler.advance(1000);
    expect(manager.answer(room, olena.playerId, wrong)).toEqual({ ok: true });
    expect(scheduler.pending()).toEqual([]);
    expect(manager.buzz(room, taras.playerId)).toEqual({ ok: true });
    scheduler.advance(10 * 60_000);
    expect(room.state.plays[0].blitz?.attempts).toEqual([]);
    expect(room.state.plays[0].blitz?.queue[0]).toMatchObject({ playerId: olena.playerId, answer: wrong });

    expect(manager.host(room, { type: 'judge', playerId: olena.playerId, correct: false })).toEqual({ ok: true });
    expect(room.state.plays[0].blitz?.attempts).toMatchObject([{ playerId: olena.playerId, grade: 'wrong' }]);
    // Тарас натиснув під час утримання: його вікно (5 с) почалося лише зараз.
    expect(scheduler.pending()).toEqual([5000]);
    scheduler.advance(5000);
    expect(room.state.plays[0].blitz?.attempts).toMatchObject([
      { playerId: olena.playerId, grade: 'wrong' },
      { playerId: taras.playerId, answer: null, grade: 'wrong' },
    ]);
    expect(room.state.phase).toBe('question');
    expect(scheduler.pending()).toEqual([14_000]);
  });

  it('does not spin on a window timer that fires a millisecond early', () => {
    const scheduler = new FakeScheduler(1);
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeRoundsQuiz([blitzRound('b1', [single], { check: 'manual', answerWindow: 5 })]));
    const olena = enter(manager, room, 'Олена');
    manager.host(room, { type: 'start' });
    manager.host(room, { type: 'next' });
    manager.buzz(room, olena.playerId);
    manager.answer(room, olena.playerId, correct);

    scheduler.advance(20_000);
    expect(room.state.phase).toBe('question');
    expect(scheduler.pending()).toEqual([]);
  });
});

describe('word chain', () => {
  it('closes a chain question at the personal deadline of the last player still playing', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeQuiz([chain]));
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    const taras = enter(manager, room, 'Тарас');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });

    for (const word of ['Риба', 'Океан', 'Корабель']) expect(manager.guess(room, olena.playerId, word)).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    scheduler.advance(1000);
    expect(manager.hint(room, taras.playerId)).toEqual({ ok: true });
    expect(manager.hint(room, taras.playerId)).toEqual({ ok: true });
    scheduler.advance(8999);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('locked');
  });

  it('refuses a guess and a hint from someone who is not a player', () => {
    const { manager, room } = setup();
    expect(manager.guess(room, 'nobody', 'Риба')).toMatchObject({ ok: false });
    expect(manager.hint(room, 'nobody')).toMatchObject({ ok: false });
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
    manager.host(room, { type: 'next' });

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

describe('board rounds', () => {
  const cell = (id: string, points: number) => ({ ...withId(single, id), points });
  const field = () =>
    makeRoundsQuiz([
      boardRound('g1', [
        { title: 'Міста', cells: [cell('c11', 100), cell('c12', 200)] },
        { title: 'Річки', cells: [cell('c21', 100), cell('c22', 200)] },
      ]),
    ]);

  /** Кімната з ведучим і двома гравцями, що чекає на заставці раунду поля. */
  function boardRoom() {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(field());
    manager.connect(room, HOST);
    const anna = enter(manager, room, 'Анна');
    const bohdan = enter(manager, room, 'Богдан');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    return { scheduler, manager, room, anna, bohdan };
  }

  it('an absent chooser is skipped by the room timer after thirty seconds', () => {
    const { scheduler, manager, room, anna, bohdan } = boardRoom();
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('board');
    manager.disconnect(room, anna.identity);
    expect(scheduler.pending()).toEqual([30_000]);
    scheduler.advance(30_000);
    expect(room.state.phase).toBe('board');
    expect(manager.pick(room, anna.playerId, 'c11')).toEqual({ ok: false, error: 'not_your_turn' });
    expect(manager.pick(room, bohdan.playerId, 'c11')).toEqual({ ok: true });
  });

  it('an absent answerer closes an untimed board cell after 30 s through the room timer', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(
      makeRoundsQuiz([
        boardRound('g1', [
          { title: 'Міста', cells: [{ ...withVideo(withId(single, 'c11')), points: 100 }, cell('c12', 200)] },
          { title: 'Річки', cells: [cell('c21', 100), cell('c22', 200)] },
        ]),
      ]),
    );
    manager.connect(room, HOST);
    const anna = enter(manager, room, 'Анна');
    enter(manager, room, 'Богдан');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.pick(room, anna.playerId, 'c11')).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    manager.disconnect(room, anna.identity);
    scheduler.advance(29_999);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('locked');
  });

  it('a paused room keeps the absent chooser turn', () => {
    const { scheduler, manager, room, anna, bohdan } = boardRoom();
    manager.host(room, { type: 'next' });
    manager.disconnect(room, anna.identity);
    expect(manager.host(room, { type: 'pause' })).toEqual({ ok: true });
    expect(scheduler.pending()).toEqual([]);
    scheduler.advance(10 * 60_000);
    expect(manager.host(room, { type: 'resume' })).toEqual({ ok: true });
    expect(scheduler.pending()).toEqual([30_000]);
    scheduler.advance(30_000);
    expect(manager.pick(room, bohdan.playerId, 'c11')).toEqual({ ok: true });
  });

  it('board actions go through the manager', () => {
    const { manager, room, anna, bohdan } = boardRoom();
    expect(manager.host(room, { type: 'roll' })).toEqual({ ok: true });
    expect(room.state.board?.rolls).toBe(1);
    expect(manager.host(room, { type: 'order', playerIds: [bohdan.playerId, anna.playerId] })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.pick(room, anna.playerId, 'c11')).toEqual({ ok: false, error: 'not_your_turn' });
    expect(manager.pick(room, bohdan.playerId, 'c11')).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    expect(manager.host(room, { type: 'lock' })).toEqual({ ok: true });
    while (room.state.phase !== 'board') expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'skip' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'pick', cellId: 'c21' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
  });

  it('a blitz cell runs through the room: an answer from any player, accept, close', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(
      makeRoundsQuiz([boardRound('g1', [{ title: 'Міста', cells: [{ question: cell('c11', 100), kind: 'blitz' }, cell('c12', 200)] }])]),
    );
    manager.connect(room, HOST);
    const anna = enter(manager, room, 'Анна');
    const bohdan = enter(manager, room, 'Богдан');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.pick(room, anna.playerId, 'c11')).toEqual({ ok: true });
    expect(manager.answer(room, bohdan.playerId, { type: 'single', optionId: 'b' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'accept', playerId: bohdan.playerId })).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');
    expect(room.state.players.find((p) => p.id === bohdan.playerId)?.score).toBe(100);
  });

  it('a pending board answer stops the room timer until the host re-picks', () => {
    const { scheduler, manager, room, anna } = boardRoom();
    manager.host(room, { type: 'next' });
    expect(manager.pick(room, anna.playerId, 'c12')).toEqual({ ok: true });
    scheduler.advance(5000);
    expect(manager.answer(room, anna.playerId, { type: 'single', optionId: 'a' })).toEqual({ ok: true });
    scheduler.advance(10 * 60_000);
    expect(room.state.phase).toBe('question');
    expect(manager.host(room, { type: 'repick', playerId: anna.playerId })).toEqual({ ok: true });
    scheduler.advance(14_999);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('locked');
  });

  it('host accept goes through the manager', () => {
    const { manager, room, anna } = boardRoom();
    manager.host(room, { type: 'next' });
    manager.pick(room, anna.playerId, 'c12');
    expect(manager.host(room, { type: 'accept', playerId: anna.playerId })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(manager.answer(room, anna.playerId, { type: 'single', optionId: 'b' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'accept', playerId: 'someone-else' })).toEqual({ ok: false, error: 'not_found' });
    expect(manager.host(room, { type: 'accept', playerId: anna.playerId })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');
    expect(room.state.players.find((p) => p.id === anna.playerId)?.score).toBe(200);
  });
  it('final wagers go through the manager and open the question when everyone placed', () => {
    const { manager } = setup();
    const quiz = makeRoundsQuiz([classicRound('r1', [single]), finalRound('f', withId(single, 'f1'))]);
    const own = manager.create(quiz);
    manager.connect(own, HOST);
    const a = enter(manager, own, 'Олена');
    const b = enter(manager, own, 'Тарас');
    expect(manager.wager(own, a.playerId, 0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(manager.host(own, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(own, { type: 'next' })).toEqual({ ok: true });
    manager.answer(own, a.playerId, correct);
    manager.answer(own, b.playerId, correct);
    for (let i = 0; i < 4; i++) expect(manager.host(own, { type: 'next' })).toEqual({ ok: true });
    expect(own.state.phase).toBe('wager');
    expect(manager.wager(own, a.playerId, 0)).toEqual({ ok: true });
    expect(own.state.phase).toBe('wager');
    expect(manager.wager(own, b.playerId, 0)).toEqual({ ok: true });
    expect(own.state.phase).toBe('question');
    expect(manager.wager(own, a.playerId, 5)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});
