import { describe, expect, it } from 'vitest';
import { classicRound, makeQuiz, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { defaultTeams, STICKERS, type Quiz, type ReactionItem } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { startTeamGame } from '../testing/team-game';
import { RoomManager, type Identity, type RoomEvent } from './manager';

const right = { type: 'single', optionId: 'b' } as const;
const fire: ReactionItem = { kind: 'emoji', value: '🔥' };
const cat: ReactionItem = { kind: 'sticker', value: STICKERS[0]!.id };
const HOST: Identity = { role: 'host', playerId: null };
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function game(names: string[], quiz: Quiz = makeQuiz([single, withId(single, 'second')])) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(quiz, null, null);
  const ids = names.map((name) => {
    const joined = manager.join(room.code, name);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  });
  const events: RoomEvent[] = [];
  manager.onEvent((_room, event) => events.push(event));
  manager.host(room, { type: 'start' });
  return { manager, room, ids, events, scheduler };
}

/** Доводить гру до reveal першого запитання. */
function toQuestion(setup: ReturnType<typeof game>) {
  while (setup.room.state.phase === 'intro') setup.manager.host(setup.room, { type: 'next' });
}

function toReveal(setup: ReturnType<typeof game>) {
  const { manager, room, ids } = setup;
  toQuestion(setup);
  expect(room.state.phase).toBe('question');
  manager.answer(room, ids[0]!, right);
  manager.host(room, { type: 'lock' });
  manager.host(room, { type: 'next' });
  expect(room.state.phase).toBe('reveal');
}

const reactions = (events: RoomEvent[]) => events.filter((event) => event.type === 'reaction');

describe('manager.react (13a)', () => {
  it('relays a reveal reaction without touching the game state', () => {
    const setup = game(['Оля', 'Петро']);
    toReveal(setup);
    const { manager, room, ids, events } = setup;
    const state = room.state;
    const before = JSON.stringify(state);
    events.length = 0;
    expect(manager.react(room, ids[0]!, cat)).toEqual({ ok: true });
    expect(room.state).toBe(state);
    expect(JSON.stringify(room.state)).toBe(before);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'reaction', reaction: { by: ids[0], nickname: 'Оля', rowId: ids[0], item: cat } });
  });

  it('is wrong_phase in the lobby and during a question, ok in the other resting phases', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(makeQuiz([single, withId(single, 'second')]), null, null);
    const joined = manager.join(room.code, 'Оля');
    if (!joined.ok) throw new Error(joined.error);
    expect(manager.react(room, joined.playerId, fire)).toEqual({ ok: false, error: 'wrong_phase' });
    const setup = game(['Оля']);
    toQuestion(setup);
    expect(setup.room.state.phase).toBe('question');
    expect(setup.manager.react(setup.room, setup.ids[0]!, fire)).toEqual({ ok: false, error: 'wrong_phase' });
    for (const phase of ['leaderboard', 'round_end', 'finished'] as const) {
      const other = game(['Оля']);
      other.room.state = { ...other.room.state, phase };
      expect(other.manager.react(other.room, other.ids[0]!, fire)).toEqual({ ok: true });
    }
  });

  it('lets one person through once in 2 s; others and the host have their own windows', () => {
    const setup = game(['Оля', 'Петро']);
    toReveal(setup);
    const { manager, room, ids, scheduler, events } = setup;
    events.length = 0;
    const results = Array.from({ length: 10 }, () => manager.react(room, ids[0]!, fire));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error === 'too_soon')).toHaveLength(9);
    scheduler.advance(1999);
    expect(manager.react(room, ids[0]!, fire)).toEqual({ ok: false, error: 'too_soon' });
    expect(manager.react(room, ids[1]!, fire)).toEqual({ ok: true });
    expect(manager.react(room, 'host', fire)).toEqual({ ok: true });
    scheduler.advance(1);
    expect(manager.react(room, ids[0]!, fire)).toEqual({ ok: true });
    const seqs = reactions(events).map((event) => (event as Extract<RoomEvent, { type: 'reaction' }>).reaction.seq);
    expect(seqs).toHaveLength(4);
    expect([...seqs].sort((x, y) => x - y)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(4);
  });

  it('marks the host reaction: no nickname, no row', () => {
    const setup = game(['Оля']);
    toReveal(setup);
    setup.events.length = 0;
    expect(setup.manager.react(setup.room, 'host', cat)).toEqual({ ok: true });
    expect(setup.events[0]).toMatchObject({ type: 'reaction', reaction: { by: 'host', nickname: null, rowId: null } });
  });

  it('refuses an unknown person', () => {
    const setup = game(['Оля']);
    toReveal(setup);
    expect(setup.manager.react(setup.room, 'ghost', fire)).toEqual({ ok: false, error: 'not_found' });
  });

  it('puts a team member on the team row with their own nickname', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'second')])], { teams: defaultTeams(2) });
    const { room, members, teams } = startTeamGame(manager, quiz, [['Оля', 'Петро'], ['Віра', 'Ігор']]);
    manager.connect(room, HOST);
    for (let guard = 0; guard < 10 && room.state.phase !== 'question'; guard++) manager.host(room, { type: 'next' });
    manager.answer(room, members['Оля']!, right);
    manager.host(room, { type: 'lock' });
    manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('reveal');
    const events: RoomEvent[] = [];
    manager.onEvent((_room, event) => events.push(event));
    expect(manager.react(room, members['Петро']!, fire)).toEqual({ ok: true });
    expect(events[0]).toMatchObject({ type: 'reaction', reaction: { by: members['Петро'], nickname: 'Петро', rowId: teams[0] } });
  });

  it('works in a room brought back by restore', () => {
    const setup = game(['Оля']);
    toReveal(setup);
    const { manager, room, ids, scheduler } = setup;
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved)!;
    expect(back.state.phase).toBe('reveal');
    expect(next.react(back, ids[0]!, fire)).toEqual({ ok: true });
  });
});
