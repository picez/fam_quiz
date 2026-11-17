import { describe, expect, it } from 'vitest';
import { alikeQuiz } from '@quiz/engine/testing';
import { RoomManager, type Identity, type Room } from './manager';
import { FakeScheduler } from '../testing/fake-scheduler';

// «Думай як усі» (37e) через менеджер: відповіді, бали при закритті, правки ведучого на reveal, відновлення з групами.

const HOST: Identity = { role: 'host', playerId: null };
const STAGE: Identity = { role: 'stage', playerId: null };
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const word = (value: string) => ({ type: 'thinkalike', value }) as const;

function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  manager.connect(room, { role: 'player', playerId: joined.playerId });
  return joined.playerId;
}

/** Олена й Тарас — «яблуко», Петро — «груша»; запитання закрите таймером, ще на locked. */
function locked() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(alikeQuiz());
  manager.connect(room, HOST);
  manager.connect(room, STAGE);
  const [olena, taras, petro] = ['Олена', 'Тарас', 'Петро'].map((name) => enter(manager, room, name)) as [string, string, string];
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  expect(manager.answer(room, olena, word('яблуко'))).toEqual({ ok: true });
  expect(manager.answer(room, taras, word('Яблуко'))).toEqual({ ok: true });
  expect(manager.answer(room, petro, word('груша'))).toEqual({ ok: true });
  scheduler.advance(30_000);
  const points = () => [olena, taras, petro].map((id) => room.state.plays[0]!.answers[id]?.points);
  return { scheduler, manager, room, olena, taras, petro, points };
}

const hostAlike = (manager: RoomManager, room: Room) => {
  const view = manager.view(room, HOST);
  return view?.role === 'host' ? view.alike : undefined;
};

describe('thinkalike (37e) in the room manager', () => {
  it('scores at lock and hides the words from phones and the stage until reveal', () => {
    const { manager, room, olena, points } = locked();
    expect(room.state.phase).toBe('locked');
    expect(points()).toEqual([1000, 1000, 0]);
    const hidden = [STAGE, { role: 'player', playerId: olena } as Identity].map((who) => JSON.stringify(manager.view(room, who)));
    for (const json of hidden) expect(json).not.toContain('груша');
    expect(hostAlike(manager, room)?.groups).toHaveLength(2);
  });

  it('the host splits and joins on reveal; elsewhere it is refused', () => {
    const { manager, room, olena, taras, petro, points } = locked();
    expect(manager.host(room, { type: 'alike-split', playerId: taras })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');
    expect(manager.host(room, { type: 'alike-split', playerId: taras })).toEqual({ ok: true });
    expect(points()).toEqual([0, 0, 0]);
    expect(hostAlike(manager, room)?.groups).toHaveLength(3);
    const scene = manager.view(room, STAGE);
    expect(scene?.role === 'stage' && scene.alike?.groups).toHaveLength(3);
    expect(manager.host(room, { type: 'alike-split', playerId: taras })).toEqual({ ok: false, error: 'alike_group' });
    expect(manager.host(room, { type: 'alike-join', from: `solo:${taras}`, to: olena })).toEqual({ ok: true });
    expect(points()).toEqual([1000, 1000, 0]);
    expect(manager.host(room, { type: 'alike-join', from: petro, to: petro })).toEqual({ ok: false, error: 'alike_group' });
  });

  it('a restored room keeps the host groups', () => {
    const { scheduler, manager, room, taras } = locked();
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(manager.host(room, { type: 'alike-split', playerId: taras })).toEqual({ ok: true });
    const before = hostAlike(manager, room);
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(hostAlike(next, back)?.groups).toEqual(before?.groups);
    expect(back.state.plays[0]?.alike?.labels).toEqual(room.state.plays[0]?.alike?.labels);
  });

  it('the autopilot author cannot edit the groups', () => {
    const manager = new RoomManager(new FakeScheduler(), () => 0.5);
    const created = manager.createAutopilot(alikeQuiz(), 'u1', 'q1', 'Марта');
    if (!created.ok) throw new Error(created.error);
    expect(manager.author(created.room, created.playerId, { type: 'alike-split', playerId: created.playerId })).toEqual({ ok: false, error: 'not_allowed' });
  });
});
