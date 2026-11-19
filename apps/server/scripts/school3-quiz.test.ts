import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITS, allSpares, answerKey, crosswordIssue, generateSudoku, questionPrice, questionsOf, quizSchema, roundTrials, sudokuIssue, wordIn, type Question, type Quiz } from '@quiz/shared';
import { MIN_TIMER } from './mix-quiz';
import { school3Quiz } from './school3-quiz';

const quiz = school3Quiz();
const key = (text: string) => text.trim().toLocaleLowerCase('uk');
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
const everything = [...played(quiz), ...allSpares(quiz)];
const ofType = <T extends Question['type']>(type: T) => played(quiz).filter((q): q is Extract<Question, { type: T }> => q.type === type);
const duels = (quiz.duels?.categories ?? []).flatMap((c) => c.questions);

/** Як у mix2-quiz.test.ts і spy-quiz.test.ts: нічого, пов'язаного з росією. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'чикатил', 'дятлов', 'тунгус',
  'менделєєв', 'пажитнов', 'тетріс', 'чайковськ', 'павлов', 'каспаров', 'калінінград', 'мазеп', 'полтавськ', 'ельбрус',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris',
];

/** Тексти інших сідів: усі .ts у scripts і підтеках, крім цього сіда й тестів. */
const otherSources = (): string[] => {
  const dir = import.meta.dirname;
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.startsWith('school3') && !f.includes('.test.'))
    .map((f) => readFileSync(join(dir, f), 'utf8'));
};

describe('the big «Великий шкільний марафон ІІІ» quiz', () => {
  it('passes the quiz schema within the limits and is big', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(played(quiz).length).toBeGreaterThanOrEqual(100);
  });

  it('shows off the newest features: spy, think alike, no overshoot, more-or-less steps, video clips, think round and duel bets', () => {
    const rounds = new Set<string>(quiz.rounds.map((r) => r.type));
    for (const type of ['classic', 'board', 'puzzles', 'think', 'bets', 'auction', 'final']) expect(rounds).toContain(type);
    expect(ofType('spy').length).toBeGreaterThanOrEqual(4);
    expect(ofType('thinkalike').length).toBeGreaterThanOrEqual(4);
    expect(ofType('numeric').filter((q) => q.noOvershoot === true).length).toBeGreaterThanOrEqual(5);
    const moreless = ofType('moreless');
    expect(moreless.length).toBeGreaterThanOrEqual(2);
    for (const q of moreless) {
      expect(q.step, q.text).toBeGreaterThan(0);
      // Кожне наступне порівняння дорожче на крок.
      q.pairs.slice(1).forEach((p, i) => expect(p.points - q.pairs[i]!.points, q.text).toBe(q.step));
    }
    expect(ofType('videoclip').length).toBeGreaterThanOrEqual(4);
    expect(ofType('melody').length).toBeGreaterThanOrEqual(3);
    expect(ofType('think').length).toBeGreaterThanOrEqual(8);
    expect(quiz.duels?.betStake).toBeGreaterThan(0);
    // «Шпигун» не працює в командній грі.
    expect(quiz.settings.teams).toBeUndefined();
    // Без опитувань гравців і без «100 до 1».
    const types = new Set<string>(played(quiz).map((q) => q.type));
    for (const type of ['poll', 'wordcloud', 'survey']) expect(types).not.toContain(type);
  });

  it('gives every question, spare, vote, puzzle and duel at least 25 seconds', () => {
    expect(everything.filter((q) => q.timeLimit < MIN_TIMER).map((q) => q.id)).toEqual([]);
    for (const q of ofType('spy')) expect(q.voteTime, q.text).toBeGreaterThanOrEqual(MIN_TIMER);
    expect(quiz.duels?.timeLimit).toBeGreaterThanOrEqual(MIN_TIMER);
  });

  it('uses only verified YouTube ids that no other seed uses, with room for the 16-second piece', () => {
    const others = otherSources().join('\n');
    const ids = [...ofType('videoclip').map((q) => q.clip.id), ...ofType('melody').map((q) => (q.track.source === 'youtube' ? q.track.id : ''))];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => others.includes(id))).toEqual([]);
    // Кожен ролик описано в коментарі (назва й канал з oEmbed) поруч зі стартом.
    const source = readFileSync(join(import.meta.dirname, 'school3', 'rounds.ts'), 'utf8');
    for (const id of ids) expect(source.match(new RegExp(`// ${id} — «`, 'g'))?.length, id).toBe(1);
  });

  it('has a sudoku and both crossword modes built by the shared editor helpers', () => {
    const round = quiz.rounds.find((r) => r.type === 'puzzles');
    const puzzles = round?.type === 'puzzles' ? round.questions : [];
    const sudokus = puzzles.filter((q): q is Extract<Question, { type: 'sudoku' }> => q.type === 'sudoku');
    const crosswords = puzzles.filter((q): q is Extract<Question, { type: 'crossword' }> => q.type === 'crossword');
    expect(sudokus).toHaveLength(1);
    for (const q of sudokus) {
      if (q.level !== 'custom') expect({ givens: q.givens, solution: q.solution }).toEqual(generateSudoku(q.seed ?? 0, q.level));
      expect(sudokuIssue(q.givens, q.solution)).toBeNull();
    }
    expect(new Set(crosswords.map((q) => q.mode))).toEqual(new Set(['key', 'full']));
    for (const q of crosswords) {
      expect(crosswordIssue(q)).toBeNull();
      for (const e of q.entries) expect(key(e.clue)).not.toContain(key(e.answer));
    }
    // Слова кросвордів не трапляються в інших сідах.
    const others = otherSources().join('\n').toLocaleLowerCase('uk');
    const words = crosswords.flatMap((q) => q.entries.map((e) => e.answer));
    expect(words.filter((w) => others.includes(key(w)))).toEqual([]);
  });

  it('has a fair mix of true and false in yes/no questions', () => {
    const bools = everything.filter((q): q is Extract<Question, { type: 'boolean' }> => q.type === 'boolean');
    expect(bools.length).toBeGreaterThanOrEqual(6);
    const trueCount = bools.filter((q) => q.correct).length;
    expect(trueCount).toBeGreaterThanOrEqual(Math.ceil(bools.length * 0.35));
    expect(trueCount).toBeLessThanOrEqual(Math.floor(bools.length * 0.65));
  });

  it('marks the board with random ×2/×3 and prices that grow from 100 to 500', () => {
    for (const r of quiz.rounds) {
      if (r.type !== 'board') continue;
      const marked = r.categories.map((c) => c.cells.findIndex((x) => x.mark !== 'none'));
      expect(new Set(marked).size).toBeGreaterThan(2);
      expect(new Set(r.categories.flatMap((c) => c.cells.filter((x) => x.mark !== 'none').map((x) => x.mark))).size).toBe(2);
      expect(r.categories.some((c) => c.cells.some((x) => x.kind === 'blitz'))).toBe(true);
      for (const c of r.categories) {
        expect(c.cells.filter((x) => x.mark !== 'none')).toHaveLength(1);
        expect(c.cells.map((x) => questionPrice(x.question))).toEqual([100, 200, 300, 400, 500]);
      }
    }
  });

  it('keeps classic prices by difficulty: 500, 1000 or 1500', () => {
    for (const round of quiz.rounds) {
      if (round.type !== 'classic' || round.id === 's3-spy') continue;
      for (const q of round.questions) expect([500, 1000, 1500], `${round.id}: ${q.text}`).toContain(questionPrice(q));
    }
  });

  it('leaks no answer into its question, and no spy word into any text of the quiz', () => {
    const norm = (s: string) => s.toLocaleLowerCase('uk').replace(/[«»"’'ʼ.,!?]/g, '');
    const leaks: string[] = [];
    // «Яке слово зайве»: правильний варіант неминуче названо в умові.
    const named = ['Яке слово зайве'];
    for (const q of everything) {
      if (named.some((p) => q.text.startsWith(p))) continue;
      const where = norm(`${q.text} ${q.hint ?? ''} ${q.type === 'clues' ? q.clues.join(' ') : ''}`);
      const answers =
        q.type === 'single'
          ? [q.options.find((o) => o.id === q.correctId)?.text ?? '']
          : q.type === 'text' || q.type === 'clues' || q.type === 'melody' || q.type === 'videoclip'
            ? q.accepted
            : [];
      for (const a of answers) if (norm(a).length >= 3 && !/^\d+$/.test(norm(a)) && where.includes(norm(a))) leaks.push(`${q.id}: ${a}`);
      if (q.type === 'moreless')
        for (const p of q.pairs) for (const v of [p.a.value, p.b.value]) if (norm(`${q.text} ${p.prompt} ${p.a.text} ${p.b.text}`).includes(norm(v))) leaks.push(`${q.id} ${p.id}: ${v}`);
    }
    for (const d of duels) for (const a of d.accepted) if (norm(d.text).includes(norm(a))) leaks.push(`duel ${d.text}: ${a}`);
    expect(leaks).toEqual([]);
    // Слова «Шпигуна» не звучать ні в назві, ні в описах, ні в жодному тексті запитань, варіантів чи дуелей.
    const texts = answerKey(
      JSON.stringify({
        title: quiz.title,
        description: quiz.description,
        rounds: quiz.rounds.map((r) => [r.title, r.description]),
        questions: everything.map((q) => [q.text, q.type === 'single' || q.type === 'multi' ? q.options.map((o) => o.text) : []]),
        duels: duels.map((d) => d.text),
      }),
    );
    for (const q of ofType('spy')) {
      const word = q.accepted[0]!;
      expect(texts.includes(answerKey(word)), word).toBe(false);
      expect(q.spyWord, word).toBeUndefined();
      if (q.spyHint !== undefined) {
        for (const w of q.accepted) expect(wordIn(q.spyHint, w), `${q.spyHint} / ${w}`).toBe(false);
        expect(answerKey(q.spyHint).includes(answerKey(word).slice(0, 5)), `${q.spyHint} / ${word}`).toBe(false);
      }
    }
    expect(ofType('spy').some((q) => q.spyHint === undefined)).toBe(true);
  });

  it('has no duplicate question texts or spy pairs, here or in other seed quizzes', () => {
    const texts = [...everything.map((q) => key(q.text)), ...duels.map((d) => key(d.text))];
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    const sources = otherSources();
    const others = sources.join('\n').toLocaleLowerCase('uk');
    expect(texts.filter((text) => others.includes(text))).toEqual([]);
    // Підказки «Шпигуна» не повторюють жодного іншого сіда.
    const hints = ofType('spy').flatMap((q) => (q.spyHint === undefined ? [] : [q.spyHint.toLocaleLowerCase('uk')]));
    expect(hints.filter((hint) => others.includes(hint))).toEqual([]);
  });

  it('contains nothing related to russia or the Soviet period', () => {
    const text = JSON.stringify(quiz);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
