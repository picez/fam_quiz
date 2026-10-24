import { describe, expect, it } from 'vitest';
import { debuffLines } from './GameHistory';

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
