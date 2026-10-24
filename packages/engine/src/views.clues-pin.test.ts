import { type Answer, type Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { pickCell } from './board';
import { nextClue } from './clues';
import { lock, next, override, pause, start, submitAnswer, tick, type GameState } from './game';
import { boardRound, classicRound, clues, makeRoundsQuiz, pin, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const rng = () => 0;
const at = (x: number, y = 0.5): Answer => ({ type: 'pin', x, y });
const named: Answer = { type: 'clues', value: 'Шевченко' };

/** Класика [«Хто я?», точка] без бонусу швидкості, перше запитання відкрите в момент 0; Анна p1, Богдан p2. */
function openClassic(questions: Question[] = [clues, pin]): GameState {
  const round = classicRound('r1', questions, { speedBonus: false });
  return startRound(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан'), 0, rng);
}

/** Закрити поточне запитання й відкрити наступне. */
function toNext(state: GameState): GameState {
  let s = must(next(must(lock(state)), 0, rng));
  while (s.phase !== 'question') s = must(next(s, 0, rng));
  return s;
}

/** Поле з однією клітинкою; Анна вибрала її в момент 0. */
function pickedCell(question: Question, answerMode: 'phone' | 'voice'): GameState {
  const round = boardRound('g1', [{ title: 'A', cells: [question] }], { answerMode });
  const intro = must(start(lobbyWith(makeRoundsQuiz([round]), 'Анна', 'Богдан')));
  return must(pickCell(must(next(intro, 0)), null, question.id, 0, rng));
}

describe('clues in the views', () => {
  it('hidden clues never reach phones or the stage', () => {
    const s = openClassic();
    const phone = playerView(s, 'p1')!;
    expect(phone.question?.clues).toMatchObject({ total: 5, shown: ['Я народився 1814 року.'], nextAt: 5000, byHost: false, intervalSeconds: 5 });
    for (const view of [phone, stageView(s)]) {
      const json = JSON.stringify(view);
      for (const hidden of clues.clues.slice(1)) expect(json).not.toContain(hidden);
      expect(json).not.toMatch(/Шевченко|"accepted"/);
    }
    expect(JSON.stringify(hostView(s).correct)).toContain('Я на купюрі 100 гривень.');
  });

  it('the next clue reaches every view after the tick', () => {
    const s = tick(openClassic(), 5000);
    for (const view of [playerView(s, 'p1')!, stageView(s), hostView(s)]) {
      expect(view.question?.clues?.shown).toEqual(clues.clues.slice(0, 2));
      expect(view.question?.clues?.nextAt).toBe(10_000);
    }
  });

  it('nextAt is null on pause and on a voice cell; byHost on a voice cell', () => {
    const paused = must(pause(openClassic(), 1000));
    expect(playerView(paused, 'p1')!.question?.clues?.nextAt).toBeNull();
    const voice = pickedCell(clues, 'voice');
    expect(stageView(voice).question?.clues).toMatchObject({ nextAt: null, byHost: true, shown: [clues.clues[0]] });
    expect(JSON.stringify(stageView(voice))).not.toContain(clues.clues[1]);
    const phone = pickedCell(clues, 'phone');
    expect(stageView(phone).question?.clues).toMatchObject({ byHost: false });
  });

  it('host responses carry the clue number', () => {
    const classic = must(submitAnswer(openClassic(), 'p1', named, 6000));
    expect(hostView(classic).responses[0].clue).toBe(2);
    let voice = must(nextClue(pickedCell(clues, 'voice'), 1000));
    voice = must(nextClue(voice, 2000));
    voice = must(override(voice, 'p1', 'correct', 3000));
    expect(hostView(voice).responses[0].clue).toBe(3);
    const point = must(submitAnswer(toNext(openClassic()), 'p1', at(0.5), 1000));
    expect(hostView(point).responses[0].clue).toBeNull();
  });
});

describe('pin in the views', () => {
  const pinOpen = () => toNext(openClassic());

  it('pin target and circles never reach phones or the stage before the reveal', () => {
    let s = pinOpen();
    const phone = playerView(s, 'p1')!;
    expect(phone.question?.pin).toEqual({ map: 'world', aspect: 2 });
    expect(phone.question?.clues).toBeNull();
    const hidden = /"target"|fullRadius|zeroRadius/;
    for (const view of [phone, stageView(s)]) expect(JSON.stringify(view)).not.toMatch(hidden);
    s = must(lock(s));
    for (const view of [playerView(s, 'p1')!, stageView(s)]) expect(JSON.stringify(view)).not.toMatch(hidden);
    s = must(next(s, 0, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).reveal).toMatchObject({ target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 });
  });

  it('the stage gets the pins only on the reveal, closest first', () => {
    let s = pinOpen();
    s = must(submitAnswer(s, 'p1', at(0.59), 1000));
    s = must(submitAnswer(s, 'p2', at(0.52), 1000));
    expect(stageView(s).pinMarks).toBeNull();
    expect(s.phase).toBe('locked');
    expect(stageView(s).pinMarks).toBeNull();
    s = must(next(s, 0, rng));
    expect(stageView(s).pinMarks).toEqual([
      { playerId: 'p2', nickname: 'Богдан', x: 0.52, y: 0.5, points: 1000 },
      { playerId: 'p1', nickname: 'Анна', x: 0.59, y: 0.5, points: 500 },
    ]);
  });

  it('the host sees the pins while the question runs', () => {
    let s = pinOpen();
    expect(hostView(s).pinMarks).toEqual([]);
    s = must(submitAnswer(s, 'p1', at(0.59), 1000));
    expect(hostView(s).pinMarks).toEqual([{ playerId: 'p1', nickname: 'Анна', x: 0.59, y: 0.5, points: 500 }]);
    expect(stageView(s).pinMarks).toBeNull();
  });

  it('other types have no pin marks and no pin base', () => {
    const s = openClassic();
    expect(hostView(s).pinMarks).toBeNull();
    expect(playerView(s, 'p1')!.question?.pin).toBeNull();
  });

  it('an own-picture pin keeps the picture url for everyone', () => {
    const own: Question = withId({ ...pin, map: null, imageUrl: `/uploads/${'c'.repeat(32)}.png` }, 'q-own');
    const s = openClassic([own]);
    for (const view of [playerView(s, 'p1')!, stageView(s), hostView(s)]) {
      expect(view.question?.imageUrl).toBe(own.imageUrl);
      expect(view.question?.pin).toEqual({ map: null, aspect: 2 });
    }
  });
});
