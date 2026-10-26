import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, LIMITS, type Answer, type Question } from '@quiz/shared';
import { createAutopilotGame } from './autopilot';
import { pickBluff, removeBluffOption, writeLie } from './bluff';
import { addPlayer, end, next, removePlayer, setConnected, start, submitAnswer, type GameState, type Rng } from './game';
import { assignTeam } from './teams';
import { hideCloudWord } from './votes';
import { hostView, playerView, stageView } from './views';
import { bluff, classicRound, cloud, makeQuiz, single } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamQuiz } from './testing/teams';

const rng: Rng = () => 0;
const T = 10_000;
const quizOf = (questions: Question[]) => makeQuiz(questions, { leaderboard: 'end', speedBonus: false, rules: { ...DEFAULT_RULES }, buffs: [] });

/** Автопілот: автор Оля p1, Петро p2, Віра p3; лобі. */
function pilotLobby(questions: Question[]): GameState {
  let s = must(createAutopilotGame(quizOf(questions), { id: 'p1', nickname: 'Оля' }));
  s = must(addPlayer(s, { id: 'p2', nickname: 'Петро' }));
  return must(addPlayer(s, { id: 'p3', nickname: 'Віра' }));
}

/** Перше запитання відкрито о T. */
const pilotOpen = (questions: Question[]) => must(next(must(start(pilotLobby(questions))), T, rng));

const words = (...list: string[]): Answer => ({ type: 'wordcloud', words: list });

/** Усі проголосували словами, етап locked. */
function cloudLocked(): GameState {
  let s = pilotOpen([cloud, single]);
  s = must(submitAnswer(s, 'p1', words('сонце', 'море'), T + 1000));
  s = must(submitAnswer(s, 'p2', words('сонце', 'ліс'), T + 2000));
  return must(submitAnswer(s, 'p3', words('Сонце'), T + 3000));
}

const cloudReveal = () => must(next(cloudLocked(), T + 4000, rng));

const optionId = (s: GameState, text: string) => s.plays[0].bluff!.options.find((o) => o.text === text)!.id;

function bluffChoice(): GameState {
  let s = pilotOpen([bluff, single]);
  s = must(writeLie(s, 'p1', 'Рим', T + 1000));
  s = must(writeLie(s, 'p2', 'РИМ', T + 2000));
  return must(writeLie(s, 'p3', 'Мілан', T + 3000));
}

describe('autopilot flag in views', () => {
  it('is true in every autopilot view and false in a hosted game', () => {
    const s = pilotOpen([single]);
    expect(stageView(s).autopilot).toBe(true);
    expect(playerView(s, 'p2')!.autopilot).toBe(true);
    expect(hostView(s).autopilot).toBe(true);
    const hosted = startRound(lobbyWith(quizOf([single]), 'Оля', 'Петро'), T, rng);
    expect(stageView(hosted).autopilot).toBe(false);
    expect(playerView(hosted, 'p1')!.autopilot).toBe(false);
    expect(hostView(hosted).autopilot).toBe(false);
  });
});

describe('author view', () => {
  it('only the author gets an object, in the lobby too; a hosted game gives null to all', () => {
    const s = pilotLobby([single]);
    expect(playerView(s, 'p1')!.author).toEqual({ cloud: null, bluff: null });
    expect(playerView(s, 'p2')!.author).toBeNull();
    const hosted = lobbyWith(quizOf([single]), 'Оля', 'Петро');
    expect(playerView(hosted, 'p1')!.author).toBeNull();
    expect(playerView(hosted, 'p2')!.author).toBeNull();
  });

  it('cloud words appear only at the reveal, with counts and without voters', () => {
    let s = cloudLocked();
    expect(s.phase).toBe('locked');
    expect(playerView(s, 'p1')!.author!.cloud).toBeNull();
    s = must(next(s, T + 4000, rng));
    expect(s.phase).toBe('reveal');
    const view = playerView(s, 'p1')!.author!;
    expect(view.cloud).toEqual([
      { key: 'сонце', text: 'сонце', count: 3, hidden: false },
      { key: 'ліс', text: 'ліс', count: 1, hidden: false },
      { key: 'море', text: 'море', count: 1, hidden: false },
    ]);
    const json = JSON.stringify(view);
    expect(json).not.toContain('"by"');
    expect(json).not.toContain('"playerIds"');
    for (const name of ['Петро', 'Віра', 'p2', 'p3']) expect(json).not.toContain(name);
    expect(playerView(s, 'p2')!.author).toBeNull();
    s = must(hideCloudWord(s, 'ліс', true));
    expect(playerView(s, 'p1')!.author!.cloud).toContainEqual({ key: 'ліс', text: 'ліс', count: 1, hidden: true });
    expect(stageView(s).cloud!.map((w) => w.key)).not.toContain('ліс');
  });

  it('shows the stage words, capped like the stage', () => {
    const many = Array.from({ length: LIMITS.cloudShown + 3 }, (_, i) => `слово${i}`);
    let s = pilotOpen([{ ...cloud, words: many.length }, single]);
    s = must(submitAnswer(s, 'p1', words(...many), T + 1000));
    s = must(submitAnswer(s, 'p2', words(many[0]), T + 2000));
    s = must(submitAnswer(s, 'p3', words(many[0]), T + 3000));
    s = must(next(s, T + 4000, rng));
    const shown = stageView(s).cloud!.map((w) => w.key);
    expect(shown).toHaveLength(LIMITS.cloudShown);
    expect(playerView(s, 'p1')!.author!.cloud!.map((w) => w.key)).toEqual(shown);
  });

  it('bluff options only at the choice stage, with no kind, authors or removed flag', () => {
    let s = pilotOpen([bluff, single]);
    s = must(writeLie(s, 'p1', 'Рим', T + 1000));
    expect(playerView(s, 'p1')!.author!.bluff).toBeNull();
    s = must(writeLie(s, 'p2', 'РИМ', T + 2000));
    s = must(writeLie(s, 'p3', 'Мілан', T + 3000));
    const author = playerView(s, 'p1')!.author!;
    expect(author.bluff).toEqual(playerView(s, 'p2')!.bluff!.options.map((o) => ({ id: o.id, text: o.text })));
    expect(author.bluff).toHaveLength(5);
    const json = JSON.stringify(author);
    for (const key of ['kind', 'authors', 'removed', 'pickedBy', 'open']) expect(json).not.toContain(`"${key}"`);
    const rome = optionId(s, 'Рим');
    s = must(removeBluffOption(s, rome));
    expect(playerView(s, 'p1')!.author!.bluff!.map((o) => o.id)).not.toContain(rome);
    expect(playerView(s, 'p1')!.author!.bluff).toHaveLength(4);
    s = must(pickBluff(s, 'p1', optionId(s, 'Мілан'), T + 4000));
    s = must(pickBluff(s, 'p2', optionId(s, 'Барселона'), T + 5000));
    s = must(pickBluff(s, 'p3', optionId(s, 'Барселона'), T + 6000));
    s = must(next(s, T + 8000, rng));
    expect(s.phase).toBe('reveal');
    expect(playerView(s, 'p1')!.author!.bluff).toBeNull();
  });

  it('a team game: the author is a member, the teammate gets null', () => {
    const quiz = teamQuiz([classicRound('r1', [single])]);
    let s = must(createAutopilotGame(quiz, { id: 'm1', nickname: 'Оля' }));
    for (const [id, nickname] of [['m2', 'Петро'], ['m3', 'Віра'], ['m4', 'Іван']]) s = must(addPlayer(s, { id, nickname }));
    expect(playerView(s, 'm1')!.author).toEqual({ cloud: null, bluff: null });
    expect(playerView(s, 'm2')!.author).toBeNull();
    s = must(assignTeam(s, 'm1', 't1'));
    s = must(assignTeam(s, 'm2', 't1'));
    s = must(assignTeam(s, 'm3', 't2'));
    s = must(assignTeam(s, 'm4', 't2'));
    s = must(start(s));
    expect(playerView(s, 'm1')!.author).toEqual({ cloud: null, bluff: null });
    expect(playerView(s, 'm2')!.author).toBeNull();
    expect(playerView(s, 'm1')!.autopilot).toBe(true);
  });
});

describe('nothing the author view adds leaks', () => {
  it('stage, host and other players never carry the author field or the author data', () => {
    for (const s of [cloudLocked(), cloudReveal(), bluffChoice()]) {
      expect(JSON.stringify(stageView(s))).not.toContain('"author"');
      expect(JSON.stringify(hostView(s))).not.toContain('"author"');
      for (const id of ['p2', 'p3']) expect(playerView(s, id)!.author).toBeNull();
    }
    // Правда блефу: варіанти автора ті самі, що в іншого гравця, правду від вигадки не відрізнити.
    const s = bluffChoice();
    expect(playerView(s, 'p1')!.author!.bluff).toEqual(playerView(s, 'p3')!.bluff!.options.map((o) => ({ id: o.id, text: o.text })));
  });

  it('the author cloud differs from the stage only by the hidden entries', () => {
    let s = cloudReveal();
    s = must(hideCloudWord(s, 'море', true));
    const author = playerView(s, 'p1')!.author!.cloud!;
    const stage = stageView(s).cloud!;
    expect(author.filter((w) => !w.hidden).map(({ key, text, count }) => ({ key, text, count }))).toEqual(stage);
    expect(JSON.stringify(playerView(s, 'p2')!)).not.toContain('"hidden":true');
  });
});

describe('author view gaps (11g task 6 review)', () => {
  it('stays with the author after a reconnect; a removed author has no view', () => {
    let s = pilotOpen([single]);
    s = must(setConnected(s, 'p1', false, T + 1000));
    s = must(setConnected(s, 'p1', true, T + 2000));
    expect(playerView(s, 'p1')!.author).toEqual({ cloud: null, bluff: null });
    const lobby = must(removePlayer(pilotLobby([single]), 'p1'));
    expect(playerView(lobby, 'p1')).toBeNull();
    for (const id of ['p2', 'p3']) expect(playerView(lobby, id)!.author).toBeNull();
  });

  it('the cloud is gone on the table and at the finish', () => {
    let s = cloudReveal();
    expect(playerView(s, 'p1')!.author!.cloud).not.toBeNull();
    s = must(next(s, T + 5000, rng));
    expect(s.phase).not.toBe('reveal');
    expect(playerView(s, 'p1')!.author!.cloud).toBeNull();
    s = must(end(s, T + 6000));
    expect(s.phase).toBe('finished');
    expect(playerView(s, 'p1')!.author).toEqual({ cloud: null, bluff: null });
  });

  it('a hidden word stays in the author list whether it was inside or outside the stage cap; hiding inside pulls the next one in', () => {
    const many = Array.from({ length: LIMITS.cloudShown + 3 }, (_, i) => `слово${i}`);
    let s = pilotOpen([{ ...cloud, words: many.length }, single]);
    s = must(submitAnswer(s, 'p1', words(...many), T + 1000));
    s = must(submitAnswer(s, 'p2', words(many[0]), T + 2000));
    s = must(submitAnswer(s, 'p3', words(many[0]), T + 3000));
    s = must(next(s, T + 4000, rng));
    const before = stageView(s).cloud!.map((w) => w.key);
    const outside = many.map((w) => w.toLowerCase()).find((key) => !before.includes(key))!;
    expect(outside).toBeDefined();
    s = must(hideCloudWord(s, outside, true));
    const author = playerView(s, 'p1')!.author!.cloud!;
    expect(author.find((w) => w.key === outside)?.hidden).toBe(true);
    expect(author.filter((w) => !w.hidden).map((w) => w.key)).toEqual(before);
    const inside = before[0];
    s = must(hideCloudWord(s, inside, true));
    const stage = stageView(s).cloud!.map((w) => w.key);
    expect(stage).toHaveLength(LIMITS.cloudShown);
    expect(stage).not.toContain(inside);
    const after = playerView(s, 'p1')!.author!.cloud!;
    expect(after.filter((w) => w.hidden).map((w) => w.key).sort()).toEqual([inside, outside].sort());
    expect(after.filter((w) => !w.hidden).map((w) => w.key)).toEqual(stage);
  });

  it('a teammate of the author gets author: null in the JSON', () => {
    const quiz = teamQuiz([classicRound('r1', [single])]);
    let s = must(createAutopilotGame(quiz, { id: 'm1', nickname: 'Оля' }));
    s = must(addPlayer(s, { id: 'm2', nickname: 'Петро' }));
    s = must(addPlayer(s, { id: 'm3', nickname: 'Віра' }));
    s = must(assignTeam(s, 'm1', 't1'));
    s = must(assignTeam(s, 'm2', 't1'));
    s = must(assignTeam(s, 'm3', 't2'));
    s = must(start(s));
    expect(JSON.stringify(playerView(s, 'm2'))).toContain('"author":null');
    expect(JSON.stringify(playerView(s, 'm3'))).toContain('"author":null');
  });
});
