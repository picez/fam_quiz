import { DEFAULT_RULES, type Answer, type Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { openClue } from './clues';
import { lock, next, start, submitAnswer, tick, type GameState } from './game';
import { boardRound, classicRound, clues, makeRoundsQuiz } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { hostView, playerView, stageView } from './views';

const selfClues = { ...clues, cluePace: 'self' } satisfies Question; // 5 підказок, 30 с, 1000 балів
const right: Answer = { type: 'clues', value: 'Тарас Шевченко' };
const rng = () => 0;
const opened = (s: GameState, id: string, times: number, at = 1000) => {
  for (let i = 0; i < times; i += 1) s = must(openClue(s, id, at));
  return s;
};
/** Класика без бонусу швидкості, запитання відкрите в 0; Анна p1, Богдан p2, Віра p3. */
const openClassic = (question: Question = selfClues) =>
  startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [question], { rules: DEFAULT_RULES })]), 'Анна', 'Богдан', 'Віра'), 0, rng);

/** Закрити запитання й дійти до розкриття. */
function revealed(state: GameState): GameState {
  let s = must(lock(state));
  while (s.phase !== 'reveal') s = must(next(s, 2000, rng));
  return s;
}

/** Поле з однією клітинкою «Хто я?» у власному темпі; Анна вибрала її в момент 0. */
function pickedCell(answerMode: 'phone' | 'voice' = 'phone'): GameState {
  const round = boardRound('g1', [{ title: 'A', cells: [selfClues] }], { answerMode });
  const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан')));
  return must(pickCell(must(next(intro, 0)), null, selfClues.id, 0, rng));
}

/** m1 Оля, m2 Петро — t1 (капітан Оля); m3 Віра, m4 Ігор — t2 (капітан Віра). */
const LAYOUT = [
  ['Оля', 'Петро'],
  ['Віра', 'Ігор'],
];

describe('views of «Who am I?» at own pace (12c)', () => {
  it('the stage gets the first clue and who opened how many, never the other clues before the reveal', () => {
    const s = opened(openClassic(), 'p1', 2);
    const clues = stageView(s).question?.clues;
    expect(clues).toMatchObject({ total: 5, shown: [selfClues.clues[0]], self: true, nextAt: null, byHost: false });
    expect(clues?.opens).toEqual([
      { playerId: 'p1', nickname: 'Анна', opened: 3, answered: false },
      { playerId: 'p2', nickname: 'Богдан', opened: 1, answered: false },
      { playerId: 'p3', nickname: 'Віра', opened: 1, answered: false },
    ]);
    const json = JSON.stringify(stageView(s));
    for (const hidden of selfClues.clues.slice(1)) expect(json).not.toContain(hidden);
  });

  it('a phone gets only its own clues and no list', () => {
    const s = opened(openClassic(), 'p1', 2);
    expect(playerView(s, 'p1')?.question?.clues).toMatchObject({ shown: selfClues.clues.slice(0, 3), self: true, opens: null });
    expect(playerView(s, 'p2')?.question?.clues?.shown).toEqual([selfClues.clues[0]]);
    expect(JSON.stringify(playerView(s, 'p2'))).not.toContain(selfClues.clues[1]);
  });

  it('the reveal shows every clue and who answered on which clue', () => {
    let s = opened(openClassic(), 'p1', 2);
    s = must(submitAnswer(s, 'p1', right, 1500));
    s = must(submitAnswer(s, 'p2', right, 2000));
    s = revealed(s);
    const stage = stageView(s);
    expect(stage.reveal?.type === 'clues' ? stage.reveal.clues : null).toEqual(selfClues.clues);
    const opens = stage.question?.clues?.opens;
    expect(opens?.map((o) => o.answered)).toEqual([true, true, false]);
    expect(opens?.map((o) => o.opened)).toEqual([3, 1, 1]);
  });

  it('the host: live rows carry the clues progress, the answer the own clue number', () => {
    let s = opened(openClassic(), 'p1', 2);
    const row = (st: GameState, id: string) => hostView(st).live?.rows.find((r) => r.id === id);
    expect(row(s, 'p1')).toMatchObject({ progress: { kind: 'clues', opened: 3, total: 5 }, answered: false });
    expect(row(s, 'p2')).toMatchObject({ progress: { kind: 'clues', opened: 1, total: 5 } });
    s = must(submitAnswer(s, 'p1', right, 1500));
    expect(row(s, 'p1')).toMatchObject({ answered: true, clue: 3 });
    s = must(submitAnswer(s, 'p2', right, 25_000));
    s = revealed(s);
    const responses = hostView(s).responses;
    expect(responses.find((r) => r.playerId === 'p1')?.clue).toBe(3);
    expect(responses.find((r) => r.playerId === 'p2')?.clue).toBe(1);
  });

  it('a board watcher sees the chooser clues; the list has only the chooser', () => {
    const s = opened(pickedCell('phone'), 'p1', 1);
    expect(playerView(s, 'p2')?.question?.clues?.shown).toEqual(selfClues.clues.slice(0, 2));
    expect(playerView(s, 'p1')?.question?.clues?.shown).toEqual(selfClues.clues.slice(0, 2));
    expect(stageView(s).question?.clues?.opens).toEqual([{ playerId: 'p1', nickname: 'Анна', opened: 2, answered: false }]);
    expect(stageView(s).question?.clues?.shown).toEqual([selfClues.clues[0]]);
  });

  it('a voice cell stays with the host: not self, no list', () => {
    const s = pickedCell('voice');
    expect(stageView(s).question?.clues).toMatchObject({ self: false, opens: null, byHost: true });
  });

  it('in a team game teammates see the team clues, the other team its own', () => {
    let s = must(next(teamGame(teamQuiz([classicRound('r1', [selfClues])]), LAYOUT), 0, rng));
    s = opened(s, 't1', 1);
    expect(playerView(s, 'm2')?.question?.clues?.shown).toEqual(selfClues.clues.slice(0, 2));
    expect(playerView(s, 'm3')?.question?.clues?.shown).toEqual([selfClues.clues[0]]);
    expect(JSON.stringify(playerView(s, 'm3'))).not.toContain(selfClues.clues[1]);
    expect(stageView(s).question?.clues?.opens).toEqual(
      s.players.map((p) => ({ playerId: p.id, nickname: p.nickname, opened: p.id === 't1' ? 2 : 1, answered: false })),
    );
    expect(s.players.map((p) => p.id)).toEqual(['t1', 't2']);
  });

  it('without cluePace the timer opens clues as before', () => {
    const s = openClassic(clues);
    expect(stageView(s).question?.clues).toMatchObject({ self: false, opens: null, shown: [clues.clues[0]] });
    expect(hostView(s).live?.rows.find((r) => r.id === 'p1')?.progress).toBeNull();
    const later = tick(s, 5000);
    for (const view of [playerView(later, 'p1')!, stageView(later), hostView(later)]) {
      expect(view.question?.clues?.shown).toEqual(clues.clues.slice(0, 2));
    }
  });
});
