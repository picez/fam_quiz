import { describe, expect, it } from 'vitest';
import { defaultTeams, type Duels, type Quiz } from '@quiz/shared';
import { adjustScore } from './adjust';
import { answerDuel, betDuel, betsOpen, cancelDuel, declareDuel, duelBettors, duelQuestionOf, pickDuelCategory, skipDuelQuestion } from './duel';
import { next, pause, removePlayer, type GameState } from './game';
import { duelQuiz, revealOf, T0, T1, toDeclarableWith } from './testing/duel';
import { must } from './testing/helpers';
import { teamGame } from './testing/teams';

const rng0 = () => 0;
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
const betLines = (s: GameState) => s.adjustments.filter((a) => a.source === 'duelbet');

/** Оля p1, Петро p2, Іра p3, Тарас p4; Оля оголосила дуель Петрові на reveal q2. */
function declared(patch: Partial<Duels> = {}): GameState {
  return must(declareDuel(toDeclarableWith(['Оля', 'Петро', 'Іра', 'Тарас'], patch), 'p1', 'p2'));
}

/** Дуель стартує: етап category. */
function toCategory(s: GameState, now = T0 + 4000): GameState {
  return must(next(s, now, rng0));
}

/** Дуелянт id відповідає правильно на поточне запитання дуелі. */
function win(s: GameState, id: string, now: number): GameState {
  return must(answerDuel(s, id, duelQuestionOf(s)?.accepted[0] ?? '', now));
}

/** Дуелянт winner виграє кожне запитання дуелі до підсумку (категорію вибирає ведучий); без «Продовжити гру». */
function toResult(s: GameState, winner: string, now = T1): GameState {
  let current = s.duel?.stage === 'declared' ? toCategory(s) : s;
  if (current.duel?.stage === 'category') current = must(pickDuelCategory(current, null, 'dc1', now, rng0));
  while (current.duel?.stage !== 'result') {
    current = win(current, winner, now);
    current = must(next(current, now, rng0));
  }
  return current;
}

/** Нічия: кожен дуелянт виграє по одному запитанню з двох. */
function tie(s: GameState, now = T1): GameState {
  let current = s.duel?.stage === 'declared' ? toCategory(s) : s;
  current = must(pickDuelCategory(current, null, 'dc1', now, rng0));
  current = must(next(win(current, current.duel?.challengerId ?? '', now), now, rng0));
  current = must(next(win(current, current.duel?.opponentId ?? '', now), now, rng0));
  expect(current.duel).toMatchObject({ stage: 'result', winnerId: null });
  return current;
}

describe('duel bets', () => {
  it('others bet while the duel is declared and while the category is picked', () => {
    let s = declared();
    s = must(betDuel(s, 'p3', 'challenger'));
    s = must(betDuel(s, 'p4', 'opponent'));
    expect(s.duel?.bets).toEqual({ p3: 'challenger', p4: 'opponent' });
    s = toCategory(s);
    expect(s.duel?.stage).toBe('category');
    s = must(betDuel(s, 'p3', 'opponent'));
    expect(s.duel?.bets).toEqual({ p3: 'opponent', p4: 'opponent' });
    expect(betDuel(s, 'p3', 'opponent')).toEqual({ ok: true, state: s });
    s = must(betDuel(s, 'p4', null));
    expect(s.duel?.bets).toEqual({ p3: 'opponent' });
    expect(duelBettors(s)).toEqual(['p3', 'p4']);
    expect(betsOpen(s)).toBe(true);
  });

  it('bets close when the first duel question opens', () => {
    const category = toCategory(must(betDuel({ ...declared(), transitions: true }, 'p3', 'challenger')), T0 + 4000);
    expect(category.splash?.kind).toBe('duel');
    // Вибір під час заставки: запитання стартує після неї, але ставки вже закрито.
    const during = must(pickDuelCategory(category, 'p1', 'dc1', T0 + 4001, rng0));
    expect(during.duel?.stage).toBe('question');
    expect(during.startedAt).toBeGreaterThan(T0 + 4001);
    expect(betsOpen(during)).toBe(false);
    expect(betDuel(during, 'p3', 'opponent')).toEqual({ ok: false, error: 'duel_bets_closed' });
    expect(betDuel(during, 'p4', 'opponent')).toEqual({ ok: false, error: 'duel_bets_closed' });
    const after = must(pickDuelCategory(category, 'p1', 'dc1', T1, rng0));
    expect(betDuel(after, 'p4', 'challenger')).toEqual({ ok: false, error: 'duel_bets_closed' });
    // Ведучий за гравця закриває так само.
    const byHost = must(pickDuelCategory(category, null, 'dc1', T1, rng0));
    expect(betDuel(byHost, 'p4', 'challenger')).toEqual({ ok: false, error: 'duel_bets_closed' });
    const answered = win(byHost, 'p1', T1 + 1000);
    expect(answered.duel?.stage).toBe('answer');
    expect(betDuel(answered, 'p4', 'challenger')).toEqual({ ok: false, error: 'duel_bets_closed' });
    const result = toResult(byHost, 'p1');
    expect(betDuel(result, 'p4', 'challenger')).toEqual({ ok: false, error: 'duel_bets_closed' });
    // Ставка, зроблена до вибору, лишилася.
    expect(result.duel?.bets).toEqual({ p3: 'challenger' });
  });

  it('who may not bet', () => {
    const s = declared();
    expect(betDuel(s, 'p1', 'challenger')).toEqual({ ok: false, error: 'duel_bet_self' });
    expect(betDuel(s, 'p2', 'challenger')).toEqual({ ok: false, error: 'duel_bet_self' });
    expect(betDuel(s, 'p9', 'challenger')).toEqual({ ok: false, error: 'not_found' });
    expect(betDuel(must(pause(s, T0 + 3500)), 'p3', 'challenger')).toEqual({ ok: false, error: 'paused' });
    const off = declared({ betStake: 0 });
    expect(betDuel(off, 'p3', 'challenger')).toEqual({ ok: false, error: 'duel_bets_off' });
    expect(betsOpen(off)).toBe(false);
    const none = toDeclarableWith(['Оля', 'Петро', 'Іра', 'Тарас']);
    expect(betDuel(none, 'p3', 'challenger')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(duelBettors(none)).toEqual([]);
    expect(betsOpen(none)).toBe(false);
  });

  it('a right bet wins the stake, a wrong one loses it', () => {
    let s = declared();
    s = must(betDuel(s, 'p3', 'challenger'));
    s = must(betDuel(s, 'p4', 'opponent'));
    const before = s.players.map((p) => p.score);
    const done = toResult(s, 'p1');
    expect(done.duel?.winnerId).toBe('p1');
    expect(score(done, 'p1')).toBe(before[0] + 300);
    expect(score(done, 'p2')).toBe(before[1] - 300);
    expect(score(done, 'p3')).toBe(before[2] + 100);
    expect(score(done, 'p4')).toBe(before[3] - 100);
    expect(done.adjustments.map(({ source, playerId, points, target }) => ({ source, playerId, points, target }))).toEqual([
      { source: 'duel', playerId: 'p1', points: 300, target: undefined },
      { source: 'duel', playerId: 'p2', points: -300, target: undefined },
      { source: 'duelbet', playerId: 'p3', points: 100, target: 'p1' },
      { source: 'duelbet', playerId: 'p4', points: -100, target: 'p2' },
    ]);
  });

  it('a tie changes nothing', () => {
    let s = declared();
    s = must(betDuel(s, 'p3', 'challenger'));
    s = must(betDuel(s, 'p4', 'opponent'));
    const done = tie(s);
    expect(betLines(done)).toEqual([]);
    expect(score(done, 'p3')).toBe(score(s, 'p3'));
    expect(score(done, 'p4')).toBe(score(s, 'p4'));
  });

  it('a bet can push the score below zero', () => {
    let s = declared();
    s = must(adjustScore(s, 'p4', -(score(s, 'p4') ?? 0), T0 + 3500));
    expect(score(s, 'p4')).toBe(0);
    s = must(betDuel(s, 'p4', 'opponent'));
    expect(score(toResult(s, 'p1'), 'p4')).toBe(-100);
  });

  it("the bet stake is the author's", () => {
    const run = (patch: Partial<Duels>) => {
      const s = must(betDuel(must(betDuel(declared(patch), 'p3', 'challenger')), 'p4', 'opponent'));
      return betLines(toResult(s, 'p1')).map((a) => a.points);
    };
    expect(run({ betStake: 250 })).toEqual([250, -250]);
    expect(run({})).toEqual([100, -100]);
    expect(run({ stake: 0 })).toEqual([100, -100]);
  });

  it('no bet, no line', () => {
    const done = toResult(must(betDuel(declared(), 'p4', 'opponent')), 'p2');
    expect(betLines(done).map((a) => a.playerId)).toEqual(['p4']);
    expect(betLines(done)[0]).toMatchObject({ points: 100, target: 'p2' });
  });

  it('a skipped duel with no questions left settles the bets', () => {
    const bet = (s: GameState) => must(betDuel(must(betDuel(s, 'p3', 'challenger')), 'p4', 'opponent'));
    const question = must(pickDuelCategory(toCategory(bet(declared())), 'p1', 'dc1', T1, rng0));
    // Нічия: жодного виграного запитання.
    const drawn = must(skipDuelQuestion({ ...question, duelUsed: ['d1', 'd2', 'd3'] }, T1 + 1000, rng0));
    expect(drawn.duel).toMatchObject({ stage: 'result', winnerId: null });
    expect(betLines(drawn)).toEqual([]);
    // Оля виграла перше, друге пропущено без запасу: Оля перемагає.
    const second = must(next(win(question, 'p1', T1 + 1000), T1 + 2000, rng0));
    expect(second.duel?.stage).toBe('question');
    const won = must(skipDuelQuestion({ ...second, duelUsed: ['d1', 'd2', 'd3'] }, T1 + 3000, rng0));
    expect(won.duel).toMatchObject({ stage: 'result', winnerId: 'p1' });
    expect(betLines(won).map(({ playerId, points, target }) => ({ playerId, points, target }))).toEqual([
      { playerId: 'p3', points: 100, target: 'p1' },
      { playerId: 'p4', points: -100, target: 'p2' },
    ]);
  });

  it('a removed bettor loses the bet, a removed duellist drops the bets', () => {
    const category = toCategory(must(betDuel(must(betDuel(declared(), 'p3', 'challenger')), 'p4', 'opponent')));
    const noIra = must(removePlayer(category, 'p3'));
    expect(noIra.duel?.bets).toEqual({ p4: 'opponent' });
    expect(betLines(toResult(noIra, 'p1')).map((a) => a.playerId)).toEqual(['p4']);
    const noPetro = must(removePlayer(category, 'p2'));
    expect(noPetro.duel).toBeNull();
    expect(betLines(noPetro)).toEqual([]);
    const cancelled = must(cancelDuel(category));
    expect(cancelled.duel).toBeNull();
    expect(betLines(cancelled)).toEqual([]);
  });

  it('a late joiner may bet', () => {
    // addLatePlayer не пускає під час дуелі (restPoint вимагає duel === null): гравець з'являється в стані напряму.
    const s = declared();
    const joined: GameState = { ...s, players: [...s.players, { id: 'p5', nickname: 'Ганна', connected: true, score: 0, totalTimeMs: 0, streak: 0 }] };
    expect(duelBettors(joined)).toEqual(['p3', 'p4', 'p5']);
    expect(must(betDuel(joined, 'p5', 'opponent')).duel?.bets).toEqual({ p5: 'opponent' });
  });

  it('teams: captains of other teams bet for the team', () => {
    const teamsQuiz = (count: number): Quiz => ({ ...duelQuiz(), settings: { ...duelQuiz().settings, teams: defaultTeams(count) } });
    const teamDeclared = (count: number, layout: string[][]) => {
      let s = revealOf(must(next(teamGame(teamsQuiz(count), layout), T0, rng0)), T0 + 1000);
      s = must(next(s, T0 + 2000, rng0));
      s = revealOf(s, T0 + 3000);
      return must(declareDuel(s, 't1', 't2'));
    };
    const s = teamDeclared(3, [['Оля'], ['Петро'], ['Іра']]);
    expect(duelBettors(s)).toEqual(['t3']);
    expect(betsOpen(s)).toBe(true);
    expect(betDuel(s, 't1', 'challenger')).toEqual({ ok: false, error: 'duel_bet_self' });
    const bet = must(betDuel(s, 't3', 'challenger'));
    const before = score(bet, 't3') ?? 0;
    const done = toResult(bet, 't1');
    expect(betLines(done)).toMatchObject([{ playerId: 't3', points: 100, target: 't1' }]);
    expect(score(done, 't3')).toBe(before + 100);

    const two = teamDeclared(2, [['Оля'], ['Петро']]);
    expect(duelBettors(two)).toEqual([]);
    expect(betsOpen(two)).toBe(false);
  });
});
