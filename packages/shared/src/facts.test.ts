import { describe, expect, it } from 'vitest';
import {
  AWARD_ORDER,
  FACT_LIMITS,
  bluffFact,
  factLimitMs,
  factTable,
  gameAwards,
  gameCard,
  ownRevealFact,
  revealFacts,
  roundCard,
  roundFacts,
  roundShares,
  type FactCard,
  type FactInput,
  type FactQuestion,
  type FactRow,
} from './facts';
import type { Question, Round } from './quiz';
import type { Answer } from './answer';

type Player = FactInput['players'][number];

const PLAYERS: Player[] = [
  { id: 'o', nickname: 'Оля', rank: 1, score: 0, rounds: [] },
  { id: 'p', nickname: 'Петро', rank: 2, score: 0, rounds: [] },
  { id: 'i', nickname: 'Іра', rank: 3, score: 0, rounds: [] },
  { id: 'm', nickname: 'Марко', rank: 4, score: 0, rounds: [] },
];

/** Зігране запитання: межа 20 с, з балами, решта прапорців false. */
function q(index: number, roundIndex: number, extra: Partial<FactQuestion> = {}): FactQuestion {
  return { index, roundIndex, number: index + 1, text: `Q${index}`, limitMs: 20000, scored: true, board: false, blitz: false, bluff: false, final: false, ...extra };
}

/** Рядок «учасник × спроба»; roundIndex береться з extra (типово 0). */
function row(playerId: string, questionIndex: number, accepted: boolean, timeMs: number, extra: Partial<FactRow> = {}): FactRow {
  return { playerId, questionIndex, roundIndex: 0, attempt: 0, timeMs, accepted, buff: null, spare: false, wager: null, bluff: null, ...extra };
}

/** Штучний FactInput: типово одне запитання q(0, 0) і учасники Оля, Петро, Іра, Марко з місцями 1–4. */
function input(rows: FactRow[], extra: Partial<FactInput> = {}): FactInput {
  return { players: PLAYERS, questions: [q(0, 0)], rows, debuffs: [], ...extra };
}

/** Картка виду з набору або null. */
function find<K extends FactCard['kind']>(cards: FactCard[], kind: K): Extract<FactCard, { kind: K }> | null {
  return (cards.find((c) => c.kind === kind) as Extract<FactCard, { kind: K }> | undefined) ?? null;
}

const lie = (fooled = 0) => ({ pick: true, truth: false, fooled });
const truth = (fooled = 0) => ({ pick: true, truth: true, fooled });

/** Учасники з балами раундів: після першого раунду Оля 1, Іра 2, Марко 3, Петро 4; у фіналі Оля 1, Петро 2, Іра 3, Марко 4. */
const RISERS: Player[] = [
  { id: 'o', nickname: 'Оля', rank: 1, score: 800, rounds: [400, 400] },
  { id: 'p', nickname: 'Петро', rank: 2, score: 700, rounds: [100, 600] },
  { id: 'i', nickname: 'Іра', rank: 3, score: 600, rounds: [300, 300] },
  { id: 'm', nickname: 'Марко', rank: 4, score: 300, rounds: [200, 100] },
];

describe('in-game facts (12d)', () => {
  it('the reveal line counts main answers, names the fastest right one and needs two answers', () => {
    const facts = revealFacts(input([row('o', 0, true, 2100), row('p', 0, false, 1500), row('i', 0, true, 2100), row('m', 0, true, 4000)]), 0);
    expect(facts).toEqual({ accepted: 3, answered: 4, fastest: { names: ['Оля', 'Іра'], timeMs: 2100 }, bluff: null });
    expect(revealFacts(input([row('o', 0, true, 2100)]), 0)).toBeNull();
  });

  it('the phone gets the own place among right answers or the share', () => {
    const all = input([row('o', 0, true, 2100), row('p', 0, false, 1500), row('i', 0, true, 1900), row('m', 0, true, 4000)]);
    expect(ownRevealFact(all, 0, 'o')).toEqual({ kind: 'fastest', place: 2 });
    expect(ownRevealFact(all, 0, 'i')).toEqual({ kind: 'fastest', place: 1 });
    expect(ownRevealFact(all, 0, 'p')).toEqual({ kind: 'share', percent: 75 });
    expect(ownRevealFact(input([row('o', 0, true, 2100)]), 0, 'o')).toBeNull();
  });

  it('a blitz question counts once per player and has no reveal line', () => {
    const blitz = input([row('p', 0, false, 1000), row('p', 0, true, 3000, { attempt: 1 }), row('o', 0, true, 2000)], { questions: [q(0, 0, { blitz: true })] });
    expect(roundCard(blitz, 'p', 0)).toMatchObject({ correct: 1, answered: 1, fastestMs: 3000 });
    expect(revealFacts(blitz, 0)).toBeNull();
    expect(factTable(blitz).find((r) => r.playerId === 'p')).toMatchObject({ correct: 1, answered: 1 });
  });

  it('a bluff names the author of the best lie, an empty pick is no answer, and the gullible need two lie picks', () => {
    const one = input(
      [
        row('o', 0, false, 3000, { bluff: lie() }),
        row('p', 0, false, 4000, { bluff: lie(2) }),
        row('i', 0, true, 5000, { bluff: truth() }),
        row('m', 0, false, 6000, { bluff: { pick: false, truth: false, fooled: 0 } }),
      ],
      { questions: [q(0, 0, { bluff: true })] },
    );
    expect(revealFacts(one, 0)).toEqual({ accepted: 1, answered: 3, fastest: { names: ['Іра'], timeMs: 5000 }, bluff: { names: ['Петро'], votes: 2 } });
    expect(roundCard(one, 'm', 0)).toMatchObject({ answered: 0, fooledBy: 0 });
    expect(roundCard(one, 'o', 0)).toMatchObject({ answered: 1, fooledBy: 1 });
    const cards = roundFacts(one, 0);
    expect(find(cards, 'bluffer')).toEqual({ kind: 'bluffer', names: ['Петро'], fooled: 2 });
    expect(find(cards, 'gullible')).toBeNull();

    const two = input([...one.rows, row('o', 1, false, 3000, { bluff: lie() }), row('p', 1, true, 3000, { bluff: truth() })], {
      questions: [q(0, 0, { bluff: true }), q(1, 0, { bluff: true })],
    });
    expect(find(roundFacts(two, 0), 'gullible')).toEqual({ kind: 'gullible', names: ['Оля'], picks: 2 });
  });

  it('a bluff with nobody fooled has no bluff part in the reveal line', () => {
    const none = input([row('o', 0, true, 3000, { bluff: truth() }), row('p', 0, true, 4000, { bluff: truth() })], { questions: [q(0, 0, { bluff: true })] });
    expect(revealFacts(none, 0)?.bluff).toBeNull();
  });

  it('a spare answer stays out of the classic reveal line but counts on the board and in the own card', () => {
    const rows = [row('o', 0, true, 2000), row('p', 0, false, 2500), row('i', 0, true, 3000, { spare: true })];
    const classic = input(rows);
    expect(revealFacts(classic, 0)).toMatchObject({ accepted: 1, answered: 2 });
    expect(roundCard(classic, 'i', 0)).toMatchObject({ correct: 1, answered: 1 });
    const board = input(rows, { questions: [q(0, 0, { board: true })] });
    expect(revealFacts(board, 0)).toMatchObject({ accepted: 2, answered: 3 });
  });

  it('only a real timer gives time: no lightning and no average without it', () => {
    const untimed = input([row('o', 0, true, 2000), row('p', 0, true, 3000)], { questions: [q(0, 0, { limitMs: null })] });
    expect(find(roundFacts(untimed, 0), 'lightning')).toBeNull();
    expect(roundCard(untimed, 'o', 0)).toMatchObject({ correct: 1, answered: 1, avgMs: null, fastestMs: null });
    expect(revealFacts(untimed, 0)?.fastest).toBeNull();
    const mixed = input([...untimed.rows, row('o', 1, true, 5000)], { questions: [q(0, 0, { limitMs: null }), q(1, 0)] });
    expect(roundCard(mixed, 'o', 0)).toMatchObject({ avgMs: 5000, fastestMs: 5000 });
  });

  it('the sniper needs three answers', () => {
    const qs = [q(0, 0), q(1, 0), q(2, 0)];
    const two = input([row('o', 0, true, 2000), row('o', 1, true, 2000)], { questions: qs });
    expect(find(gameAwards(two), 'sniper')).toBeNull();
    const three = input([...two.rows, row('o', 2, true, 2000)], { questions: qs });
    expect(find(gameAwards(three), 'sniper')).toEqual({ kind: 'sniper', names: ['Оля'], correct: 3, answered: 3 });
  });

  it('the sniper ties on equal shares and takes the numbers of the first', () => {
    const qs = [0, 1, 2, 3, 4, 5].map((n) => q(n, 0));
    const rows = [
      row('o', 0, true, 1000), row('o', 1, true, 1000), row('o', 2, false, 1000),
      ...[true, true, false, true, true, false].map((ok, n) => row('p', n, ok, 1000)),
      row('i', 0, false, 1000), row('i', 1, true, 1000), row('i', 2, false, 1000),
    ];
    expect(find(gameAwards(input(rows, { questions: qs })), 'sniper')).toEqual({ kind: 'sniper', names: ['Оля', 'Петро'], correct: 2, answered: 3 });
  });

  it('the streak needs three in a row and stays inside a round', () => {
    const qs = [q(0, 0), q(1, 0), q(2, 0), q(3, 0)];
    const two = input([row('o', 0, true, 2000), row('o', 1, true, 2000)], { questions: qs });
    expect(find(roundFacts(two, 0), 'streak')).toBeNull();
    const three = input([...two.rows, row('o', 2, true, 2000)], { questions: qs });
    expect(find(roundFacts(three, 0), 'streak')).toEqual({ kind: 'streak', names: ['Оля'], length: 3 });
    expect(roundCard(three, 'o', 0)?.streak).toBe(3);
    // Неправильна обриває: на кінець раунду серії немає, але найкраща в грі лишається 3.
    const broken = input([...three.rows, row('o', 3, false, 2000)], { questions: qs });
    expect(find(roundFacts(broken, 0), 'streak')).toBeNull();
    expect(roundCard(broken, 'o', 0)?.streak).toBe(0);
    expect(find(gameAwards(broken), 'streak')).toEqual({ kind: 'streak', names: ['Оля'], length: 3 });
    expect(gameCard(broken, 'o')?.bestStreak).toBe(3);
    // Пропущене запитання серію не обриває.
    const skipped = input([row('o', 0, true, 2000), row('p', 1, true, 2000), row('o', 2, true, 2000), row('o', 3, true, 2000)], { questions: qs });
    expect(roundCard(skipped, 'o', 0)?.streak).toBe(3);
    // Два правильні в першому раунді й одне в другому — це не серія 3.
    const split = input([row('o', 0, true, 2000), row('o', 1, true, 2000), row('o', 2, true, 2000, { roundIndex: 1 })], {
      questions: [q(0, 0), q(1, 0), q(2, 1)],
    });
    expect(find(roundFacts(split, 1), 'streak')).toBeNull();
    expect(find(gameAwards(split), 'streak')).toBeNull();
    expect(roundCard(split, 'o', 1)?.streak).toBe(1);
  });

  it('the lone genius needs four answers and names the question only for one name', () => {
    const three = input([row('o', 0, true, 2000), row('p', 0, false, 2000), row('i', 0, false, 2000)]);
    expect(find(gameAwards(three), 'genius')).toBeNull();
    const four = input([...three.rows, row('m', 0, false, 2000)]);
    expect(find(gameAwards(four), 'genius')).toEqual({ kind: 'genius', names: ['Оля'], count: 1, question: { roundIndex: 0, number: 1, text: 'Q0' } });
    const twoNames = input([...four.rows, row('o', 1, false, 2000), row('p', 1, true, 2000), row('i', 1, false, 2000), row('m', 1, false, 2000)], {
      questions: [q(0, 0), q(1, 0)],
    });
    expect(find(gameAwards(twoNames), 'genius')).toEqual({ kind: 'genius', names: ['Оля', 'Петро'], count: 1, question: null });
    const board = input(four.rows, { questions: [q(0, 0, { board: true })] });
    expect(find(gameAwards(board), 'genius')).toBeNull();
  });

  it('the hardest question has the lowest share, a tie goes to more answers', () => {
    const rows = [
      row('o', 0, true, 2000), row('p', 0, false, 2000),
      row('o', 1, true, 2000), row('p', 1, true, 2000), row('i', 1, false, 2000), row('m', 1, false, 2000),
      row('o', 2, true, 2000), row('p', 2, true, 2000), row('i', 2, true, 2000),
      row('o', 3, false, 2000),
      row('o', 4, false, 2000), row('p', 4, false, 2000),
    ];
    const facts = input(rows, { questions: [q(0, 0), q(1, 0), q(2, 0), q(3, 0), q(4, 0, { blitz: true })] });
    expect(find(gameAwards(facts), 'hardest')).toEqual({ kind: 'hardest', question: { roundIndex: 0, number: 2, text: 'Q1' }, accepted: 2, answered: 4 });
    expect(find(gameAwards(input([row('o', 0, true, 2000)])), 'hardest')).toBeNull();
  });

  it('iron nerves count right answers in the last three seconds', () => {
    const facts = input([row('o', 0, true, 17500), row('p', 0, true, 16900), row('i', 0, false, 19000)]);
    expect(find(gameAwards(facts), 'nerves')).toEqual({ kind: 'nerves', names: ['Оля'], count: 1 });
    expect(find(gameAwards(input([row('p', 0, true, 16900), row('i', 0, true, 1000)])), 'nerves')).toBeNull();
  });

  it('the risk taker is the biggest final wager, else the most buffs', () => {
    const qs = [q(0, 0), q(1, 1, { final: true })];
    const buffs = [row('o', 0, true, 2000, { buff: 'fifty' }), row('o', 1, true, 2000, { buff: 'double', roundIndex: 1 }), row('i', 0, true, 2000, { buff: 'time' })];
    const wagers = [row('p', 1, true, 2000, { wager: 300, roundIndex: 1 }), row('m', 1, false, 2000, { wager: 100, roundIndex: 1 })];
    expect(find(gameAwards(input([...buffs, ...wagers], { questions: qs })), 'risk')).toEqual({ kind: 'risk', names: ['Петро'], wager: 300, buffs: null });
    expect(find(gameAwards(input(buffs, { questions: qs })), 'risk')).toEqual({ kind: 'risk', names: ['Оля'], wager: null, buffs: 2 });
    expect(find(gameAwards(input([row('o', 0, true, 2000), row('p', 0, true, 2000)])), 'risk')).toBeNull();
  });

  it('the comeback is the place after the first round against the final rank', () => {
    const comeback = { players: [RISERS[1]!, RISERS[0]!, RISERS[2]!, RISERS[3]!].map((p, n) => ({ ...p, rank: n + 1 })) };
    const facts = input([row('o', 0, true, 2000), row('p', 0, true, 2000)], comeback);
    expect(find(gameAwards(facts), 'comeback')).toEqual({ kind: 'comeback', names: ['Петро'], from: 4, to: 1 });
    const oneRound = { players: PLAYERS.map((p) => ({ ...p, rounds: [100] })) };
    expect(find(gameAwards(input([row('o', 0, true, 2000), row('p', 0, true, 2000)], oneRound)), 'comeback')).toBeNull();
  });

  it('a tie on the fastest time names everyone in table order', () => {
    const facts = input([row('m', 0, true, 1500), row('p', 0, true, 1500), row('o', 0, true, 3000)]);
    expect(find(roundFacts(facts, 0), 'lightning')).toEqual({ kind: 'lightning', names: ['Петро', 'Марко'], timeMs: 1500, question: { roundIndex: 0, number: 1, text: 'Q0' } });
  });

  it('round facts take the first three in order and game awards at most six', () => {
    const qs = [q(0, 0), q(1, 0), q(2, 0), q(3, 0, { bluff: true }), q(4, 1)];
    const rows = [
      row('o', 0, true, 2000), row('o', 1, true, 2000), row('o', 2, true, 2000),
      row('p', 3, false, 3000, { bluff: lie(1) }), row('i', 3, false, 3000, { bluff: lie() }),
      row('o', 4, true, 18000, { roundIndex: 1, buff: 'double' }),
    ];
    const players = [RISERS[1]!, RISERS[0]!, RISERS[2]!, RISERS[3]!].map((p, n) => ({ ...p, rank: n + 1 }));
    const facts = input(rows, { questions: qs, players });
    expect(roundFacts(facts, 0).map((c) => c.kind)).toEqual(['lightning', 'sniper', 'streak']);
    const awards = gameAwards(facts);
    expect(awards.map((c) => c.kind)).toEqual(['lightning', 'sniper', 'streak', 'comeback', 'bluffer', 'nerves']);
    expect(awards.length).toBeLessThanOrEqual(FACT_LIMITS.awards);
    expect(AWARD_ORDER.slice(0, 6)).toEqual(['lightning', 'sniper', 'streak', 'comeback', 'bluffer', 'nerves']);
    expect(gameAwards(input(rows, { questions: qs, players: [PLAYERS[0]!] }))).toEqual([]);
  });

  it('an empty round has no cards and a zero own card', () => {
    expect(roundFacts(input([]), 0)).toEqual([]);
    expect(gameAwards(input([]))).toEqual([]);
    expect(roundCard(input([]), 'o', 0)).toEqual({ correct: 0, answered: 0, avgMs: null, fastestMs: null, streak: 0, place: { before: null, now: 1 }, fooledBy: null });
    expect(roundCard(input([]), 'x', 0)).toBeNull();
  });

  it('the own round card has the place before and now and the fooled count', () => {
    const qs = [q(0, 0), q(1, 1), q(2, 1), q(3, 1, { bluff: true })];
    const rows = [
      row('p', 0, true, 2000),
      row('p', 1, true, 4000, { roundIndex: 1 }), row('p', 2, false, 3000, { roundIndex: 1 }),
      row('p', 3, false, 5000, { roundIndex: 1, bluff: lie() }),
    ];
    const facts = input(rows, { questions: qs, players: RISERS });
    expect(roundCard(facts, 'p', 1)).toEqual({ correct: 1, answered: 3, avgMs: 4000, fastestMs: 4000, streak: 0, place: { before: 4, now: 2 }, fooledBy: 1 });
    expect(roundCard(facts, 'i', 0)).toMatchObject({ place: { before: null, now: 3 }, fooledBy: null });
    const unranked = input(rows, { questions: qs, players: RISERS.map((p) => ({ ...p, rank: null })) });
    expect(roundCard(unranked, 'p', 1)?.place).toBeNull();
  });

  it('the own game card has rounds, best streak, buffs, debuffs and the bluff', () => {
    const qs = [q(0, 0), q(1, 0), q(2, 0), q(3, 1)];
    const rows = [
      row('o', 0, true, 3000, { buff: 'fifty' }), row('o', 1, true, 2000), row('o', 2, true, 2500),
      row('o', 3, false, 4000, { roundIndex: 1, buff: 'time' }),
    ];
    const plain = input(rows, { questions: qs, players: RISERS, debuffs: [{ by: 'o', target: 'p' }, { by: 'i', target: null }] });
    expect(gameCard(plain, 'o')).toEqual({ rank: 1, rounds: [400, 400], correct: 3, answered: 4, bestStreak: 3, fastestMs: 2000, buffs: 2, debuffs: { sent: 1, got: 0 }, bluff: null });
    expect(gameCard(plain, 'p')).toMatchObject({ debuffs: { sent: 0, got: 1 }, correct: 0, answered: 0, fastestMs: null });
    expect(gameCard(plain, 'x')).toBeNull();
    const bluffed = input([...rows, row('o', 4, false, 3000, { roundIndex: 1, bluff: lie(2) }), row('o', 5, false, 3000, { roundIndex: 1, bluff: lie(1) })], {
      questions: [...qs, q(4, 1, { bluff: true }), q(5, 1, { bluff: true })],
      players: RISERS,
    });
    expect(gameCard(bluffed, 'o')?.bluff).toEqual({ fooled: 3, fooledBy: 2 });
  });

  it('the history table follows the players, unscored questions count nowhere, round shares keep only scored questions', () => {
    const qs = [q(0, 0), q(1, 0, { scored: false }), q(2, 0), q(3, 1)];
    const rows = [
      row('i', 0, true, 2000), row('o', 0, false, 4000), row('i', 2, true, 6000), row('o', 2, true, 3000),
      row('o', 1, false, 1000), row('p', 3, true, 1000, { roundIndex: 1 }),
    ];
    const facts = input(rows, { questions: qs });
    expect(factTable(facts)).toEqual([
      { playerId: 'o', nickname: 'Оля', correct: 1, answered: 2, avgMs: 3500, bestStreak: 1 },
      { playerId: 'p', nickname: 'Петро', correct: 1, answered: 1, avgMs: 1000, bestStreak: 1 },
      { playerId: 'i', nickname: 'Іра', correct: 2, answered: 2, avgMs: 4000, bestStreak: 2 },
      { playerId: 'm', nickname: 'Марко', correct: 0, answered: 0, avgMs: null, bestStreak: 0 },
    ]);
    expect(roundShares(facts, 0)).toEqual([
      { number: 1, text: 'Q0', accepted: 1, answered: 2 },
      { number: 3, text: 'Q2', accepted: 2, answered: 2 },
    ]);
  });

  it('factLimitMs: no time for video, an untimed ladder or a voice cell; choice time for a bluff; the answer window otherwise', () => {
    const single = { id: 'q1', type: 'single', text: 'Столиця України?', imageUrl: null, video: null, timeLimit: 20, points: 1000, options: [], correctId: 'b' } as unknown as Question;
    const classic = { type: 'classic' } as Round;
    expect(factLimitMs({ ...single, video: { id: 'dQw4w9WgXcQ', start: 0 } } as Question, classic, false)).toBeNull();
    expect(factLimitMs(single, { type: 'ladder', timer: false } as Round, false)).toBeNull();
    expect(factLimitMs(single, { type: 'ladder', timer: true } as Round, false)).toBe(20000);
    expect(factLimitMs(single, undefined, true)).toBeNull();
    expect(factLimitMs({ ...single, type: 'bluff', timeLimit: 60, choiceTime: 15 } as unknown as Question, classic, false)).toBe(15000);
    expect(factLimitMs(single, classic, false)).toBe(20000);
    const audio = { source: 'file', url: `/uploads/${'a'.repeat(32)}.mp3`, start: 5, duration: 30 };
    expect(factLimitMs({ ...single, audio } as Question, classic, false)).toBe(50000);
  });

  it('bluffFact reads a bluff payload and ignores the rest', () => {
    const bluff: Answer = { type: 'bluff', lie: 'Мадрид', pick: 'Барселона', truth: true, fooled: 2 };
    expect(bluffFact(bluff)).toEqual({ pick: true, truth: true, fooled: 2 });
    expect(bluffFact({ ...bluff, pick: null, truth: false, fooled: 0 })).toEqual({ pick: false, truth: false, fooled: 0 });
    expect(bluffFact(null)).toBeNull();
    expect(bluffFact({ type: 'chain', words: [] } as unknown as Answer)).toBeNull();
  });
});
