import { describe, expect, it, vi } from 'vitest';
import { createAutopilotGame, pilotTry, planAutopilot } from './autopilot';
import { addPlayer, setConnected, start, type GameState, type Rng } from './game';
import { classicRound, makeRoundsQuiz, single } from './testing/fixtures';
import { must } from './testing/helpers';

// resume рушія не відмовляє на справжній паузі; тут він відмовляє, поки refuse увімкнено.
const refuse = vi.hoisted(() => ({ on: false }));
vi.mock('./game', async (importOriginal) => {
  const game = await importOriginal<typeof import('./game')>();
  return { ...game, resume: (state: GameState, now: number) => (refuse.on ? game.fail('wrong_phase') : game.resume(state, now)) };
});

const T = 1_000_000;
const rng: Rng = () => 0.3;

/** Пауза «нікого» на першій заставці, Ігор повернувся о T + 10 с: продовження о T + 13 с. */
function nobodyCountdown(): GameState {
  let s = must(createAutopilotGame(makeRoundsQuiz([classicRound('r1', [single])]), { id: 'a', nickname: 'Марта' }, { transitions: false }));
  s = must(addPlayer(s, { id: 'p2', nickname: 'Ігор' }));
  const step = (prev: GameState, next: GameState, now: number) => planAutopilot(prev, next, now);
  s = step(s, must(start(s, T)), T);
  s = step(s, must(setConnected(s, 'a', false, T + 1000)), T + 1000);
  s = step(s, must(setConnected(s, 'p2', false, T + 1000)), T + 1000);
  s = step(s, must(setConnected(s, 'p2', true, T + 10_000)), T + 10_000);
  expect(s.paused).toBe(true);
  expect(s.autopilot).toMatchObject({ hold: 'nobody', at: T + 13_000 });
  return s;
}

describe('a refused resume from the nobody pause (11g re-review)', () => {
  it('is retried 5 s later with the error; once it works the count is gone', () => {
    const s = nobodyCountdown();
    refuse.on = true;
    const tried = pilotTry(s, T + 13_000, rng);
    expect(tried.error).toBe('wrong_phase');
    expect(tried.state.paused).toBe(true);
    expect(tried.state.autopilot).toMatchObject({ hold: 'nobody', at: T + 18_000, retries: 1 });
    expect(planAutopilot(s, tried.state, T + 13_000).autopilot?.at).toBe(T + 18_000);
    refuse.on = false;
    const resumed = pilotTry(tried.state, T + 18_000, rng);
    expect(resumed.error).toBeNull();
    expect(resumed.state.paused).toBe(false);
    expect(resumed.state.autopilot?.retries).toBeUndefined();
    expect(resumed.state.autopilot?.hold).toBeUndefined();
  });

  it('after 12 refused retries it becomes the author pause, keeping the time left', () => {
    let s = nobodyCountdown();
    const left = s.autopilot?.left;
    refuse.on = true;
    let now = T + 13_000;
    for (let retry = 1; retry <= 12; retry++) {
      s = pilotTry(s, now, rng).state;
      expect(s.autopilot).toMatchObject({ hold: 'nobody', retries: retry, at: now + 5000 });
      now += 5000;
    }
    const held = pilotTry(s, now, rng);
    refuse.on = false;
    expect(held.state.paused).toBe(true);
    expect(held.state.autopilot).toEqual({ authorId: 'a', at: null, hold: 'author', ...(left === undefined ? {} : { left }) });
  });
});
