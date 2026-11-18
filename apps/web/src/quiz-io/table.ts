import { LIMITS, quizSchema, roundQuestions, type ClassicRound, type Question, type Quiz } from '@quiz/shared';
import { newClassicRound, newQuiz } from '../editor/draft';
import { newId } from '../editor/new-id';
import { t, type TextKey } from '../i18n';
import { currentLocale } from '../locales/current';
import { TABLE_WORDS, normalizeWord, type ColumnKey, type TableType } from './table-words';
import type { XlsxCell } from './xlsx';

export const TABLE_LIMITS = { maxRows: 500, maxXlsxBytes: 5 * 1024 * 1024, maxCsvBytes: 2 * 1024 * 1024 } as const;

export type TableProblem =
  | 'no_question'
  | 'question_long'
  | 'unknown_type'
  | 'no_answer'
  | 'few_options'
  | 'option_long'
  | 'duplicate_options'
  | 'answer_not_option'
  | 'bad_boolean'
  | 'bad_number'
  | 'answer_long'
  | 'too_many_answers'
  | 'bad_points'
  | 'bad_timer'
  | 'hint_long'
  | 'round_long'
  | 'round_full'
  | 'too_many_rounds'
  | 'quiz_full';

export interface RowError {
  row: number;
  code: TableProblem;
}

const COLUMN_ORDER: ColumnKey[] = ['round', 'type', 'question', 'answer'];
const MAX_OPTIONS = LIMITS.maxOptions;

/** Чи несе таблиця запитання без втрат: просте, без медіа, відхилення, допуску й крапки з комою. */
export function tableRepresentable(question: Question): boolean {
  if (question.imageUrl !== null || (question.video ?? null) !== null || question.audio !== undefined || question.reveal !== undefined) return false;
  switch (question.type) {
    case 'single':
      return question.options.every((option) => option.imageUrl === undefined && option.text.trim() !== '');
    case 'boolean':
      return true;
    case 'text':
      return question.accepted.every((spelling) => !spelling.includes(';'));
    case 'numeric':
      return question.tolerance === 0 && question.noOvershoot !== true;
    default:
      return false;
  }
}

const fold = (value: string): string => value.trim().toLocaleLowerCase();

/** Рядки аркуша: рядок 0 — заголовки мовою інтерфейсу; пропущено — запитань, яких таблиця не несе. */
export function quizToRows(quiz: Quiz): { rows: XlsxCell[][]; skipped: number } {
  const words = TABLE_WORDS[currentLocale()];
  const header: XlsxCell[] = [
    ...COLUMN_ORDER.map((key) => words.columns[key][0]!),
    ...Array.from({ length: MAX_OPTIONS }, (_, i) => `${words.columns.option[0]} ${i + 1}`),
    words.columns.points[0]!,
    words.columns.timer[0]!,
    words.columns.hint[0]!,
  ];
  const rows: XlsxCell[][] = [header];
  let total = 0;
  quiz.rounds.forEach((round, roundIndex) => {
    const all = roundQuestions(round);
    total += all.length;
    if (round.type !== 'classic') return;
    const title = round.title !== '' ? round.title : t('roundN', { index: roundIndex + 1 });
    for (const question of all) {
      if (!tableRepresentable(question)) continue;
      const cells: XlsxCell[] = [title, null, question.text, null, null, null, null, null, null, null, question.points, question.timeLimit, question.hint ?? ''];
      if (question.type === 'single') {
        cells[1] = words.types.single[0]!;
        question.options.forEach((option, i) => (cells[4 + i] = option.text));
        const index = question.options.findIndex((option) => option.id === question.correctId);
        const texts = question.options.map((option) => fold(option.text));
        const repeated = new Set(texts).size !== texts.length;
        cells[3] = repeated ? index + 1 : (question.options[index]?.text ?? '');
      } else if (question.type === 'boolean') {
        cells[1] = words.types.boolean[0]!;
        cells[3] = question.correct ? words.yes[0]! : words.no[0]!;
      } else if (question.type === 'text') {
        cells[1] = words.types.text[0]!;
        cells[3] = question.accepted.join('; ');
      } else if (question.type === 'numeric') {
        cells[1] = words.types.numeric[0]!;
        cells[3] = question.correct;
      }
      rows.push(cells);
    }
  });
  const exported = rows.length - 1;
  return { rows, skipped: total - exported };
}

/** Шаблон: заголовки й чотири приклади, тексти — мовою інтерфейсу. */
export function templateRows(): XlsxCell[][] {
  const common = { imageUrl: null, video: null };
  const options = [t('ioSampleOption1'), t('ioSampleOption2'), t('ioSampleOption3'), t('ioSampleOption4')];
  const questions: Question[] = [
    { ...common, id: 'a', text: t('ioSampleChoice'), type: 'single', options: options.map((text, i) => ({ id: `o${i}`, text })), correctId: 'o0', timeLimit: 30, points: 1000, hint: t('ioSampleChoiceHint') },
    { ...common, id: 'b', text: t('ioSampleYesNo'), type: 'boolean', correct: false, timeLimit: 25, points: 500 },
    { ...common, id: 'c', text: t('ioSampleText'), type: 'text', accepted: t('ioSampleTextAnswers').split(';').map((word) => word.trim()), timeLimit: 30, points: 1000 },
    { ...common, id: 'd', text: t('ioSampleNumber'), type: 'numeric', correct: 8, tolerance: 0, timeLimit: 25, points: 1000 },
  ];
  const round: ClassicRound = { ...newClassicRound(), title: t('ioSampleRound'), questions };
  return quizToRows({ ...newQuiz(), title: t('ioSampleRound'), rounds: [round] }).rows;
}

interface Lookups {
  columns: Map<string, ColumnKey>;
  types: Map<string, TableType>;
  yes: Set<string>;
  no: Set<string>;
}

let lookups: Lookups | undefined;

/** Слова всіх мов разом (імпорт не знає мови файлу). */
function allWords(): Lookups {
  if (lookups) return lookups;
  const found: Lookups = { columns: new Map(), types: new Map(), yes: new Set(['true', '1']), no: new Set(['false', '0']) };
  for (const words of Object.values(TABLE_WORDS)) {
    for (const [key, list] of Object.entries(words.columns)) for (const word of list) found.columns.set(normalizeWord(word), key as ColumnKey);
    for (const [key, list] of Object.entries(words.types)) for (const word of list) found.types.set(normalizeWord(word), key as TableType);
    for (const word of words.yes) found.yes.add(normalizeWord(word));
    for (const word of words.no) found.no.add(normalizeWord(word));
  }
  for (const key of ['single', 'boolean', 'text', 'numeric'] as const) found.types.set(key, key);
  found.yes.add('yes');
  found.no.add('no');
  lookups = found;
  return found;
}

interface Columns {
  single: Partial<Record<Exclude<ColumnKey, 'option'>, number>>;
  options: (number | undefined)[];
}

function readColumns(header: string[]): Columns {
  const { columns } = allWords();
  const found: Columns = { single: {}, options: Array.from({ length: MAX_OPTIONS }, () => undefined) };
  header.forEach((cell, index) => {
    const word = normalizeWord(cell);
    const key = columns.get(word);
    if (key !== undefined && key !== 'option') {
      found.single[key] ??= index;
      return;
    }
    const match = /^(.+?)\s*([1-6])$/.exec(word);
    if (match && columns.get(match[1]!.trim()) === 'option') found.options[Number(match[2]) - 1] ??= index;
  });
  return found;
}

/** Число з клітинки: пробіли прибрано, кома — десяткова; не число — undefined. */
function parseNumber(raw: string): number | undefined {
  const text = raw.replace(/\s+/g, '').replace(',', '.');
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

function parseWhole(raw: string, fallback: number, min: number, max: number): number | undefined {
  if (raw.trim() === '') return fallback;
  const value = parseNumber(raw);
  return value !== undefined && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

type RowResult = { question: Question; roundTitle: string } | null;

export type RowsToQuiz =
  | { ok: true; quiz: Quiz }
  | { ok: false; error: 'io_missing_columns' | 'io_too_many_rows' | 'io_empty' | 'io_invalid' }
  | { ok: false; errors: RowError[] };

/** Таблиця → вікторина; будь-яка помилка рядка — звіт без вікторини. */
export function rowsToQuiz(rows: string[][], title: string): RowsToQuiz {
  const header = rows[0] ?? [];
  const columns = readColumns(header);
  const { single: at } = columns;
  if (at.type === undefined || at.question === undefined || at.answer === undefined) return { ok: false, error: 'io_missing_columns' };

  const cell = (data: string[], index: number | undefined): string => (index === undefined ? '' : (data[index] ?? '').trim());
  const entries = rows.slice(1).flatMap((data, i) => (data.every((value) => value.trim() === '') ? [] : [{ data, row: i + 2 }]));
  if (entries.length > TABLE_LIMITS.maxRows) return { ok: false, error: 'io_too_many_rows' };
  if (entries.length === 0) return { ok: false, error: 'io_empty' };

  const { types, yes, no } = allWords();
  const errors: RowError[] = [];
  const rounds = new Map<string, Question[]>();
  let total = 0;

  for (const { data, row } of entries) {
    const found: TableProblem[] = [];
    const roundTitle = cell(data, at.round);
    const text = cell(data, at.question);
    const answer = cell(data, at.answer);
    if (text === '') found.push('no_question');
    else if (text.length > LIMITS.questionText) found.push('question_long');
    const type = types.get(normalizeWord(cell(data, at.type)));
    if (type === undefined) found.push('unknown_type');
    const id = newId();
    let body: Record<string, unknown> | undefined;

    if (type !== undefined) {
      if (type === 'single') {
        const options = columns.options.flatMap((index, n) => {
          const value = cell(data, index);
          return index !== undefined && value !== '' ? [{ n: n + 1, text: value }] : [];
        });
        const before = found.length;
        if (options.length < LIMITS.minOptions) found.push('few_options');
        if (options.some((option) => option.text.length > LIMITS.optionText)) found.push('option_long');
        if (new Set(options.map((option) => fold(option.text))).size !== options.length) found.push('duplicate_options');
        if (answer !== '' && found.length === before) {
          const byText = options.find((option) => fold(option.text) === fold(answer));
          const byNumber = /^[1-6]$/.test(answer) ? options.find((option) => option.n === Number(answer)) : undefined;
          const chosen = byText ?? byNumber;
          if (chosen === undefined) found.push('answer_not_option');
          else {
            const list = options.map((option) => ({ id: newId(), text: option.text }));
            body = { type, options: list, correctId: list[options.indexOf(chosen)]!.id };
          }
        }
      }
      if (answer === '') found.push('no_answer');
      else if (type === 'boolean') {
        const word = normalizeWord(answer);
        if (yes.has(word)) body = { type, correct: true };
        else if (no.has(word)) body = { type, correct: false };
        else found.push('bad_boolean');
      } else if (type === 'numeric') {
        const value = parseNumber(answer);
        if (value === undefined) found.push('bad_number');
        else body = { type, correct: value, tolerance: 0 };
      } else if (type === 'text') {
        const accepted = answer.split(';').map((spelling) => spelling.trim()).filter((spelling) => spelling !== '');
        if (accepted.length === 0) found.push('no_answer');
        else {
          if (accepted.some((spelling) => spelling.length > LIMITS.answerText)) found.push('answer_long');
          if (accepted.length > LIMITS.maxAccepted) found.push('too_many_answers');
          body = { type, accepted };
        }
      }
    }

    const points = parseWhole(cell(data, at.points), LIMITS.defaultPoints, 0, LIMITS.maxPoints);
    if (points === undefined) found.push('bad_points');
    const timeLimit = parseWhole(cell(data, at.timer), LIMITS.defaultTime, LIMITS.minTime, LIMITS.maxTime);
    if (timeLimit === undefined) found.push('bad_timer');
    const hint = cell(data, at.hint);
    if (hint.length > LIMITS.hintText) found.push('hint_long');
    if (roundTitle.length > LIMITS.roundTitle) found.push('round_long');

    const list = rounds.get(roundTitle);
    if (list === undefined && rounds.size >= LIMITS.maxRounds) found.push('too_many_rounds');
    else if (list !== undefined && list.length >= LIMITS.maxQuestions) found.push('round_full');
    else if (total >= LIMITS.maxQuizQuestions) found.push('quiz_full');

    for (const code of found) errors.push({ row, code });
    if (found.length > 0 || body === undefined || points === undefined || timeLimit === undefined) continue;
    const question = { id, text, imageUrl: null, video: null, timeLimit, points, ...(hint !== '' ? { hint } : {}), ...body } as Question;
    if (list === undefined) rounds.set(roundTitle, [question]);
    else list.push(question);
    total += 1;
  }
  if (errors.length > 0) return { ok: false, errors };

  const quiz: Quiz = {
    ...newQuiz(),
    title: title.trim().slice(0, 120).trim() || t('ioImportedTitle'),
    rounds: [...rounds].map(([roundTitle, questions]) => ({ ...newClassicRound(), title: roundTitle, questions })),
  };
  return quizSchema.safeParse(quiz).success ? { ok: true, quiz } : { ok: false, error: 'io_invalid' };
}

const PROBLEM_VARS: Partial<Record<TableProblem, { min?: number; max: number }>> = {
  question_long: { max: LIMITS.questionText },
  few_options: { max: LIMITS.minOptions },
  option_long: { max: LIMITS.optionText },
  answer_long: { max: LIMITS.answerText },
  too_many_answers: { max: LIMITS.maxAccepted },
  bad_points: { max: LIMITS.maxPoints },
  bad_timer: { min: LIMITS.minTime, max: LIMITS.maxTime },
  hint_long: { max: LIMITS.hintText },
  round_long: { max: LIMITS.roundTitle },
  round_full: { max: LIMITS.maxQuestions },
  too_many_rounds: { max: LIMITS.maxRounds },
  quiz_full: { max: LIMITS.maxQuizQuestions },
};

/** «Рядок 3: немає правильної відповіді». */
export function problemText(error: RowError): string {
  const vars = PROBLEM_VARS[error.code] ?? { max: 0 };
  return t('ioRowError', { row: error.row, problem: t(`ioProblem_${error.code}` as TextKey, { min: vars.min ?? 0, max: vars.max }) });
}
