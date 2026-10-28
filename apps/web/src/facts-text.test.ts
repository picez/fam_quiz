import { describe, expect, it } from 'vitest';
import { FACT_KINDS, type FactCard, type GameCard, type RoundCard } from '@quiz/shared';
import { factBody, factTitle, gameCardLines, namesText, ordinal, ownRevealText, revealFactsText, roundCardParts } from './facts-text';

const S = (text: string) => text.replace(/ (?=с(?![а-яіїєґ])|%)/g, ' ');

const q = { roundIndex: 1, number: 3, text: 'Яка річка найдовша в Україні?' };

const SAMPLES: Record<FactCard['kind'], FactCard> = {
  lightning: { kind: 'lightning', names: ['Оля'], timeMs: 2100, question: q },
  sniper: { kind: 'sniper', names: ['Оля'], correct: 4, answered: 5 },
  streak: { kind: 'streak', names: ['Петро'], length: 4 },
  comeback: { kind: 'comeback', names: ['Іра'], from: 5, to: 1 },
  bluffer: { kind: 'bluffer', names: ['Петро'], fooled: 3 },
  nerves: { kind: 'nerves', names: ['Оля'], count: 2 },
  risk: { kind: 'risk', names: ['Іра'], wager: 500, buffs: null },
  gullible: { kind: 'gullible', names: ['Тарас'], picks: 2 },
  genius: { kind: 'genius', names: ['Оля'], count: 1, question: q },
  hardest: { kind: 'hardest', question: q, accepted: 1, answered: 6 },
};

const round: RoundCard = { correct: 4, answered: 6, avgMs: 5300, fastestMs: 2000, streak: 3, place: { before: 5, now: 3 }, fooledBy: 1 };
const game: GameCard = {
  rank: 2,
  rounds: [300, -100, 500],
  correct: 9,
  answered: 12,
  bestStreak: 4,
  fastestMs: 1800,
  buffs: 2,
  debuffs: { sent: 1, got: 3 },
  bluff: { fooled: 2, fooledBy: 1 },
};

describe('fact texts', () => {
  it('every kind has a title and a body', () => {
    for (const kind of FACT_KINDS) {
      expect(factTitle(SAMPLES[kind]), kind).toMatch(/\S/);
      expect(factBody(SAMPLES[kind], 1), kind).toMatch(/\S/);
    }
    expect(factTitle(SAMPLES.lightning)).toBe('⚡ Блискавка');
    expect(factTitle(SAMPLES.hardest)).toBe('🧗 Найважче запитання');
  });

  it('lightning names the round only when the game has several', () => {
    expect(factBody(SAMPLES.lightning, 1)).toBe(S('Оля — 2,1 с, запитання 3'));
    expect(factBody(SAMPLES.lightning, 3)).toBe(S('Оля — 2,1 с, запитання 3 раунду 2'));
  });

  it('names: one, two with «й / і», three and more with commas', () => {
    expect(namesText(['Оля'])).toBe('Оля');
    expect(namesText(['Петро', 'Оля'])).toBe('Петро й Оля');
    expect(namesText(['Тарас', 'Оля'])).toBe('Тарас і Оля');
    expect(namesText(['Оля', 'Петро'])).toBe('Оля й Петро');
    expect(namesText(['Оля', 'Іра'])).toBe('Оля і Іра');
    expect(namesText(['Оля', 'Петро', 'Тарас'])).toBe('Оля, Петро й Тарас');
    expect(namesText([])).toBe('');
  });

  it('sniper: a tie has no «(N з M)»', () => {
    expect(factBody(SAMPLES.sniper, 1)).toBe(S('Оля — 80 % (4 з 5)'));
    expect(factBody({ kind: 'sniper', names: ['Оля', 'Петро'], correct: 3, answered: 3 }, 1)).toBe(S('Оля й Петро — 100 %'));
  });

  it('agrees nouns with numbers', () => {
    const bluffer = (fooled: number) => factBody({ kind: 'bluffer', names: ['Петро'], fooled }, 1);
    expect([bluffer(1), bluffer(3), bluffer(5)]).toEqual(['Петро — 1 обдурений', 'Петро — 3 обдурених', 'Петро — 5 обдурених']);
    const nerves = (count: number) => factBody({ kind: 'nerves', names: ['Оля'], count }, 1);
    expect([nerves(1), nerves(2), nerves(5)]).toEqual(['Оля — 1 правильна в останні 3 с', 'Оля — 2 правильні в останні 3 с', 'Оля — 5 правильних в останні 3 с'].map(S));
    const gullible = (picks: number) => factBody({ kind: 'gullible', names: ['Тарас'], picks }, 1);
    expect([gullible(2), gullible(5), gullible(21)]).toEqual(['Тарас — 2 голоси за вигадки', 'Тарас — 5 голосів за вигадки', 'Тарас — 21 голос за вигадки']);
    const buffs = (count: number) => factBody({ kind: 'risk', names: ['Іра'], wager: null, buffs: count }, 1);
    expect([buffs(1), buffs(3), buffs(5)]).toEqual(['Іра — 1 баф', 'Іра — 3 бафи', 'Іра — 5 бафів']);
  });

  it('the other bodies', () => {
    expect(factBody(SAMPLES.streak, 1)).toBe('Петро — 4 поспіль');
    expect(factBody(SAMPLES.comeback, 1)).toBe('Іра — з 5-го на 1-е місце');
    expect(factBody({ kind: 'comeback', names: ['Іра'], from: 7, to: 3 }, 1)).toBe('Іра — з 7-го на 3-є місце');
    expect(factBody(SAMPLES.risk, 1)).toBe('Іра — ставка 500');
    expect(factBody(SAMPLES.genius, 1)).toBe('Оля — єдина правильна відповідь на запитання 3');
    expect(factBody({ kind: 'genius', names: ['Оля'], count: 3, question: null }, 1)).toBe('Оля — 3 рази єдина правильна відповідь');
    expect(factBody(SAMPLES.hardest, 1)).toBe('«Яка річка найдовша в Україні?» — правильно 1 з 6');
  });

  it('the reveal line', () => {
    expect(revealFactsText({ accepted: 4, answered: 7, fastest: { names: ['Оля'], timeMs: 2100 }, bluff: null })).toBe(S('Правильно 4 з 7 · найшвидше — Оля, 2,1 с'));
    expect(revealFactsText({ accepted: 4, answered: 7, fastest: { names: ['Оля', 'Петро'], timeMs: 2100 }, bluff: null })).toBe(S('Правильно 4 з 7 · найшвидше — Оля й Петро, 2,1 с'));
    expect(revealFactsText({ accepted: 4, answered: 7, fastest: null, bluff: null })).toBe('Правильно 4 з 7');
    expect(revealFactsText({ accepted: 2, answered: 5, fastest: null, bluff: { names: ['Петро'], votes: 3 } })).toBe('Найбільше голосів: вигадка від Петро — 3 голоси');
    expect(revealFactsText({ accepted: 2, answered: 5, fastest: null, bluff: { names: ['Петро', 'Оля'], votes: 1 } })).toBe('Найбільше голосів: вигадка від Петро й Оля — 1 голос');
    expect(revealFactsText({ accepted: 0, answered: 5, fastest: null, bluff: { names: ['Петро'], votes: 5 } })).toBe('Найбільше голосів: вигадка від Петро — 5 голосів');
  });

  it('the own reveal line', () => {
    expect(ownRevealText({ kind: 'fastest', place: 1 })).toBe('Твоя правильна відповідь — найшвидша!');
    expect(ownRevealText({ kind: 'fastest', place: 2 })).toBe('Твоя правильна відповідь — 2-а за швидкістю');
    expect(ownRevealText({ kind: 'fastest', place: 3 })).toBe('Твоя правильна відповідь — 3-я за швидкістю');
    expect(ownRevealText({ kind: 'share', percent: 57 })).toBe(S('Правильно відповіли 57 %'));
    expect(ownRevealText({ kind: 'fastest', place: 1 }, true)).toBe('Ваша правильна відповідь — найшвидша!');
    expect(ownRevealText({ kind: 'fastest', place: 3 }, true)).toBe('Ваша правильна відповідь — 3-я за швидкістю');
    expect(ownRevealText({ kind: 'share', percent: 57 }, true)).toBe(S('Правильно відповіли 57 %'));
  });

  it('round card parts', () => {
    expect(roundCardParts(round, false)).toEqual(['правильно 4 з 6', 'середній час 5,3 с', 'найшвидша 2,0 с', 'серія зараз 3', 'місце: 5 → 3', 'тебе обдурили 1 раз'].map(S));
    expect(roundCardParts({ ...round, avgMs: null, fastestMs: null, place: { before: null, now: 3 }, fooledBy: null }, false)).toEqual(['правильно 4 з 6', 'серія зараз 3', 'місце: 3']);
    expect(roundCardParts({ ...round, place: null, fooledBy: 3 }, false).at(-1)).toBe('тебе обдурили 3 рази');
    expect(roundCardParts(round, true).at(-1)).toBe('вас обдурили 1 раз');
    expect(roundCardParts({ ...round, fooledBy: 0 }, true).at(-1)).toBe('вас обдурили 0 разів');
  });

  it('ordinals by the 2019 spelling: 3-я / 3-є, but 13-а / 13-е', () => {
    expect([1, 2, 3, 13, 23, 113].map((n) => ordinal(n, 'f'))).toEqual(['1-а', '2-а', '3-я', '13-а', '23-я', '113-а']);
    expect([1, 3, 13, 23, 33].map((n) => ordinal(n, 'n'))).toEqual(['1-е', '3-є', '13-е', '23-є', '33-є']);
  });

  it('game card lines', () => {
    expect(gameCardLines(game, false)).toEqual(
      [
      'Точність: 75 % (9 з 12)',
      'Найкраща серія: 4',
      'Найшвидша відповідь: 1,8 с',
      'Бафи: 2',
      'Дебафи: від тебе 1 · на тобі 3',
      'Блеф: твої вигадки обдурили 2 · тебе обдурили 1',
      ].map(S),
    );
    expect(gameCardLines({ ...game, fastestMs: null, bluff: null }, true)).toEqual(['Точність: 75 % (9 з 12)', 'Найкраща серія: 4', 'Бафи: 2', 'Дебафи: від вас 1 · на вас 3'].map(S));
    expect(gameCardLines({ ...game, bluff: null }, true).some((line) => line.startsWith('Блеф'))).toBe(false);
    expect(gameCardLines({ ...game, bluff: { fooled: 0, fooledBy: 2 } }, true).at(-1)).toBe('Блеф: ваші вигадки обдурили 0 · вас обдурили 2');
    expect(gameCardLines({ ...game, correct: 0, answered: 0 }, false)[0]).toBe('Точність: відповідей не було');
  });
});
