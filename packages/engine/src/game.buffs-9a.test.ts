import { BUFF_KINDS, DEFAULT_RULES, type Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { AUDIENCE_MS, buffBlock, canVote, fiftyCount, takeBuff } from './buffs';
import { nameAnswer, pickCell } from './board';
import { lock, next, override, start, submitAnswer, tick, type GameState } from './game';
import { deadlineOf, overtimeOf } from './timing';
import { hostView, playerView, stageView } from './views';
import { T0, othersQuiz, toBuffCell, toBuffQuestion, toOthersQuestion } from './testing/buffs';
import {
  blitzRound,
  bool,
  boardRound,
  chain,
  classicRound,
  finalRound,
  makeQuiz,
  makeRoundsQuiz,
  multi,
  single4,
  sortQ,
  text,
  withId,
  withVideo,
} from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng0 = () => 0;
const options = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, text: `Варіант ${i}` }));
/** multi з n варіантами, з яких перші right правильні. */
const multiOf = (n: number, right: number): Question => ({ ...multi, options: options(n), correctIds: options(right).map((o) => o.id) });
const kyiv = { type: 'single', optionId: 'b' } as const;

describe('50/50 that everybody sees', () => {
  it('a multi question loses half of its wrong options rounded up, but one wrong always stays', () => {
    // неправильних: 2 → 1, 3 → 2, 4 → 2, 5 → 3
    expect([multiOf(4, 2), multiOf(4, 1), multiOf(6, 2), multiOf(6, 1)].map(fiftyCount)).toEqual([1, 2, 2, 3]);
    expect(fiftyCount(multiOf(3, 1))).toBe(1);
    expect(fiftyCount(multiOf(3, 2))).toBe(0);
  });

  it('on a board cell everybody sees what 50/50 removed; in classic only the taker', () => {
    const cell = must(takeBuff(toBuffCell(), 'p1', 'fifty', T0 + 1000, rng0));
    const removed = cell.plays[0].buffs?.p1.removed ?? [];
    expect(removed).toHaveLength(2);
    expect(removed).not.toContain('b');
    expect(stageView(cell).removed).toEqual(removed);
    expect(hostView(cell).removed).toEqual(removed);
    expect(playerView(cell, 'p2')?.removed).toEqual(removed);
    expect(playerView(cell, 'p1')?.removed).toEqual(removed);
    expect(playerView(cell, 'p1')?.me.buffs?.active?.removed).toEqual(removed);
    // після закриття й на розкритті позначка лишається
    const locked = must(lock(cell));
    expect(locked.phase).toBe('locked');
    expect(stageView(locked).removed).toEqual(removed);
    const revealed = must(next(locked, T0 + 30_000));
    expect(revealed.phase).toBe('reveal');
    expect(stageView(revealed).removed).toEqual(removed);
    expect(playerView(revealed, 'p3')?.removed).toEqual(removed);

    const classic = must(takeBuff(toBuffQuestion(), 'p1', 'fifty', T0 + 1000, rng0));
    expect(stageView(classic).removed).toEqual([]);
    expect(hostView(classic).removed).toEqual([]);
    expect(playerView(classic, 'p2')?.removed).toEqual([]);
    expect(playerView(classic, 'p1')?.removed).toEqual([]);
    expect(playerView(classic, 'p1')?.me.buffs?.active?.removed).toEqual(['a', 'c']);
  });

  it('nothing is removed before a buff and between questions', () => {
    expect(stageView(toBuffCell()).removed).toEqual([]);
    expect(playerView(toBuffCell(), 'p2')?.removed).toEqual([]);
    // поле після розкриття й «Далі» (етап board): removed []
    const cell = must(takeBuff(toBuffCell(), 'p1', 'fifty', T0 + 1000, rng0));
    const board = must(next(must(next(must(lock(cell)), T0 + 30_000)), T0 + 31_000));
    expect(board.phase).toBe('board');
    expect(stageView(board).removed).toEqual([]);
    expect(hostView(board).removed).toEqual([]);
    expect(playerView(board, 'p2')?.removed).toEqual([]);
  });
});

describe('the audience buff', () => {
  it('gives the asker 15 s of their own time, like extra time', () => {
    const answered = must(submitAnswer(toOthersQuestion(), 'p2', kyiv, T0 + 2000));
    const s = must(takeBuff(answered, 'p1', 'audience', T0 + 5000, rng0));
    const play = s.plays[0];
    expect(play.buffs?.p1.vote?.endsAt).toBe(T0 + 5000 + AUDIENCE_MS);
    expect(overtimeOf(play, 'p1')).toBe(AUDIENCE_MS);
    expect(deadlineOf(s, play, 'p1')).toBe(T0 + 20_000 + AUDIENCE_MS);
    expect(playerView(s, 'p1')?.me.overtime).toEqual({ deadline: T0 + 35_000, remainingMs: null });
    expect(submitAnswer(s, 'p1', kyiv, T0 + 30_000).ok).toBe(true);
    expect(submitAnswer(s, 'p1', kyiv, T0 + 35_001)).toEqual({ ok: false, error: 'time_over' });
    // сцена показує «Чекаємо: Оля» до особистого кінця
    expect(stageView(s).overtime).toEqual([expect.objectContaining({ playerId: 'p1', deadline: T0 + 35_000, remainingMs: null })]);
  });

  it('a question without a timer gives no extra time', () => {
    const quiz = othersQuiz();
    const round = quiz.rounds[0];
    if (round.type !== 'classic') throw new Error('othersQuiz is classic');
    const [first, ...rest] = round.questions;
    const video = { ...quiz, rounds: [{ ...round, questions: [withVideo(first ?? single4), ...rest] }] };
    const s0 = startRound(lobbyWith(video, 'Оля', 'Петро', 'Іра'), T0, rng0);
    const answered = must(submitAnswer(s0, 'p2', kyiv, T0 + 2000));
    const s = must(takeBuff(answered, 'p1', 'audience', T0 + 5000, rng0));
    const play = s.plays[0];
    expect(play.buffs?.p1.vote?.endsAt).toBe(T0 + 5000 + AUDIENCE_MS);
    expect(overtimeOf(play, 'p1')).toBe(0);
    expect(deadlineOf(s, play, 'p1')).toBeNull();
  });
});

/** Поле «Міста»: v1 — усна клітинка x2 (question), v2 — з телефона; штраф minus; усі бафи; запасне s1 bool. Оля p1 вибирає v1 о T0. */
function toVoiceCell(question: Question = single4): GameState {
  const round = boardRound(
    'g1',
    [{ title: 'Міста', cells: [{ question: withId(question, 'v1'), answerMode: 'voice', mark: 'x2' }, withId(single4, 'v2')] }],
    { rules: { ...DEFAULT_RULES, penalty: 'minus' } },
  );
  const quiz = { ...makeRoundsQuiz([round], { buffs: [...BUFF_KINDS] }), spares: [withId(bool, 's1')] };
  const intro = must(start(lobbyWith(quiz, 'Оля', 'Петро', 'Іра')));
  return must(pickCell(must(next(intro, T0)), 'p1', 'v1', T0, rng0));
}

describe('buffs on a voice cell', () => {
  it('the chooser may take double, shield, hint, time, audience and swap; a second try is not for voice', () => {
    for (const kind of ['double', 'shield', 'hint', 'time', 'audience', 'swap'] as const) {
      expect(takeBuff(toVoiceCell(), 'p1', kind, T0 + 2000, rng0).ok, kind).toBe(true);
    }
    expect(buffBlock(toVoiceCell(), 'p1', 'retry')).toBe('unfit_voice');
    expect(takeBuff(toVoiceCell(), 'p1', 'retry', T0 + 2000, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
    expect(playerView(toVoiceCell(), 'p1')?.me.buffs?.slots.find((slot) => slot.kind === 'retry')).toEqual({
      kind: 'retry',
      state: 'blocked',
      block: 'unfit_voice',
    });
    expect(playerView(toVoiceCell(), 'p1')?.me.buffs?.slots.find((slot) => slot.kind === 'double')).toEqual({
      kind: 'double',
      state: 'ready',
      block: null,
    });
    expect(playerView(toVoiceCell(), 'p2')?.me.buffs).toBeNull();
    expect(takeBuff(toVoiceCell(), 'p2', 'double', T0 + 2000, rng0)).toEqual({ ok: false, error: 'not_your_turn' });
  });

  it('50/50 works only with options and the stage shows the removed ones', () => {
    const s = must(takeBuff(toVoiceCell(), 'p1', 'fifty', T0 + 2000, rng0));
    const removed = s.plays[0].buffs?.p1.removed ?? [];
    expect(removed).toHaveLength(2);
    expect(removed).not.toContain('b');
    expect(stageView(s).removed).toEqual(removed);
    expect(hostView(s).removed).toEqual(removed);
    expect(buffBlock(toVoiceCell({ ...text, accepted: ['Київ'] }), 'p1', 'fifty')).toBe('unfit_type');
    expect(buffBlock(toVoiceCell(bool), 'p1', 'fifty')).toBe('unfit_type');
  });

  it('double points and a shield count in the host verdict', () => {
    const price = single4.points;
    const doubled = must(override(must(takeBuff(toVoiceCell(), 'p1', 'double', T0 + 2000, rng0)), 'p1', 'correct', T0 + 3000));
    expect(doubled.phase).toBe('locked');
    expect(doubled.plays[0].answers.p1).toMatchObject({ points: price * 2 * 2, buff: 'double' });
    const shielded = must(override(must(takeBuff(toVoiceCell(), 'p1', 'shield', T0 + 2000, rng0)), 'p1', 'wrong', T0 + 3000));
    expect(shielded.plays[0].answers.p1).toMatchObject({ points: 0, buff: 'shield' });
    // без щита помилка на клітинці x2 зі штрафом minus коштує подвійну ціну
    const plain = must(override(toVoiceCell(), 'p1', 'wrong', T0 + 3000));
    expect(plain.plays[0].answers.p1).toMatchObject({ points: -price * 2 });
  });

  it('a swap on a voice cell shows the spare to everybody and the host names its answer', () => {
    const s = must(takeBuff(toVoiceCell(), 'p1', 'swap', T0 + 2000, rng0));
    expect(stageView(s).question?.text).toBe(bool.text);
    expect(playerView(s, 'p2')?.question?.text).toBe(bool.text);
    expect(hostView(s).correct?.id).toBe('s1');
    expect(nameAnswer(s, { type: 'boolean', value: true }).ok).toBe(true);
    expect(nameAnswer(s, { type: 'single', optionId: 'b' })).toEqual({ ok: false, error: 'type_mismatch' });
    // без заміни ведучий позначає варіант основного
    expect(nameAnswer(toVoiceCell(), { type: 'single', optionId: 'b' }).ok).toBe(true);
    expect(nameAnswer(toVoiceCell(), { type: 'boolean', value: true })).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('once the host marks the answer said aloud, the chooser can take no buff', () => {
    expect(takeBuff(toVoiceCell(), 'p1', 'double', T0 + 2000, rng0).ok).toBe(true);
    const named = must(nameAnswer(toVoiceCell(), { type: 'single', optionId: 'a' }));
    for (const kind of ['double', 'shield', 'fifty'] as const) {
      expect(takeBuff(named, 'p1', kind, T0 + 2000, rng0), kind).toEqual({ ok: false, error: 'already_answered' });
      expect(buffBlock(named, 'p1', kind), kind).toBe('answered');
    }
    expect(playerView(named, 'p1')?.me.buffs?.slots.find((slot) => slot.kind === 'double')).toEqual({
      kind: 'double',
      state: 'blocked',
      block: 'answered',
    });
    // ведучий зняв позначку — відповіді знову немає
    expect(takeBuff(must(nameAnswer(named, null)), 'p1', 'double', T0 + 2000, rng0).ok).toBe(true);
  });

  it('time and audience give the chooser personal time on a voice cell', () => {
    const timed = must(takeBuff(toVoiceCell(), 'p1', 'time', T0 + 2000, rng0));
    expect(deadlineOf(timed, timed.plays[0], 'p1')).toBe(T0 + 20_000 + 30_000);
    expect(tick(timed, T0 + 20_001).phase).toBe('question');

    const asked = must(takeBuff(toVoiceCell(), 'p1', 'audience', T0 + 2000, rng0));
    expect(canVote(asked, 'p2', 'p1')).toBe(true);
    expect(canVote(asked, 'p3', 'p1')).toBe(true);
    expect(overtimeOf(asked.plays[0], 'p1')).toBe(AUDIENCE_MS);
  });
});

describe('specific reasons where there are no buffs', () => {
  it('blitz, a blitz cell, the final, a chain and sorting each say why; the row is still there', () => {
    const buffs = [...BUFF_KINDS];
    const blitz = startRound(lobbyWith(makeRoundsQuiz([blitzRound('b1', [single4])], { buffs }), 'Оля'), T0, rng0);
    expect(buffBlock(blitz, 'p1', 'double')).toBe('off_blitz');
    expect(playerView(blitz, 'p1')?.me.buffs?.slots.every((slot) => slot.block === 'off_blitz')).toBe(true);
    expect(takeBuff(blitz, 'p1', 'double', T0, rng0)).toEqual({ ok: false, error: 'wrong_phase' });

    const final = must(next(must(next(must(start(lobbyWith(makeRoundsQuiz([finalRound('f1', single4)], { buffs }), 'Оля'))), T0, rng0)), T0, rng0));
    expect(final.phase).toBe('question');
    expect(buffBlock(final, 'p1', 'double')).toBe('off_final');
    expect(playerView(final, 'p1')?.me.buffs?.slots.every((slot) => slot.block === 'off_final')).toBe(true);

    for (const [question, reason] of [
      [chain, 'off_chain'],
      [sortQ, 'off_sort'],
    ] as const) {
      const s = startRound(lobbyWith(makeQuiz([question], { buffs }), 'Оля'), T0, rng0);
      expect(buffBlock(s, 'p1', 'double')).toBe(reason);
      expect(playerView(s, 'p1')?.me.buffs?.slots.every((slot) => slot.block === reason)).toBe(true);
    }

    const round = boardRound('g1', [{ title: 'Міста', cells: [{ question: withId(single4, 'k1'), kind: 'blitz' }, withId(single4, 'k2')] }]);
    const board = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { buffs }), 'Оля', 'Петро'))), T0, rng0));
    const blitzCell = must(pickCell(board, 'p1', 'k1', T0, rng0));
    for (const id of ['p1', 'p2']) {
      expect(buffBlock(blitzCell, id, 'double')).toBe('off_blitz_cell');
      expect(playerView(blitzCell, id)?.me.buffs?.slots.every((slot) => slot.block === 'off_blitz_cell')).toBe(true);
    }
    expect(takeBuff(blitzCell, 'p1', 'double', T0, rng0)).toEqual({ ok: false, error: 'wrong_phase' });
    const normal = must(pickCell(board, 'p1', 'k2', T0, rng0));
    expect(playerView(normal, 'p2')?.me.buffs).toBeNull();
    expect(buffBlock(normal, 'p2', 'double')).toBe('not_chooser');
  });

  it('a buff used earlier still says used in blitz', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single4]), blitzRound('b1', [withId(single4, 'q9')])], { buffs: [...BUFF_KINDS] });
    let s = must(takeBuff(startRound(lobbyWith(quiz, 'Оля'), T0, rng0), 'p1', 'double', T0 + 1000, rng0));
    let now = T0 + 2000;
    for (let i = 0; i < 10 && !(s.phase === 'question' && s.roundIndex === 1); i++) {
      now += 1000;
      s = must(s.phase === 'question' ? lock(s) : next(s, now, rng0));
    }
    expect([s.phase, s.roundIndex]).toEqual(['question', 1]);
    const slots = playerView(s, 'p1')?.me.buffs?.slots ?? [];
    expect(slots.find((slot) => slot.kind === 'double')).toEqual({ kind: 'double', state: 'used', block: 'used' });
    expect(slots.find((slot) => slot.kind === 'shield')).toEqual({ kind: 'shield', state: 'blocked', block: 'off_blitz' });
  });
});
