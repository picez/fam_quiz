import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITS, answerKey, autopilotCheck, questionsOf, quizSchema, type Question } from '@quiz/shared';
import { filmbluffQuiz } from './filmbluff-quiz';
import { MIN_TIMER } from './mix-quiz';

const quiz = filmbluffQuiz();
const everything = questionsOf(quiz);
const clips = everything.filter((q): q is Extract<Question, { type: 'videoclip' }> => q.type === 'videoclip');
const bluffs = everything.filter((q): q is Extract<Question, { type: 'bluff' }> => q.type === 'bluff');

/** Ключ тексту: малими, апострофи ’ ʼ ‘ ` — як «'», пробіли стиснуто. */
const key = (text: string) => text.trim().toLocaleLowerCase('uk').replace(/[’ʼ‘`]/g, "'").replace(/\s+/g, ' ');

const dir = import.meta.dirname;
/** Усі інші сіди: .ts у scripts і підтеках, крім цього сіда й тестів (node: grep пропускає кирилицю). */
const otherSources = (): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.startsWith('filmbluff') && !f.includes('.test.'))
    .map((f) => readFileSync(join(dir, f), 'utf8'));

/**
 * Трейлери, перевірені 2026-11-19: oEmbed 200, playableInEmbed, старт — за розкадровкою YouTube (кадр кожні 1–2 с):
 * після рейтингових заставок і логотипів, до старт + 16 с назви фільму немає.
 */
const VERIFIED: Record<string, number> = {
  iurbZwxKFUE: 3, // «Красуня і Чудовисько» (1991)
  LZl69yk5lEY: 9, // «Маска» (1994)
  '8-8eEniEfgU': 6, // «Армагеддон» (1998)
  'Wlo-sYrADlw': 5, // «Стюарт Літтл» (1999)
  '8piqd2BWeGI': 26, // «Швидкість» (1994)
  VApVpvcGW1A: 8, // «101 далматинець» (1996)
  dlnmQbPGuls: 8, // «Шоу Трумана» (1998)
  AEOfT7hUcDs: 14, // «Втеча з курятника» (2000)
  'c-vwgt8cwEM': 19, // «Капітан Гак» (1991)
  '3euGQ7-brs4': 6, // «Місіс Даутфайр» (1993)
  B1E7h3SeMDk: 4, // «День незалежності» (1996)
  mE35XQFxbeo: 10, // «Пригоди Фліка» (1998)
  yuzXPzgBDvo: 12, // «Бейб» (1995)
  JMiFsFQcFLE: 11, // «Година пік» (1998)
  O6i3lyx1I_g: 5, // «Горбань із Нотр-Даму» (1996)
  'jhJYMEzQA-Q': 9, // «Подарунок на Різдво» (1996)
  pqs9ycvKfD8: 10, // «П’ятий елемент» (1997)
  '1UigDLytK5A': 5, // «Матильда» (1996)
  HKH7_n425Ss: 23, // «Мулан» (1998)
  xk0XY83eEuM: 4, // «Звільніть Віллі» (1993)
  l13yPhimE3o: 5, // «Тупий і ще тупіший» (1994)
  EYkguxpqsrg: 10, // «Назад у майбутнє 3» (1990)
  PMAhVpgzmRU: 5, // «Пастка для батьків» (1998)
  G388UMkJIBE: 6, // «Сімейка Адамсів» (1991)
  'LWbtxG-jXMY': 5, // «Доктор Дулітл» (1998)
  KEAewElEcCo: 11, // «Флаббер» (1997)
  'PeH_fzD5W8w': 30, // «Дитсадок поліцейського» (1990)
};

/** Фільми, що вже є кліпами чи відео в інших сідах (big3, school3, movies90, video): тут їх бути не може. */
const TAKEN_FILMS = ['Сам удома', 'Титанік', 'Король Лев', 'Матриця', 'Аладдін', 'Форрест Гамп', 'Парк Юрського періоду', 'Історія іграшок', 'Термінатор', 'Джуманджі', 'Мумія', 'Люди в чорному', 'Корпорація монстрів', 'Інтерстеллар', 'Зоотрополіс'];

const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін', 'сибір',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'siberia',
];

describe('the «Кінозал і блеф» quiz', () => {
  it('passes the quiz schema with interleaved clip and bluff rounds of only those two types', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(quiz.rounds.every((r) => r.type === 'classic')).toBe(true);
    expect(new Set(everything.map((q) => q.type))).toEqual(new Set(['videoclip', 'bluff']));
    expect(clips.length).toBeGreaterThanOrEqual(25);
    expect(clips.length).toBeLessThanOrEqual(30);
    expect(bluffs.length).toBeGreaterThanOrEqual(15);
    expect(bluffs.length).toBeLessThanOrEqual(20);
    // Кожен раунд — одного типу, і типи чергуються.
    const kinds = quiz.rounds.map((r) => [...new Set(questionsOf({ ...quiz, rounds: [r] }).map((q) => q.type))]);
    expect(kinds.every((k) => k.length === 1)).toBe(true);
    expect(kinds.flat().every((t, i, all) => i === 0 || t !== all[i - 1])).toBe(true);
  });

  it('runs on the autopilot without a host', () => {
    expect(autopilotCheck(quiz).blocked).toEqual([]);
  });

  it('gives every question and choice phase at least 25 seconds', () => {
    expect(everything.filter((q) => q.timeLimit < MIN_TIMER).map((q) => q.id)).toEqual([]);
    for (const q of bluffs) expect(q.choiceTime, q.text).toBeGreaterThanOrEqual(MIN_TIMER);
  });

  it('plays every trailer from a verified clip at its verified start, muted, with no other media', () => {
    expect(Object.fromEntries(clips.map((q) => [q.clip.id, q.clip.start]))).toEqual(VERIFIED);
    expect(clips.every((q) => q.muted)).toBe(true);
    expect(everything.filter((q) => q.audio !== undefined || q.video !== null || q.imageUrl !== null).map((q) => q.id)).toEqual([]);
  });

  it('shares no YouTube id and no clip film with any other seed', () => {
    const others = otherSources().join('\n');
    expect(Object.keys(VERIFIED).filter((id) => others.includes(id))).toEqual([]);
    const accepted = clips.flatMap((q) => q.accepted.map(answerKey));
    expect(TAKEN_FILMS.filter((film) => accepted.includes(answerKey(film)))).toEqual([]);
    // Жоден фільм не повторюється всередині вікторини.
    const titles = clips.map((q) => answerKey(q.accepted[0]!));
    expect(titles.filter((t, i) => titles.indexOf(t) !== i)).toEqual([]);
  });

  it('gives every bluff two or three spare lies that differ from the truth', () => {
    for (const q of bluffs) {
      expect(q.lies.length, q.text).toBeGreaterThanOrEqual(2);
      expect(q.lies.length, q.text).toBeLessThanOrEqual(3);
      const truth = q.accepted.map(answerKey);
      expect(q.lies.filter((l) => truth.includes(answerKey(l))), q.text).toEqual([]);
    }
  });

  it('leaks no answer into its question', () => {
    const norm = (s: string) => key(s).replace(/[«»"'.,!?]/g, '');
    const leaks: string[] = [];
    for (const q of [...clips, ...bluffs]) {
      const where = norm(`${q.text} ${q.hint ?? ''}`);
      for (const a of q.accepted) if (norm(a).length >= 3 && where.includes(norm(a))) leaks.push(`${q.id}: ${a}`);
    }
    expect(leaks).toEqual([]);
    // Назви фільмів із кліпів не звучать у текстах блефу (інакше блеф підказав би кліп).
    const bluffText = norm(bluffs.map((q) => q.text).join(' '));
    expect(clips.flatMap((q) => q.accepted).filter((a) => norm(a).length >= 4 && bluffText.includes(norm(a)))).toEqual([]);
  });

  it('has no duplicate question texts, here or in other seed quizzes', () => {
    const texts = everything.map((q) => key(q.text));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    const others = key(otherSources().join('\n'));
    expect(texts.filter((text) => others.includes(text))).toEqual([]);
  });

  it('contains nothing related to russia', () => {
    const text = JSON.stringify(quiz).toLocaleLowerCase('uk');
    expect(BANNED.filter((word) => text.includes(word))).toEqual([]);
  });
});
