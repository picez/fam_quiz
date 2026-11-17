import { describe, expect, it } from 'vitest';
import { BUFF_KINDS, DEFAULT_RULES, LIMITS, type Question, type RoundRules } from '@quiz/shared';
import { buffBlock } from './buffs';
import { setDebuff } from './debuffs';
import {
  end,
  endRound,
  lock,
  next,
  override,
  pause,
  recordOf,
  resume,
  setConnected,
  start,
  tick,
  type GameState,
  type Rng,
} from './game';
import { guessSpy, spyCast, spyCaught, spyPlayOf, voteSpy, writeSpyWord } from './spy';
import { classicRound, makeRoundsQuiz, single, spy, spy2, spyQuiz, thinkalike } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

/** Мить відкриття першого запитання. */
const T = 10_000;
const NAMES = ['Оля', 'Тарас', 'Петро', 'Ганна'];

/** rng, що завжди дає (i + 0.5) / 4: з чотирма учасниками шпигуном стає i-й (p1…p4). */
const rngPicking =
  (i: number): Rng =>
  () =>
    (i + 0.5) / 4;

/** Той самий rng з лічильником викликів. */
function counting(i: number): { rng: Rng; calls: () => number } {
  let n = 0;
  return {
    rng: () => {
      n++;
      return (i + 0.5) / 4;
    },
    calls: () => n,
  };
}

const ruled = (rules: Partial<RoundRules>, speedBonus = false, questions: Question[] = [spy, single]) =>
  makeRoundsQuiz([classicRound('c1', questions, { speedBonus, rules: { ...DEFAULT_RULES, ...rules } })]);

/** Оля p1, Тарас p2, Петро p3, Ганна p4; шпигун — Петро (rngPicking(2)); запитання spy відкрито о T. */
function open(quiz = spyQuiz(), names = NAMES, rng: Rng = rngPicking(2)): GameState {
  return startRound(lobbyWith(quiz, ...names), T, rng);
}

const word = (s: GameState, who: string, text: string, t = T + 1000) => must(writeSpyWord(s, who, text, t));
const vote = (s: GameState, who: string, target: string, t = T + 5000) => must(voteSpy(s, who, target, t));
const guess = (s: GameState, who: string, text: string, t = T + 6000) => must(guessSpy(s, who, text, t));
const stage = (s: GameState) => spyPlayOf(s)?.spy.stage;
const scores = (s: GameState) => Object.fromEntries(s.players.map((p) => [p.nickname, p.score]));

/** «Далі», доки не відкриється наступне запитання (розкриття, таблиця). */
function nextQuestionAt(s: GameState, t: number, rng: Rng): GameState {
  let current = must(next(s, t, rng));
  for (let guard = 0; guard < 5 && current.phase !== 'question'; guard++) current = must(next(current, t, rng));
  return current;
}

/** Усі четверо написали асоціації о T + 1000…4000: етап vote від T + 4000. */
function toVote(s = open()): GameState {
  s = word(s, 'p1', 'аромат', T + 1000);
  s = word(s, 'p2', 'ранок', T + 2000);
  s = word(s, 'p3', 'зелений', T + 3000);
  return word(s, 'p4', 'чашка', T + 4000);
}

/** Голоси за ids у порядку p1…p4 о T + 5000. */
function voteAll(s: GameState, targets: string[], t = T + 5000): GameState {
  return targets.reduce((acc, target, i) => vote(acc, `p${i + 1}`, target, t), s);
}

describe('spy (38): the spy', () => {
  it('the program picks the spy with the game rng', () => {
    const s = open();
    expect(spyPlayOf(s)?.spy).toEqual({ stage: 'words', spyId: 'p3', words: {}, votes: {}, guess: null });
    expect(spyPlayOf(open(spyQuiz(), NAMES, rngPicking(2)))?.spy.spyId).toBe('p3');
    expect(spyPlayOf(open(spyQuiz(), NAMES, rngPicking(0)))?.spy.spyId).toBe('p1');
    expect(spyPlayOf(open(spyQuiz(), NAMES, rngPicking(3)))?.spy.spyId).toBe('p4');
    // thinkalike перед spy rng не тягне; spy — один виклик.
    const counted = counting(1);
    let t = open(makeRoundsQuiz([classicRound('c1', [thinkalike, spy])]), NAMES, counted.rng);
    expect(counted.calls()).toBe(0);
    t = nextQuestionAt(must(lock(t)), T + 1000, counted.rng);
    expect(counted.calls()).toBe(1);
    expect(spyPlayOf(t)?.spy.spyId).toBe('p2');
  });

  it('too few players skip the spy', () => {
    // Двоє: обидва spy пропущено — раунд (тут єдиний) скінчився одразу, журнал порожній.
    const two = must(next(must(start(lobbyWith(spyQuiz(), 'Оля', 'Тарас'))), T, rngPicking(0)));
    expect(two.phase).toBe('finished');
    expect(two.plays).toEqual([]);
    // Троє, третій поза зв'язком: spy пропущено, відкрито single; він повернувся — next відкриває пропущене spy.
    let s = must(setConnected(lobbyWith(makeRoundsQuiz([classicRound('c1', [spy, single])]), 'Оля', 'Тарас', 'Петро'), 'p3', false, T - 1));
    s = startRound(s, T, rngPicking(0));
    expect(s.plays.map((p) => p.question.type)).toEqual(['single']);
    s = must(setConnected(s, 'p3', true, T + 1000));
    s = nextQuestionAt(must(lock(s)), T + 2000, rngPicking(0));
    expect(s.phase).toBe('question');
    expect(s.plays.map((p) => p.question.type)).toEqual(['single', 'spy']);
    // Командна гра (вікторина в обхід схеми): пропуск.
    const teams = must(next(teamGame(teamQuiz([classicRound('c1', [spy, single])], 3), [['Оля', 'Тарас'], ['Петро', 'Ганна'], ['Іра']]), T, rngPicking(0)));
    expect(teams.plays.map((p) => p.question.type)).toEqual(['single']);
  });

  it('the cast is the present players in the order of players', () => {
    const s = must(setConnected(open(), 'p2', false, T + 100));
    expect(spyCast(s).map((p) => p.id)).toEqual(['p1', 'p3', 'p4']);
  });
});

describe('spy (38): the stages', () => {
  it('words then vote then reveal', () => {
    let s = toVote();
    expect(stage(s)).toBe('vote');
    expect(s.phase).toBe('question');
    expect(s.startedAt).toBe(T + 4000);
    expect(s.endsAt).toBe(T + 4000 + 30_000);
    expect(spyPlayOf(s)?.spy.words).toEqual({
      p1: { text: 'аромат', at: T + 1000 },
      p2: { text: 'ранок', at: T + 2000 },
      p3: { text: 'зелений', at: T + 3000 },
      p4: { text: 'чашка', at: T + 4000 },
    });
    s = voteAll(s, ['p2', 'p1', 'p1', 'p1']);
    expect(s.phase).toBe('locked');
    expect(must(next(s, T + 6000)).phase).toBe('reveal');
  });

  it('the word timer and the vote timer', () => {
    const s = word(open(), 'p1', 'аромат');
    // Рівно на межі (T + 40 000) — ще words, і ще можна писати.
    expect(stage(tick(s, T + 40_000))).toBe('words');
    expect(writeSpyWord(s, 'p2', 'ранок', T + 40_000).ok).toBe(true);
    expect(writeSpyWord(s, 'p2', 'ранок', T + 40_001)).toEqual({ ok: false, error: 'time_over' });
    const v = tick(s, T + 45_000);
    expect(stage(v)).toBe('vote');
    expect(v.startedAt).toBe(T + 45_000);
    expect(v.endsAt).toBe(T + 75_000);
    expect(stage(tick(v, T + 75_000))).toBe('vote');
    expect(voteSpy(v, 'p2', 'p1', T + 75_000).ok).toBe(true);
    expect(tick(v, T + 75_001).phase).toBe('locked');
  });

  it('word rules', () => {
    let s = word(open(), 'p1', '  аромат   кави ', T + 1000);
    expect(spyPlayOf(s)?.spy.words.p1?.text).toBe('аромат кави');
    s = word(open(), 'p2', 'ранок');
    expect(writeSpyWord(s, 'p2', 'вечір', T + 2000)).toEqual({ ok: false, error: 'already_answered' });
    expect(writeSpyWord(s, 'p4', '!!!', T + 2000)).toEqual({ ok: false, error: 'think_word' });
    expect(writeSpyWord(s, 'p4', 'а'.repeat(LIMITS.thinkWord + 1), T + 2000)).toEqual({ ok: false, error: 'think_word' });
    expect(writeSpyWord(s, 'p1', 'Кава', T + 2000)).toEqual({ ok: false, error: 'spy_word' });
    expect(writeSpyWord(s, 'p1', 'кави', T + 2000)).toEqual({ ok: false, error: 'spy_word' });
    // Шпигун Петро бачить «чай»: «кава» йому можна, «чай» — ні.
    expect(writeSpyWord(s, 'p3', 'чай', T + 2000)).toEqual({ ok: false, error: 'spy_word' });
    expect(writeSpyWord(s, 'p3', 'кава', T + 2000).ok).toBe(true);
    expect(writeSpyWord(s, 'p9', 'ранок', T + 2000)).toEqual({ ok: false, error: 'not_found' });
    expect(voteSpy(s, 'p1', 'p2', T + 2000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(writeSpyWord(must(pause(s, T + 2000)), 'p4', 'чашка', T + 2500)).toEqual({ ok: false, error: 'paused' });
  });

  it('vote rules', () => {
    let s = toVote();
    expect(writeSpyWord(s, 'p1', 'кіт', T + 5000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(voteSpy(s, 'p1', 'p1', T + 5000)).toEqual({ ok: false, error: 'spy_self' });
    expect(voteSpy(s, 'p1', 'p9', T + 5000)).toEqual({ ok: false, error: 'not_found' });
    s = vote(s, 'p1', 'p3', T + 6000);
    expect(spyPlayOf(s)?.spy.votes.p1).toEqual({ target: 'p3', timeMs: 2000 });
    expect(voteSpy(s, 'p1', 'p2', T + 7000)).toEqual({ ok: false, error: 'already_answered' });
    expect(guessSpy(s, 'p3', 'кава', T + 7000)).toEqual({ ok: false, error: 'wrong_phase' });
    // Без асоціації — голосувати можна.
    let quiet = word(word(word(open(), 'p1', 'аромат'), 'p2', 'ранок'), 'p3', 'зелений');
    quiet = must(lock(quiet, T + 5000));
    expect(stage(quiet)).toBe('vote');
    expect(voteSpy(quiet, 'p4', 'p1', T + 6000).ok).toBe(true);
  });
});

describe('spy (38): scoring', () => {
  it('caught spy gives voters the price', () => {
    let s = voteAll(toVote(), ['p3', 'p3', 'p1', 'p3']);
    expect(spyCaught(s, 0)).toBe(true);
    expect(stage(s)).toBe('guess');
    expect(s.phase).toBe('question');
    expect(s.startedAt).toBe(T + 5000);
    expect(s.endsAt).toBe(T + 5000 + 30_000);
    expect(guessSpy(s, 'p1', 'кава', T + 6000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(guessSpy(s, 'p3', '...', T + 6000)).toEqual({ ok: false, error: 'think_word' });
    s = guess(s, 'p3', 'кава', T + 6000);
    expect(s.phase).toBe('locked');
    expect(scores(s)).toEqual({ Оля: 1000, Тарас: 1000, Петро: 500, Ганна: 1000 });
    expect(recordOf(s, 0, 'p3')?.answer).toEqual({ type: 'spy', word: 'зелений', vote: 'Оля', spy: true, caught: true, guess: 'кава', guessed: true });
    expect(recordOf(s, 0, 'p1')).toMatchObject({
      answer: { type: 'spy', word: 'аромат', vote: 'Петро', spy: false, caught: true, guess: null, guessed: false },
      grade: 'correct',
      points: 1000,
      timeMs: 1000,
    });
    expect(recordOf(s, 0, 'p3')?.grade).toBe('correct');
    expect(guessSpy(s, 'p3', 'кава', T + 7000)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a wrong or late guess', () => {
    const caught = () => voteAll(toVote(), ['p3', 'p3', 'p1', 'p3']);
    const wrong = guess(caught(), 'p3', 'молоко');
    expect(scores(wrong)).toEqual({ Оля: 1000, Тарас: 1000, Петро: 0, Ганна: 1000 });
    expect(recordOf(wrong, 0, 'p3')).toMatchObject({ grade: 'wrong', points: 0, answer: { guess: 'молоко', guessed: false } });
    // Без здогадки: рівно на межі ще guess, далі — закриття.
    expect(stage(tick(caught(), T + 35_000))).toBe('guess');
    const late = tick(caught(), T + 35_001);
    expect(late.phase).toBe('locked');
    expect(scores(late)).toEqual({ Оля: 1000, Тарас: 1000, Петро: 0, Ганна: 1000 });
    expect(guessSpy(caught(), 'p3', 'кава', T + 35_001)).toEqual({ ok: false, error: 'time_over' });
    // textAccepts: «кава» коротке — без допуску одруківки; «гітара» (6 літер) — одна описка з тією самою першою літерою.
    expect(scores(guess(caught(), 'p3', 'кавв')).Петро).toBe(0);
    const violin = () => voteAll(toVote(open(makeRoundsQuiz([classicRound('c1', [spy2])]))), ['p3', 'p3', 'p1', 'p3']);
    expect(scores(guess(violin(), 'p3', 'гітапа')).Петро).toBe(250);
    expect(scores(guess(violin(), 'p3', 'бітара')).Петро).toBe(0);
    expect(scores(guess(violin(), 'p3', 'Гітара')).Петро).toBe(250);
  });

  it('a tie at the top saves the spy', () => {
    const s = voteAll(toVote(), ['p3', 'p3', 'p1', 'p1']);
    expect(spyCaught(s, 0)).toBe(false);
    expect(s.phase).toBe('locked');
    expect(spyPlayOf(s)?.spy.stage).toBe('vote');
    expect(scores(s)).toEqual({ Оля: 0, Тарас: 0, Петро: 2000, Ганна: 0 });
    expect(recordOf(s, 0, 'p3')).toMatchObject({ grade: 'correct', answer: { spy: true, caught: false } });
    expect(recordOf(s, 0, 'p1')).toMatchObject({ grade: 'wrong', points: 0 });
  });

  it('nobody voted', () => {
    const s = tick(toVote(), T + 34_001);
    expect(s.phase).toBe('locked');
    expect(scores(s)).toEqual({ Оля: 0, Тарас: 0, Петро: 2000, Ганна: 0 });
    // Записи — усім, хто писав; без голосу — повний час голосування.
    expect(recordOf(s, 0, 'p1')).toMatchObject({ timeMs: 30_000, answer: { vote: null } });
  });

  it('the most votes on an innocent', () => {
    const s = voteAll(toVote(), ['p2', 'p1', 'p1', 'p1']);
    expect(s.phase).toBe('locked');
    expect(scores(s)).toEqual({ Оля: 0, Тарас: 0, Петро: 2000, Ганна: 0 });
  });

  it('the silent spy still gets a record', () => {
    let s = word(word(word(open(), 'p1', 'аромат'), 'p2', 'ранок'), 'p4', 'чашка');
    s = tick(s, T + 40_001);
    s = tick(s, T + 70_002);
    expect(s.phase).toBe('locked');
    expect(recordOf(s, 0, 'p3')).toMatchObject({ points: 2000, answer: { type: 'spy', word: null, vote: null, spy: true, caught: false } });
  });

  it('no speed, no minus, multiplier counts', () => {
    const quiz = ruled({ penalty: 'minus', multiplier: 2 }, true);
    const caught = voteAll(toVote(open(quiz)), ['p3', 'p3', 'p1', 'p3'], T + 5000);
    // Ганна голосує пізно — однаково.
    const late = vote(vote(vote(vote(toVote(open(quiz)), 'p1', 'p3', T + 5000), 'p2', 'p3', T + 6000), 'p3', 'p1', T + 7000), 'p4', 'p3', T + 33_000);
    expect(scores(guess(late, 'p3', 'молоко', T + 34_000))).toEqual({ Оля: 2000, Тарас: 2000, Петро: 0, Ганна: 2000 });
    expect(scores(guess(caught, 'p3', 'кава'))).toEqual({ Оля: 2000, Тарас: 2000, Петро: 1000, Ганна: 2000 });
    const hidden = voteAll(toVote(open(quiz)), ['p2', 'p1', 'p1', 'p1']);
    expect(scores(hidden)).toEqual({ Оля: 0, Тарас: 0, Петро: 4000, Ганна: 0 });
  });
});

describe('spy (38): the host and the end', () => {
  it('the host closes each stage', () => {
    const s = word(open(), 'p1', 'аромат');
    expect(lock(s)).toEqual({ ok: false, error: 'wrong_phase' });
    const v = must(lock(s, T + 2000));
    expect(stage(v)).toBe('vote');
    expect(v.endsAt).toBe(T + 32_000);
    // vote: викрито → guess; не викрито → locked.
    const caught = vote(vote(v, 'p1', 'p3', T + 3000), 'p2', 'p3', T + 3000);
    const g = must(lock(caught, T + 4000));
    expect(stage(g)).toBe('guess');
    expect(g.endsAt).toBe(T + 34_000);
    expect(must(lock(g, T + 5000)).phase).toBe('locked');
    expect(must(lock(vote(v, 'p1', 'p2', T + 3000), T + 4000)).phase).toBe('locked');
  });

  it('ending early', () => {
    const words = must(end(word(open(), 'p1', 'аромат')));
    expect(words.phase).toBe('finished');
    expect(words.plays[0].answers).toEqual({});
    expect(scores(words)).toEqual({ Оля: 0, Тарас: 0, Петро: 0, Ганна: 0 });
    const voted = vote(vote(vote(toVote(), 'p1', 'p3', T + 5000), 'p2', 'p3', T + 5000), 'p4', 'p3', T + 5000);
    expect(stage(voted)).toBe('vote');
    const ended = must(end(voted));
    expect(scores(ended)).toEqual({ Оля: 1000, Тарас: 1000, Петро: 0, Ганна: 1000 });
    expect(ended.plays[0].spy?.stage).toBe('vote');
    const round = must(endRound(voted, T + 6000));
    expect(scores(round)).toEqual({ Оля: 1000, Тарас: 1000, Петро: 0, Ганна: 1000 });
    expect(scores(must(endRound(word(open(), 'p1', 'аромат'), T + 2000)))).toEqual({ Оля: 0, Тарас: 0, Петро: 0, Ганна: 0 });
  });

  it('the spy offline when caught gets no last chance', () => {
    let s = vote(vote(toVote(), 'p1', 'p3', T + 5000), 'p2', 'p3', T + 5000);
    s = must(setConnected(s, 'p3', false, T + 5500));
    expect(stage(s)).toBe('vote');
    // Голосують усі присутні (Оля, Тарас, Ганна); Петро поза зв'язком — останнього шансу немає.
    s = vote(s, 'p4', 'p3', T + 6000);
    expect(s.phase).toBe('locked');
    expect(scores(s)).toEqual({ Оля: 1000, Тарас: 1000, Петро: 0, Ганна: 1000 });
  });

  it('override is refused', () => {
    const s = must(next(voteAll(toVote(), ['p2', 'p1', 'p1', 'p1']), T + 6000));
    expect(s.phase).toBe('reveal');
    expect(override(s, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('buffs and debuffs are off', () => {
    const quiz = makeRoundsQuiz([classicRound('c1', [spy, single])], { buffs: [...BUFF_KINDS], debuffs: ['fog'] });
    const s = open(quiz);
    for (const kind of BUFF_KINDS) expect([kind, buffBlock(s, 'p1', kind)]).toEqual([kind, 'off_spy']);
    expect(setDebuff(s, 'p1', 'fog')).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('a pause between stages', () => {
    let s = word(open(), 'p1', 'аромат');
    s = must(pause(s, T + 10_000));
    expect(s.remainingMs).toBe(30_000);
    s = must(resume(s, T + 20_000));
    expect(s.endsAt).toBe(T + 50_000);
    expect(stage(tick(s, T + 50_000))).toBe('words');
    expect(stage(tick(s, T + 50_001))).toBe('vote');
    // Ведучий перемикає на vote під час паузи: повний час голосування чекає продовження.
    let p = must(pause(s, T + 25_000));
    p = must(lock(p, T + 26_000));
    expect(stage(p)).toBe('vote');
    expect(p.paused).toBe(true);
    expect(p.remainingMs).toBe(30_000);
    p = must(resume(p, T + 30_000));
    expect(p.endsAt).toBe(T + 60_000);
    expect(p.startedAt).toBe(T + 30_000);
    expect(voteSpy(p, 'p1', 'p2', T + 31_000)).toMatchObject({ ok: true });
    expect(spyPlayOf(must(voteSpy(p, 'p1', 'p2', T + 31_000)))?.spy.votes.p1?.timeMs).toBe(1000);
  });
});
