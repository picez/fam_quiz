import { describe, expect, it } from 'vitest';
import { guidePages, type Answer, type Question, type Quiz } from '@quiz/shared';
import {
  authorPause,
  authorResume,
  authorTeamForm,
  autopilotDue,
  autopilotStart,
  createAutopilotGame,
  pilotKey,
  pilotStep,
  planAutopilot,
} from './autopilot';
import { dicePending, rollDie } from './board-dice';
import { bluffOrder, bluffPlayOf } from './bluff';
import { pickCell, skipTurn } from './board';
import { declareDuel } from './duel';
import { placeWager } from './final';
import { addPlayer, createGame, end, lock, removePlayer, setConnected, submitAnswer, tick, type GameState, type Result, type Rng } from './game';
import { tooSoon, stamp, type PacedAction } from './pacing';
import { suspend } from './restore';
import { duelQuiz } from './testing/duel';
import {
  blitzRound,
  boardRound,
  bluff,
  classicRound,
  finalRound,
  LADDER_RIGHT,
  ladderRound,
  makeRoundsQuiz,
  single,
  survey,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  wipeoutLadder,
  wipeoutRound,
  withId,
  withVideo,
} from './testing/fixtures';
import { must } from './testing/helpers';
import { teamQuiz } from './testing/teams';

const T = 1_000_000;
const rng: Rng = () => 0.3;
const RIGHT: Answer = { type: 'single', optionId: 'b' };
const WRONG: Answer = { type: 'single', optionId: 'a' };

/** Автопілот: автор a (Марта) і гравці p2, p3, … */
function pilotLobby(quiz: Quiz, others: string[] = ['Ігор'], transitions = false): GameState {
  const created = must(createAutopilotGame(quiz, { id: 'a', nickname: 'Марта' }, { transitions }));
  return others.reduce((s, nickname, i) => must(addPlayer(s, { id: `p${i + 2}`, nickname })), created);
}

/** Те, що бачить сервер: stamp, потім planAutopilot. */
const plan = (prev: GameState, next: GameState, now: number): GameState => planAutopilot(prev, stamp(prev, next, now), now);
const act = (prev: GameState, result: Result, now: number): GameState => plan(prev, must(result), now);
const step = (state: GameState, now: number, r: Rng = rng): GameState => plan(state, pilotStep(state, now, r), now);
const atOf = (state: GameState): number | null | undefined => state.autopilot?.at;
/** Крок у мить, яку поставив автопілот. */
const go = (state: GameState, r: Rng = rng): GameState => {
  const at = atOf(state);
  if (at === null || at === undefined) throw new Error('no autopilot step planned');
  return step(state, at, r);
};

/** Автор тисне «Почати гру» о now. */
function begin(quiz: Quiz, others: string[] = ['Ігор'], now = T, transitions = false): GameState {
  const lobby = pilotLobby(quiz, others, transitions);
  return act(lobby, autopilotStart(lobby, now, rng), now);
}

/** Крок не раніший за вікно 11b; на мить раніше — зарано лише тоді, коли вікно 11b довше за час автопілота. */
function paced(state: GameState, action: PacedAction, at: number, windowLonger = false): void {
  expect(tooSoon(state, action, at)).toBe(false);
  expect(tooSoon(state, action, at - 1)).toBe(windowLonger);
}

/** Усі гравці відповідають answer о now. */
const answerAll = (state: GameState, answer: Answer, now: number): GameState =>
  plan(
    state,
    state.players.reduce((s, p) => must(submitAnswer(s, p.id, answer, now)), state),
    now,
  );

const classicQuiz = (...questions: Question[]): Quiz => makeRoundsQuiz([classicRound('r1', questions.length === 0 ? [single] : questions)]);
const boardQuiz = (): Quiz => makeRoundsQuiz([boardRound('g1', [{ title: 'Ріки', cells: [withId(single, 'b1'), withId(single, 'b2'), withId(single, 'b3')] }])]);

describe('stage times (11g)', () => {
  it('guide: 8 s a page', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single])], { newcomers: true });
    expect(guidePages(quiz).length).toBeGreaterThan(1);
    let s = begin(quiz);
    expect(s.phase).toBe('guide');
    expect(atOf(s)).toBe(T + 8000);
    paced(s, 'next', T + 8000);
    s = go(s);
    expect(s.guidePage).toBe(1);
    expect(atOf(s)).toBe(T + 16_000);
  });

  it('round intro: 8 s from the step, plus a second per 60 characters of the description', () => {
    const s = begin(classicQuiz());
    expect(s.phase).toBe('intro');
    expect(s.stepAt).toBe(T);
    expect(atOf(s)).toBe(T + 8000);
    paced(s, 'next', T + 8000);
    const described = begin(makeRoundsQuiz([{ ...classicRound('r1', [single]), description: 'а'.repeat(130) }]));
    expect(atOf(described)).toBe(T + 11_000);
  });

  it('round intro with the round splash: from its end; a timed question waits for the engine', () => {
    let s = begin(classicQuiz(), ['Ігор'], T, true);
    expect(s.splash?.kind).toBe('round');
    const at = s.splash!.until + 8000;
    expect(atOf(s)).toBe(at);
    paced(s, 'next', at);
    s = go(s);
    expect(s.phase).toBe('question');
    expect(atOf(s)).toBeNull();
  });

  it('board intro with two players: the dice start at once, the rest roll after 10 s, the result shows 4 s, then 30 s a turn', () => {
    let s = begin(boardQuiz());
    expect(s.board?.dice).toBeNull();
    expect(atOf(s)).toBe(T);
    s = step(s, T);
    expect(s.board?.dice?.tourNo).toBe(1);
    expect(dicePending(s.board)).toBe(true);
    expect(atOf(s)).toBe(T + 10_000);
    s = act(s, rollDie(s, 'a', () => 0), T + 2000);
    expect(atOf(s)).toBe(T + 10_000);
    s = step(s, T + 10_000, () => 0.9);
    expect(dicePending(s.board)).toBe(false);
    expect(s.board?.circle).toEqual(['p2', 'a']);
    // Заставка раунду вже минула (T + 8000), але результат кубиків видно ще 4 с.
    expect(atOf(s)).toBe(T + 14_000);
    paced(s, 'next', T + 14_000, false);
    s = step(s, T + 14_000);
    expect(s.phase).toBe('board');
    expect(atOf(s)).toBe(T + 44_000);
    paced(s, 'skip', T + 44_000);
    s = go(s);
    expect(s.phase).toBe('board');
    expect(s.board?.done).toBe(1);
  });

  it('board intro with one player: no dice, the intro time', () => {
    let s = begin(boardQuiz(), []);
    expect(atOf(s)).toBe(T + 8000);
    s = go(s);
    expect(s.phase).toBe('board');
    expect(s.board?.dice).toBeNull();
  });

  it('ladder: the contestant is drawn at the end of the intro, the first question 4 s later; without a timer it locks after timeLimit', () => {
    let s = begin(makeRoundsQuiz([ladderRound('l1')]), ['Ігор'], T, true);
    const round = s.quiz.rounds[0];
    expect(round.type === 'ladder' && round.pick).toBe('random');
    const introAt = s.splash!.until + 8000;
    expect(atOf(s)).toBe(introAt);
    paced(s, 'next', introAt);
    s = go(s);
    expect(s.phase).toBe('intro');
    expect(s.ladder?.contestantId).not.toBeNull();
    expect(atOf(s)).toBe(introAt + 4000);
    paced(s, 'next', introAt + 4000);
    s = go(s);
    expect(s.phase).toBe('question');
    expect(atOf(s)).toBe(s.startedAt! + 20_000);
    paced(s, 'lock', s.startedAt! + 20_000);
    s = go(s);
    expect(s.phase).toBe('locked');
  });

  it('ladder decision: 30 s, then «I take it»', () => {
    let s = begin(makeRoundsQuiz([ladderRound('l1')]));
    s = go(go(s));
    expect(s.phase).toBe('question');
    const t = s.startedAt! + 1000;
    s = answerAll(s, LADDER_RIGHT[0], t);
    expect(s.phase).toBe('locked');
    expect(atOf(s)).toBe(t + 1500);
    s = go(s);
    expect(s.phase).toBe('reveal');
    expect(atOf(s)).toBe(t + 7500);
    s = go(s);
    expect(s.phase).toBe('leaderboard');
    expect(atOf(s)).toBe(t + 37_500);
    s = go(s);
    const play = s.plays[s.questionIndex];
    expect(play.ladder?.decision).toBe('take');
    expect(play.ladder?.outcome?.kind).toBe('took');
    expect(atOf(s)).toBe(t + 42_500);
    paced(s, 'next', t + 42_500);
    s = go(s);
    expect(s.phase).toBe('finished');
    expect(atOf(s)).toBeNull();
  });

  it('wager: 30 s, then the final question with 0 for those who did not bet', () => {
    let s = begin(makeRoundsQuiz([finalRound('f1', single)]));
    s = go(s);
    expect(s.phase).toBe('wager');
    const from = T + 8000;
    expect(atOf(s)).toBe(from + 30_000);
    paced(s, 'next', from + 30_000);
    s = go(s);
    expect(s.phase).toBe('question');
    expect(s.plays[s.questionIndex].final?.wagers).toEqual({ a: 0, p2: 0 });
  });

  it('a question with a video locks after its timeLimit, then locked 1.5 s and reveal 6 s', () => {
    let s = begin(classicQuiz({ ...withVideo(single), timeLimit: 20 }));
    s = go(s);
    expect(s.phase).toBe('question');
    const at = s.startedAt! + 20_000;
    expect(atOf(s)).toBe(at);
    paced(s, 'lock', at);
    s = go(s);
    expect(s.phase).toBe('locked');
    expect(atOf(s)).toBe(at + 1500);
    s = go(s);
    expect(s.phase).toBe('reveal');
    expect(atOf(s)).toBe(at + 7500);
    paced(s, 'next', at + 7500);
  });

  it('classic reveal 6 s, table 5 s', () => {
    let s = begin(makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')])], { leaderboard: 'each' }));
    s = go(s);
    const t = s.startedAt! + 1000;
    s = answerAll(s, RIGHT, t);
    s = go(s);
    expect(s.phase).toBe('reveal');
    expect(atOf(s)).toBe(t + 1500 + 6000);
    s = go(s);
    expect(s.phase).toBe('leaderboard');
    expect(atOf(s)).toBe(t + 7500 + 5000);
    paced(s, 'next', t + 12_500);
    s = go(s);
    expect(s.phase).toBe('question');
    expect(s.questionIndex).toBe(1);
  });

  it('survey reveal: the first row after the 11b step, the next ones 1.5 s, 4 s after the last', () => {
    let s = begin(classicQuiz({ ...survey, rows: survey.rows.slice(0, 3) }));
    s = go(s);
    const t = s.startedAt! + 1000;
    s = act(s, lock(s, t), t);
    s = go(s);
    expect(s.phase).toBe('reveal');
    let from = t + 1500;
    expect(atOf(s)).toBe(from + 2000);
    paced(s, 'next', from + 2000, true);
    for (let shown = 1; shown <= 3; shown++) {
      from = atOf(s)!;
      s = go(s);
      expect(s.plays[s.questionIndex].survey?.shown).toBe(shown);
      const ms = shown < 3 ? 1500 : 4000;
      expect(atOf(s)).toBe(from + ms);
      paced(s, 'next', from + ms);
    }
    s = go(s);
    expect(s.phase).not.toBe('reveal');
  });

  it('bluff reveal: the same, option by option', () => {
    let s = begin(classicQuiz(bluff));
    s = go(s);
    const t = s.startedAt! + 1000;
    s = act(s, lock(s, t), t);
    expect(s.plays[s.questionIndex].bluff?.stage).toBe('choice');
    s = act(s, lock(s, t + 1000), t + 1000);
    s = go(s);
    expect(s.phase).toBe('reveal');
    const total = bluffOrder(bluffPlayOf(s)!).length;
    expect(total).toBeGreaterThan(1);
    let from = t + 2500;
    expect(atOf(s)).toBe(from + 2000);
    for (let shown = 1; shown <= total; shown++) {
      from = atOf(s)!;
      s = go(s);
      expect(bluffPlayOf(s)?.bluff.shown).toBe(shown);
      const ms = shown < total ? 1500 : 4000;
      expect(atOf(s)).toBe(from + ms);
      paced(s, 'next', from + ms);
    }
  });

  it('final reveal: 3 s a player and for the bank split, then the round ends', () => {
    let s = begin(makeRoundsQuiz([classicRound('r1', [single]), finalRound('f1', withId(single, 'qf'), { wagerMode: 'bank' })]));
    s = go(s);
    let t = s.startedAt! + 1000;
    s = answerAll(s, RIGHT, t);
    s = go(go(s));
    expect(s.phase).toBe('round_end');
    expect(atOf(s)).toBe(t + 1500 + 6000 + 8000);
    paced(s, 'next', t + 15_500);
    s = go(go(s));
    expect(s.phase).toBe('wager');
    t = atOf(s)! - 30_000;
    s = act(s, placeWager(s, 'a', 100, t, rng), t);
    s = go(s);
    expect(s.phase).toBe('question');
    t = s.startedAt! + 1000;
    s = act(s, submitAnswer(s, 'p2', RIGHT, t), t);
    s = act(s, submitAnswer(s, 'a', WRONG, t), t);
    expect(s.phase).toBe('locked');
    s = go(s);
    expect(s.phase).toBe('reveal');
    let from = t + 1500;
    expect(atOf(s)).toBe(from + 3000);
    for (const shown of [1, 2]) {
      s = go(s);
      expect(s.final?.shown).toBe(shown);
      from += 3000;
      expect(atOf(s)).toBe(from + 3000);
      paced(s, 'next', from + 3000);
    }
    s = go(s);
    expect(s.final?.split).toBe(true);
    from += 3000;
    expect(atOf(s)).toBe(from + 3000);
    s = go(s);
    expect(s.phase).toBe('finished');
  });

  it('wipeout: the open window waits for the engine, the decisions screen 4 s', () => {
    let s = begin(makeRoundsQuiz([wipeoutRound('w1', wipeoutLadder)]));
    s = go(s);
    const t = s.startedAt! + 1000;
    s = answerAll(s, RIGHT, t);
    s = go(go(s));
    expect(s.phase).toBe('leaderboard');
    expect(s.endsAt).not.toBeNull();
    expect(atOf(s)).toBeNull();
    const closes = s.endsAt!;
    s = plan(s, tick(s, closes), closes);
    expect(s.endsAt).toBeNull();
    expect(atOf(s)).toBe(closes + 4000);
    paced(s, 'next', closes + 4000);
  });

  it('survival: the open trial waits for the engine, the verdict 5 s', () => {
    let s = begin(makeRoundsQuiz([survivalRound('s1', survivalQuestions, survivalTrials)]));
    s = go(s);
    const t = s.startedAt! + 1000;
    s = act(s, submitAnswer(s, 'a', RIGHT, t), t);
    s = act(s, submitAnswer(s, 'p2', WRONG, t), t);
    s = go(go(s));
    expect(s.phase).toBe('leaderboard');
    expect(s.endsAt).not.toBeNull();
    expect(atOf(s)).toBeNull();
    const closes = s.endsAt!;
    s = plan(s, tick(s, closes), closes);
    expect(atOf(s)).toBe(closes + 5000);
    paced(s, 'next', closes + 5000);
  });

  it('round end 8 s', () => {
    let s = begin(makeRoundsQuiz([classicRound('r1', [single]), classicRound('r2', [withId(single, 'q2')])]));
    s = go(s);
    const t = s.startedAt! + 1000;
    s = answerAll(s, RIGHT, t);
    s = go(go(s));
    expect(s.phase).toBe('round_end');
    expect(atOf(s)).toBe(t + 15_500);
    paced(s, 'next', t + 15_500);
    s = go(s);
    expect(s.phase).toBe('intro');
    expect(s.roundIndex).toBe(1);
  });

  /** Дуель оголошена на reveal q2 і почата автопілотом (із заставками). */
  function toDuel(): GameState {
    let s = begin(duelQuiz(), ['Петро', 'Іра'], T, true);
    for (const answer of [RIGHT, { type: 'multi', optionIds: ['a', 'c'] } as Answer]) {
      s = go(s);
      expect(s.phase).toBe('question');
      const t = s.startedAt! + 1000;
      s = answerAll(s, answer, t);
      s = go(s);
      expect(s.phase).toBe('reveal');
    }
    const at = atOf(s)!;
    s = act(s, declareDuel(s, 'a', 'p2'), at - 1000);
    expect(atOf(s)).toBe(at);
    s = go(s);
    expect(s.phase).toBe('duel');
    expect(s.duel?.stage).toBe('category');
    return s;
  }

  it('duel: the category by lot 15 s after the splash, answer 4 s, result 5 s', () => {
    let s = toDuel();
    expect(s.splash?.kind).toBe('duel');
    expect(atOf(s)).toBe(s.splash!.until + 15_000);
    s = go(s);
    expect(s.duel?.stage).toBe('question');
    expect(s.duel?.categoryId).toBe('dc1');
    expect(atOf(s)).toBeNull();
    let ends = s.endsAt!;
    s = plan(s, tick(s, ends), ends);
    expect(s.duel?.stage).toBe('answer');
    expect(atOf(s)).toBe(ends + 4000);
    s = go(s);
    expect(s.duel?.stage).toBe('question');
    ends = s.endsAt!;
    s = plan(s, tick(s, ends), ends);
    s = go(s);
    expect(s.duel?.stage).toBe('result');
    expect(atOf(s)).toBe(ends + 4000 + 5000);
    paced(s, 'next', ends + 9000);
    s = go(s);
    expect(s.duel).toBeNull();
  });

  it('duel without questions left: cancelled', () => {
    const s = toDuel();
    const used = s.quiz.duels!.categories.flatMap((c) => c.questions.map((q) => q.id));
    const drained: GameState = { ...s, duelUsed: used };
    const stepped = step(drained, atOf(s)!);
    expect(stepped.duel).toBeNull();
    expect(stepped.phase).toBe('reveal');
  });

  it('team lobby: the dice tour 15 s, then the game starts at once', () => {
    const cycle = (...values: number[]): Rng => {
      let i = 0;
      return () => values[i++ % values.length];
    };
    let s = must(createAutopilotGame(teamQuiz([classicRound('r1', [single])]), { id: 'a', nickname: 'Марта' }, { transitions: false }));
    s = must(addPlayer(s, { id: 'm2', nickname: 'Ігор' }));
    s = must(authorTeamForm(s, 'dice'));
    s = act(s, autopilotStart(s, T, rng), T);
    expect(s.autopilot?.starting).toBe(true);
    expect(atOf(s)).toBe(T + 15_000);
    s = step(s, T + 15_000, cycle(0, 0.9));
    expect(s.phase).toBe('lobby');
    expect(s.teams?.dice?.tour).toEqual([]);
    expect(s.teams?.members.every((m) => m.teamId !== null)).toBe(true);
    expect(atOf(s)).toBe(T + 15_000);
    s = go(s);
    expect(s.phase).toBe('intro');
    expect(s.autopilot?.starting).toBeUndefined();
  });

  it('nothing to do in the lobby without dice and when finished', () => {
    const lobby = pilotLobby(classicQuiz());
    expect(autopilotDue(lobby, T)).toBeNull();
    const joined = plan(lobby, must(addPlayer(lobby, { id: 'p9', nickname: 'Олег' })), T);
    expect(atOf(joined)).toBeNull();
    const s = begin(classicQuiz());
    const finished = act(s, end(s, T + 1000), T + 1000);
    expect(finished.phase).toBe('finished');
    expect(atOf(finished)).toBeNull();
    expect(autopilotDue(finished, T + 1000)).toBeNull();
  });
});

/** Розкриття класики о R з at = R + 6000; гравці a і p2. */
function toReveal(): { s: GameState; R: number } {
  let s = begin(classicQuiz());
  s = go(s);
  const t = s.startedAt! + 1000;
  s = answerAll(s, RIGHT, t);
  s = go(s);
  expect(s.phase).toBe('reveal');
  const R = t + 1500;
  expect(atOf(s)).toBe(R + 6000);
  return { s, R };
}

describe('pause and resume (11g)', () => {
  it('nobody online: pause with the time left; the first one back resumes 3 s later with that time', () => {
    const { s: reveal, R } = toReveal();
    let s = act(reveal, setConnected(reveal, 'a', false, R + 1000), R + 1000);
    expect(s.paused).toBe(false);
    expect(atOf(s)).toBe(R + 6000);
    s = act(s, setConnected(s, 'p2', false, R + 2000), R + 2000);
    expect(s.paused).toBe(true);
    expect(s.autopilot).toEqual({ authorId: 'a', at: null, hold: 'nobody', left: 4000 });
    s = act(s, setConnected(s, 'p2', true, R + 50_000), R + 50_000);
    expect(s.paused).toBe(true);
    expect(atOf(s)).toBe(R + 53_000);
    s = act(s, setConnected(s, 'a', true, R + 51_000), R + 51_000);
    expect(atOf(s)).toBe(R + 53_000);
    expect(step(s, R + 52_999)).toEqual(plan(s, s, R + 52_999));
    s = step(s, R + 53_000);
    expect(s.paused).toBe(false);
    expect(s.autopilot).toEqual({ authorId: 'a', at: R + 57_000 });
    s = go(s);
    expect(s.phase).not.toBe('reveal');
  });

  it('everyone gone again before the countdown ends: no step', () => {
    const { s: reveal, R } = toReveal();
    let s = act(reveal, setConnected(reveal, 'a', false, R + 1000), R + 1000);
    s = act(s, setConnected(s, 'p2', false, R + 1000), R + 1000);
    s = act(s, setConnected(s, 'p2', true, R + 10_000), R + 10_000);
    expect(atOf(s)).toBe(R + 13_000);
    s = act(s, setConnected(s, 'p2', false, R + 11_000), R + 11_000);
    expect(s.paused).toBe(true);
    expect(atOf(s)).toBeNull();
    expect(s.autopilot?.left).toBe(5000);
    expect(pilotStep(s, R + 13_000, rng)).toBe(s);
  });

  it('the author pause: returning players do not resume it; authorResume keeps the time left', () => {
    const { s: reveal, R } = toReveal();
    let s = act(reveal, authorPause(reveal, R + 1000), R + 1000);
    expect(s.paused).toBe(true);
    expect(s.autopilot).toEqual({ authorId: 'a', at: null, hold: 'author', left: 5000 });
    s = act(s, setConnected(s, 'p2', false, R + 2000), R + 2000);
    s = act(s, setConnected(s, 'p2', true, R + 3000), R + 3000);
    expect(atOf(s)).toBeNull();
    s = act(s, authorResume(s, R + 20_000), R + 20_000);
    expect(s.paused).toBe(false);
    expect(s.autopilot).toEqual({ authorId: 'a', at: R + 25_000 });
  });

  it('the author pauses a nobody pause and resumes it with the time left', () => {
    const { s: reveal, R } = toReveal();
    let s = act(reveal, setConnected(reveal, 'a', false, R + 1000), R + 1000);
    s = act(s, setConnected(s, 'p2', false, R + 1000), R + 1000);
    s = act(s, setConnected(s, 'a', true, R + 2000), R + 2000);
    expect(atOf(s)).toBe(R + 5000);
    s = act(s, authorPause(s, R + 3000), R + 3000);
    expect(s.autopilot).toEqual({ authorId: 'a', at: null, hold: 'author', left: 5000 });
    s = act(s, authorResume(s, R + 9000), R + 9000);
    expect(s.autopilot).toEqual({ authorId: 'a', at: R + 14_000 });
  });

  it('the turn player removed during the pause: a fresh turn time after the resume', () => {
    let s = begin(boardQuiz(), ['Ігор', 'Іра']);
    s = step(s, T);
    let i = 0;
    const faces = [0, 0.5, 0.9];
    s = step(s, T + 10_000, () => faces[i++ % faces.length]);
    s = step(s, T + 14_000);
    expect(s.phase).toBe('board');
    // Автора вилучити не можна: хід переходить до наступного.
    if (s.board!.circle[s.board!.done] === 'a') s = act(s, skipTurn(s, T + 15_000), T + 15_000);
    const victim = s.board!.circle[s.board!.done];
    expect(victim).not.toBe('a');
    const turnAt = atOf(s)!;
    s = act(s, authorPause(s, turnAt - 20_000), turnAt - 20_000);
    expect(s.autopilot?.left).toBe(20_000);
    const before = pilotKey(s);
    s = act(s, removePlayer(s, victim), turnAt - 15_000);
    expect(pilotKey(s)).not.toBe(before);
    const now = turnAt + 60_000;
    s = act(s, authorResume(s, now), now);
    expect(atOf(s)).toBe(autopilotDue(s, now));
    expect(atOf(s)).toBe(now + 30_000);
  });

  it('lobby: everyone offline is no pause', () => {
    const lobby = pilotLobby(classicQuiz(), []);
    const s = act(lobby, setConnected(lobby, 'a', false, T), T);
    expect(s.paused).toBe(false);
    expect(s.autopilot).toEqual({ authorId: 'a', at: null });
  });
});

describe('no loops (11g)', () => {
  it('a step that fails clears at, and the plan sets none again', () => {
    let s = begin(makeRoundsQuiz([wipeoutRound('w1', wipeoutLadder)]));
    s = go(s);
    const t = s.startedAt! + 1000;
    s = answerAll(s, RIGHT, t);
    s = go(go(s));
    expect(s.phase).toBe('leaderboard');
    const planted: GameState = { ...s, autopilot: { ...s.autopilot!, at: t + 20_000 } };
    const stepped = pilotStep(planted, t + 20_000, rng);
    expect(stepped).toEqual({ ...s, autopilot: { ...s.autopilot!, at: null } });
    expect(atOf(plan(planted, stepped, t + 20_000))).toBeNull();
  });

  it('before at, without at or in a hosted game: the same object', () => {
    const { s } = toReveal();
    expect(pilotStep(s, atOf(s)! - 1, rng)).toBe(s);
    const idle: GameState = { ...s, autopilot: { ...s.autopilot!, at: null } };
    expect(pilotStep(idle, T * 2, rng)).toBe(idle);
    const hosted = createGame(classicQuiz());
    expect(pilotStep(hosted, T, rng)).toBe(hosted);
    expect(planAutopilot(hosted, hosted, T)).toBe(hosted);
  });
});

describe('task 4 review (11g)', () => {
  it('a board cell answered from the phone is accepted by the key at once and reaches the reveal', () => {
    let s = begin(boardQuiz(), []);
    s = go(s);
    expect(s.phase).toBe('board');
    const t = T + 9000;
    s = act(s, pickCell(s, 'a', 'b1', t, rng), t);
    const answered = s.startedAt! + 1000;
    s = act(s, submitAnswer(s, 'a', RIGHT, answered), answered);
    expect(s.heldAt).not.toBeNull();
    expect(atOf(s)).toBe(answered);
    // «Прийняти» на полі одразу розкриває відповідь.
    s = go(s);
    expect(s.phase).toBe('reveal');
    expect(s.plays[s.questionIndex].answers.a).toMatchObject({ grade: 'correct', overridden: false, points: 1000 });
    expect(atOf(s)).not.toBeNull();
  });

  it('a board in a team game: the captain answers, the autopilot accepts at once', () => {
    let s = must(createAutopilotGame(teamQuiz([boardRound('g1', [{ title: 'Ріки', cells: [withId(single, 'b1'), withId(single, 'b2')] }])]), { id: 'a', nickname: 'Марта' }));
    s = must(addPlayer(s, { id: 'm2', nickname: 'Ігор' }));
    s = must(authorTeamForm(s, 'random'));
    s = act(s, autopilotStart(s, T, rng), T);
    expect(s.players).toHaveLength(2);
    s = step(s, T);
    expect(dicePending(s.board)).toBe(true);
    let face = 0;
    s = go(s, () => [0, 0.9][face++ % 2]);
    expect(dicePending(s.board)).toBe(false);
    s = go(s);
    expect(s.phase).toBe('board');
    const team = s.board!.circle[s.board!.done];
    const t = atOf(s)! - 20_000;
    s = act(s, pickCell(s, team, 'b1', t, rng), t);
    const answered = s.startedAt! + 1000;
    s = act(s, submitAnswer(s, team, RIGHT, answered), answered);
    expect(atOf(s)).toBe(answered);
    s = go(s);
    expect(s.phase).toBe('reveal');
    expect(s.plays[s.questionIndex].answers[team]).toMatchObject({ grade: 'correct', points: 1000 });
  });

  it('a manual blitz turned «by the key»: the queue is judged at once, wrong then right', () => {
    let s = begin(makeRoundsQuiz([blitzRound('b1', [single], { check: 'manual' })]), ['Ігор']);
    s = go(s);
    const t = s.startedAt! + 1000;
    s = act(s, submitAnswer(s, 'a', WRONG, t), t);
    s = act(s, submitAnswer(s, 'p2', RIGHT, t), t);
    expect(atOf(s)).toBe(t);
    s = go(s);
    expect(atOf(s)).toBe(t);
    s = go(s);
    expect(s.phase).toBe('locked');
    expect(s.plays[0].blitz?.attempts.map((x) => [x.playerId, x.grade])).toEqual([
      ['a', 'wrong'],
      ['p2', 'correct'],
    ]);
  });

  it('wipeout and survival: locked, reveal and the table are paced', () => {
    for (const quiz of [makeRoundsQuiz([wipeoutRound('w1', wipeoutLadder)]), makeRoundsQuiz([survivalRound('s1', survivalQuestions, survivalTrials)])]) {
      let s = begin(quiz);
      s = go(s);
      const t = s.startedAt! + 1000;
      s = answerAll(s, RIGHT, t);
      expect(s.phase).toBe('locked');
      paced(s, 'next', atOf(s)!);
      s = go(s);
      expect(s.phase).toBe('reveal');
      paced(s, 'next', atOf(s)!);
      s = go(s);
      expect(s.phase).toBe('leaderboard');
    }
  });

  it('the game starts no more after the team dice tour fails: starting is dropped', () => {
    let s = must(createAutopilotGame(teamQuiz([classicRound('r1', [single])]), { id: 'a', nickname: 'Марта' }));
    s = must(addPlayer(s, { id: 'm2', nickname: 'Ігор' }));
    s = must(authorTeamForm(s, 'dice'));
    s = act(s, autopilotStart(s, T, rng), T);
    s = step(s, T + 15_000, (() => {
      let i = 0;
      return () => [0, 0.9][i++ % 2];
    })());
    expect(s.autopilot?.starting).toBe(true);
    s = act(s, removePlayer(s, 'm2'), T + 15_000);
    s = step(s, T + 15_000);
    expect(s.phase).toBe('lobby');
    expect(s.autopilot).toEqual({ authorId: 'a', at: null });
  });

  it('suspend → restore → the first one back: resume 3 s later with the time left', () => {
    const { s: reveal, R } = toReveal();
    const saved = suspend(reveal, R + 2000);
    expect(saved.autopilot).toEqual({ authorId: 'a', at: null, hold: 'nobody', left: 4000 });
    const back = R + 100_000;
    let s = act(saved, setConnected(saved, 'p2', true, back), back);
    expect(s.autopilot).toEqual({ authorId: 'a', at: back + 3000, hold: 'nobody', left: 4000 });
    s = go(s);
    expect(s.paused).toBe(false);
    expect(s.autopilot).toEqual({ authorId: 'a', at: back + 7000 });
    s = go(s);
    expect(s.phase).not.toBe('reveal');
  });

  it('an untimed question paused and resumed keeps the time left', () => {
    let s = begin(classicQuiz({ ...withVideo(single), timeLimit: 20 }));
    s = go(s);
    const at = s.startedAt! + 20_000;
    expect(atOf(s)).toBe(at);
    s = act(s, authorPause(s, at - 15_000), at - 15_000);
    expect(s.autopilot).toMatchObject({ hold: 'author', left: 15_000, at: null });
    const now = at + 60_000;
    s = act(s, authorResume(s, now), now);
    expect(atOf(s)).toBe(now + 15_000);
    s = go(s);
    expect(s.phase).toBe('locked');
  });
});

describe('silent board (11g soak)', () => {
  it('after a whole circle of skipped turns the cell of the next turn is drawn by lot, 30 s into the turn', () => {
    let s = begin(boardQuiz(), []);
    s = go(s);
    expect(s.phase).toBe('board');
    const first = atOf(s)!;
    s = go(s);
    expect(s.phase).toBe('board');
    expect(s.board?.circleNo).toBe(2);
    expect(atOf(s)).toBe(first + 30_000);
    paced(s, 'skip', first + 30_000);
    s = go(s, () => 0.5);
    expect(s.phase).toBe('question');
    expect(s.plays[s.questionIndex].board).toMatchObject({ cellId: 'b2', chooserId: 'a' });
  });
});

describe('silent board: consecutive skips (11g task 5 review)', () => {
  it('a player removed mid-round: the skips in a row still count against the shorter circle', () => {
    let s = begin(boardQuiz(), ['Ігор', 'Іра']);
    s = step(s, T);
    let i = 0;
    s = step(s, T + 10_000, () => [0, 0.5, 0.9][i++ % 3]);
    s = go(s);
    expect(s.phase).toBe('board');
    expect(s.board?.circle).toHaveLength(3);
    s = go(s);
    s = go(s);
    expect(s.phase).toBe('board');
    expect(s.board?.done).toBe(2);
    expect(s.autopilot?.skips).toBe(2);
    const victim = s.board!.circle.slice(0, 2).find((id) => id !== 'a')!;
    s = act(s, removePlayer(s, victim), atOf(s)! - 1000);
    expect(s.board?.circle).toHaveLength(2);
    // Два пропуски поспіль — ціле нове коло: наступний хід — клітинка жеребом.
    s = go(s, () => 0);
    expect(s.phase).toBe('question');
    expect(s.plays[s.questionIndex].board?.cellId).toBe('b1');
  });

  it('a picked cell starts the count again', () => {
    let s = begin(boardQuiz(), []);
    s = go(s);
    s = act(s, pickCell(s, 'a', 'b1', T + 9000, rng), T + 9000);
    const t = s.startedAt! + 1000;
    s = act(s, submitAnswer(s, 'a', RIGHT, t), t);
    s = go(go(s));
    while (s.phase !== 'board') s = go(s);
    expect(s.autopilot?.skips ?? 0).toBe(0);
    s = go(s);
    expect(s.phase).toBe('board');
    expect(s.autopilot?.skips).toBe(1);
  });
});
