import { describe, expect, it } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import { FakeScheduler } from '../testing/fake-scheduler';
import type { SavedGameData } from './continuation';
import { AUTOPILOT_EMPTY_MS, RoomManager, type Identity, type Room, type RoomChallenge, type RoomEvent, type SavedRoom } from './manager';

const ID = '44444444-4444-4444-8444-444444444444';
const CHALLENGE: RoomChallenge = { id: '55555555-5555-4555-8555-555555555555', code: 'abcdefghjkmn', title: 'Родинна вікторина' };
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function world() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5, { pacing: false });
  const events: { room: Room; event: RoomEvent }[] = [];
  manager.onEvent((room, event) => events.push({ room, event }));
  return { scheduler, manager, events };
}

/** Спроба виклику: автор Марта ('u1'), кімната з id = ID і позначкою. */
function attempt(w = world()) {
  const created = w.manager.createAutopilot(makeQuiz([single, text]), 'u1', null, 'Марта', { id: ID, challenge: CHALLENGE });
  if (!created.ok) throw new Error(created.error);
  const author: Identity = { role: 'player', playerId: created.playerId };
  w.manager.connect(created.room, author);
  return { ...w, room: created.room, authorId: created.playerId, token: created.token, author };
}

describe('a challenge attempt room (44)', () => {
  it('a challenge room is an autopilot room nobody else can enter', () => {
    const { manager, room } = attempt();
    expect(room.id).toBe(ID);
    expect(room.challenge).toEqual(CHALLENGE);
    expect(room.lobby.visibility).toBe('hidden');
    expect(room.quizId).toBeNull();
    expect(room.state.autopilot).toBeDefined();
    expect(manager.join(room.code, 'Тарас')).toEqual({ ok: false, error: 'game_not_found' });
    expect(manager.join(room.code, 'Тарас', 'u2')).toEqual({ ok: false, error: 'game_not_found' });
    expect(room.state.players).toHaveLength(1);
    expect(manager.setLobby(room, { visibility: 'friends', password: null })).toEqual({ ok: false, error: 'not_allowed' });
    expect(room.lobby.visibility).toBe('hidden');
    expect(manager.slots(room.code, 'u1')).toBeNull();
  });

  it('no carried points', () => {
    const { manager, room, authorId } = attempt();
    expect(manager.author(room, authorId, { type: 'start', resume: { roundIndex: 0, points: { [authorId]: 900 } } })).toEqual({ ok: false, error: 'not_allowed' });
    expect(room.state.phase).toBe('lobby');
    expect(manager.author(room, authorId, { type: 'start' })).toEqual({ ok: true });
    expect(room.state.phase).not.toBe('lobby');
    expect(room.state.players[0].score).toBe(0);
  });

  it('a returning author gets a new token for the same player', () => {
    const { manager, room, authorId, token } = attempt();
    const again = manager.authorToken(room);
    expect(again).not.toBeNull();
    expect(again?.playerId).toBe(authorId);
    expect(again?.token).not.toBe(token);
    expect(room.playerTokens.get(token)).toBe(authorId);
    expect(room.playerTokens.get(again?.token ?? '')).toBe(authorId);
    expect(manager.identify(room.code, 'player', again?.token ?? '')?.identity).toEqual({ role: 'player', playerId: authorId });

    const hosted = manager.create(makeQuiz([single]), 'u1', null);
    expect(manager.authorToken(hosted)).toBeNull();
  });

  it('the mark survives a restart', () => {
    const { manager, room } = attempt();
    const saved = viaJson(manager.snapshot(room));
    expect(saved.challenge).toEqual(CHALLENGE);

    const next = new RoomManager(new FakeScheduler(), () => 0.5);
    const restored = next.restore(saved);
    expect(restored?.challenge).toEqual(CHALLENGE);
    expect(restored?.lobby.visibility).toBe('hidden');
    expect(next.join(room.code, 'Тарас')).toEqual({ ok: false, error: 'game_not_found' });

    const { challenge: _mark, ...plain } = saved;
    const other = new RoomManager(new FakeScheduler(), () => 0.5);
    expect(other.restore(plain as SavedRoom)?.challenge).toBeNull();

    for (const broken of [{ id: 1, code: 'x', title: 'y' }, 'mark', null, { id: 'a', code: 'b' }]) {
      const third = new RoomManager(new FakeScheduler(), () => 0.5);
      expect(third.restore({ ...plain, challenge: broken } as unknown as SavedRoom)?.challenge).toBeNull();
    }
  });

  it('a continued attempt is still closed', () => {
    const ctx = attempt();
    const { manager, scheduler, room, authorId, author, events } = ctx;
    expect(manager.author(room, authorId, { type: 'start' })).toEqual({ ok: true });
    scheduler.advance(8000);
    expect(room.state.phase).toBe('question');
    manager.disconnect(room, author);
    scheduler.advance(AUTOPILOT_EMPTY_MS);
    expect(manager.get(room.code)).toBeUndefined();
    const last = events.at(-1)?.event;
    if (last?.type !== 'closed' || last.saved === undefined) throw new Error('not saved');
    const saved: SavedGameData = viaJson(last.saved);

    const result = manager.continueSaved(ID, 'u1', saved, CHALLENGE);
    if (!result.ok) throw new Error(result.error);
    const next = result.room;
    expect(next.id).toBe(ID);
    expect(next.challenge).toEqual(CHALLENGE);
    expect(next.lobby.visibility).toBe('hidden');
    expect(result.author?.playerId).toBe(authorId);
    expect(manager.snapshot(next).challenge).toEqual(CHALLENGE);
    expect(manager.join(next.code, 'Тарас')).toEqual({ ok: false, error: 'game_not_found' });
    expect(manager.join(next.code, 'Марта', 'u1')).toEqual({ ok: false, error: 'game_not_found' });
    expect(manager.slots(next.code, null)).toBeNull();
    expect(manager.claim(next.code, authorId, 'u1')).toEqual({ ok: false, error: 'game_not_found' });
    expect(manager.claim(next.code, authorId, null)).toEqual({ ok: false, error: 'game_not_found' });
  });

  it('the author sees the challenge', () => {
    const { manager, room, author } = attempt();
    const view = manager.view(room, author);
    const mine = view && 'author' in view ? view.author : null;
    expect(mine?.challenge).toEqual({ code: CHALLENGE.code, title: CHALLENGE.title });

    const plain = manager.createAutopilot(makeQuiz([single]), 'u1', 'q1', 'Марта');
    if (!plain.ok) throw new Error(plain.error);
    const other = manager.view(plain.room, { role: 'player', playerId: plain.playerId });
    const theirs = other && 'author' in other ? other.author : null;
    expect(theirs).not.toBeNull();
    expect(theirs && 'challenge' in theirs).toBe(false);
    expect(plain.room.challenge).toBeNull();
  });

  it('roomById', () => {
    const { manager, room, author, scheduler, authorId } = attempt();
    expect(manager.roomById(ID)).toBe(room);
    expect(manager.roomById('66666666-6666-4666-8666-666666666666')).toBeUndefined();
    manager.author(room, authorId, { type: 'start' });
    scheduler.advance(8000);
    manager.disconnect(room, author);
    scheduler.advance(AUTOPILOT_EMPTY_MS);
    expect(manager.get(room.code)).toBeUndefined();
    expect(manager.roomById(ID)).toBeUndefined();
  });
});
