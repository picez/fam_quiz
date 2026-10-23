import { DEFAULT_RULES, type Answer } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { nextDeadline } from './blitz';
import { chooseRetry, takeBuff } from './buffs';
import { acceptAnswer, lock, next, pause, recordOf, removePlayer, resume, start, submitAnswer, tick, type GameState } from './game';
import { FIRST_BUFFS, T0, toBuffCell, toBuffQuestion } from './testing/buffs';
import { boardRound, chain, makeQuiz, makeRoundsQuiz, match, numeric, single4, sortQ, withId, withVideo } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { adjustTime, closesAt, deadlineOf } from './timing';

const rng0 = () => 0;
const answer = (s: GameState, id: string, a: Answer, at: number) => must(submitAnswer(s, id, a, at));
const points = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
const pick = (optionId: string): Answer => ({ type: 'single', optionId });
const num = (value: number): Answer => ({ type: 'numeric', value });
const buffs = [...FIRST_BUFFS];
const take = (s: GameState, id: string, kind: (typeof FIRST_BUFFS)[number], at: number) => must(takeBuff(s, id, kind, at, rng0));

/** Від закритого запитання класики до наступного відкритого. */
const toNext = (s: GameState, at: number) => must(next(must(next(s, at, rng0)), at, rng0));
/** q2 (numeric 2061 ± 100), відкрите о T0. */
const toQ2 = (patch: Parameters<typeof toBuffQuestion>[0] = {}) => toNext(must(lock(toBuffQuestion(patch))), T0);

describe('second try', () => {
  it('second try: a wrong first answer opens another, the second counts even if worse', () => {
    let s = take(toQ2(), 'p1', 'retry', T0);
    s = answer(s, 'p1', num(3000), T0 + 1000);
    expect(s.plays[1].answers).not.toHaveProperty('p1');
    expect(s.plays[1].buffs?.p1).toMatchObject({ retry: 'again', first: { grade: 'wrong' } });
    s = answer(s, 'p1', num(2061), T0 + 2000);
    expect(s.plays[1].answers.p1).toMatchObject({ grade: 'correct', buff: 'retry', timeMs: 2000 });
    expect(s.plays[1].buffs?.p1.retry).toBe('done');

    let w = take(toBuffQuestion(), 'p1', 'retry', T0);
    w = answer(w, 'p1', pick('a'), T0 + 1000);
    expect(w.plays[0].buffs?.p1.retry).toBe('again');
    w = answer(w, 'p1', pick('c'), T0 + 2000);
    expect(w.plays[0].answers.p1).toMatchObject({ grade: 'wrong', points: -1000, buff: 'retry' });
    expect(submitAnswer(w, 'p1', pick('b'), T0 + 3000)).toEqual({ ok: false, error: 'already_answered' });

    let c = take(toBuffQuestion(), 'p1', 'retry', T0);
    c = answer(c, 'p1', pick('b'), T0 + 1000);
    expect(c.plays[0].answers.p1).toMatchObject({ grade: 'correct', buff: 'retry' });
    expect(c.plays[0].buffs?.p1.retry).toBe('done');
  });

  it('second try: a partial first answer lets the player keep it or try again', () => {
    let s = take(toQ2(), 'p1', 'retry', T0);
    s = answer(s, 'p1', num(2111), T0 + 1000);
    expect(s.plays[1].buffs?.p1).toMatchObject({ retry: 'choice', first: { accuracy: 0.75 } });
    expect(s.plays[1].answers).not.toHaveProperty('p1');
    expect(submitAnswer(s, 'p1', num(2061), T0 + 2000)).toEqual({ ok: false, error: 'wrong_phase' });
    const kept = must(chooseRetry(s, 'p1', true, T0 + 2000));
    expect(kept.plays[1].answers.p1).toMatchObject({ accuracy: 0.75, points: 750, buff: 'retry' });
    expect(kept.plays[1].buffs?.p1.retry).toBe('done');

    let again = must(chooseRetry(s, 'p1', false, T0 + 2000));
    expect(again.plays[1].buffs?.p1.retry).toBe('again');
    expect(chooseRetry(again, 'p1', true, T0 + 2500)).toEqual({ ok: false, error: 'wrong_phase' });
    again = answer(again, 'p1', num(3000), T0 + 3000);
    expect(again.plays[1].answers.p1).toMatchObject({ grade: 'wrong', buff: 'retry' });

    expect(chooseRetry(toQ2(), 'p1', true, T0 + 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(chooseRetry(must(pause(s, T0 + 2000)), 'p1', true, T0 + 2000)).toEqual({ ok: false, error: 'paused' });
    expect(chooseRetry(s, 'p1', true, T0 + 20_001)).toEqual({ ok: false, error: 'time_over' });
  });

  it('second try: time over or a host lock counts the first answer', () => {
    let s = take(toBuffQuestion(), 'p1', 'retry', T0);
    s = answer(s, 'p1', pick('a'), T0 + 1000);
    s = tick(s, T0 + 20_000);
    expect(s.phase).toBe('locked');
    expect(recordOf(s, 0, 'p1')).toMatchObject({ answer: pick('a'), grade: 'wrong', buff: 'retry', timeMs: 1000 });
    expect(s.plays[0].buffs?.p1.retry).toBe('done');

    let p = take(toQ2(), 'p1', 'retry', T0);
    p = must(lock(answer(p, 'p1', num(2111), T0 + 1000)));
    expect(recordOf(p, 1, 'p1')).toMatchObject({ accuracy: 0.75, points: 750, buff: 'retry' });
    expect(points(p, 'p1')).toBe(750);
  });

  it('the second try waits: the question does not close while the player may answer again', () => {
    let s = answer(answer(toBuffQuestion(), 'p2', pick('b'), T0 + 500), 'p3', pick('b'), T0 + 500);
    s = take(s, 'p1', 'retry', T0 + 600);
    s = answer(s, 'p1', pick('a'), T0 + 1000);
    expect(s.phase).toBe('question');
    s = answer(s, 'p1', pick('b'), T0 + 2000);
    expect(s.phase).toBe('locked');
  });

  it('second try on a board cell goes through «Прийняти»', () => {
    let s = take(toBuffCell(), 'p1', 'retry', T0 + 500);
    s = must(acceptAnswer(answer(s, 'p1', pick('a'), T0 + 1000), 'p1', T0 + 3000));
    expect(s.phase).toBe('question');
    expect(s.plays[0].board?.answer).toBeNull();
    expect(s.heldAt).toBeNull();
    expect(s.plays[0].buffs?.p1.retry).toBe('again');
    expect(s.plays[0].answers).not.toHaveProperty('p1');
    s = must(acceptAnswer(answer(s, 'p1', pick('b'), T0 + 4000), 'p1', T0 + 5000));
    expect(s.phase).toBe('reveal');
    expect(s.plays[0].answers.p1).toMatchObject({ grade: 'correct', points: 2000, buff: 'retry' });

    // Час сплив посеред другої спроби — зараховується перша.
    let t = take(toBuffCell({ penalty: 'minus' }), 'p1', 'retry', T0 + 500);
    t = must(acceptAnswer(answer(t, 'p1', pick('a'), T0 + 1000), 'p1', T0 + 1000));
    t = tick(t, T0 + 20_000);
    expect(t.phase).toBe('locked');
    expect(t.plays[0].answers.p1).toMatchObject({ answer: pick('a'), grade: 'wrong', buff: 'retry' });

    const manual = toBuffCell({}, 'manual');
    expect(takeBuff(manual, 'p1', 'retry', T0, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
  });

  it('second try on a board cell: keeping a partial first answer reveals it', () => {
    const round = boardRound('g1', [{ title: 'Гори', cells: [withId(numeric, 'c11')] }], {
      rules: { ...DEFAULT_RULES, partial: 50 },
      check: 'auto',
      answerMode: 'phone',
    });
    const quiz = makeRoundsQuiz([round], { leaderboard: 'end', buffs });
    const board = must(next(must(start(lobbyWith(quiz, 'Оля', 'Петро'))), T0, rng0));
    let s = take(must(pickCell(board, 'p1', 'c11', T0, rng0)), 'p1', 'retry', T0 + 500);
    s = must(acceptAnswer(answer(s, 'p1', num(2111), T0 + 1000), 'p1', T0 + 2000));
    expect(s.phase).toBe('question');
    expect(s.plays[0].buffs?.p1.retry).toBe('choice');
    s = must(chooseRetry(s, 'p1', true, T0 + 3000));
    expect(s.phase).toBe('reveal');
    expect(s.plays[0].answers.p1).toMatchObject({ grade: 'partial', accuracy: 0.75, buff: 'retry' });
    expect(s.plays[0].buffs?.p1.retry).toBe('done');
    expect(points(s, 'p1')).toBe(s.plays[0].answers.p1.points);
  });

  it('second try fits auto-checked single, multi, boolean, text, numeric only', () => {
    const q4 = toNext(must(lock(toNext(must(lock(toQ2())), T0))), T0);
    expect(q4.plays[3].question.type).toBe('order');
    expect(takeBuff(q4, 'p1', 'retry', T0, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
    const matching = startRound(lobbyWith(makeQuiz([match], { buffs }), 'Оля'), T0, rng0);
    expect(takeBuff(matching, 'p1', 'retry', T0, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
    for (const question of [chain, sortQ]) {
      const s = startRound(lobbyWith(makeQuiz([question], { buffs }), 'Оля'), T0, rng0);
      expect(takeBuff(s, 'p1', 'retry', T0, rng0)).toEqual({ ok: false, error: 'wrong_phase' });
    }
  });

  it('a correct second try continues the streak', () => {
    const streak = { length: 2, bonus: { kind: 'fixed', value: 100 } } as const;
    let s = toBuffQuestion({ rules: { ...DEFAULT_RULES, penalty: 'minus', streak } });
    s = toNext(must(lock(answer(s, 'p1', pick('b'), T0 + 1000))), T0 + 2000);
    s = take(s, 'p1', 'retry', T0 + 2000);
    s = answer(s, 'p1', num(3000), T0 + 3000);
    s = must(lock(answer(s, 'p1', num(2061), T0 + 4000)));
    expect(s.plays[1].answers.p1).toMatchObject({ grade: 'correct', streakBonus: 100, buff: 'retry' });
    expect(s.players[0].streak).toBe(2);
  });
});

describe('extra time', () => {
  it('extra time: +30 s for this player only, others are out at the shared end', () => {
    const s = take(toBuffQuestion(), 'p1', 'time', T0 + 5000);
    expect(s.plays[0].overtime).toEqual({ p1: 30_000 });
    expect(submitAnswer(s, 'p2', pick('b'), T0 + 20_001)).toEqual({ ok: false, error: 'time_over' });
    expect(submitAnswer(s, 'p1', pick('b'), T0 + 49_000).ok).toBe(true);
    expect(deadlineOf(s, s.plays[0], 'p1')).toBe(T0 + 50_000);
    expect(deadlineOf(s, s.plays[0], 'p2')).toBe(T0 + 20_000);
  });

  it('the reveal waits for the player with extra time and closes the moment they answer', () => {
    let s = answer(answer(toBuffQuestion(), 'p2', pick('b'), T0 + 500), 'p3', pick('b'), T0 + 500);
    s = take(s, 'p1', 'time', T0 + 1000);
    s = tick(s, T0 + 20_000);
    expect(s.phase).toBe('question');
    expect(closesAt(s)).toBe(T0 + 50_000);
    expect(answer(s, 'p1', pick('b'), T0 + 30_000).phase).toBe('locked');
    const silent = tick(s, T0 + 50_000);
    expect(silent.phase).toBe('locked');
    expect(recordOf(silent, 0, 'p1')).toBeUndefined();

    // Хтось інший мовчить: відповідь з бафом після спільного кінця однаково закриває запитання.
    let o = answer(toBuffQuestion(), 'p2', pick('b'), T0 + 500);
    o = take(o, 'p1', 'time', T0 + 1000);
    o = tick(o, T0 + 20_000);
    expect(o.phase).toBe('question');
    expect(answer(o, 'p1', pick('b'), T0 + 30_000).phase).toBe('locked');
  });

  it('an overtime answer costs no more tiebreak time than silence', () => {
    let s = answer(toBuffQuestion(), 'p2', pick('b'), T0 + 500);
    s = take(s, 'p1', 'time', T0 + 1000);
    s = tick(s, T0 + 20_000);
    s = must(next(answer(s, 'p1', pick('b'), T0 + 30_000), T0 + 31_000, rng0));
    expect(s.plays[0].answers.p1.timeMs).toBe(30_000);
    expect(s.players.map((p) => [p.id, p.totalTimeMs])).toEqual([['p1', 20_000], ['p2', 500], ['p3', 20_000]]);
  });

  it('nextDeadline follows the personal deadline', () => {
    const s = take(toBuffQuestion(), 'p1', 'time', T0 + 1000);
    expect(nextDeadline(s, T0 + 2000)).toBe(T0 + 50_000);
    expect(nextDeadline(answer(s, 'p1', pick('b'), T0 + 3000), T0 + 4000)).toBe(T0 + 20_000);
  });

  it('a pause in overtime does not give the time back; ±15 s moves both ends', () => {
    const s = take(toBuffQuestion(), 'p1', 'time', T0 + 1000);
    const paused = must(pause(s, T0 + 30_000));
    expect(paused.remainingMs).toBe(0);
    expect(paused.plays[0].overtime?.p1).toBe(20_000);
    const resumed = must(resume(paused, T0 + 90_000));
    expect(resumed.phase).toBe('question');
    expect(resumed.endsAt).toBe(T0 + 90_000);
    expect(deadlineOf(resumed, resumed.plays[0], 'p1')).toBe(T0 + 110_000);

    expect(must(pause(s, T0 + 10_000)).plays[0].overtime?.p1).toBe(30_000);

    const moved = must(adjustTime(take(toBuffQuestion(), 'p1', 'time', T0 + 1000), 15, T0 + 5000));
    expect(moved.endsAt).toBe(T0 + 35_000);
    expect(deadlineOf(moved, moved.plays[0], 'p1')).toBe(T0 + 65_000);
  });

  it('+15 s in overtime adds to the extra time only; the others stay closed', () => {
    const s = take(toBuffQuestion(), 'p1', 'time', T0 + 1000);
    const moved = must(adjustTime(s, 15, T0 + 30_000));
    expect(moved.endsAt).toBe(T0 + 20_000);
    expect(moved.plays[0].overtime?.p1).toBe(45_000);
    expect(deadlineOf(moved, moved.plays[0], 'p1')).toBe(T0 + 65_000);
    expect(submitAnswer(moved, 'p2', pick('b'), T0 + 30_001)).toEqual({ ok: false, error: 'time_over' });
    expect(submitAnswer(moved, 'p1', pick('b'), T0 + 64_000).ok).toBe(true);
    expect(closesAt(moved)).toBe(T0 + 65_000);
    expect(adjustTime(s, -15, T0 + 30_000)).toEqual({ ok: false, error: 'time_limit' });

    // Не більше MAX_REMAINING_MS особистого залишку.
    let capped = s;
    for (let i = 0; i < 7; i += 1) capped = must(adjustTime(capped, 15, T0 + 30_000));
    expect(deadlineOf(capped, capped.plays[0], 'p1')).toBe(T0 + 150_000);
    expect(adjustTime(capped, 15, T0 + 30_000)).toEqual({ ok: false, error: 'time_limit' });

    // На паузі посеред додаткового часу — так само лише додатковий.
    const paused = must(adjustTime(must(pause(s, T0 + 30_000)), 15, T0 + 40_000));
    expect(paused.remainingMs).toBe(0);
    expect(paused.plays[0].overtime?.p1).toBe(35_000);

    // Додатковий час уже витрачено або гравець відповів — як раніше.
    const answered = answer(answer(s, 'p1', pick('b'), T0 + 2000), 'p2', pick('b'), T0 + 2000);
    expect(must(adjustTime(answered, 15, T0 + 20_000)).endsAt).toBe(T0 + 35_000);
  });

  it('the host does not wait: lock closes the question, a missing answer is absent', () => {
    let s = take(toBuffQuestion(), 'p1', 'time', T0 + 1000);
    s = answer(answer(s, 'p2', pick('b'), T0 + 2000), 'p3', pick('b'), T0 + 2000);
    s = must(lock(tick(s, T0 + 25_000)));
    expect(s.phase).toBe('locked');
    expect(recordOf(s, 0, 'p1')).toBeUndefined();
    expect(points(s, 'p1')).toBe(0);
  });

  it('extra time on a board cell and without a timer', () => {
    const s = answer(take(toBuffCell(), 'p1', 'time', T0 + 1000), 'p1', pick('b'), T0 + 40_000);
    expect(s.phase).toBe('question');
    expect(s.plays[0].board?.answer).toEqual(pick('b'));

    const video = startRound(lobbyWith(makeQuiz([withVideo(single4)], { buffs }), 'Оля'), T0, rng0);
    expect(takeBuff(video, 'p1', 'time', T0, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
  });

  it('a kicked player with extra time no longer holds the question', () => {
    let s = take(toBuffQuestion(), 'p1', 'time', T0 + 1000);
    // Іра мовчить, тож вилучення саме по собі запитання не закриває.
    s = answer(s, 'p2', pick('b'), T0 + 2000);
    s = tick(s, T0 + 25_000);
    expect(s.phase).toBe('question');
    s = must(removePlayer(s, 'p1'));
    expect(s.phase).toBe('question');
    expect(closesAt(s)).toBe(s.endsAt);
    expect(tick(s, T0 + 25_000).phase).toBe('locked');
  });
});
