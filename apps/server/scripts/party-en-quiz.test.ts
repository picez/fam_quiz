import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crosswordIssue, questionPrice, questionsOf, quizSchema, roundTrials, sudokuIssue, type Question, type Quiz } from '@quiz/shared';
import { partyEnQuiz } from './party-en-quiz';
import { MIN_TIMER } from './mix-quiz';

const quiz = partyEnQuiz();
/** Ключ тексту: малими, апострофи ’ ʼ ‘ ` — як «'», пробіли стиснуто. */
const key = (text: string) => text.trim().toLocaleLowerCase('en').replace(/[’ʼ‘`]/g, "'").replace(/\s+/g, ' ');
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
const everything = played(quiz);
const withSpares = [...everything, ...(quiz.spares ?? [])];
const ofType = <T extends Question['type']>(type: T) => everything.filter((q): q is Extract<Question, { type: T }> => q.type === type);

/** Нічого, пов'язаного з росією (англійською й українською). */
const BANNED = ['russia', 'russian', 'moscow', 'soviet', 'ussr', 'kremlin', 'putin', 'lenin', 'stalin', 'siberia', 'tetris', 'chernobyl', 'tolstoy', 'росі', 'москв', 'радянськ'];

const dir = import.meta.dirname;
/** Тексти інших сідів: усі .ts у scripts і підтеках, крім цього сіда й тестів. */
const otherSources = (): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.startsWith('party-en') && !f.includes('.test.') && f !== 'question-db.ts' && f !== 'seed-demo.ts')
    .map((f) => readFileSync(join(dir, f), 'utf8'));

describe('the «Party Night» English party quiz', () => {
  it('passes the quiz schema and is medium-sized', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBe(8);
    expect(everything.length).toBeGreaterThanOrEqual(60);
    expect(everything.length).toBeLessThanOrEqual(80);
  });

  it('uses many question types but no polls, surveys, opinion games or Ukrainian-dictionary word games', () => {
    const types = new Set<string>(everything.map((q) => q.type));
    expect(types.size).toBeGreaterThanOrEqual(14);
    for (const t of ['poll', 'wordcloud', 'survey', 'thinkalike', 'think', 'spy', 'wordladder', 'letterwords', 'wordle']) expect(types, t).not.toContain(t);
    expect(quiz.rounds.map((r) => r.type)).not.toContain('truth');
  });

  it('is written in English: no Cyrillic in anything players see', () => {
    expect(JSON.stringify(quiz)).not.toMatch(/\p{Script=Cyrillic}/u);
  });

  it('gives every question at least 25 seconds', () => {
    expect(withSpares.filter((q) => q.timeLimit < MIN_TIMER).map((q) => q.id)).toEqual([]);
  });

  it('prices the board 100…500 by difficulty and puts ×2/×3 and blitz cells on no fixed price', () => {
    const board = quiz.rounds.find((r) => r.type === 'board');
    if (board?.type !== 'board') throw new Error('no board');
    const marked = new Set<number>();
    for (const c of board.categories) {
      const prices = c.cells.map((cell) => questionPrice(cell.question));
      expect(prices, c.title).toEqual([100, 200, 300, 400, 500]);
      c.cells.forEach((cell, i) => cell.mark !== 'none' && marked.add(i));
    }
    expect(marked.size).toBeGreaterThan(1);
  });

  it('raises the prices through the warm-up, the briefing and «All-or-Nothing»', () => {
    for (const id of ['pe-warmup', 'pe-briefing', 'pe-wipeout']) {
      const round = quiz.rounds.find((r) => r.id === id);
      const points = round && 'questions' in round ? round.questions.map(questionPrice) : [];
      expect(points.filter((p, i) => i > 0 && p < points[i - 1]!), id).toEqual([]);
    }
  });

  it('has no media at all', () => {
    expect(withSpares.filter((q) => q.imageUrl !== null || q.video !== null || q.audio !== undefined).map((q) => q.id)).toEqual([]);
  });

  it('builds a valid sudoku and an English key crossword', () => {
    for (const q of ofType('sudoku')) expect(sudokuIssue(q.givens, q.solution)).toBeNull();
    const crosswords = ofType('crossword');
    expect(crosswords.length).toBe(1);
    for (const q of crosswords) {
      expect(crosswordIssue(q)).toBeNull();
      for (const e of q.entries) expect(key(e.clue)).not.toContain(key(e.answer));
    }
  });

  it('has a fair mix of true and false in yes/no questions', () => {
    const bools = withSpares.filter((q): q is Extract<Question, { type: 'boolean' }> => q.type === 'boolean');
    expect(bools.length).toBeGreaterThanOrEqual(12);
    const trueCount = bools.filter((q) => q.correct).length;
    expect(trueCount).toBeGreaterThanOrEqual(Math.ceil(bools.length * 0.4));
    expect(trueCount).toBeLessThanOrEqual(Math.floor(bools.length * 0.6));
  });

  it('leaks no answer into its own question or hint', () => {
    const norm = (s: string) => key(s).replace(/[«»"'.,!?:;()—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    const leaks: string[] = [];
    for (const q of withSpares) {
      const where = ` ${norm(`${q.text} ${q.hint ?? ''}`)} `;
      const answers =
        q.type === 'single' ? [q.options.find((o) => o.id === q.correctId)?.text ?? ''] : q.type === 'text' || q.type === 'clues' ? q.accepted : [];
      for (const a of answers) if (norm(a).length >= 3 && !/^\d+$/.test(norm(a)) && where.includes(` ${norm(a)} `)) leaks.push(`${q.id}: ${a}`);
    }
    expect(leaks).toEqual([]);
  });

  it('has no duplicate question texts, here or in other seed quizzes', () => {
    const texts = withSpares.map((q) => key(q.text));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    const others = key(otherSources().join('\n'));
    expect(texts.filter((text) => others.includes(text))).toEqual([]);
  });

  it('keeps the quiz description short and every round described', () => {
    expect(quiz.description.length).toBeLessThanOrEqual(200);
    for (const r of quiz.rounds) expect((r.description ?? '').length, r.title).toBeGreaterThan(80);
  });

  it('contains nothing related to russia or the Soviet period', () => {
    const text = JSON.stringify(quiz);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
