import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  allSpares,
  crosswordIssue,
  fitsLetters,
  generateSudoku,
  ladderKey,
  ladderPathIssue,
  letterSet,
  questionPrice,
  questionsOf,
  quizSchema,
  roundTrials,
  sudokuIssue,
  type Question,
  type Quiz,
} from '@quiz/shared';
import { loadNouns } from '../src/wordladder/nouns';
import { DETECTIVE_FILES, detectiveQuiz } from './detective-quiz';

const MIN_TIMER = 25;
const photoUrl = (k: string) => `/uploads/${k.toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(16, '0').slice(0, 64)}.jpg`;
const keys: string[] = [...DETECTIVE_FILES];
const used = new Set<string>();
const quiz = detectiveQuiz((k) => {
  if (!keys.includes(k)) throw new Error(`Unknown picture ${k}`);
  used.add(k);
  return photoUrl(k);
});

const key = (text: string) => text.trim().toLocaleLowerCase('uk');
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
const everything = [...played(quiz), ...allSpares(quiz)];
const ofType = <T extends Question['type']>(type: T) => played(quiz).filter((q): q is Extract<Question, { type: T }> => q.type === type);

/** Тексти інших сідів (усі .ts у scripts і підтеках, крім detective і тестів). */
const dir = import.meta.dirname;
const others = readdirSync(dir, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.ts') && !f.startsWith('detective') && !f.includes('.test.'))
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');

const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград', 'ломоносов', 'фандорін', 'акунін',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris', 'mendeleev',
];

/** Слова, що випадково містять заборонений шматок, — лише ці й нічого іншого. */
const WHITELIST = /натуральн/g;
/** «Хто злодій / хто бреше»: підозрюваних неминуче названо в умові, тож правильний варіант там є. */
const NAMED = ['Вазу розбив', 'Картину вкрали', 'Фарбу на килим', 'У нічному потязі', 'Хтось із трьох узяв'];

describe('the «Таємна справа» quiz', () => {
  it('passes the quiz schema within the limits and is medium-sized', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeGreaterThanOrEqual(7);
    expect(quiz.rounds.length).toBeLessThanOrEqual(Math.min(9, LIMITS.maxRounds));
    expect(played(quiz).length).toBeGreaterThanOrEqual(80);
    expect(played(quiz).length).toBeLessThanOrEqual(100);
  });

  it('uses every picture it declares', () => {
    expect(keys.filter((k) => !used.has(k))).toEqual([]);
  });

  it('mixes many round and question types, and has no polls, word clouds or surveys', () => {
    const rounds = quiz.rounds.map((r) => r.type);
    for (const type of ['classic', 'quest', 'board', 'blitz', 'ladder', 'puzzles', 'bets', 'final']) expect(rounds).toContain(type);
    const types = new Set<string>(played(quiz).map((q) => q.type));
    const wanted = ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'wordladder', 'sort', 'slider', 'clues', 'wall'];
    wanted.push('letterwords', 'moreless', 'drawing', 'sudoku', 'crossword', 'spotdiff', 'memory');
    expect(wanted.filter((t) => !types.has(t))).toEqual([]);
    for (const type of ['poll', 'wordcloud', 'survey']) expect(types).not.toContain(type);
  });

  it('mentions nothing related to russia', () => {
    const all = JSON.stringify(quiz).toLocaleLowerCase('uk').replace(WHITELIST, '');
    expect(BANNED.filter((b) => all.includes(b))).toEqual([]);
  });

  it('gives every question, spare and blitz window at least 25 seconds', () => {
    expect(everything.filter((q) => q.timeLimit < MIN_TIMER).map((q) => `${q.id} ${q.timeLimit}`)).toEqual([]);
    for (const r of quiz.rounds) if (r.type === 'blitz') expect(r.answerWindow ?? MIN_TIMER).toBeGreaterThanOrEqual(MIN_TIMER);
  });

  it('prices classic questions 500/1000/1500 by difficulty', () => {
    const prices = new Set([500, 1000, 1500]);
    for (const r of quiz.rounds) {
      if (r.type !== 'classic') continue;
      for (const q of r.questions) if (!['sort', 'letterwords', 'moreless'].includes(q.type)) expect(prices.has(q.points), `${q.id} ${q.points}`).toBe(true);
    }
  });

  it('has valid puzzles: generated sudoku with fresh seeds, crosswords with fresh words, a sane spot-the-difference', () => {
    for (const q of ofType('sudoku')) {
      expect(sudokuIssue(q.givens, q.solution)).toBeNull();
      expect({ givens: q.givens, solution: q.solution }).toEqual(generateSudoku(q.seed ?? 0, q.level === 'custom' ? 'easy' : q.level));
      expect([1111, 1112, 2811, 2812, 4407, 5521, 5522]).not.toContain(q.seed);
    }
    expect(new Set(ofType('sudoku').map((q) => q.seed)).size).toBe(2);
    const crosswords = ofType('crossword');
    expect(new Set(crosswords.map((q) => q.mode))).toEqual(new Set(['key', 'full']));
    const low = others.toLocaleLowerCase('uk');
    const texts = everything.map((q) => key(`${q.text} ${q.hint ?? ''}`)).join('\n');
    for (const q of crosswords) {
      expect(crosswordIssue(q)).toBeNull();
      for (const e of q.entries) {
        expect(key(e.clue)).not.toContain(key(e.answer));
        expect(low.includes(key(e.answer)), e.answer).toBe(false);
        expect(texts.includes(key(e.answer)), e.answer).toBe(false);
      }
    }
    for (const q of ofType('spotdiff')) {
      expect(q.spots.length).toBe(8);
      for (const s of q.spots) for (const v of [s.x, s.y]) expect(v > 0 && v < 1).toBe(true);
    }
  });

  it('builds every word ladder from dictionary nouns along the unique shortest path', () => {
    const nouns = loadNouns();
    for (const l of ofType('wordladder')) {
      expect(ladderPathIssue(l.path, l.maxSteps)).toBeNull();
      const path = l.path.map((w) => ladderKey(w));
      expect(path.filter((k) => k === null || !nouns.isNoun(k))).toEqual([]);
      const [start, goal] = [path[0] as string, path[path.length - 1] as string];
      const words = new Set([...nouns.keys()].filter((w) => w.length === start.length));
      const letters = new Set([...words].join(''));
      const dist = new Map([[start, 0]]);
      const ways = new Map([[start, 1]]);
      const queue = [start];
      while (queue.length > 0) {
        const w = queue.shift() as string;
        for (let i = 0; i < w.length; i++)
          for (const ch of letters) {
            const next = w.slice(0, i) + ch + w.slice(i + 1);
            if (!words.has(next) || next === w) continue;
            const d = (dist.get(w) ?? 0) + 1;
            if (!dist.has(next)) {
              dist.set(next, d);
              ways.set(next, ways.get(w) ?? 0);
              queue.push(next);
            } else if (dist.get(next) === d) ways.set(next, (ways.get(next) ?? 0) + (ways.get(w) ?? 0));
          }
      }
      expect(dist.get(goal), l.path.join('→')).toBe(l.path.length - 1);
      expect(ways.get(goal), l.path.join('→')).toBe(1);
    }
  });

  it('gives the letter set plenty of dictionary words', () => {
    const nouns = [...loadNouns().keys()];
    for (const q of ofType('letterwords')) {
      const set = q.set.kind === 'fixed' ? letterSet(q.set.letters) : null;
      if (set === null) continue;
      expect(nouns.filter((w) => fitsLetters(w, set)).length).toBeGreaterThanOrEqual(30);
    }
  });

  it('has a fair mix of true and false in yes/no questions, without long runs in the blitz', () => {
    const bools = everything.filter((q): q is Extract<Question, { type: 'boolean' }> => q.type === 'boolean');
    const trueCount = bools.filter((q) => q.correct).length;
    expect(trueCount).toBeGreaterThanOrEqual(Math.ceil(bools.length * 0.4));
    expect(trueCount).toBeLessThanOrEqual(Math.floor(bools.length * 0.6));
    for (const r of quiz.rounds) {
      if (r.type !== 'blitz') continue;
      const row = r.questions.map((q) => (q.type === 'boolean' ? (q.correct ? 'T' : 'F') : '-')).join('');
      expect(row).not.toMatch(/TTT|FFF/);
    }
  });

  it('marks the board randomly: one ×2/×3 per category, blitz cells in some categories only, prices 100…500', () => {
    const round = quiz.rounds.find((r) => r.type === 'board');
    if (round?.type !== 'board') throw new Error('no board');
    expect(round.categories).toHaveLength(6);
    expect(new Set(round.categories.map((c) => c.cells.findIndex((x) => x.mark !== 'none'))).size).toBeGreaterThan(1);
    expect(new Set(round.categories.flatMap((c) => c.cells.filter((x) => x.mark !== 'none').map((x) => x.mark))).size).toBe(2);
    const withBlitz = round.categories.filter((c) => c.cells.some((x) => x.kind === 'blitz')).length;
    expect(withBlitz).toBeGreaterThan(0);
    expect(withBlitz).toBeLessThan(round.categories.length);
    for (const c of round.categories) {
      expect(c.cells.filter((x) => x.mark !== 'none')).toHaveLength(1);
      expect(c.cells.filter((x) => x.kind === 'blitz').length).toBeLessThanOrEqual(1);
      for (const x of c.cells) if (x.kind === 'blitz') expect(x.answerMode !== 'voice' && x.question.type !== 'chain').toBe(true);
      expect(c.cells.map((x) => questionPrice(x.question))).toEqual([100, 200, 300, 400, 500]);
    }
  });

  it('has a ten-step «Мільйонер» of four-option single choices', () => {
    const round = quiz.rounds.find((r) => r.type === 'ladder');
    const qs = round?.type === 'ladder' ? round.questions : [];
    expect(qs).toHaveLength(10);
    for (const q of qs) expect(q.type === 'single' && q.options.length === 4).toBe(true);
  });

  it('keeps the drawing neutral and spares simple', () => {
    for (const q of ofType('drawing')) expect(q.text).toMatch(/^Малюнок \d+: вгадайте, що малює художник$/);
    for (const q of allSpares(quiz)) {
      expect(['single', 'boolean', 'text', 'numeric']).toContain(q.type);
      expect(q.imageUrl === null && q.video === null && q.audio === undefined).toBe(true);
    }
    expect(quiz.spares?.length).toBeGreaterThanOrEqual(4);
  });

  it('leaks no answer into its own question or into another question', () => {
    const norm = (s: string) => s.toLocaleLowerCase('uk').replace(/[«»"’'ʼ.,!?]/g, '');
    const answersOf = (q: Question): string[] =>
      q.type === 'single'
        ? [q.options.find((o) => o.id === q.correctId)?.text ?? '']
        : q.type === 'text' || q.type === 'clues' || q.type === 'drawing'
          ? q.accepted
          : q.type === 'wordladder'
            ? q.path.slice(1, -1)
            : q.type === 'crossword'
              ? q.entries.map((e) => e.answer)
              : [];
    const whereOf = (q: Question) => norm(`${q.text} ${q.hint ?? ''} ${q.type === 'clues' ? q.clues.join(' ') : ''}`);
    const leaks: string[] = [];
    for (const q of everything) {
      const where = whereOf(q);
      if (NAMED.some((n) => q.text.startsWith(n))) continue;
      for (const a of answersOf(q)) if (norm(a).length >= 3 && !/^\d+$/.test(norm(a)) && where.includes(norm(a))) leaks.push(`${q.id}: ${a}`);
    }
    // Відповіді на текстові запитання, драбини, кросворди й малюнок не підказує жодне інше запитання (від 4 літер).
    const typed = everything.filter((q) => ['text', 'clues', 'drawing', 'wordladder', 'crossword'].includes(q.type));
    for (const q of typed)
      for (const a of answersOf(q))
        for (const other of everything)
          if (other !== q && norm(a).length >= 4 && !/^\d+$/.test(norm(a)) && whereOf(other).includes(norm(a))) leaks.push(`${other.id} → ${q.id}: ${a}`);
    expect(leaks).toEqual([]);
  });

  it('has no duplicate question texts, here or in other seed quizzes', () => {
    const texts = everything.map((q) => key(q.text));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    // Текст малюнка стандартний («Малюнок N: вгадайте, що малює художник»), він збігається з іншими сідами навмисно.
    expect(everything.filter((q) => q.type !== 'drawing').map((q) => q.text).filter((text) => others.includes(text))).toEqual([]);
  });

  it('uses no famous fact or puzzle that another seed quiz already has', () => {
    // Ключові слова, за якими перевірено повтори вручну (див. коментарі в detective/*.ts): їх не має бути в інших сідах.
    const fresh = ['Мишоловк', 'Пінкертон', 'Честертон', 'Ґаджет', 'Ґалбрейт', 'Еллері', 'Рампо', 'Енола', 'Відок', 'Вучетич', 'Дартмур', 'Гадсон', 'Скотленд', 'Джозеф Белл', 'Несбе', 'Манкелль', 'Вімзі', 'Чандлер', 'Ненсі Дрю', 'Сін’їті', 'Східному експресі', 'сірі клітинки', '7744', 'ЕПЛБИ', 'Ненсі Спрінгер', 'інстаграм'];
    expect(fresh.filter((f) => others.includes(f))).toEqual([]);
  });
});
