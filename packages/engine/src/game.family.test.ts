import { DEBUFF_KINDS, familyExtraMs, roundBrief, type Question, type Quiz } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { writeLie } from './bluff';
import { buyDebuff, setDebuff } from './debuffs';
import { lock, next, pause, recordOf, start, submitAnswer, type GameState } from './game';
import { pickContestant } from './ladder';
import { adjustTime, limitMsOf } from './timing';
import { bluff, classicRound, ladderRound, makeRoundsQuiz, single, truthRound, withVideo } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const T0 = 1_000_000;
const rng = () => 0;
const single30 = { ...single, timeLimit: 30 } satisfies Question;
const family = (quiz: Quiz): Quiz => ({ ...quiz, settings: { ...quiz.settings, family: true } });
const open = (quiz: Quiz): GameState => startRound(lobbyWith(quiz, 'Оля', 'Петро'), T0, rng);
const classic = (questions: Question[], settings = {}) => makeRoundsQuiz([classicRound('r1', questions)], settings);

describe('family game (31)', () => {
  it('a timed question gets half its window again in extraMs', () => {
    const state = open(family(classic([single30])));
    expect((state.endsAt as number) - (state.startedAt as number)).toBe(45_000);
    expect(state.plays[0].extraMs).toBe(15_000);
    expect(limitMsOf(state.plays[0])).toBe(45_000);
    const plain = open(classic([single30]));
    expect((plain.endsAt as number) - (plain.startedAt as number)).toBe(30_000);
    expect(plain.plays[0].extraMs).toBe(0);
  });

  it('a question with video and a ladder without a timer get no clock and no extra', () => {
    const video = open(family(classic([withVideo(single30)])));
    expect(video.endsAt).toBeNull();
    expect(video.plays[0].extraMs).toBe(0);
    const intro = must(start(lobbyWith(family(makeRoundsQuiz([ladderRound('l1')])), 'Оля', 'Петро')));
    const ladder = must(next(must(pickContestant(intro, 'p2')), T0, rng));
    expect(ladder.phase).toBe('question');
    expect(ladder.endsAt).toBeNull();
    expect(ladder.plays[0].extraMs).toBe(0);
  });

  it('the host «+15 с» adds to the longer remainder', () => {
    const state = must(adjustTime(open(family(classic([single30]))), 15, T0));
    expect((state.endsAt as number) - T0).toBe(60_000);
    expect(state.plays[0].extraMs).toBe(30_000);
  });

  it('bluff: the lies and the choice both get the family extra, also on pause', () => {
    const quiz = family(classic([bluff, single]));
    let state = open(quiz);
    expect(state.plays[0].extraMs).toBe(familyExtraMs(bluff.timeLimit * 1000));
    state = must(writeLie(state, 'p1', 'Рим', T0 + 1000));
    state = must(writeLie(state, 'p2', 'Мілан', T0 + 2000));
    const choiceMs = bluff.choiceTime * 1000;
    expect(state.plays[0].bluff?.stage).toBe('choice');
    expect((state.endsAt as number) - (state.startedAt as number)).toBe(choiceMs + familyExtraMs(choiceMs));
    expect(state.plays[0].extraMs).toBe(familyExtraMs(choiceMs));
    expect(limitMsOf(state.plays[0])).toBe(choiceMs + familyExtraMs(choiceMs));
    // Ведучий перемикає до вибору на паузі: залишок — теж із надбавкою.
    const paused = must(lock(must(pause(open(quiz), T0 + 5000)), T0 + 6000));
    expect(paused.plays[0].bluff?.stage).toBe('choice');
    expect(paused.remainingMs).toBe(choiceMs + familyExtraMs(choiceMs));
  });

  it('the speed bonus counts from the longer window', () => {
    const state = open(family(classic([single30])));
    const answered = must(submitAnswer(state, 'p1', { type: 'single', optionId: 'b' }, T0 + 40_000));
    expect(recordOf(answered, 0, 'p1')?.points).toBeGreaterThan(0);
  });

  it('the five confusing debuffs are refused from the host and the shop', () => {
    const quiz = family(classic([single30, single30], { debuffs: [...DEBUFF_KINDS] }));
    const state = open(quiz);
    expect(setDebuff(state, 'p2', 'shake')).toEqual({ ok: false, error: 'not_allowed' });
    expect(setDebuff(state, 'p2', 'fog').ok).toBe(true);
    expect(buyDebuff(state, 'p1', 'p2', 'mirror', T0 + 1000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(buyDebuff(state, 'p1', 'p2', 'fog', T0 + 1000)).toEqual({ ok: false, error: 'points_short' });
    expect(hostView(state).allowed.debuffs).not.toContain('shake');
    expect(hostView(state).allowed.debuffs).toContain('fog');
    expect(playerView(state, 'p1', T0)?.me.shop?.items.map((i) => i.kind)).toEqual(['fog', 'freeze', 'guests', 'mud', 'sticky', 'noclock']);
  });

  it('views say family: true only in a family game', () => {
    const on = open(family(classic([single30])));
    expect(stageView(on).family).toBe(true);
    expect(hostView(on).family).toBe(true);
    expect(playerView(on, 'p1', T0)?.family).toBe(true);
    const off = open(classic([single30]));
    expect('family' in stageView(off)).toBe(false);
    expect('family' in hostView(off)).toBe(false);
    expect('family' in (playerView(off, 'p1', T0) ?? {})).toBe(false);
  });

  it('the state keeps its shape: the same GameState keys with and without family', () => {
    const plain = open(classic([single30]));
    const fam = open(family(classic([single30])));
    expect(Object.keys(JSON.parse(JSON.stringify(fam))).sort()).toEqual(Object.keys(JSON.parse(JSON.stringify(plain))).sort());
    expect(Object.keys(fam.plays[0]).sort()).toEqual(Object.keys(plain.plays[0]).sort());
  });

  it('the round intro and its briefing show the family time', () => {
    const intro = must(start(lobbyWith(family(classic([single30, { ...single30, id: 'q2', timeLimit: 25 }])), 'Оля')));
    expect(intro.phase).toBe('intro');
    expect(stageView(intro).round?.times).toEqual({ min: 38, max: 45 });
    const plain = must(start(lobbyWith(classic([single30]), 'Оля')));
    expect(stageView(plain).round?.times).toEqual({ min: 30, max: 30 });
    const truth = truthRound('t1', { timeLimit: 30 });
    expect(roundBrief(truth, true).truth?.time).toBe(45);
    expect(roundBrief(truth).truth?.time).toBe(30);
  });
});
