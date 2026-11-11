import { describe, expect, it } from 'vitest';
import { defaultTeams, JIGSAW_HOLD_MS, JIGSAW_MOVES_PER_SECOND } from '@quiz/shared';
import { jigsaw, jigsawQuiz } from '@quiz/engine/testing';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity, type Room } from './manager';

// «Пазл» (29c) через менеджер: події з номером у раунді, частота, команда, знімок.

const HOST: Identity = { role: 'host', playerId: null };
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const spot = (piece: number) => ({ piece, x: piece % jigsaw.cols, y: Math.floor(piece / jigsaw.cols), rot: 0 });

function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { ...joined, identity };
}

/** Після першого раунду (класика з одним запитанням) відкритий пазл: номер у раунді 0, індекс у plays 1. */
function jigsawRoom(names: string[], teams = false) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(jigsawQuiz(teams ? { teams: defaultTeams(2) } : {}));
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
  for (let i = 0; i < 6 && !(room.state.phase === 'question' && room.state.plays[room.state.questionIndex].question.type === 'jigsaw'); i++) step('next');
  expect(room.state.questionIndex).toBe(1);
  return { scheduler, manager, room, people };
}

describe('jigsaw (29c) in the room manager', () => {
  it('places by the round-local number after an earlier round', () => {
    const { manager, room, people } = jigsawRoom(['Олена', 'Тарас']);
    const [olena] = people;
    expect(manager.jigsawPlace(room, olena.playerId, { questionIndex: 1, ...spot(0) })).toEqual({ ok: false, error: 'jigsaw_stale' });
    expect(manager.jigsawPlace(room, olena.playerId, { questionIndex: 0, ...spot(0) })).toEqual({ ok: true });
    const view = manager.view(room, olena.identity);
    expect(view?.role === 'player' ? view.me.jigsaw?.placed : null).toEqual([0]);
    expect(manager.jigsawPlace(room, olena.playerId, { questionIndex: 0, ...spot(0) })).toEqual({ ok: false, error: 'jigsaw_placed' });
    expect(manager.jigsawPlace(room, olena.playerId, { questionIndex: 0, ...spot(1), rot: 1 })).toEqual({ ok: false, error: 'jigsaw_miss' });
  });

  it('rate limits moves and holds in one window', () => {
    const { scheduler, manager, room, people } = jigsawRoom(['Олена', 'Тарас']);
    const [olena, taras] = people;
    for (let k = 0; k < JIGSAW_MOVES_PER_SECOND; k++) {
      expect(manager.jigsawPlace(room, olena.playerId, { questionIndex: 0, ...spot(k) })).toEqual({ ok: true });
    }
    expect(manager.jigsawPlace(room, olena.playerId, { questionIndex: 0, ...spot(9) })).toEqual({ ok: false, error: 'too_soon' });
    expect(manager.jigsawHold(room, olena.playerId, { questionIndex: 0, piece: 9 })).toEqual({ ok: false, error: 'too_soon' });
    // Вікно людини, а не кімнати.
    expect(manager.jigsawPlace(room, taras.playerId, { questionIndex: 0, ...spot(9) })).toEqual({ ok: true });
    scheduler.advance(1000);
    expect(manager.jigsawPlace(room, olena.playerId, { questionIndex: 0, ...spot(10) })).toEqual({ ok: true });
  });

  it('flags only unfinished changes for the merged push, a finished board goes out at once', () => {
    const { scheduler, manager, room, people } = jigsawRoom(['Олена', 'Тарас']);
    const [olena] = people;
    const events: unknown[] = [];
    manager.onEvent((_room, event) => events.push(event));
    for (let k = 0; k < 11; k++) {
      scheduler.advance(150);
      expect(manager.jigsawPlace(room, olena.playerId, { questionIndex: 0, ...spot(k) })).toEqual({ ok: true });
    }
    expect(events.every((e) => JSON.stringify(e) === '{"type":"changed","puzzle":true}')).toBe(true);
    events.length = 0;
    scheduler.advance(150);
    expect(manager.jigsawPlace(room, olena.playerId, { questionIndex: 0, ...spot(11) })).toEqual({ ok: true });
    expect(events).toContainEqual({ type: 'changed' });
    expect(room.state.plays[1].jigsaw?.boards[olena.playerId]?.doneMs).not.toBeNull();
  });

  it("a teammate's hold refuses my place until it expires", () => {
    const { scheduler, manager, room, people } = jigsawRoom(['Олена', 'Тарас', 'Іра', 'Марко'], true);
    const [olena, rival, mate] = [people[0], people[1], people[2]];
    // Олена й Іра — одна команда (парні індекси), Тарас — суперник.
    expect(manager.jigsawHold(room, olena.playerId, { questionIndex: 0, piece: 3 })).toEqual({ ok: true });
    expect(manager.jigsawPlace(room, mate.playerId, { questionIndex: 0, ...spot(3) })).toEqual({ ok: false, error: 'jigsaw_held' });
    expect(manager.jigsawPlace(room, rival.playerId, { questionIndex: 0, ...spot(3) })).toEqual({ ok: true });
    scheduler.advance(JIGSAW_HOLD_MS + 1);
    expect(manager.jigsawHold(room, olena.playerId, { questionIndex: 0, piece: 5 })).toEqual({ ok: true });
    scheduler.advance(JIGSAW_HOLD_MS + 1);
    expect(manager.jigsawPlace(room, mate.playerId, { questionIndex: 0, ...spot(5) })).toEqual({ ok: true });
  });

  it('a restored room keeps the jigsaw', () => {
    const { scheduler, manager, room, people } = jigsawRoom(['Олена', 'Тарас']);
    const [olena] = people;
    expect(manager.jigsawPlace(room, olena.playerId, { questionIndex: 0, ...spot(2) })).toEqual({ ok: true });
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.state.plays[1].jigsaw).toEqual(room.state.plays[1].jigsaw);
    const phone = next.identify(room.code, 'player', olena.token)?.identity;
    const view = next.view(back, phone as Identity);
    expect(view?.role === 'player' ? view.me.jigsaw?.placed : null).toEqual([2]);
  });
});
