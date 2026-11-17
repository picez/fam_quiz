import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Quiz, type RoundRules } from '@quiz/shared';
import { alikeGroups, alikeJoin, alikeSplit } from './alike';
import { buffBlock, takeBuff } from './buffs';
import { setDebuff } from './debuffs';
import { lock, next, override, recordOf, removePlayer, submitAnswer, type GameState } from './game';
import { actAnswer } from './team-act';
import { FIRST_BUFFS } from './testing/buffs';
import { alikeQuiz, classicRound, makeRoundsQuiz, single, text, thinkalike } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { hostView, playerView, stageView } from './views';

/** p1 Оля, p2 Тарас, p3 Петро, p4 Ганна. */
const PLAYERS = ['Оля', 'Тарас', 'Петро', 'Ганна'];
/** «Соняшники» t1 (Оля m1, Тарас m2), «Маки» t2 (Петро m3, Ганна m4). */
const LAYOUT = [
  ['Оля', 'Тарас'],
  ['Петро', 'Ганна'],
];
const rng0 = () => 0;

const fresh = (quiz: Quiz = alikeQuiz(), players = PLAYERS) => startRound(lobbyWith(quiz, ...players), 0);
const ruled = (rules: Partial<RoundRules>) => makeRoundsQuiz([classicRound('c1', [thinkalike], { rules: { ...DEFAULT_RULES, ...rules } })]);
const say = (s: GameState, who: string, word: string, t = 1000) => must(submitAnswer(s, who, { type: 'thinkalike', value: word }, t));
const sayAll = (s: GameState, words: Record<string, string>, t = 1000) => Object.entries(words).reduce((acc, [who, word]) => say(acc, who, word, t), s);
const rec = (s: GameState, id: string) => recordOf(s, s.questionIndex, id);
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
const scores = (s: GameState) => s.players.map((p) => p.score);
/** Закрити, якщо ще відкрите (коли відповіли всі, гра закривається сама). */
const close = (s: GameState) => (s.phase === 'question' ? must(lock(s, 29_000)) : s);
const toReveal = (s: GameState) => must(next(close(s), 29_000, rng0));
const idsOf = (s: GameState) => alikeGroups(s, s.questionIndex).map((g) => g.ids);

describe('thinkalike (37e)', () => {
  it('the biggest group takes the price', () => {
    const s = close(sayAll(fresh(), { p1: 'Яблуко', p2: 'яблука', p3: 'груша', p4: 'Яблуко!' }));
    expect(s.phase).toBe('locked');
    for (const id of ['p1', 'p2', 'p4']) expect(rec(s, id)).toMatchObject({ points: 1000, grade: 'correct', accepted: true });
    expect(rec(s, 'p3')).toMatchObject({ points: 0, grade: 'wrong', accepted: false });
    expect(scores(s)).toEqual([1000, 1000, 0, 1000]);
  });

  it('typos join a group', () => {
    const s = close(sayAll(fresh(), { p1: 'полуниця', p2: 'полуныця', p3: 'банан', p4: 'баран' }));
    expect(idsOf(s)).toEqual([['p1', 'p2'], ['p3'], ['p4']]);
    expect(scores(s)).toEqual([1000, 1000, 0, 0]);
  });

  it('ties at the top all score', () => {
    const s = close(sayAll(fresh(), { p1: 'яблуко', p2: 'груша', p3: 'яблуко', p4: 'груша' }));
    expect(idsOf(s)).toEqual([['p1', 'p3'], ['p2', 'p4']]);
    expect(scores(s)).toEqual([1000, 1000, 1000, 1000]);
  });

  it('all different scores nothing', () => {
    const s = close(sayAll(fresh(), { p1: 'яблуко', p2: 'груша', p3: 'слива', p4: 'вишня' }));
    expect(scores(s)).toEqual([0, 0, 0, 0]);
    expect(rec(s, 'p1')).toMatchObject({ points: 0, grade: 'wrong' });
    const alone = close(say(fresh(), 'p2', 'яблуко'));
    expect(rec(alone, 'p2')).toMatchObject({ points: 0, grade: 'wrong' });
    expect(scores(alone)).toEqual([0, 0, 0, 0]);
  });

  it('silence and empty words', () => {
    const s0 = fresh();
    expect(submitAnswer(s0, 'p3', { type: 'thinkalike', value: '!!!' }, 1000)).toEqual({ ok: false, error: 'think_word' });
    expect(submitAnswer(s0, 'p3', { type: 'thinkalike', value: '   ' }, 1000)).toEqual({ ok: false, error: 'think_word' });
    expect(submitAnswer(s0, 'p3', { type: 'thinkalike', value: 'а'.repeat(41) }, 1000)).toEqual({ ok: false, error: 'think_word' });
    expect(rec(s0, 'p3')).toBeUndefined();
    // Пробіли зводяться до виміру: 40 літер з пробілами довкола — ще слово.
    const spaced = say(s0, 'p1', `  ${'а'.repeat(40)}  `);
    expect(rec(spaced, 'p1')?.answer).toEqual({ type: 'thinkalike', value: 'а'.repeat(40) });
    expect(rec(say(s0, 'p1', ' стигла   груша '), 'p1')?.answer).toEqual({ type: 'thinkalike', value: 'стигла груша' });
    expect(submitAnswer(s0, 'p1', { type: 'text', value: 'груша' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    const s = toReveal(sayAll(s0, { p1: 'яблуко', p2: 'яблуко', p4: 'груша' }));
    expect(score(s, 'p3')).toBe(0);
    expect(stageView(s).alike?.silent).toEqual([{ id: 'p3', nickname: 'Петро' }]);
  });

  it('grouping does not depend on order', () => {
    const words: Record<string, string> = { Оля: 'полуниця', Тарас: 'груша', Петро: 'полуниці', Ганна: 'полуныця' };
    const groupsBy = (players: string[]) => {
      const s0 = fresh(alikeQuiz(), players);
      const s = close(players.reduce((acc, nickname, i) => say(acc, `p${i + 1}`, words[nickname]), s0));
      const name = (id: string) => s.players.find((p) => p.id === id)?.nickname;
      return new Set(idsOf(s).map((ids) => ids.map(name).sort().join('+')));
    };
    const forward = groupsBy(PLAYERS);
    expect(forward).toEqual(new Set(['Ганна+Оля+Петро', 'Тарас']));
    expect(groupsBy([...PLAYERS].reverse())).toEqual(forward);
    expect(groupsBy(['Петро', 'Оля', 'Ганна', 'Тарас'])).toEqual(forward);
  });

  it('one answer, no speed, no minus', () => {
    const s0 = fresh(ruled({ penalty: 'minus', multiplier: 2 }));
    const first = say(s0, 'p1', 'яблуко', 1000);
    expect(rec(first, 'p1')).toMatchObject({ points: 0, basePoints: 0, grade: 'wrong', accepted: false });
    expect(submitAnswer(first, 'p1', { type: 'thinkalike', value: 'груша' }, 2000)).toEqual({ ok: false, error: 'already_answered' });
    const s = close(say(say(say(first, 'p2', 'яблуко', 25_000), 'p3', 'груша', 2000), 'p4', 'слива', 3000));
    expect(scores(s)).toEqual([2000, 2000, 0, 0]);
    expect(rec(s, 'p3')).toMatchObject({ points: 0, grade: 'wrong' });
    expect(submitAnswer(fresh(), 'p1', { type: 'thinkalike', value: 'яблуко' }, 31_000)).toEqual({ ok: false, error: 'time_over' });
  });

  it('the host joins two groups on reveal', () => {
    const s = toReveal(sayAll(fresh(), { p1: 'яблуко', p2: 'яблуко', p3: 'груша', p4: 'слива' }));
    expect(scores(s)).toEqual([1000, 1000, 0, 0]);
    const joined = must(alikeJoin(s, 'p3', 'p4'));
    expect(idsOf(joined)).toEqual([['p1', 'p2'], ['p3', 'p4']]);
    expect(scores(joined)).toEqual([1000, 1000, 1000, 1000]);
    expect(rec(joined, 'p3')).toMatchObject({ points: 1000, grade: 'correct' });
    expect(joined.plays[0].alike).toEqual({ labels: { p1: 'p1', p2: 'p1', p3: 'p4', p4: 'p4' } });
    expect(alikeJoin(joined, 'p3', 'p4')).toEqual({ ok: false, error: 'alike_group' });
    // Злиття з групою-переможцем: одна група з чотирьох, бали не дублюються.
    const all = must(alikeJoin(joined, 'p4', 'p1'));
    expect(idsOf(all)).toEqual([['p1', 'p2', 'p3', 'p4']]);
    expect(scores(all)).toEqual([1000, 1000, 1000, 1000]);
  });

  it('the host splits a word out', () => {
    const s = toReveal(sayAll(fresh(), { p1: 'яблуко', p2: 'яблуко', p3: 'груша', p4: 'яблуко' }));
    expect(scores(s)).toEqual([1000, 1000, 0, 1000]);
    const split = must(alikeSplit(s, 'p4'));
    expect(idsOf(split)).toEqual([['p1', 'p2'], ['p3'], ['p4']]);
    expect(scores(split)).toEqual([1000, 1000, 0, 0]);
    expect(rec(split, 'p4')).toMatchObject({ points: 0, grade: 'wrong' });
    expect(alikeSplit(split, 'p4')).toEqual({ ok: false, error: 'alike_group' });
    // Розділений і знову приєднаний — назад до трьох; повторне розділення бере вільну мітку.
    const back = must(alikeJoin(must(alikeJoin(split, 'p1', 'solo:p4')), 'p3', 'solo:p4'));
    expect(idsOf(back)).toEqual([['p1', 'p2', 'p3', 'p4']]);
    const again = must(alikeSplit(back, 'p4'));
    expect(idsOf(again)).toEqual([['p1', 'p2', 'p3'], ['p4']]);
    expect(scores(again)).toEqual([1000, 1000, 1000, 0]);
  });

  it('edit refusals', () => {
    const asked = say(fresh(), 'p1', 'яблуко');
    expect(alikeJoin(asked, 'p1', 'p2')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(alikeSplit(asked, 'p1')).toEqual({ ok: false, error: 'wrong_phase' });
    const locked = close(sayAll(asked, { p2: 'яблуко', p3: 'груша' }));
    expect(locked.phase).toBe('locked');
    expect(alikeJoin(locked, 'p3', 'p1')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(alikeSplit(locked, 'p1')).toEqual({ ok: false, error: 'wrong_phase' });
    const s = must(next(locked, 29_000, rng0));
    expect(s.phase).toBe('reveal');
    expect(alikeJoin(s, 'p1', 'p1')).toEqual({ ok: false, error: 'alike_group' });
    expect(alikeJoin(s, 'nobody', 'p1')).toEqual({ ok: false, error: 'alike_group' });
    expect(alikeJoin(s, 'p3', 'nobody')).toEqual({ ok: false, error: 'alike_group' });
    expect(alikeSplit(s, 'p4')).toEqual({ ok: false, error: 'alike_group' });
    expect(alikeSplit(s, 'p3')).toEqual({ ok: false, error: 'alike_group' });
    const piloted: GameState = { ...s, autopilot: { authorId: 'p1', at: null } };
    expect(alikeJoin(piloted, 'p3', 'p1')).toEqual({ ok: false, error: 'not_allowed' });
    expect(alikeSplit(piloted, 'p1')).toEqual({ ok: false, error: 'not_allowed' });
    expect(hostView(piloted).alike?.editable).toBe(false);
    expect(override(s, 'p3', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
    // Не thinkalike: reveal звичайного запитання.
    const other = toReveal(must(submitAnswer(fresh(makeRoundsQuiz([classicRound('c1', [single])])), 'p1', { type: 'single', optionId: single.correctId }, 1000)));
    expect(alikeJoin(other, 'p1', 'p2')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(alikeSplit(other, 'p1')).toEqual({ ok: false, error: 'wrong_phase' });
    // Після переходу далі правок немає.
    const onward = must(next(s, 30_000, rng0));
    expect(onward.phase).not.toBe('reveal');
    expect(alikeJoin(onward, 'p3', 'p1')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a removed player leaves the groups', () => {
    const s = must(alikeSplit(toReveal(sayAll(fresh(), { p1: 'яблуко', p2: 'яблуко', p3: 'яблуко', p4: 'груша' })), 'p3'));
    expect(s.plays[0].alike?.labels).toEqual({ p1: 'p1', p2: 'p1', p3: 'solo:p3', p4: 'p4' });
    const removed = must(removePlayer(s, 'p2'));
    expect(removed.plays[0].alike?.labels).toEqual({ p1: 'p1', p3: 'solo:p3', p4: 'p4' });
    expect(idsOf(removed)).toEqual([['p1'], ['p3'], ['p4']]);
    expect(stageView(removed).alike?.groups.flatMap((g) => g.members.map((m) => m.id))).toEqual(['p1', 'p3', 'p4']);
    // Групи з одного — балів немає ні в кого.
    expect(scores(removed)).toEqual([0, 0, 0]);
  });

  it('teams answer once by the answerer', () => {
    const quiz = teamQuiz([classicRound('c1', [thinkalike])], 2, 'captain');
    const s0 = must(next(teamGame(quiz, LAYOUT), 0, rng0));
    const word = { type: 'thinkalike', value: 'яблуко' } as const;
    const textGame = must(next(teamGame(teamQuiz([classicRound('c1', [text])], 2, 'captain'), LAYOUT), 0, rng0));
    const textRefusal = actAnswer(textGame, 'm2', { type: 'text', value: 'Київ' }, 1000);
    expect(textRefusal.ok).toBe(false);
    expect(actAnswer(s0, 'm2', word, 1000)).toEqual(textRefusal);
    const s = must(actAnswer(must(actAnswer(s0, 'm1', word, 1000)), 'm3', word, 1200));
    expect(s.phase).toBe('locked');
    expect(s.players.map((p) => [p.id, p.score])).toEqual([
      ['t1', 1000],
      ['t2', 1000],
    ]);
  });

  it('views hide words until reveal', () => {
    const asked = say(say(fresh(), 'p1', 'Яблуко'), 'p2', 'яблука');
    const leaks = (s: GameState) => [JSON.stringify(stageView(s)), JSON.stringify(playerView(s, 'p3', 2000))];
    for (const view of [stageView(asked), playerView(asked, 'p3', 2000)]) expect(view?.alike).toBeUndefined();
    for (const json of leaks(asked)) expect(json).not.toMatch(/Яблуко|яблука/);
    expect(hostView(asked).alike).toBeUndefined();
    const locked = close(sayAll(asked, { p3: 'груша', p4: 'Яблуко!' }));
    expect(locked.phase).toBe('locked');
    for (const view of [stageView(locked), playerView(locked, 'p3', 2000)]) expect(view?.alike).toBeUndefined();
    for (const json of leaks(locked)) expect(json).not.toMatch(/Яблуко|яблука/);
    expect(hostView(locked).alike?.editable).toBe(false);
    const s = must(next(locked, 29_000, rng0));
    const host = hostView(s).alike;
    expect(host?.editable).toBe(true);
    expect(host?.groups.map(({ words, top, points }) => ({ words, top, points }))).toEqual([
      { words: ['Яблуко', 'яблука', 'Яблуко!'], top: true, points: 1000 },
      { words: ['груша'], top: false, points: 0 },
    ]);
    expect(host?.groups[0].members).toEqual([
      { id: 'p1', nickname: 'Оля' },
      { id: 'p2', nickname: 'Тарас' },
      { id: 'p4', nickname: 'Ганна' },
    ]);
    expect(host?.silent).toEqual([]);
    const { editable: _editable, ...shared } = host ?? { editable: false };
    expect(stageView(s).alike).toEqual(shared);
    expect(playerView(s, 'p3', 30_000)?.alike).toEqual(shared);
  });

  it('buffs and debuffs are off', () => {
    const s = fresh(alikeQuiz({ buffs: [...FIRST_BUFFS], debuffs: ['fog'] }));
    for (const kind of FIRST_BUFFS) expect([kind, buffBlock(s, 'p1', kind)]).toEqual([kind, 'off_thinkalike']);
    expect(takeBuff(s, 'p1', 'double', 1000, rng0).ok).toBe(false);
    expect(setDebuff(s, 'p2', 'fog')).toEqual({ ok: false, error: 'not_allowed' });
  });
});
