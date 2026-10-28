import { describe, expect, it } from 'vitest';
import { classicRound, makeQuiz, makeRoundsQuiz, single, text, withId } from '@quiz/engine/testing';
import { GAME_STATE_VERSION } from '@quiz/engine';
import { APPEAL_MS, APPEAL_VOTES_PER_SECOND, AUTOPILOT_MS, defaultTeams, type Quiz } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { startTeamGame } from '../testing/team-game';
import { RoomManager, isSavedRoom, type Identity, type Room } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const PLAIN = { speedBonus: false } as const;
const twoSingles = (settings: Partial<Quiz['settings']> = {}) => makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], PLAIN)], settings);
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return joined.playerId;
}

/** Ведучий, Оля, Петро й Іра на розкритті першого запитання: Оля відповіла неправильно, решта — правильно. */
function atReveal() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(twoSingles());
  manager.connect(room, HOST);
  const olya = enter(manager, room, 'Оля');
  const petro = enter(manager, room, 'Петро');
  const ira = enter(manager, room, 'Іра');
  const host = (action: Parameters<RoomManager['host']>[1]) => manager.host(room, action);
  expect(host({ type: 'start' })).toEqual({ ok: true });
  expect(host({ type: 'next' })).toEqual({ ok: true });
  expect(room.state.phase).toBe('question');
  scheduler.advance(1000);
  expect(manager.answer(room, olya, wrong)).toEqual({ ok: true });
  expect(manager.answer(room, petro, right)).toEqual({ ok: true });
  expect(manager.answer(room, ira, right)).toEqual({ ok: true });
  expect(host({ type: 'next' })).toEqual({ ok: true });
  expect(room.state.phase).toBe('reveal');
  return { scheduler, manager, room, olya, petro, ira, host };
}

const scoreOf = (room: Room, id: string) => room.state.players.find((p) => p.id === id)?.score ?? 0;
const hostAppeal = (manager: RoomManager, room: Room) => {
  const view = manager.view(room, HOST);
  return view?.appeal ?? null;
};

describe('player:appeal and player:appeal-vote in a room (12f)', () => {
  it('the hall votes yes: the appellant gets the points of a right answer and the host sees the result', () => {
    const { manager, room, olya, petro, ira } = atReveal();
    const before = scoreOf(room, olya);
    const gain = scoreOf(room, petro);
    expect(gain).toBeGreaterThan(0);
    expect(manager.appeal(room, olya, 'grade')).toEqual({ ok: true });
    expect(hostAppeal(manager, room)).toMatchObject({ outcome: null, yes: 0, no: 0, waiting: 2 });
    expect(manager.appealVote(room, petro, 1, true)).toEqual({ ok: true });
    expect(manager.appealVote(room, ira, 1, true)).toEqual({ ok: true });
    expect(scoreOf(room, olya)).toBe(before + gain);
    expect(hostAppeal(manager, room)).toMatchObject({ outcome: 'yes', yes: 2, no: 0, points: gain });
    expect(JSON.stringify(manager.view(room, HOST))).not.toContain(`"${petro}":true`);
  });

  it('engine errors come back through the result: a second appeal, a vote of the appellant, a wrong id, the wrong phase', () => {
    const { manager, room, olya, petro } = atReveal();
    expect(manager.appeal(room, petro, 'grade')).toEqual({ ok: false, error: 'appeal_unfit' });
    expect(manager.appeal(room, olya, 'grade')).toEqual({ ok: true });
    expect(manager.appeal(room, olya, 'grade')).toEqual({ ok: false, error: 'appeal_open' });
    expect(manager.appealVote(room, olya, 1, true)).toEqual({ ok: false, error: 'vote_denied' });
    expect(manager.appealVote(room, petro, 2, true)).toEqual({ ok: false, error: 'vote_closed' });
    expect(manager.appealVote(room, 'nobody', 1, true)).toEqual({ ok: false, error: 'not_found' });
    expect(manager.appeal(room, 'nobody', 'grade')).toEqual({ ok: false, error: 'not_found' });
  });

  it('the room timer closes the vote on time; until then «next» answers appeal_open', () => {
    const { scheduler, manager, room, olya, host } = atReveal();
    expect(manager.appeal(room, olya, 'grade')).toEqual({ ok: true });
    expect(host({ type: 'next' })).toEqual({ ok: false, error: 'appeal_open' });
    scheduler.advance(APPEAL_MS.vote - 1);
    expect(room.state.appeals?.[0].outcome).toBeNull();
    scheduler.advance(1);
    expect(room.state.appeals?.[0].outcome).toBe('tie');
    expect(hostAppeal(manager, room)).toMatchObject({ outcome: 'tie' });
    expect(host({ type: 'next' })).toEqual({ ok: true });
  });

  it('a pause stops the vote clock and a resume runs the rest', () => {
    const { scheduler, manager, room, olya, host } = atReveal();
    expect(manager.appeal(room, olya, 'grade')).toEqual({ ok: true });
    scheduler.advance(5000);
    expect(host({ type: 'pause' })).toEqual({ ok: true });
    scheduler.advance(60_000);
    expect(room.state.appeals?.[0].outcome).toBeNull();
    expect(hostAppeal(manager, room)).toMatchObject({ endsAt: null, remainingMs: APPEAL_MS.vote - 5000 });
    expect(host({ type: 'resume' })).toEqual({ ok: true });
    scheduler.advance(APPEAL_MS.vote - 5000 - 1);
    expect(room.state.appeals?.[0].outcome).toBeNull();
    scheduler.advance(1);
    expect(room.state.appeals?.[0].outcome).toBe('tie');
  });

  it('votes on a pause are refused', () => {
    const { manager, room, olya, petro, host } = atReveal();
    expect(manager.appeal(room, olya, 'grade')).toEqual({ ok: true });
    expect(host({ type: 'pause' })).toEqual({ ok: true });
    expect(manager.appealVote(room, petro, 1, true)).toEqual({ ok: false, error: 'paused' });
  });

  it('the host grading the appellant right closes the appeal as «host»', () => {
    const { manager, room, olya, host } = atReveal();
    expect(manager.appeal(room, olya, 'grade')).toEqual({ ok: true });
    expect(host({ type: 'override', playerId: olya, grade: 'correct' })).toEqual({ ok: true });
    expect(hostAppeal(manager, room)).toMatchObject({ outcome: 'host' });
  });

  it('a fifth vote within a second is too_soon; the next second it counts again; a kick clears the window', () => {
    const { scheduler, manager, room, olya, petro, host } = atReveal();
    expect(manager.appeal(room, olya, 'grade')).toEqual({ ok: true });
    for (let i = 0; i < APPEAL_VOTES_PER_SECOND; i++) expect(manager.appealVote(room, petro, 1, i % 2 === 0)).toEqual({ ok: true });
    expect(manager.appealVote(room, petro, 1, true)).toEqual({ ok: false, error: 'too_soon' });
    expect(room.appealRate.get(petro)?.count).toBe(APPEAL_VOTES_PER_SECOND);
    scheduler.advance(1000);
    expect(manager.appealVote(room, petro, 1, true)).toEqual({ ok: true });
    expect(host({ type: 'kick', playerId: petro })).toEqual({ ok: true });
    expect(room.appealRate.has(petro)).toBe(false);
  });

  it('in a team game the captain appeals and members of the other team vote one by one', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], PLAIN)], { teams: defaultTeams(2) });
    const { room, members, teams } = startTeamGame(manager, quiz, [['Оля', 'Петро'], ['Віра', 'Ігор']]);
    manager.connect(room, HOST);
    for (let i = 0; i < 4 && room.state.phase !== 'question'; i++) manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('question');
    scheduler.advance(1000);
    expect(manager.answer(room, members['Оля'], wrong)).toEqual({ ok: true });
    expect(manager.answer(room, members['Віра'], right)).toEqual({ ok: true });
    if (room.state.phase !== 'locked') expect(manager.host(room, { type: 'lock' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');
    expect(manager.appeal(room, members['Петро'], 'grade')).toEqual({ ok: false, error: 'not_captain' });
    expect(manager.appeal(room, members['Оля'], 'grade')).toEqual({ ok: true });
    expect(room.state.appeals?.[0].by).toBe(teams[0]);
    expect(manager.appealVote(room, members['Петро'], 1, true)).toEqual({ ok: false, error: 'vote_denied' });
    expect(manager.appealVote(room, members['Віра'], 1, true)).toEqual({ ok: true });
    expect(room.state.appeals?.[0].outcome).toBeNull();
    expect(manager.appealVote(room, members['Ігор'], 1, false)).toEqual({ ok: true });
    expect(room.state.appeals?.[0].outcome).toBe('tie');
  });

  it('a room with an open appeal is saved at version 18 and comes back paused with the same time left; after resume the timer closes it on time', () => {
    const { scheduler, manager, room, olya } = atReveal();
    expect(manager.appeal(room, olya, 'grade')).toEqual({ ok: true });
    scheduler.advance(10_000);
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    expect(saved.stateVersion).toBe(GAME_STATE_VERSION);
    expect(GAME_STATE_VERSION).toBe(18);
    expect(isSavedRoom(saved)).toBe(true);
    scheduler.advance(60 * 60_000);
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.state.paused).toBe(true);
    expect(back.state.appeals?.[0].outcome).toBeNull();
    next.connect(back, HOST);
    expect(next.view(back, HOST)?.appeal).toMatchObject({ remainingMs: APPEAL_MS.vote - 10_000 });
    expect(next.host(back, { type: 'resume' })).toEqual({ ok: true });
    scheduler.advance(APPEAL_MS.vote - 10_000 - 1);
    expect(back.state.appeals?.[0].outcome).toBeNull();
    scheduler.advance(1);
    expect(back.state.appeals?.[0].outcome).toBe('tie');
  });
});

describe('appeals in an autopilot room (12f)', () => {
  /** Автопілот: автор Оля й Петро на розкритті; Петро відповів неправильно, Оля — правильно. */
  function pilotReveal() {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const created = manager.createAutopilot(makeQuiz([single, text], { leaderboard: 'each' }), 'u1', 'q1', 'Оля');
    if (!created.ok) throw new Error(created.error);
    const { room } = created;
    const olya = created.playerId;
    manager.connect(room, { role: 'player', playerId: olya });
    const petro = enter(manager, room, 'Петро');
    expect(manager.author(room, olya, { type: 'start' })).toEqual({ ok: true });
    for (let i = 0; i < 40 && room.state.phase !== 'question'; i++) scheduler.advance(1000);
    expect(room.state.phase).toBe('question');
    expect(manager.answer(room, olya, right)).toEqual({ ok: true });
    expect(manager.answer(room, petro, wrong)).toEqual({ ok: true });
    scheduler.advance(AUTOPILOT_MS.locked);
    expect(room.state.phase).toBe('reveal');
    return { scheduler, manager, room, olya, petro };
  }

  it('the author votes like any player and the appellant gets the points', () => {
    const { manager, room, olya, petro } = pilotReveal();
    const before = scoreOf(room, petro);
    expect(manager.appeal(room, petro, 'grade')).toEqual({ ok: true });
    expect(manager.appealVote(room, olya, 1, true)).toEqual({ ok: true });
    expect(room.state.appeals?.[0].outcome).toBe('yes');
    expect(scoreOf(room, petro)).toBeGreaterThan(before);
  });

  it('with no votes the bot waits for the vote and moves on appealShown after it closes', () => {
    const { scheduler, manager, room, petro } = pilotReveal();
    scheduler.advance(1000);
    expect(manager.appeal(room, petro, 'grade')).toEqual({ ok: true });
    scheduler.advance(APPEAL_MS.vote);
    expect(room.state.appeals?.[0].outcome).toBe('tie');
    expect(room.state.phase).toBe('reveal');
    scheduler.advance(AUTOPILOT_MS.appealShown - 1);
    expect(room.state.phase).toBe('reveal');
    scheduler.advance(1);
    expect(room.state.phase).toBe('leaderboard');
  });
});
