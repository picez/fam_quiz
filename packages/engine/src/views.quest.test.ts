import { describe, expect, it } from 'vitest';
import type { Answer } from '@quiz/shared';
import { endRound, lock, next, pause, start, submitAnswer, tick, type GameState } from './game';
import { actQuest, enterQuestCode } from './quest';
import { QUEST_RIGHT, QUEST_WRONG, classicRound, makeRoundsQuiz, questQuestions, questQuiz, questRound, single } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { hostView, playerView, stageView } from './views';

// «Квест із кодом» (29g): зрізи. Код «СОВА», порядок [2, 0, 3, 1]; до shown його знає лише пульт, гравець бачить лише власні позиції.

const T = 1_000_000;
const rng = () => 0;
const OLA = 'p1';
const TARAS = 'p2';
const PETRO = 'p3';
const json = (value: unknown) => JSON.stringify(value);
const code = (s: GameState, who: string, raw: string, at: number) => must(enterQuestCode(s, who, who, raw, at));

function lobby(options = {}) {
  return lobbyWith(questQuiz({ leaderboard: 'end' }, { order: [2, 0, 3, 1], ...options }), 'Оля', 'Тарас', 'Петро');
}

/** Від лобі до intro раунду quest. */
function toIntro(s: GameState): GameState {
  let current = must(next(must(start(s)), T, rng));
  current = must(next(must(lock(current)), T, rng));
  while (current.phase !== 'round_end') current = must(next(current, T, rng));
  return must(next(current, T, rng));
}

type Kind = 'right' | 'wrong' | Answer | null;
const step = (s: GameState) => questQuestions.findIndex((q) => q.id === s.plays[s.questionIndex].question.id);

/** Відкрити запитання, відповіді о at+1000, закриття, розкриття. */
function play(s: GameState, answers: Record<string, Kind>, at: number): GameState {
  let current = s;
  if (current.phase !== 'question') current = must(next(current, at, rng));
  const i = step(current);
  for (const [id, kind] of Object.entries(answers)) {
    if (kind === null) continue;
    current = must(submitAnswer(current, id, kind === 'right' ? QUEST_RIGHT[i] : kind === 'wrong' ? QUEST_WRONG[i] : kind, at + 1000));
  }
  return must(next(must(lock(current)), at + 2000, rng));
}

/**
 * Оля правильно відповіла на 3 запитання (3 позиції), Тарас розв'язав код після 2 (800), Оля одну спробу згаяла (СОВИ, k = 1).
 * Повертає стан на розкритті третього запитання.
 */
function scene(): GameState {
  let s = toIntro(lobby());
  s = play(s, { [OLA]: 'right' }, T);
  s = code(s, OLA, 'СОВИ', T + 3000);
  s = play(s, { [OLA]: 'right' }, T + 10_000);
  s = code(s, TARAS, 'сова', T + 13_000);
  s = play(s, { [OLA]: 'right' }, T + 20_000);
  expect(s.phase).toBe('reveal');
  return s;
}

/** Стани з різних етапів: intro, question, locked, reveal, вікно. */
function stages(): Record<string, GameState> {
  const intro = toIntro(lobby());
  const reveal = scene();
  const question = must(next(reveal, T + 30_000, rng));
  const locked = must(lock(question));
  let s = play(reveal, {}, T + 30_000);
  s = play(s, {}, T + 40_000);
  expect(s.phase).toBe('reveal');
  s = must(next(s, T + 50_000, rng)); // вікно
  expect(s.quest?.stage).toBe('window');
  return { intro, question, locked, reveal, window: s };
}

describe('quest views (29g): the code stays hidden', () => {
  it('the code never reaches a phone or the stage before it is shown', () => {
    const all = stages();
    for (const [name, s] of Object.entries(all)) {
      for (const [who, view] of [['stage', stageView(s)], ['Ola', playerView(s, OLA)], ['Taras', playerView(s, TARAS)], ['Petro', playerView(s, PETRO)]] as const) {
        const text = json(view);
        expect(text, `${name} ${who}`).not.toContain('"order"');
        expect(text, `${name} ${who}`).not.toContain('"code":"');
        expect(text, `${name} ${who}`).not.toContain('СОВА');
      }
      expect(stageView(s).quest?.code, name).toBeNull();
      expect(json(stageView(s).round?.brief), name).not.toContain('СОВ');
      expect(stageView(s).quest?.stage).toBe(name === 'window' ? 'window' : 'play');
    }
    // Пульт бачить усе.
    expect(hostView(all.question).quest?.code).toBe('СОВА');
    // Показано — код у всіх.
    let s = must(next(all.window, T + 60_000, rng));
    expect(s.quest?.stage).toBe('shown');
    for (const view of [stageView(s), playerView(s, OLA), playerView(s, PETRO)]) expect(view?.quest?.code).toBe('СОВА');
    // Раунд останній: гра закінчується, код усе одно видно.
    s = must(next(s, T + 61_000, rng));
    expect(s.phase).toBe('finished');
    for (const view of [stageView(s), playerView(s, OLA), playerView(s, PETRO)]) expect(view?.quest?.code).toBe('СОВА');
  });

  it('the code is shown on round_end when another round follows', () => {
    const quiz = makeRoundsQuiz([questRound('rq', questQuestions), classicRound('r2', [single])], { leaderboard: 'end' });
    let s = must(endRound(must(start(lobbyWith(quiz, 'Оля', 'Тарас'))), T));
    expect(s.phase).toBe('round_end');
    for (const view of [stageView(s), playerView(s, 'p1')]) expect(view?.quest?.code).toBe('СОВА');
  });

  it('a phone sees only its own slots', () => {
    const s = scene();
    const ola = playerView(s, OLA)?.me.quest;
    expect(ola?.slots).toEqual(['С', null, 'В', 'А']);
    expect(ola?.tries).toEqual(['СОВИ']);
    expect(ola?.left).toBe(2);
    expect(ola?.solved).toBeNull();
    const petro = playerView(s, PETRO);
    expect(petro?.me.quest?.slots).toEqual([null, null, null, null]);
    expect(petro?.me.quest?.tries).toEqual([]);
    for (const symbol of ['"С"', '"В"', '"А"', 'СОВИ']) expect(json(petro)).not.toContain(symbol);
    expect(json(stageView(s))).not.toContain('СОВИ');
    expect(json(playerView(s, TARAS))).not.toContain('СОВИ');
    expect(playerView(s, TARAS)?.me.quest?.solved).toEqual({ after: 2, points: 800, buff: null });
  });

  it('outside the quest round there is no key', () => {
    const s = must(next(must(start(lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Оля', 'Тарас'))), T, rng));
    expect('quest' in stageView(s)).toBe(false);
    expect('quest' in (playerView(s, OLA)?.me ?? {})).toBe(false);
    expect('quest' in hostView(s)).toBe(false);
    // Після раунду quest ключа теж немає.
    const quiz = makeRoundsQuiz([questRound('rq', questQuestions), classicRound('r2', [single])], { leaderboard: 'end' });
    let q = must(start(lobbyWith(quiz, 'Оля', 'Тарас')));
    expect(stageView(q).quest).toBeDefined();
    q = must(endRound(q, T));
    q = must(next(q, T + 1, rng));
    expect('quest' in stageView(q)).toBe(false);
  });
});

describe('quest views (29g): stage and phone', () => {
  it('the stage sees counts and who opened the chest', () => {
    const quest = stageView(scene()).quest;
    expect(quest?.prompt).toBe('Нічний птах — символ мудрості');
    expect([quest?.length, quest?.tries, quest?.count]).toEqual([4, 3, 5]);
    expect(quest?.bonus).toEqual({ kind: 'points', points: 1200 });
    expect(quest?.rows).toEqual([
      { playerId: TARAS, nickname: 'Тарас', opened: 0, triesUsed: 0, solved: { place: 1, after: 2, points: 800, buff: null } },
      { playerId: OLA, nickname: 'Оля', opened: 3, triesUsed: 1, solved: null },
      { playerId: PETRO, nickname: 'Петро', opened: 0, triesUsed: 0, solved: null },
    ]);
    for (const row of quest?.rows ?? []) for (const key of ['slots', 'code', 'tries']) expect(key in row).toBe(false);
  });

  it('share now follows the round', () => {
    const { intro, question, window } = stages();
    expect(stageView(intro).quest?.shareNow).toBe(1);
    expect(stageView(question).quest?.shareNow).toBeCloseTo(1 - 3 / 6);
    expect(stageView(window).quest?.shareNow).toBeCloseTo(1 / 6);
    // на третьому запитанні (розкрито два): 1 − 2/6
    let s = toIntro(lobby());
    s = play(play(s, {}, T), {}, T + 10_000);
    s = must(next(s, T + 20_000, rng));
    expect(s.phase).toBe('question');
    expect(stageView(s).quest?.shareNow).toBeCloseTo(1 - 2 / 6);
  });

  it('the phone can enter while the round runs', () => {
    const { intro, question, locked, reveal, window } = stages();
    for (const [name, s] of Object.entries({ intro, question, locked, reveal, window })) expect(playerView(s, PETRO)?.me.quest?.canEnter, name).toBe(true);
    // Тарас уже розв'язав.
    expect(playerView(reveal, TARAS)?.me.quest?.canEnter).toBe(false);
    expect(playerView(must(pause(question, T + 31_000)), PETRO)?.me.quest?.canEnter).toBe(false);
    // вичерпання спроб
    let s = intro;
    for (const wrong of ['АААА', 'БББВ']) s = code(s, PETRO, wrong, T + 1000);
    expect(playerView(s, PETRO)?.me.quest).toMatchObject({ left: 1, canEnter: true });
    s = code(s, PETRO, 'ВВВВ', T + 1500);
    expect(playerView(s, PETRO)?.me.quest).toMatchObject({ left: 0, canEnter: false });
    // показано
    const shown = must(next(window, T + 60_000, rng));
    expect(playerView(shown, PETRO)?.me.quest?.canEnter).toBe(false);
  });

  it('the window has a clock', () => {
    const { window, reveal } = stages();
    expect(stageView(window).quest).toMatchObject({ stage: 'window', endsAt: window.endsAt, remainingMs: null });
    expect(window.endsAt).not.toBeNull();
    const paused = must(pause(window, T + 52_000));
    expect(stageView(paused).quest).toMatchObject({ endsAt: null, remainingMs: paused.remainingMs });
    expect(paused.remainingMs).toBeGreaterThan(0);
    expect(playerView(paused, PETRO)?.me.quest?.canEnter).toBe(false);
    expect(stageView(reveal).quest).toMatchObject({ endsAt: null, remainingMs: null });
    const closed = tick(window, window.endsAt ?? 0);
    expect(stageView(closed).quest).toMatchObject({ stage: 'shown', endsAt: null, code: 'СОВА' });
  });
});

describe('quest views (29g): host and teams', () => {
  it('the host sees everything', () => {
    const host = hostView(scene()).quest;
    expect(host?.code).toBe('СОВА');
    expect(host?.order).toEqual([2, 0, 3, 1]);
    const ola = host?.detail.find((d) => d.playerId === OLA);
    expect(ola?.slots).toEqual(['С', null, 'В', 'А']);
    expect(ola?.tries).toEqual([{ code: 'СОВИ', at: T + 3000, after: 1, right: false, by: null }]);
    expect(host?.detail.find((d) => d.playerId === TARAS)?.tries).toEqual([{ code: 'СОВА', at: T + 13_000, after: 2, right: true, by: null }]);
    expect(host?.rows.map((r) => r.playerId)).toEqual([TARAS, OLA, PETRO]);
  });

  it('teammates see the same slots', () => {
    const quiz = teamQuiz([questRound('rq', questQuestions, { order: [2, 0, 3, 1] })]);
    let s = teamGame({ ...quiz, settings: { ...quiz.settings, leaderboard: 'end' } }, [['Оля', 'Тарас'], ['Петро', 'Ганна']]);
    s = must(actQuest(s, 'm2', 'СОВИ', T));
    s = must(next(s, T + 1000, rng));
    s = must(submitAnswer(s, 't1', QUEST_RIGHT[0], T + 2000));
    s = must(next(must(lock(s)), T + 3000, rng));
    const m1 = playerView(s, 'm1')?.me.quest;
    expect(m1).toEqual(playerView(s, 'm2')?.me.quest);
    expect(m1?.slots).toEqual([null, null, 'В', null]);
    expect(m1?.tries).toEqual(['СОВИ']);
    const m3 = playerView(s, 'm3')?.me.quest;
    expect(m3).toEqual(playerView(s, 'm4')?.me.quest);
    expect(m3?.slots).toEqual([null, null, null, null]);
    expect(m3?.tries).toEqual([]);
    expect(json(playerView(s, 'm3'))).not.toContain('СОВИ');
    // у зрізі пульта — хто ввів
    expect(hostView(s).quest?.detail.find((d) => d.playerId === 't1')?.tries[0]).toMatchObject({ code: 'СОВИ', by: 'Тарас' });
    expect(stageView(s).quest?.rows.map((r) => r.nickname)).toContain('Червоні');
  });
});

describe('quest views (29g): attempt times', () => {
  it('the host gets the moment the round was entered, an old snapshot gets null', () => {
    const s = scene();
    expect(s.quest?.startedAt).toBe(T);
    expect(hostView(s).quest?.since).toBe(T);
    const { startedAt: _startedAt, ...old } = s.quest!;
    expect(hostView({ ...s, quest: old }).quest?.since).toBeNull();
  });
});
