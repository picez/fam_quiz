import { describe, expect, it } from 'vitest';
import { blitzRound, boardRound, bool, chain, classicRound, clues, duels, finalRound, makeQuiz, makeRoundsQuiz, poll, single, sortQ, text, withId, withVideo, survivalQuestions, survivalRound, survivalTrials, wipeoutLadder, wipeoutRound, ladderRound } from '@quiz/engine/testing';
import { sortOf } from '@quiz/engine';
import { defaultTeams } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { TRIAL_RIGHT, playSurvivalQuestion } from '../testing/survival-game';
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

describe('clues', () => {
  function cluesPlaying(early = 0) {
    const scheduler = new FakeScheduler(early);
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeRoundsQuiz([classicRound('r1', [clues])]));
    const events: RoomEvent[] = [];
    manager.onEvent((_room, event) => events.push(event));
    manager.connect(room, HOST);
    enter(manager, room, 'Олена');
    enter(manager, room, 'Тарас');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    return { scheduler, manager, room, events };
  }
  const opened = (room: Room) => room.state.plays[room.state.questionIndex].clues;

  it('a clue opens on time and the room pushes it', () => {
    const { scheduler, room, events } = cluesPlaying();
    expect(opened(room)).toBe(1);
    events.length = 0;
    scheduler.advance(5000);
    expect(opened(room)).toBe(2);
    expect(events.some((event) => event.type === 'changed')).toBe(true);
    scheduler.advance(5000);
    expect(opened(room)).toBe(3);
    expect(room.state.phase).toBe('question');
  });

  it('an early timer still opens the clue', () => {
    const { scheduler, room } = cluesPlaying(5);
    scheduler.advance(5000);
    expect(opened(room)).toBe(2);
    scheduler.advance(5000);
    expect(opened(room)).toBe(3);
  });
});

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

describe('sorting', () => {
  it('closes the question when both players have sorted every word', () => {
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const room = manager.create(makeQuiz([sortQ]));
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    const taras = enter(manager, room, 'Тарас');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    const sortAll = (playerId: string) => {
      for (let queue = sortOf(room.state, playerId).queue; queue.length > 0; queue = sortOf(room.state, playerId).queue) {
        const word = sortQ.words.find((w) => w.id === queue[0]);
        expect(manager.sort(room, playerId, queue[0], word?.categoryId ?? '')).toEqual({ ok: true });
      }
    };
    sortAll(olena.playerId);
    expect(room.state.phase).toBe('question');
    sortAll(taras.playerId);
    expect(room.state.phase).toBe('locked');
  });

  it('refuses a move from someone who is not a player', () => {
    const { manager, room } = setup();
    expect(manager.sort(room, 'nobody', 'w1', 'c1')).toMatchObject({ ok: false });
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

describe('transition splashes', () => {
  function splashed() {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5, { transitions: true });
    const room = manager.create(makeQuiz([single, text]));
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    return { scheduler, manager, room, olena };
  }

  it('the manager runs splashes only when asked', () => {
    const { scheduler, manager, room, olena } = splashed();
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(room.state.splash?.kind).toBe('round');
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.splash?.kind).toBe('question');
    expect(manager.answer(room, olena.playerId, correct)).toEqual({ ok: false, error: 'not_started' });
    scheduler.advance(1200);
    expect(manager.answer(room, olena.playerId, correct)).toEqual({ ok: true });
    expect(room.state.plays[0]?.answers[olena.playerId]?.timeMs).toBe(0);

    // Без опції заставок немає, і відповідь приймається одразу.
    const plain = playing();
    expect(plain.room.state.splash).toBeNull();
    expect(plain.manager.answer(plain.room, plain.olena.playerId, correct)).toEqual({ ok: true });
  });

  it('closes the question a full limit after the splash', () => {
    const { scheduler, manager, room } = splashed();
    manager.host(room, { type: 'start' });
    manager.host(room, { type: 'next' });
    scheduler.advance(1200 + 20_000 - 1);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('locked');
  });

  it('a host end and the host absence show «Підсумки»', () => {
    const { scheduler, manager, room } = splashed();
    manager.host(room, { type: 'start' });
    manager.host(room, { type: 'next' });
    expect(manager.host(room, { type: 'end' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('finished');
    expect(room.state.splash?.kind).toBe('podium');

    const gone = splashed();
    gone.manager.host(gone.room, { type: 'start' });
    gone.manager.disconnect(gone.room, HOST);
    gone.scheduler.advance(HOST_ABSENCE_MS);
    expect(gone.room.state.phase).toBe('finished');
    expect(gone.room.state.splash?.kind).toBe('podium');
    void scheduler;
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

describe('host points', () => {
  it('are refused in the lobby and change the score once the game has started', () => {
    const { manager, room } = setup();
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    enter(manager, room, 'Тарас');
    expect(manager.host(room, { type: 'adjust', playerId: olena.playerId, points: -100 })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'adjust', playerId: olena.playerId, points: -100 })).toEqual({ ok: true });
    expect(room.state.players[0].score).toBe(-100);
  });
});

describe('host debuffs', () => {
  it('a debuff is cast once per player and cancelled while it waits', () => {
    const { manager, room } = setup();
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    enter(manager, room, 'Тарас');
    expect(manager.host(room, { type: 'debuff', playerId: olena.playerId, kind: 'fog' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'debuff', playerId: olena.playerId, kind: 'fog' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'debuff', playerId: olena.playerId, kind: 'mud' })).toEqual({ ok: false, error: 'debuff_busy' });
    expect(manager.host(room, { type: 'undebuff', playerId: olena.playerId })).toEqual({ ok: true });
    expect(room.state.debuffs).toEqual({});
    expect(manager.host(room, { type: 'undebuff', playerId: olena.playerId })).toEqual({ ok: false, error: 'not_found' });
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
    expect(manager.buyDebuff(room, olena.playerId, olena.playerId, 'fog')).toEqual({ ok: false, error: 'game_not_found' });
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
    expect(manager.host(room, { type: 'dice' })).toEqual({ ok: true });
    expect(manager.roll(room, anna.playerId)).toEqual({ ok: true });
    expect(room.state.board?.dice?.throws[anna.playerId]).toEqual([4]);
    expect(manager.host(room, { type: 'roll' })).toEqual({ ok: true });
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
  it('an all-in wager through the manager stakes the whole limit', () => {
    const { manager } = setup();
    const quiz = makeRoundsQuiz([classicRound('r1', [single]), finalRound('f', withId(single, 'f1'))]);
    const own = manager.create(quiz);
    manager.connect(own, HOST);
    const a = enter(manager, own, 'Олена');
    const b = enter(manager, own, 'Тарас');
    manager.host(own, { type: 'start' });
    manager.host(own, { type: 'next' });
    manager.answer(own, a.playerId, correct);
    manager.answer(own, b.playerId, correct);
    for (let i = 0; i < 4; i++) manager.host(own, { type: 'next' });
    expect(own.state.phase).toBe('wager');
    const limit = own.state.final?.limits[a.playerId] ?? 0;
    expect(limit).toBeGreaterThan(0);
    expect(manager.wager(own, a.playerId, 0, true)).toEqual({ ok: true });
    expect(own.state.final?.wagers[a.playerId]).toBe(limit);
    expect(own.state.final?.allIn).toEqual([a.playerId]);
  });
});

describe('duels', () => {
  /** Гра на reveal після першого запитання; поріг 1, фінал далі. */
  function duelRoom() {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0);
    const quiz = {
      ...makeRoundsQuiz([classicRound('r1', [withId(single, 'q1'), withId(single, 'q2')]), finalRound('rf', withId(single, 'qf'))]),
      duels,
    };
    const room = manager.create(quiz);
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    const taras = enter(manager, room, 'Тарас');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    manager.answer(room, olena.playerId, correct);
    manager.answer(room, taras.playerId, correct);
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');
    return { scheduler, manager, room, olena, taras };
  }

  it('a duel question closes on time by the scheduler', () => {
    const { scheduler, manager, room, olena, taras } = duelRoom();
    expect(manager.declareDuel(room, olena.playerId, taras.playerId)).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.duelCategory(room, olena.playerId, 'dc1')).toEqual({ ok: true });
    expect(room.state.duel?.stage).toBe('question');
    scheduler.advance(duels.timeLimit * 1000 - 1);
    expect(room.state.duel?.stage).toBe('question');
    scheduler.advance(1);
    expect(room.state.duel?.stage).toBe('answer');
  });

  it('the answers of a duel go through the manager', () => {
    const { manager, room, olena, taras } = duelRoom();
    manager.declareDuel(room, olena.playerId, taras.playerId);
    manager.host(room, { type: 'next' });
    expect(manager.host(room, { type: 'duel-category', categoryId: 'dc1' })).toEqual({ ok: true });
    expect(manager.duelAnswer(room, taras.playerId, 'Берлін')).toEqual({ ok: true });
    expect(manager.duelAnswer(room, taras.playerId, 'Париж')).toEqual({ ok: true });
    expect(room.state.duel?.stage).toBe('answer');
    expect(room.state.duel?.questions[0].winnerId).toBe(taras.playerId);
  });

  it('the host skips a question of a duel and cancels the duel', () => {
    const { manager, room, olena, taras } = duelRoom();
    manager.declareDuel(room, olena.playerId, taras.playerId);
    manager.host(room, { type: 'next' });
    manager.duelCategory(room, olena.playerId, 'dc1');
    expect(manager.host(room, { type: 'duel-skip' })).toEqual({ ok: true });
    expect(room.state.duel?.questions).toHaveLength(1);
    expect(manager.host(room, { type: 'duel-cancel' })).toEqual({ ok: true });
    expect(room.state.duel).toBeNull();
    expect(room.state.phase).toBe('reveal');
  });

  it('kicking a duelist mid-duel returns the game to the reveal', () => {
    const { manager, room, olena, taras } = duelRoom();
    manager.declareDuel(room, olena.playerId, taras.playerId);
    manager.host(room, { type: 'next' });
    manager.duelCategory(room, olena.playerId, 'dc1');
    expect(manager.host(room, { type: 'kick', playerId: taras.playerId })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');
    expect(room.state.duel).toBeNull();
  });
});

describe('personal deadline of the extra time buff', () => {
  /** Три гравці, Оля бере «Додатковий час», решта відповіли. */
  function overtime() {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeQuiz([single, text], { buffs: ['time'] }));
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    const taras = enter(manager, room, 'Тарас');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.buff(room, olena.playerId, 'time')).toEqual({ ok: true });
    expect(manager.answer(room, taras.playerId, wrong)).toEqual({ ok: true });
    return { scheduler, manager, room, olena };
  }

  it('the scheduler closes the question at the personal deadline', () => {
    const { room, scheduler } = overtime();
    scheduler.advance(20_000);
    expect(room.state.phase).toBe('question');
    scheduler.advance(29_999);
    expect(room.state.phase).toBe('question');
    scheduler.advance(1);
    expect(room.state.phase).toBe('locked');
  });

  it('a player with extra time answering late closes the question at once', () => {
    const { manager, room, olena, scheduler } = overtime();
    scheduler.advance(25_000);
    expect(room.state.phase).toBe('question');
    expect(manager.answer(room, olena.playerId, correct)).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');
  });
});

describe('personal deadline of the swap buff', () => {
  /** Оля бере «Заміну» на 18-й секунді 20-секундного запитання; Тарас уже відповів. */
  function swapped() {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create({ ...makeQuiz([single, text], { buffs: ['swap'] }), spares: [withId(bool, 's1')] });
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    const taras = enter(manager, room, 'Тарас');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.answer(room, taras.playerId, wrong)).toEqual({ ok: true });
    scheduler.advance(18_000);
    expect(manager.buff(room, olena.playerId, 'swap')).toEqual({ ok: true });
    return { scheduler, manager, room };
  }

  it('a swap holds the reveal for 20 s and the host may not wait', () => {
    const { room, scheduler } = swapped();
    scheduler.advance(2_000);
    expect(room.state.phase).toBe('question');
    scheduler.advance(18_000);
    expect(room.state.phase).toBe('locked');
  });

  it('the host may stop waiting for a swap', () => {
    const { manager, room } = swapped();
    expect(manager.host(room, { type: 'lock' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('locked');
  });
});

describe('«Як грати»', () => {
  it('start opens the guide for a quiz with explanations; next pages, guide-skip leaves; plain quizzes start as before', () => {
    const { manager } = setup();
    const room = manager.create(makeRoundsQuiz([classicRound('r1', [single])], { newcomers: true }));
    manager.connect(room, HOST);
    enter(manager, room, 'Олена');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect([room.state.phase, room.state.guidePage]).toEqual(['guide', 0]);
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.guidePage).toBe(1);
    expect(manager.host(room, { type: 'guide-skip' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('intro');
    expect(manager.host(room, { type: 'guide-skip' })).toEqual({ ok: false, error: 'wrong_phase' });

    const plain = playing();
    expect(plain.room.state.phase).toBe('question');
  });
});

describe('the wipeout decision window (10g)', () => {
  function window() {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeRoundsQuiz([wipeoutRound('w', wipeoutLadder)]));
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    const taras = enter(manager, room, 'Тарас');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.answer(room, olena.playerId, correct)).toEqual({ ok: true });
    expect(manager.answer(room, taras.playerId, correct)).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    return { scheduler, manager, room, olena, taras };
  }

  it('closes at once when every present player in the game has decided', () => {
    const { room, scheduler, manager, olena, taras } = window();
    expect(room.state.phase).toBe('leaderboard');
    expect(manager.wipeout(room, taras.playerId, false)).toEqual({ ok: true });
    scheduler.advance(9_999);
    expect(room.state.endsAt).not.toBeNull();
    expect(manager.wipeout(room, olena.playerId, true)).toEqual({ ok: true });
    expect(room.state.endsAt).toBeNull();
  });

  it('without decisions the scheduler ends the window at the deadline and the bank is taken', () => {
    const { room, scheduler } = window();
    scheduler.advance(9_999);
    expect(room.state.endsAt).not.toBeNull();
    scheduler.advance(1);
    expect(room.state.endsAt).toBeNull();
    expect(room.state.plays[0].wipeout?.took).toHaveLength(2);
    expect(room.state.players.map((p) => p.score)).toEqual([100, 100]);
    expect(room.state.phase).toBe('leaderboard');
  });
});


describe('the survival trial (10h)', () => {
  function survival(trial: 'question' | 'luck' = 'question') {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials, { trial })]));
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    const taras = enter(manager, room, 'Тарас');
    return { scheduler, manager, room, olena, taras };
  }

  it('closes at once when everyone present on the edge has answered; a wrong answer means out', () => {
    const { manager, room, olena, taras } = survival();
    playSurvivalQuestion(manager, room, { right: [taras.playerId], trial: [] });
    expect(room.state.plays[0].survival?.trial?.stage).toBe('closed');
    expect(room.state.plays[0].survival?.trial?.out).toEqual([olena.playerId]);
  });

  it('the scheduler closes an open trial at its deadline', () => {
    const { manager, room, scheduler, olena, taras } = survival();
    manager.host(room, { type: 'start' });
    manager.host(room, { type: 'next' });
    manager.answer(room, olena.playerId, { type: 'single', optionId: 'a' });
    manager.answer(room, taras.playerId, correct);
    manager.host(room, { type: 'lock' });
    manager.host(room, { type: 'next' });
    manager.host(room, { type: 'next' });
    const trial = () => room.state.plays[0].survival?.trial;
    expect(room.state.phase).toBe('leaderboard');
    expect(trial()?.stage).toBe('open');
    scheduler.advance(14_999);
    expect(trial()?.stage).toBe('open');
    scheduler.advance(1);
    expect(trial()?.stage).toBe('closed');
    expect(trial()?.out).toEqual([olena.playerId]);
  });

  it('a host override after the survival question closes brings the player back alive', () => {
    const { manager, room, olena, taras } = survival();
    playSurvivalQuestion(manager, room, { right: [taras.playerId], trial: [] });
    expect(room.state.plays[0].survival?.trial?.out).toEqual([olena.playerId]);
    expect(manager.host(room, { type: 'override', playerId: olena.playerId, grade: 'correct' })).toEqual({ ok: true });
    expect(room.state.plays[0].survival?.trial?.out).toEqual([]);
    expect(manager.trial(room, olena.playerId, TRIAL_RIGHT[0])).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('the ladder (10i)', () => {
  function ladder(options: Parameters<typeof ladderRound>[2] = {}) {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeRoundsQuiz([ladderRound('rl', undefined, options)]));
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    const taras = enter(manager, room, 'Тарас');
    const view = (who: { identity: Identity }) => manager.view(room, who.identity) as unknown as { me: { ladder: { hint: { text: string | null } | null } | null } };
    return { scheduler, manager, room, olena, taras, view };
  }

  /** Заставка, вибір учасника (Олена) і перше запитання. */
  function toQuestion(ctx: ReturnType<typeof ladder>) {
    expect(ctx.manager.host(ctx.room, { type: 'start' })).toEqual({ ok: true });
    expect(ctx.manager.hostLadderPick(ctx.room, ctx.olena.playerId)).toEqual({ ok: true });
    for (let guard = 0; guard < 4 && ctx.room.state.phase !== 'question'; guard++) ctx.manager.host(ctx.room, { type: 'next' });
    ctx.scheduler.advance(10_000);
    expect(ctx.room.state.phase).toBe('question');
  }

  it('host:hint on the contestant request gives them the text', () => {
    const ctx = ladder();
    toQuestion(ctx);
    expect(ctx.manager.lifeline(ctx.room, ctx.olena.playerId, 'hint')).toEqual({ ok: true });
    expect(ctx.view(ctx.olena).me.ladder?.hint?.text ?? null).toBeNull();
    expect(ctx.manager.hostHint(ctx.room, ctx.olena.playerId, 'Це друга літера')).toEqual({ ok: true });
    expect(ctx.view(ctx.olena).me.ladder?.hint?.text).toBe('Це друга літера');
    expect(JSON.stringify(ctx.view(ctx.taras))).not.toContain('Це друга літера');
  });

  it('decisions: the contestant, the host instead of them, and nobody else', () => {
    const ctx = ladder();
    toQuestion(ctx);
    ctx.manager.answer(ctx.room, ctx.olena.playerId, { type: 'single', optionId: 'b' });
    ctx.manager.answer(ctx.room, ctx.taras.playerId, { type: 'single', optionId: 'b' });
    ctx.manager.host(ctx.room, { type: 'next' });
    ctx.manager.host(ctx.room, { type: 'next' });
    expect(ctx.room.state.phase).toBe('leaderboard');
    expect(ctx.manager.ladderDecide(ctx.room, ctx.taras.playerId, true)).toEqual({ ok: false, error: 'not_allowed' });
    expect(ctx.manager.hostLadderDecide(ctx.room, true)).toEqual({ ok: true });
    expect(ctx.room.state.plays[0].ladder?.outcome).toEqual({ kind: 'took', passed: 1, points: 100 });
  });

  it('the hall vote closes at its own deadline', () => {
    const ctx = ladder();
    toQuestion(ctx);
    expect(ctx.manager.lifeline(ctx.room, ctx.olena.playerId, 'audience')).toEqual({ ok: true });
    const audience = () => ctx.room.state.plays[0].ladder?.lifelines.audience;
    expect(audience()?.closed).toBe(false);
    const remaining = (audience()?.endsAt ?? 0) - ctx.scheduler.now();
    ctx.scheduler.advance(remaining - 1);
    expect(audience()?.closed).toBe(false);
    ctx.scheduler.advance(1);
    expect(audience()?.closed).toBe(true);
    expect(ctx.room.state.phase).toBe('question');
    expect(ctx.manager.answer(ctx.room, ctx.taras.playerId, { type: 'single', optionId: 'b' })).toEqual({ ok: false, error: 'vote_closed' });
  });
});

describe('teams (10j)', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const STAGE: Identity = { role: 'stage', playerId: null };
  /** Грані кубика по черзі, далі 0.5. */
  const faces = (...values: number[]) => {
    const queue = values.map((face) => (face - 1) / 6 + 0.01);
    return () => queue.shift() ?? 0.5;
  };

  function teamRoom(rounds: Parameters<typeof makeRoundsQuiz>[0], settings: Parameters<typeof makeRoundsQuiz>[1] = {}, rng: () => number = () => 0.5) {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, rng);
    const room = manager.create(makeRoundsQuiz(rounds, { teams: defaultTeams(2), ...settings }));
    const events: RoomEvent[] = [];
    manager.onEvent((_room, event) => events.push(event));
    manager.connect(room, HOST);
    const [olena, taras, ira, marko] = ['Олена', 'Тарас', 'Іра', 'Марко'].map((name) => enter(manager, room, name));
    const [red, blue] = room.state.teams!.list.map((t) => t.id);
    return { scheduler, manager, room, events, olena, taras, ira, marko, red, blue };
  }

  /** Олена й Тарас — червоні (капітан Олена), Іра й Марко — сині (капітан Іра); перше запитання. */
  function teamPlaying(rounds: Parameters<typeof makeRoundsQuiz>[0], settings: Parameters<typeof makeRoundsQuiz>[1] = {}) {
    const ctx = teamRoom(rounds, settings);
    const { manager, room, olena, taras, ira, marko, red, blue } = ctx;
    for (const [who, team] of [[olena, red], [taras, red], [ira, blue], [marko, blue]] as const) {
      expect(manager.host(room, { type: 'team-assign', memberId: who.playerId, teamId: team })).toEqual({ ok: true });
    }
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    return ctx;
  }

  it('a room of a team quiz gets uuid team ids, and people join as members of the lobby', () => {
    const { room, olena, red, blue } = teamRoom([classicRound('r1', [single])]);
    expect(room.state.teams?.list.map((t) => t.name)).toEqual(['Червоні', 'Сині']);
    expect(red).toMatch(UUID);
    expect(blue).toMatch(UUID);
    expect(red).not.toBe(blue);
    expect(room.state.players).toEqual([]);
    expect(room.state.teams?.members.map((m) => m.nickname)).toEqual(['Олена', 'Тарас', 'Іра', 'Марко']);
    expect(room.state.teams?.members.find((m) => m.id === olena.playerId)).toMatchObject({ connected: true, teamId: null });
  });

  it('dice: the host starts a tour, everyone rolls, the host rolls for the rest, teams form by bands', () => {
    const { manager, room, olena, taras, ira, marko, red, blue } = teamRoom([classicRound('r1', [single])], {}, faces(6, 2, 5, 1));
    expect(manager.host(room, { type: 'team-form', form: 'dice' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'team-dice' })).toEqual({ ok: true });
    expect(manager.teamRoll(room, olena.playerId)).toEqual({ ok: true });
    expect(manager.teamRoll(room, olena.playerId)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(manager.teamRoll(room, taras.playerId)).toEqual({ ok: true });
    expect(manager.teamRoll(room, ira.playerId)).toEqual({ ok: true });
    expect(manager.host(room, { type: 'team-roll' })).toEqual({ ok: true });
    const teamOf = (id: string) => room.state.teams?.members.find((m) => m.id === id)?.teamId;
    expect([olena, ira].map((who) => teamOf(who.playerId))).toEqual([red, red]);
    expect([taras, marko].map((who) => teamOf(who.playerId))).toEqual([blue, blue]);
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(room.state.players.map((p) => p.id)).toEqual([red, blue]);
  });

  it('players pick in pick mode, the host deals at random and sets the captain', () => {
    const { manager, room, olena, taras, red, blue } = teamRoom([classicRound('r1', [single])]);
    expect(manager.teamPick(room, olena.playerId, blue)).toEqual({ ok: true });
    expect(manager.teamPick(room, olena.playerId, 'nope')).toEqual({ ok: false, error: 'not_found' });
    expect(manager.host(room, { type: 'team-form', form: 'random' })).toEqual({ ok: true });
    expect(manager.teamPick(room, taras.playerId, red)).toEqual({ ok: false, error: 'team_form' });
    expect(manager.host(room, { type: 'team-deal' })).toEqual({ ok: true });
    expect(room.state.teams?.members.every((m) => m.teamId !== null)).toBe(true);
    const team = room.state.teams!.members.find((m) => m.id === taras.playerId)!.teamId!;
    expect(manager.host(room, { type: 'captain', teamId: team, memberId: taras.playerId })).toEqual({ ok: true });
    expect(room.state.teams?.captains[team]).toBe(taras.playerId);
  });

  it('after the start the players are the teams; only the captain answers', () => {
    const { manager, room, olena, taras, red, blue } = teamPlaying([classicRound('r1', [single, text])]);
    expect(room.state.players.map((p) => p.id)).toEqual([red, blue]);
    expect(manager.answer(room, taras.playerId, correct)).toEqual({ ok: false, error: 'not_captain' });
    expect(manager.answer(room, olena.playerId, correct)).toEqual({ ok: true });
    expect(room.state.plays[0].answers[red]).toBeDefined();
    expect(manager.buff(room, taras.playerId, 'double')).toEqual({ ok: false, error: 'not_captain' });
  });

  it('blitz: anyone buzzes and the one who buzzed answers', () => {
    const { manager, room, olena, taras, red } = teamPlaying([blitzRound('b1', [text], { check: 'manual' })]);
    expect(manager.buzz(room, taras.playerId)).toEqual({ ok: true });
    expect(room.state.plays[0].buzzers).toEqual({ [red]: taras.playerId });
    expect(manager.answer(room, olena.playerId, { type: 'text', value: 'Одеса' })).toEqual({ ok: false, error: 'not_in_queue' });
    expect(manager.answer(room, taras.playerId, { type: 'text', value: 'Одеса' })).toEqual({ ok: true });
  });

  it('the hall is voted by a member of another team, under their own id', () => {
    const { manager, room, olena, ira, marko, red } = teamPlaying([classicRound('r1', [single])], { buffs: ['audience'] });
    expect(manager.answer(room, ira.playerId, wrong)).toEqual({ ok: true });
    expect(manager.buff(room, olena.playerId, 'audience')).toEqual({ ok: true });
    expect(manager.vote(room, marko.playerId, red, correct)).toEqual({ ok: true });
  });

  it('kicking the last member of a team removes the team', () => {
    const { manager, room, ira, marko, red, blue } = teamPlaying([classicRound('r1', [single])]);
    expect(manager.host(room, { type: 'kick', playerId: ira.playerId })).toEqual({ ok: true });
    expect(room.state.players.map((p) => p.id)).toEqual([red, blue]);
    expect(manager.host(room, { type: 'kick', playerId: marko.playerId })).toEqual({ ok: true });
    expect(room.state.players.map((p) => p.id)).toEqual([red]);
    expect(manager.identify(room.code, 'player', marko.token)).toBeNull();
  });

  it('the captain draft lives in room memory and reaches only the teammates on the same question', () => {
    const { manager, room, events, olena, taras, ira, marko, red } = teamPlaying([classicRound('r1', [text, single])]);
    const draft = { type: 'text', value: 'Чернетка-Дніпро' } as const;
    const before = room.state;
    events.length = 0;
    expect(manager.draft(room, olena.playerId, draft)).toEqual({ ok: true });
    expect(events).toEqual([{ type: 'draft', teamId: red, by: olena.playerId }]);
    expect(room.state).toBe(before);

    const teammate = manager.view(room, taras.identity);
    expect(teammate?.role === 'player' && teammate.team?.draft).toEqual(draft);
    for (const who of [olena.identity, ira.identity, marko.identity, HOST, STAGE]) {
      expect(JSON.stringify(manager.view(room, who))).not.toContain('Чернетка-Дніпро');
    }
    expect(JSON.stringify(manager.snapshot(room))).not.toContain('Чернетка-Дніпро');

    expect(manager.draft(room, taras.playerId, draft)).toEqual({ ok: false, error: 'not_captain' });
    expect(manager.draft(room, olena.playerId, correct)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(manager.draft(room, ira.playerId, null)).toEqual({ ok: true });
    expect(events.filter((e) => e.type === 'changed')).toEqual([]);

    // Нове запитання: стара чернетка не показується.
    expect(manager.answer(room, olena.playerId, { type: 'text', value: 'Одеса' })).toEqual({ ok: true });
    expect(manager.answer(room, ira.playerId, { type: 'text', value: 'Одеса' })).toEqual({ ok: true });
    for (let guard = 0; guard < 4 && room.state.questionIndex === 0; guard++) manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('question');
    const later = manager.view(room, taras.identity);
    expect(later?.role === 'player' && later.team?.draft).toBeNull();
    expect(JSON.stringify(later)).not.toContain('Чернетка-Дніпро');
  });

  it('a draft clears with null, and is wrong outside a question or in a solo game', () => {
    const { manager, room, olena, taras } = teamPlaying([classicRound('r1', [text])]);
    expect(manager.draft(room, olena.playerId, { type: 'text', value: 'Київ' })).toEqual({ ok: true });
    expect(manager.draft(room, olena.playerId, null)).toEqual({ ok: true });
    const view = manager.view(room, taras.identity);
    expect(view?.role === 'player' && view.team?.draft).toBeNull();
    manager.host(room, { type: 'lock' });
    expect(manager.draft(room, olena.playerId, { type: 'text', value: 'Київ' })).toEqual({ ok: false, error: 'wrong_phase' });

    const solo = playing();
    expect(solo.manager.draft(solo.room, solo.olena.playerId, correct)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('the host removes people: a team id is not found and strands nobody', () => {
    const { manager, room, ira, red } = teamPlaying([classicRound('r1', [single])]);
    expect(manager.host(room, { type: 'kick', playerId: red })).toEqual({ ok: false, error: 'not_found' });
    expect(room.state.players).toHaveLength(2);
    expect(manager.identify(room.code, 'player', ira.token)?.identity.playerId).toBe(ira.playerId);
  });

  it('a draft goes stale when its author no longer answers for the team, and comes back with them', () => {
    const { manager, room, olena, taras } = teamPlaying([classicRound('r1', [text])]);
    const draft = { type: 'text', value: 'Чернетка-Рівне' } as const;
    expect(manager.draft(room, olena.playerId, draft)).toEqual({ ok: true });
    const seen = () => {
      const view = manager.view(room, taras.identity);
      return view?.role === 'player' ? view.team?.draft : undefined;
    };
    expect(seen()).toEqual(draft);
    manager.disconnect(room, olena.identity);
    expect(seen()).toBeNull();
    manager.connect(room, olena.identity);
    expect(seen()).toEqual(draft);
  });

  it('no drafts on a poll or a word cloud: everyone answers for themselves', () => {
    const { manager, room, olena } = teamPlaying([classicRound('r1', [poll])]);
    expect(manager.draft(room, olena.playerId, { type: 'poll', optionId: 'a' } as never)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('blitz: the one who buzzed drafts and the captain sees it; the author never sees their own draft', () => {
    const { manager, room, events, olena, taras, red } = teamPlaying([blitzRound('b1', [text], { check: 'manual' })]);
    expect(manager.buzz(room, taras.playerId)).toEqual({ ok: true });
    const draft = { type: 'text', value: 'Чернетка-Ужгород' } as const;
    events.length = 0;
    expect(manager.draft(room, olena.playerId, draft)).toEqual({ ok: false, error: 'not_in_queue' });
    expect(manager.draft(room, taras.playerId, draft)).toEqual({ ok: true });
    expect(events).toEqual([{ type: 'draft', teamId: red, by: taras.playerId }]);
    const captain = manager.view(room, olena.identity);
    expect(captain?.role === 'player' && captain.team?.draft).toEqual(draft);
    expect(JSON.stringify(manager.view(room, taras.identity))).not.toContain('Чернетка-Ужгород');
  });

  it('an unchanged draft is not sent again, and drafts closer than 100 ms are ignored', () => {
    const { scheduler, manager, room, events, olena, taras } = teamPlaying([classicRound('r1', [text])]);
    const seen = () => {
      const view = manager.view(room, taras.identity);
      return view?.role === 'player' ? view.team?.draft : undefined;
    };
    expect(manager.draft(room, olena.playerId, { type: 'text', value: 'Ки' })).toEqual({ ok: true });
    events.length = 0;
    scheduler.advance(200);
    expect(manager.draft(room, olena.playerId, { type: 'text', value: 'Ки' })).toEqual({ ok: true });
    expect(events).toEqual([]);
    expect(manager.draft(room, olena.playerId, { type: 'text', value: 'Киї' })).toEqual({ ok: true });
    expect(events).toHaveLength(1);
    scheduler.advance(50);
    expect(manager.draft(room, olena.playerId, { type: 'text', value: 'Київ' })).toEqual({ ok: true });
    expect(events).toHaveLength(1);
    expect(seen()).toEqual({ type: 'text', value: 'Киї' });
    scheduler.advance(50);
    expect(manager.draft(room, olena.playerId, { type: 'text', value: 'Київ' })).toEqual({ ok: true });
    expect(events).toHaveLength(2);
    expect(seen()).toEqual({ type: 'text', value: 'Київ' });
  });

  it('a draft clears once the team answer for the question changes', () => {
    const { manager, room, olena, taras } = teamPlaying([classicRound('r1', [text])]);
    expect(manager.draft(room, olena.playerId, { type: 'text', value: 'Київ' })).toEqual({ ok: true });
    expect(manager.answer(room, olena.playerId, { type: 'text', value: 'Одеса' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('question');
    const view = manager.view(room, taras.identity);
    expect(view?.role === 'player' && view.team?.draft).toBeNull();
  });
});
