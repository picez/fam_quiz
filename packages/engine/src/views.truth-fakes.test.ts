import { describe, expect, it } from 'vitest';
import type { Answer } from '@quiz/shared';
import { seededRng } from './bluff';
import { lock, next, start, submitAnswer, type GameState, type Play } from './game';
import { setTruthFake, submitTruth } from './truth';
import { classicRound, makeRoundsQuiz, single, truthRound } from './testing/fixtures';
import { hostView, playerView, stageView } from './views';
import { lobbyWith, must } from './testing/helpers';

// «Правда про гравця» (52): зрізи раунду з вигадками ведучого — зал не відрізняє вигадку від факту до розкриття, пульт бачить.

const t0 = 1_000_000;
const rng0 = () => 0;
const deal = () => seededRng(7);
const PRESET = 'Я тричі бачила північне сяйво';
const ADDED = 'Я вмію жонглювати';
const FACTS: Record<string, string> = { p1: 'Я стрибала з парашутом', p2: 'Я знаю шість мов', p3: 'Я виростив лимон на балконі' };
const MADE_UP = { id: 'fake', text: 'Вигадка' };
const IDS = ['p1', 'p2', 'p3', 'p4'];
const pick = (optionId: string): Answer => ({ type: 'single', optionId });
const play = (s: GameState) => s.plays[s.questionIndex];
const json = (value: unknown) => JSON.stringify(value);
const isFake = (p: Play) => p.truth?.fake === true;

/** Оля p1, Петро p2, Марко p3, Ната p4; факти в трьох перших; заготовлена вигадка fake-1 і (added) додана в лобі fake-2. */
function lobby(facts: Record<string, string> = FACTS, added = true, presets: string[] | null = [PRESET]): GameState {
  const quiz = makeRoundsQuiz([truthRound('r1', presets === null ? {} : { fakes: presets }), classicRound('r2', [single])], { leaderboard: 'end' });
  let s = lobbyWith(quiz, 'Оля', 'Петро', 'Марко', 'Ната');
  for (const [id, text] of Object.entries(facts)) s = must(submitTruth(s, id, text, 0));
  return added ? must(setTruthFake(s, null, ADDED)) : s;
}

/** «Почати гру» й перше запитання r1. */
const opened = (l: GameState = lobby()) => must(next(must(start(l)), t0, deal()));

/** Іде запитаннями раунду (без відповідей), доки не відкриється те, що підходить. */
function questionWhere(s: GameState, wanted: (p: Play) => boolean): GameState {
  for (let i = 0; i < 40 && !(s.phase === 'question' && wanted(play(s))); i++) s = s.phase === 'question' ? must(lock(s)) : must(next(s, t0, rng0));
  expect(s.phase).toBe('question');
  return s;
}

/** Зали: сцена й телефони не-авторів (автор факту бачить own — це його знання, не витік). */
const hallViews = (s: GameState, author: string | null) => [
  stageView(s),
  ...IDS.filter((id) => id !== author).map((id) => playerView(s, id)),
];

describe('truth fake views (52)', () => {
  it('the stage and the phones cannot tell a fake from a fact', () => {
    const first = opened();
    expect(first.truth?.deck).toHaveLength(5);
    const fake = questionWhere(first, isFake);
    const fact = questionWhere(first, (p) => p.truth?.authorId === 'p3');
    for (const [f, r] of [
      [fake, fact],
      [must(lock(fake)), must(lock(fact))],
    ] as const) {
      const a = hallViews(f, null);
      const b = hallViews(r, 'p3');
      // текст вигадки — лише як текст поточного запитання-вигадки
      const otherFake = play(f).question.text === PRESET ? ADDED : PRESET;
      for (const view of [...a, ...b]) {
        const text = json(view);
        for (const leak of ['"fake":true', 'fake-1', 'fake-2', 'correctId', 'authorId', otherFake]) expect(text).not.toContain(leak);
        expect(json(b)).not.toContain(PRESET);
        expect(json(b)).not.toContain(ADDED);
        expect(view?.playerCount).toBe(0);
        expect(view?.answeredCount).toBe(0);
        expect(view?.truth?.faked).toBe(true);
        expect(view?.truth?.reveal).toBeNull();
        expect(view?.question?.choices.map((c) => c.id)).toEqual(['p3', 'p4', 'p1', 'p2', 'fake']);
        expect(view?.question?.choices.at(-1)).toEqual(MADE_UP);
      }
    }
  });

  it('a mid-round reveal of a fake stays sealed for the hall', () => {
    let s = questionWhere(opened(), isFake);
    s = must(submitAnswer(s, 'p1', pick('fake'), t0 + 1000));
    s = must(next(must(lock(s)), t0, rng0));
    expect(s.phase).toBe('reveal');
    expect(hostView(s).truth?.reveal?.fake).toBe(true);
    for (const view of hallViews(s, null)) {
      expect(view?.phase).toBe('locked');
      expect(view?.truth?.sealed).toBe(true);
      expect(view?.truth?.reveal).toBeNull();
      expect(json(view)).not.toContain('"fake":true');
      expect(json(view)).not.toMatch(/fake-\d/);
    }
  });

  it('the host sees the mark', () => {
    const first = opened();
    const fake = questionWhere(first, isFake);
    const host = hostView(fake);
    expect(host.truth?.author).toEqual({ id: play(fake).truth?.authorId, nickname: '', fake: true });
    expect(host.truth?.author?.id).toMatch(/^fake-\d$/);
    expect(host.playerCount).toBe(4);
    const fact = hostView(questionWhere(first, (p) => p.truth?.authorId === 'p3')).truth?.author;
    expect(fact).toEqual({ id: 'p3', nickname: 'Марко' });
    expect(hostView(first).truth?.fakes.map((f) => ({ id: f.id, text: f.text, preset: f.preset, inDeck: f.inDeck }))).toEqual([
      { id: 'fake-1', text: PRESET, preset: true, inDeck: true },
      { id: 'fake-2', text: ADDED, preset: false, inDeck: true },
    ]);
    // до роздачі: 1 справжній факт і 2 вигадки — друга не зіграється
    expect(hostView(lobby({ p1: FACTS.p1 })).truth?.fakes.map((f) => f.inDeck)).toEqual([true, false]);
    // без вигадок — порожній список
    expect(hostView(lobby(FACTS, false, null)).truth?.fakes).toEqual([]);
  });

  it('the recap says «made up by the host»', () => {
    let s = opened();
    const fakeCard: unknown[] = [];
    for (let i = 0; i < 60 && s.phase !== 'round_end'; i++) {
      if (s.phase === 'question' && isFake(play(s))) s = must(submitAnswer(s, 'p1', pick('fake'), t0 + 1000));
      s = s.phase === 'question' ? must(lock(s)) : must(next(s, t0, rng0));
      if (s.phase === 'reveal' && stageView(s).truth?.recap !== undefined) break;
    }
    expect(s.phase).toBe('reveal');
    const recap = stageView(s).truth?.recap;
    expect(recap?.facts).toHaveLength(5);
    const fakes = recap?.facts.filter((f) => f.fake === true) ?? [];
    expect(fakes.map((f) => f.text).sort()).toEqual([ADDED, PRESET].sort());
    for (const card of fakes) {
      fakeCard.push(card);
      expect(card).toMatchObject({ fake: true, author: { nickname: '' }, points: 0 });
      expect(card.author.id).toMatch(/^fake-\d$/);
      expect(card.picks.map((p) => p.id)).toEqual(IDS);
      expect(card.picks.find((p) => p.id === 'p1')).toMatchObject({ pickedId: 'fake', picked: 'Вигадка', correct: true });
      expect(card.picks.find((p) => p.id === 'p2')).toMatchObject({ pickedId: null, correct: false });
    }
    // справжні факти — без позначки
    for (const card of recap?.facts.filter((f) => f.fake !== true) ?? []) {
      expect(Object.hasOwn(card, 'fake')).toBe(false);
      expect(card.author.nickname).not.toBe('');
    }
    expect(fakeCard).toHaveLength(2);
  });

  it('the lobby count stays the real facts', () => {
    const l = lobby();
    expect(stageView(l).truth?.count).toBe(3);
    expect(Object.hasOwn(stageView(l).truth ?? {}, 'faked')).toBe(false);
    expect(json(stageView(l))).not.toContain(PRESET);
    expect(json(stageView(l))).not.toContain(ADDED);
    expect(stageView(opened(l)).truth?.count).toBe(5);
  });

  it('a round without fakes keeps its counter', () => {
    const s = opened(lobby(FACTS, false, null));
    const locked = must(lock(s));
    expect(stageView(locked).playerCount).toBe(3);
    expect(Object.hasOwn(stageView(locked).truth ?? {}, 'faked')).toBe(false);
    expect(hostView(locked).truth?.author).not.toHaveProperty('fake');
  });
});
