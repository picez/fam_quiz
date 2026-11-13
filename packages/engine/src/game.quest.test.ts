import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, questSlots, type Answer, type QuizSettings, type QuestRound } from '@quiz/shared';
import { takeBuff } from './buffs';
import { endRound, lock, next, override, pause, removePlayer, resume, start, submitAnswer, tick, type GameState } from './game';
import { actQuest, enterQuestCode, questAfter, questDone, questOpened, questSolved, questWindowOpen } from './quest';
import { QUEST_RIGHT, QUEST_WRONG, classicRound, makeRoundsQuiz, questQuestions, questQuiz, questRound, single4 } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const T = 1_000_000;
const rng = () => 0;
type QuestOptions = Partial<Omit<QuestRound, 'id' | 'type' | 'questions'>>;
const OLA = 'p1';
const TARAS = 'p2';
const PETRO = 'p3';

const lobby = (options: QuestOptions = {}, settings: Partial<QuizSettings> = {}) =>
  lobbyWith(questQuiz({ leaderboard: 'end', ...settings }, options), 'Оля', 'Тарас', 'Петро');

/** «Почати гру», класичне запитання без відповідей, розкриття, кінець раунду — intro раунду quest. */
function toQuest(lobbyState: GameState, at = T): GameState {
  let s = must(start(lobbyState));
  s = must(next(s, at, rng)); // перше запитання класики
  s = must(lock(s));
  s = must(next(s, at, rng)); // reveal
  while (s.phase !== 'round_end') s = must(next(s, at, rng));
  s = must(next(s, at, rng)); // intro раунду quest
  expect(s.phase).toBe('intro');
  return s;
}

/** Номер поточного запитання раунду quest (0 — k1). */
const step = (s: GameState) => questQuestions.findIndex((q) => q.id === s.plays[s.questionIndex].question.id);

type Kind = 'right' | 'wrong' | Answer | null;

/** На етапі question: відповіді о at (right — правильно, wrong — неправильно, Answer — як є), закриття. */
function answer(s: GameState, answers: Record<string, Kind>, at: number): GameState {
  let current = s;
  const i = step(s);
  for (const [id, kind] of Object.entries(answers)) {
    if (kind === null) continue;
    const value = kind === 'right' ? QUEST_RIGHT[i] : kind === 'wrong' ? QUEST_WRONG[i] : kind;
    current = must(submitAnswer(current, id, value, at));
  }
  return current.phase === 'question' ? must(lock(current)) : current;
}

/** Відкрити запитання (з intro чи з розкриття попереднього, через таблицю), відповіді, закриття, розкриття. */
function play(s: GameState, answers: Record<string, Kind>, at: number): GameState {
  let current = s;
  if (current.phase !== 'question') current = must(next(current, at, rng));
  if (current.phase === 'leaderboard') current = must(next(current, at, rng));
  expect(current.phase).toBe('question');
  return must(next(answer(current, answers, at + 1000), at + 2000, rng));
}

/** Код від людини who о at (той самий id людини). */
const code = (s: GameState, who: string, raw: string, at: number) => enterQuestCode(s, who, who, raw, at);

/** Коригування 'quest' учасника. */
const questPointsOf = (s: GameState, id: string) => s.adjustments.filter((a) => a.source === 'quest' && a.playerId === id).map((a) => a.points);

/** Усі п'ять запитань без відповідей, розкриття останнього. */
function playAll(s: GameState, at: number, answers: Record<string, Kind> = {}): GameState {
  let current = s;
  for (let i = 0; i < 5; i++) current = play(current, answers, at + i * 10_000);
  return current;
}

describe('quest round (29g): state', () => {
  it('the quest round starts with no tries', () => {
    const lobbyState = lobby();
    const classic = must(start(lobbyState));
    expect('quest' in classic).toBe(false);
    const intro = toQuest(lobbyState);
    expect(intro.quest).toEqual({ tries: {}, stage: 'play', startedAt: T });
    // Раунд quest не останній: після нього ще класика — ключа немає.
    const quiz = makeRoundsQuiz([questRound('rq', questQuestions), classicRound('r2', [single4])], { leaderboard: 'end' });
    let s = must(next(must(start(lobbyWith(quiz, 'Оля', 'Тарас'))), T, rng));
    s = must(endRound(s, T + 1000));
    expect(s.phase).toBe('round_end');
    expect(s.quest?.stage).toBe('shown');
    s = must(next(s, T + 2000, rng));
    expect(s.phase).toBe('intro');
    expect('quest' in s).toBe(false);
  });
});

describe('quest round (29g): positions', () => {
  it("positions open on reveal in the host's order", () => {
    let s = toQuest(lobby({ order: [2, 0, 3, 1], rules: { ...DEFAULT_RULES, partial: 50 } }));
    s = must(next(s, T, rng));
    s = must(submitAnswer(s, OLA, QUEST_RIGHT[0], T + 1000));
    s = must(submitAnswer(s, TARAS, QUEST_WRONG[0], T + 1000));
    expect(s.phase).toBe('question');
    expect(questOpened(s, OLA)).toBe(0);
    s = must(lock(s));
    expect(questOpened(s, OLA)).toBe(0);
    s = must(next(s, T + 2000, rng));
    expect(s.phase).toBe('reveal');
    expect(questOpened(s, OLA)).toBe(1);
    const round = s.quiz.rounds[1] as QuestRound;
    expect(questSlots(round.code, round.order, questOpened(s, OLA))).toEqual([null, null, 'В', null]);
    expect(questOpened(s, TARAS)).toBe(0);
    s = must(override(s, TARAS, 'correct', T + 2500));
    expect(questOpened(s, TARAS)).toBe(1);
    // Часткова на multi (оцінка ведучого) — не рахується.
    s = play(s, { [PETRO]: { type: 'multi', optionIds: ['a'] } }, T + 10_000);
    s = must(override(s, PETRO, 'partial', T + 12_500));
    expect(s.plays[s.questionIndex].answers[PETRO]?.grade).toBe('partial');
    expect(questOpened(s, PETRO)).toBe(0);
  });

  it('five right answers open the four positions, the fifth adds nothing', () => {
    let s = toQuest(lobby());
    for (let i = 0; i < 5; i++) s = play(s, { [OLA]: 'right' }, T + i * 10_000);
    expect(questOpened(s, OLA)).toBe(4);
  });
});

describe('quest round (29g): tries', () => {
  it('the bonus follows the questions revealed', () => {
    const intro = toQuest(lobby({ rules: { ...DEFAULT_RULES, multiplier: 3 } }));
    expect(questPointsOf(must(code(intro, OLA, 'сова', T)), OLA)).toEqual([1200]);
    const first = play(intro, {}, T);
    const second = must(next(first, T + 5000, rng));
    expect(second.phase).toBe('question');
    expect(questAfter(second)).toBe(1);
    expect(questPointsOf(must(code(second, OLA, 'СОВА', T + 6000)), OLA)).toEqual([1000]);
    const locked = must(lock(second));
    expect(questPointsOf(must(code(locked, OLA, 'СОВА', T + 7000)), OLA)).toEqual([1000]);
    const revealed = must(next(locked, T + 8000, rng));
    expect(questPointsOf(must(code(revealed, OLA, 'СОВА', T + 9000)), OLA)).toEqual([800]);
    const windowed = must(next(playAll(intro, T), T + 60_000, rng));
    expect(questWindowOpen(windowed)).toBe(true);
    const solved = must(code(windowed, OLA, 'Сова', T + 61_000));
    expect(questPointsOf(solved, OLA)).toEqual([200]);
    expect(solved.players.find((p) => p.id === OLA)?.score).toBe(200);
  });

  it('a code can be entered in the middle of a question', () => {
    let s = must(next(toQuest(lobby()), T, rng));
    s = must(code(s, OLA, 'СОВА', T + 500));
    expect(s.phase).toBe('question');
    expect(s.questionIndex).toBe(1);
    s = must(submitAnswer(s, OLA, QUEST_RIGHT[0], T + 1000));
    s = must(next(must(lock(s)), T + 2000, rng));
    expect(s.plays[s.questionIndex].answers[OLA]?.points).toBe(1000);
    expect(s.players.find((p) => p.id === OLA)?.score).toBe(2200);
  });

  it('tries burn, length and repeats do not', () => {
    let s = play(toQuest(lobby()), {}, T);
    s = must(code(s, OLA, 'СОВИ', T + 5000));
    expect(s.quest?.tries[OLA]).toEqual([{ code: 'СОВИ', at: T + 5000, after: 1, right: false }]);
    expect(code(s, OLA, 'СОВ', T + 5100)).toEqual({ ok: false, error: 'quest_length' });
    expect(code(s, OLA, 'с.о.в.и', T + 5200)).toEqual({ ok: false, error: 'quest_repeat' });
    s = must(code(s, OLA, 'ЛИСА', T + 5300));
    s = must(code(s, OLA, 'ВОВК', T + 5400));
    expect(questDone(s, OLA)).toBe(true);
    expect(code(s, OLA, 'СОВА', T + 5500)).toEqual({ ok: false, error: 'quest_tries' });
    s = must(code(s, TARAS, 'СОВА', T + 5600));
    expect(code(s, TARAS, 'СОВА', T + 5700)).toEqual({ ok: false, error: 'quest_solved' });
    expect(questSolved(s)).toEqual([{ actorId: TARAS, at: T + 5600, after: 1 }]);
  });

  it('refuses a code out of place', () => {
    const lobbyState = lobby();
    const classic = must(next(must(start(lobbyState)), T, rng));
    expect(code(classic, OLA, 'СОВА', T)).toEqual({ ok: false, error: 'wrong_phase' });
    const intro = toQuest(lobbyState);
    expect(code(must(pause(intro, T)), OLA, 'СОВА', T)).toEqual({ ok: false, error: 'paused' });
    expect(code(intro, 'nobody', 'СОВА', T)).toEqual({ ok: false, error: 'not_found' });
    const shown = tick(must(next(playAll(intro, T), T + 60_000, rng)), T + 90_000);
    expect(shown.quest?.stage).toBe('shown');
    expect(code(shown, OLA, 'СОВА', T + 90_000)).toEqual({ ok: false, error: 'quest_closed' });
  });
});

describe('quest round (29g): the code window', () => {
  it('the code window lasts thirty seconds and then shows the code', () => {
    const intro = toQuest(lobby());
    const last = playAll(intro, T);
    const t = T + 60_000;
    const open = must(next(last, t, rng));
    expect(open.phase).toBe('leaderboard');
    expect(open.quest?.stage).toBe('window');
    expect(open.endsAt).toBe(t + 30_000);
    const still = tick(open, t + 29_999);
    expect(still.quest?.stage).toBe('window');
    expect(questPointsOf(must(code(still, PETRO, 'СОВА', t + 29_999)), PETRO)).toEqual([200]);
    const shown = tick(open, t + 30_000);
    expect(shown.quest?.stage).toBe('shown');
    expect(shown.endsAt).toBeNull();
    expect(code(shown, PETRO, 'СОВА', t + 30_001)).toEqual({ ok: false, error: 'quest_closed' });
    // Раунд quest останній — гра закінчується.
    expect(must(next(shown, t + 31_000, rng)).phase).toBe('finished');
    // Пауза тримає залишок.
    const paused = must(pause(open, t + 10_000));
    expect(paused.remainingMs).toBe(20_000);
    expect(tick(paused, t + 50_000).quest?.stage).toBe('window');
    const resumed = must(resume(paused, t + 60_000));
    expect(resumed.endsAt).toBe(t + 80_000);
    // «Далі» у відкритому вікні показує код, ще «Далі» — кінець раунду.
    const early = must(next(open, t + 5000, rng));
    expect(early.quest?.stage).toBe('shown');
    expect(early.phase).toBe('leaderboard');
    expect(must(next(early, t + 6000, rng)).phase).toBe('finished');
  });

  it('the window comes before a round_end when the quest is not the last round', () => {
    const quiz = makeRoundsQuiz([questRound('rq', questQuestions), classicRound('r2', [single4])], { leaderboard: 'end' });
    let s = must(start(lobbyWith(quiz, 'Оля', 'Тарас')));
    s = playAll(s, T);
    s = must(next(s, T + 60_000, rng));
    expect(questWindowOpen(s)).toBe(true);
    s = tick(s, T + 90_000);
    expect(must(next(s, T + 91_000, rng)).phase).toBe('round_end');
  });

  it("with leaderboard 'each' the tables between questions stay and the window is only after the last", () => {
    let s = toQuest(lobby({}, { leaderboard: 'each' }));
    s = play(s, {}, T);
    s = must(next(s, T + 3000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(s.quest?.stage).toBe('play');
    expect(s.endsAt).toBeNull();
    s = must(next(s, T + 4000, rng));
    expect(s.phase).toBe('question');
    for (let i = 1; i < 5; i++) s = play(s, {}, T + i * 10_000);
    s = must(next(s, T + 60_000, rng));
    expect(s.quest?.stage).toBe('window');
  });

  it('everyone solved before the end → the code is shown at once; the last one out of tries closes the window', () => {
    let s = toQuest(lobby());
    for (const id of [OLA, TARAS, PETRO]) s = must(code(s, id, 'СОВА', T));
    s = must(next(playAll(s, T), T + 60_000, rng));
    expect(s.phase).toBe('leaderboard');
    expect(s.quest?.stage).toBe('shown');
    expect(s.endsAt).toBeNull();
    let w = toQuest(lobby({ tries: 1 }));
    w = must(code(w, OLA, 'СОВА', T));
    w = must(code(w, TARAS, 'ЛИСА', T));
    w = must(next(playAll(w, T), T + 60_000, rng));
    expect(w.quest?.stage).toBe('window');
    w = must(code(w, PETRO, 'ВОВК', T + 61_000));
    expect(w.quest?.stage).toBe('shown');
    expect(w.endsAt).toBeNull();
  });

  it('ending the round early shows the code', () => {
    let s = toQuest(lobby());
    s = play(s, {}, T);
    s = play(s, {}, T + 10_000);
    s = must(next(s, T + 20_000, rng));
    expect(s.phase).toBe('question');
    s = must(endRound(s, T + 21_000));
    expect(s.phase).toBe('finished');
    expect(s.quest?.stage).toBe('shown');
  });
});

describe('quest round (29g): buff bonus', () => {
  const buffLobby = (first: number | null) =>
    lobbyWith(
      makeRoundsQuiz(
        [classicRound('r1', [{ ...single4, timeLimit: 30 }]), questRound('rq', questQuestions, { bonus: { kind: 'buff', buff: 'fifty', first } }), classicRound('r3', [single4, { ...single4, id: 'q-2' }, { ...single4, id: 'q-3' }])],
        { leaderboard: 'end', buffs: ['fifty'] },
      ),
      'Оля',
      'Тарас',
      'Петро',
    );

  /** Класика з fifty від Олі, квест, де розв'язують Оля, Тарас і Петро по черзі, — intro третього раунду. */
  function toThird(first: number | null): GameState {
    let s = must(start(buffLobby(first)));
    s = must(next(s, T, rng));
    s = must(takeBuff(s, OLA, 'fifty', T + 500, rng));
    s = must(next(must(lock(s)), T + 2000, rng));
    while (s.phase !== 'round_end') s = must(next(s, T + 2000, rng));
    s = must(next(s, T + 3000, rng));
    s = must(code(s, OLA, 'СОВА', T + 4000));
    s = must(code(s, TARAS, 'СОВА', T + 5000));
    s = must(code(s, PETRO, 'СОВА', T + 6000));
    s = must(next(playAll(s, T + 10_000), T + 80_000, rng));
    while (s.phase !== 'intro') s = must(next(s, T + 81_000, rng));
    return s;
  }

  /** Бере fifty на кожному з трьох запитань раунду; результат кожного взяття. */
  function takeThrice(s: GameState, id: string): (true | string)[] {
    let current = s;
    const results: (true | string)[] = [];
    for (let i = 0; i < 3; i++) {
      current = must(next(current, T + 100_000 + i * 10_000, rng));
      const taken = takeBuff(current, id, 'fifty', T + 100_500 + i * 10_000, rng);
      results.push(taken.ok ? true : taken.error);
      if (taken.ok) current = taken.state;
      current = must(next(must(lock(current)), T + 101_000 + i * 10_000, rng));
    }
    return results;
  }

  it('a buff bonus gives one more use to the first N', () => {
    const s = toThird(2);
    expect(s.questBuffs).toEqual({ [OLA]: ['fifty'], [TARAS]: ['fifty'] });
    expect(takeThrice(s, OLA)).toEqual([true, 'buff_used', 'buff_used']);
    expect(takeThrice(s, TARAS)).toEqual([true, true, 'buff_used']);
    expect(takeThrice(s, PETRO)).toEqual([true, 'buff_used', 'buff_used']);
  });

  it('first: null gives it to everyone who solved', () => {
    expect(toThird(null).questBuffs).toEqual({ [OLA]: ['fifty'], [TARAS]: ['fifty'], [PETRO]: ['fifty'] });
  });
});

describe('quest round (29g): teams and removal', () => {
  it('teams share tries and positions', () => {
    const quiz = teamQuiz([questRound('rq', questQuestions)]);
    // t1 «Соняшники»: Оля (m1, капітан), Тарас (m2); t2 «Маки»: Петро (m3, капітан), Ганна (m4).
    let s = teamGame({ ...quiz, settings: { ...quiz.settings, leaderboard: 'end' } }, [['Оля', 'Тарас'], ['Петро', 'Ганна']]);
    expect(s.phase).toBe('intro');
    s = must(actQuest(s, 'm2', 'СОВИ', T));
    expect(s.quest?.tries.t1).toEqual([{ code: 'СОВИ', at: T, after: 0, by: 'm2', right: false }]);
    s = must(actQuest(s, 'm1', 'ЛИСА', T + 100));
    s = must(actQuest(s, 'm1', 'ВОВК', T + 200));
    expect(actQuest(s, 'm2', 'СОВА', T + 300)).toEqual({ ok: false, error: 'quest_tries' });
    expect(s.quest?.tries.t2).toBeUndefined();
    // Правильна відповідь команди відкриває позицію всій команді.
    s = must(next(s, T + 1000, rng));
    s = must(submitAnswer(s, 't1', QUEST_RIGHT[0], T + 2000));
    s = must(next(must(lock(s)), T + 3000, rng));
    expect(questOpened(s, 't1')).toBe(1);
    expect(questOpened(s, 't2')).toBe(0);
    s = must(actQuest(s, 'm4', 'СОВА', T + 4000));
    expect(s.adjustments.filter((a) => a.source === 'quest').map((a) => [a.playerId, a.points])).toEqual([['t2', 1000]]);
  });

  it('a removed player leaves no tries', () => {
    const quiz = makeRoundsQuiz([questRound('rq', questQuestions, { bonus: { kind: 'buff', buff: 'fifty', first: null } })], { buffs: ['fifty'] });
    let s = must(start(lobbyWith(quiz, 'Оля', 'Тарас')));
    s = must(code(s, OLA, 'СОВА', T));
    s = must(code(s, TARAS, 'ЛИСА', T));
    expect(Object.keys(s.questBuffs ?? {})).toEqual([OLA]);
    s = must(removePlayer(s, OLA));
    expect(s.quest?.tries).toEqual({ [TARAS]: [{ code: 'ЛИСА', at: T, after: 0, right: false }] });
    expect(s.questBuffs).toEqual({});
  });
});
