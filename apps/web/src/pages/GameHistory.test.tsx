import { describe, expect, it } from 'vitest';
import { debuffLines, wipeoutLines } from './GameHistory';

describe('debuffLines', () => {
  it('lists purchases as «Оля купує 🌫️ Туман для гравця Петро: −200»', () => {
    expect(
      debuffLines([
        { seq: 1, roundIndex: 0, afterQuestion: 0, nickname: 'Оля', points: -100, source: 'host' },
        { seq: 2, roundIndex: 0, afterQuestion: 1, nickname: 'Оля', points: -200, source: 'debuff', debuff: 'fog', target: 'Петро' },
        { seq: 3, roundIndex: 0, afterQuestion: 2, nickname: 'Іра', points: -150, source: 'debuff', debuff: 'mud', target: null },
      ]),
    ).toEqual(['Оля купує 🌫️ Туман для гравця Петро: −200', 'Іра купує 🟫 Брудний екран: −150']);
  });
});

describe('wipeoutLines', () => {
  it('describes every participant after the rung', () => {
    expect(
      wipeoutLines({
        price: 300,
        rows: [
          { nickname: 'Оля', status: 'burned', bank: 0 },
          { nickname: 'Петро', status: 'took', bank: 300 },
          { nickname: 'Віра', status: 'in', bank: 300 },
          { nickname: 'Іра', status: 'survived', bank: 1500 },
        ],
      }).map((line) => line.replace(/\s/g, ' ')),
    ).toEqual(['Оля — банк згорів', 'Петро — забрав(-ла) 300', 'Віра — у грі, 300', 'Іра — доніс(-ла) 1500']);
  });
});
