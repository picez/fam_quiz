import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, questionPrice, type MoreLessSide, type Question } from '@quiz/shared';
import { pickAnswerer } from './answerer';
import { pickCell } from './board';
import { lock, next, override, pause, recordOf, removePlayer, start, submitAnswer, tick, type GameState } from './game';
import { moreLessOf, moreLessPick, moreLessPoints, moreLessRight, scoreMoreLess } from './moreless';
import { actorOf } from './team-act';
import { boardRound, classicRound, makeQuiz, makeRoundsQuiz, moreless } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, openAt, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const PLAYERS = ['Олена', 'Тарас', 'Віра'];
/** Правильний ряд фікстури: a, b, a. */
const RIGHT: MoreLessSide[] = ['a', 'b', 'a'];

const fresh = (question: Question = moreless, options: Parameters<typeof makeQuiz>[1] = {}, nicknames: string[] = PLAYERS) =>
  startRound(lobbyWith(makeQuiz([question], options), ...nicknames), 0);
const record = (s: GameState, playerId: string) => recordOf(s, s.questionIndex, playerId);
const points = (s: GameState, playerId: string) => record(s, playerId)?.points;
const scoreOf = (s: GameState, playerId: string) => s.players.find((p) => p.id === playerId)?.score;

/** Послідовні вибори одного гравця (команди) від поточного місця в мить now. */
function picks(s: GameState, id: string, sides: MoreLessSide[], now = 1000): GameState {
  return sides.reduce((current, side) => {
    const result = moreLessPick(current, id, moreLessOf(current, id).picks.length, side, now);
    if (!result.ok) throw new Error(`moreLessPick ${side}: ${result.error}`);
    return result.state;
  }, s);
}

describe('more or less', () => {
  it('opening starts an empty row', () => {
    const s = fresh();
    expect(s.plays[0].moreless).toEqual({ progress: {} });
    expect(moreLessOf(s, 'p1')).toEqual({ picks: [] });
    // інше запитання поля не має
    expect('moreless' in startRound(lobbyWith(makeQuiz(), 'Олена'), 0).plays[0]).toBe(false);
  });

  it('picks go in order and a second tap is stale', () => {
    const s = fresh();
    const one = must(moreLessPick(s, 'p1', 0, 'a', 1000));
    expect(moreLessOf(one, 'p1')).toEqual({ picks: ['a'] });
    expect(moreLessPick(one, 'p1', 0, 'a', 1100)).toEqual({ ok: false, error: 'moreless_stale' });
    expect(moreLessPick(one, 'p1', 2, 'a', 1100)).toEqual({ ok: false, error: 'moreless_stale' });
    expect(moreLessPick(s, 'p1', -1, 'a', 1100)).toEqual({ ok: false, error: 'moreless_stale' });
    // неправильний вибір ряд не зупиняє
    const two = must(moreLessPick(one, 'p1', 1, 'a', 1200));
    expect(moreLessOf(two, 'p1')).toEqual({ picks: ['a', 'a'] });
    expect(record(two, 'p1')).toBeUndefined();
    // інші гравці мають свій ряд
    expect(moreLessOf(two, 'p2')).toEqual({ picks: [] });
  });

  it('refusals come in order', () => {
    const s = fresh();
    const locked = must(lock(s, 2000));
    expect(moreLessPick(locked, 'p1', 0, 'a', 2000)).toEqual({ ok: false, error: 'wrong_phase' });
    const paused = must(pause(s, 2000));
    expect(moreLessPick(paused, 'p1', 0, 'a', 2000)).toEqual({ ok: false, error: 'paused' });
    const splash = openAt(lobbyWithSplash(makeQuiz([moreless]), 'Олена', 'Тарас'), 0);
    expect(splash.splash).not.toBeNull();
    expect(moreLessPick(splash, 'p1', 0, 'a', 100)).toEqual({ ok: false, error: 'not_started' });
    expect(moreLessPick(s, 'p9', 0, 'a', 1000)).toEqual({ ok: false, error: 'not_found' });
    const other = startRound(lobbyWith(makeQuiz(), 'Олена'), 0);
    expect(moreLessPick(other, 'p1', 0, 'a', 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(moreLessPick(s, 'p1', 0, 'a', 60_001)).toEqual({ ok: false, error: 'time_over' });
    expect(moreLessPick(s, 'p1', 0, 'a', 60_000).ok).toBe(true);
    // кінець часу важить більше за застарілий номер
    expect(moreLessPick(s, 'p1', 5, 'a', 60_001)).toEqual({ ok: false, error: 'time_over' });
    const done = picks(s, 'p1', RIGHT);
    expect(moreLessPick(done, 'p1', 3, 'a', 2000)).toEqual({ ok: false, error: 'already_answered' });
    expect(moreLessPick(done, 'p1', 0, 'a', 2000)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('a finished row is recorded at once and closes when everyone is done', () => {
    const s = fresh();
    const olena = picks(picks(s, 'p1', ['a', 'b'], 1000), 'p1', ['a'], 3000);
    expect(olena.phase).toBe('question');
    expect(record(olena, 'p1')).toEqual({
      answer: { type: 'moreless', picks: RIGHT, right: 3, total: 3 },
      timeMs: 3000,
      accepted: true,
      accuracy: 1,
      grade: 'correct',
      basePoints: 400,
      streakBonus: 0,
      points: 400,
      overridden: false,
    });
    const taras = picks(olena, 'p2', ['a', 'a', 'a'], 4000);
    expect(taras.phase).toBe('question');
    const all = picks(taras, 'p3', ['b', 'a', 'b'], 5000);
    expect(all.phase).toBe('locked');
    expect([points(all, 'p1'), points(all, 'p2'), points(all, 'p3')]).toEqual([400, 300, 0]);
  });

  it('sums the points of the right picks only', () => {
    const s = picks(picks(fresh(), 'p2', ['a', 'a', 'a']), 'p3', ['a']);
    expect(moreLessPoints(s, s.plays[0], ['a', 'a', 'a'])).toBe(300);
    expect(moreLessPoints(s, s.plays[0], [])).toBe(0);
    const locked = must(lock(s, 5000));
    expect([points(locked, 'p2'), points(locked, 'p3')]).toEqual([300, 100]);
    // Олена не вибирала нічого — запису немає
    expect(record(locked, 'p1')).toBeUndefined();
    // неповний ряд — без балів за решту, час — увесь ліміт
    expect(record(locked, 'p3')).toMatchObject({ answer: { type: 'moreless', picks: ['a'], right: 1, total: 3 }, timeMs: 60_000 });

    // множник раунду ×2
    const doubled = fresh(moreless, { rules: { ...DEFAULT_RULES, multiplier: 2 as const } });
    const twice = must(lock(picks(doubled, 'p2', ['a', 'a', 'a']), 5000));
    expect(points(twice, 'p2')).toBe(600);
    // стеля: ціна запитання × множники
    expect(moreLessPoints(twice, twice.plays[0], RIGHT)).toBe(questionPrice(moreless) * 2);
    expect(moreLessPoints(twice, twice.plays[0], [...RIGHT, 'a', 'a'])).toBe(800);

    // мінус раунду, «частково» й швидкість нічого не змінюють
    const rules = { speedBonus: true, rules: { ...DEFAULT_RULES, penalty: 'minus' as const, partial: 50 } };
    const plain = must(lock(picks(picks(fresh(moreless, rules), 'p2', ['a', 'a', 'a']), 'p1', ['b', 'a', 'b']), 5000));
    expect([points(plain, 'p1'), points(plain, 'p2'), points(plain, 'p3')]).toEqual([0, 300, undefined]);
    expect([scoreOf(plain, 'p1'), scoreOf(plain, 'p2'), scoreOf(plain, 'p3')]).toEqual([0, 300, 0]);
    expect(record(plain, 'p2')?.streakBonus).toBe(0);
  });

  it('grades by the whole row', () => {
    const s = picks(picks(picks(fresh(), 'p1', RIGHT), 'p2', ['a', 'a', 'a']), 'p3', ['b', 'a', 'b']);
    expect(record(s, 'p1')).toMatchObject({ grade: 'correct', accepted: true, accuracy: 1 });
    expect(record(s, 'p2')).toMatchObject({ grade: 'partial', accepted: false, accuracy: 2 / 3, points: 300 });
    expect(record(s, 'p3')).toMatchObject({ grade: 'wrong', accepted: false, accuracy: 0, points: 0, basePoints: 0 });
    // неповний ряд з усіма правильними — лише «частково»
    const short = must(lock(picks(fresh(), 'p1', ['a', 'b']), 5000));
    expect(record(short, 'p1')).toMatchObject({ grade: 'partial', accepted: false, accuracy: 2 / 3, points: 200 });
  });

  it('the right counts freeze at the close', () => {
    // Олена — усе правильно, Тарас — a, a (правильне лише перше), Віра — нічого
    const s = picks(picks(fresh(), 'p1', RIGHT), 'p2', ['a', 'a']);
    expect(moreLessRight(s, s.plays[0])).toEqual([2, 1, 1]);
    expect(s.plays[0].moreless?.scored).toBeUndefined();
    // до закриття вилучення змінює лічильники
    const early = must(removePlayer(s, 'p2'));
    expect(moreLessRight(early, early.plays[0])).toEqual([1, 1, 1]);
    const locked = must(lock(s, 5000));
    expect(locked.plays[0].moreless?.scored).toEqual({ right: [2, 1, 1] });
    expect(moreLessRight(locked, locked.plays[0])).toEqual([2, 1, 1]);
    // після закриття — ні
    const late = must(removePlayer(locked, 'p2'));
    expect(late.plays[0].moreless?.scored).toEqual({ right: [2, 1, 1] });
    expect(moreLessRight(late, late.plays[0])).toEqual([2, 1, 1]);
    expect(points(late, 'p1')).toBe(400);
  });

  it('scoreMoreLess works only on an open row', () => {
    const s = picks(fresh(), 'p1', ['a']);
    const locked = must(lock(s, 5000));
    expect(scoreMoreLess(locked)).toBe(locked);
    const other = startRound(lobbyWith(makeQuiz(), 'Олена'), 0);
    expect(scoreMoreLess(other)).toBe(other);
  });

  it('the team answerer plays for the team', () => {
    const LAYOUT = [
      ['Оля', 'Петро'],
      ['Віра', 'Ігор'],
    ];
    const s = must(next(teamGame(teamQuiz([classicRound('r1', [moreless])]), LAYOUT), 0));
    expect(['m1', 'm2', 'm3', 'm4'].map((m) => actorOf(s, m, 'answer'))).toEqual([
      { ok: true, id: 't1' },
      { ok: false, error: 'not_captain' },
      { ok: true, id: 't2' },
      { ok: false, error: 'not_captain' },
    ]);
    const t = picks(picks(s, 't1', ['a', 'b']), 't2', ['b']);
    expect(t.plays[0].moreless?.progress).toEqual({ t1: { picks: ['a', 'b'] }, t2: { picks: ['b'] } });
    const locked = must(lock(t, 5000));
    expect([points(locked, 't1'), points(locked, 't2')]).toEqual([200, 0]);
    expect(scoreOf(locked, 't1')).toBe(200);
    // режим 12g: відповідає вибраний товариш, капітан — not_answerer
    const intro = teamGame(teamQuiz([classicRound('r1', [moreless])], 2, 'chosen'), LAYOUT);
    const chosen = must(next(must(pickAnswerer(intro, 'm1', 'm2', 'question')), 0));
    expect(actorOf(chosen, 'm1', 'answer')).toEqual({ ok: false, error: 'not_answerer' });
    expect(actorOf(chosen, 'm2', 'answer')).toEqual({ ok: true, id: 't1' });
  });

  it('on a board cell only the chooser plays and silence costs nothing', () => {
    const board = (rules = DEFAULT_RULES) => {
      const round = boardRound('b1', [{ title: 'Порівняння', cells: [{ mark: 'x3', answerMode: 'phone', penalty: 'all', question: moreless }] }], { rules });
      const lobby = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Олена', 'Тарас'))), 0));
      return must(pickCell(lobby, 'p1', 'q14', 0, () => 0));
    };
    const s = board();
    expect(moreLessPick(s, 'p2', 0, 'a', 1000)).toEqual({ ok: false, error: 'not_your_turn' });
    // повний ряд одразу розкриває клітинку; позначка ×3 множить
    const done = picks(s, 'p1', RIGHT);
    expect(done.phase).toBe('reveal');
    expect(points(done, 'p1')).toBe(1200);
    const part = tick(picks(s, 'p1', ['a', 'a']), 60_001);
    expect(points(part, 'p1')).toBe(300);
    // той, хто вибрав і мовчить, — запис з 0 без мінусу
    const silent = tick(board({ ...DEFAULT_RULES, penalty: 'minus' }), 60_001);
    expect(record(silent, 'p1')).toMatchObject({ answer: { type: 'moreless', picks: [], right: 0, total: 3 }, points: 0, grade: 'wrong', accepted: false });
    expect(record(silent, 'p2')).toBeUndefined();
    const revealed = must(next(silent, 61_000));
    expect(record(revealed, 'p1')).toMatchObject({ points: 0, grade: 'wrong' });
    expect(scoreOf(revealed, 'p1')).toBe(0);
  });

  it('the plain answer event and the host grade do not apply', () => {
    const s = fresh();
    expect(submitAnswer(s, 'p1', { type: 'moreless', picks: RIGHT, right: 3, total: 3 }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p1', { type: 'text', value: 'Говерла' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    const locked = must(lock(picks(s, 'p1', ['a']), 2000));
    expect(override(locked, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('removing a player drops their picks', () => {
    const s = picks(picks(fresh(), 'p2', ['b']), 'p1', ['a']);
    const removed = must(removePlayer(s, 'p2'));
    expect(removed.plays[0].moreless).toEqual({ progress: { p1: { picks: ['a'] } } });
  });
});
