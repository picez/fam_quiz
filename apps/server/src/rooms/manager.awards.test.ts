import { describe, expect, it } from 'vitest';
import { classicRound, makeQuiz, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import { stageView } from '@quiz/engine';
import type { Quiz } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { toEnd } from '../testing/team-game';
import { FINISHED_TTL_MS, RoomManager, type RoomEvent } from './manager';

const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

/** Кімната з гравцями; кожен відповідає на кожне запитання за своїм списком, час іде між відповідями. */
function game(names: string[], quiz: Quiz = makeQuiz([single, withId(single, 'second')])) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const room = manager.create(quiz, null, null);
  const ids = names.map((name) => {
    const joined = manager.join(room.code, name);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  });
  const events: RoomEvent[] = [];
  manager.onEvent((_room, event) => events.push(event));
  manager.host(room, { type: 'start' });
  return { manager, room, ids, events, scheduler };
}

/** Доводить гру до кінця: перший відповідає правильно й швидко, решта — хибно. */
function play(setup: ReturnType<typeof game>) {
  const { manager, room, ids, scheduler } = setup;
  for (let guard = 0; guard < 40 && room.state.phase !== 'finished'; guard++) {
    if (room.state.phase === 'question') {
      manager.answer(room, ids[0], right);
      scheduler.advance(500);
      ids.slice(1).forEach((id) => manager.answer(room, id, wrong));
      manager.host(room, { type: 'lock' });
    } else manager.host(room, { type: 'next' });
  }
}

const awardEvents = (events: RoomEvent[]) => events.filter((event) => event.type === 'awards');

describe('manager.awards (12d)', () => {
  it('moves the carousel on the finish: a growing seq, the game state untouched', () => {
    const setup = game(['Оля', 'Петро', 'Віра']);
    play(setup);
    const { manager, room, events } = setup;
    expect(room.state.phase).toBe('finished');
    expect(stageView(room.state).facts?.awards?.length).toBeGreaterThan(0);
    const state = room.state;
    const before = JSON.stringify(state);
    expect(manager.awards(room)).toEqual({ ok: true });
    expect(manager.awards(room)).toEqual({ ok: true });
    const sent = awardEvents(events);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.type === 'awards' && sent[0]!.type === 'awards' && sent[1]!.seq > sent[0]!.seq).toBe(true);
    expect(room.state).toBe(state);
    expect(JSON.stringify(room.state)).toBe(before);
  });

  it('is wrong_phase in the lobby and on a round end', () => {
    const fresh = new RoomManager(new FakeScheduler(), () => 0.5);
    expect(fresh.awards(fresh.create(makeQuiz([single]), null, null))).toEqual({ ok: false, error: 'wrong_phase' });
    const setup = game(['Оля', 'Петро'], makeRoundsQuiz([classicRound('r1', [single]), classicRound('r2', [withId(single, 'second')])]));
    for (let guard = 0; guard < 40 && setup.room.state.phase !== 'round_end'; guard++) {
      if (setup.room.state.phase === 'question') setup.manager.host(setup.room, { type: 'lock' });
      else setup.manager.host(setup.room, { type: 'next' });
    }
    expect(setup.room.state.phase).toBe('round_end');
    expect(setup.manager.awards(setup.room)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(awardEvents(setup.events)).toEqual([]);
  });

  it('is wrong_phase on a finish without awards (one player)', () => {
    const setup = game(['Оля']);
    toEnd(setup.manager, setup.room);
    expect(setup.room.state.phase).toBe('finished');
    expect(stageView(setup.room.state).facts?.awards ?? []).toEqual([]);
    expect(setup.manager.awards(setup.room)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(awardEvents(setup.events)).toEqual([]);
  });

  it('a room that is gone answers like audio does', () => {
    const setup = game(['Оля', 'Петро', 'Віра']);
    play(setup);
    setup.scheduler.advance(FINISHED_TTL_MS);
    expect(setup.manager.get(setup.room.code)).toBeUndefined();
    expect(setup.manager.awards(setup.room)).toEqual(setup.manager.audio(setup.room, 'replay'));
    expect(setup.manager.awards(setup.room).ok).toBe(false);
  });
});
