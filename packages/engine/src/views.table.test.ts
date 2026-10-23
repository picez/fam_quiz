import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { lock, next, start, submitAnswer } from './game';
import { playerView, stageView } from './views';
import { boardRound, makeQuiz, makeRoundsQuiz, single, sortQ, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const T0 = 1_000_000;
const rng0 = () => 0;
const kyiv = { type: 'single', optionId: 'b' } as const;
const names = (rows: { nickname: string; score: number }[] | undefined) => rows?.map((row) => `${row.nickname} ${row.score}`);

describe('the table at any time', () => {
  it('everybody sees all places during a question with leaderboard each', () => {
    const s = startRound(lobbyWith(makeQuiz([single, withId(single, 'q2')], { leaderboard: 'each' }), 'Оля', 'Петро'), T0, rng0);
    expect(playerView(s, 'p2')?.table).toEqual({ full: true, rows: expect.any(Array) });
    expect(playerView(s, 'p2')?.table?.rows).toHaveLength(2);
    expect(playerView(lobbyWith(makeQuiz([single]), 'Оля'), 'p1')?.table).toBeNull();
  });

  it('the table hides the current question until the reveal', () => {
    let s = startRound(lobbyWith(makeQuiz([single, withId(single, 'q2')], { leaderboard: 'each' }), 'Оля', 'Петро'), T0, rng0);
    s = must(submitAnswer(s, 'p1', kyiv, T0 + 1000));
    s = must(lock(s));
    expect(s.players[0].score).toBeGreaterThan(0);
    expect(names(playerView(s, 'p2')?.table?.rows)).toEqual(['Оля 0', 'Петро 0']);
    expect(playerView(s, 'p1')?.table?.rows.find((row) => row.nickname === 'Оля')?.score).toBe(0);
    expect(JSON.stringify(playerView(s, 'p2')?.table)).not.toContain(`"score":${s.players[0].score}`);
    s = must(next(s, T0 + 30_000, rng0)); // reveal
    expect(playerView(s, 'p2')?.table?.rows[0]).toMatchObject({ nickname: 'Оля', rank: 1, score: s.players[0].score });
  });

  it('with leaderboard end a player sees only their own place and score, all of them at round end', () => {
    let s = startRound(lobbyWith(makeQuiz([single], { leaderboard: 'end' }), 'Оля', 'Петро'), T0, rng0);
    s = must(next(must(lock(must(submitAnswer(s, 'p2', kyiv, T0 + 1000)))), T0 + 30_000, rng0)); // reveal
    expect(playerView(s, 'p2')?.table).toEqual({ full: false, rows: [expect.objectContaining({ nickname: 'Петро', rank: 1 })] });
    expect(playerView(s, 'p1')?.table?.rows).toEqual([expect.objectContaining({ nickname: 'Оля', rank: 2 })]);
    s = must(next(s, T0 + 31_000, rng0)); // round_end / finished
    expect(['round_end', 'finished']).toContain(s.phase);
    expect(playerView(s, 'p1')?.table).toMatchObject({ full: true });
    expect(names(playerView(s, 'p1')?.table?.rows)).toEqual([`Петро ${s.players[1].score}`, 'Оля 0']);
  });
});

describe('board sort for the watchers', () => {
  it('board sort words come in alphabetical order; classic sort has none', () => {
    const round = boardRound('g1', [{ title: 'Їжа', cells: [withId(sortQ, 's1'), withId(single, 'a2')] }]);
    const board = must(next(must(start(lobbyWith(makeRoundsQuiz([round]), 'Оля', 'Петро'))), T0));
    const s = must(pickCell(board, 'p1', 's1', T0, rng0));
    expect(playerView(s, 'p2')?.sort?.words?.map((word) => word.text)).toEqual(['Буряк', 'Груша', 'Морква', 'Яблуко']);
    expect(stageView(s).sort?.words).toHaveLength(4);
    expect(JSON.stringify(stageView(s).sort)).not.toContain('categoryId');
    const classic = startRound(lobbyWith(makeQuiz([sortQ]), 'Оля'), T0, rng0);
    expect(stageView(classic).sort?.words).toBeNull();
  });
});
