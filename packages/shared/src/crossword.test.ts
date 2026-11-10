import { describe, expect, it } from 'vitest';
import {
  crosswordCells,
  crosswordLayoutIssue,
  crosswordLetter,
  crosswordLetters,
  crosswordNumbers,
  layoutCrossword,
  pickKeyCells,
  type CrosswordLayout,
} from './crossword';

const WORDS = ['калина', 'лелека', 'вишня', 'соняшник', 'мак', 'криниця'];
const entriesOf = (words: string[]) => words.map((answer, i) => ({ id: `w${i}`, answer }));
const ENTRIES = entriesOf(WORDS);

function laid(entries = ENTRIES): CrosswordLayout {
  const result = layoutCrossword(entries);
  if (!result.ok) throw new Error(`not laid out: ${result.reason} ${result.ids.join(',')}`);
  return result.layout;
}
const crossings = (layout: CrosswordLayout, entries = ENTRIES) => {
  const seen = new Map<number, number>();
  for (const w of layout.words) {
    const n = crosswordLetters(entries.find((e) => e.id === w.id)!.answer)!.length;
    for (let k = 0; k < n; k++) {
      const i = (w.row + (w.dir === 'down' ? k : 0)) * layout.width + w.col + (w.dir === 'across' ? k : 0);
      seen.set(i, (seen.get(i) ?? 0) + 1);
    }
  }
  return [...seen.values()].filter((n) => n > 1).length;
};
const byId = (layout: CrosswordLayout) => [...layout.words].sort((a, b) => a.id.localeCompare(b.id));

describe('crossword', () => {
  it('normalizes crossword letters like the ladder', () => {
    expect(crosswordLetters("М'ята")).toEqual(['м', 'я', 'т', 'а']);
    expect(crosswordLetters('М’ята')).toEqual(['м', 'я', 'т', 'а']);
    expect(crosswordLetters(' Калина ')).toEqual(['к', 'а', 'л', 'и', 'н', 'а']);
    expect(crosswordLetters('Ґанок')![0]).toBe('ґ');
    expect(crosswordLetters('ганок')![0]).toBe('г');
    expect(crosswordLetters('sun')).toBeNull();
    expect(crosswordLetters('два слова')).toBeNull();
    expect(crosswordLetters('а')).toBeNull();
    expect(crosswordLetters('їж')).toEqual(['ї', 'ж']);
    expect(crosswordLetters('велосипедист')).toHaveLength(12);
    expect(crosswordLetters('велосипедистк')).toBeNull();
    expect(crosswordLetter('Ї')).toBe('ї');
    expect(crosswordLetter('ґ')).toBe('ґ');
    expect(crosswordLetter("'")).toBeNull();
    expect(crosswordLetter('q')).toBeNull();
    expect(crosswordLetter('аб')).toBeNull();
    expect(crosswordLetter('')).toBeNull();
  });

  it('lays out words with crossings', () => {
    const layout = laid();
    expect(layout.width).toBeLessThanOrEqual(12);
    expect(layout.height).toBeLessThanOrEqual(12);
    expect(layout.words.map((w) => w.id).sort()).toEqual(ENTRIES.map((e) => e.id).sort());
    expect(layout.keyCells).toEqual([]);
    expect(crosswordLayoutIssue(layout, ENTRIES, null)).toBeNull();
    expect(crossings(layout)).toBeGreaterThanOrEqual(5);
    const cells = crosswordCells(layout, ENTRIES);
    expect(cells).toHaveLength(layout.width * layout.height);
    // Координати зсунуто до (0, 0): є літери в рядку 0 і в стовпці 0.
    expect(cells.slice(0, layout.width).some((c) => c !== null)).toBe(true);
    expect(cells.filter((_, i) => i % layout.width === 0).some((c) => c !== null)).toBe(true);
  });

  it('is deterministic', () => {
    expect(layoutCrossword(ENTRIES)).toEqual(layoutCrossword(ENTRIES));
    // «лелека» (6) і «мак» (3) мають різну довжину: переставлення в масиві не міняє порядку розкладання.
    const swapped = [ENTRIES[0], ENTRIES[4], ENTRIES[2], ENTRIES[3], ENTRIES[1], ENTRIES[5]];
    const a = laid();
    const b = laid(swapped);
    expect(byId(b)).toEqual(byId(a));
    expect([b.width, b.height]).toEqual([a.width, a.height]);
  });

  it('warns when words do not cross', () => {
    const apart = entriesOf(['дуб', 'сік', 'вежа', 'гриф']);
    // Кожен старт кладе одне слово; найменша рамка — у «дуб» (раніший з тризначних), решта не покладені.
    expect(layoutCrossword(apart)).toEqual({ ok: false, reason: 'unplaced', ids: ['w1', 'w2', 'w3'] });
    expect(layoutCrossword([...ENTRIES.slice(0, 3), { id: 'bad', answer: 'sun' }])).toEqual({
      ok: false,
      reason: 'word',
      ids: ['bad'],
    });
  });

  it('keeps within 12 by 12', () => {
    const long = entriesOf([
      'велосипедист',
      'холодильники',
      'привітальний',
      'підвіконнями',
      'мандрівникам',
      'супутниковий',
      'перехрестями',
      'соняшниковий',
    ]);
    const result = layoutCrossword(long);
    if (result.ok) {
      expect(result.layout.width).toBeLessThanOrEqual(12);
      expect(result.layout.height).toBeLessThanOrEqual(12);
      expect(crosswordLayoutIssue(result.layout, long, null)).toBeNull();
    } else {
      expect(result.reason).toBe('unplaced');
      expect(result.ids.length).toBeGreaterThan(0);
    }
  });

  it('numbers clues in reading order', () => {
    const entries = entriesOf(['мак', 'ми', 'кит', 'ар']);
    // м а к      «мак» across з (0,0), «ми» down з (0,0), «кит» down з (0,2)
    // и . и
    // . . т
    const layout: CrosswordLayout = {
      width: 3,
      height: 3,
      words: [
        { id: 'w0', row: 0, col: 0, dir: 'across' },
        { id: 'w1', row: 0, col: 0, dir: 'down' },
        { id: 'w2', row: 0, col: 2, dir: 'down' },
      ],
      keyCells: [],
    };
    expect(crosswordNumbers(layout, entries)).toEqual([
      { id: 'w0', number: 1, dir: 'across', length: 3 },
      { id: 'w1', number: 1, dir: 'down', length: 2 },
      { id: 'w2', number: 2, dir: 'down', length: 3 },
    ]);
    const real = crosswordNumbers(laid(), ENTRIES);
    expect(real).toHaveLength(6);
    expect(real[0].number).toBe(1);
    const numbers = [...new Set(real.map((n) => n.number))];
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it('picks key cells spread over words', () => {
    const layout = laid();
    const cells = crosswordCells(layout, ENTRIES);
    // У словах немає «і», тож ключ — «лис».
    const picked = pickKeyCells(layout, ENTRIES, 'Лис');
    expect(Array.isArray(picked)).toBe(true);
    const keyCells = picked as number[];
    expect(keyCells).toHaveLength(3);
    expect(new Set(keyCells).size).toBe(3);
    expect(keyCells.map((i) => cells[i])).toEqual(['л', 'и', 'с']);
    expect(pickKeyCells(layout, ENTRIES, 'лис')).toEqual(keyCells);
    // Клітинки з різних слів: кожна належить іншому слову.
    const owner = (i: number) =>
      layout.words
        .filter((w) => {
          const n = crosswordLetters(ENTRIES.find((e) => e.id === w.id)!.answer)!.length;
          const r = Math.floor(i / layout.width);
          const c = i % layout.width;
          return w.dir === 'across'
            ? r === w.row && c >= w.col && c < w.col + n
            : c === w.col && r >= w.row && r < w.row + n;
        })
        .map((w) => w.id);
    const owners = keyCells.map(owner);
    expect(owners.every((o) => o.length === 1)).toBe(true);
    expect(new Set(owners.map((o) => o[0])).size).toBe(3);
    expect(crosswordLayoutIssue({ ...layout, keyCells }, ENTRIES, 'лис')).toBeNull();
  });

  it('reports missing key letters', () => {
    const layout = laid();
    expect(pickKeyCells(layout, ENTRIES, 'футбол')).toEqual({ missing: ['ф', 'у', 'т', 'б'] });
    // Одна «о» на всю сітку (у «соняшник»).
    expect(pickKeyCells(layout, ENTRIES, 'око')).toEqual({ missing: ['о'] });
  });

  it('refuses a broken layout', () => {
    const layout = laid();
    expect(crosswordLayoutIssue({ ...layout, width: 13 }, ENTRIES, null)).toBe('crossword_layout');
    const shifted = { ...layout, words: layout.words.map((w, i) => (i === 1 ? { ...w, col: w.col + 1 } : w)) };
    expect(crosswordLayoutIssue(shifted, ENTRIES, null)).toBe('crossword_layout');
    expect(crosswordLayoutIssue({ ...layout, words: layout.words.slice(1) }, ENTRIES, null)).toBe('crossword_layout');
    expect(crosswordLayoutIssue({ ...layout, words: [...layout.words, layout.words[0]] }, ENTRIES, null)).toBe(
      'crossword_layout',
    );

    const small = entriesOf(['мак', 'ми', 'ас', 'ни']);
    const base = (words: CrosswordLayout['words'], width = 3): CrosswordLayout => ({ width, height: 2, words, keyCells: [] });
    const mak = { id: 'w0', row: 0, col: 0, dir: 'across' } as const;
    const mi = { id: 'w1', row: 0, col: 0, dir: 'down' } as const;
    expect(crosswordLayoutIssue(base([mak, mi]), small.slice(0, 2), null)).toBeNull();
    // Літера на перетині не збігається: «ни» down з (0,0) під «м».
    expect(crosswordLayoutIssue(base([mak, { ...mi, id: 'w3' }]), [small[0], small[3]], null)).toBe('crossword_layout');
    // «ас» down з (0,1) торкається «ми» боком: рядок 1 читається «ис».
    const side = [mak, mi, { id: 'w2', row: 0, col: 1, dir: 'down' } as const];
    expect(crosswordLayoutIssue(base(side), small.slice(0, 3), null)).toBe('crossword_layout');
    // Незв'язно: «ми» далеко праворуч, без перетину.
    expect(crosswordLayoutIssue(base([mak, { ...mi, col: 5 }], 6), small.slice(0, 2), null)).toBe('crossword_layout');

    const keyCells = pickKeyCells(layout, ENTRIES, 'лис') as number[];
    const cells = crosswordCells(layout, ENTRIES);
    const wrong = cells.findIndex((c) => c !== null && c !== 'л');
    expect(crosswordLayoutIssue({ ...layout, keyCells: [wrong, keyCells[1], keyCells[2]] }, ENTRIES, 'лис')).toBe(
      'crossword_key_letters',
    );
    // «калина»: «а» на позиціях 1 і 5 — та сама клітинка двічі.
    const twice = pickKeyCells(layout, ENTRIES, 'калина') as number[];
    expect(crosswordLayoutIssue({ ...layout, keyCells: twice }, ENTRIES, 'калина')).toBeNull();
    expect(crosswordLayoutIssue({ ...layout, keyCells: [...twice.slice(0, 5), twice[1]] }, ENTRIES, 'калина')).toBe(
      'crossword_key_letters',
    );
    expect(crosswordLayoutIssue({ ...layout, keyCells: keyCells.slice(0, 2) }, ENTRIES, 'лис')).toBe(
      'crossword_key_letters',
    );
    expect(crosswordLayoutIssue({ ...layout, keyCells: [999, keyCells[1], keyCells[2]] }, ENTRIES, 'лис')).toBe(
      'crossword_key_letters',
    );
    expect(crosswordLayoutIssue({ ...layout, keyCells }, ENTRIES, null)).toBe('crossword_key_letters');
  });

  it('is fast enough for the editor', () => {
    const eight = entriesOf([...WORDS, 'ромашка', 'черешня']);
    layoutCrossword(eight);
    const start = Date.now();
    const result = layoutCrossword(eight);
    expect(Date.now() - start).toBeLessThan(20);
    expect(result.ok).toBe(true);
  });
});
