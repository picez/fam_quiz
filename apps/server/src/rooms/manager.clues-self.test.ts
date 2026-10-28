import { describe, expect, it } from 'vitest';
import { classicRound, clues, makeRoundsQuiz } from '@quiz/engine/testing';
import { defaultTeams, SPLASH_MS, type Quiz } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity, type Room } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const STAGE: Identity = { role: 'stage', playerId: null };
const selfClues = { ...clues, cluePace: 'self' } as const;

function setup(quiz: Quiz) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(quiz);
  return { scheduler, manager, room };
}

/** Гравець, що увійшов і відкрив одне з'єднання. */
function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { ...joined, identity };
}

/** Ведучий і двоє гравців на першому запитанні «Хто я?» у власному темпі (без заставок). */
function selfPlaying(quiz: Quiz = makeRoundsQuiz([classicRound('r1', [selfClues])])) {
  const ctx = setup(quiz);
  ctx.manager.connect(ctx.room, HOST);
  const olena = enter(ctx.manager, ctx.room, 'Олена');
  const taras = enter(ctx.manager, ctx.room, 'Тарас');
  expect(ctx.manager.host(ctx.room, { type: 'start' })).toEqual({ ok: true });
  expect(ctx.manager.host(ctx.room, { type: 'next' })).toEqual({ ok: true });
  return { ...ctx, olena, taras };
}

const shownOf = (manager: RoomManager, room: Room, who: Identity) => manager.view(room, who)?.question?.clues?.shown;

describe('own-pace clues in a room (12c)', () => {
  it('a player opens a clue; their view grows, the other phone and the stage keep the first', () => {
    const { manager, room, olena, taras } = selfPlaying();
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: true });
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: true });
    expect(manager.view(room, olena.identity)?.question?.clues?.shown).toHaveLength(3);
    expect(manager.view(room, taras.identity)?.question?.clues?.shown).toHaveLength(1);
    const stage = JSON.stringify(manager.view(room, STAGE));
    for (const hidden of clues.clues.slice(1)) expect(stage).not.toContain(hidden);
    expect(manager.view(room, STAGE)?.question?.clues?.opens?.map((o) => o.opened)).toEqual([3, 1]);
  });

  it('is refused while the splash is on, and on a pause', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5, { transitions: true });
    const room = manager.create(makeRoundsQuiz([classicRound('r1', [selfClues])]));
    manager.connect(room, HOST);
    const olena = enter(manager, room, 'Олена');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: false, error: 'not_started' });
    scheduler.advance(SPLASH_MS.question);
    expect(manager.host(room, { type: 'pause' })).toEqual({ ok: true });
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: false, error: 'paused' });
    expect(manager.host(room, { type: 'resume' })).toEqual({ ok: true });
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: true });
  });

  it('is refused after the player answered', () => {
    const { manager, room, olena } = selfPlaying();
    expect(manager.answer(room, olena.playerId, { type: 'clues', value: 'Шевченко' })).toEqual({ ok: true });
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('is clues_done once every clue is open', () => {
    const { manager, room, olena } = selfPlaying();
    for (let i = 1; i < clues.clues.length; i += 1) expect(manager.clue(room, olena.playerId)).toEqual({ ok: true });
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: false, error: 'clues_done' });
    expect(shownOf(manager, room, olena.identity)).toHaveLength(clues.clues.length);
  });

  it('is wrong_phase in the lobby and after the lock', () => {
    const lobby = setup(makeRoundsQuiz([classicRound('r1', [selfClues])]));
    const ira = enter(lobby.manager, lobby.room, 'Іра');
    expect(lobby.manager.clue(lobby.room, ira.playerId)).toEqual({ ok: false, error: 'wrong_phase' });
    const { manager, room, olena } = selfPlaying();
    expect(manager.host(room, { type: 'lock' })).toEqual({ ok: true });
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('every clue lowers the price of the one who opened it', () => {
    const { manager, room, olena, taras } = selfPlaying();
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: true });
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: true });
    expect(manager.answer(room, olena.playerId, { type: 'clues', value: 'Шевченко' })).toEqual({ ok: true });
    expect(manager.answer(room, taras.playerId, { type: 'clues', value: 'Шевченко' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    const points = (id: string) => room.state.players.find((p) => p.id === id)?.score;
    expect([points(olena.playerId), points(taras.playerId)]).toEqual([600, 1000]);
  });

  it('in a team game the captain opens clues for the team; teammates see them', () => {
    const { scheduler, manager, room } = setup(makeRoundsQuiz([classicRound('r1', [selfClues])], { teams: defaultTeams(2) }));
    manager.connect(room, HOST);
    const [olena, taras, ira, marko] = ['Олена', 'Тарас', 'Іра', 'Марко'].map((name) => enter(manager, room, name));
    const [red, blue] = room.state.teams!.list.map((t) => t.id);
    for (const [who, team] of [[olena, red], [taras, red], [ira, blue], [marko, blue]] as const) {
      expect(manager.host(room, { type: 'team-assign', memberId: who.playerId, teamId: team })).toEqual({ ok: true });
    }
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    scheduler.advance(SPLASH_MS.question);
    expect(manager.clue(room, taras.playerId)).toEqual({ ok: false, error: 'not_captain' });
    expect(manager.clue(room, olena.playerId)).toEqual({ ok: true });
    expect(shownOf(manager, room, taras.identity)).toHaveLength(2);
    expect(shownOf(manager, room, olena.identity)).toHaveLength(2);
    expect(shownOf(manager, room, ira.identity)).toHaveLength(1);
  });

  it('works in an autopilot room with no host', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5, { pacing: false });
    const quiz = makeRoundsQuiz([classicRound('r1', [selfClues])]);
    const created = manager.createAutopilot(quiz, 'u1', 'q1', 'Марта');
    if (!created.ok) throw new Error(created.error);
    manager.connect(created.room, { role: 'player', playerId: created.playerId });
    const taras = enter(manager, created.room, 'Тарас');
    expect(manager.author(created.room, created.playerId, { type: 'start' })).toEqual({ ok: true });
    scheduler.advance(8000);
    expect(created.room.state.phase).toBe('question');
    scheduler.advance(SPLASH_MS.question);
    expect(manager.clue(created.room, taras.playerId)).toEqual({ ok: true });
    expect(shownOf(manager, created.room, taras.identity)).toHaveLength(2);
  });
});
