import { describe, expect, it } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import type { HostView, PlayerView } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity, type RoomChallenge, type RoomEvent, type RoomLeague, type SavedRoom } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const LEAGUE: RoomLeague = { groupId: '66666666-6666-4666-8666-666666666666', groupName: 'Родина' };
const CHALLENGE: RoomChallenge = { id: '55555555-5555-4555-8555-555555555555', code: 'abcdefghjkmn', title: 'Родинна вікторина' };
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function world() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5, { pacing: false });
  const events: RoomEvent[] = [];
  manager.onEvent((_room, event) => events.push(event));
  return { scheduler, manager, events };
}

/** Лобі ведучого 'host' з гравцями: Оля (u1), Петро (u2), гість. */
function lobby(w = world()) {
  const room = w.manager.create(makeQuiz([single, text]), 'host');
  const join = (nickname: string, userId: string | null) => {
    const joined = w.manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    return joined.playerId;
  };
  return { ...w, room, olya: join('Оля', 'u1'), petro: join('Петро', 'u2'), guest: join('Гість', null) };
}

const player = (w: ReturnType<typeof lobby>, playerId: string) => w.manager.view(w.room, { role: 'player', playerId }) as PlayerView;
const hostOf = (w: ReturnType<typeof lobby>) => w.manager.view(w.room, HOST) as HostView;

describe('the family league mark of a room (45)', () => {
  it('the host marks the lobby for a group', () => {
    const w = lobby();
    expect(w.room.league).toBeNull();
    expect('league' in player(w, w.olya)).toBe(false);
    expect('league' in hostOf(w)).toBe(false);
    w.events.length = 0;
    expect(w.manager.setLeague(w.room, LEAGUE)).toEqual({ ok: true });
    expect(w.room.league).toEqual(LEAGUE);
    expect(w.events.map((e) => e.type)).toContain('changed');
    expect(player(w, w.olya).league).toEqual({ group: 'Родина' });
    expect(player(w, w.guest).league).toEqual({ group: 'Родина' });
    expect(hostOf(w).league).toEqual({ group: 'Родина' });
    expect(w.manager.view(w.room, { role: 'stage', playerId: null })).not.toHaveProperty('league');
    expect(w.manager.setLeague(w.room, null)).toEqual({ ok: true });
    expect(w.room.league).toBeNull();
    expect('league' in player(w, w.olya)).toBe(false);
    expect('league' in hostOf(w)).toBe(false);
  });

  it('not after the start', () => {
    const w = lobby();
    expect(w.manager.setLeague(w.room, LEAGUE)).toEqual({ ok: true });
    expect(w.manager.host(w.room, { type: 'start' })).toEqual({ ok: true });
    expect(w.manager.setLeague(w.room, null)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(w.room.league).toEqual(LEAGUE);
  });

  it('not in a challenge room', () => {
    const w = world();
    const created = w.manager.createAutopilot(makeQuiz([single, text]), 'u1', null, 'Марта', { challenge: CHALLENGE });
    if (!created.ok) throw new Error(created.error);
    expect(w.manager.setLeague(created.room, LEAGUE)).toEqual({ ok: false, error: 'not_allowed' });
    expect(created.room.league).toBeNull();
  });

  it('survives a restart', () => {
    const w = lobby();
    w.manager.setLeague(w.room, LEAGUE);
    const saved = viaJson(w.manager.snapshot(w.room));
    expect(saved.league).toEqual(LEAGUE);
    expect(saved.stateVersion).toBe(22);
    expect(saved.state).not.toHaveProperty('league');

    const other = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    const back = other.restore(saved);
    expect(back?.league).toEqual(LEAGUE);

    const broken = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    const room = broken.restore({ ...saved, league: { groupId: 5 } } as unknown as SavedRoom);
    expect(room).not.toBeNull();
    expect(room?.league).toBeNull();
    const notUuid = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    expect(notUuid.restore({ ...saved, league: { groupId: 'nope', groupName: 'Родина' } })?.league).toBeNull();

    // Старий знімок без поля — звичайна кімната.
    const { league: _drop, ...old } = saved;
    const plain = new RoomManager(new FakeScheduler(), () => 0.5, { pacing: false });
    const oldRoom = plain.restore(old as SavedRoom);
    expect(oldRoom).not.toBeNull();
    expect(oldRoom?.league).toBeNull();
    expect('league' in plain.snapshot(oldRoom!)).toBe(false);
  });

  it('the result goes to the views', () => {
    const w = lobby();
    w.manager.setLeague(w.room, LEAGUE);
    w.events.length = 0;
    w.manager.setLeagueResult(w.room, {
      counted: true,
      rows: [
        { userId: 'u3', nickname: 'Віра', points: 5 },
        { userId: 'u1', nickname: 'Оля', points: 10 },
        { userId: 'u2', nickname: 'Петро', points: 7 },
      ],
    });
    expect(w.events.map((e) => e.type)).toContain('changed');
    expect(player(w, w.petro).league).toEqual({ group: 'Родина', points: 7 });
    expect(player(w, w.olya).league).toEqual({ group: 'Родина', points: 10 });
    expect(player(w, w.guest).league).toEqual({ group: 'Родина' });
    expect(hostOf(w).league).toEqual({
      group: 'Родина',
      rows: [
        { nickname: 'Оля', points: 10 },
        { nickname: 'Петро', points: 7 },
        { nickname: 'Віра', points: 5 },
      ],
    });
    // Той самий підсумок — без розсилки.
    w.events.length = 0;
    w.manager.setLeagueResult(w.room, {
      counted: true,
      rows: [
        { userId: 'u3', nickname: 'Віра', points: 5 },
        { userId: 'u1', nickname: 'Оля', points: 10 },
        { userId: 'u2', nickname: 'Петро', points: 7 },
      ],
    });
    expect(w.events).toEqual([]);

    w.manager.setLeagueResult(w.room, { counted: false, rows: [] });
    expect(hostOf(w).league).toEqual({ group: 'Родина', tooFew: true });
    expect(player(w, w.olya).league).toEqual({ group: 'Родина' });
  });

  it('the autopilot author sees too few members', () => {
    const w = world();
    const created = w.manager.createAutopilot(makeQuiz([single, text]), 'u1', null, 'Марта');
    if (!created.ok) throw new Error(created.error);
    const { room } = created;
    const joined = w.manager.join(room.code, 'Петро', 'u2');
    if (!joined.ok) throw new Error(joined.error);
    expect(w.manager.setLeague(room, LEAGUE)).toEqual({ ok: true });
    w.manager.setLeagueResult(room, { counted: false, rows: [] });
    const author = w.manager.view(room, { role: 'player', playerId: created.playerId }) as PlayerView;
    expect(author.league).toEqual({ group: 'Родина', tooFew: true });
    const other = w.manager.view(room, { role: 'player', playerId: joined.playerId }) as PlayerView;
    expect(other.league).toEqual({ group: 'Родина' });
  });
});
