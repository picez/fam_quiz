import { describe, expect, it } from 'vitest';
import { SPLASH_MS, type Answer } from '@quiz/shared';
import { lock, next, pause, start, submitAnswer, type GameState } from './game';
import { answerTrial, closeTrial, pickDoor, survivalAlive } from './survival';
import { classicRound, makeRoundsQuiz, single, survivalQuestions, survivalRound, survivalTrials } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, startRound } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const rng = () => 0;
const mid = () => 0.5;
type RoundOptions = Parameters<typeof survivalRound>[3];
const quizWith = (options: RoundOptions = {}) =>
  makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials, options), classicRound('r2', [single])], { debuffs: ['fog', 'mud'] });
const lobby = (options: RoundOptions = {}) => lobbyWith(quizWith(options), 'Оля', 'Петро', 'Віра');

const RIGHT: Answer = { type: 'single', optionId: 'b' };
const WRONG: Answer = { type: 'single', optionId: 'a' };
const YES: Answer = { type: 'boolean', value: true };
const NO: Answer = { type: 'boolean', value: false };

const phone = (s: GameState, id: string) => {
  const view = playerView(s, id);
  if (view === null) throw new Error('no view');
  return view;
};
const survivalOf = (s: GameState) => {
  const info = stageView(s).survival;
  if (info === null) throw new Error('no survival');
  return info;
};
const row = (s: GameState, id: string) => {
  const found = survivalOf(s).rows.find((r) => r.playerId === id);
  if (found === undefined) throw new Error('no row');
  return found;
};
const hostRow = (s: GameState, id: string) => hostView(s).survival?.rows.find((r) => r.playerId === id);
const trialOf = (s: GameState) => s.plays[s.questionIndex].survival?.trial?.stage;

/** s1 відкрито о 0; усі відповіли о 1000: wrong — помилилися, решта правильно. Стан locked. */
function s1Answered(wrong: string[] = ['p2'], s: GameState = startRound(lobby(), 0, rng)): GameState {
  return s1AnsweredAt(s, 1000, wrong);
}

function s1AnsweredAt(s: GameState, at: number, wrong: string[] = ['p2']): GameState {
  return ['p1', 'p2', 'p3'].reduce((current, id) => must(submitAnswer(current, id, wrong.includes(id) ? WRONG : RIGHT, at)), s);
}

/** Помилилися wrong; розкриття о 2000, «Далі» о 3000: випробування відкрите. */
const trialOpen = (options: RoundOptions = {}, trialRng = rng, wrong: string[] = ['p2']): GameState => {
  const locked = s1Answered(wrong, startRound(lobby(options), 0, rng));
  return must(next(must(next(locked, 2000, rng)), 3000, trialRng));
};

/** Помилилися всі: «Далі» о 3000 — leaderboard без випробування. */
const trialAllWrong = (): GameState => must(next(must(next(s1Answered(['p1', 'p2', 'p3']), 2000, rng)), 3000, rng));

/** p2 вибув (питання на виживання не пройдено); p1 і p3 живі. Стан leaderboard. */
const p2Out = () => must(answerTrial(trialOpen(), 'p2', NO, 4000));

/** s2 відкрито о 5000 для p1, p3; p2 — привид, що відповів правильно. */
function ghostOnS2(): GameState {
  return must(submitAnswer(must(next(p2Out(), 5000, rng)), 'p2', YES, 5500));
}

describe('survival views (10h)', () => {
  it('everyone is alive on the intro', () => {
    const s = must(start(lobby()));
    expect(s.phase).toBe('intro');
    const info = survivalOf(s);
    expect(info).toMatchObject({ current: -1, total: 5, target: 1, bonus: 500, trialKind: 'question', trialsLeft: 2, aliveCount: 3, ghostCount: 0, verdict: null, trial: null });
    expect(info.rows.map((r) => r.status)).toEqual(['alive', 'alive', 'alive']);
  });

  it('nobody is on the edge before the reveal', () => {
    const open = startRound(lobby(), 0, rng);
    expect(JSON.stringify(stageView(open))).not.toContain('"edge"');
    const s = s1Answered();
    expect(s.phase).toBe('locked');
    for (const view of [JSON.stringify(stageView(s)), JSON.stringify(phone(s, 'p2')), JSON.stringify(hostView(s))]) expect(view).not.toContain('"edge"');
    expect(survivalOf(s).verdict).toBeNull();
    const revealed = must(next(s, 1500, rng));
    expect(revealed.phase).toBe('reveal');
    expect(row(revealed, 'p2').status).toBe('edge');
    expect(row(revealed, 'p1').status).toBe('alive');
    expect(survivalOf(revealed).verdict).toBe('trial');
  });

  it('ghost answers count only from the reveal', () => {
    const s = ghostOnS2();
    expect(survivalAlive(s)).toEqual(['p1', 'p3']);
    expect(s.phase).toBe('question');
    expect(survivalOf(s).ghosts).toEqual({ answered: 1, right: null });
    expect(row(s, 'p2').ghost).toEqual({ correct: null });
    expect(phone(s, 'p2').me.survival?.ghostCorrect).toBeNull();
    expect(phone(s, 'p2').me.answer).toEqual(YES);
    expect(stageView(s).answeredCount).toBe(0);
    const live = must(submitAnswer(s, 'p1', YES, 5600));
    expect(stageView(live).answeredCount).toBe(1);
    const revealed = must(next(must(lock(live)), 6000, rng));
    expect(revealed.phase).toBe('reveal');
    expect(survivalOf(revealed).ghosts).toEqual({ answered: 1, right: 1 });
    expect(row(revealed, 'p2').ghost).toEqual({ correct: true });
    expect(phone(revealed, 'p2').me.survival?.ghostCorrect).toBe(true);
    expect(phone(revealed, 'p2').me.answer).toEqual(YES);
    expect(phone(revealed, 'p2').me.result).toBeNull();
  });

  it('an open survival question hides the answer', () => {
    const s = trialOpen();
    const trial = survivalOf(s).trial;
    expect(trial).toMatchObject({ kind: 'question', stage: 'open', done: 0, total: 1, reveal: null, limitMs: 15_000 });
    expect(trial?.question).not.toBeNull();
    expect(JSON.stringify(trial?.question)).not.toMatch(/"correct"|"accepted"/);
    const { correct: _correct, responses: _responses, ...hostRest } = hostView(s);
    expect(JSON.stringify(hostRest)).not.toMatch(/"correct"|"accepted"/);
    expect(hostRow(s, 'p2')?.answer).toBeNull();
    // До закриття ніхто не бачить, правильна чи ні відповідь.
    expect(row(s, 'p2').trial).toBe('pending');
    const closed = must(answerTrial(s, 'p2', YES, 4000));
    expect(trialOf(closed)).toBe('closed');
    expect(survivalOf(closed).trial?.reveal).toMatchObject({ id: 't1', type: 'boolean', correct: true });
    expect(row(closed, 'p2').trial).toBe('safe');
    expect(hostRow(closed, 'p2')?.answer).toEqual(YES);
  });

  it('the open trial hides who answered what from the host until it closes', () => {
    const open = trialOpen({}, rng, ['p1', 'p2']);
    const one = must(answerTrial(open, 'p2', YES, 4000));
    expect(trialOf(one)).toBe('open');
    expect(hostRow(one, 'p2')).toMatchObject({ trial: 'done', answer: null });
    expect(JSON.stringify(hostView(one).survival)).not.toContain('"answer":{');
    const closed = closeTrial(one);
    expect(hostRow(closed, 'p2')?.answer).toEqual(YES);
    expect(hostRow(closed, 'p1')?.answer).toBeNull();
  });

  it('nobody stays on the edge when everyone erred', () => {
    const s = trialAllWrong();
    expect(s.phase).toBe('leaderboard');
    expect(survivalOf(s).verdict).toBe('all_wrong');
    expect(survivalOf(s).rows.map((r) => r.status)).toEqual(['alive', 'alive', 'alive']);
    expect(phone(s, 'p2').me.survival?.status).toBe('alive');
    const revealed = must(next(s1Answered(['p1', 'p2', 'p3']), 2000, rng));
    expect(survivalOf(revealed).rows.map((r) => r.status)).toEqual(['edge', 'edge', 'edge']);
  });

  it('traps stay hidden from everyone, the host included, until the trial closes', () => {
    // p1 і p2 помилилися: двоє на межі, пастка й запасні двері обох — 1.
    const open = trialOpen({ trial: 'luck' }, mid, ['p1', 'p2']);
    expect(survivalOf(open).trial).toMatchObject({ kind: 'luck', question: null, reveal: null, limitMs: 10_000, done: 0, total: 2 });
    const picked = must(pickDoor(open, 'p2', 2, 4000));
    expect(trialOf(picked)).toBe('open');
    expect(row(picked, 'p2')).toMatchObject({ trial: 'done', door: { picked: null, auto: false, trap: null } });
    expect(row(picked, 'p1').trial).toBe('pending');
    expect(survivalOf(picked).trial).toMatchObject({ done: 1, total: 2 });
    for (const view of [
      JSON.stringify(stageView(picked)),
      JSON.stringify(phone(picked, 'p1')),
      JSON.stringify(phone(picked, 'p2')),
      JSON.stringify(hostView(picked)),
    ]) {
      expect(view).not.toMatch(/"trap":\d/);
    }
    // Пульт бачить вибрані двері наживо, сцена — ні.
    expect(hostRow(picked, 'p2')?.door).toEqual({ picked: 2, auto: false, trap: null });
    expect(phone(picked, 'p2').me.survival).toMatchObject({ door: 2, canPickDoor: false });
    // Після закриття: двері, пастки й підсумок для всіх.
    const closed = closeTrial(picked);
    expect(row(closed, 'p2')).toMatchObject({ trial: 'safe', door: { picked: 2, auto: false, trap: 1 } });
    expect(row(closed, 'p1')).toMatchObject({ trial: 'out', door: { picked: 1, auto: true, trap: 1 } });
    expect(phone(closed, 'p1').me.survival).toMatchObject({ status: 'ghost', result: 'out' });
  });

  it('the trial clock', () => {
    const s = trialOpen();
    expect(survivalOf(s).trial).toMatchObject({ endsAt: 18_000, remainingMs: null });
    expect(stageView(s).endsAt).toBe(18_000);
    const paused = must(pause(s, 5000));
    expect(survivalOf(paused).trial).toMatchObject({ endsAt: null, remainingMs: 13_000 });
    expect(survivalOf(trialOpen({ trial: 'luck' })).trial?.limitMs).toBe(10_000);
  });

  it('me.survival: the trial controls, the result and the bonus', () => {
    const s = trialOpen();
    expect(phone(s, 'p2').me.survival).toMatchObject({ status: 'edge', canAnswerTrial: true, canPickDoor: false, trialAnswer: null, result: null, bonus: null });
    expect(phone(s, 'p1').me.survival).toMatchObject({ status: 'alive', canAnswerTrial: false });
    expect(phone(must(pause(s, 5000)), 'p2').me.survival?.canAnswerTrial).toBe(false);
    const luck = trialOpen({ trial: 'luck' });
    expect(phone(luck, 'p2').me.survival).toMatchObject({ canAnswerTrial: false, canPickDoor: true });
    const out = p2Out();
    expect(phone(out, 'p2').me.survival).toMatchObject({ status: 'ghost', outAfter: 1, result: 'out', trialAnswer: NO });
    expect(phone(out, 'p2').me.survival?.canAnswerTrial).toBe(false);
    const safe = must(answerTrial(trialOpen(), 'p2', YES, 4000));
    expect(phone(safe, 'p2').me.survival).toMatchObject({ status: 'alive', result: 'safe', canAnswerTrial: false });
    expect(phone(safe, 'p1').me.survival?.result).toBeNull();
    // s2: p3 помиляється, не проходить випробування — лишається один живий, раунд закінчується.
    let c = must(next(out, 5000, rng));
    c = must(submitAnswer(c, 'p1', YES, 5500));
    c = must(submitAnswer(c, 'p3', NO, 5500));
    c = must(next(c, 6000, rng));
    c = must(next(c, 7000, rng));
    c = must(answerTrial(c, 'p3', RIGHT, 8000));
    expect(survivalOf(c).ending).toBe(false);
    expect(phone(c, 'p3').me.survival?.result).toBe('safe');
  });

  it('the bonus shows on round_end for the living only', () => {
    // s1: p2 вибуває; s2: p3 помиляється і вибуває — лишається p1 (N = 1).
    let c = must(next(p2Out(), 5000, rng));
    c = must(submitAnswer(c, 'p1', YES, 5500));
    c = must(submitAnswer(c, 'p3', NO, 5500));
    c = must(next(c, 6000, rng));
    c = must(next(c, 7000, rng));
    c = must(answerTrial(c, 'p3', WRONG, 8000));
    expect(survivalOf(c).ending).toBe(true);
    const end = must(next(c, 9000, rng));
    expect(end.phase).toBe('round_end');
    expect(phone(end, 'p1').me.survival).toMatchObject({ status: 'alive', bonus: 500 });
    expect(phone(end, 'p3').me.survival).toMatchObject({ status: 'ghost', outAfter: 2, bonus: null });
    expect(phone(end, 'p2').me.survival?.bonus).toBeNull();
  });

  it('the board replaces the leaderboard, the table button still works', () => {
    const s = p2Out();
    expect(s.phase).toBe('leaderboard');
    expect(stageView(s).standings).toBeNull();
    expect(phone(s, 'p1').standings).toBeNull();
    expect(phone(s, 'p1').table?.full).toBe(true);
    const end = { ...s, quiz: { ...s.quiz, settings: { ...s.quiz.settings, leaderboard: 'end' as const } } };
    expect(phone(end, 'p1').table).toMatchObject({ full: false });
    expect(phone(end, 'p1').table?.rows).toHaveLength(1);
  });

  it('the shop offers no ghost targets', () => {
    const s = p2Out();
    expect(phone(s, 'p1').me.shop?.targets.map((t) => t.playerId)).toEqual(['p3']);
    // Привид купує для живих.
    expect(phone(s, 'p2').me.shop?.targets.map((t) => t.playerId)).toEqual(['p1', 'p3']);
    // На round_end привид знову ціль.
    const end = { ...s, phase: 'round_end' as const };
    expect(phone(end, 'p1').me.shop?.targets.map((t) => t.playerId)).toEqual(['p2', 'p3']);
  });

  it('the trial splash shows on the leaderboard', () => {
    let s = s1AnsweredAt(startRound(lobbyWithSplash(quizWith(), 'Оля', 'Петро', 'Віра'), 0, rng), 10_000);
    s = must(next(s, 10_500, rng));
    s = must(next(s, 11_000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(stageView(s).splash).toMatchObject({ kind: 'trial', until: 11_000 + SPLASH_MS.trial });
  });

  it('outside survival there is no board', () => {
    const s = startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля', 'Петро'), 0, rng);
    expect(stageView(s).survival).toBeNull();
    expect(hostView(s).survival).toBeNull();
    expect(phone(s, 'p1').me.survival).toBeNull();
  });
});
