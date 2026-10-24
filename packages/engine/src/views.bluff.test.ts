import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Question } from '@quiz/shared';
import { bluffOrder, bluffShown, pickBluff, removeBluffOption, revealBluffAll, writeLie } from './bluff';
import { next, type GameState, type Rng } from './game';
import { hostView, playerView, stageView } from './views';
import { bluff, makeQuiz, single } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng: Rng = () => 0;
const T = 10_000;
/** Вид варіанта блефу в JSON (а не вид дебафу з крамниці). */
const KIND = /"kind":"(truth|lie|spare)"/;
const at = (_s: GameState, ms: number) => T + ms;

/** Класика без бонусу швидкості; Оля p1, Петро p2, Віра p3; перше запитання відкрито о T. */
function openClassic(questions: Question[], leaderboard: 'end' | 'each' = 'end'): GameState {
  const quiz = makeQuiz(questions, { leaderboard, speedBonus: false, rules: { ...DEFAULT_RULES }, buffs: [] });
  return startRound(lobbyWith(quiz, 'Оля', 'Петро', 'Віра'), T, rng);
}

/** Оля «Рим», Петро «РИМ», Віра «Мілан» — почався вибір. */
function toChoice(questions: Question[] = [bluff, single], leaderboard: 'end' | 'each' = 'end'): GameState {
  let s = openClassic(questions, leaderboard);
  s = must(writeLie(s, 'p1', 'Рим', at(s, 1000)));
  s = must(writeLie(s, 'p2', 'РИМ', at(s, 2000)));
  return must(writeLie(s, 'p3', 'Мілан', at(s, 3000)));
}

const optionId = (s: GameState, text: string) => s.plays[0].bluff!.options.find((o) => o.text === text)!.id;

/** Оля вибрала «Мілан», Петро — правду, Віра — «Рим»; усі вибрали, етап locked. */
function picked(questions?: Question[], leaderboard?: 'end' | 'each'): GameState {
  let s = toChoice(questions, leaderboard);
  s = must(pickBluff(s, 'p1', optionId(s, 'Мілан'), at(s, 4000)));
  s = must(pickBluff(s, 'p2', optionId(s, 'Барселона'), at(s, 5000)));
  return must(pickBluff(s, 'p3', optionId(s, 'Рим'), at(s, 6000)));
}

/** Етап reveal, жодного варіанта ще не відкрито. */
function atReveal(questions?: Question[], leaderboard?: 'end' | 'each'): GameState {
  const s = picked(questions, leaderboard);
  return must(next(s, at(s, 8000), rng));
}

describe('bluff views', () => {
  it("truth, spares and others' lies never reach phones or the stage during the lies", () => {
    let s = openClassic([bluff, single]);
    s = must(writeLie(s, 'p1', 'Рим', at(s, 1000)));
    for (const view of [playerView(s, 'p2')!, playerView(s, 'p3')!, stageView(s)]) {
      const json = JSON.stringify(view);
      for (const text of ['Барселона', 'Барселоні', 'Мадрид', 'Лондон', 'Брюссель', 'Рим']) expect(json).not.toContain(text);
    }
    expect(playerView(s, 'p1')!.me.bluff).toEqual({ lie: 'Рим', own: [], pick: null, truth: null, fooled: null });
    expect(stageView(s).bluff).toMatchObject({ stage: 'lies', written: 1, options: [] });
    expect(hostView(s).bluff?.lies).toEqual([{ nickname: 'Оля', text: 'Рим' }]);
  });

  it('options carry no kind, authors or picks during the choice', () => {
    let s = toChoice();
    s = must(pickBluff(s, 'p3', optionId(s, 'Рим'), at(s, 4000)));
    const rome = optionId(s, 'Рим');
    for (const view of [playerView(s, 'p2')!, stageView(s)]) {
      expect(view.bluff).toMatchObject({ stage: 'choice', picked: 1, written: 3 });
      expect(view.bluff!.options).toHaveLength(5);
      const json = JSON.stringify(view);
      expect(json).not.toMatch(KIND);
      expect(json).not.toContain('"authors":[');
      expect(json).not.toContain('"pickedBy":[');
    }
    expect(playerView(s, 'p1')!.me.bluff!.own).toEqual([rome]);
    expect(playerView(s, 'p2')!.me.bluff!.own).toEqual([rome]);
    expect(playerView(s, 'p3')!.me.bluff!.pick).toBe(rome);
    const host = hostView(s).bluff!;
    expect(host.options.find((o) => o.id === rome)).toMatchObject({ kind: 'lie', authors: ['Оля', 'Петро'], pickedBy: ['Віра'] });
    expect(host.options.find((o) => o.text === 'Барселона')?.kind).toBe('truth');
  });

  it('a removed lie disappears from phones and the stage, the host still sees it', () => {
    let s = toChoice();
    const rome = optionId(s, 'Рим');
    s = must(removeBluffOption(s, rome));
    for (const view of [playerView(s, 'p3')!, stageView(s)]) {
      expect(view.bluff!.options).toHaveLength(4);
      expect(view.bluff!.options.some((o) => o.id === rome)).toBe(false);
    }
    expect(playerView(s, 'p1')!.me.bluff!.own).toEqual([]);
    expect(hostView(s).bluff!.options.find((o) => o.id === rome)).toMatchObject({ removed: true });
  });

  it('nothing is shown on locked', () => {
    const s = picked();
    expect(s.phase).toBe('locked');
    for (const id of ['p1', 'p2', 'p3']) {
      const view = playerView(s, id)!;
      expect(view.me.answer).toBeNull();
      expect(view.me.result).toBeNull();
      expect(view.me.score).toBe(0);
    }
    expect(JSON.stringify(stageView(s))).not.toMatch(KIND);
  });

  it('the stage gets kind and names only for opened options; the truth last', () => {
    let s = atReveal();
    expect(stageView(s).bluff).toMatchObject({ stage: 'reveal', shown: 0, total: 5 });
    s = must(next(s, at(s, 9000), rng));
    s = must(next(s, at(s, 9500), rng));
    const view = stageView(s);
    const options = view.bluff!.options;
    expect(options.map((o) => o.open)).toEqual([true, true, false, false, false]);
    for (const o of options.slice(0, 2)) {
      expect(o.kind).not.toBeNull();
      expect(o.authors).not.toBeNull();
      expect(o.pickedBy).not.toBeNull();
    }
    for (const o of options.slice(2)) expect(o).toMatchObject({ kind: null, authors: null, pickedBy: null });
    expect(JSON.stringify(view)).not.toContain('"kind":"truth"');
    expect(view.reveal).toMatchObject({ accepted: [], lies: [] });
    expect(bluffOrder(s.plays[0]).at(-1)?.kind).toBe('truth');
  });

  it('the phone result waits for the truth', () => {
    let s = atReveal();
    const before = playerView(s, 'p2')!;
    expect(before.me.result).toBeNull();
    expect(before.me.answer).toBeNull();
    expect(before.me.bluff).toMatchObject({ truth: null, fooled: null });
    expect(before.me.score).toBe(0);
    expect(stageView(s).stats?.accepted).toBeNull();
    // чотири варіанти з п'яти відкриті: правда ще закрита
    for (let i = 0; i < 4; i += 1) s = must(next(s, at(s, 9000 + i), rng));
    expect(playerView(s, 'p2')!.me.result).toBeNull();
    expect(playerView(s, 'p2')!.me.bluff!.truth).toBeNull();
    expect(playerView(s, 'p2')!.me.score).toBe(0);
    s = must(next(s, at(s, 9100), rng));
    expect(bluffShown(s, s.plays[0])).toBe(5);
    const after = playerView(s, 'p2')!;
    expect(after.me.result?.points).toBe(1500);
    expect(after.me.bluff).toMatchObject({ truth: true, fooled: 1 });
    expect(playerView(s, 'p1')!.me.bluff).toMatchObject({ truth: false, fooled: 1 });
    expect(stageView(s).stats?.accepted).toBe(1);
  });

  it('open all releases the held result at once', () => {
    const s = must(revealBluffAll(atReveal()));
    expect(playerView(s, 'p2')!.me.result?.points).toBe(1500);
    expect(stageView(s).bluff!.options.every((o) => o.open)).toBe(true);
  });

  it('everything is open after the reveal', () => {
    let s = atReveal([bluff, single], 'each');
    for (let i = 0; i < 5; i += 1) s = must(next(s, at(s, 9000 + i), rng));
    expect(s.phase).toBe('reveal');
    s = must(next(s, at(s, 10_000), rng));
    expect(s.phase).toBe('leaderboard');
    const view = stageView(s);
    expect(view.bluff!.stage).toBe('reveal');
    expect(view.bluff!.options.every((o) => o.open && o.kind !== null)).toBe(true);
  });

  it('answeredCount follows the stage', () => {
    let s = openClassic([bluff, single]);
    s = must(writeLie(s, 'p1', 'Рим', at(s, 1000)));
    expect(stageView(s).answeredCount).toBe(1);
    s = must(writeLie(s, 'p2', 'РИМ', at(s, 2000)));
    s = must(writeLie(s, 'p3', 'Мілан', at(s, 3000)));
    expect(stageView(s).answeredCount).toBe(0);
    s = must(pickBluff(s, 'p1', optionId(s, 'Мілан'), at(s, 4000)));
    expect(stageView(s).answeredCount).toBe(1);
  });

  it('other question types have no bluff block', () => {
    const s = openClassic([single, bluff]);
    expect(stageView(s).bluff).toBeNull();
    expect(playerView(s, 'p1')!.me.bluff).toBeNull();
  });
});
