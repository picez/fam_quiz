import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Answer, type Quiz } from '@quiz/shared';
import { adjustScore } from './adjust';
import { scoreLines, scoreLinesByPlayer, visibleLines } from './breakdown';
import { placeWager } from './final';
import { lock, next, start, submitAnswer, tick, type GameState } from './game';
import { actAnswer } from './team-act';
import { hostView, playerView, stageView } from './views';
import { decideWipeout } from './wipeout';
import { classicRound, finalRound, makeRoundsQuiz, single, wipeoutLadder, wipeoutRound, withId, withPoints } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamLobby, teamQuiz } from './testing/teams';

const rng = () => 0;
const MINUS = { speedBonus: false, rules: { ...DEFAULT_RULES, penalty: 'minus' as const } };
const kyiv = { type: 'single', optionId: 'b' } as const;
const lviv = { type: 'single', optionId: 'a' } as const;
const twoRoundsQuiz = (leaderboard: 'each' | 'end' = 'each'): Quiz =>
  makeRoundsQuiz([classicRound('r1', [single], MINUS), classicRound('r2', [withId(single, 'q2')], MINUS)], { leaderboard });
/** Два класичні раунди по одному запитанню (1000, штраф −1000, без бонусу швидкості); Оля p1, Петро p2. */
const twoRounds = (leaderboard: 'each' | 'end' = 'each') => lobbyWith(twoRoundsQuiz(leaderboard), 'Оля', 'Петро');

const P1 = {
  parts: [
    { source: 'answers', plus: 1000, minus: -1000 },
    { source: 'host', plus: 50, minus: 0 },
  ],
  plus: 1050,
  minus: -1000,
};

function answer(s: GameState, answers: Record<string, Answer>, now: number): GameState {
  let current = s;
  for (const [id, a] of Object.entries(answers)) current = must(submitAnswer(current, id, a, now));
  return current.phase === 'question' ? must(lock(current)) : current;
}

function to(s: GameState, phase: GameState['phase'], now: number): GameState {
  let current = s;
  while (current.phase !== phase) current = must(next(current, now, rng));
  return current;
}

function phone(s: GameState, id: string) {
  const view = playerView(s, id);
  if (view === null) throw new Error('no view');
  return view;
}

/** Перший раунд: Оля правильно, Петро ні; підсумки раунду й +50 Олі. */
function firstRoundEnd(leaderboard: 'each' | 'end' = 'each'): GameState {
  const s = to(answer(startRound(twoRounds(leaderboard), 1000, rng), { p1: kyiv, p2: lviv }, 2000), 'round_end', 3000);
  return must(adjustScore(s, 'p1', 50, 3500));
}

/** Другий раунд відкрито: Оля неправильно, Петро правильно; запитання закрито (locked). */
function secondLocked(leaderboard: 'each' | 'end' = 'each'): GameState {
  return answer(to(firstRoundEnd(leaderboard), 'question', 4000), { p1: lviv, p2: kyiv }, 5000);
}

const finished = () => to(secondLocked(), 'finished', 6000);

/** Для кожного телефона: Σ колонок кожного рядка = рахунок рядка, своя розбивка = me.score. */
function expectVisibleBalanced(s: GameState, ids: string[] = s.players.map((p) => p.id)): void {
  for (const id of ids) {
    const view = phone(s, id);
    for (const row of view.table?.rows ?? []) {
      expect(row.rounds?.reduce((n, x) => n + x, 0), `${id}: ${row.participantId}`).toBe(row.score);
    }
    expect(view.myBreakdown, id).not.toBeNull();
    expect((view.myBreakdown?.plus ?? 0) + (view.myBreakdown?.minus ?? 0), id).toBe(view.me.score);
  }
}

describe('score columns and breakdowns in views (11f)', () => {
  it('the stage gets columns per round on the round end and at the finish', () => {
    expect(stageView(firstRoundEnd()).standings?.map((r) => [r.nickname, r.score, r.rounds])).toEqual([
      ['Оля', 1050, [1050]],
      ['Петро', -1000, [-1000]],
    ]);
    expect(stageView(finished()).standings?.map((r) => [r.nickname, r.score, r.rounds])).toEqual([
      ['Оля', 50, [1050, -1000]],
      ['Петро', 0, [-1000, 1000]],
    ]);
  });

  it('the stage gets no breakdowns', () => {
    for (const s of [firstRoundEnd(), finished()]) {
      expect('myBreakdown' in stageView(s)).toBe(false);
      expect('breakdowns' in stageView(s)).toBe(false);
      expect(JSON.stringify(stageView(s))).not.toContain('"plus":');
    }
  });

  it('a phone gets only its own breakdown', () => {
    const s = finished();
    expect(phone(s, 'p1').myBreakdown).toEqual(P1);
    expect(phone(s, 'p2').myBreakdown).toEqual({ parts: [{ source: 'answers', plus: 1000, minus: -1000 }], plus: 1000, minus: -1000 });
    expect('breakdowns' in phone(s, 'p2')).toBe(false);
    expect(JSON.stringify(phone(s, 'p2'))).not.toContain('"plus":1050');
  });

  it('the host gets every breakdown and the columns', () => {
    const s = finished();
    expect(Object.keys(hostView(s).breakdowns)).toEqual(['p1', 'p2']);
    expect(hostView(s).breakdowns.p1).toEqual(P1);
    expect(hostView(s).standings[0].rounds).toEqual([1050, -1000]);
  });

  it('nothing in the lobby', () => {
    const lobby = twoRounds();
    expect(phone(lobby, 'p1').myBreakdown).toBeNull();
    expect(hostView(lobby).breakdowns).toEqual({});
    expect(phone(lobby, 'p1').table).toBeNull();
  });

  it('locked hides the current question in the columns and the breakdown, the host sees it', () => {
    const s = secondLocked();
    expect(s.phase).toBe('locked');
    expect(phone(s, 'p2').table?.rows.map((r) => [r.nickname, r.score, r.rounds])).toEqual([
      ['Оля', 1050, [1050, 0]],
      ['Петро', -1000, [-1000, 0]],
    ]);
    expect(phone(s, 'p2').myBreakdown).toEqual({ parts: [{ source: 'answers', plus: 0, minus: -1000 }], plus: 0, minus: -1000 });
    const json = JSON.stringify(phone(s, 'p2'));
    expect(json).not.toContain('"rounds":[-1000,1000]');
    expect(json).not.toContain('"rounds":[1050,-1000]');
    expect(hostView(s).standings.find((r) => r.nickname === 'Петро')?.rounds).toEqual([-1000, 1000]);
    expectVisibleBalanced(s);
    const revealed = must(next(s, 5500, rng));
    expect(phone(revealed, 'p2').table?.rows.find((r) => r.nickname === 'Петро')?.rounds).toEqual([-1000, 1000]);
    expect(phone(revealed, 'p2').myBreakdown?.plus).toBe(1000);
    expectVisibleBalanced(revealed);
  });

  it("leaderboard 'end': only the own row, with columns, and the own breakdown", () => {
    const s = must(submitAnswer(to(firstRoundEnd('end'), 'question', 4000), 'p1', lviv, 5000));
    const table = phone(s, 'p1').table;
    expect(table?.full).toBe(false);
    expect(table?.rows.map((r) => [r.participantId, r.rounds])).toEqual([['p1', [1050, 0]]]);
    expect(phone(s, 'p1').myBreakdown).not.toBeNull();
  });

  describe('the wipeout decision window', () => {
    const quiz = makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder), classicRound('r2', [single])]);
    /** w1: все правильно, вікно відкрите о 2000; p1 «Забрати». */
    function took(): GameState {
      const answered = answer(startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'), 0, rng), { p1: kyiv, p2: kyiv, p3: kyiv }, 1000);
      const open = must(next(must(next(answered, 1500, rng)), 2000, rng));
      return must(decideWipeout(open, 'p1', true, 3000));
    }

    it('others see the bank only after the window closes; the owner sees it at once', () => {
      const s = took();
      expect(phone(s, 'p2').table?.rows.find((r) => r.participantId === 'p1')).toMatchObject({ score: 0, rounds: [0] });
      expect(phone(s, 'p1').table?.rows.find((r) => r.participantId === 'p1')?.rounds).toEqual([100]);
      expect(phone(s, 'p1').myBreakdown?.parts).toEqual([{ source: 'wipeout', plus: 100, minus: 0 }]);
      expectVisibleBalanced(s);
      const closed = tick(s, s.endsAt ?? 20_000);
      expect(phone(closed, 'p2').table?.rows.find((r) => r.participantId === 'p1')?.rounds).toEqual([100]);
      expectVisibleBalanced(closed);
    });
  });

  it.each(['classic', 'bank', 'refund'] as const)('every step of the %s final reveal keeps the phone columns and breakdowns balanced', (mode) => {
    // refund: банк, у якому всі помилилися; бали 0, а до розподілу кожен розкритий бачить −ставку.
    const wagerMode = mode === 'classic' ? 'classic' : 'bank';
    const quiz = makeRoundsQuiz(
      [classicRound('r1', [single, withId(withPoints(single, 400), 'q2')], MINUS), finalRound('f', withId(single, 'f1'), { wagerMode })],
      { leaderboard: 'each' },
    );
    let s = must(start(lobbyWith(quiz, 'Анна', 'Богдан', 'Віра')));
    s = must(next(s, 0, rng));
    s = answer(s, { p1: kyiv }, 1000);
    s = answer(to(s, 'question', 2000), { p2: kyiv, p3: lviv }, 4000);
    s = to(s, 'wager', 6000);
    // Банк: Віра отримує 1000 від ведучого, щоб мати що ставити.
    if (wagerMode === 'bank') s = must(adjustScore(s, 'p3', 1000, 8500));
    s = must(placeWager(s, 'p1', wagerMode === 'bank' ? 1000 : 500, 9000, rng));
    s = must(placeWager(s, 'p2', 400, 9500, rng));
    s = must(placeWager(s, 'p3', wagerMode === 'bank' ? 200 : 0, 10_000, rng));
    s = answer(s, mode === 'bank' ? { p1: lviv, p2: kyiv, p3: kyiv } : mode === 'refund' ? { p1: lviv, p2: lviv, p3: lviv } : { p1: kyiv, p2: lviv }, 11_000);
    expectVisibleBalanced(s);
    s = must(next(s, 13_000, rng));
    let steps = 0;
    while (s.phase !== 'finished') {
      expectVisibleBalanced(s);
      // Повернення банку: розкритий до розподілу бачить у своїй розбивці −ставку, як і в рахунку.
      if (mode === 'refund' && s.final?.split === false && s.final.shown === 3) expect(phone(s, 'p1').myBreakdown?.parts).toContainEqual({ source: 'final', plus: 0, minus: -1000 });
      s = must(next(s, 14_000, rng));
      steps += 1;
    }
    expect(steps).toBeGreaterThanOrEqual(3);
    expectVisibleBalanced(s);
  });

  describe('a team game', () => {
    const quiz = teamQuiz([classicRound('r1', [single], MINUS)]);
    function revealed(): GameState {
      let s = must(next(teamGame(quiz, [['Оля', 'Петро'], ['Іра', 'Марко']]), 0, rng));
      s = must(actAnswer(s, 'm1', kyiv, 1000));
      s = must(actAnswer(s, 'm3', lviv, 1000));
      if (s.phase === 'question') s = must(lock(s));
      return must(next(s, 2000, rng));
    }

    it('a member sees the breakdown of the own team, the host sees the teams', () => {
      const s = revealed();
      expect(phone(s, 'm2').myBreakdown).toEqual({ parts: [{ source: 'answers', plus: 1000, minus: 0 }], plus: 1000, minus: 0 });
      expect(phone(s, 'm4').myBreakdown?.minus).toBe(-1000);
      expect(phone(s, 'm2').table?.rows.map((r) => [r.participantId, r.rounds])).toEqual([
        ['t1', [1000]],
        ['t2', [-1000]],
      ]);
      expect(Object.keys(hostView(s).breakdowns)).toEqual(['t1', 't2']);
    });

    it('a member in the lobby has no breakdown', () => {
      expect(phone(teamLobby(quiz, 'Оля'), 'm1').myBreakdown).toBeNull();
    });

    it('members of one team share the cached team view', () => {
      const s = revealed();
      expect(phone(s, 'm1').table).toBe(phone(s, 'm2').table);
      expect(phone(s, 'm1').table).not.toBe(phone(s, 'm3').table);
    });
  });

  it('views of one state reuse cached lines, standings and own views', () => {
    const s = firstRoundEnd();
    expect(scoreLinesByPlayer(s)).toBe(scoreLinesByPlayer(s));
    expect(visibleLines(scoreLines(s), s, () => 0)).toBe(scoreLines(s));
    expect(phone(s, 'p1').standings).toBe(phone(s, 'p2').standings);
    expect(phone(s, 'p1').me).toBe(phone(s, 'p1').me);
    expect(phone(s, 'p1').me).not.toBe(phone(s, 'p2').me);
  });
});

describe('points of the question just closed (backlog 13)', () => {
  it('the table between questions gives everyone the points of the question just closed; the final table has none', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2'), withId(single, 'q3')], MINUS)], { leaderboard: 'each' });
    let s = answer(startRound(lobbyWith(quiz, 'Оля', 'Петро'), 1000, rng), { p1: kyiv, p2: lviv }, 2000);
    s = to(s, 'leaderboard', 3000);
    const first = stageView(s).standings!;
    expect(first.map((row) => [row.nickname, row.question])).toEqual([
      ['Оля', 1000],
      ['Петро', -1000],
    ]);
    // Друге запитання: Петро правильно, Оля мовчить — 0, а не підсумок.
    s = answer(to(s, 'question', 4000), { p2: kyiv }, 5000);
    s = to(s, 'leaderboard', 6000);
    expect(phone(s, 'p1').standings!.map((row) => [row.nickname, row.question])).toEqual([
      ['Оля', 0],
      ['Петро', 1000],
    ]);
    s = answer(to(s, 'question', 7000), {}, 8000);
    s = to(s, 'finished', 9000);
    expect(stageView(s).standings!.every((row) => row.question === undefined)).toBe(true);
  });
});

describe('the lobby on the phone (backlog 5)', () => {
  it('a player in the lobby sees everyone who joined in the order of joining; after the start the list is gone', () => {
    const s = lobbyWith(twoRoundsQuiz(), 'Оля', 'Петро');
    expect(phone(s, 'p2').lobby).toEqual(['Оля', 'Петро']);
    expect(phone(startRound(s, 1000, rng), 'p1').lobby).toBeUndefined();
  });
});
