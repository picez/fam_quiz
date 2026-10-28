import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer } from '@quiz/shared';
import { awayClock, awayEnd, awayParticipant, awayStart, awayStep, awayTracked } from './away';
import { buzz } from './blitz';
import { pickBluff, writeLie } from './bluff';
import { takeBuff } from './buffs';
import { pickCell } from './board';
import { judge, lock, next, pause, removePlayer, resume, setConnected, start, submitAnswer, tick, type GameState } from './game';
import { actAnswer } from './team-act';
import {
  blitzRound,
  bluff,
  boardRound,
  classicRound,
  makeQuiz,
  makeRoundsQuiz,
  single,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  withId,
  withPoints,
  withVideo,
} from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, openAt, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { T0 as BUFF_T0, toBuffQuestion } from './testing/buffs';

const rng = () => 0;
const kyiv: Answer = { type: 'single', optionId: 'b' };
const PLAIN = { speedBonus: false, rules: DEFAULT_RULES };

/** Класика з двох запитань, Оля p1 і Петро p2; перше запитання відкрито о 1000. */
const open = () => startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], PLAIN)]), 'Оля', 'Петро'), 1000, rng);
const entry = (s: GameState, person: string, index = s.questionIndex) => s.plays[index].away?.[person];

describe('the server clock for leaving the game (12e)', () => {
  const s0 = open();

  it('the server clock counts from leave to return', () => {
    let s = awayStart(s0, 'p1', 2000);
    expect(s.plays[0].away?.p1).toEqual({ ms: 0, count: 0, since: 2000 });
    s = awayEnd(s, 'p1', 6500);
    expect(s.plays[0].away?.p1).toEqual({ ms: 4500, count: 1, since: null });
  });

  it('a second leave adds up; leaving twice in a row keeps the first moment', () => {
    let s = awayEnd(awayStart(s0, 'p1', 2000), 'p1', 3000);
    s = awayStart(s, 'p1', 5000);
    expect(awayStart(s, 'p1', 5500)).toBe(s);
    s = awayEnd(s, 'p1', 6500);
    expect(entry(s, 'p1')).toEqual({ ms: 2500, count: 2, since: null });
    // повернення без виходу нічого не змінює
    expect(awayEnd(s, 'p1', 7000)).toBe(s);
    // записи інших запитань не чіпаються, ключ — людина
    expect(entry(s, 'p2')).toBeUndefined();
  });

  it('the splash is free: a leave before the real start counts from startedAt', () => {
    const splashed = startRound(lobbyWithSplash(makeRoundsQuiz([classicRound('r1', [single], PLAIN)]), 'Оля', 'Петро'), 1000, rng);
    const startedAt = splashed.startedAt ?? 0;
    expect(splashed.phase).toBe('question');
    expect(startedAt).toBeGreaterThan(1000);
    let s = awayStart(splashed, 'p1', 1000);
    expect(entry(s, 'p1')).toEqual({ ms: 0, count: 0, since: startedAt });
    s = awayEnd(s, 'p1', startedAt - 100);
    expect(entry(s, 'p1')).toEqual({ ms: 0, count: 0, since: null });
  });

  it('a pause freezes the clock', () => {
    const left = awayStart(s0, 'p1', 2000);
    const paused = must(pause(left, 3000));
    // повернення на паузі — до pausedAt
    expect(entry(awayEnd(paused, 'p1', 5000), 'p1')).toEqual({ ms: 1000, count: 1, since: null });
    const resumed = must(resume(paused, 10_000));
    expect(entry(resumed, 'p1')?.since).toBe(9000);
    expect(entry(awayEnd(resumed, 'p1', 11_000), 'p1')).toEqual({ ms: 2000, count: 1, since: null });
  });

  it('a pause freezes the clock on a question without a timer too', () => {
    const untimed = startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [withVideo(single)], PLAIN)]), 'Оля', 'Петро'), 1000, rng);
    const resumed = must(resume(must(pause(awayStart(untimed, 'p1', 2000), 3000)), 10_000));
    expect(entry(awayEnd(resumed, 'p1', 11_000), 'p1')).toEqual({ ms: 2000, count: 1, since: null });
  });

  it('a leave during a pause counts from the resume', () => {
    let s = awayStart(must(pause(s0, 3000)), 'p1', 4000);
    expect(entry(s, 'p1')?.since).toBe(3000);
    s = awayEnd(must(resume(s, 10_000)), 'p1', 12_000);
    expect(entry(s, 'p1')).toEqual({ ms: 2000, count: 1, since: null });
  });

  it('after the own answer the person is not watched', () => {
    const answered = must(submitAnswer(s0, 'p1', kyiv, 1500));
    expect(awayTracked(answered, 'p1')).toBe(false);
    expect(awayTracked(answered, 'p2')).toBe(true);
    expect(awayStart(answered, 'p1', 2000)).toBe(answered);
  });

  it('awayStep closes the intervals of people no longer watched', () => {
    const s = awayStart(s0, 'p2', 2000);
    const locked = must(lock(s));
    const stepped = awayStep(s, locked, 9000, new Set());
    expect(entry(stepped, 'p2', 0)).toEqual({ ms: 7000, count: 1, since: null });
    // нічого не змінилося — той самий next
    expect(awayStep(stepped, stepped, 9500, new Set())).toBe(stepped);
    // людина під наглядом лишається поза грою
    expect(awayStep(s, s, 9000, new Set(['p2']))).toBe(s);
    // своя відповідь закриває інтервал у мить кроку
    const answered = must(submitAnswer(s, 'p2', kyiv, 5000));
    expect(entry(awayStep(s, answered, 5000, new Set()), 'p2')).toEqual({ ms: 3000, count: 1, since: null });
  });

  it('awayStep opens an interval for hidden phones that just became watched', () => {
    let prev = must(lock(s0));
    while (must(next(prev, 20_000, rng)).phase !== 'question') prev = must(next(prev, 15_000, rng));
    const nextQuestion = must(next(prev, 20_000, rng));
    expect(nextQuestion.questionIndex).toBe(1);
    const stepped = awayStep(prev, nextQuestion, 20_000, new Set(['p2']));
    expect(entry(stepped, 'p2', 1)).toEqual({ ms: 0, count: 0, since: 20_000 });
    expect(entry(stepped, 'p1', 1)).toBeUndefined();
  });

  it('a phone hidden before a question with a splash counts from the end of the splash', () => {
    let prev = startRound(lobbyWithSplash(makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], PLAIN)]), 'Оля', 'Петро'), 1000, rng);
    prev = must(lock(prev));
    while (must(next(prev, 30_000, rng)).phase !== 'question') prev = must(next(prev, 25_000, rng));
    const nextQuestion = must(next(prev, 30_000, rng));
    const until = nextQuestion.splash?.until ?? 0;
    expect(until).toBeGreaterThan(30_000);
    expect(entry(awayStep(prev, nextQuestion, 30_000, new Set(['p2'])), 'p2', 1)).toEqual({ ms: 0, count: 0, since: until });
  });

  it('bluff: a leave from the lies into the choice counts in full', () => {
    const quiz = makeQuiz([bluff, single], { leaderboard: 'end', speedBonus: false, rules: { ...DEFAULT_RULES }, buffs: [] });
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'), 10_000, rng);
    s = must(writeLie(s, 'p1', 'Рим', 11_000));
    s = awayStart(s, 'p3', 12_000);
    const due = s.endsAt ?? 0;
    s = tick(s, due + 1);
    expect(s.plays[0].bluff?.stage).toBe('choice');
    expect(awayTracked(s, 'p3')).toBe(true);
    expect(entry(awayEnd(s, 'p3', due + 3001), 'p3')).toEqual({ ms: due + 3001 - 12_000, count: 1, since: null });
  });

  it('blitz: a hold does not stop the clock, a pause in a hold does', () => {
    let s = openAt(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single], { check: 'manual' })]), 'Оля', 'Петро'), 1000, rng);
    s = awayStart(s, 'p2', 2000);
    s = must(submitAnswer(must(buzz(s, 'p1', 3000)), 'p1', kyiv, 3000));
    expect(s.heldAt).not.toBeNull();
    const thawed = must(judge(s, 'p1', false, 8000));
    expect(thawed.heldAt).toBeNull();
    expect(awayTracked(thawed, 'p2')).toBe(true);
    expect(entry(awayEnd(thawed, 'p2', 9000), 'p2')).toEqual({ ms: 7000, count: 1, since: null });
    // пауза під час утримання: 4000…14 000 не рахується
    const resumed = must(resume(must(pause(s, 4000)), 14_000));
    expect(entry(resumed, 'p2')?.since).toBe(12_000);
    expect(entry(awayEnd(must(judge(resumed, 'p1', false, 15_000)), 'p2', 16_000), 'p2')).toEqual({ ms: 4000, count: 1, since: null });
  });

  it('a pause during the splash of a timed question never counts the splash', () => {
    const splashed = startRound(lobbyWithSplash(makeRoundsQuiz([classicRound('r1', [single], PLAIN)]), 'Оля', 'Петро'), 1000, rng);
    const until = splashed.splash?.until ?? 0;
    expect(until).toBeGreaterThan(2000);
    // вийшла під час заставки, пауза теж під час заставки
    const resumed = must(resume(must(pause(awayStart(splashed, 'p1', 1500), 2000)), 10_000));
    expect(entry(resumed, 'p1')?.since).toBe(until + 8000);
    expect(resumed.splash?.until).toBe(until + 8000);
    expect(entry(awayEnd(resumed, 'p1', until + 11_000), 'p1')).toEqual({ ms: 3000, count: 1, since: null });
    // вийшла на паузі під час заставки
    const late = must(resume(awayStart(must(pause(splashed, 2000)), 'p1', 3000), 10_000));
    expect(entry(late, 'p1')?.since).toBe(until + 8000);
    // повернулася до кінця заставки — 0
    expect(entry(awayEnd(late, 'p1', until + 7000), 'p1')).toEqual({ ms: 0, count: 0, since: null });
  });

  it('a gap reported during a pause on a timed question is capped by the answer time so far', () => {
    const paused = must(pause(s0, 6000));
    expect(paused.startedAt).toBeNull();
    expect(entry(awayEnd(paused, 'p2', 9000, 10_000), 'p2')).toEqual({ ms: 5000, count: 1, since: null });
  });

  it('a second try keeps the watch', () => {
    let s = must(takeBuff(toBuffQuestion(), 'p1', 'retry', BUFF_T0, () => 0));
    s = must(submitAnswer(s, 'p1', { type: 'single', optionId: 'a' }, BUFF_T0 + 1000));
    expect(s.plays[0].buffs?.p1.retry).toBe('again');
    expect(awayTracked(s, 'p1')).toBe(true);
    s = must(submitAnswer(s, 'p1', { type: 'single', optionId: 'c' }, BUFF_T0 + 2000));
    expect(awayTracked(s, 'p1')).toBe(false);
  });

  it('a disconnect stops the watch and awayStep closes the interval at the drop', () => {
    const s = awayStart(s0, 'p2', 2000);
    const dropped = must(setConnected(s, 'p2', false, 7000));
    expect(awayTracked(dropped, 'p2')).toBe(false);
    expect(entry(awayStep(s, dropped, 7000, new Set()), 'p2')).toEqual({ ms: 5000, count: 1, since: null });
    // вилучення — так само
    const kicked = must(removePlayer(s, 'p2'));
    expect(entry(awayStep(s, kicked, 8000, new Set()), 'p2')).toEqual({ ms: 6000, count: 1, since: null });
  });

  it('awayClock runs from the real start, stands on a pause, and is 0 outside the question', () => {
    expect(awayClock(s0, 4000)).toBe(3000);
    const paused = must(pause(s0, 5000));
    expect(awayClock(paused, 9000)).toBe(4000);
    expect(awayClock(must(resume(paused, 15_000)), 16_000)).toBe(5000);
    expect(awayClock(must(lock(s0)), 4000)).toBe(0);
  });

  it('gapMs adds the offline part of a leave while watched, capped by the question start', () => {
    expect(entry(awayEnd(s0, 'p2', 15_000, 4000), 'p2')).toEqual({ ms: 4000, count: 1, since: null });
    expect(entry(awayEnd(s0, 'p2', 3000, 4000), 'p2')).toEqual({ ms: 2000, count: 1, since: null });
    // інтервал і розрив разом — один вихід
    expect(entry(awayEnd(awayStart(s0, 'p2', 10_000), 'p2', 12_000, 3000), 'p2')).toEqual({ ms: 5000, count: 1, since: null });
    // вихід, уже порахований на розриві (інтервал закрито в мить розриву), — той самий вихід: ні розрив, ні новий інтервал разу не додають
    const atDrop = awayStep(awayStart(s0, 'p2', 2000), must(setConnected(awayStart(s0, 'p2', 2000), 'p2', false, 3000)), 3000, new Set());
    const back = must(setConnected(atDrop, 'p2', true, 6000));
    expect(entry(awayEnd(back, 'p2', 7000, 3000, true), 'p2')).toEqual({ ms: 4000, count: 1, since: null });
    expect(entry(awayEnd(awayStart(back, 'p2', 6000), 'p2', 7000, 3000, true), 'p2')).toEqual({ ms: 5000, count: 1, since: null });
    // на закритому запитанні розрив не додається
    const locked = must(lock(s0));
    expect(awayEnd(locked, 'p2', 15_000, 4000)).toBe(locked);
  });
});

describe('who is watched (12e)', () => {
  it('on a normal board cell only the chooser; on a blitz cell everyone', () => {
    const c11 = withPoints(withId(single, 'c11'), 100);
    const c12 = withPoints(withId(single, 'c12'), 200);
    const picked = (kind: 'normal' | 'blitz') => {
      const round = boardRound('g1', [{ title: 'A', cells: [{ question: c11, kind }, c12] }]);
      const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан', 'Віра')));
      return must(pickCell(must(next(intro, 0)), null, 'c11', 0, () => 0));
    };
    const normal = picked('normal');
    const chooser = normal.plays[0].board?.chooserId;
    expect(['p1', 'p2', 'p3'].filter((id) => awayTracked(normal, id))).toEqual([chooser]);
    const blitz = picked('blitz');
    expect(['p1', 'p2', 'p3'].filter((id) => awayTracked(blitz, id))).toEqual(['p1', 'p2', 'p3']);
  });

  it('bluff: who has not written a lie, then who has not picked', () => {
    const quiz = makeQuiz([bluff, single], { leaderboard: 'end', speedBonus: false, rules: { ...DEFAULT_RULES }, buffs: [] });
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'), 10_000, rng);
    s = must(writeLie(s, 'p1', 'Рим', 11_000));
    expect(['p1', 'p2', 'p3'].filter((id) => awayTracked(s, id))).toEqual(['p2', 'p3']);
    s = must(writeLie(s, 'p2', 'Мілан', 12_000));
    s = must(writeLie(s, 'p3', 'Турин', 13_000));
    expect(s.plays[0].bluff?.stage).toBe('choice');
    expect(['p1', 'p2', 'p3'].filter((id) => awayTracked(s, id))).toEqual(['p1', 'p2', 'p3']);
    const truth = s.plays[0].bluff?.options.find((o) => o.kind === 'truth')?.id ?? '';
    s = must(pickBluff(s, 'p2', truth, 14_000));
    expect(['p1', 'p2', 'p3'].filter((id) => awayTracked(s, id))).toEqual(['p1', 'p3']);
  });

  it('survival: ghosts are not watched', () => {
    const T0 = 1000;
    let s = openAt(lobbyWith(makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials)]), 'Оля', 'Петро', 'Віра'), T0, rng);
    s = must(submitAnswer(s, 'p1', kyiv, T0 + 1000));
    s = must(submitAnswer(s, 'p2', kyiv, T0 + 1000));
    s = must(next(must(lock(s)), T0 + 2000, rng));
    s = must(next(s, T0 + 2500, rng));
    s = {
      ...s,
      plays: s.plays.map((p) =>
        p.survival === undefined
          ? p
          : {
              ...p,
              survival: {
                ...p.survival,
                trial: { kind: 'question', fellBack: false, stage: 'closed', questionId: 't1', presented: [], answers: {}, traps: {}, doors: {}, fallback: {}, out: ['p3'] },
              },
            },
      ),
    };
    s = must(next(s, T0 + 3000, rng));
    expect(s.phase).toBe('question');
    expect(s.questionIndex).toBe(1);
    expect(['p1', 'p2', 'p3'].filter((id) => awayTracked(s, id))).toEqual(['p1', 'p2']);
  });

  it('teams: the connected people of a team are watched, keyed by the person; after the captain answers nobody of the team', () => {
    let s = teamGame(teamQuiz([classicRound('r1', [single], PLAIN)]), [['Оля', 'Петро'], ['Віра']]);
    s = must(next(s, 1000, rng));
    expect(awayParticipant(s, 'm2')).toBe('t1');
    expect(awayParticipant(s, 'nobody')).toBeNull();
    expect(['m1', 'm2', 'm3'].filter((id) => awayTracked(s, id))).toEqual(['m1', 'm2', 'm3']);
    const left = awayStart(s, 'm1', 2000);
    expect(left.plays[0].away).toEqual({ m1: { ms: 0, count: 0, since: 2000 } });
    const offline = must(setConnected(s, 'm2', false, 1500));
    expect(awayTracked(offline, 'm2')).toBe(false);
    const answered = must(actAnswer(left, 'm1', kyiv, 3000));
    expect(['m1', 'm2', 'm3'].filter((id) => awayTracked(answered, id))).toEqual(['m3']);
    expect(entry(awayStep(left, answered, 3000, new Set()), 'm1')).toEqual({ ms: 1000, count: 1, since: null });
  });

  it('solo participant is the player; nobody outside the question', () => {
    const s = open();
    expect(awayParticipant(s, 'p1')).toBe('p1');
    expect(awayParticipant(s, 'p9')).toBeNull();
    expect(awayTracked(must(lock(s)), 'p1')).toBe(false);
  });
});
