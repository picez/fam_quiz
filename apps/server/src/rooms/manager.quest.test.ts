import { describe, expect, it } from 'vitest';
import { defaultTeams, QUEST_WINDOW_MS } from '@quiz/shared';
import { QUEST_RIGHT, questQuiz } from '@quiz/engine/testing';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity, type Room } from './manager';

// «Квест із кодом» (29g) через менеджер: подія player:quest, команди, вікно після запитань і годинник кімнати.

const HOST: Identity = { role: 'host', playerId: null };

function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { ...joined, identity };
}

/** Після першого (класичного) раунду — intro раунду quest. */
function questRoom(names: string[], teams = false) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(questQuiz(teams ? { teams: defaultTeams(2), leaderboard: 'end' } : { leaderboard: 'end' }));
  manager.connect(room, HOST);
  const people = names.map((name) => enter(manager, room, name));
  if (teams) {
    const [red, blue] = room.state.teams!.list.map((t) => t.id);
    people.forEach((who, i) => expect(manager.host(room, { type: 'team-assign', memberId: who.playerId, teamId: i % 2 === 0 ? red : blue })).toEqual({ ok: true }));
  }
  const step = (type: 'start' | 'next' | 'lock') => expect(manager.host(room, { type })).toEqual({ ok: true });
  step('start');
  step('next');
  step('lock');
  for (let i = 0; i < 6 && room.state.phase !== 'intro'; i++) step('next');
  expect(room.state.phase).toBe('intro');
  expect(room.state.quest?.stage).toBe('play');
  return { scheduler, manager, room, people };
}

const code = (manager: RoomManager, room: Room, who: { playerId: string }, value: unknown) => manager.questCode(room, who.playerId, { code: value as string });
const meOf = (manager: RoomManager, room: Room, who: { identity: Identity }) => {
  const view = manager.view(room, who.identity);
  return view?.role === 'player' ? view.me.quest : undefined;
};

/** Усі п'ять запитань: відповіді правильні в answers, далі розкриття; після останнього — вікно коду. */
function playAll(manager: RoomManager, room: Room, answers: { playerId: string }[]) {
  for (let i = 0; i < 5; i++) {
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    for (const who of answers) expect(manager.answer(room, who.playerId, QUEST_RIGHT[i]!)).toEqual({ ok: true });
    expect(manager.host(room, { type: 'lock' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  }
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
}

describe('quest (29g) in the room manager', () => {
  it('a code is accepted at any moment of the round and a wrong one burns a try', () => {
    const { manager, room, people } = questRoom(['Оля', 'Тарас']);
    const [ola, taras] = people;
    expect(code(manager, room, ola, 'СОВИ')).toEqual({ ok: true });
    expect(meOf(manager, room, ola!)).toMatchObject({ left: 2, tries: ['СОВИ'], solved: null });
    expect(code(manager, room, ola, 'сов')).toEqual({ ok: false, error: 'quest_length' });
    expect(code(manager, room, ola, 'сови')).toEqual({ ok: false, error: 'quest_repeat' });
    expect(code(manager, room, taras, 'сова')).toEqual({ ok: true });
    expect(meOf(manager, room, taras)?.solved).toMatchObject({ points: 1200 });
    const stage = manager.view(room, { role: 'stage', playerId: null });
    expect(stage?.quest?.rows.find((row) => row.nickname === 'Тарас')?.solved).toMatchObject({ place: 1, points: 1200 });
    expect(code(manager, room, taras, 'сова')).toEqual({ ok: false, error: 'quest_solved' });
  });

  it('refuses a code in a classic round', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const room = manager.create(questQuiz());
    manager.connect(room, HOST);
    const ola = enter(manager, room, 'Оля');
    expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(code(manager, room, ola, 'сова')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('any teammate enters for the team and the tries are shared', () => {
    const { manager, room, people } = questRoom(['Оля', 'Тарас', 'Іра', 'Марко'], true);
    const [ola, taras, ira] = people;
    // Оля з Ірою в одній команді, Тарас з Марком — в іншій.
    expect(code(manager, room, ira!, 'СОВИ')).toEqual({ ok: true });
    expect(meOf(manager, room, ola)).toMatchObject({ left: 2, tries: ['СОВИ'] });
    expect(meOf(manager, room, ira!)).toMatchObject({ left: 2, tries: ['СОВИ'] });
    expect(meOf(manager, room, taras!)).toMatchObject({ left: 3, tries: [] });
  });

  it('the room closes the window by its clock and shows the code', () => {
    const { scheduler, manager, room, people } = questRoom(['Оля', 'Тарас']);
    const [ola] = people;
    playAll(manager, room, [ola!]);
    expect(room.state.quest?.stage).toBe('window');
    expect(room.state.phase).toBe('leaderboard');
    expect(room.state.endsAt! - room.state.startedAt!).toBe(QUEST_WINDOW_MS);
    expect(code(manager, room, ola!, 'сова')).toEqual({ ok: true });
    expect(meOf(manager, room, ola!)?.solved?.points).toBeGreaterThan(0);
    scheduler.advance(QUEST_WINDOW_MS - 1);
    expect(room.state.quest?.stage).toBe('window');
    scheduler.advance(2);
    expect(room.state.quest?.stage).toBe('shown');
    expect(room.state.phase).toBe('leaderboard');
    expect(code(manager, room, people[1]!, 'сова')).toEqual({ ok: false, error: 'quest_closed' });
  });

  it('the host closes the window earlier and the next press ends the round', () => {
    const { manager, room, people } = questRoom(['Оля', 'Тарас']);
    playAll(manager, room, [people[0]!]);
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.quest?.stage).toBe('shown');
    expect(room.state.phase).toBe('leaderboard');
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('finished');
  });

});
