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
import { FEST_FILES, FEST_IMAGES, festQuiz } from './fest-quiz';

const MIN_TIMER = 25;
const photoUrl = (k: string) => `/uploads/${k.toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(16, '0').slice(0, 64)}.jpg`;
const keys: string[] = [...FEST_FILES, ...Object.keys(FEST_IMAGES)];
const used = new Set<string>();
const quiz = festQuiz((k) => {
  if (!keys.includes(k)) throw new Error(`Unknown picture ${k}`);
  used.add(k);
  return photoUrl(k);
});

const key = (text: string) => text.trim().toLocaleLowerCase('uk');
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
const everything = [...played(quiz), ...allSpares(quiz)];
const ofType = <T extends Question['type']>(type: T) => played(quiz).filter((q): q is Extract<Question, { type: T }> => q.type === type);
const duels = (quiz.duels?.categories ?? []).flatMap((c) => c.questions);

/** Тексти інших сідів (усі .ts у scripts і підтеках, крім fest і тестів). */
const dir = import.meta.dirname;
const others = readdirSync(dir, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.ts') && !f.startsWith('fest') && !f.includes('.test.'))
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');

const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград', 'ломоносов',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris', 'mendeleev',
];
/** Слова, що випадково містять заборонений шматок, — лише ці й нічого іншого. */
const WHITELIST = /натуральн|відокремл|росінант|попросіть/g;

describe('the «Великий святковий фестиваль» quiz', () => {
  it('passes the quiz schema within the limits and is huge', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(played(quiz).length).toBeGreaterThanOrEqual(150);
    expect(played(quiz).length).toBeLessThanOrEqual(Math.min(190, LIMITS.maxQuizQuestions));
  });

  it('uses every picture key it declares', () => {
    expect(keys.filter((k) => !used.has(k))).toEqual([]);
  });

  it('represents all eight themes and the logic thread well', () => {
    const count = (theme: string) => played(quiz).filter((q) => q.id.startsWith(`${theme}-`)).length;
    for (const theme of ['world', 'money', 'records', 'people', 'myths', 'cinema', 'school', 'ukr']) expect(count(theme), theme).toBeGreaterThanOrEqual(15);
    expect(count('logic') + played(quiz).filter((q) => q.type === 'sudoku').length).toBeGreaterThanOrEqual(18);
  });

  it('covers the rounds and every question type, and no polls, word clouds or surveys', () => {
    const rounds = quiz.rounds.map((r) => r.type);
    for (const type of ['classic', 'quest', 'board', 'blitz', 'ladder', 'puzzles', 'bets', 'auction', 'final']) expect(rounds).toContain(type);
    expect(rounds.filter((t) => t === 'classic').length).toBeGreaterThanOrEqual(2);
    const types = new Set<string>(played(quiz).map((q) => q.type));
    const wanted = ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'wordladder', 'sort', 'slider', 'clues', 'pin', 'wall'];
    wanted.push('timedlist', 'letterwords', 'moreless', 'drawing', 'sudoku', 'crossword', 'jigsaw', 'spotdiff', 'memory', 'melody', 'bluff');
    expect(wanted.filter((t) => !types.has(t))).toEqual([]);
    for (const type of ['poll', 'wordcloud', 'survey']) expect(types).not.toContain(type);
  });

  it('has a big puzzles round: two sudoku, both crossword modes, two jigsaws, two memories and a spot-the-difference', () => {
    const round = quiz.rounds.find((r) => r.type === 'puzzles');
    const puzzles = round?.type === 'puzzles' ? round.questions.map((q) => q.type) : [];
    expect(puzzles.filter((t) => t === 'sudoku')).toHaveLength(2);
    expect(puzzles.filter((t) => t === 'crossword')).toHaveLength(2);
    expect(puzzles.filter((t) => t === 'jigsaw')).toHaveLength(2);
    expect(puzzles.filter((t) => t === 'memory')).toHaveLength(2);
    expect(puzzles).toContain('spotdiff');
  });

  it('is full of pictures and music: in questions, in options, on memory cards, revealing, melodies and audio', () => {
    expect(played(quiz).filter((q) => q.imageUrl !== null).length).toBeGreaterThanOrEqual(15);
    expect(played(quiz).filter((q) => (q.type === 'single' || q.type === 'multi') && q.options.some((o) => o.imageUrl)).length).toBeGreaterThanOrEqual(8);
    expect(ofType('memory').some((q) => q.pairs.some((p) => p.a.imageUrl || p.b.imageUrl))).toBe(true);
    expect(played(quiz).filter((q) => q.reveal !== undefined).length).toBeGreaterThanOrEqual(3);
    expect(ofType('melody').length).toBeGreaterThanOrEqual(3);
    expect(played(quiz).filter((q) => q.audio !== undefined && q.type !== 'melody').length).toBeGreaterThanOrEqual(1);
    for (const q of ofType('melody')) if (q.track.source === 'youtube') expect(q.track.id).toMatch(/^[\w-]{11}$/);
    for (const q of played(quiz)) if (q.audio?.source === 'youtube') expect(q.audio.id).toMatch(/^[\w-]{11}$/);
  });

  it('mentions nothing related to russia or the Soviet period', () => {
    const all = JSON.stringify(quiz).toLocaleLowerCase('uk').replace(WHITELIST, '');
    expect(BANNED.filter((b) => all.includes(b))).toEqual([]);
  });

  it('gives every question, spare, blitz window, bluff choice and duel at least 25 seconds', () => {
    expect(everything.filter((q) => q.timeLimit < MIN_TIMER).map((q) => `${q.id} ${q.timeLimit}`)).toEqual([]);
    for (const q of everything) if (q.type === 'bluff') expect(q.choiceTime).toBeGreaterThanOrEqual(MIN_TIMER);
    for (const r of quiz.rounds) if (r.type === 'blitz') expect(r.answerWindow ?? MIN_TIMER).toBeGreaterThanOrEqual(MIN_TIMER);
    expect(quiz.duels?.timeLimit).toBeGreaterThanOrEqual(MIN_TIMER);
  });

  it('has valid puzzles: generated sudoku, crosswords with fresh words, a sane spot-the-difference', () => {
    for (const q of ofType('sudoku')) {
      expect(sudokuIssue(q.givens, q.solution)).toBeNull();
      if (q.level !== 'custom') expect({ givens: q.givens, solution: q.solution }).toEqual(generateSudoku(q.seed ?? 0, q.level));
    }
    expect(new Set(ofType('sudoku').map((q) => q.seed)).size).toBe(2);
    const crosswords = ofType('crossword');
    expect(new Set(crosswords.map((q) => q.mode))).toEqual(new Set(['key', 'full']));
    const low = others.toLocaleLowerCase('uk');
    for (const q of crosswords) {
      expect(crosswordIssue(q)).toBeNull();
      for (const e of q.entries) {
        expect(key(e.clue)).not.toContain(key(e.answer));
        expect(low.includes(key(e.answer)), e.answer).toBe(false);
      }
    }
    for (const q of ofType('spotdiff')) {
      expect(q.spots.length).toBeGreaterThanOrEqual(6);
      for (const s of q.spots) for (const v of [s.x, s.y]) expect(v > 0 && v < 1).toBe(true);
    }
  });

  it('builds every word ladder from dictionary nouns along a shortest path', () => {
    const nouns = loadNouns();
    for (const l of ofType('wordladder')) {
      expect(ladderPathIssue(l.path, l.maxSteps)).toBeNull();
      const path = l.path.map((w) => ladderKey(w));
      expect(path.filter((k) => k === null || !nouns.isNoun(k))).toEqual([]);
      // Найкоротший шлях пошуком у ширину по словнику тієї самої довжини.
      const [start, goal] = [path[0] as string, path[path.length - 1] as string];
      const words = new Set([...nouns.keys()].filter((w) => w.length === start.length));
      const letters = new Set([...words].join(''));
      const dist = new Map([[start, 0]]);
      const queue = [start];
      while (queue.length > 0 && !dist.has(goal)) {
        const w = queue.shift() as string;
        for (let i = 0; i < w.length; i++)
          for (const ch of letters) {
            const next = w.slice(0, i) + ch + w.slice(i + 1);
            if (words.has(next) && !dist.has(next)) {
              dist.set(next, (dist.get(w) ?? 0) + 1);
              queue.push(next);
            }
          }
      }
      expect(dist.get(goal), l.path.join('→')).toBe(l.path.length - 1);
    }
  });

  it('gives every letter set enough dictionary words', () => {
    const nouns = [...loadNouns().keys()];
    for (const q of ofType('letterwords')) {
      const set = q.set.kind === 'fixed' ? letterSet(q.set.letters) : null;
      if (set === null) continue;
      const fit = nouns.filter((w) => fitsLetters(w, set));
      if (q.goal === 'most') expect(fit.length).toBeGreaterThanOrEqual(30);
      else expect(fit.some((w) => w.replaceAll('\'', '').length >= 7)).toBe(true);
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
      expect(row).not.toMatch(/TTTT|FFFF/);
    }
  });

  it('marks the board with one random ×2/×3 per category and prices 100…500', () => {
    for (const r of quiz.rounds) {
      if (r.type !== 'board') continue;
      expect(r.categories).toHaveLength(8);
      expect(new Set(r.categories.map((c) => c.cells.findIndex((x) => x.mark !== 'none'))).size).toBeGreaterThan(1);
      expect(r.categories.some((c) => c.cells.some((x) => x.kind === 'blitz'))).toBe(true);
      for (const c of r.categories) {
        expect(c.cells.filter((x) => x.mark !== 'none')).toHaveLength(1);
        expect(c.cells.map((x) => questionPrice(x.question))).toEqual([100, 200, 300, 400, 500]);
      }
    }
  });

  it('has a twelve-step «Мільйонер» of four-option single choices', () => {
    const round = quiz.rounds.find((r) => r.type === 'ladder');
    const qs = round?.type === 'ladder' ? round.questions : [];
    expect(qs).toHaveLength(12);
    for (const q of qs) expect(q.type === 'single' && q.options.length === 4).toBe(true);
  });

  it('keeps drawings neutral, spares simple and duels complete', () => {
    for (const q of ofType('drawing')) expect(q.text).toMatch(/^Малюнок \d+: вгадайте, що малює художник$/);
    for (const q of quiz.spares ?? []) {
      expect(['single', 'boolean', 'text', 'numeric']).toContain(q.type);
      expect(q.imageUrl === null && q.video === null && q.audio === undefined).toBe(true);
    }
    expect(quiz.spares?.length).toBeGreaterThanOrEqual(9);
    expect(quiz.duels?.categories).toHaveLength(3);
    for (const c of quiz.duels?.categories ?? []) expect(c.questions).toHaveLength(6);
  });

  it('leaks no answer into its own question or into another question', () => {
    const norm = (s: string) => s.toLocaleLowerCase('uk').replace(/[«»"’'ʼ.,!?]/g, '');
    const answersOf = (q: Question): string[] =>
      q.type === 'single'
        ? [q.options.find((o) => o.id === q.correctId)?.text ?? '']
        : q.type === 'text' || q.type === 'clues' || q.type === 'drawing' || q.type === 'melody' || q.type === 'bluff'
          ? q.accepted
          : q.type === 'timedlist'
            ? q.items.flatMap((i) => [i.text, ...i.accepted])
            : q.type === 'wordladder'
              ? q.path.slice(1, -1)
              : [];
    const whereOf = (q: Question) => norm(`${q.text} ${q.hint ?? ''} ${q.type === 'clues' ? q.clues.join(' ') : ''}`);
    const leaks: string[] = [];
    for (const q of everything) {
      const where = whereOf(q);
      for (const a of answersOf(q)) if (norm(a).length >= 3 && !/^\d+$/.test(norm(a)) && where.includes(norm(a))) leaks.push(`${q.id}: ${a}`);
    }
    // Відповіді на текстові запитання, мелодії й малюнки не підказує жодне інше запитання (довгі відповіді — від 6 літер).
    const typed = everything.filter((q) => q.type === 'text' || q.type === 'clues' || q.type === 'drawing' || q.type === 'melody');
    for (const q of typed)
      for (const a of answersOf(q))
        for (const other of everything)
          if (other !== q && norm(a).length >= 6 && !/^\d+$/.test(norm(a)) && whereOf(other).includes(norm(a))) leaks.push(`${other.id} → ${q.id}: ${a}`);
    for (const d of duels) for (const a of d.accepted) if (norm(a).length >= 3 && norm(d.text).includes(norm(a))) leaks.push(`duel ${d.text}: ${a}`);
    expect(leaks).toEqual([]);
  });

  it('has no duplicate question texts, here or in other seed quizzes', () => {
    const texts = [...everything.map((q) => key(q.text)), ...duels.map((d) => key(d.text))];
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    expect([...everything.map((q) => q.text), ...duels.map((d) => d.text)].filter((text) => others.includes(text))).toEqual([]);
  });
});
