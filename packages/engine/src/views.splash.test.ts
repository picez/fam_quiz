import { describe, expect, it } from 'vitest';
import { declareDuel } from './duel';
import { lock, next, pause, resume, start } from './game';
import { classicRound, finalRound, makeQuiz, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { toDeclarable } from './testing/duel';
import { lobbyWith, lobbyWithSplash, must, openAt } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const T0 = 1_000_000;
const rng0 = () => 0;

describe('splash in views', () => {
  it('every role sees the same splash with server times', () => {
    const s = openAt(lobbyWithSplash(makeQuiz([single]), 'Анна', 'Богдан'), T0);
    const splash = { kind: 'question', at: T0, until: T0 + 1200 };
    expect(stageView(s).splash).toEqual(splash);
    expect(playerView(s, 'p1')?.splash).toEqual(splash);
    expect(hostView(s).splash).toEqual(splash);
  });

  it('a splash shows only in its own phase', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single])]);
    let s = must(start(lobbyWithSplash(quiz, 'Анна'), T0));
    expect(s.phase).toBe('intro');
    expect(stageView(s).splash).toEqual({ kind: 'round', at: T0, until: T0 + 2500 });
    s = must(next(s, T0 + 5000, rng0));
    expect(stageView(s).splash?.kind).toBe('question');
    s = must(lock(s));
    expect(s.phase).toBe('locked');
    expect(stageView(s).splash).toBeNull();
    s = must(next(s, T0 + 10_000, rng0));
    expect(s.phase).toBe('reveal');
    expect(hostView(s).splash).toBeNull();
    s = must(next(s, T0 + 20_000, rng0));
    expect(s.phase).toBe('finished');
    expect(stageView(s).splash).toEqual({ kind: 'podium', at: T0 + 20_000, until: T0 + 22_500 });

    const finalQuiz = makeRoundsQuiz([finalRound('f1', withId(single, 'qf'))]);
    const f = must(start(lobbyWithSplash(finalQuiz, 'Анна'), T0));
    expect(stageView(f).splash).toEqual({ kind: 'final', at: T0, until: T0 + 3200 });

    const duel = must(next(must(declareDuel({ ...toDeclarable(), transitions: true }, 'p1', 'p2')), T0 + 4000, rng0));
    expect(duel.phase).toBe('duel');
    expect(stageView(duel).splash).toEqual({ kind: 'duel', at: T0 + 4000, until: T0 + 6000 });
    expect(stageView({ ...duel, phase: 'reveal' }).splash).toBeNull();
  });

  it('the splash carries no answers and pauses with the clock', () => {
    const s = openAt(lobbyWithSplash(makeQuiz([single]), 'Анна'), T0);
    const paused = must(pause(s, T0 + 500));
    expect(stageView(paused).splash).toEqual({ kind: 'question', at: T0, until: T0 + 1200 });
    const resumed = must(resume(paused, T0 + 10_500));
    expect(stageView(resumed).splash).toEqual({ kind: 'question', at: T0 + 10_000, until: T0 + 11_200 });
    expect(JSON.stringify(stageView(s))).not.toContain('correctId');
  });

  it('without transitions the view has no splash', () => {
    expect(stageView(openAt(lobbyWith(makeQuiz([single]), 'Анна'), T0)).splash).toBeNull();
  });
});
