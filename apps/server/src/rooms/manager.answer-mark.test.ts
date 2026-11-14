import { describe, expect, it } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import type { PlayerView } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const STAGE: Identity = { role: 'stage', playerId: null };

function playing() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(makeQuiz([single, text]));
  manager.connect(room, HOST);
  const joined = manager.join(room.code, 'Олена');
  if (!joined.ok) throw new Error(joined.error);
  const olena: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, olena);
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  return { scheduler, manager, room, olena };
}

const markOf = (view: unknown) => (view as PlayerView).answerMark;

describe('the answer mark on the phone view (32)', () => {
  it('counts the answers the server accepted from this phone, and only those', () => {
    const { manager, room, olena } = playing();
    const before = markOf(manager.view(room, olena))!;
    expect(before.count).toBe(0);
    expect(typeof before.epoch).toBe('number');
    expect(manager.answer(room, olena.playerId!, { type: 'single', optionId: 'b' })).toEqual({ ok: true });
    expect(markOf(manager.view(room, olena))).toEqual({ epoch: before.epoch, count: 1 });
    // Друга така сама відповідь — відмова рушія, лічильник не росте.
    expect(manager.answer(room, olena.playerId!, { type: 'single', optionId: 'b' }).ok).toBe(false);
    expect(markOf(manager.view(room, olena))).toEqual({ epoch: before.epoch, count: 1 });
  });

  it('is only on the phone view', () => {
    const { manager, room } = playing();
    expect('answerMark' in (manager.view(room, HOST) as object)).toBe(false);
    expect('answerMark' in (manager.view(room, STAGE) as object)).toBe(false);
  });

  it('a new server process starts a new epoch', () => {
    const first = playing();
    const second = playing();
    expect(markOf(first.manager.view(first.room, first.olena))!.epoch).not.toBe(markOf(second.manager.view(second.room, second.olena))!.epoch);
  });
});
