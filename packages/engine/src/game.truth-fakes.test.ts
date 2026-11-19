import { describe, expect, it } from 'vitest';
import { LIMITS, type Answer, type Quiz } from '@quiz/shared';
import { createAutopilotGame } from './autopilot';
import { seededRng } from './bluff';
import { addPlayer, createGame, lock, next, recordOf, shuffle, start, submitAnswer, type GameState, type Play } from './game';
import { assignTeam } from './teams';
import { actAnswer } from './team-act';
import { hideTruth, setTruthFake, submitTruth, truthFaked, truthQuestion, truthSkipped } from './truth';
import { classicRound, makeRoundsQuiz, single, truthRound } from './testing/fixtures';
import { hostView, playerView, stageView } from './views';
import { lobbyWith, must } from './testing/helpers';
import { teamLobby, teamQuiz } from './testing/teams';

// «Правда про гравця» (52): вигадки ведучого — заготовлені в редакторі й додані в лобі; варіант «Вигадка» в кожному запитанні.

const t0 = 1_000_000;
const rng0 = () => 0;
const deal = () => seededRng(7);
const PRESET = 'Я тричі бачила північне сяйво';
const FACTS: Record<string, string> = {
  p1: 'Я стрибала з парашутом',
  p2: 'Я знаю шість мов',
  p3: 'Я виростив лимон на балконі',
  p4: 'Я грала в оркестрі',
};
const MADE_UP = { id: 'fake', text: 'Вигадка' };
const pick = (optionId: string): Answer => ({ type: 'single', optionId });
const play = (s: GameState) => s.plays[s.questionIndex];

/** r1 «Правда про гравця» (300, 30 с) з заготовленими вигадками, r2 класика; рейтинг лише в кінці. */
function quizWith(fakes?: string[]): Quiz {
  return makeRoundsQuiz([truthRound('r1', fakes === undefined ? {} : { fakes }), classicRound('r2', [single])], { leaderboard: 'end' });
}

/** Оля p1, Петро p2, Марко p3, Ната p4 з фактами; fakes null — раунд без ключа fakes. */
function lobby(facts: Record<string, string> = FACTS, fakes: string[] | null = [PRESET]): GameState {
  let s = lobbyWith(quizWith(fakes ?? undefined), 'Оля', 'Петро', 'Марко', 'Ната');
  for (const [id, text] of Object.entries(facts)) s = must(submitTruth(s, id, text, 0));
  return s;
}

/** «Почати гру» й перше запитання r1 (роздача seededRng(7)). */
const opened = (l: GameState = lobby()) => must(next(must(start(l)), t0, deal()));

/** Іде запитаннями раунду (без відповідей; закриття, розкриття, рейтинг), доки не відкриється те, що підходить. */
function questionWhere(s: GameState, wanted: (p: Play) => boolean): GameState {
  for (let i = 0; i < 40 && !(s.phase === 'question' && wanted(play(s))); i++) s = s.phase === 'question' ? must(lock(s)) : must(next(s, t0, rng0));
  expect(s.phase).toBe('question');
  expect(wanted(play(s))).toBe(true);
  return s;
}

const isFake = (p: Play) => p.truth?.fake === true;

describe('host fakes in the truth round (52)', () => {
  it('preset fakes come from the quiz', () => {
    expect(createGame(quizWith([PRESET])).truth).toEqual({ facts: {}, fakes: [{ id: 'fake-1', text: PRESET, preset: true }] });
    // без вигадок у раунді — ключа немає (і з порожнім списком теж)
    expect(createGame(quizWith()).truth).toEqual({ facts: {} });
    expect(createGame(quizWith([])).truth).toEqual({ facts: {} });
    // пробіли зводяться, як у фактах
    expect(createGame(quizWith(['Я  вмію\nплавати', PRESET])).truth?.fakes).toEqual([
      { id: 'fake-1', text: 'Я вмію плавати', preset: true },
      { id: 'fake-2', text: PRESET, preset: true },
    ]);
  });

  it('the host adds, edits and removes a fake in the lobby', () => {
    let s = lobby({});
    s = must(setTruthFake(s, null, '  Я вмію  жонглювати '));
    expect(s.truth?.fakes).toEqual([
      { id: 'fake-1', text: PRESET, preset: true },
      { id: 'fake-2', text: 'Я вмію жонглювати' },
    ]);
    // порожнє додавання і той самий текст — без змін
    expect(setTruthFake(s, null, '   ')).toEqual({ ok: true, state: s });
    expect(setTruthFake(s, 'fake-2', ' Я вмію жонглювати')).toEqual({ ok: true, state: s });
    // зміна знімає позначку «з редактора»
    s = must(setTruthFake(s, 'fake-1', 'Я тричі бачила веселку'));
    expect(s.truth?.fakes?.[0]).toEqual({ id: 'fake-1', text: 'Я тричі бачила веселку' });
    // новий id — більший за всі наявні, навіть після прибирання першого
    s = must(setTruthFake(s, 'fake-1', ''));
    expect(s.truth?.fakes?.map((f) => f.id)).toEqual(['fake-2']);
    s = must(setTruthFake(s, null, 'Я обійшла пішки озеро'));
    expect(s.truth?.fakes?.map((f) => f.id)).toEqual(['fake-2', 'fake-3']);
    s = must(setTruthFake(s, 'fake-2', ''));
    expect(s.truth?.fakes).toEqual([{ id: 'fake-3', text: 'Я обійшла пішки озеро' }]);
    // прибрати вже прибрану — без змін
    expect(setTruthFake(s, 'fake-2', '')).toEqual({ ok: true, state: s });
    expect(setTruthFake(s, 'fake-9', 'Я вмію свистіти')).toEqual({ ok: false, error: 'not_found' });
    expect(setTruthFake(s, null, 'а'.repeat(LIMITS.truthText + 1))).toEqual({ ok: false, error: 'truth_text' });
    expect(setTruthFake(s, 'fake-3', 'а'.repeat(LIMITS.truthText + 1))).toEqual({ ok: false, error: 'truth_text' });
    expect(setTruthFake(s, null, 'a\u0000b')).toEqual({ ok: false, error: 'truth_text' });
    expect(must(setTruthFake(s, null, 'а'.repeat(LIMITS.truthText))).truth?.fakes).toHaveLength(2);
    // стеля — разом із заготовленими
    let full = s;
    for (let i = 2; i <= LIMITS.truthFakes; i++) full = must(setTruthFake(full, null, `Вигадка номер ${i}`));
    expect(full.truth?.fakes).toHaveLength(LIMITS.truthFakes);
    expect(setTruthFake(full, null, 'Ще одна')).toEqual({ ok: false, error: 'truth_fakes_full' });
    // змінити й прибрати на стелі можна
    expect(must(setTruthFake(full, 'fake-3', 'Я вмію свистіти')).truth?.fakes).toHaveLength(LIMITS.truthFakes);
    // після роздачі й у вікторині без раунду truth — закрито
    const dealt = opened();
    expect(setTruthFake(dealt, null, 'Я вмію свистіти')).toEqual({ ok: false, error: 'truth_closed' });
    expect(setTruthFake(dealt, 'fake-1', '')).toEqual({ ok: false, error: 'truth_closed' });
    const plain = lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля');
    expect(setTruthFake(plain, null, 'Я вмію свистіти')).toEqual({ ok: false, error: 'truth_closed' });
  });

  it('no fakes in a game without a host', () => {
    let s = must(createAutopilotGame(quizWith([PRESET]), { id: 'a', nickname: 'Ігор' }));
    s = must(addPlayer(s, { id: 'p2', nickname: 'Олена' }));
    // події ведучого тут шлють гравці — їм вигадки недоступні
    expect(setTruthFake(s, null, 'Я вмію жонглювати')).toEqual({ ok: false, error: 'not_allowed' });
    expect(setTruthFake(s, 'fake-1', 'Я вмію жонглювати')).toEqual({ ok: false, error: 'not_allowed' });
    expect(setTruthFake(s, 'fake-1', '')).toEqual({ ok: false, error: 'not_allowed' });
    // заготовлена з редактора грається
    s = must(submitTruth(must(submitTruth(s, 'a', 'Я бачила кита', 0)), 'p2', 'Я вмію плавати', 0));
    const dealt = must(next(must(start(s)), t0, deal()));
    expect([...(dealt.truth?.deck ?? [])].sort()).toEqual(['a', 'fake-1', 'p2']);
    expect(truthFaked(dealt)).toBe(true);
  });

  it('the deal mixes fakes in, never more than the real facts', () => {
    const two = lobby({ p1: FACTS.p1, p2: FACTS.p2 }, ['Я вмію жонглювати', PRESET, 'Я обійшла пішки озеро']);
    const deck = opened(two).truth?.deck ?? [];
    expect(deck).toHaveLength(4);
    expect(deck).toEqual(shuffle(['p1', 'p2', 'fake-1', 'fake-2'], deal()));
    expect(truthFaked(opened(two))).toBe(true);
    // сховане не рахується: один справжній — одна вигадка
    const hidden = opened(must(hideTruth(two, 'p2', true))).truth?.deck ?? [];
    expect([...hidden].sort()).toEqual(['fake-1', 'p1']);
    // жодного справжнього факту — раунд пропущено, вигадки не грають
    const none = opened(lobby({}, ['Я вмію жонглювати', PRESET]));
    expect(none.truth?.deck).toEqual([]);
    expect(none.phase).toBe('round_end');
    expect(truthSkipped(none)).toBe(true);
    expect(truthFaked(none)).toBe(false);
    // без вигадок колода та сама, що й до 52
    const plain = opened(lobby({ p1: FACTS.p1, p2: FACTS.p2, p3: FACTS.p3 }, null));
    expect(plain.truth?.deck).toEqual(shuffle(['p1', 'p2', 'p3'], deal()));
    expect(truthFaked(plain)).toBe(false);
  });

  it('every question of a faked round has the «made up» option last', () => {
    const s = opened();
    const deck = s.truth?.deck ?? [];
    expect(deck).toHaveLength(5);
    const people = [
      { id: 'p3', text: 'Марко' },
      { id: 'p4', text: 'Ната' },
      { id: 'p1', text: 'Оля' },
      { id: 'p2', text: 'Петро' },
    ];
    deck.forEach((entry, k) => {
      const q = truthQuestion(s, k);
      expect(q?.type).toBe('single');
      if (q?.type !== 'single') return;
      expect(q.id).toBe(`truth-${k}`);
      expect(q.options).toEqual([...people, MADE_UP]);
      expect(q.correctId).toBe(entry === 'fake-1' ? 'fake' : entry);
      expect(q.text).toBe(entry === 'fake-1' ? PRESET : FACTS[entry]);
    });
    // у раунді без вигадок варіанта немає
    const plain = opened(lobby(FACTS, null));
    for (let k = 0; k < 4; k++) {
      const q = truthQuestion(plain, k);
      expect(q?.type === 'single' ? q.options : null).toEqual(people);
    }
  });

  it('a fake is guessed by «made up»', () => {
    let s = questionWhere(opened(), isFake);
    expect(play(s).truth).toEqual({ authorId: 'fake-1', actorId: 'fake-1', guessers: ['p1', 'p2', 'p3', 'p4'], fake: true });
    expect(play(s).question.text).toBe(PRESET);
    s = must(submitAnswer(s, 'p1', pick('fake'), t0 + 1000));
    s = must(submitAnswer(s, 'p2', pick('p3'), t0 + 1000));
    s = must(submitAnswer(s, 'p3', pick('fake'), t0 + 1000));
    // автора немає: вгадують усі четверо
    expect(s.phase).toBe('question');
    s = must(submitAnswer(s, 'p4', pick('p1'), t0 + 1000));
    expect(s.phase).toBe('locked');
    expect(recordOf(s, s.questionIndex, 'p1')).toMatchObject({ grade: 'correct', points: 300 });
    expect(recordOf(s, s.questionIndex, 'p3')).toMatchObject({ grade: 'correct', points: 300 });
    expect(recordOf(s, s.questionIndex, 'p2')).toMatchObject({ grade: 'wrong', points: 0 });
    expect(recordOf(s, s.questionIndex, 'p4')).toMatchObject({ grade: 'wrong', points: 0 });
    // частки немає нікому
    expect(Object.keys(play(s).answers).sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(play(s).truth).toEqual({ authorId: 'fake-1', actorId: 'fake-1', guessers: ['p1', 'p2', 'p3', 'p4'], right: ['p1', 'p3'], fake: true });
  });

  it("«made up» on a real fact is wrong and feeds the author's share", () => {
    let s = questionWhere(opened(), (p) => p.truth?.authorId === 'p3');
    expect(play(s).truth).toEqual({ authorId: 'p3', actorId: 'p3', guessers: ['p1', 'p2', 'p4'] });
    expect(submitAnswer(s, 'p3', pick('fake'), t0 + 1000)).toEqual({ ok: false, error: 'truth_own' });
    s = must(submitAnswer(s, 'p1', pick('fake'), t0 + 1000));
    s = must(submitAnswer(s, 'p2', pick('p3'), t0 + 1000));
    s = must(submitAnswer(s, 'p4', pick('p1'), t0 + 1000));
    expect(s.phase).toBe('locked');
    expect(recordOf(s, s.questionIndex, 'p1')).toMatchObject({ grade: 'wrong', points: 0 });
    expect(recordOf(s, s.questionIndex, 'p2')).toMatchObject({ grade: 'correct', points: 300 });
    expect(recordOf(s, s.questionIndex, 'p3')).toMatchObject({ answer: null, points: Math.round((300 * 2) / 3) });
    expect(recordOf(s, s.questionIndex, 'p3')?.points).toBe(200);
  });

  it('teams: the captain picks «made up»', () => {
    const quiz = teamQuiz([truthRound('r1', { fakes: [PRESET] }), classicRound('r2', [single])], 2, 'chosen');
    let l = teamLobby(quiz, 'Оля', 'Петро', 'Марко', 'Ната');
    for (const [m, t] of [['m1', 't1'], ['m2', 't1'], ['m3', 't2'], ['m4', 't2']]) l = must(assignTeam(l, m, t));
    l = must(submitTruth(must(submitTruth(l, 'm2', 'Я грав в оркестрі', 0)), 'm4', 'Я виростила лимон', 0));
    const first = must(next(must(start(l)), t0, deal()));
    expect([...(first.truth?.deck ?? [])].sort()).toEqual(['fake-1', 'm2', 'm4']);
    // вигадка: вгадують обидві команди, «Вигадка» капітана — бали команді
    let s = questionWhere(first, isFake);
    expect(play(s).truth).toEqual({ authorId: 'fake-1', actorId: 'fake-1', guessers: ['t1', 't2'], fake: true });
    s = must(actAnswer(s, 'm1', pick('fake'), t0 + 1000));
    s = must(actAnswer(s, 'm3', pick('m2'), t0 + 1000));
    expect(s.phase).toBe('locked');
    expect(recordOf(s, s.questionIndex, 't1')).toMatchObject({ grade: 'correct', points: 300 });
    expect(recordOf(s, s.questionIndex, 't2')).toMatchObject({ grade: 'wrong', points: 0 });
    expect(Object.keys(play(s).answers).sort()).toEqual(['t1', 't2']);
    // факт Петра (t1): капітан t2 вибирає «Вигадка» — промах, команда автора бере повну ціну
    s = questionWhere(first, (p) => p.truth?.authorId === 'm2');
    expect(play(s).truth).toEqual({ authorId: 'm2', actorId: 't1', guessers: ['t2'] });
    s = must(actAnswer(s, 'm3', pick('fake'), t0 + 1000));
    expect(s.phase).toBe('locked');
    expect(recordOf(s, s.questionIndex, 't2')).toMatchObject({ grade: 'wrong', points: 0 });
    expect(recordOf(s, s.questionIndex, 't1')).toMatchObject({ answer: null, grade: 'correct', points: 300 });
  });

  it('the stage and the phones cannot tell a fake from a fact before the reveal', () => {
    const first = opened();
    const fake = questionWhere(first, isFake);
    const fact = questionWhere(first, (p) => p.truth?.authorId === 'p3');
    /** Шляхи ключів зрізу (масиви — за індексом): однаковий набір — однакова будова. */
    const paths = (value: unknown, at = ''): string[] =>
      value !== null && typeof value === 'object'
        ? Object.entries(value).flatMap(([k, v]) => [`${at}.${k}`, ...paths(v, `${at}.${k}`)])
        : [];
    // на question (двоє відповіли) і на locked
    const stages = (s: GameState) => {
      const answered = must(submitAnswer(must(submitAnswer(s, 'p1', pick('fake'), t0 + 1000)), 'p2', pick('p4'), t0 + 1000));
      return [answered, must(lock(answered))];
    };
    const [fakeQ, fakeL] = stages(fake);
    const [factQ, factL] = stages(fact);
    for (const [f, r] of [[fakeQ, factQ], [fakeL, factL]] as const) {
      expect(f.phase).toBe(r.phase);
      for (const view of [(x: GameState) => stageView(x), (x: GameState) => playerView(x, 'p1'), (x: GameState) => playerView(x, 'p4')]) {
        const a = view(f);
        const b = view(r);
        for (const text of [JSON.stringify(a), JSON.stringify(b)]) {
          for (const leak of ['"fake":true', 'fake-1', 'correctId', 'authorId']) expect(text).not.toContain(leak);
        }
        expect(paths(a).sort()).toEqual(paths(b).sort());
        expect(a?.question?.choices).toEqual(b?.question?.choices);
        expect(a?.question?.choices?.at(-1)).toEqual(MADE_UP);
        expect([a?.playerCount, a?.answeredCount, b?.playerCount, b?.answeredCount]).toEqual([0, 0, 0, 0]);
        expect(a?.truth?.reveal).toBeNull();
      }
    }
    // ведучий бачить справжні числа
    expect([hostView(fakeQ).playerCount, hostView(factQ).playerCount]).toEqual([4, 3]);
  });
});
