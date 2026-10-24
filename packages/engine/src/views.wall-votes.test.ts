import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, LIMITS, type Question } from '@quiz/shared';
import { pickCell } from './board';
import { lock, next, removePlayer, submitAnswer, type GameState, type Rng } from './game';
import { guessWall } from './wall';
import { hideCloudWord } from './votes';
import { hostView, playerView, stageView } from './views';
import { boardRound, cloud, makeQuiz, makeRoundsQuiz, poll, single, wall, withId } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';

const rng: Rng = () => 0;

/** Класика [стіна]; Анна p1, Богдан p2; перше запитання відкрито о 0. */
function openClassic(questions: Question[] = [wall], names: string[] = ['Анна', 'Богдан']): GameState {
  const quiz = makeQuiz(questions, { leaderboard: 'end', rules: { ...DEFAULT_RULES } });
  return startRound(lobbyWith(quiz, ...names), 0, rng);
}

/** Позиції плиток у порядку показу. */
const at = (s: GameState, ...ids: string[]) => ids.map((id) => s.presented.indexOf(id));
const textOf = (id: string) => wall.groups.flatMap((g) => g.tiles).find((t) => t.id === id)?.text ?? '';
const WRONG = [
  ['r1', 'r2', 'r3', 'm1'],
  ['m1', 'm2', 'm3', 'l1'],
  ['l1', 'l2', 'l3', 'i1'],
];

/** Поле з p1 «Анна» і p2 «Богдан»: клітинка-стіна, p1 вибрав її о 0. */
function onWallCell(): GameState {
  const round = boardRound('g1', [
    { title: 'Стіни', cells: [{ mark: 'x2', answerMode: 'phone', question: wall }] },
    { title: 'Інше', cells: [withId(poll, 's1')] },
  ]);
  const s = startRound(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Анна', 'Богдан'), 0, rng);
  return must(pickCell(s, 'p1', 'q13', 0, rng));
}

describe('wall views', () => {
  it('wall groups never reach phones or the stage before the reveal', () => {
    let s = openClassic();
    s = must(guessWall(s, 'p1', at(s, 'r1', 'r2', 'r3', 'r4'), 1000));
    for (const phase of ['question', 'locked'] as const) {
      const t = phase === 'locked' ? must(lock(s)) : s;
      for (const view of [playerView(t, 'p1')!, playerView(t, 'p2')!, stageView(t)]) {
        const json = JSON.stringify(view);
        for (const group of wall.groups) expect(json).not.toContain(group.name);
        expect(json).not.toMatch(/"groups":\[|"gr"|"gm"|"r1"|"m1"/);
      }
    }
    const phone = playerView(s, 'p1')!;
    expect(phone.question?.wall).toEqual({ tiles: s.presented.map(textOf), size: 4, groupCount: 4, maxMistakes: 3 });
    expect(phone.me.wall).toMatchObject({ found: [{ tiles: at(s, 'r1', 'r2', 'r3', 'r4'), color: 0 }], mistakes: 0, canGuess: true });
    expect(playerView(s, 'p2')!.me.wall?.found).toEqual([]);
    expect(JSON.stringify(hostView(s).correct)).toContain('Річки');
  });

  it('the stage sees the wall rows only on the reveal; the host from the question', () => {
    let s = openClassic();
    s = must(guessWall(s, 'p1', at(s, 'r1', 'r2', 'r3', 'r4'), 1000));
    expect(hostView(s).wall?.rows[0]).toMatchObject({ playerId: 'p1', found: 1, points: null, tiles: [at(s, 'r1', 'r2', 'r3', 'r4')] });
    expect(stageView(s).wall).toBeNull();
    expect(playerView(s, 'p2')!.wall).toBeNull();
    s = must(lock(s));
    expect(stageView(s).wall).toBeNull();
    expect(hostView(s).wall).not.toBeNull();
    s = must(next(s, 5000, rng));
    expect(s.phase).toBe('reveal');
    const info = stageView(s).wall!;
    expect(info.groupCount).toBe(4);
    expect(info.rows.map((r) => [r.playerId, r.found, r.points])).toEqual([
      ['p1', 1, 250],
      ['p2', 0, null],
    ]);
    expect(info.rows.every((r) => r.tiles === null)).toBe(true);
  });

  it("on a board cell everyone watches the chooser's wall", () => {
    let s = onWallCell();
    s = must(guessWall(s, 'p1', at(s, 'r1', 'r2', 'r3', 'r4'), 1000));
    for (const view of [stageView(s), playerView(s, 'p2')!, hostView(s)]) {
      expect(view.wall?.rows).toHaveLength(1);
      expect(view.wall?.rows[0]).toMatchObject({ playerId: 'p1', found: 1, tiles: [at(s, 'r1', 'r2', 'r3', 'r4')] });
    }
    expect(playerView(s, 'p2')!.me.wall).toBeNull();
    expect(playerView(s, 'p1')!.me.wall).toMatchObject({ mistakes: 0, canGuess: true });
    expect(JSON.stringify(stageView(s))).not.toContain('Річки');
  });

  it('locked and solved flags', () => {
    let s = openClassic();
    for (const [k, pick] of WRONG.entries()) s = must(guessWall(s, 'p1', at(s, ...pick), 1000 + k));
    expect(playerView(s, 'p1')!.me.wall).toMatchObject({ mistakes: 3, locked: true, solved: false, canGuess: false });
    expect(hostView(s).wall?.rows.find((r) => r.playerId === 'p1')).toMatchObject({ locked: true, solved: false });
    let t = openClassic();
    for (const [k, prefix] of ['r', 'm', 'l'].entries()) t = must(guessWall(t, 'p1', at(t, ...[1, 2, 3, 4].map((i) => `${prefix}${i}`)), 1000 + k));
    expect(playerView(t, 'p1')!.me.wall).toMatchObject({ solved: true, locked: false, canGuess: false });
    expect(playerView(t, 'p1')!.me.wall?.found).toHaveLength(4);
    expect(hostView(t).wall?.rows[0]).toMatchObject({ playerId: 'p1', solved: true, found: 4 });
  });
});

describe('poll views', () => {
  it('poll choices and reveal counts', () => {
    let s = openClassic([poll]);
    expect(playerView(s, 'p1')!.question?.choices).toHaveLength(3);
    expect(hostView(s).question?.wall).toBeNull();
    s = must(submitAnswer(s, 'p1', { type: 'poll', optionId: 'b' }, 1000));
    s = must(submitAnswer(s, 'p2', { type: 'poll', optionId: 'b' }, 1500));
    s = must(next(s, 5000, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).stats).toEqual({ answered: 2, accepted: null, counts: { b: 2 } });
    expect(playerView(s, 'p1')!.me.result).toBeNull();
    expect(playerView(s, 'p1')!.me.answer).toEqual({ type: 'poll', optionId: 'b' });
  });

  it('host responses carry no verdict for votes', () => {
    let s = openClassic([poll]);
    s = must(submitAnswer(s, 'p1', { type: 'poll', optionId: 'b' }, 1000));
    expect(hostView(s).responses).toEqual([
      expect.objectContaining({ playerId: 'p1', accepted: null, grade: null, points: 0, answer: { type: 'poll', optionId: 'b' } }),
    ]);
    let c = openClassic([cloud]);
    c = must(submitAnswer(c, 'p1', { type: 'wordcloud', words: ['київ'] }, 1000));
    expect(hostView(c).responses[0]).toMatchObject({ accepted: null, grade: null });
    expect(stageView(must(next(must(lock(c)), 5000, rng))).stats).toEqual({ answered: 1, accepted: null, counts: {} });
    expect(playerView(must(next(must(lock(c)), 5000, rng)), 'p1')!.me.result).toBeNull();
    // Оцінене запитання лишається з вердиктом.
    let w = openClassic([withId(single, 's1')]);
    w = must(submitAnswer(w, 'p1', { type: 'single', optionId: 'b' }, 1000));
    expect(hostView(w).responses[0]).toMatchObject({ accepted: expect.any(Boolean), grade: expect.any(String) });
  });
});

describe('word cloud views', () => {
  it('the cloud reaches the stage only on the reveal, without hidden words', () => {
    let s = openClassic([cloud]);
    s = must(submitAnswer(s, 'p1', { type: 'wordcloud', words: ['каштани', 'лайка'] }, 1000));
    s = must(hideCloudWord(s, 'лайка', true));
    s = must(submitAnswer(s, 'p2', { type: 'wordcloud', words: ['каштани'] }, 1500));
    expect(s.phase).toBe('locked');
    expect(stageView(s).cloud).toBeNull();
    expect(stageView(s).cloudVoters).toBeNull();
    s = must(next(s, 5000, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).cloud).toEqual([{ key: 'каштани', text: 'каштани', count: 2 }]);
    expect(stageView(s).cloudVoters).toBe(2);
    expect(JSON.stringify(stageView(s))).not.toContain('лайка');
    expect(JSON.stringify(playerView(s, 'p2'))).not.toContain('лайка');
    // Повернене слово знову йде на сцену.
    s = must(hideCloudWord(s, 'лайка', false));
    expect(stageView(s).cloud?.map((w) => w.key)).toEqual(['каштани', 'лайка']);
  });

  it('the cloud is not on the stage while the question is open, hidden or not', () => {
    let s = openClassic([cloud]);
    s = must(submitAnswer(s, 'p1', { type: 'wordcloud', words: ['каштани'] }, 1000));
    expect(stageView(s).cloud).toBeNull();
    expect(JSON.stringify(stageView(s))).not.toContain('каштани');
    expect(JSON.stringify(playerView(s, 'p2'))).not.toContain('каштани');
    expect(playerView(s, 'p2')!.question?.cloud).toEqual({ words: 3 });
  });

  it('the host sees the whole cloud with hidden words and authors from the question', () => {
    let s = openClassic([cloud]);
    s = must(submitAnswer(s, 'p1', { type: 'wordcloud', words: ['каштани', 'лайка'] }, 1000));
    s = must(submitAnswer(s, 'p2', { type: 'wordcloud', words: ['каштани'] }, 1500));
    s = must(hideCloudWord(s, 'лайка', true));
    expect(hostView(s).cloud).toEqual([
      { key: 'каштани', text: 'каштани', count: 2, hidden: false, by: ['Анна', 'Богдан'] },
      { key: 'лайка', text: 'лайка', count: 1, hidden: true, by: ['Анна'] },
    ]);
  });

  it('the stage shows at most cloudShown words', () => {
    const names = Array.from({ length: 45 }, (_, i) => `Гравець${i}`);
    let s = openClassic([cloud], names);
    for (const [i, p] of s.players.entries()) s = must(submitAnswer(s, p.id, { type: 'wordcloud', words: [`слово${i}`] }, 1000 + i));
    s = must(next(s, 5000, rng));
    expect(s.phase).toBe('reveal');
    expect(stageView(s).cloud).toHaveLength(LIMITS.cloudShown);
    expect(hostView(s).cloud).toHaveLength(45);
    // Вилучений гравець не рахується в підписі «Написали N».
    s = must(removePlayer(s, 'p1'));
    expect(stageView(s).cloudVoters).toBe(44);
  });
});
