import { describe, expect, it } from 'vitest';
import { defaultTeams, type Answer } from '@quiz/shared';
import { lock, next, pause, start, submitAnswer, tick, type GameState } from './game';
import { actAnswer, actorOf } from './team-act';
import { classicRound, makeRoundsQuiz, single, wipeoutLadder, wipeoutRound } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { hostView, playerView, stageView } from './views';
import { decideWipeout, decisionOpen } from './wipeout';

const rng = () => 0;
const quiz = makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder), classicRound('r2', [single])], { debuffs: ['fog', 'mud'] });
const lobby = () => lobbyWith(quiz, 'Оля', 'Петро', 'Віра');

const RIGHT: Answer[] = [
  { type: 'single', optionId: 'b' },
  { type: 'boolean', value: true },
  { type: 'numeric', value: 2100 },
  { type: 'text', value: 'Одеса' },
  { type: 'slider', value: 52 },
];
const WRONG: Answer = { type: 'single', optionId: 'a' };

const stage = (s: GameState) => stageView(s);
const phone = (s: GameState, id: string) => must2(playerView(s, id));
function must2<T>(value: T | null): T {
  if (value === null) throw new Error('no view');
  return value;
}

/** Усі відповіли; повертає стан на locked. */
function answered(s: GameState, answers: Record<string, Answer>, now = 1000): GameState {
  let current = s;
  for (const [id, answer] of Object.entries(answers)) current = must(submitAnswer(current, id, answer, now));
  return current.phase === 'question' ? must(lock(current)) : current;
}

/** Перша сходинка зіграна, вікно відкрите о 2000. */
function windowOpen(answers: Record<string, Answer> = { p1: RIGHT[0], p2: RIGHT[0], p3: RIGHT[0] }): GameState {
  const revealed = must(next(answered(startRound(lobby(), 0, rng), answers), 1500, rng));
  return must(next(revealed, 2000, rng));
}

describe('wipeout views (10g)', () => {
  it('the ladder shows prices and everyone in on the intro', () => {
    const s = must(start(lobby()));
    const info = stage(s).wipeout;
    expect(s.phase).toBe('intro');
    expect(info?.ladder).toEqual([100, 200, 300, 400, 500]);
    expect(info?.current).toBe(-1);
    expect(info?.done).toBe(0);
    expect(info?.inCount).toBe(3);
    expect(info?.rows.map((r) => [r.status, r.bank, r.decision])).toEqual([
      ['in', 0, null],
      ['in', 0, null],
      ['in', 0, null],
    ]);
    expect(info?.decide).toBeNull();
  });

  it('no new bank or burn reaches the stage or phones before the reveal', () => {
    // w1: все правильно, вікно закриваємо; w2: p1 правильно, p2 неправильно.
    let s = windowOpen();
    for (const id of ['p1', 'p2', 'p3']) s = must(decideWipeout(s, id, false, 3000));
    s = must(next(s, 13_000, rng));
    expect(s.phase).toBe('question');
    s = answered(s, { p1: RIGHT[1], p2: { type: 'boolean', value: false } }, 14_000);
    for (const view of [JSON.stringify(stage(s)), JSON.stringify(phone(s, 'p2')), JSON.stringify(phone(s, 'p1'))]) {
      expect(view).not.toContain('"burned"');
      expect(view).not.toContain('"bank":300');
    }
    expect(phone(s, 'p2').me.wipeout?.status).toBe('in');
    expect(stage(s).wipeout?.done).toBe(1);
    const locked = s.phase;
    expect(locked).toBe('locked');
    const revealed = must(next(s, 15_000, rng));
    expect(revealed.phase).toBe('reveal');
    const rows = stage(revealed).wipeout?.rows ?? [];
    expect(rows.find((r) => r.playerId === 'p2')?.status).toBe('burned');
    expect(rows.find((r) => r.playerId === 'p1')?.status).toBe('in');
    expect(rows.find((r) => r.playerId === 'p1')?.bank).toBe(300);
    expect(stage(revealed).wipeout?.done).toBe(2);
  });

  it('phones and the stage see only who decided; the host sees the choice', () => {
    let s = windowOpen();
    s = must(decideWipeout(s, 'p1', true, 3000));
    const rowOf = (info: ReturnType<typeof stage>['wipeout'], id: string) => info?.rows.find((r) => r.playerId === id);
    expect(rowOf(stage(s).wipeout, 'p1')?.decision).toBe('decided');
    expect(rowOf(stage(s).wipeout, 'p2')?.decision).toBe('pending');
    expect(rowOf(phone(s, 'p2').wipeout, 'p1')?.decision).toBe('decided');
    expect(rowOf(hostView(s).wipeout, 'p1')?.decision).toBe('take');
    expect(rowOf(hostView(s).wipeout, 'p2')?.decision).toBe('pending');
    const json = JSON.stringify(stage(s));
    expect(json).not.toContain('"take"');
    expect(json).not.toContain('"stay"');
    // статус забраного не видно сцені, доки вікно відкрите
    expect(rowOf(stage(s).wipeout, 'p1')?.status).toBe('in');
    expect(rowOf(hostView(s).wipeout, 'p1')?.status).toBe('took');
    // і чужий рахунок у таблиці теж не змінився
    const other = phone(s, 'p2').table?.rows.find((r) => r.participantId === 'p1');
    expect(other?.score).toBe(0);
    expect(phone(s, 'p1').me.score).toBe(100);
    s = must(decideWipeout(s, 'p2', false, 3500));
    expect(JSON.stringify(stage(s))).not.toContain('"stay"');
    expect(rowOf(hostView(s).wipeout, 'p2')?.decision).toBe('stay');
  });

  it('the window carries its clock', () => {
    let s = windowOpen();
    expect(stage(s).wipeout?.decide).toEqual({ endsAt: s.endsAt, remainingMs: null, decided: 0, total: 3 });
    expect(s.endsAt).toBe(12_000);
    s = must(decideWipeout(s, 'p1', false, 3000));
    expect(stage(s).wipeout?.decide?.decided).toBe(1);
    s = must(pause(s, 6000));
    expect(stage(s).wipeout?.decide).toEqual({ endsAt: null, remainingMs: 6000, decided: 1, total: 3 });
  });

  it('me.wipeout: canDecide only in the window, for those in who have not decided', () => {
    const s = windowOpen({ p1: RIGHT[0], p2: RIGHT[0], p3: WRONG });
    expect(phone(s, 'p1').me.wipeout).toEqual({ status: 'in', bank: 100, decision: null, canDecide: true });
    expect(phone(s, 'p3').me.wipeout).toEqual({ status: 'burned', bank: 0, decision: null, canDecide: false });
    const decided = must(decideWipeout(s, 'p1', true, 3000));
    expect(phone(decided, 'p1').me.wipeout).toEqual({ status: 'took', bank: 100, decision: 'take', canDecide: false });
    expect(phone(decided, 'p2').me.wipeout?.canDecide).toBe(true);
    const paused = must(pause(s, 4000));
    expect(phone(paused, 'p2').me.wipeout?.canDecide).toBe(false);
    // за межами вікна — теж ні
    const closed = tick(s, s.endsAt ?? 0);
    expect(phone(closed, 'p2').me.wipeout?.canDecide).toBe(false);
    expect(phone(closed, 'p2').me.wipeout?.status).toBe('took');
  });

  it('the ladder replaces the leaderboard, the table button still works', () => {
    const s = windowOpen();
    expect(s.phase).toBe('leaderboard');
    expect(stage(s).standings).toBeNull();
    expect(phone(s, 'p1').standings).toBeNull();
    expect(phone(s, 'p1').table).not.toBeNull();
  });

  it('the host loses the debuff menu during the round', () => {
    const s = startRound(lobby(), 0, rng);
    expect(hostView(s).allowed.debuffs).toEqual([]);
    expect(hostView(windowOpen()).allowed.debuffs).toEqual([]);
    // на round_end меню повертається
    let end = windowOpen();
    for (let i = 0; i < 5 && end.phase !== 'round_end'; i += 1) {
      if (end.phase === 'leaderboard') end = tick(end, end.endsAt ?? 0);
      end = end.phase === 'question' ? must(lock(end)) : end;
      end = must(next(end, 20_000, rng));
    }
    expect(end.phase).toBe('round_end');
    expect(hostView(end).allowed.debuffs).toEqual(['fog', 'mud']);
  });

  it('outside wipeout there is no ladder', () => {
    const classic = startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля', 'Петро'), 0, rng);
    expect(stage(classic).wipeout).toBeNull();
    expect(phone(classic, 'p1').wipeout).toBeNull();
    expect(phone(classic, 'p1').me.wipeout).toBeNull();
    expect(hostView(classic).wipeout).toBeNull();
  });

  it('the table button respects "only at the end" during the decision window, "each" shows everyone', () => {
    const open = (leaderboard: 'end' | 'each') => {
      const q = makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder), classicRound('r2', [single])], { leaderboard });
      const revealed = must(next(answered(startRound(lobbyWith(q, 'Оля', 'Петро', 'Віра'), 0, rng), { p1: RIGHT[0], p2: RIGHT[0], p3: RIGHT[0] }), 1500, rng));
      return must(next(revealed, 2000, rng));
    };
    const end = open('end');
    expect(end.phase).toBe('leaderboard');
    const own = phone(end, 'p1').table;
    expect(own?.full).toBe(false);
    expect(own?.rows.map((r) => r.participantId)).toEqual(['p1']);
    const each = phone(open('each'), 'p1').table;
    expect(each?.full).toBe(true);
    expect(each?.rows).toHaveLength(3);
  });

  it('a player who is out gets no newcomer type tip, one who is still in does', () => {
    const q = makeRoundsQuiz([wipeoutRound('rw', wipeoutLadder), classicRound('r2', [single])], { newcomers: true });
    // w1: p2 помиляється й вибуває; w2 (boolean) — новий тип
    let g = must(start(lobbyWith(q, 'Оля', 'Петро', 'Віра')));
    while (g.phase === 'guide') g = must(next(g, 0, rng));
    let s = answered(must(next(g, 0, rng)), { p1: RIGHT[0], p2: WRONG, p3: RIGHT[0] });
    s = must(next(s, 1500, rng));
    s = must(next(s, 2000, rng));
    for (const id of ['p1', 'p3']) s = must(decideWipeout(s, id, false, 3000));
    s = must(next(s, 13_000, rng));
    expect(s.phase).toBe('question');
    expect(phone(s, 'p1').me.tip).toBe('boolean');
    expect(phone(s, 'p2').me.tip).toBeNull();
  });
});

describe('wipeout decisions and banks for everyone (11e)', () => {
  const choices = (info: ReturnType<typeof stage>['wipeout']) => info?.rows.map((r) => r.choice);
  const views = (s: GameState) => [stage(s), phone(s, 'p3'), phone(s, 'p1'), hostView(s)];

  it('the window stays secret, paused too: no choice anywhere, the host still sees take', () => {
    let s = windowOpen();
    s = must(decideWipeout(s, 'p1', true, 3000));
    s = must(decideWipeout(s, 'p2', false, 3500));
    for (const state of [s, must(pause(s, 4000))]) {
      expect(stage(state).wipeout?.decisions).toBe(false);
      for (const view of views(state)) expect(choices(view.wipeout)).toEqual([null, null, null]);
      expect(JSON.stringify(stage(state))).not.toContain('"choice":"');
      expect(JSON.stringify(phone(state, 'p3'))).not.toContain('"choice":"');
      expect(hostView(state).wipeout?.rows[0].decision).toBe('take');
    }
  });

  it('once the window closes everyone gets the same choices: took, stay, by default', () => {
    let s = windowOpen();
    s = must(decideWipeout(s, 'p1', true, 3000));
    s = must(decideWipeout(s, 'p2', false, 3500));
    s = tick(s, 12_000);
    for (const view of [stage(s), phone(s, 'p2'), hostView(s)]) {
      expect(view.wipeout?.decisions).toBe(true);
      expect(view.wipeout?.rows.map((r) => [r.playerId, r.status, r.bank, r.choice])).toEqual([
        ['p1', 'took', 100, 'took'],
        ['p2', 'in', 100, 'stay'],
        ['p3', 'took', 100, 'auto'],
      ]);
      expect(view.wipeout?.rows.map((r) => r.decision)).toEqual([null, null, null]);
      expect(view.wipeout?.decide).toBeNull();
    }
    // наступне запитання — вибору вже немає
    const following = must(next(s, 13_000, rng));
    expect(following.phase).toBe('question');
    expect(stage(following).wipeout?.decisions).toBe(false);
    expect(choices(stage(following).wipeout)).toEqual([null, null, null]);
    expect(choices(hostView(following).wipeout)).toEqual([null, null, null]);
  });

  it('a player who decided to take is took, not auto', () => {
    let s = windowOpen();
    s = must(decideWipeout(s, 'p1', false, 3000));
    s = must(decideWipeout(s, 'p2', false, 3000));
    s = must(decideWipeout(s, 'p3', true, 3000));
    expect(stage(s).wipeout?.decisions).toBe(true);
    expect(choices(stage(s).wipeout)).toEqual(['stay', 'stay', 'took']);
  });

  it('a player out before the window has no choice', () => {
    let s = windowOpen({ p1: RIGHT[0], p2: RIGHT[0], p3: WRONG });
    s = must(decideWipeout(s, 'p1', false, 3000));
    s = must(decideWipeout(s, 'p2', false, 3000));
    const p3 = stage(s).wipeout?.rows.find((r) => r.playerId === 'p3');
    expect(p3?.status).toBe('burned');
    expect(p3?.choice).toBeNull();
  });

  it('the reveal carries each bank before the rung; question and locked never do', () => {
    let s = windowOpen();
    for (const id of ['p1', 'p2', 'p3']) s = must(decideWipeout(s, id, false, 3000));
    s = must(next(s, 13_000, rng));
    s = answered(s, { p1: RIGHT[1], p2: { type: 'boolean', value: false } }, 14_000);
    expect(s.phase).toBe('locked');
    for (const view of views(s)) expect(view.wipeout?.rows.map((r) => r.prev)).toEqual([null, null, null]);
    expect(JSON.stringify(stage(s))).not.toContain('"prev":1');
    s = must(next(s, 15_000, rng));
    expect(s.phase).toBe('reveal');
    for (const view of views(s))
      expect(view.wipeout?.rows.map((r) => [r.playerId, r.status, r.prev, r.bank])).toEqual([
        ['p1', 'in', 100, 300],
        ['p2', 'burned', 100, 0],
        ['p3', 'burned', 100, 0],
      ]);
    // вікно, p1 «Далі», наступна сходинка — prev знову null
    s = must(next(s, 16_000, rng));
    s = must(decideWipeout(s, 'p1', false, 17_000));
    s = must(next(s, 18_000, rng));
    expect(s.phase).toBe('question');
    expect(stage(s).wipeout?.rows.map((r) => r.prev)).toEqual([null, null, null]);
  });

  it('a player out on the first rung has no bank before the second', () => {
    let s = windowOpen({ p1: RIGHT[0], p2: RIGHT[0], p3: WRONG });
    s = must(decideWipeout(s, 'p1', false, 3000));
    s = must(decideWipeout(s, 'p2', false, 3000));
    s = must(next(s, 13_000, rng));
    s = answered(s, { p1: RIGHT[1], p2: RIGHT[1] }, 14_000);
    s = must(next(s, 15_000, rng));
    expect(s.phase).toBe('reveal');
    expect(stage(s).wipeout?.rows.map((r) => [r.playerId, r.prev])).toEqual([
      ['p1', 100],
      ['p2', 100],
      ['p3', null],
    ]);
  });

  it('a version 12 room without auto shows everyone who took as took', () => {
    let s = windowOpen();
    s = must(decideWipeout(s, 'p1', true, 3000));
    s = must(decideWipeout(s, 'p2', false, 3500));
    s = tick(s, 12_000);
    const play = s.plays[s.questionIndex];
    expect(play.wipeout?.auto).toEqual(['p3']);
    const { auto: _auto, ...old } = play.wipeout ?? { took: [], stay: [], end: false };
    const v12: GameState = { ...s, plays: s.plays.map((p) => (p === play ? { ...p, wipeout: old } : p)) };
    expect(choices(stage(v12).wipeout)).toEqual(['took', 'stay', 'took']);
  });

  it('a team game: rows are teams, the choice is by team id, the same for every member', () => {
    const tq = teamQuiz([wipeoutRound('rw', wipeoutLadder)]);
    let s = must(next(teamGame(tq, [['Оля', 'Петро'], ['Іра', 'Марко']]), 0, rng));
    s = must(actAnswer(s, 'm1', RIGHT[0], 1000));
    s = must(actAnswer(s, 'm3', RIGHT[0], 1000));
    s = s.phase === 'question' ? must(lock(s)) : s;
    s = must(next(s, 1500, rng));
    s = must(next(s, 2000, rng));
    expect(decisionOpen(s)).toBe(true);
    const actor = actorOf(s, 'm1', 'captain');
    if (!actor.ok) throw new Error('not captain');
    s = must(decideWipeout(s, actor.id, true, 3000));
    s = tick(s, s.endsAt ?? 0);
    for (const id of ['m2', 'm4']) {
      const rows = playerView(s, id)?.wipeout?.rows ?? [];
      expect(rows.map((r) => [r.playerId, r.choice])).toEqual([
        ['t1', 'took'],
        ['t2', 'auto'],
      ]);
      expect(rows.map((r) => r.nickname)).toEqual(defaultTeams(2).names);
    }
  });
});
