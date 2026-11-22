import { describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, single, text } from '@quiz/engine/testing';
import { defaultTeams, type HostView, type Quiz } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { AUTOPILOT_EMPTY_MS, RoomManager, type Identity, type Room } from './manager';

// 68: адмін веде гру бота з пульта — токен, ідентичність, дії ведучого.

const quiz = (): Quiz => makeRoundsQuiz([classicRound('r1', [{ ...single, timeLimit: 25 }, { ...text, timeLimit: 25 }, { ...single, timeLimit: 25 }])]);
const teamQuiz = (): Quiz => makeRoundsQuiz([classicRound('r1', [{ ...single, timeLimit: 30 }])], { teams: defaultTeams(2) });

function setup() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5, { pacing: false });
  return { scheduler, manager };
}

function botRoom(manager: RoomManager, of: Quiz = quiz()): Room {
  const created = manager.createBotRoom(of, 'q-bot');
  if (!created.ok) throw new Error(created.error);
  return created.room;
}

function enter(manager: RoomManager, room: Room, nickname: string): { playerId: string; identity: Identity } {
  const joined = manager.join(room.code, nickname, null);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { playerId: joined.playerId, identity };
}

/** Пульт адміна: токен і ідентичність з identify. */
function adminHost(manager: RoomManager, room: Room, adminId = 'admin-1'): Identity {
  const access = manager.botHostToken(room.code, adminId);
  if (!access.ok) throw new Error(access.error);
  const found = manager.identify(room.code, 'host', access.hostToken);
  if (found === null) throw new Error('identify');
  return found.identity;
}

/** Гра бота з Олею, дійшла до першого запитання. */
function atQuestion(manager: RoomManager, scheduler: FakeScheduler): { room: Room; olya: { playerId: string; identity: Identity } } {
  const room = botRoom(manager);
  const olya = enter(manager, room, 'Оля');
  expect(manager.botAct(room.code, 'start')).toEqual({ ok: true });
  for (let i = 0; i < 30 && room.state.phase !== 'question'; i++) scheduler.advance(1000);
  expect(room.state.phase).toBe('question');
  return { room, olya };
}

/** Оля відповідає неправильно; годинник іде, доки гра не дійде до reveal. */
function wrongReveal(manager: RoomManager, scheduler: FakeScheduler, room: Room, playerId: string): void {
  expect(manager.answer(room, playerId, { type: 'single', optionId: 'a' })).toEqual({ ok: true });
  for (let i = 0; i < 300 && room.state.phase !== 'reveal'; i++) scheduler.advance(100);
  expect(room.state.phase).toBe('reveal');
}

const score = (room: Room, id: string) => room.state.players.find((p) => p.id === id)!.score;

describe('the admin host of a bot room (68)', () => {
  it('one token per admin and room, only for a bot room', () => {
    const { manager } = setup();
    const room = botRoom(manager);
    const first = manager.botHostToken(room.code, 'admin-1');
    expect(first).toMatchObject({ ok: true, fresh: true, stageToken: room.stageToken });
    const again = manager.botHostToken(room.code, 'admin-1');
    expect(again).toMatchObject({ ok: true, fresh: false });
    if (!first.ok || !again.ok) throw new Error('token');
    expect(again.hostToken).toBe(first.hostToken);
    expect(first.hostToken).not.toBe(room.hostToken);
    const other = manager.botHostToken(room.code, 'admin-2');
    if (!other.ok) throw new Error('token');
    expect(other.fresh).toBe(true);
    expect(other.hostToken).not.toBe(first.hostToken);
    expect(room.adminHosts.size).toBe(2);
    const pilot = manager.createAutopilot(quiz(), 'u-marta', 'q2', 'Марта');
    if (!pilot.ok) throw new Error(pilot.error);
    expect(manager.botHostToken(pilot.room.code, 'admin-1')).toEqual({ ok: false, error: 'game_not_found' });
    const hosted = manager.create(quiz(), 'u1', 'q1');
    expect(manager.botHostToken(hosted.code, 'admin-1')).toEqual({ ok: false, error: 'game_not_found' });
    expect(manager.botHostToken('000000', 'admin-1')).toEqual({ ok: false, error: 'game_not_found' });
    manager.freeze();
    expect(manager.botHostToken(room.code, 'admin-1')).toEqual({ ok: false, error: 'restarting' });
  });

  it('the host role of a bot room is only for the admin token of that room', () => {
    const { manager } = setup();
    const a = botRoom(manager);
    const b = botRoom(manager);
    const access = manager.botHostToken(a.code, 'admin-1');
    if (!access.ok) throw new Error(access.error);
    expect(manager.identify(a.code, 'host', access.hostToken)?.identity).toEqual({ role: 'host', playerId: null, admin: 'admin-1' });
    expect(manager.identify(a.code, 'host', a.hostToken)).toBeNull();
    expect(manager.identify(b.code, 'host', access.hostToken)).toBeNull();
    // Звичайний автопілот: пульта немає й з токеном адміна чужої кімнати.
    const pilot = manager.createAutopilot(quiz(), 'u-marta', 'q2', 'Марта');
    if (!pilot.ok) throw new Error(pilot.error);
    expect(manager.identify(pilot.room.code, 'host', pilot.room.hostToken)).toBeNull();
    expect(manager.identify(pilot.room.code, 'host', access.hostToken)).toBeNull();
    // Сцена — як досі.
    expect(manager.identify(a.code, 'stage', a.stageToken)?.identity).toEqual({ role: 'stage', playerId: null });
  });

  it('an admin host screen leaves the empty-room timer alone', () => {
    const { manager, scheduler } = setup();
    const { room, olya } = atQuestion(manager, scheduler);
    const admin = adminHost(manager, room);
    manager.disconnect(room, olya.identity);
    manager.connect(room, admin);
    expect(manager.adminHostsOnline(room)).toBe(1);
    expect(room.connections.get('host')).toBeUndefined();
    scheduler.advance(AUTOPILOT_EMPTY_MS);
    expect(room.state.phase).toBe('finished');
    manager.disconnect(room, admin);
    expect(manager.adminHostsOnline(room)).toBe(0);
  });

  it('the admin host grades and undoes, and its view has undo and botHost', () => {
    const { manager, scheduler } = setup();
    const { room, olya } = atQuestion(manager, scheduler);
    const admin = adminHost(manager, room);
    manager.connect(room, admin);
    wrongReveal(manager, scheduler, room, olya.playerId);
    expect(score(room, olya.playerId)).toBe(0);
    expect(manager.adminHost(room, { type: 'override', playerId: olya.playerId, grade: 'correct' })).toEqual({ ok: true });
    expect(score(room, olya.playerId)).toBeGreaterThan(0);
    const view = manager.view(room, admin) as HostView;
    expect(view.botHost).toEqual({ manual: false, mine: false });
    for (let i = 0; i < 300 && room.state.phase === 'reveal'; i++) scheduler.advance(100);
    expect(room.state.phase).not.toBe('reveal');
    expect((manager.view(room, admin) as HostView).undo).not.toBeNull();
    expect(manager.adminHost(room, { type: 'undo', target: { question: 0, playerId: olya.playerId } })).toEqual({ ok: true });
    expect(score(room, olya.playerId)).toBe(0);
  });

  it('save, sounds and think edits are not allowed; next right after a step is too soon; pause holds as the author', () => {
    const { manager, scheduler } = setup();
    const { room, olya } = atQuestion(manager, scheduler);
    expect(manager.adminHost(room, { type: 'save' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(manager.adminHost(room, { type: 'sounds', on: false })).toEqual({ ok: false, error: 'not_allowed' });
    expect(manager.adminHost(room, { type: 'think-words', words: [] })).toEqual({ ok: false, error: 'not_allowed' });
    expect(manager.adminHost(room, { type: 'think-off', playerId: olya.playerId, off: true })).toEqual({ ok: false, error: 'not_allowed' });
    wrongReveal(manager, scheduler, room, olya.playerId);
    expect(manager.adminHost(room, { type: 'next' })).toEqual({ ok: false, error: 'too_soon' });
    expect(room.state.phase).toBe('reveal');
    expect(manager.adminHost(room, { type: 'pause' })).toEqual({ ok: true });
    expect(room.state.paused).toBe(true);
    expect(room.state.autopilot?.hold).toBe('author');
    expect(manager.adminHost(room, { type: 'resume' })).toEqual({ ok: true });
    expect(room.state.paused).toBe(false);
  });

  it("start with the host team form keeps the admin's teams", () => {
    const { manager } = setup();
    const room = botRoom(manager, teamQuiz());
    const [olya, petro, taras] = ['Оля', 'Петро', 'Тарас'].map((n) => enter(manager, room, n));
    expect(manager.adminHost(room, { type: 'team-form', form: 'host' })).toEqual({ ok: true });
    const [first, second] = room.state.teams!.list.map((t) => t.id);
    expect(manager.adminHost(room, { type: 'team-assign', memberId: olya.playerId, teamId: first })).toEqual({ ok: true });
    expect(manager.adminHost(room, { type: 'team-assign', memberId: petro.playerId, teamId: first })).toEqual({ ok: true });
    expect(manager.adminHost(room, { type: 'start' })).toEqual({ ok: true });
    expect(room.state.phase).not.toBe('lobby');
    const teamOf = (id: string) => room.state.teams!.members.find((m) => m.id === id)?.teamId;
    expect(teamOf(olya.playerId)).toBe(first);
    expect(teamOf(petro.playerId)).toBe(first);
    expect(teamOf(taras.playerId)).toBe(second);
  });

  it('end in the lobby closes the bot room; adminHost refuses rooms that are not a bot room', () => {
    const { manager } = setup();
    const room = botRoom(manager);
    expect(manager.adminHost(room, { type: 'end' })).toEqual({ ok: true });
    expect(manager.get(room.code)).toBeUndefined();
    const pilot = manager.createAutopilot(quiz(), 'u-marta', 'q2', 'Марта');
    if (!pilot.ok) throw new Error(pilot.error);
    expect(manager.adminHost(pilot.room, { type: 'pause' })).toEqual({ ok: false, error: 'forbidden' });
    const hosted = manager.create(quiz(), 'u1', 'q1');
    expect(manager.adminHost(hosted, { type: 'next' })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('nothing changes for the host and the author of a plain autopilot', () => {
    const { manager, scheduler } = setup();
    const { room } = atQuestion(manager, scheduler);
    expect(manager.host(room, { type: 'lock' })).toEqual({ ok: false, error: 'forbidden' });
    const pilot = manager.createAutopilot(quiz(), 'u-marta', 'q2', 'Марта');
    if (!pilot.ok) throw new Error(pilot.error);
    expect(manager.author(pilot.room, pilot.playerId, { type: 'override', playerId: pilot.playerId, grade: 'correct' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(manager.author(pilot.room, pilot.playerId, { type: 'undo', target: { round: 0 } })).toEqual({ ok: false, error: 'not_allowed' });
  });
});
