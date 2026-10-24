import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Question } from '@quiz/shared';
import { adjustTime, limitMsOf } from './timing';
import { bluffPlayOf, seededRng, writeLie } from './bluff';
import { endRound, lock, pause, removePlayer, resume, setConnected, submitAnswer, tick, withCurrentPlay, type GameState, type Rng } from './game';
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
    const s = tick(open, open.endsAt!);
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
    expect(tick(s, s.endsAt!).plays[0].bluff?.stage).toBe('choice');
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
