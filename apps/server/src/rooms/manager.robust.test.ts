import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import * as engine from '@quiz/engine';
import { FakeScheduler } from '../testing/fake-scheduler';
import { log, setErrorReporter, type ErrorContext } from '../log';
import { RoomManager, TIMER_FAILURES_TO_PAUSE, TIMER_RETRY_MS, type Identity, type Room, type RoomEvent } from './manager';

// Рушій чистий; щоб перевірити запобіжник таймера (30a), tick можна підмінити на «кидає один раз».
vi.mock('@quiz/engine', async (original) => {
  const actual = await original<typeof import('@quiz/engine')>();
  return { ...actual, tick: vi.fn(actual.tick) };
});

const { tick: realTick } = await vi.importActual<typeof import('@quiz/engine')>('@quiz/engine');
const HOST: Identity = { role: 'host', playerId: null };

function enter(manager: RoomManager, room: Room, nickname: string) {
  const joined = manager.join(room.code, nickname);
  if (!joined.ok) throw new Error(joined.error);
  const identity: Identity = { role: 'player', playerId: joined.playerId };
  manager.connect(room, identity);
  return { ...joined, identity };
}

function playing() {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(makeQuiz([single, text]));
  manager.connect(room, HOST);
  const olena = enter(manager, room, 'Олена');
  enter(manager, room, 'Тарас');
  expect(manager.host(room, { type: 'start' })).toEqual({ ok: true });
  expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  return { scheduler, manager, room, olena };
}

let unhook: () => void = () => {};
afterEach(() => {
  unhook();
  vi.mocked(engine.tick).mockImplementation(realTick);
});

function capture(): { error: unknown; context: ErrorContext }[] {
  const reports: { error: unknown; context: ErrorContext }[] = [];
  // Очікувані збої в журнал не пишуться, щоб не засмічувати вивід тестів.
  const level = log.level;
  log.level = 'silent';
  const off = setErrorReporter((error, context) => reports.push({ error, context }));
  unhook = () => {
    off();
    log.level = level;
  };
  return reports;
}

describe('room timers survive an exception (30a)', () => {
  it('a throwing deadline leaves the state as it was, is reported with the room code and is retried', () => {
    const reports = capture();
    const { scheduler, manager, room } = playing();
    const before = room.state;
    vi.mocked(engine.tick).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    // Час запитання (20 с) минув: таймер кидає, кімната лишається на запитанні в тому самому стані.
    expect(() => scheduler.advance(20_000)).not.toThrow();
    expect(room.state).toBe(before);
    expect(reports).toHaveLength(1);
    expect(reports[0].context).toMatchObject({ where: 'room-timer', room: room.code, what: 'deadline' });
    expect(manager.get(room.code)).toBe(room);
    // Повтор через TIMER_RETRY_MS доводить той самий дедлайн: питання закривається, кімната жива далі.
    scheduler.advance(TIMER_RETRY_MS);
    expect(room.state.phase).toBe('locked');
    expect(reports).toHaveLength(1);
    expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
    expect(room.state.phase).toBe('reveal');
  });

  it('a timer that keeps throwing backs off 1, 2, 4, 8 s, then pauses the room and reports once more', () => {
    const reports = capture();
    const { scheduler, manager, room } = playing();
    vi.mocked(engine.tick).mockImplementation(() => {
      throw new Error('always');
    });
    try {
      scheduler.advance(20_000);
      expect(vi.mocked(engine.tick)).toHaveBeenCalledTimes(1);
      // Повтори: через 1 с, потім 2, 4, 8 — кожен наступний не раніше.
      for (const [wait, calls] of [[TIMER_RETRY_MS, 2], [2 * TIMER_RETRY_MS, 3], [4 * TIMER_RETRY_MS, 4]] as const) {
        scheduler.advance(wait - 1);
        expect(vi.mocked(engine.tick)).toHaveBeenCalledTimes(calls - 1);
        scheduler.advance(1);
        expect(vi.mocked(engine.tick)).toHaveBeenCalledTimes(calls);
      }
      expect(room.state.paused).toBe(false);
      scheduler.advance(8 * TIMER_RETRY_MS);
      expect(vi.mocked(engine.tick)).toHaveBeenCalledTimes(TIMER_FAILURES_TO_PAUSE);
      // П'ятий збій поспіль: пауза, повторів більше немає; у reportError — лише перший і п'ятий.
      expect(room.state.paused).toBe(true);
      expect(reports.map((report) => report.context.what)).toEqual(['deadline', `deadline: paused after ${TIMER_FAILURES_TO_PAUSE} failures`]);
      scheduler.advance(600_000);
      expect(vi.mocked(engine.tick)).toHaveBeenCalledTimes(TIMER_FAILURES_TO_PAUSE);
      expect(manager.get(room.code)).toBe(room);
    } finally {
      vi.mocked(engine.tick).mockImplementation(realTick);
    }
    // Ведучий знімає паузу — крок пробується знову й тепер проходить.
    expect(manager.host(room, { type: 'resume' })).toEqual({ ok: true });
    scheduler.advance(20_000);
    expect(room.state.phase).toBe('locked');
  });

  it('guard rolls back state, tickedTo and checkpoint and rethrows', () => {
    const { manager, room } = playing();
    const { state, tickedTo, checkpoint } = room;
    expect(() =>
      manager.guard(room, () => {
        room.state = { ...room.state, paused: true };
        room.tickedTo = tickedTo + 5000;
        room.checkpoint = null;
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(room.state).toBe(state);
    expect(room.tickedTo).toBe(tickedTo);
    expect(room.checkpoint).toBe(checkpoint);
    expect(manager.guard(room, () => 7)).toBe(7);
  });

  it('a listener that throws does not stop the others and does not fail the action', () => {
    const reports = capture();
    const { manager, room, olena } = playing();
    const seen: RoomEvent[] = [];
    manager.onEvent(() => {
      throw new Error('listener');
    });
    manager.onEvent((_room, event) => seen.push(event));
    expect(manager.answer(room, olena.playerId, { type: 'single', optionId: 'b' })).toEqual({ ok: true });
    expect(seen.some((event) => event.type === 'changed')).toBe(true);
    expect(reports[0].context).toMatchObject({ where: 'room-listener', room: room.code, what: 'changed' });
  });
});
