import { describe, expect, it } from 'vitest';
import { defaultTeams } from '@quiz/shared';
import { melodyQuiz } from '@quiz/engine/testing';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity, type Room } from './manager';

// «Мелодія за нотами» (29e) через менеджер: номер у раунді, одразу в розсилку, повтор без розсилки, відповідь і шматок, відновлення.

const HOST: Identity = { role: 'host', playerId: null };
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { ...joined, identity };
}

/** Після першого раунду відкрита «Мелодія»: номер у раунді 0, індекс у plays 1. */
function melodyRoom(names: string[], teams = false) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(melodyQuiz(teams ? { teams: defaultTeams(2) } : {}));
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
  for (let i = 0; i < 6 && !(room.state.phase === 'question' && room.state.plays[room.state.questionIndex].question.type === 'melody'); i++) step('next');
  expect(room.state.questionIndex).toBe(1);
  scheduler.advance(10_000);
  return { scheduler, manager, room, people };
}

const open = (manager: RoomManager, room: Room, who: { playerId: string }, step: number, questionIndex = 0) => manager.melodyOpen(room, who.playerId, { questionIndex, step });
const meOf = (manager: RoomManager, room: Room, who: { identity: Identity }) => {
  const view = manager.view(room, who.identity);
  return view?.role === 'player' ? view.me.melody : undefined;
};

describe('melody (29e) in the room manager', () => {
  it('opens chunks by the round-local number after an earlier round', () => {
    const { manager, room, people } = melodyRoom(['Олена', 'Тарас']);
    const [olena] = people;
    expect(open(manager, room, olena, 1, 1)).toEqual({ ok: false, error: 'melody_stale' });
    expect(open(manager, room, olena, 1)).toEqual({ ok: true });
    expect(meOf(manager, room, olena)).toMatchObject({ heard: 1, canOpen: true, canAnswer: true });
    expect(open(manager, room, olena, 3)).toEqual({ ok: false, error: 'melody_step' });
  });

  it('a teammate gets the shared chunk at once', () => {
    const { manager, room, people } = melodyRoom(['Олена', 'Тарас', 'Іра', 'Марко'], true);
    const [olena, , ira] = people;
    const events: unknown[] = [];
    manager.onEvent((_room, event) => events.push(event));
    expect(open(manager, room, olena, 1)).toEqual({ ok: true });
    expect(open(manager, room, olena, 2)).toEqual({ ok: true });
    expect(events.length).toBeGreaterThan(0);
    expect(meOf(manager, room, ira)).toMatchObject({ heard: 2, openedBy: 'Олена' });
  });

  it('a repeated chunk sends nothing', () => {
    const { manager, room, people } = melodyRoom(['Олена', 'Тарас']);
    const [olena] = people;
    expect(open(manager, room, olena, 1)).toEqual({ ok: true });
    const state = room.state;
    const events: unknown[] = [];
    manager.onEvent((_room, event) => events.push(event));
    expect(open(manager, room, olena, 1)).toEqual({ ok: true });
    expect(room.state).toBe(state);
    expect(events).toEqual([]);
  });

  it('answers pay by the chunk', () => {
    const { manager, room, people } = melodyRoom(['Олена', 'Тарас']);
    const [olena] = people;
    for (const n of [1, 2, 3]) expect(open(manager, room, olena, n)).toEqual({ ok: true });
    expect(manager.answer(room, olena.playerId, { type: 'melody', value: 'Щедрик' })).toEqual({ ok: true });
    expect(room.state.plays[1].answers[olena.playerId]?.points).toBe(600);
    expect(open(manager, room, olena, 4)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('host replay plays the melody on reveal only', () => {
    const { manager, room, people } = melodyRoom(['Олена', 'Тарас']);
    expect(manager.audio(room, 'replay')).toEqual({ ok: false, error: 'wrong_phase' });
    for (const who of people) expect(open(manager, room, who, 1)).toEqual({ ok: true });
    expect(manager.host(room, { type: 'lock' })).toEqual({ ok: true });
    expect(manager.audio(room, 'replay')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');
    expect(manager.audio(room, 'replay')).toEqual({ ok: true });
  });

  it('a restored room keeps the chunks', () => {
    const { scheduler, manager, room, people } = melodyRoom(['Олена', 'Тарас']);
    const [olena] = people;
    expect(open(manager, room, olena, 1)).toEqual({ ok: true });
    expect(open(manager, room, olena, 2)).toEqual({ ok: true });
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    const phone = next.identify(room.code, 'player', olena.token)?.identity as Identity;
    expect(meOf(next, back, { identity: phone })?.heard).toBe(2);
    expect(back.state.plays[1].melody).toEqual(room.state.plays[1].melody);
  });
});
