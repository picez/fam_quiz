import { describe, expect, it } from 'vitest';
import { BUFF_KINDS, defaultTeams, type QuizSettings } from '@quiz/shared';
import { adjustScore } from './adjust';
import { buyDebuff } from './debuffs';
import { end, lock, next, start, type GameState } from './game';
import { takeStealth } from './stealth';
import { classicRound, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { teamGame } from './testing/teams';
import { hostView, playerView as viewOf, stageView } from './views';

const T0 = 1_000_000;
const rng = () => 0;
const playerView = (...args: Parameters<typeof viewOf>) => viewOf(...args)!;

function stealthQuiz(settings: Partial<QuizSettings> = {}) {
  return makeRoundsQuiz([classicRound('r1', [single, withId(single, 's2')])], { leaderboard: 'each', buffs: ['stealth'], debuffs: ['fog', 'shake'], ...settings });
}

/** Заставка раунду: Оля p1, Петро p2, Тарас p3 — по 1000 балів. */
function game(settings: Partial<QuizSettings> = {}): GameState {
  let s = must(start(lobbyWith(stealthQuiz(settings), 'Оля', 'Петро', 'Тарас')));
  for (const id of ['p1', 'p2', 'p3']) s = must(adjustScore(s, id, 1000, T0));
  return s;
}

const hostPlayer = (s: GameState, id: string) => hostView(s).players.find((p) => p.id === id);

describe('stealth in views', () => {
  it("turning stealth on changes no one else's view", () => {
    for (const before of [game(), must(next(game(), T0 + 100, rng))]) {
      const after = must(takeStealth(before, 'p1', T0 + 200));
      expect(stageView(after)).toEqual(stageView(before));
      expect(hostView(after)).toEqual(hostView(before));
      expect(playerView(after, 'p2')).toEqual(playerView(before, 'p2'));
      expect(playerView(after, 'p3')).toEqual(playerView(before, 'p3'));
      expect(playerView(before, 'p1').me.stealth).toBe('ready');
      expect(playerView(after, 'p1').me.stealth).toBe('armed');
    }
    const bought = must(buyDebuff(must(takeStealth(game(), 'p1', T0)), 'p1', 'p2', 'fog', T0 + 10));
    expect(playerView(bought, 'p1').me.stealth).toBe('used');
    // у грі без бафа (чи без купівлі) — поля немає; у лобі — теж
    expect('stealth' in playerView(game({ buffs: ['double'] }), 'p1').me).toBe(false);
    expect('stealth' in playerView(game({ debuffShop: false }), 'p1').me).toBe(false);
    expect('stealth' in playerView(lobbyWith(stealthQuiz(), 'Оля', 'Петро'), 'p1').me).toBe(false);
  });

  it('an anonymous purchase names no one', () => {
    const s = must(buyDebuff(must(takeStealth(game(), 'p1', T0)), 'p1', 'p2', 'fog', T0 + 10));
    for (const notice of [stageView(s).debuffNotice, hostView(s).debuffNotice, playerView(s, 'p2').debuffNotice, playerView(s, 'p3').debuffNotice]) {
      expect(notice?.buyer).toBeNull();
      expect(notice?.target).toEqual({ playerId: 'p2', nickname: 'Петро' });
    }
    expect(hostPlayer(s, 'p2')?.debuff).toEqual({ kind: 'fog', fired: false, by: null, anon: true });
    const opened = must(next(s, T0 + 1000, rng));
    expect(playerView(opened, 'p2').me.debuff).toEqual({ kind: 'fog', since: T0 + 1000, by: null, anon: true });
    expect(hostPlayer(opened, 'p2')?.debuff).toEqual({ kind: 'fog', fired: true, by: null, anon: true });
    // розбивка пульта: частини «Дебафи» біля Олі немає ні до розкриття, ні після; власна розбивка Олі має її з розкриттям
    expect(hostView(s).breakdowns.p1.parts.map((p) => p.source)).not.toContain('debuff');
    expect(playerView(s, 'p1').myBreakdown?.parts.map((p) => p.source)).not.toContain('debuff');
    const revealed = must(next(must(lock(opened)), T0 + 1500, rng));
    expect(revealed.phase).toBe('reveal');
    expect(hostView(revealed).breakdowns.p1.parts.map((p) => p.source)).not.toContain('debuff');
    expect(playerView(revealed, 'p1').myBreakdown?.parts.find((p) => p.source === 'debuff')).toMatchObject({ minus: -200 });
    // нік покупця ніде в полях дебафу
    const text = JSON.stringify([stageView(s).debuffNotice, hostView(s).players.map((p) => p.debuff), playerView(opened, 'p2').me.debuff, playerView(opened, 'p3').debuffNotice]);
    expect(text).not.toContain('Оля');
    expect(text).not.toContain('"p1"');
    // кінець гри — розбивка пульта повна
    const finished = must(end(s, T0 + 2000));
    expect(hostView(finished).breakdowns.p1.parts.find((p) => p.source === 'debuff')).toMatchObject({ minus: -200 });
  });

  it('the tables keep the price until the reveal', () => {
    const asked = must(next(must(takeStealth(game(), 'p1', T0)), T0 + 100, rng));
    const tables = (s: GameState) => ({
      stage: [stageView(s).standings, stageView(s).players],
      host: [hostView(s).standings, hostView(s).players.map((p) => [p.id, p.score]), hostView(s).breakdowns],
      phones: ['p1', 'p2', 'p3'].map((id) => {
        const view = playerView(s, id);
        return [view.standings, view.table, view.me.score, view.myBreakdown];
      }),
    });
    const bought = must(buyDebuff(asked, 'p1', 'p2', 'fog', T0 + 200));
    expect(tables(bought)).toEqual(tables(asked));
    const locked = must(lock(bought));
    expect(tables(locked)).toEqual(tables(must(lock(asked))));
    const revealed = must(next(locked, T0 + 1000, rng));
    expect(hostPlayer(revealed, 'p1')?.score).toBe(800);
    expect(playerView(revealed, 'p1').me.score).toBe(800);
    const board = must(next(revealed, T0 + 2000, rng));
    expect(board.phase).toBe('leaderboard');
    expect(stageView(board).standings?.find((row) => row.participantId === 'p1')?.score).toBe(800);
  });

  it('teams: the target team sees no buyer', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 's2')])], { teams: defaultTeams(2), leaderboard: 'each', buffs: ['stealth'], debuffs: ['fog'] });
    let s = must(adjustScore(teamGame(quiz, [['Оля', 'Петро'], ['Тарас', 'Ася']]), 't1', 500, T0));
    s = must(buyDebuff(must(takeStealth(s, 't1', T0)), 't1', 't2', 'fog', T0 + 10));
    for (const id of ['m1', 'm2', 'm3', 'm4']) expect(playerView(s, id).debuffNotice?.buyer).toBeNull();
    const opened = must(next(s, T0 + 1000, rng));
    for (const id of ['m3', 'm4']) expect(playerView(opened, id).me.debuff).toMatchObject({ kind: 'fog', by: null, anon: true });
  });

  it('stealth is not in the question buff row', () => {
    const all = must(next(game({ buffs: [...BUFF_KINDS] }), T0, rng));
    const slots = playerView(all, 'p1').me.buffs?.slots.map((s) => s.kind) ?? [];
    expect(slots).not.toContain('stealth');
    expect(slots).toHaveLength(13);
    expect(playerView(must(next(game(), T0, rng)), 'p1').me.buffs).toBeNull();
  });

  it('teams: the whole team sees the mark', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 's2')])], { teams: defaultTeams(2), leaderboard: 'each', buffs: ['stealth'], debuffs: ['fog'] });
    const before = teamGame(quiz, [['Оля', 'Петро'], ['Тарас', 'Ася']]);
    const after = must(takeStealth(before, 't1', T0));
    expect(playerView(after, 'm1').me.stealth).toBe('armed');
    expect(playerView(after, 'm2').me.stealth).toBe('armed');
    expect(playerView(after, 'm3').me.stealth).toBe('ready');
    expect(playerView(after, 'm3')).toEqual(playerView(before, 'm3'));
    expect(playerView(after, 'm4')).toEqual(playerView(before, 'm4'));
    expect(stageView(after)).toEqual(stageView(before));
    expect(hostView(after)).toEqual(hostView(before));
  });
});
