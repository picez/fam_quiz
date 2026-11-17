import { describe, expect, it } from 'vitest';
import type { Answer, ThinkRound, ThinkWord } from '@quiz/shared';
import { end, endRound, next, override, recordOf, start, submitAnswer, tick, type GameState } from './game';
import { actAnswer } from './team-act';
import { awardThinkPlaces, thinkAlive, thinkLivesAfter, thinkPlaces, thinkVerdicts, withThinkGrades } from './think';
import { classicRound, makeRoundsQuiz, single, think, thinkRound } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

// «Думай інакше» (35): виправлення з рев'ю задач 3–4 — заморожені вердикти, соло, автор-одинак, команда автора, ручна оцінка й кінці раунду.

const t0 = 1_000_000;
const rng0 = () => 0;
const red: ThinkWord = { word: 'червоний', synonyms: [] };
const say = (value: string): Answer => ({ type: 'think', value });
const SAFE = 'ксилофон';
const HIT = 'Червона';
const at = (s: GameState, ms: number) => (s.startedAt ?? 0) + ms;
type Options = Partial<Omit<ThinkRound, 'id' | 'type' | 'questions'>>;

const quizOf = (options: Options = {}, count = 3) =>
  makeRoundsQuiz([thinkRound('r1', Array.from({ length: count }, (_, i) => think(`t${i + 1}`, [red])), { lives: 1, points: 1000, ...options }), classicRound('r2', [single])], { leaderboard: 'end' });
const opened = (names: string[], options?: Options, count?: number) => must(next(must(start(lobbyWith(quizOf(options, count), ...names))), t0, rng0));

function answered(s: GameState, values: Record<string, string>): GameState {
  return Object.entries(values).reduce((out, [id, value]) => must(submitAnswer(out, id, say(value), at(out, 1000))), s);
}
const locked = (s: GameState) => tick(s, (s.endsAt ?? 0) + 1, rng0);
const reveal = (s: GameState, values: Record<string, string>) => must(next(locked(answered(s, values)), at(s, 40_000), rng0));
const onward = (s: GameState) => must(next(s, at(s, 50_000), rng0));
const places = (s: GameState) => thinkPlaces(s, 0).map((r) => [r.id, r.place, r.points]);

describe('think review fixes (35)', () => {
  it('a revealed record keeps its verdict when the words change', () => {
    const shown = reveal(opened(['Олена', 'Тарас'], { lives: 2 }), { p1: HIT, p2: SAFE });
    const play = shown.plays[shown.questionIndex];
    // Інше порівняння після деплою чи зміни слів не перевертає розкритого.
    const moved: GameState = { ...shown, plays: shown.plays.map((p, i) => (i === shown.questionIndex ? { ...play, think: { ...play.think!, words: [{ word: SAFE, synonyms: [] }] } } : p)) };
    expect(withThinkGrades(moved)).toBe(moved);
    expect(thinkVerdicts(moved, moved.questionIndex)).toEqual({ p1: 'hit', p2: 'safe' });
    expect(thinkLivesAfter(moved, moved.questionIndex, 'p1')).toBe(1);
    expect(thinkLivesAfter(moved, moved.questionIndex, 'p2')).toBe(2);
  });

  it('a solo player gets the points only after the whole round', () => {
    const walked = [{}, {}, {}].reduce<GameState>((s) => onward(reveal(s, { p1: SAFE })), opened(['Олена'], { lives: 2 }));
    expect(walked.phase).toBe('round_end');
    expect(places(walked)).toEqual([['p1', 1, 1000]]);
    // Ведучий завершив раунд раніше: шлях не пройдено — 0.
    const early = must(endRound(onward(reveal(opened(['Олена'], { lives: 2 }), { p1: SAFE })), t0 + 999_000));
    expect(early.phase).toBe('round_end');
    expect(places(early)).toEqual([['p1', 1, 0]]);
    expect(early.adjustments.filter((a) => a.source === 'think')).toEqual([]);
  });

  it('an autopilot think round with only the author ends at once', () => {
    const intro: GameState = { ...must(start(lobbyWith(quizOf(), 'Марта'))), autopilot: { authorId: 'p1', at: null } };
    const s = must(next(intro, t0, rng0));
    expect(s.phase).toBe('round_end');
    expect(s.plays.filter((p) => p.roundIndex === 0)).toEqual([]);
    expect(thinkPlaces(s, 0)).toEqual([]);
  });

  it('a team left with only the author keeps its lives as a watching survivor', () => {
    const quiz = teamQuiz([thinkRound('r1', ['t1', 't2', 't3'].map((id) => think(id, [red])), { lives: 2, points: 1000 }), classicRound('r2', [single])]);
    const intro: GameState = { ...teamGame(quiz, [['Марта', 'Ігор'], ['Віра', 'Хосе']]), autopilot: { authorId: 'm1', at: null } };
    let s = must(next(intro, t0, rng0));
    s = must(actAnswer(s, 'm2', say(SAFE), at(s, 1000)));
    s = must(actAnswer(s, 'm3', say(HIT), at(s, 1000)));
    s = must(next(locked(s), at(s, 40_000), rng0));
    // Ігор іде з гри: у команді t1 лишилася лише авторка.
    const gone: GameState = { ...s, teams: { ...s.teams!, members: s.teams!.members.filter((m) => m.id !== 'm2') } };
    let s2 = onward(gone);
    if (s2.phase === 'leaderboard') s2 = onward(s2);
    expect(s2.phase).toBe('question');
    expect(s2.plays[s2.questionIndex].think?.lives).toMatchObject({ t1: 2, t2: 1 });
    expect(actAnswer(s2, 'm1', say(SAFE), at(s2, 1000))).toEqual({ ok: false, error: 'think_spectator' });
    // Мовчання глядача життя не забирає; живі й місця узгоджені.
    const s3 = must(next(locked(must(actAnswer(s2, 'm3', say(SAFE), at(s2, 1000)))), at(s2, 40_000), rng0));
    expect(thinkLivesAfter(s3, s3.questionIndex, 't1')).toBe(2);
    expect(thinkAlive(s3)).toEqual(['t1', 't2']);
    expect(thinkPlaces(s3, 0).map((r) => [r.id, r.lives])).toEqual([
      ['t1', 2],
      ['t2', 1],
    ]);
  });

  it("the author's stand-in may be a restored member who has not reconnected yet", () => {
    const quiz = teamQuiz([thinkRound('r1', ['t1', 't2', 't3'].map((id) => think(id, [red]))), classicRound('r2', [single])]);
    const intro: GameState = { ...teamGame(quiz, [['Марта', 'Ігор'], ['Віра', 'Хосе']]), autopilot: { authorId: 'm1', at: null } };
    const s = must(next(intro, t0, rng0));
    const restored: GameState = { ...s, awaiting: ['m2'], teams: { ...s.teams!, members: s.teams!.members.map((m) => (m.id === 'm2' ? { ...m, connected: false } : m)) } };
    expect(recordOf(must(actAnswer(restored, 'm2', say(SAFE), at(s, 1000))), s.questionIndex, 't1')?.answer).toEqual(say(SAFE));
  });

  it('a host override at the reveal changes who is out and whether the round ends', () => {
    const shown = reveal(opened(['Олена', 'Тарас']), { p1: HIT, p2: SAFE });
    // hit → safe: обоє живі, раунд іде далі.
    const kept = onward(must(override(shown, 'p1', 'correct')));
    expect(kept.phase).toBe('question');
    expect(thinkAlive(kept)).toEqual(['p1', 'p2']);
    // обоє → hit: вибули на одному питанні й ділять 1-ше місце.
    const both = onward(must(override(shown, 'p2', 'wrong')));
    expect(both.phase).toBe('round_end');
    expect(places(both)).toEqual([
      ['p1', 1, 1000],
      ['p2', 1, 1000],
    ]);
    expect(recordOf(both, 0, 'p2')?.overridden).toBe(true);
  });

  it('ending the round on an open question takes no lives', () => {
    const s = answered(opened(['Олена', 'Тарас', 'Віра'], { lives: 1 }), { p1: HIT });
    expect(s.phase).toBe('question');
    const ended = must(endRound(s, at(s, 5000)));
    expect(ended.phase).toBe('round_end');
    expect(thinkPlaces(ended, 0).every((r) => r.lives === 1 && r.place === 1)).toBe(true);
  });

  it('ending the game mid-round pays the places once', () => {
    const s = onward(reveal(opened(['Олена', 'Тарас', 'Віра'], { lives: 2 }), { p1: HIT, p2: SAFE, p3: SAFE }));
    const finished = must(end(s, at(s, 60_000)));
    expect(finished.phase).toBe('finished');
    expect(finished.adjustments.filter((a) => a.source === 'think').map((a) => [a.playerId, a.points])).toEqual([
      ['p2', 1000],
      ['p3', 1000],
    ]);
    expect(awardThinkPlaces(finished, t0 + 999_999)).toBe(finished);
    expect(end(finished, at(s, 70_000))).toMatchObject({ ok: false });
  });
});
