import { describe, expect, it } from 'vitest';
import type { Standing } from '@quiz/shared';
import { breakdownLines, roundGains, roundHighlights } from './score-table';

function row(participantId: string, nickname: string, score: number, rank: number, rounds?: number[]): Standing {
  return { participantId, nickname, score, totalTimeMs: 0, rank, ...(rounds === undefined ? {} : { rounds }) };
}

describe('breakdownLines', () => {
  it('goes in the order of the sources, plus before minus, penalties as «Помилки»', () => {
    const lines = breakdownLines({
      parts: [
        { source: 'answers', plus: 1000, minus: -1000 },
        { source: 'debuff', plus: 0, minus: -150 },
        { source: 'host', plus: 50, minus: 0 },
      ],
      plus: 1050,
      minus: -1150,
    });
    expect(lines.map((line) => [line.label, line.value])).toEqual([
      ['Відповіді', '+1000'],
      ['Помилки', '−1000'],
      ['Дебафи', '−150'],
      ['Ведучий', '+50'],
    ]);
    expect(lines.map((line) => line.key)).toEqual(['answers:plus', 'answers:minus', 'debuff:minus', 'host:plus']);
    expect(lines.map((line) => line.sign)).toEqual(['plus', 'minus', 'minus', 'plus']);
  });

  it('a source with both signs keeps its own name', () => {
    expect(breakdownLines({ parts: [{ source: 'duel', plus: 300, minus: -300 }], plus: 300, minus: -300 }).map((line) => [line.label, line.value])).toEqual([
      ['Дуелі', '+300'],
      ['Дуелі', '−300'],
    ]);
  });
});

describe('roundGains', () => {
  it('takes the gain of one round; a row without rounds is not in the map', () => {
    const rows = [row('a', 'А', 800, 1, [300, 500]), row('b', 'Б', -400, 2, [100, -500]), row('c', 'В', 0, 3)];
    expect(roundGains(rows, 1)).toEqual({ a: 500, b: -500 });
  });
});

describe('roundHighlights', () => {
  it('the best of the round and the biggest climb, ties by table order', () => {
    const rows = [
      row('v', 'Віра', 800, 1, [300, 500]),
      row('o', 'Оля', 450, 2, [-50, 500]),
      row('p', 'Петро', -400, 3, [100, -500]),
      row('m', 'Марко', -600, 4, [-100, -500]),
    ];
    expect(roundHighlights(rows, 1)).toEqual({ best: { names: ['Віра', 'Оля'], points: 500 }, climb: { names: ['Оля'], places: 1 } });
  });

  it('no climb in the first round; no best when nobody gained', () => {
    const first = [row('a', 'А', 300, 1, [300]), row('b', 'Б', 100, 2, [100])];
    expect(roundHighlights(first, 0).climb).toBeNull();
    const losses = [row('a', 'А', -100, 1, [-100]), row('b', 'Б', -300, 2, [-300])];
    expect(roundHighlights(losses, 0).best).toBeNull();
  });
});
