import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHALLENGE_SKIP_BUFFS, CHALLENGE_SKIP_ROUNDS, CHALLENGE_SKIP_TYPES, LIMITS, questionPrice, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import { KNEE_EXPLANATIONS } from './knee/explanations';
import { kneeQuiz } from './knee-quiz';
import { KNEE_IMAGES, KNEE_KEYS, aspectOf, imageSvg, pinOf, type KneeImage } from './knee/images';
import { MIN_TIMER } from './mix-quiz';

/** Platzhalter für den Upload: jeder Schlüssel eine eigene /uploads/…-Adresse, wie nach uploadImages. */
const url = (key: string) => `/uploads/kn${key.toLowerCase().replace(/[^a-z0-9]/g, '')}0000000000000000.png`;
const used = new Set<string>();
const quiz: Quiz = kneeQuiz((key) => {
  used.add(key);
  return url(key);
});
const key = (text: string) => text.trim().toLocaleLowerCase('de').replace(/[’ʼ‘`]/g, "'").replace(/\s+/g, ' ');
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
const everything = played(quiz);
const board = quiz.rounds.find((r) => r.type === 'board');
const spares = board?.type === 'board' ? board.categories.flatMap((c) => c.spares ?? []) : [];
const withSpares = [...everything, ...spares];
const ofType = <T extends Question['type']>(type: T) => withSpares.filter((q): q is Extract<Question, { type: T }> => q.type === type);

const BANNED = ['росі', 'русск', 'москв', 'russia', 'russland', 'moscow', 'moskau', 'soviet', 'sowjet', 'ussr', 'udssr', 'kremlin', 'kreml', 'putin'];

const dir = import.meta.dirname;
const otherSources = (): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.startsWith('knee') && !f.includes('.test.') && f !== 'question-db.ts' && f !== 'seed-demo.ts')
    .map((f) => readFileSync(join(dir, f), 'utf8'));

describe('the «Knie & Unterschenkel» anatomy quiz', () => {
  it('passes the quiz schema and has the planned size and rounds', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.map((r) => r.type)).toEqual(['classic', 'classic', 'board', 'classic', 'wipeout', 'puzzles', 'classic', 'final']);
    expect(everything.length).toBeGreaterThanOrEqual(75);
    expect(everything.length).toBeLessThanOrEqual(LIMITS.maxQuizQuestions);
  });

  it('uses many question types and no polls, clouds, surveys or opinion games', () => {
    const types = new Set<string>(everything.map((q) => q.type));
    expect(types.size).toBeGreaterThanOrEqual(13);
    for (const t of ['poll', 'wordcloud', 'survey', 'thinkalike', 'think', 'spy', 'bluff']) expect(types, t).not.toContain(t);
  });

  it('gives every question at least 25 seconds', () => {
    expect(withSpares.filter((q) => q.timeLimit < MIN_TIMER).map((q) => q.id)).toEqual([]);
  });

  it('is made for one person: no rounds, question types, settings or buffs that need other players', () => {
    const solo = new Set<string>([...CHALLENGE_SKIP_ROUNDS, 'blitz']);
    expect(quiz.rounds.filter((r) => solo.has(r.type)).map((r) => r.type)).toEqual([]);
    expect(withSpares.filter((q) => (CHALLENGE_SKIP_TYPES as readonly string[]).includes(q.type)).map((q) => q.id)).toEqual([]);
    expect(quiz.settings.debuffs ?? []).toEqual([]);
    expect(quiz.settings.debuffShop ?? false).toBe(false);
    expect(quiz.settings.teams ?? false).toBeFalsy();
    for (const b of CHALLENGE_SKIP_BUFFS) expect(quiz.settings.buffs ?? []).not.toContain(b);
  });

  it('explains every question, each explanation used exactly once and within the limit', () => {
    expect(withSpares.filter((q) => (q.explanation ?? '').length < 40).map((q) => q.id)).toEqual([]);
    expect(withSpares.filter((q) => (q.explanation ?? '').length > LIMITS.explanationText).map((q) => q.id)).toEqual([]);
    const used = withSpares.map((q) => q.explanation);
    expect(KNEE_EXPLANATIONS.filter(([, text]) => used.filter((u) => u === text).length !== 1).map(([key]) => key)).toEqual([]);
  });

  it('prices the board 100…500 by difficulty with ×2/×3 marks on varying prices', () => {
    if (board?.type !== 'board') throw new Error('no board');
    const marked = new Set<number>();
    for (const c of board.categories) {
      expect(c.cells.map((cell) => questionPrice(cell.question)), c.title).toEqual([100, 200, 300, 400, 500]);
      c.cells.forEach((cell, i) => cell.mark !== 'none' && marked.add(i));
    }
    expect(marked.size).toBeGreaterThan(1);
  });

  it('raises the prices in the classic rounds and «Alles oder nichts»', () => {
    for (const r of quiz.rounds) {
      if (!['classic', 'wipeout'].includes(r.type) || !('questions' in r)) continue;
      const points = r.questions.map(questionPrice);
      expect(points.filter((p, i) => i > 0 && p < points[i - 1]!), r.title).toEqual([]);
    }
  });

  it('shows every slide picture once, uncovered labels only where the label is the question', () => {
    expect(KNEE_KEYS.filter((k) => !used.has(k))).toEqual([]);
    const shown = withSpares.flatMap((q) => [q.imageUrl, q.type === 'jigsaw' ? q.photo : null]).filter((p): p is string => typeof p === 'string');
    expect(shown.length).toBe(new Set(shown).size);
    expect(new Set(shown)).toEqual(new Set(KNEE_KEYS.map(url)));
    for (const k of KNEE_KEYS) {
      const image: KneeImage = KNEE_IMAGES[k];
      if (k !== 'patellaLigs' && k !== 'kneePuzzle') expect(image.masks.length, k).toBeGreaterThan(0);
      expect(imageSvg(image, Buffer.from('x'))).toContain('<svg');
    }
  });

  it('puts every pin on its own slide picture inside the picture', () => {
    const pins = ofType('pin');
    expect(pins.length).toBeGreaterThanOrEqual(10);
    for (const q of pins) {
      expect(q.map).toBeNull();
      const k = KNEE_KEYS.find((name) => url(name) === q.imageUrl)!;
      expect(q.aspect).toBeCloseTo(aspectOf(k), 5);
      expect(q.target).toEqual(pinOf(k));
      expect(q.target.x).toBeGreaterThan(0);
      expect(q.target.x).toBeLessThan(1);
      expect(q.target.y).toBeGreaterThan(0);
      expect(q.target.y).toBeLessThan(1);
    }
  });

  it('has a fair mix of «ja» and «nein» in yes/no questions', () => {
    const bools = ofType('boolean');
    expect(bools.length).toBeGreaterThanOrEqual(12);
    const yes = bools.filter((q) => q.correct).length;
    expect(yes).toBeGreaterThanOrEqual(Math.ceil(bools.length * 0.4));
    expect(yes).toBeLessThanOrEqual(Math.floor(bools.length * 0.6));
  });

  it('leaks no answer into its own question', () => {
    const norm = (s: string) => key(s).replace(/[«»"'.,!?:;()—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    const leaks: string[] = [];
    for (const q of withSpares) {
      const where = ` ${norm(`${q.text} ${q.hint ?? ''}`)} `;
      const answers =
        q.type === 'single' ? [q.options.find((o) => o.id === q.correctId)?.text ?? ''] : q.type === 'text' || q.type === 'clues' ? q.accepted : [];
      for (const a of answers) if (norm(a).length >= 3 && where.includes(` ${norm(a)} `)) leaks.push(`${q.id}: ${a}`);
    }
    expect(leaks).toEqual([]);
  });

  it('has no duplicate question texts, here or in other seed quizzes', () => {
    const texts = withSpares.map((q) => key(q.text));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    const others = key(otherSources().join('\n'));
    expect(texts.filter((text) => others.includes(text))).toEqual([]);
  });

  it('keeps the description short and every round described', () => {
    expect(quiz.description.length).toBeLessThanOrEqual(200);
    for (const r of quiz.rounds) expect((r.description ?? '').length, r.title).toBeGreaterThan(80);
  });

  it('contains nothing related to russia', () => {
    const text = JSON.stringify(quiz);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
