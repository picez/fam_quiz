import { describe, expect, it } from 'vitest';
import { createAutopilotGame } from './autopilot';
import { pause, type GameState } from './game';
import { suspend } from './restore';
import { setSounds } from './sounds';
import { classicRound, makeRoundsQuiz, single } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const T0 = 1_000_000;
const rng = () => 0;
const quiz = makeRoundsQuiz([classicRound('r1', [single])]);
const lobby = (): GameState => lobbyWith(quiz, 'Оля', 'Петро');
const noKey = (state: GameState): boolean => !('soundsOff' in state);

describe('stage sounds switch (40)', () => {
  it('the host turns stage sounds off and on', () => {
    const off = must(setSounds(lobby(), false));
    expect(off.soundsOff).toBe(true);
    expect(stageView(off).soundsOff).toBe(true);
    expect(hostView(off).soundsOff).toBe(true);
    expect(playerView(off, 'p1')?.soundsOff).toBe(true);
    const on = must(setSounds(off, true));
    expect(noKey(on)).toBe(true);
    expect('soundsOff' in stageView(on)).toBe(false);
    expect('soundsOff' in hostView(on)).toBe(false);
    expect('soundsOff' in playerView(on, 'p1')!).toBe(false);
  });

  it('works in any phase and on a pause', () => {
    const open = startRound(lobby(), T0, rng);
    const states: GameState[] = [lobby(), open, must(pause(open, T0 + 1000)), { ...open, phase: 'reveal' }, { ...open, phase: 'finished' }];
    for (const state of states) expect(setSounds(state, false)).toMatchObject({ ok: true, state: { soundsOff: true, phase: state.phase } });
    expect(must(setSounds(must(pause(open, T0 + 1000)), false)).paused).toBe(true);
  });

  it('the same value is a no-op', () => {
    const state = lobby();
    expect(must(setSounds(state, true))).toEqual(state);
    const off = must(setSounds(state, false));
    expect(must(setSounds(off, false))).toEqual(off);
  });

  it('a fresh game has no key', () => {
    expect('soundsOff' in stageView(lobby())).toBe(false);
    expect('soundsOff' in stageView(startRound(lobby(), T0, rng))).toBe(false);
  });

  it('autopilot ignores it', () => {
    const created = must(createAutopilotGame(quiz, { id: 'a', nickname: 'Оля' }, { transitions: false }));
    const off = { ...created, soundsOff: true as const };
    expect('soundsOff' in stageView(off)).toBe(false);
    expect('soundsOff' in hostView(off)).toBe(false);
  });

  it('a restore keeps it', () => {
    const open = startRound(lobby(), T0, rng);
    const off = must(setSounds(open, false));
    expect(suspend(off, T0 + 5000).soundsOff).toBe(true);
    expect(noKey(suspend(open, T0 + 5000))).toBe(true);
  });
});
