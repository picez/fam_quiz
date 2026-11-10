/**
 * Перевірка «Логіки й дедукції»: npx tsx apps/server/scripts/logic/check.ts [--net]
 * Схема, таймери ≥ 20 с (і вікно бліцу, і дуелі), ціни поля 100–500, 120–170 запитань, заборонені корені, відповідь не стоїть у тексті
 * запитання чи підказці, баланс «так/ні», повтори з іншими вікторинами, PNG на місці. Головне — відповіді головоломок: графічні
 * перераховують розв’язувачі з solve.ts за тими самими даними, з яких малюються картинки; шифри перешифровуються; логічні задачі
 * розв’язуються перебором. З --net ще й перевіряє, що фото Вікіпедії віддаються як JPEG/PNG.
 */
import { allSpares, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOGIC_FILES, LOGIC_PHOTOS, LOGIC_THEMES, logicQuiz, logicThemeOf } from '../logic-quiz';
import * as F from './figures';
import * as S from './solve';

/** Підробна адреса: ключ видно з неї, щоб знайти запитання за картинкою. */
const fake = (key: string) => `/uploads/${`k${key}`.padEnd(16, 'x')}.png`;
const keyOf = (url: string | null) => (url ? url.slice('/uploads/k'.length).replace(/x+\.png$/, '') : null);
const used = new Set<string>();
const quiz: Quiz = logicQuiz((key) => {
  if (!(LOGIC_FILES as readonly string[]).includes(key) && !(key in LOGIC_PHOTOS)) throw new Error(`img('${key}') is unknown`);
  if (key.includes('x')) throw new Error(`key ${key} has x: fake url would lose it`);
  used.add(key);
  return fake(key);
});

export const problems: string[] = [];
const short = (q: Question) => `«${q.text.slice(0, 60)}»`;

const parsed = quizSchema.safeParse(quiz);
if (!parsed.success) for (const i of parsed.error.issues) problems.push(`schema ${i.path.join('.')}: ${i.message}`);

const played = [...questionsOf(quiz), ...quiz.rounds.flatMap(roundTrials)];
const everything = [...played, ...allSpares(quiz)];

// Розмір великої гри.
if (played.length < 120 || played.length > 170) problems.push(`played ${played.length}: a big game needs 120–170 questions`);
if (allSpares(quiz).length < 2) problems.push('needs 2+ spares');

// Таймери.
for (const q of everything) if (q.timeLimit < 20) problems.push(`${short(q)}: timeLimit ${q.timeLimit} < 20`);
for (const r of quiz.rounds) if (r.type === 'blitz' && (r.answerWindow ?? 0) < 20) problems.push(`blitz answerWindow ${r.answerWindow} < 20`);
if ((quiz.duels?.timeLimit ?? 0) < 20) problems.push(`duel timeLimit ${quiz.duels?.timeLimit} < 20`);

// Ціни.
for (const r of quiz.rounds) {
  if (r.type === 'board')
    for (const c of r.categories) {
      const pts = c.cells.map((x) => x.question.points).join(',');
      if (pts !== '100,200,300,400,500') problems.push(`board ${c.title}: points ${pts}`);
      if (c.cells.filter((x) => x.mark !== 'none').length !== 1) problems.push(`board ${c.title}: expected exactly one ×2/×3`);
    }
  if (r.type === 'ladder') for (const q of r.questions) if (q.type !== 'single' || q.options.length !== 4) problems.push(`ladder ${short(q)}: needs single with 4 options`);
}

// Заборонені корені.
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'менделєєв', 'пажитнов', 'тетріс',
  'чайковськ', 'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris',
];
const blob = JSON.stringify(quiz);
for (const b of BANNED) if (new RegExp(`(?<!\\p{L})${b}`, 'iu').test(blob)) problems.push(`banned root ${b}`);

// Відповідь у тексті запитання чи підказці.
const norm = (s: string) => s.toLocaleLowerCase('uk').replace(/[«»"’'ʼ.,!?]/g, '').trim();
const answersOf = (q: Question): string[] => {
  switch (q.type) {
    case 'single':
      return [q.options.find((o) => o.id === q.correctId)?.text ?? ''];
    case 'multi':
      return q.options.filter((o) => q.correctIds.includes(o.id)).map((o) => o.text);
    case 'text':
    case 'clues':
    case 'bluff':
      return q.accepted;
    case 'chain':
      return q.words.slice(1);
    // Старт і ціль стоять у тексті самі собою; шлях ведучого (проміжні слова) — ні. Сам шлях перевіряє схема (ladderPathIssue).
    case 'wordladder':
      return q.path.slice(1, -1);
    // Список (27c): жоден пункт і жодне його написання не стоять у тексті завдання.
    case 'timedlist':
      return q.items.flatMap((item) => [item.text, ...item.accepted]);
    // Слова з літер (27d): відповіді-тексту немає — гравці складають слова самі.
    case 'letterwords':
      return [];
    default:
      return [];
  }
};
// Літери-варіанти А–Г, «Так»-варіанти й числа в рядах самі собою трапляються в тексті — їх не перевіряємо.
const skip = (a: string) => norm(a).length < 3 || /^\d+$/.test(norm(a));
// Задачі, де правильний варіант неминуче названо в умові (вибір серед названих людей, слів, деталей).
const NAMED = [
  'Петро старший за Олену', 'Синя шестерня крутиться', 'Справа про торт', 'Підозрюваний: «У суботу, 31 квітня', 'Три скриньки підписані',
  'Вікно розбив один із трьох', 'Ада, Бен і Віра', 'Яке слово зайве: стіл',
];
for (const q of everything) {
  if (NAMED.some((p) => q.text.startsWith(p))) continue;
  const where = norm([q.text, q.hint ?? '', q.type === 'clues' ? q.clues.join(' ') : ''].join(' '));
  for (const a of answersOf(q)) if (!skip(a) && where.includes(norm(a))) problems.push(`${short(q)}: answer «${a}» appears in the question`);
}
for (const c of quiz.duels?.categories ?? []) for (const d of c.questions) for (const a of d.accepted) if (!skip(a) && norm(d.text).includes(norm(a))) problems.push(`duel «${d.text}»: answer in text`);

// Так/ні.
const bools = everything.flatMap((q) => (q.type === 'boolean' ? [q.correct] : []));
const no = bools.filter((b) => !b).length;
if (no < Math.floor(bools.length * 0.4) || no > Math.ceil(bools.length * 0.6)) problems.push(`yes/no balance: ${bools.length - no} yes, ${no} no`);

// Повтори.
const ids = everything.map((q) => q.id);
if (new Set(ids).size !== ids.length) problems.push('duplicate ids');
const texts = everything.filter((q) => q.text !== 'Розгадайте ребус').map((q) => q.text);
texts.forEach((x, i) => texts.indexOf(x) !== i && !x.startsWith('Перекладіть') && !x.startsWith('Скільки трикутників') && !x.startsWith('Яку фігуру НЕ') && !x.startsWith('Хто я?') && problems.push(`duplicate text «${x.slice(0, 60)}»`));
const dir = join(import.meta.dirname, '..');
const others = readdirSync(dir)
  .filter((f) => f.endsWith('-quiz.ts') && f !== 'logic-quiz.ts')
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .concat(readdirSync(join(dir, 'evening')).map((f) => readFileSync(join(dir, 'evening', f), 'utf8')))
  .join('\n');
for (const x of new Set(texts)) if (others.includes(x)) problems.push(`«${x.slice(0, 60)}» exists in another quiz`);

// Картинки.
for (const key of LOGIC_FILES) {
  if (!existsSync(join(import.meta.dirname, 'img', `${key}.png`))) problems.push(`img/${key}.png is missing (run draw.ts)`);
  if (!(key in F.FIGURES)) problems.push(`FIGURES has no ${key}`);
  if (!used.has(key)) problems.push(`LOGIC_FILES ${key} is never used`);
}
for (const key of Object.keys(LOGIC_PHOTOS)) if (!used.has(key)) problems.push(`LOGIC_PHOTOS.${key} is never used`);

/* ---------- Відповіді головоломок ---------- */

const byKey = (key: string) => {
  const qs = everything.filter((q) => keyOf(q.imageUrl) === key);
  if (qs.length !== 1) problems.push(`picture ${key}: ${qs.length} questions`);
  return qs[0];
};
const byText = (part: string) => {
  const qs = everything.filter((q) => q.text.includes(part));
  if (qs.length !== 1) problems.push(`text «${part}»: ${qs.length} questions`);
  return qs[0];
};
const expectNumber = (q: Question | undefined, value: number, what: string) => {
  if (!q) return;
  if (q.type !== 'numeric' && q.type !== 'slider') return void problems.push(`${what}: not numeric`);
  if (q.correct !== value) problems.push(`${what}: quiz says ${q.correct}, solver says ${value}`);
};
const correctIndex = (q: Question | undefined) => (q?.type === 'single' ? q.options.findIndex((o) => o.id === q.correctId) : -1);
const expectIndex = (q: Question | undefined, index: number, what: string) => {
  if (!q) return;
  if (index < 0) return void problems.push(`${what}: solver found no unique answer`);
  if (correctIndex(q) !== index) problems.push(`${what}: quiz says option ${correctIndex(q)}, solver says ${index}`);
};
const only = (xs: boolean[]) => (xs.filter(Boolean).length === 1 ? xs.indexOf(true) : -1);
const optionTexts = (q: Question | undefined) => (q?.type === 'single' ? q.options.map((o) => o.text) : []);

// Лічба фігур.
expectNumber(byKey('g01'), S.countTriangles(F.TRI_EASY), 'g01 triangles');
expectNumber(byKey('g02'), S.countTriangles(F.TRI_MID), 'g02 triangles');
expectNumber(byKey('g03'), S.countTriangles(F.TRI_HARD), 'g03 triangles');
expectNumber(byKey('g04'), S.countRects(F.SQUARES, true), 'g04 squares');
expectNumber(byKey('g05'), S.countRects(F.RECTS), 'g05 rectangles');

// Сірники: єдиний розв’язок і в суворому, і в поблажливому прочитанні; решта варіантів — правдиві рівності, недосяжні одним сірником.
for (const [key, expr] of [['g06', F.MATCHES.easy], ['g07', F.MATCHES.mid], ['g08', F.MATCHES.hard]] as const) {
  const strict = S.matchMoves(expr, false);
  const lenient = S.matchMoves(expr, true);
  if (strict.length !== 1 || lenient.length !== 1 || strict[0] !== lenient[0]) problems.push(`${key} ${expr}: solutions ${strict} / ${lenient}`);
  const opts = optionTexts(byKey(key)).map((o) => o.replace(/−/g, '-').replace(/\s/g, ''));
  for (const o of opts) if (!S.trueEquation(o)) problems.push(`${key}: option ${o} is not a true equation`);
  expectIndex(byKey(key), only(opts.map((o) => lenient.includes(o))), `${key} matches`);
}

// Лабіринт: досяжний рівно один вихід.
const reach = S.reachable(F.MAZE.maze, F.MAZE.start);
expectIndex(byKey('g09'), only(F.MAZE.exits.map(([x, y]) => reach.has(`${x},${y}`))), 'g09 maze');

// Розгортки.
expectIndex(byKey('g10'), only(F.NETS_ONE_BAD.map((n) => !S.foldsToCube(n))), 'g10 nets');
expectIndex(byKey('g11'), only(F.NETS_ONE_GOOD.map(S.foldsToCube)), 'g11 nets');

// Поліоміно: рівно один варіант не є поворотом, і це дзеркало зразка.
for (const [key, p] of [['g12', F.POLY_A], ['g13', F.POLY_B]] as const) {
  const odd = only(p.options.map((o) => !S.sameByRotation(p.sample, o)));
  if (odd >= 0 && !S.sameByRotation(S.mirror(p.sample), p.options[odd])) problems.push(`${key}: the odd one is not the mirror`);
  expectIndex(byKey(key), odd, `${key} polyomino`);
}

// Латинський квадрат: бракує тієї фігури й того кольору, яких немає в останньому рядку й стовпці.
{
  const row = F.LATIN[2].slice(0, 2);
  const col = F.LATIN.slice(0, 2).map((r) => r[2]);
  const shapes = [0, 1, 2].filter((s) => !row.some((x) => x.shape === s) && !col.some((x) => x.shape === s));
  const colors = [0, 1, 2].filter((s) => !row.some((x) => x.color === s) && !col.some((x) => x.color === s));
  if (shapes.length !== 1 || colors.length !== 1) problems.push('g14: the missing cell is not unique');
  expectIndex(byKey('g14'), only(F.LATIN_OPTIONS.map((o) => o.shape === shapes[0] && o.color === colors[0])), 'g14 latin');
}

// Шестерні.
{
  const turns = S.gearTurns(F.GEARS);
  const want = turns === null ? 'Не крутиться' : turns[F.GEARS_ASK] === 1 ? 'За годинниковою' : 'Проти годинникової';
  expectIndex(byKey('g15'), only(optionTexts(byKey('g15')).map((o) => o.startsWith(want))), 'g15 gears');
  if (S.gearTurns(F.GEARS_JAM) !== null) problems.push('g16: the triangle of gears turns');
  expectIndex(byKey('g16'), only(optionTexts(byKey('g16')).map((o) => o.includes('не зрушить'))), 'g16 gears');
}

// Терези: ccc = s, s + c = t → tt у колах.
{
  const square = 3;
  const triangle = square + 1;
  if (F.SCALES.square !== square || F.SCALES.triangle !== triangle) problems.push('g17: SCALES data disagree');
  expectNumber(byKey('g17'), 2 * triangle, 'g17 scales');
}

// Піраміда: перебором шукаємо невідоме, що дає верх.
{
  const top = (bottom: number[]) => {
    let r = bottom;
    while (r.length > 1) r = r.slice(1).map((v, i) => v + r[i]);
    return r[0];
  };
  const xs = Array.from({ length: 200 }, (_, x) => x).filter((x) => top(F.PYRAMID.bottom.map((v) => v ?? x)) === F.PYRAMID.top);
  if (xs.length !== 1) problems.push(`g18: ${xs.length} solutions`);
  expectNumber(byKey('g18'), xs[0], 'g18 pyramid');
}

// Стрілки: +45° і +1 крапка.
{
  const deg = (F.ARROWS.shown.at(-1)! + 45) % 360;
  const dots = F.ARROWS.dots.at(-1)! + 1;
  expectIndex(byKey('g19'), only(F.ARROWS.options.map(([d, n]) => d === deg && n === dots)), 'g19 arrows');
}

// Зайва фігура: рівно одна, де крапок не стільки, скільки сторін.
expectIndex(byKey('g20'), only(F.ODD.figures.map(([s, d]) => s !== d)), 'g20 odd');

// Годинники: сталий крок.
{
  const mins = F.CLOCKS.shown.map(([h, m]) => h * 60 + m);
  const step = mins[1] - mins[0];
  if (mins.some((m, i) => i > 0 && m - mins[i - 1] !== step)) problems.push('g21: the step is not constant');
  const next = mins.at(-1)! + step;
  const want = `${Math.floor(next / 60)}:${String(next % 60).padStart(2, '0')}`;
  expectIndex(byKey('g21'), only(optionTexts(byKey('g21')).map((o) => o === want)), 'g21 clocks');
}

// Скарб: маршрут від криниці.
{
  const { marks } = F.TREASURE;
  const cellXY: S.Pt = [marks.hut[0], marks.well[1] + 2];
  const { x0, y0, s, w, h } = F.TREASURE_SIZE;
  const q = byKey('g22');
  const occupied = Object.values(marks).some(([x, y]) => x === cellXY[0] && y === cellXY[1]);
  if (occupied) problems.push('g22: the treasure cell holds a landmark');
  if (q?.type === 'pin') {
    const want = { x: (x0 + cellXY[0] * s + s / 2) / w, y: (y0 + cellXY[1] * s + s / 2) / h };
    if (Math.abs(q.target.x - want.x) > 1e-6 || Math.abs(q.target.y - want.y) > 1e-6) problems.push(`g22: target ${JSON.stringify(q.target)} vs ${JSON.stringify(want)}`);
    if (Math.abs(q.aspect - w / h) > 1e-6) problems.push('g22: aspect');
    // Повний радіус менший за пів клітинки: сусідня клітинка не дає повних балів.
    if ((q.fullRadius / 100) * w >= s / 2) problems.push('g22: full radius reaches the next cell');
  } else problems.push('g22: not a pin');
}

// Пентаграма в «Мільйонері».
{
  const q = byKey('g23');
  expectIndex(q, only(optionTexts(q).map((o) => Number(o) === S.countTriangles(F.PENTAGRAM))), 'pentagram');
}

// Шифри: перешифровуємо відповідь; у зсувах не має бути Г/Ґ (інакше Ґ у абетці змінює відповідь).
for (const q of everything.filter((x) => x.id.startsWith('cipher-'))) {
  if (q.type !== 'text') continue;
  const code = q.text.split(':').at(-1)!.trim().toLocaleLowerCase('uk');
  const plain = q.accepted[0].toLocaleLowerCase('uk');
  let got: string;
  if (q.text.includes('навпаки')) got = [...plain].reverse().join('');
  else if (q.text.includes('номер')) got = S.letterNumbers(plain).join(' · ');
  else if (q.text.includes('на дві далі')) got = S.caesar(plain, 2);
  else got = S.caesar(plain, 1);
  if (got !== code) problems.push(`cipher ${short(q)}: ${plain} → ${got}, text has ${code}`);
  if (!q.text.includes('навпаки') && /[гґ]/u.test(plain)) problems.push(`cipher ${short(q)}: plain text has Г/Ґ`);
}

// Логічні задачі перебором.
{
  // «Один винен, правду каже рівно один»: статементи — функції від винного.
  const culprit = (names: string[], says: ((c: string) => boolean)[], truths = 1) => {
    const ok = names.filter((c) => says.filter((f) => f(c)).length === truths);
    return ok.length === 1 ? ok[0] : null;
  };
  const cake = culprit(['Андрій', 'Богдана', 'Віктор'], [(c) => c === 'Богдана', (c) => c !== 'Богдана', (c) => c !== 'Андрій']);
  const q1 = byText('Справа про торт');
  expectIndex(q1, optionTexts(q1).indexOf(cake ?? '?'), 'cake');
  const glass = culprit(['Марко', 'Назар', 'Остап'], [(c) => c !== 'Марко', (c) => c === 'Марко', (c) => c !== 'Остап']);
  const q2 = byText('Вікно розбив');
  expectIndex(q2, optionTexts(q2).indexOf(glass ?? '?'), 'window');

  // Лицарі й брехуни: true — лицар.
  const worlds = [[true, true], [true, false], [false, true], [false, false]] as const;
  const olya = worlds.filter(([o, t]) => o === (!o && !t));
  const q3 = byText('Ми обоє брехуни');
  const olyaText = olya.length === 1 ? `Оля — ${olya[0][0] ? 'лицар' : 'брехунка'}, Тарас — ${olya[0][1] ? 'лицар' : 'брехун'}` : '?';
  expectIndex(q3, optionTexts(q3).indexOf(olyaText), 'Olya');
  const ab = worlds.filter(([a, b]) => a === !b && b === (a === b));
  const q4 = byText('Ми з А однакові');
  const abText = ab.length === 1 ? `А — ${ab[0][0] ? 'лицар' : 'брехун'}, Б — ${ab[0][1] ? 'лицар' : 'брехун'}` : '?';
  expectIndex(q4, optionTexts(q4).indexOf(abText), 'A and B');
  const liar = [true, false].filter((k) => k === !k);
  const q5 = byText('«Я брехун»');
  expectIndex(q5, liar.length === 0 ? optionTexts(q5).indexOf('Ніхто') : -1, 'I am a liar');

  // Перестановки.
  const perms = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  // Кольори: [Ада, Бен, Віра]; зріст: Ада найнижча, синій вищий за Віру; порядок Бена й Віри перебираємо.
  const greens = new Set<string>();
  for (const [ada, ben, vira] of perms(['червоне', 'синє', 'зелене']))
    for (const tall of perms(['Бен', 'Віра'])) {
      const height = { Ада: 0, [tall[0]]: 1, [tall[1]]: 2 } as Record<string, number>;
      const color = { Ада: ada, Бен: ben, Віра: vira } as Record<string, string>;
      const blue = Object.keys(color).find((n) => color[n] === 'синє')!;
      if (ada === 'червоне' || vira === 'зелене' || !(height[blue] > height['Віра'])) continue;
      greens.add(Object.keys(color).find((n) => color[n] === 'зелене')!);
    }
  const q6 = byText('Ада, Бен і Віра');
  if (greens.size !== 1 || q6?.type !== 'text' || q6.accepted[0] !== [...greens][0]) problems.push(`Ada: green ${[...greens]}`);

  // Тварини.
  const pets = perms(['кіт', 'пес', 'папуга']).filter(([ira, , sonya]) => ira !== 'кіт' && ira !== 'пес' && sonya !== 'пес');
  const q7 = byText('мають кота, пса й папугу');
  if (pets.length !== 1 || q7?.type !== 'match') problems.push(`pets: ${pets.length} solutions`);
  else {
    const want = ['Іра', 'Максим', 'Соня'].map((n, i) => `${n}=${pets[0][i]}`).sort().join();
    const got = q7.pairs.map((p) => `${p.left.text}=${p.right.text.toLocaleLowerCase('uk')}`).sort().join();
    if (want !== got) problems.push(`pets: ${got} vs ${want}`);
  }

  // Забіг.
  const race = perms(['Ліна', 'Марко', 'Ніна', 'Олег']).filter((p) => p.indexOf('Ліна') < p.indexOf('Марко') && p.indexOf('Ніна') < p.indexOf('Ліна') && p[3] === 'Олег');
  const q8 = byText('Забіг.');
  if (race.length !== 1 || q8?.type !== 'order' || q8.items.map((i) => i.text).join() !== race[0].join()) problems.push(`race: ${race.map((r) => r.join())}`);

  // Код сейфа.
  const codes = Array.from({ length: 900 }, (_, i) => i + 100).filter((n) => {
    const [a, b, c] = String(n).split('').map(Number);
    return b === 7 && a === 2 * c && a + b + c === 16;
  });
  if (codes.length !== 1) problems.push(`safe: ${codes}`);
  expectNumber(byText('Код сейфа'), codes[0], 'safe');

  // Таня й Ігор.
  const kids: number[] = [];
  for (let g = 1; g < 20; g++) for (let b = 1; b < 20; b++) if (g - 1 === b && g === 2 * (b - 1)) kids.push(g + b);
  if (kids.length !== 1) problems.push(`siblings: ${kids}`);
  expectNumber(byText('У Тані стільки ж братів'), kids[0], 'siblings');

  // Равлик.
  let day = 0;
  for (let h = 0; ; ) {
    day++;
    h += 3;
    if (h >= 10) break;
    h -= 2;
  }
  expectNumber(byText('Равлик повзе'), day, 'snail');

  // Погоня: перебір хвилин.
  const caught = Array.from({ length: 200 }, (_, m) => m).find((m) => 10 * (m / 60) >= 6 * ((m + 30) / 60));
  expectNumber(byText('Злодій тікає пішки'), caught!, 'chase');

  // Переправа: пошук у ширину станів (хто на лівому березі).
  {
    const items = ['фермер', 'вовк', 'коза', 'капуста'];
    const bad = (side: Set<string>) => !side.has('фермер') && ((side.has('вовк') && side.has('коза')) || (side.has('коза') && side.has('капуста')));
    const keyS = (left: Set<string>) => [...left].sort().join();
    const start = new Set(items);
    const dist = new Map([[keyS(start), 0]]);
    const queue = [start];
    let best = -1;
    while (queue.length) {
      const left = queue.shift()!;
      const d = dist.get(keyS(left))!;
      if (left.size === 0) {
        best = d;
        break;
      }
      const here = left.has('фермер') ? left : new Set(items.filter((i) => !left.has(i)));
      for (const cargo of [null, ...[...here].filter((i) => i !== 'фермер')]) {
        const moved = ['фермер', ...(cargo ? [cargo] : [])];
        const next = new Set(left);
        for (const m of moved) left.has('фермер') ? next.delete(m) : next.add(m);
        const right = new Set(items.filter((i) => !next.has(i)));
        if (bad(next) || bad(right) || dist.has(keyS(next))) continue;
        dist.set(keyS(next), d + 1);
        queue.push(next);
      }
    }
    expectNumber(byText('перевезти через річку'), best, 'river');
  }

  // Монети: k зважувань розрізняють 3^k монет.
  {
    let k = 0;
    while (3 ** k < 27) k++;
    const q = byText('Серед 27');
    expectIndex(q, optionTexts(q).indexOf(String(k)), 'coins');
  }

  // Батько й син.
  {
    const q = byText('Батькові 40');
    const x = Array.from({ length: 50 }, (_, i) => i).filter((i) => 40 + i === 3 * (10 + i));
    expectIndex(q, x.length === 1 ? optionTexts(q).indexOf(String(x[0])) : -1, 'father');
  }

  // Дев’ятки від 1 до 100.
  {
    const q = byText('цифра 9');
    const n = Array.from({ length: 100 }, (_, i) => String(i + 1)).join('').split('').filter((d) => d === '9').length;
    expectIndex(q, optionTexts(q).indexOf(String(n)), 'nines');
  }

  // ПАРАЛЕЛЕПІПЕД.
  {
    const q = byText('паралелепіпед');
    const left = [...'паралелепіпед'].filter((ch) => ch !== 'п').length;
    if (q?.type !== 'boolean' || q.correct !== (left === 10)) problems.push('parallelepiped');
  }

  // Вівторок + 10.
  {
    const q = byText('Через 10 днів буде п’ятниця');
    if (q?.type !== 'boolean' || q.correct !== ((1 + 10) % 7 === 4)) problems.push('tuesday');
  }

  // Годинник відстає.
  {
    const q = byText('відстає на 2 хвилини');
    const m = 18 * 60 - 6 * 2;
    expectIndex(q, optionTexts(q).indexOf(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`), 'slow clock');
  }
}

// Мережа.
if (process.argv.includes('--net')) {
  const UA = { 'user-agent': 'fam-quiz-seed/1.0 (demo content)' };
  for (const [key, title] of Object.entries(LOGIC_PHOTOS)) {
    const api = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&pithumbsize=1280&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
    const body = (await (await fetch(api, { headers: UA })).json()) as { query: { pages: Record<string, { thumbnail?: { source: string; width: number } }> } };
    const page = Object.values(body.query.pages)[0];
    const source = page?.thumbnail?.source;
    if (!source) {
      problems.push(`photo ${key}: no source`);
      continue;
    }
    const r = await fetch(source, { headers: UA });
    const type = r.headers.get('content-type') ?? '';
    const size = (await r.arrayBuffer()).byteLength;
    if (!r.ok || !/image\/(jpeg|png|webp)/.test(type)) problems.push(`photo ${key}: ${r.status} ${type}`);
    else console.log(`photo ${key}: ${type}, ${Math.round(size / 1024)} KB, ${page.thumbnail?.width} px wide`);
  }
}

// Звіт.
if (import.meta.main ?? process.argv[1]?.endsWith('check.ts')) {
  const byTheme = new Map<string, Map<string, number>>();
  for (const q of played) {
    const th = logicThemeOf(q.id) ?? '?';
    const m = byTheme.get(th) ?? new Map<string, number>();
    m.set(q.type, (m.get(q.type) ?? 0) + 1);
    byTheme.set(th, m);
  }
  for (const th of Object.keys(LOGIC_THEMES)) {
    const m = byTheme.get(th) ?? new Map();
    console.log(`${th}: ${[...m.values()].reduce((a, b) => a + b, 0)} — ${[...m].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  const types = new Map<string, number>();
  for (const q of played) types.set(q.type, (types.get(q.type) ?? 0) + 1);
  console.log(`played ${played.length}, spares ${allSpares(quiz).length}; types: ${[...types].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const r of quiz.rounds) console.log(`round ${r.id} (${r.type}): ${r.type === 'board' ? r.categories.reduce((a, c) => a + c.cells.length, 0) : r.questions.length}`);
  console.log(`images ${played.filter((q) => q.imageUrl).length}; yes/no: ${bools.length - no} yes, ${no} no`);
  for (const r of quiz.rounds) if (r.type === 'board') for (const c of r.categories) console.log(`board ${c.title}: ${c.cells.map((x) => `${x.question.points}${x.mark === 'none' ? '' : x.mark}${x.kind === 'blitz' ? ' бліц' : ''}${x.answerMode === 'voice' ? ' вголос' : ''}`).join(' | ')}`);
  console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'OK');
  process.exit(problems.length ? 1 : 0);
}
