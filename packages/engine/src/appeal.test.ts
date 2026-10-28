import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer, type Round, type RoundRules } from '@quiz/shared';
import {
  appealOpen,
  appealPoints,
  appealPossible,
  appealReasons,
  appealsLeft,
  appealTally,
  appealVoters,
  castAppealVote,
  decideAppeal,
  lastAppeal,
  openAppeal,
} from './appeal';
import { awayEnd, awayStart } from './away';
import { pickCell } from './board';
import { placeWager } from './final';
import { pickContestant } from './ladder';
import { endRound, lock, next, override, pause, recordOf, removePlayer, setConnected, start, submitAnswer, tick, type GameState } from './game';
import { actAnswer } from './team-act';
import {
  blitzRound,
  bluff,
  boardRound,
  chain,
  classicRound,
  finalRound,
  LADDER_WRONG,
  ladderRound,
  makeRoundsQuiz,
  poll,
  single,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  text,
  wipeoutLadder,
  wipeoutRound,
  withId,
  withPoints,
} from './testing/fixtures';
import { acceptAll, lobbyWith, must, openAt, sendBlitz, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const T0 = 1_000_000;
const T1 = T0 + 10_000;
const rng = () => 0;
const t100 = withPoints(text, 100);
const RIGHT: Answer = { type: 'text', value: 'Одеса' };
const WRONG: Answer = { type: 'text', value: 'Одеська' };
const kyiv: Answer = { type: 'single', optionId: 'b' };
const lviv: Answer = { type: 'single', optionId: 'a' };

const quizOf = (rules: RoundRules = DEFAULT_RULES, settings = {}) =>
  makeRoundsQuiz([classicRound('r1', [t100, withId(t100, 't2'), withId(t100, 't3')], { speedBonus: false, rules })], { leaderboard: 'each', ...settings });

/** Відповіді Олі p1, Петра p2 й Іри p3 на поточне запитання, закриття й розкриття. */
function answerAndReveal(s: GameState, answers: [Answer, Answer, Answer], at: number): GameState {
  let state = s;
  answers.forEach((answer, i) => {
    state = must(submitAnswer(state, `p${i + 1}`, answer, at));
  });
  if (state.phase === 'question') state = must(lock(state));
  return must(next(state, at + 500, rng));
}

/** Класика t1…t3 по 100: Оля «Одеська» (неправильно), Петро й Іра «Одеса»; розкриття t1. */
function toReveal(rules: RoundRules = DEFAULT_RULES, settings = {}, answers: [Answer, Answer, Answer] = [WRONG, RIGHT, RIGHT]): GameState {
  return answerAndReveal(startRound(lobbyWith(quizOf(rules, settings), 'Оля', 'Петро', 'Іра'), T0, rng), answers, T0 + 1000);
}

/** Від розкриття до наступного запитання. */
function toNextQuestion(s: GameState, at: number): GameState {
  let state = must(next(s, at, rng));
  while (state.phase !== 'question') state = must(next(state, at, rng));
  return state;
}

const reveal = toReveal();
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
const err = (error: string) => ({ ok: false, error });

describe('appeal decision', () => {
  it('Оля is wrong at the reveal', () => {
    expect(reveal.phase).toBe('reveal');
    expect(recordOf(reveal, 0, 'p1')).toMatchObject({ grade: 'wrong', points: 0 });
    expect(appealReasons(reveal, 'p1')).toEqual(['grade']);
    expect(appealPoints(reveal, 'p1')).toBe(100);
  });

  it('two yes votes out of two add the right-answer points as an appeal adjustment and leave the record', () => {
    let s = must(openAppeal(reveal, 'p1', 'grade', T1));
    expect(appealOpen(s)).toMatchObject({ id: 1, by: 'p1', questionIndex: 0, reason: 'grade', endsAt: T1 + 30_000, outcome: null });
    s = must(castAppealVote(s, 'p2', 1, true, T1 + 1000));
    expect(appealOpen(s)).not.toBeNull();
    s = must(castAppealVote(s, 'p3', 1, true, T1 + 2000));
    expect(s.appeals?.[0]).toMatchObject({ outcome: 'yes', adjustmentSeq: 1 });
    expect(s.adjustments).toEqual([expect.objectContaining({ playerId: 'p1', points: 100, source: 'appeal', afterQuestion: 1, roundIndex: 0 })]);
    expect(recordOf(s, 0, 'p1')).toEqual(recordOf(reveal, 0, 'p1'));
    expect(score(s, 'p1')).toBe(100);
    expect(lastAppeal(s)).toBe(s.appeals?.[0]);
    expect(appealOpen(s)).toBeNull();
  });

  it('1 : 1 is a tie with no adjustment', () => {
    let s = must(openAppeal(reveal, 'p1', 'grade', T1));
    s = must(castAppealVote(s, 'p2', 1, true, T1 + 1000));
    s = must(castAppealVote(s, 'p3', 1, false, T1 + 2000));
    expect(s.appeals?.[0].outcome).toBe('tie');
    expect(s.appeals?.[0]).not.toHaveProperty('adjustmentSeq');
    expect(s.adjustments).toEqual([]);
    expect(score(s, 'p1')).toBe(0);
  });

  it('0 : 0 when the time is up is a tie', () => {
    const s = decideAppeal(must(openAppeal(reveal, 'p1', 'grade', T1)), T1 + 30_000);
    expect(s.appeals?.[0].outcome).toBe('tie');
    expect(s.adjustments).toEqual([]);
  });

  it('1 : 2 is a no', () => {
    // четвертий гравець, щоб голосів було три
    let s = toReveal();
    s = { ...s, players: [...s.players, { ...s.players[2], id: 'p4', nickname: 'Віра' }] };
    s = must(openAppeal(s, 'p1', 'grade', T1));
    s = must(castAppealVote(s, 'p2', 1, true, T1 + 1000));
    s = must(castAppealVote(s, 'p3', 1, false, T1 + 1000));
    s = must(castAppealVote(s, 'p4', 1, false, T1 + 1000));
    expect(s.appeals?.[0].outcome).toBe('no');
    expect(s.adjustments).toEqual([]);
  });

  it('decideAppeal without an open appeal returns the same object', () => {
    expect(decideAppeal(reveal, T1)).toBe(reveal);
  });

  it('a vote can be changed until the end; the tally follows', () => {
    let s = must(openAppeal(reveal, 'p1', 'grade', T1));
    expect(appealTally(s, appealOpen(s)!)).toEqual({ yes: 0, no: 0 });
    s = must(castAppealVote(s, 'p3', 1, false, T1 + 1000));
    expect(appealTally(s, appealOpen(s)!)).toEqual({ yes: 0, no: 1 });
    s = must(castAppealVote(s, 'p3', 1, false, T1 + 1500));
    expect(appealTally(s, appealOpen(s)!)).toEqual({ yes: 0, no: 1 });
    s = must(castAppealVote(s, 'p3', 1, true, T1 + 2000));
    expect(appealTally(s, appealOpen(s)!)).toEqual({ yes: 1, no: 0 });
    s = must(castAppealVote(s, 'p2', 1, true, T1 + 3000));
    expect(s.appeals?.[0].outcome).toBe('yes');
    expect(appealTally(s, s.appeals![0])).toEqual({ yes: 2, no: 0 });
  });

  it('a partial answer can be appealed for the rest of the points', () => {
    const half = { ...DEFAULT_RULES, partial: 50 };
    const s = must(override(toReveal(half), 'p1', 'partial'));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ grade: 'partial', points: 50 });
    expect(appealReasons(s, 'p1')).toEqual(['grade']);
    expect(appealPoints(s, 'p1')).toBe(50);
  });
});

/** Розкриття першого запитання раунду round з гравцями Оля p1, Петро p2, Іра p3: відповіді answers (без ключа — немає). */
function revealOf(round: Round, answers: Record<string, Answer>): GameState {
  let s = openAt(lobbyWith(makeRoundsQuiz([round]), 'Оля', 'Петро', 'Іра'), T0, rng);
  for (const [id, answer] of Object.entries(answers)) s = round.type === 'blitz' ? sendBlitz(s, id, answer, T0 + 1000) : must(submitAnswer(s, id, answer, T0 + 1000));
  // Блеф: «Закрити» спершу відкриває вибір, його закриває час.
  if (s.phase === 'question') s = must(lock(s, T0 + 2000));
  if (s.phase === 'question') s = tick(s, s.endsAt ?? T0 + 60_000);
  while (s.phase !== 'reveal') s = must(next(s, T0 + 90_000, rng));
  return s;
}

describe('what cannot be appealed', () => {
  const unfit = (s: GameState, id = 'p1') => {
    expect(s.phase).toBe('reveal');
    expect(appealReasons(s, id)).toEqual([]);
    expect(openAppeal(s, id, 'grade', T1)).toEqual(err('appeal_unfit'));
  };

  it('a correct answer', () => unfit(reveal, 'p2'));

  it('no answer', () => unfit(toRevealWithout()));

  it('a question already appealed by the same player, whatever the outcome', () => {
    const s = decideAppeal(must(openAppeal(reveal, 'p1', 'grade', T1)), T1 + 30_000);
    unfit(s);
  });

  it('blitz, final, wipeout, ladder and survival rounds', () => {
    unfit(revealOf(blitzRound('b', [single]), { p1: lviv }));
    unfit(revealOf(wipeoutRound('w', wipeoutLadder), { p1: lviv, p2: kyiv, p3: kyiv }));
    unfit(revealOf(survivalRound('s', survivalQuestions, survivalTrials), { p1: lviv, p2: kyiv, p3: kyiv }));
    // фінал: ставки по 0, Оля неправильно
    let f = must(next(must(start(lobbyWith(makeRoundsQuiz([finalRound('f', withId(single, 'f1'))]), 'Оля', 'Петро', 'Іра'))), T0, rng));
    for (const id of ['p1', 'p2', 'p3']) f = must(placeWager(f, id, 0, T0 + 500, rng));
    f = must(submitAnswer(f, 'p1', lviv, T0 + 1000));
    f = must(submitAnswer(f, 'p2', kyiv, T0 + 1000));
    f = must(submitAnswer(f, 'p3', kyiv, T0 + 1000));
    while (f.phase !== 'reveal') f = must(next(f, T0 + 2000, rng));
    unfit(f);
    // «Мільйонер»: Петро — учасник, Оля з залу неправильно
    let l = must(next(must(pickContestant(must(start(lobbyWith(makeRoundsQuiz([ladderRound('rl')]), 'Оля', 'Петро', 'Іра'))), 'p2')), T0, rng));
    l = must(submitAnswer(l, 'p1', LADDER_WRONG[0], T0 + 1000));
    l = must(submitAnswer(l, 'p2', LADDER_WRONG[0], T0 + 1000));
    if (l.phase === 'question') l = must(lock(l));
    while (l.phase !== 'reveal') l = must(next(l, T0 + 2000, rng));
    unfit(l);
    unfit(l, 'p2');
  });

  it('single choice is appealable: the host may still grade it, so the hall may too', () => {
    const s = revealOf(classicRound('r', [single], { speedBonus: false }), { p1: lviv, p2: kyiv, p3: kyiv });
    expect(appealReasons(s, 'p1')).toEqual(['grade']);
    expect(appealPoints(s, 'p1')).toBeGreaterThan(0);
    expect(must(openAppeal(s, 'p1', 'grade', T1)).appeals?.[0]).toMatchObject({ by: 'p1', reason: 'grade', outcome: null });
  });

  it('chain, bluff and poll in a classic round', () => {
    unfit(revealOf(classicRound('r', [chain]), {}));
    unfit(revealOf(classicRound('r', [poll]), { p1: { type: 'poll', optionId: 'a' } }));
    const bluffed = revealOf(classicRound('r', [bluff]), {});
    expect(bluffed.phase).toBe('reveal');
    expect(bluffed.players.every((p) => appealReasons(bluffed, p.id).length === 0)).toBe(true);
  });
});

/** Класика, Оля без відповіді (час сплив), Петро й Іра правильно. */
function toRevealWithout(): GameState {
  let s = startRound(lobbyWith(quizOf(), 'Оля', 'Петро', 'Іра'), T0, rng);
  s = must(submitAnswer(must(submitAnswer(s, 'p2', RIGHT, T0 + 1000)), 'p3', RIGHT, T0 + 1000));
  return must(next(must(lock(s)), T0 + 2000, rng));
}

describe('board cells', () => {
  const minus = { penalty: 'minus' as const, partial: null, streak: null, multiplier: 1 };
  const c11 = withPoints(withId(single, 'c11'), 100);
  const c12 = withPoints(withId(single, 'c12'), 200);
  /** Оля p1 вибрала c11 (cells[0]) о 0. */
  const picked = (cells: Parameters<typeof boardRound>[1][number]['cells'], options = {}) => {
    const intro = must(start(lobbyWith(makeRoundsQuiz([boardRound('g1', [{ title: 'A', cells }], options)]), 'Оля', 'Петро', 'Іра')));
    return must(pickCell(must(next(intro, 0)), null, 'c11', 0, rng));
  };

  it('a wrong chooser on a normal cell with a minus penalty can win back the price and the penalty; everyone else votes', () => {
    const s = acceptAll(must(submitAnswer(picked([c11, c12], { rules: minus }), 'p1', lviv, 1000)), 1000);
    expect(s.phase).toBe('reveal');
    expect(recordOf(s, 0, 'p1')?.points).toBe(-100);
    expect(appealReasons(s, 'p1')).toEqual(['grade']);
    expect(appealPoints(s, 'p1')).toBe(200);
    expect(appealVoters(s, 'p1')).toEqual(['p2', 'p3']);
    // чужа клітинка
    expect(openAppeal(s, 'p2', 'grade', T1)).toEqual(err('appeal_unfit'));
    let a = must(openAppeal(s, 'p1', 'grade', T1));
    a = must(castAppealVote(must(castAppealVote(a, 'p2', 1, true, T1)), 'p3', 1, true, T1));
    expect(a.adjustments).toEqual([expect.objectContaining({ playerId: 'p1', points: 200, source: 'appeal' })]);
    expect(score(a, 'p1')).toBe(100);
  });

  it('a blitz cell and a voice cell without a phone answer cannot be appealed', () => {
    let blitz = picked([{ question: c11, kind: 'blitz' }, c12]);
    blitz = acceptAll(must(submitAnswer(blitz, 'p1', lviv, 1000)), 1000);
    blitz = acceptAll(must(submitAnswer(blitz, 'p2', kyiv, 2000)), 2000);
    while (blitz.phase !== 'reveal') blitz = must(next(blitz, 3000));
    expect(appealReasons(blitz, 'p1')).toEqual([]);
    expect(openAppeal(blitz, 'p1', 'grade', T1)).toEqual(err('appeal_unfit'));
    const voice = must(next(must(override(picked([c11, c12], { answerMode: 'voice' }), 'p1', 'wrong', 1000)), 2000));
    expect(voice.phase).toBe('reveal');
    expect(recordOf(voice, 0, 'p1')?.answer).toBeNull();
    expect(openAppeal(voice, 'p1', 'grade', T1)).toEqual(err('appeal_unfit'));
  });
});

describe('limits', () => {
  it('two appeals a game: the third gets appeals_used; the open one counts', () => {
    let s = reveal;
    expect(appealsLeft(s, 'p1')).toBe(2);
    s = must(openAppeal(s, 'p1', 'grade', T1));
    expect(appealsLeft(s, 'p1')).toBe(1);
    s = decideAppeal(s, T1 + 30_000);
    expect(s.appeals?.[0].outcome).toBe('tie');
    expect(appealsLeft(s, 'p1')).toBe(1);
    s = answerAndReveal(toNextQuestion(s, T1 + 31_000), [WRONG, RIGHT, RIGHT], T1 + 32_000);
    expect(s.questionIndex).toBe(1);
    s = decideAppeal(must(openAppeal(s, 'p1', 'grade', T1 + 40_000)), T1 + 70_000);
    expect(appealsLeft(s, 'p1')).toBe(0);
    s = answerAndReveal(toNextQuestion(s, T1 + 71_000), [WRONG, RIGHT, RIGHT], T1 + 72_000);
    expect(appealReasons(s, 'p1')).toEqual(['grade']);
    expect(openAppeal(s, 'p1', 'grade', T1 + 80_000)).toEqual(err('appeals_used'));
    expect(appealPossible(s)).toBe(false);
  });

  it('host and cancelled appeals do not count', () => {
    const s: GameState = { ...reveal, appeals: [{ id: 1, by: 'p1', questionIndex: 5, reason: 'grade', openedAt: 0, endsAt: 0, votes: {}, outcome: 'host' }, { id: 2, by: 'p1', questionIndex: 6, reason: 'grade', openedAt: 0, endsAt: 0, votes: {}, outcome: 'cancelled' }] };
    expect(appealsLeft(s, 'p1')).toBe(2);
  });

  it('one open appeal at a time; after the decision another player may appeal', () => {
    const both = toReveal(DEFAULT_RULES, {}, [WRONG, WRONG, RIGHT]);
    expect(appealPossible(both)).toBe(true);
    let s = must(openAppeal(both, 'p1', 'grade', T1));
    expect(appealPossible(s)).toBe(false);
    expect(openAppeal(s, 'p2', 'grade', T1)).toEqual(err('appeal_open'));
    s = decideAppeal(s, T1 + 30_000);
    s = must(openAppeal(s, 'p2', 'grade', T1 + 31_000));
    expect(appealOpen(s)).toMatchObject({ id: 2, by: 'p2' });
    expect(appealVoters(s, 'p2')).toEqual(['p1', 'p3']);
  });
});

describe('voters', () => {
  it('a player who is offline and not awaited does not vote: Іра alone closes the appeal', () => {
    const s0 = must(setConnected(reveal, 'p2', false, T1));
    expect(appealVoters(s0, 'p1')).toEqual(['p3']);
    let s = must(openAppeal(s0, 'p1', 'grade', T1));
    expect(castAppealVote(s, 'p2', 1, true, T1)).toEqual(err('vote_denied'));
    s = must(castAppealVote(s, 'p3', 1, true, T1 + 1000));
    expect(s.appeals?.[0].outcome).toBe('yes');
  });

  it('an awaited player still votes', () => {
    const s = { ...must(setConnected(reveal, 'p2', false, T1)), awaiting: ['p2'] };
    expect(appealVoters(s, 'p1')).toEqual(['p2', 'p3']);
  });

  it('nobody else online → no_voters', () => {
    const s = must(setConnected(must(setConnected(reveal, 'p2', false, T1)), 'p3', false, T1));
    expect(openAppeal(s, 'p1', 'grade', T1)).toEqual(err('no_voters'));
    expect(appealPossible(s)).toBe(false);
  });
});

describe('votes and phases', () => {
  const open = must(openAppeal(reveal, 'p1', 'grade', T1));

  it('rejects the appellant, strangers, wrong ids, a pause and a closed appeal', () => {
    expect(castAppealVote(open, 'p1', 1, true, T1)).toEqual(err('vote_denied'));
    expect(castAppealVote(open, 'nobody', 1, true, T1)).toEqual(err('not_found'));
    expect(castAppealVote(open, 'p2', 2, true, T1)).toEqual(err('vote_closed'));
    expect(castAppealVote(must(pause(open, T1 + 100)), 'p2', 1, true, T1 + 200)).toEqual(err('paused'));
    const closed = decideAppeal(open, T1 + 30_000);
    expect(castAppealVote(closed, 'p2', 1, true, T1 + 30_001)).toEqual(err('vote_closed'));
    expect(castAppealVote(reveal, 'p2', 1, true, T1)).toEqual(err('vote_closed'));
  });

  it('openAppeal only on the reveal and not on a pause; a stranger is not found', () => {
    let locked = startRound(lobbyWith(quizOf(), 'Оля', 'Петро', 'Іра'), T0, rng);
    locked = must(lock(must(submitAnswer(locked, 'p1', WRONG, T0 + 1000))));
    expect(openAppeal(locked, 'p1', 'grade', T1)).toEqual(err('wrong_phase'));
    expect(openAppeal(must(pause(reveal, T1)), 'p1', 'grade', T1)).toEqual(err('paused'));
    expect(openAppeal(reveal, 'nobody', 'grade', T1)).toEqual(err('not_found'));
    expect(lastAppeal(locked)).toBeNull();
    expect(lastAppeal(reveal)).toBeNull();
  });
});

describe('team appeals', () => {
  /** Червоні t1 (Оля m1 — капітан, Петро m2) «Одеська», Сині t2 (Віра m3 — капітан, Іра m4) «Одеса»; розкриття. */
  function teamReveal(): GameState {
    let s = must(next(teamGame(teamQuiz([classicRound('r1', [t100], { speedBonus: false, rules: DEFAULT_RULES })]), [['Оля', 'Петро'], ['Віра', 'Іра']]), T0, rng));
    s = must(actAnswer(must(actAnswer(s, 'm1', WRONG, T0 + 1000)), 'm3', RIGHT, T0 + 1000));
    if (s.phase === 'question') s = must(lock(s));
    return must(next(s, T0 + 2000, rng));
  }

  it('only the captain opens; the team is the appellant; the other team votes person by person', () => {
    const s0 = teamReveal();
    expect(s0.phase).toBe('reveal');
    expect(openAppeal(s0, 'm2', 'grade', T1)).toEqual(err('not_captain'));
    let s = must(openAppeal(s0, 'm1', 'grade', T1));
    expect(appealOpen(s)?.by).toBe('t1');
    expect(appealVoters(s, 't1')).toEqual(['m3', 'm4']);
    expect(castAppealVote(s, 'm1', 1, true, T1)).toEqual(err('vote_denied'));
    expect(castAppealVote(s, 'm2', 1, true, T1)).toEqual(err('vote_denied'));
    s = must(castAppealVote(s, 'm3', 1, true, T1 + 1000));
    expect(appealOpen(s)).not.toBeNull();
    s = must(castAppealVote(s, 'm4', 1, true, T1 + 2000));
    expect(s.appeals?.[0].outcome).toBe('yes');
    expect(s.adjustments).toEqual([expect.objectContaining({ playerId: 't1', points: 100, source: 'appeal' })]);
  });
});

describe('the away reason', () => {
  it('a right answer with a 3.5 s leave can be appealed for the penalty; yes adds nothing yet', () => {
    let s = startRound(lobbyWith(quizOf(DEFAULT_RULES, { awayPenalty: true }), 'Оля', 'Петро', 'Іра'), T0, rng);
    s = awayEnd(awayStart(s, 'p1', T0 + 500), 'p1', T0 + 4000);
    expect(s.plays[0].away?.p1?.ms).toBe(3500);
    s = answerAndReveal(s, [RIGHT, RIGHT, RIGHT], T0 + 5000);
    expect(appealReasons(s, 'p1')).toEqual(['away']);
    expect(appealReasons(s, 'p2')).toEqual([]);
    expect(openAppeal(s, 'p1', 'grade', T1)).toEqual(err('appeal_unfit'));
    s = must(openAppeal(s, 'p1', 'away', T1));
    s = must(castAppealVote(must(castAppealVote(s, 'p2', 1, true, T1)), 'p3', 1, true, T1));
    expect(s.appeals?.[0]).toMatchObject({ reason: 'away', outcome: 'yes' });
    expect(s.appeals?.[0]).not.toHaveProperty('adjustmentSeq');
    expect(s.adjustments).toEqual([]);
  });
});

describe('review cases (12f)', () => {
  const stripped = (s: GameState, id: string): GameState => ({ ...s, players: s.players.filter((p) => p.id !== id) });

  it('error order: appeal_open before appeal_unfit, appeals_used before no_voters', () => {
    const s = must(openAppeal(reveal, 'p1', 'grade', T1));
    expect(openAppeal(s, 'p3', 'grade', T1)).toEqual(err('appeal_open'));
    const used = (q: number, id: number) => ({ id, by: 'p1', questionIndex: q, reason: 'grade' as const, openedAt: 0, endsAt: 0, votes: {}, outcome: 'no' as const });
    let alone: GameState = { ...reveal, appeals: [used(5, 1), used(6, 2)] };
    alone = must(setConnected(must(setConnected(alone, 'p2', false, T1)), 'p3', false, T1));
    expect(openAppeal(alone, 'p1', 'grade', T1)).toEqual(err('appeals_used'));
  });

  it('both reasons on one question: after the first appeal the second is appeal_unfit', () => {
    let s = startRound(lobbyWith(quizOf({ ...DEFAULT_RULES, partial: 50 }, { awayPenalty: true }), 'Оля', 'Петро', 'Іра'), T0, rng);
    s = awayEnd(awayStart(s, 'p1', T0 + 500), 'p1', T0 + 4000);
    s = must(override(answerAndReveal(s, [WRONG, RIGHT, RIGHT], T0 + 5000), 'p1', 'partial'));
    expect(appealReasons(s, 'p1')).toEqual(['grade', 'away']);
    s = decideAppeal(must(openAppeal(s, 'p1', 'grade', T1)), T1 + 30_000);
    expect(openAppeal(s, 'p1', 'away', T1 + 31_000)).toEqual(err('appeal_unfit'));
  });

  it('away yes never writes a row: the penalty comes only after the reveal, and the passed appeal drops it there', () => {
    let s = startRound(lobbyWith(quizOf(DEFAULT_RULES, { awayPenalty: true }), 'Оля', 'Петро', 'Іра'), T0, rng);
    s = awayEnd(awayStart(s, 'p1', T0 + 500), 'p1', T0 + 4000);
    s = answerAndReveal(s, [RIGHT, RIGHT, RIGHT], T0 + 5000);
    s = must(openAppeal(s, 'p1', 'away', T1));
    s = must(castAppealVote(must(castAppealVote(s, 'p2', 1, true, T1)), 'p3', 1, true, T1));
    expect(s.appeals?.[0]).toMatchObject({ outcome: 'yes' });
    expect(s.appeals?.[0]).not.toHaveProperty('adjustmentSeq');
    expect(s.adjustments).toEqual([]);
    s = must(next(s, T1 + 1000, rng));
    expect(s.adjustments.filter((a) => a.source === 'away')).toEqual([]);
    expect(score(s, 'p1')).toBe(100);
  });

  it('a closed appeal keeps only the counts: votes are emptied, and a voter kicked later changes nothing', () => {
    let s = must(openAppeal(reveal, 'p1', 'grade', T1));
    s = must(castAppealVote(must(castAppealVote(s, 'p2', 1, true, T1)), 'p3', 1, true, T1));
    expect(s.appeals?.[0]).toMatchObject({ outcome: 'yes', votes: {}, yes: 2, no: 0 });
    const kicked = must(removePlayer(s, 'p2', T1 + 1000));
    expect(appealTally(kicked, kicked.appeals![0])).toEqual({ yes: 2, no: 0 });
    // Скасована й закрита ведучим теж без голосів.
    const voted = must(castAppealVote(must(openAppeal(reveal, 'p1', 'grade', T1)), 'p2', 1, false, T1));
    expect(must(endRound(voted, T1 + 1000)).appeals?.[0]).toMatchObject({ outcome: 'cancelled', votes: {}, yes: 0, no: 1 });
    expect(must(override(voted, 'p1', 'correct', T1 + 1000)).appeals?.[0]).toMatchObject({ outcome: 'host', votes: {}, yes: 0, no: 1 });
  });

  it('a removed appellant gets no points from yes; the tally skips removed voters', () => {
    const voted = must(castAppealVote(must(openAppeal(reveal, 'p1', 'grade', T1)), 'p2', 1, true, T1));
    const decided = decideAppeal(stripped(voted, 'p1'), T1 + 30_000);
    expect(decided.appeals?.[0].outcome).toBe('yes');
    expect(decided.adjustments).toEqual([]);
    expect(appealTally(stripped(voted, 'p2'), appealOpen(voted)!)).toEqual({ yes: 0, no: 0 });
  });

  it('an appeal off its reveal takes no votes and is cancelled, not decided', () => {
    const s = must(castAppealVote(must(openAppeal(reveal, 'p1', 'grade', T1)), 'p2', 1, true, T1));
    const off: GameState = { ...s, phase: 'leaderboard' };
    expect(castAppealVote(off, 'p3', 1, true, T1)).toEqual(err('vote_closed'));
    const closed = decideAppeal(off, T1 + 30_000);
    expect(closed.appeals?.[0].outcome).toBe('cancelled');
    expect(closed.adjustments).toEqual([]);
    expect(decideAppeal({ ...s, questionIndex: 1 }, T1).appeals?.[0].outcome).toBe('cancelled');
  });

  it('a voice cell answer: the grade cannot be appealed, the away penalty can', () => {
    const c11 = withPoints(withId(single, 'c11'), 100);
    const intro = must(start(lobbyWith(makeRoundsQuiz([boardRound('g1', [{ title: 'A', cells: [c11, withId(c11, 'c12')] }], { answerMode: 'voice' })], { awayPenalty: true }), 'Оля', 'Петро', 'Іра')));
    let s = must(pickCell(must(next(intro, 0)), null, 'c11', 0, rng));
    s = awayEnd(awayStart(s, 'p1', 100), 'p1', 3600);
    s = must(next(must(override(s, 'p1', 'correct', 4000)), 5000));
    expect(s.phase).toBe('reveal');
    expect(recordOf(s, 0, 'p1')).toMatchObject({ answer: null, points: 100 });
    expect(appealReasons(s, 'p1')).toEqual(['away']);
    expect(must(openAppeal(s, 'p1', 'away', T1)).appeals?.[0]).toMatchObject({ by: 'p1', reason: 'away', outcome: null });
  });

  it('team game: a member without a team and a vote by the team id are not found', () => {
    let s = toTeamReveal();
    s = { ...s, teams: { ...s.teams!, members: [...s.teams!.members, { id: 'm9', nickname: 'Ліна', connected: true, teamId: null }] } };
    expect(openAppeal(s, 'm9', 'grade', T1)).toEqual(err('not_found'));
    const open = must(openAppeal(s, 'm1', 'grade', T1));
    expect(castAppealVote(open, 't1', 1, true, T1)).toEqual(err('not_found'));
    expect(castAppealVote(open, 't2', 1, true, T1)).toEqual(err('not_found'));
  });
});

/** Червоні t1 (Оля m1 — капітан, Петро m2) «Одеська», Сині t2 (Віра m3, Іра m4) «Одеса»; розкриття. */
function toTeamReveal(): GameState {
  let s = must(next(teamGame(teamQuiz([classicRound('r1', [t100], { speedBonus: false, rules: DEFAULT_RULES })]), [['Оля', 'Петро'], ['Віра', 'Іра']]), T0, rng));
  s = must(actAnswer(must(actAnswer(s, 'm1', WRONG, T0 + 1000)), 'm3', RIGHT, T0 + 1000));
  if (s.phase === 'question') s = must(lock(s));
  return must(next(s, T0 + 2000, rng));
}
