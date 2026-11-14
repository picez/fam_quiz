import { describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, single } from '@quiz/engine/testing';
import { defaultTeams, type Quiz } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { startTeamGame, toEnd } from '../testing/team-game';

/** Соло: старт з лобі й до кінця. */
function finish(manager: RoomManager, room: Room) {
  if (room.state.phase === 'lobby') expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  toEnd(manager, room);
}
import { RoomManager, type Identity, type Room, type RoomEvent } from './manager';

const STAGE: Identity = { role: 'stage', playerId: null };
const HOST: Identity = { role: 'host', playerId: null };
const quiz: Quiz = makeRoundsQuiz([classicRound('r1', [single])]);

function world() {
  const manager = new RoomManager(new FakeScheduler(), () => 0.5);
  const events: { room: Room; event: RoomEvent }[] = [];
  manager.onEvent((room, event) => events.push({ room, event }));
  const room = manager.create(quiz, 'host-user', null);
  manager.connect(room, HOST);
  const enter = (nickname: string, userId: string | null) => {
    const joined = manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const changes = () => events.filter((e) => e.room === room && e.event.type === 'changed').length;
  return { manager, room, enter, changes };
}

const phone = (manager: RoomManager, room: Room, playerId: string) => manager.view(room, { role: 'player', playerId }) as unknown as Record<string, unknown>;
const stage = (manager: RoomManager, room: Room) => manager.view(room, STAGE) as unknown as Record<string, unknown>;

describe('«Нове досягнення!» in the room (12j)', () => {
  it('before the award: no key for an account, the sign-in hint for a guest, nothing on the stage', () => {
    const w = world();
    const olya = w.enter('Оля', 'u-olya');
    const ira = w.enter('Іра', null);
    finish(w.manager, w.room);
    expect(w.room.state.phase).toBe('finished');
    expect('newAchievements' in phone(w.manager, w.room, olya)).toBe(false);
    expect(phone(w.manager, w.room, ira).newAchievements).toEqual({ account: false, ids: [] });
    expect('newAchievements' in stage(w.manager, w.room)).toBe(false);
  });

  it('after the award: the phone and the stage list the common ones first; the same award again changes nothing', () => {
    const w = world();
    const olya = w.enter('Оля', 'u-olya');
    w.enter('Іра', null);
    finish(w.manager, w.room);
    const before = w.changes();
    w.manager.setNewAchievements(w.room, new Map([['u-olya', ['in_debt', 'fast_answer']]]), new Set());
    expect(w.changes()).toBe(before + 1);
    expect(phone(w.manager, w.room, olya).newAchievements).toEqual({ account: true, ids: ['fast_answer', 'in_debt'] });
    expect(stage(w.manager, w.room).newAchievements).toEqual({ people: [{ nickname: 'Оля', ids: ['fast_answer', 'in_debt'] }] });
    w.manager.setNewAchievements(w.room, new Map([['u-olya', ['in_debt', 'fast_answer']]]), new Set());
    expect(w.changes()).toBe(before + 1);
    expect('newAchievements' in (w.manager.view(w.room, HOST) as unknown as Record<string, unknown>)).toBe(false);
  });

  it('hidden anti-achievements leave the stage, never the own phone', () => {
    const w = world();
    const olya = w.enter('Оля', 'u-olya');
    finish(w.manager, w.room);
    w.manager.setNewAchievements(w.room, new Map([['u-olya', ['in_debt', 'fast_answer']]]), new Set(['u-olya']));
    expect(stage(w.manager, w.room).newAchievements).toEqual({ people: [{ nickname: 'Оля', ids: ['fast_answer'] }] });

    const v = world();
    const vira = v.enter('Віра', 'u-vira');
    finish(v.manager, v.room);
    v.manager.setNewAchievements(v.room, new Map([['u-vira', ['in_debt']]]), new Set(['u-vira']));
    expect('newAchievements' in stage(v.manager, v.room)).toBe(false);
    expect(phone(v.manager, v.room, vira).newAchievements).toEqual({ account: true, ids: ['in_debt'] });
    expect(phone(w.manager, w.room, olya).newAchievements).toEqual({ account: true, ids: ['fast_answer', 'in_debt'] });
  });

  it('outside finished nobody has the key', () => {
    const w = world();
    const olya = w.enter('Оля', 'u-olya');
    const ira = w.enter('Іра', null);
    w.manager.setNewAchievements(w.room, new Map([['u-olya', ['fast_answer']]]), new Set());
    expect('newAchievements' in phone(w.manager, w.room, olya)).toBe(false);
    expect('newAchievements' in phone(w.manager, w.room, ira)).toBe(false);
    expect('newAchievements' in stage(w.manager, w.room)).toBe(false);
  });

  it('a team game lists the people of the teams by their own nicknames', () => {
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const teamQuiz = makeRoundsQuiz([classicRound('r1', [single])], { teams: defaultTeams(2) });
    const { room, members } = startTeamGame(manager, teamQuiz, [['Оля'], ['Віра']], { Оля: 'u-olya', Віра: 'u-vira' });
    toEnd(manager, room);
    manager.setNewAchievements(room, new Map([['u-vira', ['team_win']], ['u-olya', ['last_place']]]), new Set());
    expect(stage(manager, room).newAchievements).toEqual({
      people: [
        { nickname: 'Оля', ids: ['last_place'] },
        { nickname: 'Віра', ids: ['team_win'] },
      ],
    });
    expect(phone(manager, room, members['Віра']).newAchievements).toEqual({ account: true, ids: ['team_win'] });
  });

  it('a game without fact awards still has the slide: the host gets awardsExtra and «Нагороди на сцені» moves the stage', () => {
    const w = world();
    w.enter('Оля', 'u-olya');
    finish(w.manager, w.room);
    const host = () => w.manager.view(w.room, HOST) as unknown as Record<string, unknown>;
    expect(w.manager.awards(w.room)).toEqual({ ok: false, error: 'wrong_phase' });
    expect('awardsExtra' in host()).toBe(false);
    w.manager.setNewAchievements(w.room, new Map([['u-olya', ['first_game']]]), new Set());
    expect(host().awardsExtra).toBe(true);
    expect(w.manager.awards(w.room)).toEqual({ ok: true });
    expect(stage(w.manager, w.room).newAchievements).toEqual({ people: [{ nickname: 'Оля', ids: ['first_game'] }] });
  });

  it('the room snapshot does not keep it; a restored room starts with null', () => {
    const w = world();
    w.enter('Оля', 'u-olya');
    finish(w.manager, w.room);
    w.manager.setNewAchievements(w.room, new Map([['u-olya', ['fast_answer']]]), new Set());
    const saved = JSON.parse(JSON.stringify(w.manager.snapshot(w.room)));
    expect('newAchievements' in saved).toBe(false);
    const other = new RoomManager(new FakeScheduler(), () => 0.5);
    expect(other.restore(saved)?.newAchievements).toBeNull();
  });
});
