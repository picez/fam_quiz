/**
 * Сліпа перевірка логіки «Таємної справи»: кожну задачу розв'язує перебір чи обчислення, і відповідь мусить збігтися
 * з тією, що записана в запитанні, та бути єдиною.
 */
import { describe, expect, it } from 'vitest';
import type { Question } from '@quiz/shared';
import { board } from './board';
import { open, quest } from './open';
import { bets, blitz, final, interrogation, puzzles, spares } from './rest';

const find = (list: Question[], start: string): Question => {
  const q = list.find((x) => x.text.startsWith(start));
  if (!q) throw new Error(`no question «${start}»`);
  return q;
};
const cells = board().flatMap(([, , slot]) => [...slot.cells.map((c) => c.question), slot.spare]);
const all = [...open(), ...quest.questions, ...cells, ...blitz(), ...interrogation(), ...bets(), final(), ...spares()];
const q = (start: string) => find(all, start);
const correctText = (x: Question) => (x.type === 'single' ? x.options.find((o) => o.id === x.correctId)?.text : undefined);
const numberOf = (x: Question) => (x.type === 'numeric' ? x.correct : undefined);
const boolOf = (x: Question) => (x.type === 'boolean' ? x.correct : undefined);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const digits = (n: number) => String(n).split('').map(Number);
const isPrime = (n: number) => n > 1 && range(2, Math.floor(Math.sqrt(n))).every((d) => n % d !== 0);
const perms = <T>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
const DAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота', 'Неділя'];
const UA = 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя';

describe('detective puzzles are solved by brute force', () => {
  it('quest code: four different digits, A < B, C = A·B, D = C − A − B → only 2361', () => {
    const codes = range(0, 9999)
      .map((n) => String(n).padStart(4, '0'))
      .filter((s) => {
        const [a, b, c, d] = s.split('').map(Number);
        return new Set(s).size === 4 && a < b && c === a * b && d === c - a - b;
      });
    expect(codes).toEqual([quest.code]);
  });

  it('final: three-digit multiples of 9 and 11 whose first digit is the sum of the others → only 990', () => {
    const found = range(100, 999).filter((n) => n % 99 === 0 && digits(n)[0] === digits(n)[1] + digits(n)[2]);
    expect(found).toEqual([numberOf(final())]);
  });

  it('liar puzzles have exactly one culprit', () => {
    // «Фарбу на килим»: правдиві рівно двоє.
    const kids = ['Оля', 'Петро', 'Іра', 'Сашко'];
    const paint = kids.filter((x) => {
      const s = [x !== 'Оля' && x !== 'Іра', x === 'Сашко', x !== 'Іра'];
      s.push(!s[1]);
      return s.filter(Boolean).length === 2;
    });
    expect(paint).toEqual([correctText(q('Фарбу на килим'))]);
    // «Вазу розбив»: збрехав рівно один.
    const four = ['Аліна', 'Борис', 'Влад', 'Галя'];
    const vase = four.filter((x) => [x === 'Борис' || x === 'Влад', x !== 'Борис' && x !== 'Галя', x === 'Галя', x !== 'Аліна'].filter((v) => !v).length === 1);
    expect(vase).toEqual([correctText(q('Вазу розбив'))]);
    // «Печатка»: у кожного рівно одне речення правдиве.
    const three = ['Яна', 'Роман', 'Віктор'];
    const seal = three.filter((x) =>
      [
        [x !== 'Яна', x === 'Віктор'],
        [x !== 'Роман', x !== 'Віктор'],
        [x !== 'Віктор', x === 'Яна'],
      ].every(([a, b]) => a !== b),
    );
    expect(seal).toEqual([correctText(q('Хтось із трьох узяв печатку'))]);
  });

  it('witness order is unique', () => {
    const names = ['Юрко', 'Лука', 'Марта', 'Богдан', 'Тарас'];
    const ok = perms(names).filter((p) => {
      const at = (n: string) => p.indexOf(n);
      return at('Юрко') < at('Марта') && at('Марта') < at('Богдан') && at('Тарас') === at('Богдан') + 1 && at('Лука') === at('Марта') - 1;
    });
    const order = q('П’ятеро свідків');
    expect(ok).toEqual([order.type === 'order' ? order.items.map((i) => i.text) : []]);
  });

  it('the theft grid is unique', () => {
    const people = ['Ганна', 'Денис', 'Ірина', 'Петро'];
    const men = ['Денис', 'Петро'];
    const ok = perms(['Перстень', 'Годинник', 'Ваза', 'Картина']).filter((items) => {
      const of = (p: string) => items[people.indexOf(p)];
      const watch = people[items.indexOf('Годинник')];
      return !['Картина', 'Ваза'].includes(of('Ганна')) && men.includes(watch) && !['Годинник', 'Ваза'].includes(of('Петро'));
    });
    const grid = q('Кожен із чотирьох украв');
    expect(ok).toEqual([grid.type === 'match' ? grid.pairs.map((p) => p.right.text) : []]);
  });

  it('the ball syllogism: the marked options are exactly the necessary conclusions', () => {
    // Моделі на трьох людях: [на балу, запрошення, маска, танцював]; перевіряємо, що випливає в УСІХ моделях.
    type P = [boolean, boolean, boolean, boolean];
    const people: P[] = range(0, 15).map((m) => [!!(m & 1), !!(m & 2), !!(m & 4), !!(m & 8)]);
    const models: P[][] = [];
    for (const a of people) for (const b of people) for (const c of people) models.push([a, b, c]);
    const valid = models.filter((w) => w.every(([ball, inv]) => !ball || inv) && w.some(([, inv, mask]) => inv && mask) && w.every(([, , mask, dance]) => !(mask && dance)));
    const claims = [
      (w: P[]) => w.every(([, , mask, dance]) => !dance || !mask),
      (w: P[]) => w.some(([ball, , mask]) => ball && mask),
      (w: P[]) => w.every(([ball, inv]) => inv || !ball),
      (w: P[]) => w.some(([, inv, , dance]) => inv && !dance),
      (w: P[]) => w.every(([ball, inv]) => !inv || ball),
    ];
    const necessary = claims.map((c, i) => (valid.every(c) ? i : -1)).filter((i) => i >= 0);
    const m = q('Відомо: кожен, хто був на балу');
    expect(m.type === 'multi' ? m.correctIds : []).toEqual(necessary.map((i) => String.fromCharCode(97 + i)));
  });

  it('number puzzles', () => {
    const lcm = range(1, 1000).find((n) => n % 4 === 0 && n % 6 === 0 && n % 10 === 0);
    expect(numberOf(q('Ліна чергує в архіві'))).toBe(lcm);
    expect(numberOf(q('Скільки буде 100 − 99'))).toBe(range(1, 100).reduce((s, n) => s + (n % 2 === 0 ? n : -n), 0));
    expect(numberOf(q('Код сейфа — три різні цифри'))).toBe(range(123, 789).filter((n) => digits(n)[0] < digits(n)[1] && digits(n)[1] < digits(n)[2] && !digits(n).includes(0)).length);
    const aabb = range(1000, 9999).filter((n) => {
      const [a, b, c, d] = digits(n);
      return a === b && c === d && a !== c && Number.isInteger(Math.sqrt(n));
    });
    expect(aabb).toEqual([numberOf(q('Свідок запам’ятав номер машини'))]);
    const mirror = range(1000, 9999).filter((n) => n * 4 === Number(String(n).split('').reverse().join('')));
    expect(mirror.map(String)).toEqual([correctText(q('Логіка: агентка множить'))]);
    expect(numberOf(q('Логіка: будинки на вулиці'))).toBe(range(1, 1000).filter((n) => String(n).includes('7')).length);
    // Голуб: час до зустрічі × швидкість.
    expect(numberOf(q('Логіка: два детективи'))).toBe((90 / (40 + 50)) * 100);
    // Пара з чотирьох містить злодія (особа 0) у 3 з 6 пар.
    const pairs = range(0, 3).flatMap((a) => range(a + 1, 3).map((b) => [a, b]));
    expect(pairs.filter((p) => p.includes(0)).length / pairs.length).toBe(0.5);
    expect(correctText(q('Логіка: слідчий навмання'))).toBe('1/2');
    expect(numberOf(q('Злодій забрав зі скриньки'))).toBe(range(1, 200).find((n) => n % 2 === 0 && n / 2 - 3 === 10));
    expect(numberOf(q('Агент іде від штабу'))).toBe(12 + 24);
    expect(numberOf(q('Трьом братам'))).toBe(range(1, 36).find((y) => y + (y + 2) + (y + 4) === 36)! + 4);
    expect(numberOf(q('Детектив прочитав першого дня'))).toBe(10 + 15 + 20 + 25);
    expect(correctText(q('Яке число зайве: 16'))).toBe(String([16, 25, 36, 48, 64].find((n) => !Number.isInteger(Math.sqrt(n)))));
  });

  it('day-of-week puzzles', () => {
    // Десяте чергування: день 1 + 9 · 3 = 28; 1-ше — понеділок.
    expect(correctText(q('Інспектор чергує'))).toBe(DAYS[(28 - 1) % 7]);
    // Післязавтра після понеділка — середа (індекс 2); через три дні після неї — сьогодні.
    expect(correctText(q('Три дні тому'))).toBe(DAYS[(0 + 2 + 3) % 7]);
  });

  it('sequences', () => {
    expect(numberOf(q('Яке число наступне: 1, 4, 7'))).toBe(16);
    expect(numberOf(q('Яке число наступне: 1, 2, 4, 7'))).toBe(16 + 6);
    expect(numberOf(q('Яке число наступне: 2, 6, 12'))).toBe(6 * 7);
    const prod = (n: number) => digits(n).reduce((a, b) => a * b, 1);
    expect([77, 49, 36, 18].slice(1)).toEqual([77, 49, 36].map(prod));
    expect(numberOf(q('Яке число наступне: 77'))).toBe(prod(18));
    expect(numberOf(q('Яке число наступне: 1, 8, 27'))).toBe(5 ** 3);
    const months = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень'];
    expect(correctText(q('Яка літера наступна: С, Л'))).toBe(months[6][0]);
  });

  it('word puzzles', () => {
    const sorted = (w: string) => [...w.toLocaleLowerCase('uk')].sort().join('');
    // Шифр зсуву на одну літеру.
    const shifted = [...'доказ'].map((ch) => UA[UA.indexOf(ch) + 1]).join('').toLocaleUpperCase('uk');
    expect(q('Шифр зсуву').text).toContain(`«${shifted}»`);
    expect(sorted('клоун')).toBe(sorted('кулон'));
    expect(sorted('сосна')).toBe(sorted('насос'));
    const pal = q('Яке з цих слів — паліндром');
    if (pal.type !== 'single') throw new Error('palindrome');
    const pals = pal.options.filter((o) => [...o.text.toLowerCase()].reverse().join('') === o.text.toLowerCase());
    expect(pals.map((o) => o.text)).toEqual([correctText(pal)]);
    const det = q('Яке з цих слів НЕ можна');
    if (det.type !== 'single') throw new Error('detektyv');
    const fits = (w: string) => {
      const left = [...'детектив'];
      return [...w.toLowerCase()].every((ch) => left.includes(ch) && left.splice(left.indexOf(ch), 1).length === 1);
    };
    expect(det.options.filter((o) => !fits(o.text)).map((o) => o.text)).toEqual([correctText(det)]);
    // «Пам’ять»: кожна пара — анаграми, і жодна картка не є анаграмою картки з іншої пари.
    const mem = puzzles().memory;
    if (mem.type !== 'memory') throw new Error('memory');
    const cards = mem.pairs.flatMap((p, i) => [p.a.text, p.b.text].map((t) => [t, i] as const));
    for (const p of mem.pairs) expect(sorted(p.a.text)).toBe(sorted(p.b.text));
    for (const [t, i] of cards) expect(cards.filter(([u, j]) => j !== i && sorted(u) === sorted(t))).toEqual([]);
  });

  it('primes and composites are sorted right', () => {
    const s = q('Розсортуйте числа');
    if (s.type !== 'sort') throw new Error('sort');
    for (const w of s.words) expect(w.categoryId.endsWith(isPrime(Number(w.text)) ? '-c0' : '-c1'), w.text).toBe(true);
  });

  it('the quest order and the more-or-less pairs hold', () => {
    const o = q('Розставте від найменшого');
    const values: Record<string, number> = { 'Секунд в одній годині': 3600, 'Годин в одному році': 365 * 24, 'Хвилин в одному тижні': 7 * 24 * 60, 'Днів в одному столітті': 36524 };
    const texts = o.type === 'order' ? o.items.map((i) => i.text) : [];
    expect(texts).toEqual([...texts].sort((a, b) => values[a] - values[b]));
    expect(365 * 24 * 1.01).toBeLessThan(7 * 24 * 60); // навіть у високосному році годин менше, ніж хвилин у тижні
    const m = q('Більше чи менше');
    if (m.type !== 'moreless') throw new Error('moreless');
    const real = [
      [4 ** 3, 3 ** 4],
      [200, range(1, 20).reduce((a, b) => a + b, 0)],
      [(6 * 3) / 2, (5 * 2) / 2],
      [0.3 * 200, 0.25 * 300],
      [24 * 60, 20 * 60],
    ];
    m.pairs.forEach((p, i) => {
      expect([Number(p.a.value), Number(p.b.value)]).toEqual(real[i]);
      expect(p.correct).toBe(real[i][0] > real[i][1] ? 'a' : 'b');
    });
  });

  it('true/false statements about numbers are right', () => {
    expect(boolOf(q('Число 144'))).toBe(14 * 14 === 144);
    expect(boolOf(q('Якщо помножити будь-яке ціле'))).toBe(range(1, 5000).every((n) => digits(9 * n).reduce((a, b) => a + b, 0) % 9 === 0));
    const coins = ['ГГ', 'ГР', 'РГ', 'РР'];
    expect(boolOf(q('Якщо підкинути дві монети'))).toBe(coins.filter((c) => c.includes('Г') && c.includes('Р')).length / coins.length === 1 / 3);
    expect(boolOf(q('Добуток будь-яких чотирьох'))).toBe(range(1, 2000).every((n) => Number.isInteger(Math.sqrt(n * (n + 1) * (n + 2) * (n + 3) + 1))));
    expect(boolOf(q('Кожне тризначне число з трьох однакових'))).toBe(range(1, 9).every((d) => (111 * d) % 37 === 0));
    expect(boolOf(q('Існує трикутник'))).toBe(2 + 3 > 6);
    expect(boolOf(q('Будь-яке тризначне число, записане двічі'))).toBe(range(100, 999).every((n) => Number(`${n}${n}`) % 13 === 0));
    expect(boolOf(q('Сума кутів будь-якого опуклого'))).toBe(false);
    // У будь-якому місяці (28…31 день) кожен день тижня трапляється щонайменше 4 рази.
    expect(boolOf(q('У будь-якому місяці року'))).toBe(range(28, 31).every((len) => range(0, 6).every((first) => range(0, len - 1).filter((d) => (first + d) % 7 === 6).length >= 4)));
  });
});
