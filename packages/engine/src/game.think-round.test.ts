import { describe, expect, it } from 'vitest';
import { autopilotQuiz, type Answer, type ThinkRound, type ThinkWord } from '@quiz/shared';
import { autopilotStart, createAutopilotGame } from './autopilot';
import { addPlayer, endRound, next, recordOf, removePlayer, setConnected, start, submitAnswer, tick, type GameState } from './game';
import { addLatePlayer } from './saved';
import { actAnswer } from './team-act';
import { awardThinkPlaces, thinkAlive, thinkPlaces } from './think';
import { answerAs, commit, drive } from './testing/autopilot';
import { classicRound, makeRoundsQuiz, single, think, thinkRound } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

// «Думай інакше» (35): життя, вибування, кінець раунду, місця й очки, новенькі, вилучені, команди, автор автопілота.

const t0 = 1_000_000;
const rng0 = () => 0;
const red: ThinkWord = { word: 'червоний', synonyms: [] };
const say = (value: string): Answer => ({ type: 'think', value });
const SAFE = 'ксилофон';
const HIT = 'Червона';
const play = (s: GameState) => s.plays[s.questionIndex];
const lives = (s: GameState) => play(s).think?.lives;
const at = (s: GameState, ms: number) => (s.startedAt ?? 0) + ms;

/** r1 «Думай інакше» (5 запитань зі словом «червоний»), r2 класика; типово 2 життя, 10 000 за 1-ше місце. */
function quizOf(options: Partial<Omit<ThinkRound, 'id' | 'type' | 'questions'>> = {}) {
  const questions = ['t1', 't2', 't3', 't4', 't5'].map((id) => think(id, [red]));
  return makeRoundsQuiz([thinkRound('r1', questions, { lives: 2, points: 10_000, ...options }), classicRound('r2', [single])], { leaderboard: 'end' });
}

/** t1 відкрито; гравці p1… — за нікнеймами. */
function opened(names: string[], options: Partial<Omit<ThinkRound, 'id' | 'type' | 'questions'>> = {}): GameState {
  return must(next(must(start(lobbyWith(quizOf(options), ...names))), t0, rng0));
}

/** Відповіді (немає ключа — мовчить) → таймер → «Показати»: етап reveal. */
function reveal(s: GameState, values: Record<string, string>): GameState {
  let out = s;
  for (const [id, value] of Object.entries(values)) out = must(submitAnswer(out, id, say(value), at(out, 1000)));
  out = tick(out, (out.endsAt ?? 0) + 1, rng0);
  expect(out.phase).toBe('locked');
  return must(next(out, at(out, 40_000), rng0));
}

/** З розкриття — далі (наступне запитання чи кінець раунду). */
const onward = (s: GameState) => must(next(s, at(s, 50_000), rng0));

/** Зіграти кілька запитань поспіль (кожне — відповіді й далі). */
function playAll(s: GameState, rounds: Record<string, string>[]): GameState {
  return rounds.reduce((state, values) => onward(reveal(state, values)), s);
}

const FOUR = ['Олена', 'Тарас', 'Віра', 'Хосе'];
const places = (s: GameState) => thinkPlaces(s, 0).map((r) => [r.id, r.place, r.points]);

describe('think lives and places (35)', () => {
  it('a hit and an empty answer cost a life; zero lives is out', () => {
    const s1 = onward(reveal(opened(FOUR), { p1: 'червоний', p2: 'синій', p4: 'зелений' }));
    expect(play(s1).question.id).toBe('t2');
    expect(lives(s1)).toEqual({ p1: 1, p2: 2, p3: 1, p4: 2 });
    const s2 = onward(reveal(s1, { p1: HIT, p2: SAFE, p3: 'жовтий', p4: SAFE }));
    expect(lives(s2)).toEqual({ p1: 0, p2: 2, p3: 1, p4: 2 });
    expect(submitAnswer(s2, 'p1', say(SAFE), at(s2, 1000))).toEqual({ ok: false, error: 'think_out' });
    expect(thinkAlive(s2)).toEqual(['p2', 'p3', 'p4']);
  });

  it('an unrevealed question takes no lives', () => {
    const s1 = onward(reveal(opened(FOUR), { p1: SAFE, p2: SAFE, p3: SAFE, p4: SAFE }));
    let s = must(submitAnswer(s1, 'p2', say(HIT), at(s1, 1000)));
    s = tick(s, (s.endsAt ?? 0) + 1, rng0);
    expect(s.phase).toBe('locked');
    const ended = must(endRound(s, at(s, 40_000)));
    expect(ended.phase).toBe('round_end');
    expect(thinkPlaces(ended, 0).find((r) => r.id === 'p2')?.lives).toBe(2);
    expect(thinkPlaces(ended, 0).every((r) => r.place === 1 && r.points === 10_000)).toBe(true);
  });

  it('the round ends when one is left of many', () => {
    const s = onward(reveal(opened(FOUR, { lives: 1 }), { p1: SAFE, p2: HIT, p3: HIT, p4: HIT }));
    expect(s.phase).toBe('round_end');
    expect(s.plays.filter((p) => p.roundIndex === 0)).toHaveLength(1);
    expect(places(s)).toEqual([
      ['p1', 1, 10_000],
      // Троє вибули на одному питанні: спільне 2-ге місце й його очки.
      ['p2', 2, 6667],
      ['p3', 2, 6667],
      ['p4', 2, 6667],
    ]);
  });

  it('everyone out on one question shares first place', () => {
    const s = onward(reveal(opened(['Олена', 'Тарас'], { lives: 1 }), { p1: HIT, p2: 'червоний' }));
    expect(s.phase).toBe('round_end');
    expect(places(s)).toEqual([
      ['p1', 1, 10_000],
      ['p2', 1, 10_000],
    ]);
    expect(s.players.map((p) => p.score)).toEqual([10_000, 10_000]);
  });

  it("places and points follow the owner's formula", () => {
    // Олена вибуває на 2-му, Віра — на 3-му, Тарас губить одне життя на 4-му, Хосе — жодного.
    const s = playAll(opened(FOUR), [
      { p1: HIT, p2: SAFE, p3: HIT, p4: SAFE },
      { p1: HIT, p2: SAFE, p3: SAFE, p4: SAFE },
      { p2: SAFE, p3: HIT, p4: SAFE },
      { p2: HIT, p4: SAFE },
      { p2: SAFE, p4: SAFE },
    ]);
    expect(s.phase).toBe('round_end');
    expect(thinkPlaces(s, 0)).toEqual([
      { id: 'p4', place: 1, lives: 2, outAt: null, points: 10_000 },
      { id: 'p2', place: 2, lives: 1, outAt: null, points: 6667 },
      { id: 'p3', place: 3, lives: 0, outAt: 3, points: 3333 },
      { id: 'p1', place: 4, lives: 0, outAt: 2, points: 0 },
    ]);
    expect(s.adjustments.filter((a) => a.source === 'think').map((a) => [a.playerId, a.points, a.roundIndex])).toEqual([
      ['p4', 10_000, 0],
      ['p2', 6667, 0],
      ['p3', 3333, 0],
    ]);
    expect(s.players.map((p) => p.score)).toEqual([0, 6667, 3333, 10_000]);
    expect(awardThinkPlaces(s, t0 + 999_999)).toBe(s);
  });

  it('ties share the higher place and its points', () => {
    const three = ['Олена', 'Тарас', 'Віра'];
    const survived = playAll(opened(three), [
      { p1: SAFE, p2: SAFE, p3: HIT },
      { p1: SAFE, p2: SAFE, p3: HIT },
      { p1: SAFE, p2: SAFE },
      { p1: SAFE, p2: SAFE },
      { p1: SAFE, p2: SAFE },
    ]);
    expect(places(survived)).toEqual([
      ['p1', 1, 10_000],
      ['p2', 1, 10_000],
      ['p3', 3, 0],
    ]);
    const outTogether = playAll(opened(three), [
      { p1: SAFE, p2: HIT, p3: HIT },
      { p1: SAFE, p2: HIT, p3: HIT },
    ]);
    expect(outTogether.phase).toBe('round_end');
    expect(places(outTogether)).toEqual([
      ['p1', 1, 10_000],
      ['p2', 2, 5000],
      ['p3', 2, 5000],
    ]);
  });

  it('a solo player walks the whole round', () => {
    const walked = playAll(opened(['Олена']), [{ p1: SAFE }, { p1: SAFE }, { p1: SAFE }, { p1: SAFE }, { p1: SAFE }]);
    expect(walked.phase).toBe('round_end');
    expect(walked.plays.filter((p) => p.roundIndex === 0)).toHaveLength(5);
    expect(places(walked)).toEqual([['p1', 1, 10_000]]);
    const lost = playAll(opened(['Олена']), [{ p1: HIT }, { p1: HIT }]);
    expect(lost.phase).toBe('round_end');
    expect(lost.plays.filter((p) => p.roundIndex === 0)).toHaveLength(2);
    expect(places(lost)).toEqual([['p1', 1, 0]]);
  });

  it('a newcomer gets the weakest living lives', () => {
    const s1 = onward(reveal(opened(FOUR), { p1: HIT, p2: SAFE, p4: SAFE }));
    const shown2 = reveal(s1, { p1: HIT, p2: SAFE, p3: SAFE, p4: SAFE });
    const late = must(addLatePlayer(shown2, { id: 'p5', nickname: 'Ліна' }));
    const s3 = onward(late);
    expect(play(s3).question.id).toBe('t3');
    expect(lives(s3)).toEqual({ p1: 0, p2: 2, p3: 1, p4: 2, p5: 1 });
    // Хто з'явився посеред питання — глядач до наступного відкриття.
    const midway: GameState = { ...s3, players: [...s3.players, { id: 'p6', nickname: 'Іван', connected: true, score: 0, totalTimeMs: 0, streak: 0 }] };
    expect(submitAnswer(midway, 'p6', say(SAFE), at(s3, 1000))).toEqual({ ok: false, error: 'think_spectator' });
  });

  it('a newcomer does not switch a solo round', () => {
    const shown = reveal(opened(['Олена'], { lives: 1 }), { p1: SAFE });
    const s2 = onward(must(addLatePlayer(shown, { id: 'p2', nickname: 'Тарас' })));
    expect(lives(s2)).toEqual({ p1: 1, p2: 1 });
    const s3 = onward(reveal(s2, { p1: SAFE, p2: HIT }));
    expect(play(s3).question.id).toBe('t3');
    expect(s3.phase).toBe('question');
  });

  it('removed players leave places and n', () => {
    const shown2 = reveal(onward(reveal(opened(FOUR), { p1: HIT, p2: SAFE, p3: SAFE, p4: SAFE })), { p1: HIT, p2: SAFE, p3: SAFE, p4: SAFE });
    const removed = must(removePlayer(shown2, 'p2'));
    const ended = must(endRound(removed, at(removed, 45_000)));
    expect(places(ended)).toEqual([
      ['p3', 1, 10_000],
      ['p4', 1, 10_000],
      ['p1', 3, 0],
    ]);
  });

  it('the absent lose a life like the silent', () => {
    const lobby = lobbyWith(quizOf(), ...FOUR);
    const intro = must(setConnected(must(start(lobby)), 'p4', false, 0));
    const s1 = onward(reveal(must(next(intro, t0, rng0)), { p1: SAFE, p2: SAFE, p3: SAFE }));
    expect(lives(s1)).toEqual({ p1: 2, p2: 2, p3: 2, p4: 1 });
  });

  it('teams play by captain with team lives and places', () => {
    const intro = teamGame(teamQuiz([thinkRound('r1', ['t1', 't2', 't3'].map((id) => think(id, [red])), { lives: 1, points: 1000 }), classicRound('r2', [single])]), [
      ['Олена', 'Тарас'],
      ['Віра', 'Хосе'],
    ]);
    let s = must(next(intro, t0, rng0));
    expect(lives(s)).toEqual({ t1: 1, t2: 1 });
    expect(actAnswer(s, 'm2', say(SAFE), at(s, 1000))).toEqual({ ok: false, error: 'not_captain' });
    s = must(actAnswer(s, 'm1', say(SAFE), at(s, 1000)));
    s = must(actAnswer(s, 'm3', say('червоний'), at(s, 1000)));
    expect(recordOf(s, s.questionIndex, 't1')?.answer).toEqual(say(SAFE));
    s = tick(s, (s.endsAt ?? 0) + 1, rng0);
    s = onward(must(next(s, at(s, 40_000), rng0)));
    expect(s.phase).toBe('round_end');
    expect(places(s)).toEqual([
      ['t1', 1, 1000],
      ['t2', 2, 0],
    ]);
    expect(s.players.map((p) => [p.id, p.score])).toEqual([
      ['t1', 1000],
      ['t2', 0],
    ]);
  });
});

describe('the autopilot author in the think round (35)', () => {
  const T0 = 1_000_000;
  const rng = () => 0.3;
  const pilotQuiz = () => autopilotQuiz(makeRoundsQuiz([classicRound('r1', [single]), thinkRound('r2', ['t1', 't2', 't3'].map((id) => think(id, [red])))]));

  it('the autopilot author watches the think round', () => {
    let lobby = must(createAutopilotGame(pilotQuiz(), { id: 'a', nickname: 'Марта' }, { transitions: false }));
    lobby = must(addPlayer(must(addPlayer(lobby, { id: 'p2', nickname: 'Ігор' })), { id: 'p3', nickname: 'Ліна' }));
    const started = commit(lobby, must(autopilotStart(lobby, T0, rng)), T0);
    const seen: GameState[] = [];
    const { state } = drive(started, {
      now: T0,
      rng,
      people: answerAs(),
      watch: (_prev, next) => {
        if (next.phase === 'question') seen.push(next);
      },
    });
    expect(state.phase).toBe('finished');
    // Класика: автор грає.
    expect(Object.keys(state.plays[0].answers).sort()).toEqual(['a', 'p2', 'p3']);
    // «Думай інакше»: автора немає в lives і записах.
    const thinking = seen.filter((s) => play(s).think !== undefined);
    expect(thinking.length).toBeGreaterThan(0);
    for (const s of thinking) expect(Object.keys(lives(s) ?? {})).toEqual(['p2', 'p3']);
    const first = thinking[0];
    expect(submitAnswer(first, 'a', say(SAFE), at(first, 1000))).toEqual({ ok: false, error: 'think_spectator' });
    expect(state.plays.filter((p) => p.think !== undefined).every((p) => !Object.hasOwn(p.answers, 'a'))).toBe(true);
  });

  it("in teams the author's teammate answers", () => {
    const quiz = teamQuiz([thinkRound('r1', ['t1', 't2', 't3'].map((id) => think(id, [red]))), classicRound('r2', [single])]);
    // Автор m1 — капітан t1; за команду діє наступний присутній (m2).
    const intro: GameState = { ...teamGame(quiz, [['Марта', 'Ігор'], ['Віра', 'Хосе']]), autopilot: { authorId: 'm1', at: null } };
    const s = must(next(intro, T0, rng));
    expect(lives(s)).toEqual({ t1: 3, t2: 3 });
    expect(actAnswer(s, 'm1', say(SAFE), at(s, 1000))).toEqual({ ok: false, error: 'think_spectator' });
    const byMate = must(actAnswer(s, 'm2', say(SAFE), at(s, 1000)));
    expect(recordOf(byMate, byMate.questionIndex, 't1')?.answer).toEqual(say(SAFE));
    // Команда лише з автора — глядач.
    const alone: GameState = { ...teamGame(quiz, [['Марта'], ['Віра', 'Хосе']]), autopilot: { authorId: 'm1', at: null } };
    expect(lives(must(next(alone, T0, rng)))).toEqual({ t2: 3 });
  });
});
