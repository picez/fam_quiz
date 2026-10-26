import { describe, expect, it } from 'vitest';
import { BUFF_KINDS, DEFAULT_RULES, type Question, type RoundRules } from '@quiz/shared';
import { adjustTime, limitMsOf } from './timing';
import { nextDeadline } from './blitz';
import { bluffOrder, bluffPlayOf, bluffShown, pickBluff, removeBluffOption, revealBluffAll, seededRng, writeLie } from './bluff';
import { buffBlock, takeBuff } from './buffs';
import { setDebuff } from './debuffs';
import {
  end,
  endRound,
  lock,
  next,
  override,
  pause,
  recordOf,
  removePlayer,
  resume,
  setConnected,
  start,
  submitAnswer,
  tick,
  withCurrentPlay,
  type GameState,
  type Rng,
} from './game';
import { bluff, makeQuiz, single } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng: Rng = () => 0;
/** Мить відкриття першого запитання. */
const T = 10_000;
/** Мить ms після відкриття першого запитання (стан — для читабельності викликів). */
const at = (_s: GameState, ms: number) => T + ms;

/** Класика без бонусу швидкості; гравці Оля p1, Петро p2, Віра p3 (або інші); перше запитання відкрито о T. */
function openClassic(questions: Question[], nicknames: string[] = ['Оля', 'Петро', 'Віра'], random: Rng = rng): GameState {
  const quiz = makeQuiz(questions, { leaderboard: 'end', speedBonus: false, rules: { ...DEFAULT_RULES }, buffs: [] });
  return startRound(lobbyWith(quiz, ...nicknames), T, random);
}

/** Оля «Рим», Петро «РИМ», Віра «Мілан» — усі написали, почався вибір о T + 3000. */
function toChoice(): GameState {
  let s = openClassic([bluff, single]);
  s = must(writeLie(s, 'p1', 'Рим', at(s, 1000)));
  s = must(writeLie(s, 'p2', 'РИМ', at(s, 2000)));
  return must(writeLie(s, 'p3', 'Мілан', at(s, 3000)));
}

describe('bluff: the lies', () => {
  it('refuses a lie that is the truth in any spelling, keeps one lie per player', () => {
    let s = openClassic([bluff, single]);
    expect(writeLie(s, 'p2', ' барселоні ', at(s, 1000))).toEqual({ ok: false, error: 'bluff_truth' });
    s = must(writeLie(s, 'p1', '  Рим ', at(s, 1000)));
    expect(s.plays[0].bluff?.lies.p1).toEqual({ text: 'Рим', at: at(s, 1000) });
    expect(writeLie(s, 'p1', 'Мілан', at(s, 2000))).toEqual({ ok: false, error: 'already_answered' });
    expect(writeLie(s, 'p3', '   ', at(s, 2000))).toEqual({ ok: false, error: 'type_mismatch' });
    expect(s.plays[0].bluff?.stage).toBe('lies');
  });

  it('when everyone wrote, the choice starts: equal lies merge, spares fill up to five, ids b1…', () => {
    const s = toChoice();
    const b = s.plays[0].bluff!;
    expect(b.stage).toBe('choice');
    expect(b.options).toHaveLength(5);
    expect(b.options.map((o) => o.id)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5']);
    expect(b.options.find((o) => o.kind === 'lie' && o.text === 'Рим')?.authors).toEqual(['p1', 'p2']);
    expect(b.options.find((o) => o.kind === 'lie' && o.text === 'Мілан')?.authors).toEqual(['p3']);
    expect(b.options.filter((o) => o.kind === 'spare')).toHaveLength(2);
    expect(b.options.filter((o) => o.kind === 'spare').every((o) => o.authors.length === 0)).toBe(true);
    expect(b.options.find((o) => o.kind === 'truth')?.text).toBe('Барселона');
    expect(b.options.every((o) => !o.removed)).toBe(true);
    expect(s.startedAt).toBe(at(s, 3000));
    expect(s.endsAt).toBe(at(s, 3000) + 30_000);
  });

  it('the earliest of equal lies gives the option its text, authors in the order of players', () => {
    let s = openClassic([bluff, single]);
    s = must(writeLie(s, 'p2', 'РИМ', at(s, 1000)));
    s = must(writeLie(s, 'p1', 'Рим', at(s, 2000)));
    s = must(writeLie(s, 'p3', 'Мілан', at(s, 3000)));
    expect(s.plays[0].bluff?.options.find((o) => o.kind === 'lie' && o.authors.length === 2)).toMatchObject({ text: 'РИМ', authors: ['p1', 'p2'] });
  });

  it('the same seed gives the same spares and order', () => {
    const seeded = (value: number) => {
      const random: Rng = () => value;
      let s = openClassic([bluff, single], ['Оля', 'Петро', 'Віра'], random);
      s = must(writeLie(s, 'p1', 'Рим', at(s, 1000)));
      s = must(writeLie(s, 'p2', 'Париж', at(s, 2000)));
      return must(writeLie(s, 'p3', 'Мілан', at(s, 3000)));
    };
    const a = seeded(0.37);
    const b = seeded(0.37);
    expect(a.plays[0].bluff?.seed).toBe(Math.floor(0.37 * 2 ** 32));
    expect(a.plays[0].bluff?.options).toEqual(b.plays[0].bluff?.options);
    // генератор детермінований від зерна
    expect(seededRng(5)()).toBe(seededRng(5)());
    expect(seededRng(5)()).not.toBe(seededRng(6)());
  });

  it('a lie equal to a spare replaces that spare', () => {
    let s = openClassic([bluff, single]);
    s = must(writeLie(s, 'p1', 'лондон', at(s, 1000)));
    s = must(lock(s, at(s, 5000)));
    const options = s.plays[0].bluff!.options;
    expect(options).toHaveLength(4);
    expect(options.filter((o) => o.text.toLowerCase() === 'лондон')).toEqual([{ id: expect.any(String), text: 'лондон', kind: 'lie', authors: ['p1'], removed: false }]);
    expect(options.filter((o) => o.kind === 'spare').map((o) => o.text).sort()).toEqual(['Брюссель', 'Мадрид']);
  });

  it('no lies at all: truth and every spare', () => {
    const open = openClassic([bluff, single]);
    const s = tick(open, open.endsAt! + 1);
    const options = s.plays[0].bluff!.options;
    expect(s.plays[0].bluff?.stage).toBe('choice');
    expect(options).toHaveLength(4);
    expect(options.filter((o) => o.kind === 'truth')).toHaveLength(1);
    expect(options.filter((o) => o.kind === 'spare').map((o) => o.text).sort()).toEqual(['Брюссель', 'Лондон', 'Мадрид']);
  });

  it('many lies: no spares', () => {
    let s = openClassic([bluff, single], ['Оля', 'Петро', 'Віра', 'Іра', 'Богдан']);
    ['Рим', 'Мілан', 'Париж', 'Відень', 'Прага'].forEach((lie, index) => {
      s = must(writeLie(s, `p${index + 1}`, lie, at(s, 1000 + index)));
    });
    const options = s.plays[0].bluff!.options;
    expect(s.plays[0].bluff?.stage).toBe('choice');
    expect(options).toHaveLength(6);
    expect(options.some((o) => o.kind === 'spare')).toBe(false);
    expect(options.map((o) => o.id)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
  });

  it('the lie timer runs out: tick starts the choice from now', () => {
    let s = openClassic([bluff, single]);
    s = must(writeLie(s, 'p1', 'Рим', at(s, 1000)));
    const endsAt = s.endsAt!;
    expect(endsAt).toBe(at(s, 60_000));
    expect(tick(s, endsAt - 1).plays[0].bluff?.stage).toBe('lies');
    expect(tick(s, endsAt).plays[0].bluff?.stage).toBe('lies');
    s = tick(s, endsAt + 1);
    expect(s.phase).toBe('question');
    expect(s.plays[0].bluff?.stage).toBe('choice');
    expect(s.startedAt).toBe(endsAt + 1);
    expect(s.endsAt).toBe(endsAt + 1 + 30_000);
    // вибір закривається своїм таймером
    expect(tick(s, endsAt + 1 + 30_000).phase).toBe('locked');
  });

  it('host lock in the lies starts the choice; lock in the choice closes', () => {
    let s = openClassic([bluff, single]);
    s = must(lock(s, at(s, 5000)));
    expect(s.phase).toBe('question');
    expect(s.plays[0].bluff?.stage).toBe('choice');
    expect(s.endsAt).toBe(at(s, 5000) + 30_000);
    s = must(lock(s, at(s, 6000)));
    expect(s.phase).toBe('locked');
    expect(s.plays[0].bluff?.stage).toBe('choice');
  });

  it('lock without now in the lies is wrong_phase', () => {
    expect(lock(openClassic([bluff, single]))).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a player who leaves does not block the lies', () => {
    let s = openClassic([bluff, single]);
    s = must(writeLie(s, 'p1', 'Рим', at(s, 1000)));
    s = must(writeLie(s, 'p2', 'Мілан', at(s, 2000)));
    expect(s.plays[0].bluff?.stage).toBe('lies');
    s = must(setConnected(s, 'p3', false, at(s, 3000)));
    expect(s.plays[0].bluff?.stage).toBe('choice');
    expect(s.startedAt).toBe(at(s, 3000));
  });

  it('paused at the switch keeps the full choice time', () => {
    let s = openClassic([bluff, single]);
    s = must(pause(s, at(s, 5000)));
    s = must(lock(s, at(s, 6000)));
    expect(s.plays[0].bluff?.stage).toBe('choice');
    expect(s.paused).toBe(true);
    expect(s.remainingMs).toBe(30_000);
    expect(s.startedAt).toBeNull();
    expect(s.endsAt).toBeNull();
    s = must(resume(s, at(s, 10_000)));
    expect(s.endsAt).toBe(at(s, 10_000) + 30_000);
    expect(s.startedAt).toBe(at(s, 10_000));
  });

  it('limitMsOf follows the stage', () => {
    let s = openClassic([bluff, single]);
    expect(limitMsOf(s.plays[0])).toBe(60_000);
    // «+15 с» вигадок не переходять у вибір
    s = must(adjustTime(s, 15, at(s, 1000)));
    expect(limitMsOf(s.plays[0])).toBe(75_000);
    s = must(lock(s, at(s, 5000)));
    expect(limitMsOf(s.plays[0])).toBe(30_000);
    s = must(adjustTime(s, 15, at(s, 5000)));
    expect(limitMsOf(s.plays[0])).toBe(45_000);
    expect(s.endsAt).toBe(at(s, 5000) + 45_000);
  });

  it('the round ends during the lies: no records', () => {
    let s = openClassic([bluff, single]);
    s = must(writeLie(s, 'p1', 'Рим', at(s, 1000)));
    s = must(endRound(s, at(s, 5000)));
    expect(s.plays[0].answers).toEqual({});
    expect(s.players.map((p) => p.score)).toEqual([0, 0, 0]);
  });

  it('removePlayer drops the lie, the pick and the authorship', () => {
    const chosen = toChoice();
    const play = bluffPlayOf(chosen)!;
    const rome = play.bluff.options.find((o) => o.text === 'Рим')!;
    const picked = withCurrentPlay(chosen, { ...play, bluff: { ...play.bluff, picks: { p2: { optionId: rome.id, timeMs: 500 } } } });
    const s = must(removePlayer(picked, 'p2'));
    const b = s.plays[0].bluff!;
    expect(Object.keys(b.lies).sort()).toEqual(['p1', 'p3']);
    expect(b.picks).toEqual({});
    expect(b.options.find((o) => o.id === rome.id)?.authors).toEqual(['p1']);
    expect(b.options).toHaveLength(5);
  });

  it('kicking a player in the lies does not switch the stage by itself', () => {
    let s = openClassic([bluff, single]);
    s = must(writeLie(s, 'p1', 'Рим', at(s, 1000)));
    s = must(writeLie(s, 'p2', 'Мілан', at(s, 2000)));
    s = must(removePlayer(s, 'p3'));
    expect(s.plays[0].bluff?.stage).toBe('lies');
    expect(tick(s, s.endsAt! + 1).plays[0].bluff?.stage).toBe('choice');
  });

  it('submitAnswer refuses a bluff', () => {
    const s = openClassic([bluff, single]);
    expect(submitAnswer(s, 'p1', { type: 'text', value: 'Рим' }, at(s, 1000))).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('writeLie in the choice — wrong_phase; after the lie time — time_over', () => {
    const open = openClassic([bluff, single]);
    expect(writeLie(open, 'p1', 'Рим', open.endsAt! + 1)).toEqual({ ok: false, error: 'time_over' });
    expect(writeLie(open, 'p1', 'Рим', open.endsAt!).ok).toBe(true);
    const choice = must(lock(open, at(open, 5000)));
    expect(writeLie(choice, 'p1', 'Рим', at(open, 6000))).toEqual({ ok: false, error: 'wrong_phase' });
    expect(writeLie(openClassic([single, bluff]), 'p1', 'Рим', at(open, 1000))).toEqual({ ok: false, error: 'wrong_phase' });
    expect(writeLie(open, 'p9', 'Рим', at(open, 1000))).toEqual({ ok: false, error: 'not_found' });
    expect(writeLie(must(pause(open, at(open, 1000))), 'p1', 'Рим', at(open, 2000))).toEqual({ ok: false, error: 'paused' });
  });

  it('other questions draw no seed', () => {
    const s = openClassic([single, bluff]);
    expect(s.plays[0].bluff).toBeUndefined();
  });
});

type QuizOptions = NonNullable<Parameters<typeof makeQuiz>[1]>;

/** Класика з [bluff, single] (або questions), Оля p1, Петро p2, Віра p3; перше запитання відкрито о T. */
function openWith(options: QuizOptions = {}, questions: Question[] = [bluff, single]): GameState {
  const quiz = makeQuiz(questions, { leaderboard: 'end', speedBonus: false, rules: { ...DEFAULT_RULES }, buffs: [], ...options });
  return startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'), T, rng);
}

/** Правила класики: типові з переданими змінами. */
const rules = (changes: Partial<RoundRules>): RoundRules => ({ ...DEFAULT_RULES, ...changes });

/** Оля «Рим», Петро «РИМ», Віра «Мілан» — почався вибір о T + 3000. */
function writeAll(state: GameState): GameState {
  let s = must(writeLie(state, 'p1', 'Рим', at(state, 1000)));
  s = must(writeLie(s, 'p2', 'РИМ', at(s, 2000)));
  return must(writeLie(s, 'p3', 'Мілан', at(s, 3000)));
}

/** Id варіанта за текстом. */
function idOf(s: GameState, text: string): string {
  const option = s.plays[s.questionIndex].bluff?.options.find((o) => o.text === text);
  if (option === undefined) throw new Error(`no option ${text}`);
  return option.id;
}

/** Id запасних варіантів у порядку показу. */
function sparesOf(s: GameState): string[] {
  return (s.plays[s.questionIndex].bluff?.options ?? []).filter((o) => o.kind === 'spare').map((o) => o.id);
}

/** Оля — «Мілан», Петро — правду, Віра — «Рим»: усі вибрали, запитання закрито. */
function pickAll(s: GameState): GameState {
  let picked = must(pickBluff(s, 'p1', idOf(s, 'Мілан'), at(s, 4000)));
  picked = must(pickBluff(picked, 'p2', idOf(s, 'Барселона'), at(s, 5000)));
  return must(pickBluff(picked, 'p3', idOf(s, 'Рим'), at(s, 6000)));
}

describe('bluff: the choice and the points', () => {
  it('truth pays the price, each fooled player pays half the price to every author; no speed bonus', () => {
    let s = writeAll(openWith({ speedBonus: true }));
    s = must(pickBluff(s, 'p1', idOf(s, 'Мілан'), at(s, 4000)));
    s = must(pickBluff(s, 'p2', idOf(s, 'Барселона'), at(s, 5000)));
    s = must(pickBluff(s, 'p3', idOf(s, 'Рим'), at(s, 6000)));
    expect(s.phase).toBe('locked');
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 500, accepted: false, grade: 'wrong', answer: { type: 'bluff', lie: 'Рим', pick: 'Мілан', truth: false, fooled: 1 } });
    expect(recordOf(s, 0, 'p2')).toMatchObject({ points: 1500, accepted: true, grade: 'correct', accuracy: 1, answer: { lie: 'РИМ', pick: 'Барселона', truth: true, fooled: 1 } });
    expect(recordOf(s, 0, 'p3')).toMatchObject({ points: 500, accepted: false, accuracy: 0, answer: { lie: 'Мілан', pick: 'Рим', fooled: 1 } });
    expect(recordOf(s, 0, 'p1')?.timeMs).toBe(1000);
    expect(s.players.map((p) => p.score)).toEqual([500, 1500, 500]);
  });

  it('your own lie cannot be picked, merged too', () => {
    const s = writeAll(openWith());
    expect(pickBluff(s, 'p2', idOf(s, 'Рим'), at(s, 4000))).toEqual({ ok: false, error: 'bluff_own' });
    expect(pickBluff(s, 'p1', idOf(s, 'Рим'), at(s, 4000))).toEqual({ ok: false, error: 'bluff_own' });
    expect(pickBluff(s, 'p3', idOf(s, 'Мілан'), at(s, 4000))).toEqual({ ok: false, error: 'bluff_own' });
  });

  it('one pick only; unknown option — not_found; after the time — time_over; in the lies — wrong_phase', () => {
    const open = openWith();
    expect(pickBluff(open, 'p1', 'b1', at(open, 1000))).toEqual({ ok: false, error: 'wrong_phase' });
    const s = writeAll(open);
    const picked = must(pickBluff(s, 'p1', idOf(s, 'Мілан'), at(s, 4000)));
    expect(pickBluff(picked, 'p1', idOf(s, 'Барселона'), at(s, 5000))).toEqual({ ok: false, error: 'already_answered' });
    expect(pickBluff(s, 'p1', 'b9', at(s, 4000))).toEqual({ ok: false, error: 'not_found' });
    expect(pickBluff(s, 'p9', idOf(s, 'Мілан'), at(s, 4000))).toEqual({ ok: false, error: 'not_found' });
    expect(pickBluff(s, 'p1', idOf(s, 'Мілан'), s.endsAt! + 1)).toEqual({ ok: false, error: 'time_over' });
    expect(pickBluff(s, 'p1', idOf(s, 'Мілан'), s.endsAt!).ok).toBe(true);
    expect(pickBluff(must(pause(s, at(s, 4000))), 'p1', idOf(s, 'Мілан'), at(s, 5000))).toEqual({ ok: false, error: 'paused' });
    expect(pickBluff(must(lock(s, at(s, 4000))), 'p1', idOf(s, 'Мілан'), at(s, 5000))).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a player without a lie still picks; a player who did nothing gets no record', () => {
    let s = openWith();
    s = must(writeLie(s, 'p1', 'Рим', at(s, 1000)));
    s = must(writeLie(s, 'p2', 'Мілан', at(s, 2000)));
    s = must(lock(s, at(s, 3000)));
    const silent = must(lock(must(pickBluff(s, 'p1', idOf(s, 'Мілан'), at(s, 4000))), at(s, 5000)));
    expect(recordOf(silent, 0, 'p3')).toBeUndefined();
    expect(recordOf(silent, 0, 'p2')).toMatchObject({ points: 500, answer: { lie: 'Мілан', pick: null, truth: false, fooled: 1 } });
    expect(recordOf(silent, 0, 'p2')?.timeMs).toBe(30_000);
    const picker = must(lock(must(pickBluff(s, 'p3', idOf(s, 'Рим'), at(s, 4000))), at(s, 5000)));
    expect(recordOf(picker, 0, 'p3')).toMatchObject({ points: 0, grade: 'wrong', answer: { type: 'bluff', lie: null, pick: 'Рим', truth: false, fooled: 0 } });
    expect(recordOf(picker, 0, 'p1')).toMatchObject({ points: 500, answer: { fooled: 1 } });
  });

  it('a lie only, no pick: fooled points, no minus', () => {
    let s = openWith({ rules: rules({ penalty: 'minus' }) });
    s = must(writeLie(s, 'p1', 'Рим', at(s, 1000)));
    s = must(writeLie(s, 'p2', 'Мілан', at(s, 2000)));
    s = must(lock(s, at(s, 3000)));
    s = must(pickBluff(s, 'p3', idOf(s, 'Рим'), at(s, 4000)));
    s = must(lock(s, at(s, 5000)));
    expect(recordOf(s, 0, 'p1')?.points).toBe(500);
    expect(recordOf(s, 0, 'p2')?.points).toBe(0);
    // Віра вибрала вигадку й нікого не обдурила
    expect(recordOf(s, 0, 'p3')?.points).toBe(-1000);
  });

  it('the minus only for a picked lie that earned nothing', () => {
    let s = writeAll(openWith({ rules: rules({ penalty: 'minus' }) }));
    // Оля — запасну (на «Рим» ніхто не купився), Петро — «Мілан», Віра — правду
    s = must(pickBluff(s, 'p1', sparesOf(s)[0], at(s, 4000)));
    s = must(pickBluff(s, 'p2', idOf(s, 'Мілан'), at(s, 5000)));
    s = must(pickBluff(s, 'p3', idOf(s, 'Барселона'), at(s, 6000)));
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: -1000, grade: 'wrong' });
    expect(recordOf(s, 0, 'p2')).toMatchObject({ points: -1000, grade: 'wrong' });
    expect(recordOf(s, 0, 'p3')).toMatchObject({ points: 1500, grade: 'correct' });
    // вибрав вигадку, але обдурив одного — +500
    const fooling = pickAll(writeAll(openWith({ rules: rules({ penalty: 'minus' }) })));
    expect(recordOf(fooling, 0, 'p1')?.points).toBe(500);
    expect(recordOf(fooling, 0, 'p3')?.points).toBe(500);
  });

  it('the round multiplier applies to everything', () => {
    const s = pickAll(writeAll(openWith({ rules: rules({ multiplier: 2 }) })));
    expect(['p1', 'p2', 'p3'].map((id) => recordOf(s, 0, id)?.points)).toEqual([1000, 3000, 1000]);
    const minus = writeAll(openWith({ rules: rules({ multiplier: 3, penalty: 'minus' }) }));
    const locked = must(lock(must(pickBluff(minus, 'p1', sparesOf(minus)[0], at(minus, 4000))), at(minus, 5000)));
    expect(recordOf(locked, 0, 'p1')?.points).toBe(-3000);
  });

  it('spares have no authors: picking one fools nobody', () => {
    let s = writeAll(openWith());
    s = must(pickBluff(s, 'p1', sparesOf(s)[0], at(s, 4000)));
    s = must(pickBluff(s, 'p2', sparesOf(s)[1], at(s, 4000)));
    s = must(pickBluff(s, 'p3', sparesOf(s)[0], at(s, 4000)));
    expect(['p1', 'p2', 'p3'].map((id) => recordOf(s, 0, id)?.points)).toEqual([0, 0, 0]);
    expect(['p1', 'p2', 'p3'].map((id) => (recordOf(s, 0, id)?.answer as { fooled: number }).fooled)).toEqual([0, 0, 0]);
  });

  it('a lie whose only author left stays pickable and pays nobody', () => {
    let s = writeAll(openWith({ rules: rules({ penalty: 'minus' }) }));
    s = must(removePlayer(s, 'p3'));
    const milan = idOf(s, 'Мілан');
    expect(s.plays[0].bluff?.options.find((o) => o.id === milan)?.authors).toEqual([]);
    s = must(pickBluff(s, 'p1', milan, at(s, 4000)));
    s = must(pickBluff(s, 'p2', milan, at(s, 4000)));
    expect(s.phase).toBe('locked');
    expect(['p1', 'p2'].map((id) => recordOf(s, 0, id)?.points)).toEqual([-1000, -1000]);
    s = must(next(s, at(s, 5000), rng));
    // авторів немає, але це вигадка гравця: відкривається серед вигадок, правда остання
    const order = bluffOrder(bluffPlayOf(s)!);
    expect(order.map((o) => o.text).at(-2)).toBe('Мілан');
    expect(order.at(-1)?.kind).toBe('truth');
  });

  it('removeBluffOption hides a player lie, drops its picks and pays its authors nothing', () => {
    let s = writeAll(openWith());
    expect(removeBluffOption(openWith(), 'b1')).toEqual({ ok: false, error: 'wrong_phase' });
    const milan = idOf(s, 'Мілан');
    s = must(pickBluff(s, 'p1', milan, at(s, 4000)));
    s = must(removeBluffOption(s, milan));
    const b = s.plays[0].bluff!;
    expect(b.options.find((o) => o.id === milan)?.removed).toBe(true);
    expect(b.picks).toEqual({});
    expect(removeBluffOption(s, idOf(s, 'Барселона'))).toEqual({ ok: false, error: 'not_allowed' });
    expect(removeBluffOption(s, sparesOf(s)[0])).toEqual({ ok: false, error: 'not_allowed' });
    expect(removeBluffOption(s, 'b9')).toEqual({ ok: false, error: 'not_found' });
    expect(pickBluff(s, 'p2', milan, at(s, 5000))).toEqual({ ok: false, error: 'not_found' });
    // Оля вибирає знову
    s = must(pickBluff(s, 'p1', idOf(s, 'Барселона'), at(s, 5000)));
    s = must(pickBluff(s, 'p2', idOf(s, 'Барселона'), at(s, 5000)));
    s = must(pickBluff(s, 'p3', idOf(s, 'Рим'), at(s, 6000)));
    expect(s.phase).toBe('locked');
    expect(recordOf(s, 0, 'p3')).toMatchObject({ points: 0, answer: { lie: 'Мілан', fooled: 0 } });
    expect(recordOf(s, 0, 'p1')?.points).toBe(1500);
    expect(removeBluffOption(s, idOf(s, 'Рим'))).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('streak: the truth continues it, a lie breaks it', () => {
    let s = openWith({ rules: rules({ streak: { length: 2, bonus: { kind: 'fixed', value: 100 } } }) }, [single, bluff]);
    s = must(submitAnswer(s, 'p1', { type: 'single', optionId: 'b' }, at(s, 1000)));
    s = must(submitAnswer(s, 'p2', { type: 'single', optionId: 'b' }, at(s, 1000)));
    s = must(submitAnswer(s, 'p3', { type: 'single', optionId: 'b' }, at(s, 1000)));
    s = must(next(must(next(s, at(s, 2000), rng)), at(s, 3000), rng));
    expect(s.questionIndex).toBe(1);
    s = must(lock(s, at(s, 4000)));
    s = must(pickBluff(s, 'p1', idOf(s, 'Барселона'), at(s, 5000)));
    s = must(pickBluff(s, 'p2', sparesOf(s)[0], at(s, 5000)));
    s = must(lock(s, at(s, 6000)));
    expect(s.players.map((p) => p.streak)).toEqual([2, 0, 0]);
    expect(recordOf(s, 1, 'p1')).toMatchObject({ streakBonus: 100, points: 1100 });
  });

  it('override refuses a bluff', () => {
    const s = must(next(pickAll(writeAll(openWith())), at(openWith(), 7000), rng));
    expect(s.phase).toBe('reveal');
    expect(override(s, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('personal overtime of the lies does not reach the choice', () => {
    const open = openWith();
    const play = bluffPlayOf(open)!;
    const s = must(lock(withCurrentPlay(open, { ...play, overtime: { p1: 15_000 } }), at(open, 5000)));
    expect(s.plays[0].overtime).toBeUndefined();
  });
});

describe('bluff: buffs and debuffs', () => {
  it('buffs: double and shield fit; time, hint, swap, fifty, retry and audience are unfit_bluff', () => {
    const s = openWith();
    expect(buffBlock(s, 'p1', 'double')).toBeNull();
    expect(buffBlock(s, 'p1', 'shield')).toBe('unfit_penalty');
    expect(buffBlock(openWith({ rules: rules({ penalty: 'minus' }) }), 'p1', 'shield')).toBeNull();
    for (const kind of ['time', 'hint', 'swap', 'fifty', 'retry', 'audience'] as const) expect(buffBlock(s, 'p1', kind), kind).toBe('unfit_bluff');
  });

  it('a buff can be taken during the lies and until the pick', () => {
    let s = must(writeLie(openWith(), 'p1', 'Рим', at(openWith(), 1000)));
    expect(buffBlock(s, 'p1', 'double')).toBeNull();
    s = must(lock(s, at(s, 2000)));
    expect(buffBlock(s, 'p1', 'double')).toBeNull();
    s = must(pickBluff(s, 'p1', idOf(s, 'Барселона'), at(s, 3000)));
    expect(buffBlock(s, 'p1', 'double')).toBe('answered');
  });

  it('double doubles truth and fooled points; shield saves the minus', () => {
    let s = writeAll(openWith({ buffs: [...BUFF_KINDS], rules: rules({ penalty: 'minus' }) }));
    s = must(takeBuff(s, 'p2', 'double', at(s, 3500), rng));
    s = must(takeBuff(s, 'p1', 'shield', at(s, 3500), rng));
    // Петро — правду (на «Рим» купилася Віра), Оля — запасну, Віра — «Рим»
    s = must(pickBluff(s, 'p1', sparesOf(s)[0], at(s, 4000)));
    s = must(pickBluff(s, 'p2', idOf(s, 'Барселона'), at(s, 5000)));
    s = must(pickBluff(s, 'p3', idOf(s, 'Рим'), at(s, 6000)));
    expect(recordOf(s, 0, 'p2')).toMatchObject({ basePoints: 3000, points: 3000, buff: 'double' });
    // Оля — співавторка «Рим», на який купилася Віра: +500, щит не потрібен
    expect(recordOf(s, 0, 'p1')).toMatchObject({ points: 500, buff: 'shield' });
    let minus = writeAll(openWith({ buffs: [...BUFF_KINDS], rules: rules({ penalty: 'minus' }) }));
    minus = must(takeBuff(minus, 'p3', 'shield', at(minus, 3500), rng));
    minus = must(pickBluff(minus, 'p3', sparesOf(minus)[0], at(minus, 4000)));
    minus = must(pickBluff(minus, 'p1', sparesOf(minus)[0], at(minus, 4000)));
    minus = must(lock(minus, at(minus, 5000)));
    expect(recordOf(minus, 0, 'p3')).toMatchObject({ points: 0, buff: 'shield' });
    expect(recordOf(minus, 0, 'p1')?.points).toBe(-1000);
  });

  it('debuffs fire at the lies and last through the choice', () => {
    const quiz = makeQuiz([bluff, single], { leaderboard: 'end', speedBonus: false, rules: { ...DEFAULT_RULES }, buffs: [] });
    let s = must(setDebuff(must(start(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'))), 'p1', 'fog'));
    s = must(next(s, T, rng));
    expect(s.debuffs.p1).toMatchObject({ kind: 'fog', firedAt: 0 });
    s = writeAll(s);
    expect(s.plays[0].bluff?.stage).toBe('choice');
    expect(s.debuffs.p1).toMatchObject({ kind: 'fog', firedAt: 0 });
    s = pickAll(s);
    expect(s.phase).toBe('locked');
    expect(s.debuffs.p1).toBeUndefined();
  });
});

describe('bluff: the reveal', () => {
  it('reveal opens the least picked first, the truth last, then next goes on', () => {
    let s = pickAll(writeAll(openWith()));
    s = must(next(s, at(s, 7000), rng));
    expect(s.phase).toBe('reveal');
    expect(s.plays[0].bluff?.shown).toBe(0);
    expect(bluffShown(s, s.plays[0])).toBe(0);
    const play = bluffPlayOf(s)!;
    const shown = play.bluff.options;
    const spares = shown.filter((o) => o.kind === 'spare').map((o) => o.text);
    const picked = shown.filter((o) => o.text === 'Мілан' || o.text === 'Рим').map((o) => o.text);
    expect(bluffOrder(play).map((o) => o.text)).toEqual([...spares, ...picked, 'Барселона']);
    for (let step = 1; step <= 5; step += 1) {
      s = must(next(s, at(s, 7000 + step), rng));
      expect(s.phase).toBe('reveal');
      expect(s.plays[0].bluff?.shown).toBe(step);
    }
    s = must(next(s, at(s, 8000), rng));
    expect(s.phase).toBe('question');
    expect(s.questionIndex).toBe(1);
  });

  it('a removed lie is not revealed', () => {
    let s = writeAll(openWith());
    s = must(removeBluffOption(s, idOf(s, 'Мілан')));
    s = must(lock(s, at(s, 4000)));
    s = must(next(s, at(s, 5000), rng));
    expect(bluffOrder(bluffPlayOf(s)!).map((o) => o.text)).not.toContain('Мілан');
    for (let step = 1; step <= 4; step += 1) s = must(next(s, at(s, 5000 + step), rng));
    expect(s.plays[0].bluff?.shown).toBe(4);
    s = must(next(s, at(s, 6000), rng));
    expect(s.questionIndex).toBe(1);
  });

  it('revealBluffAll opens all; wrong_phase outside a bluff reveal', () => {
    let s = pickAll(writeAll(openWith()));
    expect(revealBluffAll(s)).toEqual({ ok: false, error: 'wrong_phase' });
    s = must(next(s, at(s, 7000), rng));
    s = must(revealBluffAll(s));
    expect(s.plays[0].bluff?.shown).toBe(5);
    expect(bluffShown(s, s.plays[0])).toBe(5);
    expect(revealBluffAll(must(pause(s, at(s, 8000))))).toEqual({ ok: false, error: 'paused' });
    s = must(next(s, at(s, 8000), rng));
    expect(s.questionIndex).toBe(1);
    expect(revealBluffAll(s)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('bluffShown is everything after the reveal', () => {
    let s = pickAll(writeAll(openWith()));
    expect(bluffShown(s, s.plays[0])).toBe(0);
    s = must(next(s, at(s, 7000), rng));
    s = must(next(s, at(s, 7001), rng));
    expect(bluffShown(s, s.plays[0])).toBe(1);
    s = must(end(s));
    expect(s.phase).toBe('finished');
    expect(bluffShown(s, s.plays[0])).toBe(5);
  });

  it('end during the choice scores the picks made so far', () => {
    let s = writeAll(openWith());
    s = must(pickBluff(s, 'p2', idOf(s, 'Барселона'), at(s, 4000)));
    s = must(pickBluff(s, 'p3', idOf(s, 'Рим'), at(s, 5000)));
    s = must(end(s));
    expect(s.phase).toBe('finished');
    expect(['p1', 'p2', 'p3'].map((id) => recordOf(s, 0, id)?.points)).toEqual([500, 1500, 0]);
    expect(s.players.map((p) => p.score)).toEqual([500, 1500, 0]);
  });
});

describe('bluff lies deadline (11g soak)', () => {
  it('nextDeadline of the lies stage is 1 ms after its end, where tick switches to the choice — a timer exactly on time does not stall', () => {
    const s = openClassic([bluff]);
    const ends = s.endsAt!;
    expect(nextDeadline(s, T)).toBe(ends + 1);
    expect(bluffPlayOf(tick(s, ends))?.bluff.stage).toBe('lies');
    const switched = tick(s, nextDeadline(s, T)!);
    expect(bluffPlayOf(switched)?.bluff.stage).toBe('choice');
    expect(nextDeadline(switched, ends + 1)).toBe(switched.endsAt);
  });
});
