import { describe, expect, it } from 'vitest';
import { SPOTDIFF_FREEZE_MS, SPOTDIFF_TAPS_PER_SECOND } from '@quiz/shared';
import { spotdiff, spotdiffQuiz } from '@quiz/engine/testing';
import { FakeScheduler } from '../testing/fake-scheduler';
import { RoomManager, type Identity, type Room } from './manager';

// «Знайди відмінності» (29d) через менеджер: номер у раунді, ack промаху, заморозка, частота, розсилка, знімок.

const HOST: Identity = { role: 'host', playerId: null };
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const tapAt = (index: number, questionIndex = 0) => ({ questionIndex, x: spotdiff.spots[index].x, y: spotdiff.spots[index].y, width: 400 });
const MISS = { questionIndex: 0, x: 0.95, y: 0.05, width: 400 };

function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { ...joined, identity };
}

/** Після першого раунду відкрите «Знайди відмінності»: номер у раунді 0, індекс у plays 1. */
function spotRoom(names: string[]) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(spotdiffQuiz());
  manager.connect(room, HOST);
  const people = names.map((name) => enter(manager, room, name));
  const step = (type: 'start' | 'next' | 'lock') => expect(manager.host(room, { type })).toEqual({ ok: true });
  step('start');
  step('next');
  step('lock');
  for (let i = 0; i < 6 && !(room.state.phase === 'question' && room.state.plays[room.state.questionIndex].question.type === 'spotdiff'); i++) step('next');
  expect(room.state.questionIndex).toBe(1);
  return { scheduler, manager, room, people };
}

describe('spotdiff (29d) in the room manager', () => {
  it('taps by the round-local number after an earlier round', () => {
    const { manager, room, people } = spotRoom(['Олена', 'Тарас']);
    const [olena] = people;
    expect(manager.spotdiffTap(room, olena.playerId, tapAt(0, 1))).toEqual({ ok: false, error: 'spotdiff_stale' });
    expect(manager.spotdiffTap(room, olena.playerId, tapAt(0))).toEqual({ ok: true });
    const view = manager.view(room, olena.identity);
    expect(view?.role === 'player' ? view.me.spotdiff?.found.map((f) => f.index) : null).toEqual([0]);
  });

  it('a miss answers spotdiff_miss and is kept, three misses freeze', () => {
    const { scheduler, manager, room, people } = spotRoom(['Олена', 'Тарас']);
    const [olena] = people;
    expect(manager.spotdiffTap(room, olena.playerId, MISS)).toEqual({ ok: false, error: 'spotdiff_miss' });
    expect(room.state.plays[1].spotdiff?.boards[olena.playerId]?.misses[olena.playerId]).toBe(1);
    scheduler.advance(200);
    expect(manager.spotdiffTap(room, olena.playerId, MISS)).toEqual({ ok: false, error: 'spotdiff_miss' });
    scheduler.advance(200);
    expect(manager.spotdiffTap(room, olena.playerId, MISS)).toEqual({ ok: false, error: 'spotdiff_freeze' });
    const board = room.state.plays[1].spotdiff?.boards[olena.playerId];
    expect(board?.misses[olena.playerId]).toBe(0);
    expect(board?.frozenUntil[olena.playerId]).toBeGreaterThan(0);
    expect(manager.spotdiffTap(room, olena.playerId, tapAt(0))).toEqual({ ok: false, error: 'spotdiff_frozen' });
    scheduler.advance(SPOTDIFF_FREEZE_MS);
    expect(manager.spotdiffTap(room, olena.playerId, tapAt(0))).toEqual({ ok: true });
  });

  it('spotdiff taps are rate limited per person', () => {
    const { scheduler, manager, room, people } = spotRoom(['Олена', 'Тарас']);
    const [olena, taras] = people;
    // Влучання по вже знайденому не змінює стан, але рахується у вікні частоти.
    expect(manager.spotdiffTap(room, olena.playerId, tapAt(0))).toEqual({ ok: true });
    for (let k = 1; k < SPOTDIFF_TAPS_PER_SECOND; k++) expect(manager.spotdiffTap(room, olena.playerId, tapAt(0)).ok).toBe(false);
    expect(manager.spotdiffTap(room, olena.playerId, tapAt(1))).toEqual({ ok: false, error: 'too_soon' });
    expect(manager.spotdiffTap(room, taras.playerId, tapAt(1))).toEqual({ ok: true });
    scheduler.advance(1000);
    expect(manager.spotdiffTap(room, olena.playerId, tapAt(1))).toEqual({ ok: true });
  });

  it('a hit goes out at once, a miss is merged', () => {
    const { scheduler, manager, room, people } = spotRoom(['Олена', 'Тарас']);
    const [olena] = people;
    const events: unknown[] = [];
    manager.onEvent((_room, event) => events.push(event));
    expect(manager.spotdiffTap(room, olena.playerId, MISS)).toEqual({ ok: false, error: 'spotdiff_miss' });
    expect(events).toEqual([{ type: 'changed', puzzle: true }]);
    events.length = 0;
    scheduler.advance(200);
    expect(manager.spotdiffTap(room, olena.playerId, tapAt(0))).toEqual({ ok: true });
    expect(events).toEqual([{ type: 'changed' }]);
  });

  it('a restored room keeps the finds and the misses', () => {
    const { scheduler, manager, room, people } = spotRoom(['Олена', 'Тарас']);
    const [olena] = people;
    expect(manager.spotdiffTap(room, olena.playerId, tapAt(2))).toEqual({ ok: true });
    expect(manager.spotdiffTap(room, olena.playerId, MISS)).toEqual({ ok: false, error: 'spotdiff_miss' });
    const saved = viaJson(manager.snapshot(room));
    manager.freeze();
    const next = new RoomManager(scheduler, () => 0.5);
    const back = next.restore(saved) as Room;
    expect(back.state.plays[1].spotdiff).toEqual(room.state.plays[1].spotdiff);
    const phone = next.identify(room.code, 'player', olena.token)?.identity;
    const view = next.view(back, phone as Identity);
    expect(view?.role === 'player' ? view.me.spotdiff?.found.map((f) => f.index) : null).toEqual([2]);
  });
});
