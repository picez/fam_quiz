import { describe, expect, it } from 'vitest';
import type { Answer, ThinkWord } from '@quiz/shared';
import { buffBlock } from './buffs';
import { shopBlock } from './debuffs';
import { lock, next, override, recordOf, start, submitAnswer, tick, type GameState } from './game';
import { hostLive } from './live';
import { perkBlock } from './perks';
import { setThinkWords, thinkPlayOf, thinkVerdicts } from './think';
import { classicRound, makeRoundsQuiz, single, think, thinkRound } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

// «Думай інакше» (35): відкриття, одне слово, слова ведучого, розкриття, м'які вердикти, ручна оцінка.

const t0 = 1_000_000;
const rng0 = () => 0;
const w = (word: string, ...synonyms: string[]): ThinkWord => ({ word, synonyms });
const red = w('червоний');
const blue = w('синій');
const green = w('зелений');
const say = (value: string): Answer => ({ type: 'think', value });
const play = (s: GameState) => s.plays[s.questionIndex];
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;

/** r1 класика (ніхто не відповідає), r2 «Думай інакше»: t1 [червоний, синій], t2 [], t3 [зелений]. Олена p1, Тарас p2, Віра p3, Хосе p4. */
function lobby(): GameState {
  const quiz = makeRoundsQuiz([classicRound('r1', [single]), thinkRound('r2', [think('t1', [red, blue]), think('t2', []), think('t3', [green])])], { leaderboard: 'end', buffs: ['double'], debuffs: ['fog'] });
  return lobbyWith(quiz, 'Олена', 'Тарас', 'Віра', 'Хосе');
}

/** Перше запитання r2, відкрите о t0; autopilot — та сама гра без ведучого (автор поза грою, лише позначка). */
function opened(autopilot = false): GameState {
  let s = must(start(lobby()));
  s = must(next(s, 0, rng0));
  s = must(next(must(lock(s)), 1000, rng0));
  s = must(next(s, 2000, rng0));
  expect(s.phase).toBe('round_end');
  s = must(next(s, 3000, rng0));
  expect(s.phase).toBe('intro');
  if (autopilot) s = { ...s, autopilot: { authorId: 'author', at: null } };
  s = must(next(s, t0, rng0));
  expect(play(s).question.id).toBe('t1');
  return s;
}

const at = (s: GameState, ms: number) => (s.startedAt ?? 0) + ms;

/** Відповіді за id; '' — мовчить. */
function answerAll(s: GameState, values: Record<string, string>): GameState {
  let out = s;
  for (const [id, value] of Object.entries(values)) if (value !== '') out = must(submitAnswer(out, id, say(value), at(out, 1000)));
  return out;
}

/** Таймер сплив: tick після endsAt. */
const expire = (s: GameState) => tick(s, (s.endsAt ?? 0) + 1, rng0);

/** t1 розкрито: Олена «Червона», Тарас «зелений», Віра мовчить, Хосе «Синя». */
function revealedT1(): GameState {
  const s = expire(answerAll(opened(), { p1: 'Червона', p2: 'зелений', p4: 'Синя' }));
  expect(s.phase).toBe('locked');
  return must(next(s, at(s, 40_000), rng0));
}

describe('think round flow (35)', () => {
  it("the first question gives everyone the round's lives", () => {
    const s = opened();
    expect(play(s).think).toEqual({ words: [red, blue], lives: { p1: 3, p2: 3, p3: 3, p4: 3 }, revealed: false });
    expect(s.endsAt).toBe((s.startedAt ?? 0) + 30_000);
    expect(s.presented).toEqual([]);
  });

  it('one word per player, refused for the wrong type, too long and empty', () => {
    const s0 = opened();
    const s = must(submitAnswer(s0, 'p1', say('  Зелений '), at(s0, 1000)));
    expect(recordOf(s, s.questionIndex, 'p1')).toMatchObject({ answer: { type: 'think', value: 'Зелений' }, points: 0, basePoints: 0, streakBonus: 0 });
    expect(submitAnswer(s, 'p1', say('синій'), at(s, 2000))).toEqual({ ok: false, error: 'already_answered' });
    const refusals: [Answer, string][] = [
      [{ type: 'text', value: 'зелений' }, 'type_mismatch'],
      [say('я'.repeat(41)), 'think_word'],
      [say('   '), 'think_word'],
    ];
    for (const [answer, error] of refusals) {
      const result = submitAnswer(s, 'p2', answer, at(s, 2000));
      expect(result).toEqual({ ok: false, error });
    }
    // Відмова стану не міняє.
    expect(recordOf(s, s.questionIndex, 'p2')).toBeUndefined();
  });

  it('with a host everyone answering does not close the question', () => {
    const s = answerAll(opened(), { p1: 'жовтий', p2: 'зелений', p3: 'блакитний', p4: 'фіолетовий' });
    expect(s.phase).toBe('question');
    expect(expire(s).phase).toBe('locked');
  });

  it('in autopilot everyone answering closes it', () => {
    const s = answerAll(opened(true), { p1: 'жовтий', p2: 'зелений', p3: 'блакитний' });
    expect(s.phase).toBe('question');
    expect(answerAll(s, { p4: 'фіолетовий' }).phase).toBe('locked');
  });

  it('the host edits words only while the timer runs, once after it if empty', () => {
    // t1 на question: будь-який список, той самий — без змін.
    const s1 = opened();
    const violet = must(setThinkWords(s1, [w('фіолетовий')], t0));
    expect(play(violet).think?.words).toEqual([w('фіолетовий')]);
    expect(must(setThinkWords(violet, [w(' фіолетовий ')], t0))).toBe(violet);
    expect(setThinkWords(s1, [red, blue, green, w('жовтий')], t0)).toEqual({ ok: false, error: 'think_word' });
    expect(setThinkWords(s1, [red, w('Червона')], t0)).toEqual({ ok: false, error: 'think_word' });
    expect(setThinkWords(s1, [w('я'.repeat(41))], t0)).toEqual({ ok: false, error: 'think_word' });
    expect(setThinkWords(s1, [w('червоний', 'a', 'b', 'c', 'd', 'e', 'f')], t0)).toEqual({ ok: false, error: 'think_word' });
    // Порожні синоніми відкидаються.
    expect(play(must(setThinkWords(s1, [w('червоний', ' ', 'багряний')], t0))).think?.words).toEqual([w('червоний', 'багряний')]);
    // t1 на locked зі словами — зафіксовано.
    const locked1 = expire(s1);
    expect(setThinkWords(locked1, [green], t0)).toEqual({ ok: false, error: 'think_words_closed' });
    // t2 без слів після таймера: порожній — ні, непорожній — раз.
    const revealed1 = must(next(locked1, at(locked1, 40_000), rng0));
    const s2 = must(next(revealed1, at(revealed1, 50_000), rng0));
    expect(play(s2).question.id).toBe('t2');
    const locked2 = expire(s2);
    expect(setThinkWords(locked2, [], t0)).toEqual({ ok: false, error: 'think_words_closed' });
    const cat = must(setThinkWords(locked2, [w('кіт')], t0));
    expect(play(cat).think?.words).toEqual([w('кіт')]);
    expect(setThinkWords(cat, [w('пес')], t0)).toEqual({ ok: false, error: 'think_words_closed' });
    // На reveal — зафіксовано; поза think — wrong_phase.
    expect(setThinkWords(revealed1, [green], t0)).toEqual({ ok: false, error: 'think_words_closed' });
    const classic = must(next(must(start(lobby())), 0, rng0));
    expect(setThinkWords(classic, [green], t0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('reveal waits for a word with a host, not in autopilot', () => {
    const toT2Locked = (autopilot: boolean) => {
      const s1 = expire(opened(autopilot));
      const r1 = must(next(s1, at(s1, 40_000), rng0));
      const s2 = must(next(r1, at(r1, 50_000), rng0));
      expect(play(s2).question.id).toBe('t2');
      return expire(s2);
    };
    const hosted = toT2Locked(false);
    expect(next(hosted, t0 + 100_000, rng0)).toEqual({ ok: false, error: 'think_no_words' });
    const shown = must(next(must(setThinkWords(hosted, [w('кіт')], t0)), t0 + 100_000, rng0));
    expect(shown.phase).toBe('reveal');
    expect(play(shown).think?.revealed).toBe(true);
    const piloted = must(next(toT2Locked(true), t0 + 100_000, rng0));
    expect(piloted.phase).toBe('reveal');
    expect(play(piloted).think?.revealed).toBe(true);
  });

  it('verdicts on reveal', () => {
    const s = revealedT1();
    expect(thinkVerdicts(s, s.questionIndex)).toEqual({ p1: 'hit', p2: 'safe', p3: 'empty', p4: 'hit' });
    expect(recordOf(s, s.questionIndex, 'p1')).toMatchObject({ grade: 'wrong', points: 0 });
    expect(recordOf(s, s.questionIndex, 'p2')).toMatchObject({ grade: 'correct', points: 0 });
    expect(recordOf(s, s.questionIndex, 'p4')).toMatchObject({ grade: 'wrong', points: 0 });
    for (const id of ['p1', 'p2', 'p3', 'p4']) expect(score(s, id)).toBe(0);
  });

  it('a host override sticks', () => {
    const s = revealedT1();
    const safe = must(override(s, 'p1', 'correct'));
    expect(thinkVerdicts(safe, s.questionIndex).p1).toBe('safe');
    expect(recordOf(safe, s.questionIndex, 'p1')).toMatchObject({ grade: 'correct', overridden: true, points: 0 });
    const hit = must(override(safe, 'p2', 'wrong'));
    expect(thinkVerdicts(hit, s.questionIndex)).toEqual({ p1: 'safe', p2: 'hit', p3: 'empty', p4: 'hit' });
    expect(override(hit, 'p3', 'correct')).toEqual({ ok: false, error: 'not_found' });
    expect(override(hit, 'p4', 'partial')).toEqual({ ok: false, error: 'partial_disabled' });
    const s1 = opened();
    const answered = answerAll(s1, { p1: 'червоний' });
    expect(override(answered, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(override(expire(answered), 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
    // Наступне запитання: минуле вже не оцінюється, а його вердикти ті самі.
    const later = must(next(hit, at(hit, 60_000), rng0));
    expect(play(later).question.id).toBe('t2');
    expect(override(later, 'p1', 'wrong')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(thinkVerdicts(later, s.questionIndex)).toEqual({ p1: 'safe', p2: 'hit', p3: 'empty', p4: 'hit' });
  });

  it('live host rows show the match before reveal', () => {
    const s = answerAll(opened(), { p1: 'Червона', p2: 'зелений' });
    const verdicts = (state: GameState) => Object.fromEntries((hostLive(state)?.rows ?? []).map((r) => [r.id, r.verdict]));
    expect(verdicts(s)).toEqual({ p1: 'wrong', p2: 'correct', p3: null, p4: null });
    expect(verdicts(must(setThinkWords(s, [green], t0)))).toEqual({ p1: 'correct', p2: 'wrong', p3: null, p4: null });
  });

  it('no speed, no streak, no buffs, no shop', () => {
    const s0 = opened();
    const s = must(submitAnswer(must(submitAnswer(s0, 'p1', say('жовтий'), at(s0, 100))), 'p2', say('блакитний'), at(s0, 29_000)));
    expect(recordOf(s, s.questionIndex, 'p1')?.points).toBe(0);
    expect(recordOf(s, s.questionIndex, 'p2')?.points).toBe(0);
    expect(buffBlock(s0, 'p3', 'double')).toBe('off_think');
    expect(shopBlock(s0, 'p3')).toBe('phase');
    expect(shopBlock(revealedT1(), 'p3')).toBe('phase');
    // Бонус рівня (15a): у раунді без бафів його немає де натиснути.
    expect(perkBlock(s0, 'p3', 'hint')).toBe('elsewhere');
    expect(thinkPlayOf(s0)?.think.lives.p3).toBe(3);
    // Серій немає: streak лишається 0.
    expect(revealedT1().players.every((p) => p.streak === 0)).toBe(true);
  });
});
