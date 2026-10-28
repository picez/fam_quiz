import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, gameAwards, roundCard, roundShares, type Answer, type Quiz } from '@quiz/shared';
import { pickBluff, revealBluffAll, writeLie } from './bluff';
import { factInput, gameFacts } from './facts';
import { placeWager } from './final';
import { lock, next, submitAnswer, type GameState } from './game';
import { revealSurveyAll } from './survey';
import { pickContestant } from './ladder';
import { actAnswer } from './team-act';
import { hostView, playerView, stageView } from './views';
import { blitzRound, bluff, classicRound, finalRound, ladderRound, LADDER_RIGHT, makeQuiz, makeRoundsQuiz, single, survey, withId } from './testing/fixtures';
import { acceptAll, lobbyWith, must, sendBlitz, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const rng = () => 0;
const kyiv: Answer = { type: 'single', optionId: 'b' };
const lviv: Answer = { type: 'single', optionId: 'a' };
const PLAIN = { speedBonus: false, rules: DEFAULT_RULES };

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

/** Відповіді (id → [відповідь, мить]) і закриття, якщо ще відкрито. */
function answer(s: GameState, answers: Record<string, [Answer, number]>): GameState {
  let current = s;
  for (const [id, [a, at]] of Object.entries(answers)) current = must(submitAnswer(current, id, a, at));
  return current.phase === 'question' ? must(lock(current)) : current;
}

/** Два раунди: r1 — три запитання, r2 — одне; Оля p1, Петро p2, Віра p3. */
const roundsQuiz = (leaderboard: 'each' | 'end' = 'each'): Quiz =>
  makeRoundsQuiz(
    [classicRound('r1', [single, withId(single, 'q2'), withId(single, 'q3')], PLAIN), classicRound('r2', [withId(single, 'q4')], PLAIN)],
    { leaderboard },
  );

/** Перший раунд: Оля завжди правильно й найшвидше, Петро правильно, Віра помиляється; гра на розкритті запитання count (типово q3). */
function firstRoundReveal(leaderboard: 'each' | 'end' = 'each', count = 3): GameState {
  let s = startRound(lobbyWith(roundsQuiz(leaderboard), 'Оля', 'Петро', 'Віра'), 0, rng);
  for (let q = 0; q < count; q++) {
    const t = q * 100_000;
    if (q > 0) s = to(s, 'question', t);
    s = answer(s, { p1: [kyiv, t + 1000], p2: [kyiv, t + 2000], p3: [lviv, t + 3000] });
    s = to(s, 'reveal', t + 4000);
  }
  return s;
}

const firstRoundEnd = (leaderboard: 'each' | 'end' = 'each') => to(firstRoundReveal(leaderboard), 'round_end', 400_000);
const finished = () => {
  let s = to(firstRoundEnd(), 'question', 500_000);
  s = answer(s, { p1: [lviv, 501_000], p2: [kyiv, 502_000], p3: [kyiv, 503_000] });
  return to(s, 'finished', 504_000);
};

describe('facts in views (12d)', () => {
  it('the reveal line: right answers of all answers and the fastest; the own place by speed on the phone; nothing on locked', () => {
    let s = startRound(lobbyWith(makeQuiz([single, withId(single, 'q2')], PLAIN), 'Оля', 'Петро', 'Віра', 'Іра'), 0, rng);
    s = answer(s, { p1: [kyiv, 2100], p2: [kyiv, 3000], p3: [kyiv, 4000], p4: [lviv, 5000] });
    expect(s.phase).toBe('locked');
    expect(stageView(s).facts).toBeNull();
    expect(phone(s, 'p2').own?.reveal ?? null).toBeNull();
    s = must(next(s, 6000, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).facts).toEqual({ reveal: { accepted: 3, answered: 4, fastest: { names: ['Оля'], timeMs: 2100 }, bluff: null }, round: null, awards: null });
    expect(hostView(s).facts).toEqual(stageView(s).facts);
    expect(phone(s, 'p3').facts).toEqual(stageView(s).facts);
    expect(phone(s, 'p2').own).toEqual({ reveal: { kind: 'fastest', place: 2 }, round: null, game: null });
    expect(phone(s, 'p4').own?.reveal).toEqual({ kind: 'share', percent: 75 });
  });

  it('bluff: no reveal line before the truth is open; after all options are open the lie with the most votes', () => {
    let s = startRound(lobbyWith(makeQuiz([bluff, single], { speedBonus: false, rules: DEFAULT_RULES, buffs: [] }), 'Оля', 'Петро', 'Віра'), 10_000, rng);
    s = must(writeLie(s, 'p1', 'Рим', 11_000));
    s = must(writeLie(s, 'p2', 'Мілан', 12_000));
    s = must(writeLie(s, 'p3', 'Париж', 13_000));
    const idOf = (text: string) => s.plays[0].bluff!.options.find((o) => o.text === text)!.id;
    s = must(pickBluff(s, 'p1', idOf('Мілан'), 14_000));
    s = must(pickBluff(s, 'p2', idOf('Барселона'), 15_000));
    s = must(pickBluff(s, 'p3', idOf('Мілан'), 16_000));
    s = must(next(s, 17_000, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).facts).toEqual({ reveal: null, round: null, awards: null });
    expect(phone(s, 'p2').own?.reveal).toBeNull();
    s = must(revealBluffAll(s));
    expect(stageView(s).facts?.reveal).toMatchObject({ accepted: 1, answered: 3, bluff: { names: ['Петро'], votes: 2 } });
    expect(phone(s, 'p2').own?.reveal).not.toBeNull();
  });

  it('«100 до 1»: no reveal line while the board is closing; after the whole board is open the line is there', () => {
    let s = startRound(lobbyWith(makeQuiz([survey], PLAIN), 'Оля', 'Петро'), 0, rng);
    s = answer(s, { p1: [{ type: 'survey', values: ['Яблуко'] }, 1000], p2: [{ type: 'survey', values: ['ананас'] }, 2000] });
    s = must(next(s, 3000, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).facts).toEqual({ reveal: null, round: null, awards: null });
    expect(phone(s, 'p1').own?.reveal ?? null).toBeNull();
    s = must(revealSurveyAll(s));
    expect(stageView(s).facts?.reveal).toMatchObject({ answered: 2 });
    expect(phone(s, 'p1').own?.reveal).not.toBeNull();
  });

  it('no reveal line in a blitz', () => {
    let s = startRound(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single, withId(single, 'q2')])]), 'Оля', 'Петро'), 0, rng);
    s = acceptAll(sendBlitz(s, 'p1', lviv, 1000), 1000);
    s = acceptAll(sendBlitz(s, 'p2', kyiv, 2000), 2000);
    while (s.phase !== 'reveal') s = must(next(s, 3000, rng));
    expect(s.plays[0].blitz?.attempts.length).toBe(2);
    expect(stageView(s).facts?.reveal ?? null).toBeNull();
    expect(phone(s, 'p1').own?.reveal ?? null).toBeNull();
  });

  it('the shared facts are cached per state and per reveal flag', () => {
    const s = firstRoundReveal();
    expect(gameFacts(s, false)?.reveal).toBeNull();
    expect(gameFacts(s, true)?.reveal).not.toBeNull();
    expect(gameFacts(s, true)).toBe(gameFacts(s, true));
  });

  it('no reveal line in the final', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single], PLAIN), finalRound('f', withId(single, 'f1'))], { leaderboard: 'end' });
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро'), 0, rng);
    s = answer(s, { p1: [kyiv, 1000], p2: [kyiv, 1000] });
    s = to(s, 'wager', 3000);
    s = must(placeWager(must(placeWager(s, 'p1', 500, 4000, rng)), 'p2', 300, 5000, rng));
    s = answer(s, { p1: [kyiv, 6000], p2: [kyiv, 7000] });
    s = must(next(s, 8000, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).facts?.reveal).toBeNull();
    expect(phone(s, 'p1').own?.reveal).toBeNull();
  });

  it('no reveal line on the ladder', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single], PLAIN), ladderRound('rl')]);
    let s = startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'), 0, rng);
    s = must(lock(s));
    while (!(s.phase === 'intro' && s.roundIndex === 1)) s = must(next(s, 2000, rng));
    s = must(next(must(pickContestant(s, 'p2')), 10_000, rng));
    s = answer(s, { p2: [LADDER_RIGHT[0], 11_000] });
    s = must(next(s, 11_100, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).facts).toEqual({ reveal: null, round: null, awards: null });
  });

  it('the round end: the same cards for every role, the own round card only on the own phone, question shares only on the host', () => {
    const s = firstRoundEnd();
    const input = factInput(s);
    const cards = stageView(s).facts?.round;
    expect(cards?.length).toBeGreaterThan(0);
    expect(cards?.length).toBeLessThanOrEqual(3);
    expect(cards?.[0]).toMatchObject({ kind: 'lightning', names: ['Оля'], timeMs: 1000 });
    expect(stageView(s).facts).toEqual({ reveal: null, round: cards, awards: null });
    expect(hostView(s).facts).toEqual(stageView(s).facts);
    expect(phone(s, 'p1').facts).toEqual(stageView(s).facts);
    const ownOlia = phone(s, 'p1').own;
    expect(ownOlia).toEqual({ reveal: null, round: roundCard(input, 'p1', 0), game: null });
    expect(ownOlia?.round).toMatchObject({ correct: 3, answered: 3, streak: 3 });
    expect(phone(s, 'p2').own?.round).toEqual(roundCard(input, 'p2', 0));
    expect(ownOlia?.round).not.toEqual(roundCard(input, 'p2', 0));
    // У кадрі телефона Олі немає картки Петра.
    expect(JSON.stringify(phone(s, 'p1'))).not.toContain(JSON.stringify(roundCard(input, 'p3', 0)));
    expect(stageView(s)).not.toHaveProperty('own');
    expect(stageView(s)).not.toHaveProperty('roundQuestions');
    expect(phone(s, 'p1')).not.toHaveProperty('roundQuestions');
    expect(hostView(s).roundQuestions).toEqual(roundShares(input, 0));
    expect(hostView(s).roundQuestions?.map((q) => [q.number, q.accepted, q.answered])).toEqual([
      [1, 2, 3],
      [2, 2, 3],
      [3, 2, 3],
    ]);
  });

  it("leaderboard 'end': nothing with an order before the round end; on the round end the place matches the full table", () => {
    const reveal = firstRoundReveal('end', 2);
    // З 'end' між запитаннями таблиці немає: після розкриття — одразу наступне запитання.
    const after = must(next(reveal, 150_000, rng));
    expect(after.phase).toBe('question');
    // На розкритті — лише рядок розкриття.
    expect(stageView(reveal).facts).toEqual({ reveal: expect.objectContaining({ accepted: 2, answered: 3 }), round: null, awards: null });
    for (const s of [reveal, after]) {
      expect(stageView(s).facts?.round ?? null).toBeNull();
      expect(stageView(s).facts?.awards ?? null).toBeNull();
      expect(phone(s, 'p2').own?.round ?? null).toBeNull();
      expect(phone(s, 'p2').own?.game ?? null).toBeNull();
      expect(hostView(s).roundQuestions).toBeNull();
    }
    const end = firstRoundEnd('end');
    const rank = stageView(end).standings?.find((row) => row.participantId === 'p2')?.rank;
    expect(phone(end, 'p2').own?.round?.place?.now).toBe(rank);
  });

  it('the finish: awards for everyone and the own game card with the round columns of the table', () => {
    const s = finished();
    const awards = stageView(s).facts?.awards;
    expect(awards).toEqual(gameAwards(factInput(s)));
    expect(awards?.length).toBeGreaterThan(0);
    expect(awards?.length).toBeLessThanOrEqual(6);
    expect(stageView(s).facts?.round).toBeNull();
    expect(phone(s, 'p3').facts).toEqual(stageView(s).facts);
    const standing = stageView(s).standings?.find((row) => row.participantId === 'p3');
    expect(phone(s, 'p3').own?.game).toMatchObject({ rounds: standing?.rounds });
    expect(phone(s, 'p3').own?.round).toBeNull();
    expect(hostView(s).roundQuestions).toBeNull();
  });

  it('teams: the own card is the team card, the same for both people of the team', () => {
    const quiz = teamQuiz([classicRound('r1', [single], PLAIN), classicRound('r2', [withId(single, 'q2')], PLAIN)]);
    let s = must(next(teamGame(quiz, [['Оля', 'Петро'], ['Іра', 'Марко']]), 0, rng));
    s = must(actAnswer(s, 'm1', kyiv, 1000));
    s = must(actAnswer(s, 'm3', lviv, 2000));
    if (s.phase === 'question') s = must(lock(s));
    s = to(s, 'round_end', 3000);
    const card = roundCard(factInput(s), 't1', 0);
    expect(card).not.toBeNull();
    expect(phone(s, 'm1').own?.round).toEqual(card);
    expect(phone(s, 'm2').own?.round).toEqual(card);
    expect(phone(s, 'm3').own?.round).toEqual(roundCard(factInput(s), 't2', 0));
  });

  it('the lobby: no facts, no own facts', () => {
    const s = lobbyWith(makeQuiz([single], PLAIN), 'Оля', 'Петро');
    expect(phone(s, 'p1').own).toBeNull();
    expect(phone(s, 'p1').facts).toBeNull();
    expect(stageView(s).facts).toBeNull();
    expect(hostView(s).roundQuestions).toBeNull();
  });
});
