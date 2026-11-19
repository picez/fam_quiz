import { autopilotCheck } from './autopilot';
import { QUESTION_TYPES } from './question-types';
import { YOUTUBE_ID, answerKey, quizSchema, wordIn, type Question } from './quiz';

/** Перевірка вікторини адміном (57): помилки — вікторина зламана чи видає відповідь; попередження — варто глянути. */
export const QUIZ_CHECK_ERRORS = ['schema', 'media_missing', 'media_unreachable', 'video_missing', 'video_not_embeddable', 'video_start_past_end', 'empty_answer', 'no_correct', 'duplicate_option', 'answer_leak', 'autopilot_blocked'] as const;
export const QUIZ_CHECK_WARNINGS = ['short_timer', 'hint_leak', 'media_unchecked', 'video_unchecked'] as const;
export type QuizCheckCode = (typeof QUIZ_CHECK_ERRORS)[number] | (typeof QUIZ_CHECK_WARNINGS)[number];

const ERROR_CODES: ReadonlySet<QuizCheckCode> = new Set(QUIZ_CHECK_ERRORS);

/** Важкість — із самого коду. */
export function checkSeverity(code: QuizCheckCode): 'error' | 'warning' {
  return ERROR_CODES.has(code) ? 'error' : 'warning';
}

/** round — індекс раунду (null: запасні, дуелі, уся вікторина); question — перші 80 символів тексту; detail — адреса, id відео, відповідь, секунди, код блокування чи шлях схеми. */
export interface QuizCheckIssue {
  code: QuizCheckCode;
  round: number | null;
  questionId: string | null;
  question: string | null;
  detail: string | null;
}

export interface AdminQuizCheck {
  quizId: string;
  checkedAt: string;
  errors: number;
  warnings: number;
  issues: QuizCheckIssue[];
}

/** Таймер запитання, коротший за цей (с), — попередження short_timer. */
export const QUIZ_CHECK_MIN_TIMER = 25;

/** Запитання в сирому JSON вікторини: round — індекс раунду, null — запасні вікторини й дуелі. */
export interface QuestionPlace {
  round: number | null;
  question: Record<string, unknown>;
}

/** Місце посилання на медіа: найближче запитання-предок. */
export interface MediaPlace {
  round: number | null;
  questionId: string | null;
  question: string | null;
}

export type MediaRef =
  | { kind: 'storage'; name: string; place: MediaPlace }
  | { kind: 'url'; url: string; place: MediaPlace }
  | { kind: 'youtube'; id: string; start: number; place: MediaPlace };

type Rec = Record<string, unknown>;
type Path = readonly (string | number)[];

const QUESTION_TYPE_SET: ReadonlySet<unknown> = new Set(QUESTION_TYPES);
const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Дуельне запитання: raw.duels.categories[i].questions[j]. */
const isDuelPath = (path: Path) => path.length === 5 && path[0] === 'duels' && path[1] === 'categories' && path[3] === 'questions' && typeof path[4] === 'number';

/** Запитання за формою: рядкові id і text, тип із QUESTION_TYPES (чи дуельне запитання за місцем). */
function isQuestionAt(node: unknown, path: Path): node is Rec {
  if (!isRec(node) || typeof node.id !== 'string' || typeof node.text !== 'string') return false;
  return QUESTION_TYPE_SET.has(node.type) || isDuelPath(path);
}

const roundOf = (path: Path): number | null => (path[0] === 'rounds' && typeof path[1] === 'number' ? path[1] : null);

/** Порядок обходу верхнього рівня: раунди, запасні, дуелі, далі решта. */
const TOP_ORDER = ['rounds', 'spares', 'duels'];

type Visit = (node: unknown, path: Path, question: Rec | null) => void;

/** Один рекурсивний обхід сирого JSON; question — найближче запитання-предок (чи сам вузол). */
function walk(raw: unknown, visit: Visit): void {
  const go = (node: unknown, path: Path, question: Rec | null) => {
    const nearest = isQuestionAt(node, path) ? node : question;
    visit(node, path, nearest);
    if (Array.isArray(node)) node.forEach((child, index) => go(child, [...path, index], nearest));
    else if (isRec(node)) {
      const keys = Object.keys(node);
      const ordered = path.length === 0 ? [...TOP_ORDER.filter((k) => keys.includes(k)), ...keys.filter((k) => !TOP_ORDER.includes(k))] : keys;
      for (const key of ordered) go(node[key], [...path, key], nearest);
    }
  };
  go(raw, [], null);
}

/** Усі запитання сирої вікторини в порядку гри: раунди (з клітинками поля, випробуваннями й запасними категорій), запасні, дуелі. */
export function quizPlaces(raw: unknown): QuestionPlace[] {
  const places: QuestionPlace[] = [];
  walk(raw, (node, path) => {
    if (isQuestionAt(node, path)) places.push({ round: roundOf(path), question: node });
  });
  return places;
}

const questionText = (question: Rec | null): string | null => (question !== null && typeof question.text === 'string' ? question.text.slice(0, 80) : null);

const placeOf = (path: Path, question: Rec | null): MediaPlace => ({
  round: roundOf(path),
  questionId: question !== null && typeof question.id === 'string' ? question.id : null,
  question: questionText(question),
});

const STORAGE_REF = /^\/uploads\/(.+)$/;
const EXTERNAL_REF = /^https?:\/\//i;

/** Найближчий рядковий ключ шляху (для елемента масиву — ключ масиву). */
const keyOf = (path: Path): string | null => {
  for (let i = path.length - 1; i >= 0; i -= 1) if (typeof path[i] === 'string') return path[i] as string;
  return null;
};

/** Усі посилання на медіа в сирій вікторині: файли сховища, зовнішні адреси й відео YouTube, без переліку типів. */
export function mediaRefs(raw: unknown): MediaRef[] {
  const refs: MediaRef[] = [];
  walk(raw, (node, path, question) => {
    const key = keyOf(path);
    if (typeof node === 'string') {
      const storage = STORAGE_REF.exec(node);
      if (storage !== null) refs.push({ kind: 'storage', name: storage[1]!, place: placeOf(path, question) });
      else if (EXTERNAL_REF.test(node) && key !== null && /(Url|url)$/.test(key)) refs.push({ kind: 'url', url: node, place: placeOf(path, question) });
      return;
    }
    if (!isRec(node) || typeof node.id !== 'string' || !YOUTUBE_ID.test(node.id) || typeof node.start !== 'number') return;
    if (key === 'video' || key === 'clip' || node.source === 'youtube') refs.push({ kind: 'youtube', id: node.id, start: node.start, place: placeOf(path, question) });
  });
  return refs;
}

/** Типи, у яких відповідь — написання accepted. */
const ACCEPTED_TYPES: ReadonlySet<unknown> = new Set(['text', 'drawing', 'clues', 'melody', 'videoclip', 'bluff', 'spy']);
const MAX_SCHEMA_ISSUES = 20;

interface Ranked {
  issue: QuizCheckIssue;
  pos: number;
}

/** Найближче запитання за шляхом вади схеми. */
function questionAtPath(raw: unknown, path: Path): Rec | null {
  let node: unknown = raw;
  let found: Rec | null = null;
  for (let i = 0; i <= path.length; i += 1) {
    if (isQuestionAt(node, path.slice(0, i))) found = node;
    if (i === path.length) break;
    const step = path[i]!;
    if (Array.isArray(node) && typeof step === 'number') node = node[step];
    else if (isRec(node) && typeof step === 'string') node = node[step];
    else break;
  }
  return found;
}

/** Відповідь, яку варто шукати в тексті: не коротша за 3 символи й не з самих цифр (як у сідах). */
const checkable = (answer: string) => {
  const key = answerKey(answer);
  return key.length >= 3 && !/^[\p{N}\s]+$/u.test(key);
};

function answersOf(q: Question): string[] {
  switch (q.type) {
    case 'single':
      return q.options.filter((o) => o.id === q.correctId).map((o) => o.text);
    case 'multi':
      return q.options.filter((o) => q.correctIds.includes(o.id)).map((o) => o.text);
    case 'text':
    case 'drawing':
    case 'clues':
    case 'melody':
    case 'videoclip':
    case 'bluff':
    case 'spy':
      return q.accepted;
    case 'wordle':
      return [q.word];
    case 'timedlist':
      return q.items.flatMap((item) => [item.text, ...item.accepted]);
    default:
      return [];
  }
}

/** Вади будови одного сирого запитання (кожне — окремо, невідома форма — пропуск). */
function structureIssues(q: Rec): { code: QuizCheckCode; detail: string | null }[] {
  const found: { code: QuizCheckCode; detail: string | null }[] = [];
  if (ACCEPTED_TYPES.has(q.type)) {
    const accepted = q.accepted;
    if (!Array.isArray(accepted) || !accepted.some((s) => typeof s === 'string' && s.trim() !== '')) found.push({ code: 'empty_answer', detail: null });
  }
  if (q.type === 'single' || q.type === 'multi' || q.type === 'poll') {
    const options = Array.isArray(q.options) ? q.options.filter(isRec) : [];
    const ids = options.map((o) => o.id);
    if (q.type === 'single' && !ids.includes(q.correctId)) found.push({ code: 'no_correct', detail: null });
    if (q.type === 'multi' && (!Array.isArray(q.correctIds) || q.correctIds.length === 0 || q.correctIds.some((id) => !ids.includes(id)))) {
      found.push({ code: 'no_correct', detail: null });
    }
    const seen = new Map<string, { text: string; reported: boolean }>();
    for (const option of options) {
      if (typeof option.text !== 'string' || option.text.trim() === '') continue;
      const key = answerKey(option.text);
      const first = seen.get(key);
      if (first === undefined) seen.set(key, { text: option.text.trim(), reported: false });
      else if (!first.reported) {
        first.reported = true;
        found.push({ code: 'duplicate_option', detail: first.text });
      }
    }
  }
  if (typeof q.timeLimit === 'number' && q.timeLimit < QUIZ_CHECK_MIN_TIMER && q.video == null) found.push({ code: 'short_timer', detail: String(q.timeLimit) });
  return found;
}

/** Перший витік відповіді в текстах (без повторів у межах запитання). */
const leakIn = (texts: string[], answers: string[]) => answers.find((a) => texts.some((t) => wordIn(t, a))) ?? null;

/**
 * Перевірки без мережі (57): схема, будова сирих запитань, короткі таймери, витоки відповідей у тексті й підказці, блокування автопілота.
 * Спершу всі помилки, потім попередження; усередині — у порядку вікторини. Не кидає на будь-якому JSON.
 */
export function staticIssues(raw: unknown): QuizCheckIssue[] {
  const ranked: Ranked[] = [];
  const places = quizPlaces(raw);
  const posOf = new Map<unknown, number>();
  const posById = new Map<string, number>();
  places.forEach((place, index) => {
    posOf.set(place.question, index);
    const id = place.question.id as string;
    if (!posById.has(id)) posById.set(id, index);
  });
  const roundPos = (round: number | null) => {
    const first = places.findIndex((p) => p.round === round);
    return first === -1 ? places.length : first - 0.5;
  };
  const duelPos = () => {
    const first = places.findIndex((p) => p.round === null && typeof p.question.type !== 'string');
    return first === -1 ? places.length : first - 0.5;
  };
  const add = (issue: QuizCheckIssue, pos: number) => ranked.push({ issue, pos });
  const forQuestion = (code: QuizCheckCode, round: number | null, q: Rec, detail: string | null, pos: number) =>
    add({ code, round, questionId: typeof q.id === 'string' ? q.id : null, question: questionText(q), detail }, pos);

  const parsed = quizSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, MAX_SCHEMA_ISSUES)) {
      const path = issue.path.filter((step): step is string | number => typeof step === 'string' || typeof step === 'number');
      const q = questionAtPath(raw, path);
      const round = roundOf(path);
      const detail = `${path.join('.')}: ${issue.message}`;
      if (q === null) add({ code: 'schema', round, questionId: null, question: null, detail }, round === null ? -1 : roundPos(round));
      else forQuestion('schema', round, q, detail, posOf.get(q) ?? -1);
    }
  }

  places.forEach((place, index) => {
    try {
      for (const { code, detail } of structureIssues(place.question)) forQuestion(code, place.round, place.question, detail, index);
    } catch {
      // Невідома форма — пропуск.
    }
  });
  try {
    const duels = isRec(raw) ? raw.duels : undefined;
    if (isRec(duels) && typeof duels.timeLimit === 'number' && duels.timeLimit < QUIZ_CHECK_MIN_TIMER) {
      add({ code: 'short_timer', round: null, questionId: null, question: null, detail: String(duels.timeLimit) }, duelPos());
    }
  } catch {
    // Невідома форма — пропуск.
  }

  if (parsed.success) {
    const quiz = parsed.data;
    for (const place of quizPlaces(quiz)) {
      const q = place.question;
      const pos = posById.get(q.id as string) ?? places.length;
      if (typeof q.type !== 'string') {
        // Дуельне запитання: accepted у тексті.
        const leak = leakIn([q.text as string], (q.accepted as string[]).filter(checkable));
        if (leak !== null) forQuestion('answer_leak', null, q, leak, pos);
        continue;
      }
      const question = q as unknown as Question;
      const answers = answersOf(question).filter(checkable);
      const leak = leakIn([question.text, ...(question.type === 'clues' ? question.clues : [])], answers);
      if (leak !== null) forQuestion('answer_leak', place.round, q, leak, pos);
      const hinted = question.hint === undefined ? null : leakIn([question.hint], answers);
      if (hinted !== null) forQuestion('hint_leak', place.round, q, hinted, pos);
    }
    for (const blocked of autopilotCheck(quiz).blocked) {
      for (const round of blocked.rounds) add({ code: 'autopilot_blocked', round, questionId: null, question: null, detail: blocked.code }, roundPos(round));
    }
  }

  const rank = (code: QuizCheckCode) => (checkSeverity(code) === 'error' ? 0 : 1);
  return ranked
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => rank(a.issue.code) - rank(b.issue.code) || a.pos - b.pos || a.index - b.index)
    .map((entry) => entry.issue);
}
