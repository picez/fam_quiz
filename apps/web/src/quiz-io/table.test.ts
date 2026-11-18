import { afterEach, describe, expect, it } from 'vitest';
import { LIMITS, quizSchema, type ClassicRound, type Question, type Quiz } from '@quiz/shared';
import { newClassicRound, newQuiz } from '../editor/draft';
import { activateLocaleForTests, t } from '../i18n';
import en from '../locales/en.json';
import { TABLE_WORDS, normalizeWord, type ColumnKey, type TableType } from './table-words';
import { problemText, quizToRows, rowsToQuiz, tableRepresentable, templateRows, type TableProblem } from './table';

const HEAD = ['Раунд', 'Тип', 'Запитання', 'Правильна відповідь', 'Варіант 1', 'Варіант 2', 'Варіант 3', 'Варіант 4', 'Варіант 5', 'Варіант 6', 'Бали', 'Таймер (с)', 'Підказка'];

const common = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
const single = (id: string, text: string, texts: string[], correct: number, extra: Record<string, unknown> = {}): Question =>
  ({ ...common, id, text, type: 'single', options: texts.map((o, i) => ({ id: `${id}${i}`, text: o })), correctId: `${id}${correct}`, ...extra }) as Question;
const bool = (id: string, extra: Record<string, unknown> = {}): Question => ({ ...common, id, text: `B${id}`, type: 'boolean', correct: false, ...extra }) as Question;
const text = (id: string, accepted: string[]): Question => ({ ...common, id, text: `T${id}`, type: 'text', accepted }) as Question;
const num = (id: string, extra: Record<string, unknown> = {}): Question => ({ ...common, id, text: `N${id}`, type: 'numeric', correct: 8, tolerance: 0, ...extra }) as Question;

function quizOf(questions: Question[], title = 'Природа'): Quiz {
  const round: ClassicRound = { ...newClassicRound(), title, questions };
  return { ...newQuiz(), title: 'Q', rounds: [round] };
}

/** Рядок аркуша: заголовок + дані, усе рядками (як з файлу). */
const asStrings = (rows: (string | number | null)[][]): string[][] => rows.map((row) => row.map((cell) => (cell === null ? '' : String(cell))));

/** Рядок даних за шаблоном заголовків HEAD: round, type, question, answer, options 1..6, points, timer, hint. */
function row(parts: { round?: string; type?: string; question?: string; answer?: string; options?: string[]; points?: string; timer?: string; hint?: string }): string[] {
  const options = [...(parts.options ?? []), '', '', '', '', '', ''].slice(0, 6);
  return [parts.round ?? 'Р', parts.type ?? 'текст', parts.question ?? 'Питання', parts.answer ?? 'відповідь', ...options, parts.points ?? '', parts.timer ?? '', parts.hint ?? ''];
}

afterEach(() => activateLocaleForTests('uk'));

describe('quizToRows', () => {
  it('exports the four simple types of classic rounds', () => {
    const quiz = quizOf([
      single('a', 'Яка планета?', ['Меркурій', 'Венера', 'Марс'], 1, { hint: 'Друга' }),
      bool('b'),
      text('c', ['Тихий', 'Тихий океан']),
      num('d', { points: 500, timeLimit: 25 }),
    ]);
    const { rows, skipped } = quizToRows(quiz);
    expect(skipped).toBe(0);
    expect(rows[0]).toEqual(HEAD);
    expect(rows[1]).toEqual(['Природа', 'варіанти', 'Яка планета?', 'Венера', 'Меркурій', 'Венера', 'Марс', null, null, null, 1000, 30, 'Друга']);
    expect(rows[2]![1]).toBe('так-ні');
    expect(rows[2]![3]).toBe('ні');
    expect(rows[3]![1]).toBe('текст');
    expect(rows[3]![3]).toBe('Тихий; Тихий океан');
    expect(rows[4]![1]).toBe('число');
    expect(rows[4]![3]).toBe(8);
    expect(rows[4]![10]).toBe(500);
    expect(rows[4]![11]).toBe(25);
    expect(rows[2]![12]).toBe('');
  });

  it('skips what the table cannot carry', () => {
    const questions = [
      { ...common, id: 'm', text: 'M', type: 'multi', options: [{ id: '1', text: 'a' }, { id: '2', text: 'b' }], correctIds: ['1'] } as Question,
      { ...common, id: 'p', text: 'P', type: 'pin' } as unknown as Question,
      single('s1', 'S1', ['a', 'b'], 0, { imageUrl: '/uploads/aaaaaaaaaaaaaaaa.png' }),
      { ...single('s2', 'S2', ['a', 'b'], 0), options: [{ id: 'x', text: 'a', imageUrl: '/uploads/aaaaaaaaaaaaaaaa.png' }, { id: 'y', text: 'b' }], correctId: 'x' } as Question,
      num('n1', { tolerance: 1 }),
      num('n2', { noOvershoot: true }),
      text('t1', ['a;b']),
      bool('b1', { audio: { url: '/uploads/aaaaaaaaaaaaaaaa.mp3', start: 0 } }),
      bool('b2', { reveal: 'blur' }),
      bool('ok'),
    ];
    const blitz = { ...newClassicRound(), type: 'blitz', questions: [bool('z1'), bool('z2')] } as unknown as Quiz['rounds'][number];
    const quiz = { ...quizOf(questions), rounds: [{ ...newClassicRound(), title: 'Р', questions }, blitz] } as Quiz;
    const { rows, skipped } = quizToRows(quiz);
    expect(rows).toHaveLength(2);
    expect(rows[1]![2]).toBe('Bok');
    expect(skipped).toBe(11);
    expect(tableRepresentable(bool('x'))).toBe(true);
    expect(tableRepresentable(single('s', 'S', ['a', ''], 0))).toBe(false);
  });

  it('an untitled round gets its number', () => {
    const quiz = { ...quizOf([bool('a')]), rounds: [{ ...newClassicRound(), title: 'Перший', questions: [bool('a')] }, { ...newClassicRound(), title: '', questions: [bool('b')] }] } as Quiz;
    const { rows } = quizToRows(quiz);
    expect(rows[1]![0]).toBe('Перший');
    expect(rows[2]![0]).toBe('Раунд 2');
  });

it('keeps choice questions with options repeating in another case in the quiz file only', () => {    const repeated = single('a', 'Q', ['Кіт', 'кіт', 'Пес'], 1);    expect(tableRepresentable(repeated)).toBe(false);    const { rows, skipped } = quizToRows(quizOf([repeated, bool('b')]));    expect(rows).toHaveLength(2);    expect(skipped).toBe(1);  });

  it('headers follow the interface language', () => {
    activateLocaleForTests('en', { ui: en as Record<string, string> });
    const { rows } = quizToRows(quizOf([bool('a')], 'Nature'));
    expect(rows[0]![0]).toBe(TABLE_WORDS.en.columns.round[0]);
    expect(rows[1]![1]).toBe(TABLE_WORDS.en.types.boolean[0]);
    expect(rows[1]![3]).toBe(TABLE_WORDS.en.no[0]);
  });

  it('round trip of the four types', () => {
    const quiz = quizOf([
      single('a', 'Яка планета?', ['Меркурій', 'Венера', 'Марс'], 1, { hint: 'Друга', points: 700, timeLimit: 40 }),
      bool('b', { points: 300, timeLimit: 25 }),
      text('c', ['Тихий', 'Тихий океан']),
      num('d', { points: 500, timeLimit: 25 }),
    ]);
    const second = { ...newClassicRound(), title: 'Інше', questions: [bool('e', { correct: true } as Record<string, unknown>)] };
    const full = { ...quiz, rounds: [...quiz.rounds, second] } as Quiz;
    const result = rowsToQuiz(asStrings(quizToRows(full).rows), 'Природа');
    if (!result.ok || !('quiz' in result)) throw new Error('expected ok');
    const back = result.quiz;
    expect(back.rounds.map((r) => r.title)).toEqual(['Природа', 'Інше']);
    const [qa, qb, qc, qd] = (back.rounds[0] as ClassicRound).questions;
    expect(qa).toMatchObject({ type: 'single', text: 'Яка планета?', points: 700, timeLimit: 40, hint: 'Друга' });
    const sa = qa as Extract<Question, { type: 'single' }>;
    expect(sa.options.map((o) => o.text)).toEqual(['Меркурій', 'Венера', 'Марс']);
    expect(sa.options.find((o) => o.id === sa.correctId)?.text).toBe('Венера');
    expect(qb).toMatchObject({ type: 'boolean', correct: false, points: 300, timeLimit: 25 });
    expect(qc).toMatchObject({ type: 'text', accepted: ['Тихий', 'Тихий океан'] });
    expect(qd).toMatchObject({ type: 'numeric', correct: 8, tolerance: 0, points: 500, timeLimit: 25 });
    expect((back.rounds[1] as ClassicRound).questions[0]).toMatchObject({ type: 'boolean', correct: true });
    const ids = new Set([...back.rounds.map((r) => r.id), ...(back.rounds as ClassicRound[]).flatMap((r) => r.questions.map((q) => q.id))]);
    expect(ids.size).toBe(7);
    expect(ids.has('a')).toBe(false);
  });
});

describe('rowsToQuiz', () => {
  const ok = (result: ReturnType<typeof rowsToQuiz>): Quiz => {
    if (!('ok' in result) || !result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
    return result.quiz;
  };

  it('reads headers in any language, any order and case', () => {
    const w = TABLE_WORDS.en;
    const rows = [
      ['QUESTION', 'Extra', 'Type', 'CORRECT ANSWER'],
      ['What is 2+2?', 'x', w.types.numeric[0]!, '4'],
      ['Is the sun a star?', 'x', 'boolean', 'yes'],
    ];
    const quiz = ok(rowsToQuiz(rows, 'f'));
    expect((quiz.rounds[0] as ClassicRound).questions).toHaveLength(2);
    const polish = [['pytanie', 'TYP', 'poprawna odpowiedź'], ['Ile nóg?', 'liczba', '8'], ['Ile łap?', 'single', 'a']];
    expect(rowsToQuiz(polish, 'f')).toMatchObject({ ok: false, errors: [{ row: 3, code: 'few_options' }] });
    const named = [['Запитання', 'Тип', 'Відповідь', 'Таймер', 'Пояснення'], ['Q', 'текст', 'a', '40', 'Підказка']];
    const q = (ok(rowsToQuiz(named, 'f')).rounds[0] as ClassicRound).questions[0]!;
    expect(q).toMatchObject({ timeLimit: 40, hint: 'Підказка' });
  });

  it('missing required columns', () => {
    expect(rowsToQuiz([['Раунд', 'Тип', 'Запитання'], ['a', 'текст', 'b']], 'f')).toEqual({ ok: false, error: 'io_missing_columns' });
  });

  it('defaults for empty points and timer', () => {
    const rows = [HEAD, row({ answer: 'a' }), row({ answer: 'a', points: '1 500', timer: '45' })];
    const [a, b] = (ok(rowsToQuiz(rows, 'f')).rounds[0] as ClassicRound).questions;
    expect(a).toMatchObject({ points: 1000, timeLimit: 30 });
    expect(b).toMatchObject({ points: 1500, timeLimit: 45 });
  });

  it('choice answer by text or number', () => {
    const pick = (options: string[], answer: string) => {
      const result = rowsToQuiz([HEAD, row({ type: 'варіанти', answer, options })], 'f');
      if ('errors' in result) return result.errors.map((e) => e.code);
      const q = (ok(result).rounds[0] as ClassicRound).questions[0] as Extract<Question, { type: 'single' }>;
      return q.options.find((o) => o.id === q.correctId)?.text;
    };
    expect(pick(['Меркурій', 'Венера'], 'меркурій')).toBe('Меркурій');
    expect(pick(['Меркурій', 'Венера'], '2')).toBe('Венера');
    expect(pick(['1', '2', 'три'], '2')).toBe('2');
    expect(pick(['a', '', 'c', 'd'], '3')).toBe('c');
    expect(pick(['a', '', 'c', 'd'], '2')).toEqual(['answer_not_option']);
  });

  it('number with a comma', () => {
    const num1 = (answer: string) => {
      const result = rowsToQuiz([HEAD, row({ type: 'число', answer })], 'f');
      if ('errors' in result) return result.errors.map((e) => e.code);
      return ((ok(result).rounds[0] as ClassicRound).questions[0] as { correct: number }).correct;
    };
    expect(num1('3,5')).toBe(3.5);
    expect(num1('12 000')).toBe(12000);
    expect(num1('абв')).toEqual(['bad_number']);
  });

  it('yes and no in many forms', () => {
    const value = (answer: string) => {
      const result = rowsToQuiz([HEAD, row({ type: 'так-ні', answer })], 'f');
      if ('errors' in result) return result.errors.map((e) => e.code);
      return ((ok(result).rounds[0] as ClassicRound).questions[0] as { correct: boolean }).correct;
    };
    expect([value('Так'), value('ні'), value('TRUE'), value('no'), value('0'), value('1'), value('false')]).toEqual([true, false, true, false, false, true, false]);
    expect(value('може')).toEqual(['bad_boolean']);
  });

  it('row report with sheet row numbers', () => {
    const rows = [
      HEAD,
      ['', '', '', '', '', '', '', '', '', '', '', '', ''],
      row({ type: 'так-ні', answer: '' }),
      row({ type: 'варіанти', answer: 'a', options: ['a'], points: '5000' }),
    ];
    const result = rowsToQuiz(rows, 'f');
    expect(result).toEqual({ ok: false, errors: [{ row: 3, code: 'no_answer' }, { row: 4, code: 'few_options' }, { row: 4, code: 'bad_points' }] });
    expect(problemText({ row: 3, code: 'no_answer' })).toBe('Рядок 3: немає правильної відповіді');
  });

  it('one problem per rule', () => {
    const cases: [TableProblem, string[]][] = [
      ['no_question', row({ question: '' })],
      ['question_long', row({ question: 'я'.repeat(LIMITS.questionText + 1) })],
      ['unknown_type', row({ type: 'малюнок' })],
      ['no_answer', row({ answer: '' })],
      ['few_options', row({ type: 'варіанти', answer: 'a', options: ['a'] })],
      ['option_long', row({ type: 'варіанти', answer: 'a', options: ['a', 'я'.repeat(LIMITS.optionText + 1)] })],
      ['duplicate_options', row({ type: 'варіанти', answer: 'a', options: ['a', 'A'] })],
      ['answer_not_option', row({ type: 'варіанти', answer: 'z', options: ['a', 'b'] })],
      ['bad_boolean', row({ type: 'так-ні', answer: 'може' })],
      ['bad_number', row({ type: 'число', answer: 'abc' })],
      ['answer_long', row({ answer: 'я'.repeat(LIMITS.answerText + 1) })],
      ['too_many_answers', row({ answer: Array.from({ length: LIMITS.maxAccepted + 1 }, (_, i) => `v${i}`).join('; ') })],
      ['bad_points', row({ points: '2001' })],
      ['bad_timer', row({ timer: '4' })],
      ['hint_long', row({ hint: 'я'.repeat(LIMITS.hintText + 1) })],
      ['round_long', row({ round: 'я'.repeat(LIMITS.roundTitle + 1) })],
    ];
    for (const [code, data] of cases) {
      expect(rowsToQuiz([HEAD, data], 'f'), code).toEqual({ ok: false, errors: [{ row: 2, code }] });
    }
    expect(rowsToQuiz([HEAD, row({ points: '1,5' })], 'f')).toMatchObject({ errors: [{ code: 'bad_points' }] });
    expect(rowsToQuiz([HEAD, row({ timer: '121' })], 'f')).toMatchObject({ errors: [{ code: 'bad_timer' }] });
  });

  it('limits of rounds and questions', () => {
    const many = (rounds: number) => [HEAD, ...Array.from({ length: rounds }, (_, i) => row({ round: `R${i}` }))];
    expect(rowsToQuiz(many(11), 'f')).toEqual({ ok: false, errors: [{ row: 12, code: 'too_many_rounds' }] });
    expect(rowsToQuiz(many(10), 'f')).toMatchObject({ ok: true });
    const full = [HEAD, ...Array.from({ length: LIMITS.maxQuestions + 1 }, () => row({ round: 'Один' }))];
    expect(rowsToQuiz(full, 'f')).toEqual({ ok: false, errors: [{ row: 102, code: 'round_full' }] });
    const quizFull = [HEAD, ...Array.from({ length: LIMITS.maxQuizQuestions + 1 }, (_, i) => row({ round: i < 100 ? 'A' : i < 200 ? 'B' : 'C' }))];
    expect(rowsToQuiz(quizFull, 'f')).toEqual({ ok: false, errors: [{ row: 202, code: 'quiz_full' }] });
    const tooMany = [HEAD, ...Array.from({ length: 501 }, () => row({}))];
    expect(rowsToQuiz(tooMany, 'f')).toEqual({ ok: false, error: 'io_too_many_rows' });
    expect(rowsToQuiz([HEAD], 'f')).toEqual({ ok: false, error: 'io_empty' });
    expect(rowsToQuiz([HEAD, ['', '', '', '']], 'f')).toEqual({ ok: false, error: 'io_empty' });
  });

  it('rows with the same round go together in order', () => {
    const rows = [HEAD, row({ round: 'А', question: 'q1' }), row({ round: 'Б', question: 'q2' }), row({ round: ' А ', question: 'q3' })];
    const quiz = ok(rowsToQuiz(rows, 'f'));
    expect(quiz.rounds.map((r) => r.title)).toEqual(['А', 'Б']);
    expect((quiz.rounds[0] as ClassicRound).questions.map((q) => q.text)).toEqual(['q1', 'q3']);
    const blank = ok(rowsToQuiz([HEAD, row({ round: '', question: 'a' }), row({ round: '', question: 'b' })], 'f'));
    expect(blank.rounds).toHaveLength(1);
    expect(blank.rounds[0]!.title).toBe('');
  });

  it('title comes from the caller', () => {
    const rows = [HEAD, row({})];
    expect(ok(rowsToQuiz(rows, '')).title).toBe(t('ioImportedTitle'));
    expect(ok(rowsToQuiz(rows, '  Моя  ')).title).toBe('Моя');
    const long = ok(rowsToQuiz(rows, 'я'.repeat(200)));
    expect(long.title).toHaveLength(120);
    expect(quizSchema.safeParse(long).success).toBe(true);
  });
});

describe('template', () => {
  it('has four valid examples', () => {
    const rows = templateRows();
    expect(rows).toHaveLength(5);
    expect(rows.slice(1).map((r) => r[1])).toEqual(['варіанти', 'так-ні', 'текст', 'число']);
    expect(rows[2]![3]).toBe('ні');
    for (const data of rows.slice(1)) expect(Number(data[11])).toBeGreaterThanOrEqual(25);
    const result = rowsToQuiz(asStrings(rows), 'шаблон');
    if (!('ok' in result) || !result.ok) throw new Error(JSON.stringify(result));
    expect(result.quiz.rounds[0]!.title).toBe(t('ioSampleRound'));
    expect((result.quiz.rounds[0] as ClassicRound).questions).toHaveLength(4);
  });
});

describe('table words', () => {
  it('cover every locale without ambiguity', () => {
    const columns: ColumnKey[] = ['round', 'type', 'question', 'answer', 'option', 'points', 'timer', 'hint'];
    const types: TableType[] = ['single', 'boolean', 'text', 'numeric'];
    for (const [locale, words] of Object.entries(TABLE_WORDS)) {
      // Заголовки читаються лише в першому рядку, назви типів і так/ні — лише в клітинках: двозначність можлива в межах кожної групи.
      const headers: Record<string, string[]> = {};
      for (const key of columns) headers[`column:${key}`] = words.columns[key];
      const values: Record<string, string[]> = {};
      for (const key of types) values[`type:${key}`] = words.types[key];
      values.yes = words.yes;
      values.no = words.no;
      for (const groups of [headers, values]) {
        const seen = new Map<string, string>();
        for (const [group, list] of Object.entries(groups)) {
          expect(list.length, `${locale} ${group}`).toBeGreaterThan(0);
          for (const word of list) {
            const normal = normalizeWord(word);
            expect(normal, `${locale} ${group}`).not.toBe('');
            expect(seen.get(normal) ?? group, `${locale} ${word}`).toBe(group);
            seen.set(normal, group);
          }
        }
      }
    }
    expect(Object.keys(TABLE_WORDS).sort()).toEqual(['ar', 'de', 'en', 'es', 'it', 'pl', 'uk']);
  });

  it('normalizes case, spaces and a bracket tail', () => {
    expect(normalizeWord('  Таймер  (с) ')).toBe('таймер');
    expect(normalizeWord('ПРАВИЛЬНА   Відповідь')).toBe('правильна відповідь');
  });
});
