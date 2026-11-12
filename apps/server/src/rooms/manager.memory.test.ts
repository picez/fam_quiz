import { describe, expect, it } from 'vitest';
import { defaultTeams, MEMORY_FLIPS_PER_SECOND, MEMORY_SHOW_MS, MEMORY_TURN_MS, memoryLayout } from '@quiz/shared';
import { memoryQuiz } from '@quiz/engine/testing';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity, type Room } from './manager';

// «Пам'ять» (29f) через менеджер: номер у раунді, частота, таймери розсилки, останню пару одразу, знімок.

const HOST: Identity = { role: 'host', playerId: null };
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const LAYOUT = memoryLayout(6, 42);
/** Клітинки пари pair за розкладом seed 42. */
const cellsOf = (pair: number): [number, number] => [LAYOUT.indexOf(2 * pair), LAYOUT.indexOf(2 * pair + 1)];
const flip = (manager: RoomManager, room: Room, who: { playerId: string }, cell: number, questionIndex = 0) => manager.memoryFlip(room, who.playerId, { questionIndex, cell });

function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { ...joined, identity };
}

/** Після першого раунду відкрита «Пам'ять»: номер у раунді 0, індекс у plays 1. */
function memoryRoom(names: string[], teams = false) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(memoryQuiz(teams ? { teams: defaultTeams(2) } : {}));
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
  for (let i = 0; i < 6 && !(room.state.phase === 'question' && room.state.plays[room.state.questionIndex].question.type === 'memory'); i++) step('next');
  expect(room.state.questionIndex).toBe(1);
  return { scheduler, manager, room, people };
}

const cellsOfView = (manager: RoomManager, room: Room, who: { identity: Identity }) => {
  const view = manager.view(room, who.identity);
  return view?.role === 'player' ? view.me.memory?.cells : undefined;
};

describe('memory (29f) in the room manager', () => {
  it('flips by the round-local number after an earlier round', () => {
    const { manager, room, people } = memoryRoom(['Олена', 'Тарас']);
    const [olena] = people;
    expect(flip(manager, room, olena, 0, 1)).toEqual({ ok: false, error: 'memory_stale' });
    expect(flip(manager, room, olena, cellsOf(0)[0])).toEqual({ ok: true });
    expect(cellsOfView(manager, room, olena)?.[cellsOf(0)[0]]).toMatchObject({ state: 'open' });
  });

  it('the server pushes the closing at one second', () => {
    const { scheduler, manager, room, people } = memoryRoom(['Олена', 'Тарас']);
    const [olena] = people;
    const events: unknown[] = [];
    manager.onEvent((_room, event) => events.push(event));
    const wrong: [number, number] = [cellsOf(0)[0], cellsOf(1)[0]];
    expect(flip(manager, room, olena, wrong[0])).toEqual({ ok: true });
    expect(flip(manager, room, olena, wrong[1])).toEqual({ ok: true });
    expect(cellsOfView(manager, room, olena)?.[wrong[1]]).toMatchObject({ state: 'shown' });
    scheduler.advance(MEMORY_SHOW_MS - 1);
    expect(cellsOfView(manager, room, olena)?.[wrong[1]]).toMatchObject({ state: 'shown' });
    events.length = 0;
    scheduler.advance(1);
    expect(events).toContainEqual({ type: 'changed', puzzle: true });
    const cells = cellsOfView(manager, room, olena);
    expect(cells?.[wrong[0]]).toBeNull();
    expect(cells?.[wrong[1]]).toBeNull();
  });

  it('the end of a team move is pushed at five seconds', () => {
    const { scheduler, manager, room, people } = memoryRoom(['Олена', 'Тарас', 'Іра', 'Марко'], true);
    const [olena, , ira] = people;
    expect(flip(manager, room, olena, cellsOf(0)[0])).toEqual({ ok: true });
    expect(flip(manager, room, ira, cellsOf(1)[0])).toEqual({ ok: false, error: 'memory_busy' });
    const events: unknown[] = [];
    manager.onEvent((_room, event) => events.push(event));
    scheduler.advance(MEMORY_TURN_MS - 1);
    expect(events).toEqual([]);
    scheduler.advance(1);
    expect(events).toContainEqual({ type: 'changed', puzzle: true });
    expect(cellsOfView(manager, room, olena)?.[cellsOf(0)[0]]).toBeNull();
    expect(flip(manager, room, ira, cellsOf(1)[0])).toEqual({ ok: true });
  });

  it('a restored room keeps the grid and the timers', () => {
    const { scheduler, manager, room, people } = memoryRoom(['Олена', 'Тарас']);
    const [olena] = people;
    const [a, b] = cellsOf(0);
    expect(flip(manager, room, olena, a)).toEqual({ ok: true });
    scheduler.advance(300);
    expect(flip(manager, room, olena, b)).toEqual({ ok: true });
    scheduler.advance(MEMORY_SHOW_MS);
    const wrong: [number, number] = [cellsOf(1)[0], cellsOf(2)[0]];
    expect(flip(manager, room, olena, wrong[0])).toEqual({ ok: true });
    scheduler.advance(300);
    expect(flip(manager, room, olena, wrong[1])).toEqual({ ok: true });
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5);
    const events: unknown[] = [];
    next.onEvent((_room, event) => events.push(event));
    const back = next.restore(saved) as Room;
    expect(back.state.plays[1].memory).toEqual(room.state.plays[1].memory);
    expect(back.holdExpiry).not.toBeNull();
    const phone = next.identify(room.code, 'player', olena.token)?.identity as Identity;
    const before = cellsOfView(next, back, { identity: phone });
    expect(before?.[wrong[1]]).toMatchObject({ state: 'shown' });
    events.length = 0;
    scheduler.advance(MEMORY_SHOW_MS);
    expect(events).toContainEqual({ type: 'changed', puzzle: true });
    const after = cellsOfView(next, back, { identity: phone });
    expect(after?.[a]).toMatchObject({ state: 'matched' });
    expect(after?.[wrong[1]]).toBeNull();
  });

  it('memory flips are rate limited per person', () => {
    const { scheduler, manager, room, people } = memoryRoom(['Олена', 'Тарас']);
    const [olena, taras] = people;
    // Повтор тієї самої відкритої картки не змінює стан, але рахується у вікні частоти.
    expect(flip(manager, room, olena, 0)).toEqual({ ok: true });
    for (let k = 1; k < MEMORY_FLIPS_PER_SECOND; k++) expect(flip(manager, room, olena, 0)).toEqual({ ok: false, error: 'memory_open' });
    expect(flip(manager, room, olena, 1)).toEqual({ ok: false, error: 'too_soon' });
    expect(flip(manager, room, taras, 1)).toEqual({ ok: true });
    scheduler.advance(1000);
    expect(flip(manager, room, olena, 1)).not.toEqual({ ok: false, error: 'too_soon' });
  });

  it('the last pair goes out at once', () => {
    const { scheduler, manager, room, people } = memoryRoom(['Олена', 'Тарас']);
    const [olena] = people;
    const events: unknown[] = [];
    manager.onEvent((_room, event) => events.push(event));
    for (let pair = 0; pair < 5; pair++) {
      scheduler.advance(300);
      expect(flip(manager, room, olena, cellsOf(pair)[0])).toEqual({ ok: true });
      scheduler.advance(300);
      expect(flip(manager, room, olena, cellsOf(pair)[1])).toEqual({ ok: true });
    }
    expect(events.every((e) => JSON.stringify(e) === '{"type":"changed","puzzle":true}')).toBe(true);
    events.length = 0;
    scheduler.advance(300);
    expect(flip(manager, room, olena, cellsOf(5)[0])).toEqual({ ok: true });
    scheduler.advance(300);
    expect(flip(manager, room, olena, cellsOf(5)[1])).toEqual({ ok: true });
    expect(events).toContainEqual({ type: 'changed' });
    expect(room.state.plays[1].memory?.boards[olena.playerId]?.doneMs).not.toBeNull();
  });
});
