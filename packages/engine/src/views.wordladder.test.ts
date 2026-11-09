import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '@quiz/shared';
import { lock, next, pause, resume, start, submitAnswer, type GameState } from './game';
import { placeWager } from './final';
import { hostLive } from './live';
import { ladderWord } from './wordladder';
import { classicRound, finalRound, makeQuiz, makeRoundsQuiz, single, wordladder } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const NOUNS = new Set(['поле', 'пола', 'пора', 'пара', 'тара', 'кора', 'кара']);
const isNoun = (key: string) => NOUNS.has(key);
const rng = () => 0;

function walk(s: GameState, playerId: string, words: string[], now = 1000): GameState {
  return words.reduce((current, word) => must(ladderWord(current, playerId, word, now, isNoun)), s);
}

/** Олена: пола, пора; Тарас: пола; Віра нічого. Запитання відкрите. */
const played = () => walk(walk(startRound(lobbyWith(makeQuiz([wordladder]), 'Олена', 'Тарас', 'Віра'), 0), 'p1', ['пола', 'пора']), 'p2', ['пола']);
const stageOf = (s: GameState) => JSON.stringify(stageView(s));
const wl = (s: GameState) => {
  const view = stageView(s).wordladder;
  if (view === undefined) throw new Error('no wordladder');
  return view;
};

describe('word ladder views', () => {
  it('the public question shows start, target, letters and the maximum', () => {
    const s = played();
    expect(stageView(s).question?.wordladder).toEqual({ start: 'поле', target: 'тара', letters: 4, maxSteps: 8 });
    expect(playerView(s, 'p2')?.question?.wordladder).toEqual({ start: 'поле', target: 'тара', letters: 4, maxSteps: 8 });
    expect(stageView(s).question).not.toHaveProperty('path');
  });

  it("never sends the host path or another player's words before reveal", () => {
    let s = played();
    for (const phase of ['question', 'locked'] as const) {
      if (phase === 'locked') s = must(lock(s));
      expect(s.phase).toBe(phase);
      const stage = stageOf(s);
      expect(stage).not.toContain('пора');
      expect(stage).not.toContain('пара');
      expect(JSON.stringify(playerView(s, 'p2'))).not.toContain('пора');
      expect(JSON.stringify(playerView(s, 'p3'))).not.toContain('пола');
      expect(playerView(s, 'p1')?.me.wordladder?.words).toEqual(['пола', 'пора']);
    }
    // у фіналі сцена не бачить нічийого поступу
    const final = toFinalQuestion();
    expect(final.phase).toBe('question');
    expect(stageView(final)).not.toHaveProperty('wordladder');
    expect(JSON.stringify(stageView(final))).not.toContain('пола');
    expect(playerView(final, 'p1')).not.toHaveProperty('wordladder');
    expect(playerView(final, 'p1')?.me.wordladder?.words).toEqual(['пола']);
    expect(hostView(final).wordladder?.path).toEqual(wordladder.path);
  });

  it("stage rows carry only steps until reveal, then the finishers' words and points", () => {
    let s = walk(played(), 'p3', ['пола', 'пора', 'пара', 'тара']);
    expect(wl(s).path).toBeNull();
    expect(wl(s).rows.map((r) => [r.playerId, r.steps, r.finished, r.words, r.points])).toEqual([
      ['p3', 4, true, null, null],
      ['p1', 2, false, null, null],
      ['p2', 1, false, null, null],
    ]);
    s = must(next(must(lock(s)), 90_000, rng));
    expect(s.phase).toBe('reveal');
    expect(wl(s).path).toEqual(wordladder.path);
    expect(wl(s).rows.map((r) => [r.playerId, r.steps, r.finished, r.words, r.points])).toEqual([
      ['p3', 4, true, ['пола', 'пора', 'пара', 'тара'], 500],
      ['p1', 2, false, null, 0],
      ['p2', 1, false, null, 0],
    ]);
  });

  it('speed counts nowhere on the reveal: no fastest name and no own place by speed', () => {
    let s = startRound(lobbyWith(makeQuiz([wordladder]), 'Олена', 'Тарас'), 0);
    s = walk(s, 'p1', ['пола', 'пора', 'пара', 'тара'], 1500);
    s = walk(s, 'p2', ['пола', 'пора', 'кора', 'кара', 'тара'], 2500);
    s = must(next(s, 3000, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).facts?.reveal).toMatchObject({ accepted: 2, answered: 2, fastest: null });
    expect(playerView(s, 'p1')?.own?.reveal).toEqual({ kind: 'share', percent: 100 });
  });

  it('finishers are sorted by steps up, then the rest by steps down, then by player order', () => {
    let s = startRound(lobbyWith(makeQuiz([wordladder]), 'Аня', 'Боря', 'Вася', 'Галя'), 0);
    s = walk(s, 'p1', ['пола', 'пора', 'кора', 'кара', 'тара']);
    s = walk(s, 'p2', ['пола', 'пора', 'пара', 'тара']);
    s = walk(s, 'p3', ['пола']);
    expect(wl(s).rows.map((r) => r.playerId)).toEqual(['p2', 'p1', 'p3', 'p4']);
  });

  it("the host sees every player's words live and the path", () => {
    const s = played();
    const host = hostView(s).wordladder;
    expect(host?.path).toEqual(wordladder.path);
    expect(host?.rows.find((r) => r.playerId === 'p1')).toMatchObject({ steps: 2, finished: false, words: ['пола', 'пора'], points: null });
    expect(host?.rows.find((r) => r.playerId === 'p2')?.words).toEqual(['пола']);
    expect(hostLive(s)?.rows.find((r) => r.id === 'p1')?.progress).toEqual({ kind: 'wordladder', steps: 2, words: ['пола', 'пора'], finished: false });
    expect(hostLive(s)?.rows.find((r) => r.id === 'p3')?.progress).toEqual({ kind: 'wordladder', steps: 0, words: [], finished: false });
    const done = walk(s, 'p1', ['пара', 'тара']);
    expect(hostLive(done)?.rows.find((r) => r.id === 'p1')).toMatchObject({ answered: true, progress: { kind: 'wordladder', steps: 4, finished: true } });
  });

  it('other questions keep their views unchanged', () => {
    const s = startRound(lobbyWith(makeQuiz([single]), 'Олена', 'Тарас'), 0);
    for (const view of [stageView(s), hostView(s), playerView(s, 'p1'), playerView(s, 'p1')?.me, stageView(s).question]) {
      expect(view).not.toHaveProperty('wordladder');
    }
    expect(stageView(played()).question).toHaveProperty('wordladder');
  });

  it('canAdd and canBack follow phase, pause and finish', () => {
    const me = (s: GameState, id: string) => playerView(s, id)?.me.wordladder;
    const s = played();
    expect(me(s, 'p1')).toMatchObject({ canAdd: true, canBack: true, steps: 2, finished: false });
    expect(me(s, 'p3')).toMatchObject({ canAdd: true, canBack: false, steps: 0, words: [] });
    const paused = must(pause(s, 2000));
    expect(me(paused, 'p1')).toMatchObject({ canAdd: false, canBack: false });
    expect(me(must(resume(paused, 3000)), 'p1')?.canAdd).toBe(true);
    const done = walk(s, 'p1', ['пара', 'тара']);
    expect(me(done, 'p1')).toMatchObject({ canAdd: false, canBack: false, finished: true, steps: 4, words: ['пола', 'пора', 'пара', 'тара'] });
    const locked = must(lock(s));
    expect(me(locked, 'p1')).toMatchObject({ canAdd: false, canBack: false, steps: 2, finished: false });
  });
});

/** Класичний раунд із 1 запитанням, далі фінал з драбиною; ставки, Олена зробила хід. Гра на question. */
function toFinalQuestion(): GameState {
  const quiz = makeRoundsQuiz([classicRound('r1', [single], { speedBonus: false, rules: { ...DEFAULT_RULES } }), finalRound('f', wordladder, {})], { leaderboard: 'end' });
  let s = must(start(lobbyWith(quiz, 'Олена', 'Тарас', 'Віра')));
  s = must(next(s, 0, rng));
  for (const id of ['p1', 'p2', 'p3']) s = must(submitAnswer(s, id, { type: 'single', optionId: 'b' }, 1000));
  s = must(next(s, 2000, rng));
  s = must(next(s, 3000, rng));
  s = must(next(s, 4000, rng));
  s = must(next(s, 5000, rng));
  for (const id of ['p1', 'p2', 'p3']) s = must(placeWager(s, id, 100, 6000, rng));
  return walk(s, 'p1', ['пола'], 7000);
}

describe('word ladder in the final', () => {
  it('the answered count is who made a move, so it never tells how many reached the target', () => {
    let s = toFinalQuestion();
    // Олена зробила крок без фінішу — уже «відповіла», хоч запису ще немає.
    expect(stageView(s).answeredCount).toBe(1);
    s = walk(s, 'p2', ['пола', 'пора', 'пара', 'тара'], 7500);
    expect(stageView(s).answeredCount).toBe(2);
    expect(hostView(s).answeredCount).toBe(2);
  });
});

describe('word ladder verdicts before lock', () => {
  it('a finisher over the maximum is not marked correct before the question locks', () => {
    const over = walk(startRound(lobbyWith(makeQuiz([wordladder]), 'Олена', 'Тарас'), 0), 'p1', ['пола', 'поле', 'пола', 'поле', 'пола', 'пора', 'кора', 'кара', 'тара']);
    const row = hostView(over).responses.find((r) => r.playerId === 'p1');
    expect(row).toMatchObject({ accepted: false, grade: 'wrong' });
    expect(JSON.stringify(stageView(over))).not.toContain('correct');
  });
});
