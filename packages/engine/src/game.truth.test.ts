import { describe, expect, it } from 'vitest';
import type { Answer, QuizSettings } from '@quiz/shared';
import { seededRng } from './bluff';
import { buffBlock } from './buffs';
import { shopBlock } from './debuffs';
import { endRound, lock, next, override, recordOf, removePlayer, shuffle, start, submitAnswer, tick, type GameState } from './game';
import { addLatePlayer } from './saved';
import { hideTruth, submitTruth, truthGuessers, truthOpen, truthPlayOf } from './truth';
import { undoPanel, undoScore } from './undo';
import { classicRound, makeRoundsQuiz, single, truthRound, withId } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

// «Правда про гравця» (28b): роздача, запитання-факт, вгадування, частка автора, пропуск, вилучення.

const t0 = 1_000_000;
const rng0 = () => 0;
const deal = () => seededRng(7);
const FACTS: Record<string, string> = { p1: 'Я стрибала з парашутом', p2: 'Я знаю шість мов', p3: 'Я бачила північне сяйво' };
const pick = (optionId: string): Answer => ({ type: 'single', optionId });
const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.score;
const play = (s: GameState) => s.plays[s.questionIndex];
const authorOf = (s: GameState) => play(s).truth?.authorId ?? '';

/** r1 класика (ніхто не відповідає), r2 «Правда про гравця» (300, 30 с), r3 класика; рейтинг типово лише в кінці. Олена p1, Тарас p2, Віра p3, Хосе p4 (без факту). */
function lobby(settings: Partial<QuizSettings> = {}, facts: Record<string, string> = FACTS): GameState {
  const quiz = makeRoundsQuiz([classicRound('r1', [single]), truthRound('r2'), classicRound('r3', [withId(single, 'q3')])], { leaderboard: 'end', ...settings });
  let s = lobbyWith(quiz, 'Олена', 'Тарас', 'Віра', 'Хосе');
  for (const [id, text] of Object.entries(facts)) s = must(submitTruth(s, id, text, 0));
  return s;
}

/** Заставка r2. */
function toIntro(lobbyState: GameState): GameState {
  let s = must(start(lobbyState));
  s = must(next(s, 0, rng0));
  s = must(next(must(lock(s)), 1000, rng0));
  s = must(next(s, 2000, rng0));
  expect(s.phase).toBe('round_end');
  s = must(next(s, 3000, rng0));
  expect(s.phase).toBe('intro');
  expect(s.roundIndex).toBe(1);
  return s;
}

/** Перше запитання r2, відкрите о t0. */
const opened = (lobbyState: GameState = lobby()) => must(next(toIntro(lobbyState), t0, deal()));

/** Ті, хто вгадує (усі, крім автора), у порядку гравців. */
const guessersOf = (s: GameState) => s.players.map((p) => p.id).filter((id) => id !== authorOf(s));
/** Чуже ім'я — не автор (може бути й своє: це просто помилка). */
const missOf = (s: GameState) => ['p1', 'p2', 'p3', 'p4'].find((id) => id !== authorOf(s)) ?? '';

describe('player truth round (28b)', () => {
  it('the deal shuffles the visible facts with the room rng', () => {
    const intro = toIntro(lobby());
    const s = must(next(intro, t0, deal()));
    const deck = s.truth?.deck ?? [];
    expect([...deck].sort()).toEqual(['p1', 'p2', 'p3']);
    expect(deck).toEqual(shuffle(['p1', 'p2', 'p3'], deal()));
    // той самий rng — та сама колода
    expect(must(next(intro, t0, deal())).truth?.deck).toEqual(deck);
    // до роздачі колоди немає
    expect(intro.truth?.deck).toBeUndefined();
    // сховане й вилучене не входять
    const hidden = must(next(must(hideTruth(intro, 'p2', true)), t0, deal()));
    expect([...(hidden.truth?.deck ?? [])].sort()).toEqual(['p1', 'p3']);
    const removed = must(next(must(removePlayer(intro, 'p3')), t0, deal()));
    expect([...(removed.truth?.deck ?? [])].sort()).toEqual(['p1', 'p2']);
    // після роздачі факти не приймаються
    expect(submitTruth(s, 'p4', 'Я грав у шахи з гросмейстером', t0)).toEqual({ ok: false, error: 'truth_closed' });
  });

  it('a question is the fact with every name as an option', () => {
    const s = opened();
    const deck = s.truth?.deck ?? [];
    expect(s.phase).toBe('question');
    expect(play(s).question).toEqual({
      id: 'truth-0',
      type: 'single',
      text: FACTS[deck[0]],
      options: [
        { id: 'p3', text: 'Віра' },
        { id: 'p1', text: 'Олена' },
        { id: 'p2', text: 'Тарас' },
        { id: 'p4', text: 'Хосе' },
      ],
      correctId: deck[0],
      points: 300,
      timeLimit: 30,
      imageUrl: null,
      video: null,
    });
    expect(s.presented).toEqual(['p3', 'p1', 'p2', 'p4']);
    expect(s.endsAt).toBe((s.startedAt ?? 0) + 30_000);
    expect(play(s).truth).toEqual({ authorId: deck[0], actorId: deck[0], guessers: guessersOf(s) });
    expect(truthPlayOf(s)?.truth.authorId).toBe(deck[0]);
    expect(truthGuessers(s)).toEqual(guessersOf(s));
  });

  it('the author cannot guess', () => {
    const s = opened();
    expect(submitAnswer(s, authorOf(s), pick('p4'), t0 + 1000)).toEqual({ ok: false, error: 'truth_own' });
    expect(submitAnswer(s, 'p4', pick('p9'), t0 + 1000)).toEqual({ ok: false, error: 'not_found' });
    // Хосе без факту вгадує як усі; можна вибрати й себе — це просто помилка
    const answered = must(submitAnswer(s, 'p4', pick('p4'), t0 + 1000));
    expect(recordOf(answered, answered.questionIndex, 'p4')?.grade).toBe('wrong');
  });

  it('everyone but the author closes the question', () => {
    let s = opened();
    const [g1, g2, g3] = guessersOf(s);
    s = must(submitAnswer(s, g1, pick('p4'), t0 + 1000));
    s = must(submitAnswer(s, g2, pick('p4'), t0 + 1000));
    expect(s.phase).toBe('question');
    s = must(submitAnswer(s, g3, pick('p4'), t0 + 1000));
    expect(s.phase).toBe('locked');
  });

  it('the author earns a share for everyone who missed', () => {
    const base = opened();
    const author = authorOf(base);
    const [g1, g2, g3] = guessersOf(base);
    const miss = missOf(base);
    // 1 з 3 вгадав
    let s = must(submitAnswer(base, g1, pick(author), t0 + 1000));
    s = must(submitAnswer(s, g2, pick(miss), t0 + 2000));
    s = must(submitAnswer(s, g3, pick(miss), t0 + 3000));
    expect(s.phase).toBe('locked');
    expect(recordOf(s, s.questionIndex, g1)?.points).toBe(300);
    expect(recordOf(s, s.questionIndex, g2)?.points).toBe(0);
    expect(recordOf(s, s.questionIndex, author)).toEqual({
      answer: null,
      timeMs: 30_000,
      accepted: true,
      accuracy: 200 / 300,
      grade: 'partial',
      basePoints: 200,
      streakBonus: 0,
      points: 200,
      overridden: false,
    });
    expect(score(s, author)).toBe(200);
    expect(score(s, g1)).toBe(300);
    // ніхто не вгадав (двоє мовчать) — повна ціна
    const none = must(lock(must(submitAnswer(base, g1, pick(miss), t0 + 1000))));
    expect(recordOf(none, none.questionIndex, author)).toMatchObject({ grade: 'correct', points: 300, accuracy: 1, accepted: true, timeMs: 30_000 });
    // усі вгадали — 0
    let all = base;
    for (const id of [g1, g2, g3]) all = must(submitAnswer(all, id, pick(author), t0 + 1000));
    expect(recordOf(all, all.questionIndex, author)).toMatchObject({ grade: 'wrong', points: 0, accuracy: 0, accepted: false });
    expect(score(all, author)).toBe(0);
    // поки запитання відкрите, запису автора немає
    expect(recordOf(must(submitAnswer(base, g1, pick(author), t0 + 1000)), base.questionIndex, author)).toBeUndefined();
  });

  it("a host override moves the author's share", () => {
    const base = opened();
    const author = authorOf(base);
    const [g1, g2] = guessersOf(base);
    let s = must(submitAnswer(base, g1, pick(author), t0 + 1000));
    s = must(submitAnswer(s, g2, pick(missOf(base)), t0 + 1000));
    s = must(next(must(lock(s)), t0 + 31_000, rng0));
    expect(s.phase).toBe('reveal');
    expect(recordOf(s, s.questionIndex, author)?.points).toBe(200);
    const fixed = must(override(s, g2, 'correct'));
    expect(recordOf(fixed, fixed.questionIndex, g2)?.points).toBe(300);
    expect(recordOf(fixed, fixed.questionIndex, author)?.points).toBe(100);
    expect(score(fixed, author)).toBe(100);
    // і назад
    expect(recordOf(must(override(fixed, g2, 'wrong')), fixed.questionIndex, author)?.points).toBe(200);
    // запис автора ведучий не оцінює
    expect(override(s, author, 'correct')).toEqual({ ok: false, error: 'not_allowed' });
    expect(override(s, author, 'wrong')).toEqual({ ok: false, error: 'not_allowed' });
  });

  it("the author's share cannot be undone: truth answers are not undoable (UNDOABLE_ROUNDS), so a fixed undo cannot drift from the recalculated share", () => {
    const base = opened();
    const author = authorOf(base);
    const [g1, g2] = guessersOf(base);
    let s = must(submitAnswer(base, g1, pick(author), t0 + 1000));
    s = must(submitAnswer(s, g2, pick(missOf(base)), t0 + 1000));
    s = must(next(must(lock(s)), t0 + 31_000, rng0));
    const q = s.questionIndex;
    expect(recordOf(s, q, author)?.points).toBe(200);
    // наступне запитання: попереднє вже видно в панелі скасування
    s = must(next(s, t0 + 32_000, rng0));
    expect(s.questionIndex).toBe(q + 1);
    expect(undoScore(s, { question: q, playerId: author }, t0 + 33_000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(undoScore(s, { question: q, playerId: g1 }, t0 + 33_000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(undoScore(s, { question: q }, t0 + 33_000)).toEqual({ ok: false, error: 'not_allowed' });
    const rows = undoPanel(s)?.rounds.flatMap((r) => r.questions.filter((x) => x.index === q).flatMap((x) => x.rows)) ?? [];
    expect(rows).toEqual([]);
  });

  it('no speed, no streak, no buffs', () => {
    const base = opened(lobby({ buffs: ['double'], debuffs: ['fog'] }));
    const author = authorOf(base);
    const [g1, g2] = guessersOf(base);
    let s = must(submitAnswer(base, g1, pick(author), t0 + 100));
    s = must(submitAnswer(s, g2, pick(author), t0 + 29_000));
    expect(recordOf(s, s.questionIndex, g1)?.points).toBe(300);
    expect(recordOf(s, s.questionIndex, g2)?.points).toBe(300);
    expect(buffBlock(base, g1, 'double')).toBe('off_truth');
    expect(shopBlock(base, g1)).toBe('phase');
    expect(shopBlock(toIntro(lobby({ debuffs: ['fog'] })), 'p1')).toBe('phase');
    // серій немає: дві правильні поспіль без бонусу
    let walk = must(lock(s));
    walk = must(next(must(next(walk, t0 + 31_000, rng0)), t0 + 32_000, rng0));
    const g = guessersOf(walk).includes(g1) ? g1 : g2;
    walk = must(lock(must(submitAnswer(walk, g, pick(authorOf(walk)), t0 + 33_000))));
    expect(recordOf(walk, walk.questionIndex, g)).toMatchObject({ points: 300, streakBonus: 0 });
  });

  it('the round walks fact by fact', () => {
    let s = opened();
    const ids: string[] = [];
    for (let k = 0; k < 3; k++) {
      expect(s.phase).toBe('question');
      ids.push(play(s).question.id);
      s = must(next(must(lock(s)), t0 + 40_000 * (k + 1), rng0));
      expect(s.phase).toBe('reveal');
      s = must(next(s, t0 + 40_000 * (k + 1) + 1000, rng0));
    }
    expect(ids).toEqual(['truth-0', 'truth-1', 'truth-2']);
    expect(s.phase).toBe('round_end');
    expect(s.plays.filter((p) => p.roundIndex === 1).map((p) => p.truth?.authorId)).toEqual(s.truth?.deck);
    // з рейтингом після кожного — через leaderboard
    let each = opened(lobby({ leaderboard: 'each' }));
    each = must(next(must(next(must(lock(each)), t0 + 1000, rng0)), t0 + 2000, rng0));
    expect(each.phase).toBe('leaderboard');
    each = must(next(each, t0 + 3000, rng0));
    expect(play(each).question.id).toBe('truth-1');
  });

  it('no facts skip the round', () => {
    const intro = toIntro(lobby({}, {}));
    const s = must(next(intro, t0, deal()));
    expect(s.phase).toBe('round_end');
    expect(s.roundIndex).toBe(1);
    expect(s.plays.filter((p) => p.roundIndex === 1)).toEqual([]);
    expect(s.truth?.deck).toEqual([]);
    // далі — наступний раунд
    expect(must(next(s, t0 + 1000, rng0)).roundIndex).toBe(2);
    // усі факти сховано — так само
    let hidden = toIntro(lobby());
    for (const id of ['p1', 'p2', 'p3']) hidden = must(hideTruth(hidden, id, true));
    expect(must(next(hidden, t0, deal())).phase).toBe('round_end');
  });

  it('a round ended before the deal closes the facts', () => {
    const intro = toIntro(lobby());
    const ended = must(endRound(intro, t0));
    expect(ended.phase).toBe('round_end');
    expect(truthOpen(ended)).toBe(false);
    expect(submitTruth(ended, 'p4', 'Я грав у шахи', t0)).toEqual({ ok: false, error: 'truth_closed' });
    expect(truthOpen(must(next(ended, t0 + 1000, rng0)))).toBe(false);
  });

  it('removal before the deal, after it and during a question', () => {
    // до роздачі
    const intro = toIntro(lobby());
    expect(must(next(must(removePlayer(intro, 'p2')), t0, deal())).truth?.deck).not.toContain('p2');
    // після роздачі: автор deck[1] не зіграється
    const first = opened();
    const deck = first.truth?.deck ?? [];
    let s = must(next(must(lock(first)), t0 + 31_000, rng0));
    s = must(removePlayer(s, deck[1]));
    s = must(next(s, t0 + 32_000, rng0));
    expect(play(s).question.id).toBe('truth-2');
    expect(play(s).truth?.authorId).toBe(deck[2]);
    const asked = play(s).question;
    expect(asked.type === 'single' ? asked.options.map((o) => o.id) : null).not.toContain(deck[1]);
    s = must(next(must(next(must(lock(s)), t0 + 70_000, rng0)), t0 + 71_000, rng0));
    expect(s.phase).toBe('round_end');
    // вилучений вгадувач на відкритому запитанні: autoLock без нього, знаменник 2
    const open = opened();
    const author = authorOf(open);
    const [g1, g2, g3] = guessersOf(open);
    let q = must(submitAnswer(open, g1, pick(author), t0 + 1000));
    q = must(submitAnswer(q, g2, pick(missOf(open)), t0 + 1000));
    q = must(removePlayer(q, g3));
    expect(q.phase).toBe('locked');
    expect(recordOf(q, q.questionIndex, author)?.points).toBe(150);
    // вилучення після закриття частки не міняє (підсумок заморожено)
    const after = must(removePlayer(q, g1));
    expect(recordOf(after, after.questionIndex, author)?.points).toBe(150);
    expect(score(after, author)).toBe(150);
    const afterMiss = must(removePlayer(q, g2));
    expect(recordOf(afterMiss, afterMiss.questionIndex, author)?.points).toBe(150);
    // вилучений автор на відкритому: закривається таймером, частки немає, інші — за правилами
    let gone = must(removePlayer(open, author));
    expect(gone.phase).toBe('question');
    gone = must(submitAnswer(gone, g1, pick(author), t0 + 1000));
    gone = tick(gone, t0 + 31_000, rng0);
    expect(gone.phase).toBe('locked');
    expect(recordOf(gone, gone.questionIndex, author)).toBeUndefined();
    expect(recordOf(gone, gone.questionIndex, g1)?.points).toBe(300);
    expect(score(gone, g1)).toBe(300);
  });

  it("a late name joins the next question's options", () => {
    let s = opened(lobby({ leaderboard: 'each' }));
    s = must(next(must(next(must(lock(s)), t0 + 1000, rng0)), t0 + 2000, rng0));
    expect(s.phase).toBe('leaderboard');
    s = must(addLatePlayer(s, { id: 'p9', nickname: 'Іра' }));
    s = must(next(s, t0 + 3000, rng0));
    const question = play(s).question;
    expect(question.id).toBe('truth-1');
    expect(question.type === 'single' && question.options).toContainEqual({ id: 'p9', text: 'Іра' });
    expect(play(s).truth?.guessers).toContain('p9');
  });
});
