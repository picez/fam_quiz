import { describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { GAME_STATE_VERSION } from '@quiz/engine';
import { defaultTeams, type Quiz } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, isSavedRoom, type Room } from './manager';

const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const threeRounds = (teams = false): Quiz =>
  makeRoundsQuiz(
    [classicRound('r0', [single]), classicRound('r1', [withId(single, 'q2')]), classicRound('r2', [withId(single, 'q3')])],
    teams ? { teams: defaultTeams(2) } : {},
  );

/** Детермінований rng без нічиїх кубиків: крок золотого перетину. */
function steppingRng(): () => number {
  let i = 0;
  return () => ((i++ * 0.618034) % 1 + 1) % 1;
}

const carryRows = (room: Room) => room.state.adjustments.filter((a) => a.source === 'carry');

/** Ведучий на зв'язку, Оля й Петро в лобі. */
function hosted() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(threeRounds(), 'u1', 'q1');
  manager.connect(room, { role: 'host', playerId: null });
  const enter = (nickname: string) => {
    const joined = manager.join(room.code, nickname, null);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  return { scheduler, manager, room, olya: enter('Оля'), petro: enter('Петро') };
}

/** Автопілот: автор Марта й Тарас (і Іра) на зв'язку. */
function autopilot(quiz: Quiz, names = ['Тарас']) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, steppingRng());
  const created = manager.createAutopilot(quiz, 'u1', 'q1', 'Марта');
  if (!created.ok) throw new Error(created.error);
  const { room } = created;
  manager.connect(room, { role: 'player', playerId: created.playerId });
  const others = names.map((name) => {
    const joined = manager.join(room.code, name);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  });
  return { scheduler, manager, room, authorId: created.playerId, others };
}

describe('resume a game: the host (12r)', () => {
  it('starts at the chosen round with a carry row for the non-zero points', () => {
    const { manager, room, olya, petro } = hosted();
    expect(manager.host(room, { type: 'start', resume: { roundIndex: 1, points: { [olya]: 42_434, [petro]: 0 } } })).toEqual({ ok: true });
    expect(room.state.phase).toBe('intro');
    expect(room.state.roundIndex).toBe(1);
    expect(carryRows(room)).toEqual([expect.objectContaining({ playerId: olya, points: 42_434, roundIndex: 1, afterQuestion: 0 })]);
    expect(room.state.players.find((p) => p.id === olya)?.score).toBe(42_434);
  });

  it('a plain start stays the first round without carry rows', () => {
    const { manager, room } = hosted();
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(room.state.roundIndex).toBe(0);
    expect(carryRows(room)).toEqual([]);
  });

  it('refuses a round out of range, a stranger and a second start', () => {
    const { manager, room, olya } = hosted();
    expect(manager.host(room, { type: 'start', resume: { roundIndex: 5, points: {} } })).toEqual({ ok: false, error: 'resume_invalid' });
    expect(manager.host(room, { type: 'start', resume: { roundIndex: 0, points: { stranger: 10 } } })).toEqual({ ok: false, error: 'not_found' });
    expect(room.state.phase).toBe('lobby');
    expect(manager.host(room, { type: 'start', resume: { roundIndex: 1, points: { [olya]: 5 } } })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'start', resume: { roundIndex: 1, points: { [olya]: 5 } } })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(carryRows(room)).toHaveLength(1);
  });
});

describe('resume a game: the autopilot author (12r)', () => {
  it('the author starts with the round and the points; another player is not allowed', () => {
    const { manager, room, authorId, others } = autopilot(threeRounds());
    const resume = { roundIndex: 2, points: { [others[0]]: 1200 } };
    expect(manager.author(room, others[0], { type: 'start', resume })).toEqual({ ok: false, error: 'not_allowed' });
    expect(manager.author(room, authorId, { type: 'start', resume })).toEqual({ ok: true });
    expect(room.state.roundIndex).toBe(2);
    expect(carryRows(room)).toEqual([expect.objectContaining({ playerId: others[0], points: 1200, roundIndex: 2 })]);
  });

  it('a saved room in a team dice tour keeps resume across a restart and carries the points once the tour ends', () => {
    const { scheduler, manager, room, authorId } = autopilot(threeRounds(true), ['Тарас', 'Іра']);
    expect(manager.author(room, authorId, { type: 'team-form', form: 'dice' })).toEqual({ ok: true });
    const [first, second] = room.state.teams!.list;
    const resume = { roundIndex: 1, points: { [first.id]: 300, [second.id]: -50 } };
    expect(manager.author(room, authorId, { type: 'start', resume })).toEqual({ ok: true });
    expect(room.state.autopilot?.starting).toBe(true);
    expect(room.state.autopilot?.resume).toEqual(resume);

    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    expect(isSavedRoom(saved)).toBe(true);
    expect(saved.stateVersion).toBe(GAME_STATE_VERSION);
    expect(GAME_STATE_VERSION).toBe(21);
    const next = new RoomManager(scheduler, steppingRng());
    const back = next.restore(saved) as Room;
    expect(back.state.autopilot?.resume).toEqual(resume);
    for (const playerId of back.state.players.map((p) => p.id)) next.connect(back, { role: 'player', playerId });
    for (const id of back.state.teams!.dice!.waiting) next.teamRoll(back, id);
    scheduler.advance(60_000);
    expect(back.state.phase).not.toBe('lobby');
    expect(back.state.roundIndex).toBe(1);
    expect(carryRows(back).map((a) => [a.playerId, a.points])).toEqual([
      [first.id, 300],
      [second.id, -50],
    ]);
  });

  it('a room saved at state version 18 is still restored', () => {
    const { manager, room } = autopilot(threeRounds());
    const saved = { ...viaJson(manager.snapshot(room)), stateVersion: 18 };
    expect(isSavedRoom(saved)).toBe(true);
    manager.freeze();
    expect(new RoomManager(new FakeScheduler(), () => 0.5).restore(saved)).not.toBeNull();
  });
});
