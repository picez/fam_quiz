import { describe, expect, it } from 'vitest';
import { seededRng } from './bluff';
import { present, shuffle } from './game';
import { single } from './testing/fixtures';

const take = (rng: () => number, n: number) => Array.from({ length: n }, () => rng());
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

describe('rng golden (30d)', () => {
  it('seededRng first values', () => {
    expect([0, 1, 7, 42, 4294967295].map((s) => take(seededRng(s), 6))).toMatchInlineSnapshot(`
      [
        [
          0.26642920868471265,
          0.0003297457005828619,
          0.2232720274478197,
          0.1462021479383111,
          0.46732782293111086,
          0.5450490827206522,
        ],
        [
          0.6270739405881613,
          0.002735721180215478,
          0.5274470399599522,
          0.9810509674716741,
          0.9683778982143849,
          0.281103502959013,
        ],
        [
          0.011704753153026104,
          0.06195825757458806,
          0.97690763277933,
          0.6990287057124078,
          0.5214452685322613,
          0.4055216880515218,
        ],
        [
          0.6011037519201636,
          0.44829055899754167,
          0.8524657934904099,
          0.6697340414393693,
          0.17481389874592423,
          0.5265925421845168,
        ],
        [
          0.8964226141106337,
          0.189478256739676,
          0.7156526781618595,
          0.9440599093213677,
          0.8452364315744489,
          0.5391399988438934,
        ],
      ]
    `);
  });

  it('shuffle', () => {
    expect([1, 2, 3, 4, 5].map((s) => shuffle(LETTERS, seededRng(s)))).toMatchInlineSnapshot(`
      [
        [
          "h",
          "i",
          "d",
          "c",
          "b",
          "f",
          "j",
          "e",
          "a",
          "g",
        ],
        [
          "a",
          "j",
          "e",
          "b",
          "g",
          "f",
          "d",
          "i",
          "c",
          "h",
        ],
        [
          "j",
          "f",
          "g",
          "b",
          "c",
          "e",
          "i",
          "d",
          "a",
          "h",
        ],
        [
          "d",
          "f",
          "e",
          "g",
          "i",
          "h",
          "a",
          "b",
          "c",
          "j",
        ],
        [
          "f",
          "d",
          "h",
          "i",
          "c",
          "a",
          "e",
          "b",
          "j",
          "g",
        ],
      ]
    `);
  });

  it('present', () => {
    expect([1, 2, 3, 4, 5].map((s) => present(single, true, seededRng(s)))).toMatchInlineSnapshot(`
      [
        [
          "c",
          "a",
          "b",
        ],
        [
          "b",
          "a",
          "c",
        ],
        [
          "b",
          "a",
          "c",
        ],
        [
          "b",
          "a",
          "c",
        ],
        [
          "a",
          "b",
          "c",
        ],
      ]
    `);
    expect(present(single, false, seededRng(1))).toMatchInlineSnapshot(`
      [
        "a",
        "b",
        "c",
      ]
    `);
  });
});
