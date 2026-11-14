import {
  LIMITS,
  answerKey,
  shuffle,
  type GroupDetail,
  type GroupItem,
  type Question,
  type QuestionType,
  type Quiz,
  type Rng,
} from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { newClassicRound, newQuestion, newQuiz } from '../editor/draft';
import { newId } from '../editor/new-id';
import { namesText } from '../locales/grammar';

/** Шаблони запитань із записів групи (12l): чисті функції «запис → чернетка й нагадування». */
export const GROUP_TEMPLATES = ['who', 'truth', 'when', 'whoami', 'open', 'bluff'] as const;
export type GroupTemplate = (typeof GROUP_TEMPLATES)[number];
export const TEMPLATE_TYPE: Record<GroupTemplate, QuestionType> = {
  who: 'single',
  truth: 'boolean',
  when: 'slider',
  whoami: 'clues',
  open: 'text',
  bluff: 'bluff',
};
/** Пропуск замість відповіді — однаковий у всіх мовах. */
export const GROUP_BLANK = '___';

export interface DraftNote {
  key: TextKey;
  vars?: Record<string, string | number>;
}
export interface GroupDraft {
  question: Question;
  notes: DraftNote[];
}
/** Чого бракує: ключ пояснення (з vars); null — шаблон доступний. */
export interface TemplateIssue {
  key: TextKey;
  vars?: Record<string, string | number>;
}

/** Ширина шкали «Коли це було?» і межі років запису. */
const SCALE_YEARS = 30;
const SCALE_EDGE = 5;
const YEAR_MIN = 1800;
const YEAR_MAX = 2100;
/** Скільки неправильних варіантів «Хто це?». */
const WRONG_OPTIONS = 3;

const squeeze = (text: string): string => text.replace(/\s+/g, ' ').trim();
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Ціле слово (чи кілька слів): межі — не літера й не цифра. */
const wordPattern = (word: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'giu');

function unique(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = answerKey(name);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(name.trim());
  }
  return result;
}

/** Імена «про кого» запису для показу (учасник — теперішній нік чи збережене ім'я). */
export function aboutNames(item: GroupItem): string[] {
  return unique(item.about.map((entry) => entry.name));
}

/** Імена групи для неправильних варіантів і підміни: ніки учасників + імена «про кого» всіх записів; без повторів, у стабільному порядку. */
export function namePool(group: Pick<GroupDetail, 'members'>, items: readonly GroupItem[]): string[] {
  return unique([...group.members.map((member) => member.nickname ?? ''), ...items.flatMap(aboutNames)]);
}

/** Точні входження (без регістру, межі за \p{L}\p{N}) → «___». */
export function blankOut(text: string, words: readonly string[]): { text: string; hit: boolean } {
  let hit = false;
  let result = text;
  // Довші спершу: «бабуся Ніна» раніше за «Ніна».
  for (const word of [...words].filter((w) => w.trim() !== '').sort((a, b) => b.length - a.length)) {
    result = result.replace(wordPattern(word.trim()), () => {
      hit = true;
      return GROUP_BLANK;
    });
  }
  return { text: result, hit };
}

/** Обрізає по слову з «…»; clipped — чи обрізано. */
export function clip(text: string, max: number): { text: string; clipped: boolean } {
  if (text.length <= max) return { text, clipped: false };
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const body = (space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:—–-]+$/u, '');
  return { text: `${body}…`, clipped: true };
}

/** Неправильні варіанти «Хто це?»: імена з пулу без героїв; для кількох героїв — стільки ж імен у варіанті. */
function wrongNames(names: readonly string[], pool: readonly string[]): string[] {
  const taken = new Set(names.map(answerKey));
  return pool.filter((name) => !taken.has(answerKey(name)));
}

export function templateIssue(template: GroupTemplate, item: GroupItem, pool: readonly string[]): TemplateIssue | null {
  const names = aboutNames(item);
  switch (template) {
    case 'who':
      if (names.length === 0) return { key: 'groupTplNeedAbout' };
      if (namesText(names).length > LIMITS.optionText) return { key: 'groupTplNamesLong', vars: { max: LIMITS.optionText } };
      if (wrongNames(names, pool).length < names.length) return { key: 'groupTplNeedNames' };
      return null;
    case 'truth':
      return null;
    case 'when':
      return item.year === null ? { key: 'groupTplNeedYear' } : null;
    case 'whoami':
      return names.length === 0 ? { key: 'groupTplNeedAbout' } : null;
    case 'open':
      return item.answer === null ? { key: 'groupTplNeedAnswer' } : null;
    case 'bluff':
      if (item.answer === null) return { key: 'groupTplNeedAnswer' };
      return item.answer.length > LIMITS.bluffLie ? { key: 'groupTplAnswerLong', vars: { max: LIMITS.bluffLie } } : null;
  }
}

/** Тип шаблону мусить бути серед types (questionTypesFor раунду): інакше groupTplNotHere. */
export function placeIssue(template: GroupTemplate, types: readonly QuestionType[]): TemplateIssue | null {
  return types.includes(TEMPLATE_TYPE[template]) ? null : { key: 'groupTplNotHere' };
}

const pick = <T,>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)]!;

/** Підмінене слово стояло з великої — заміна теж з великої («Бабуся Ніна» → «Іра Лис»); з малої ім'я лишається як є. */
const likeCase = (original: string, replacement: string): string =>
  original[0] !== undefined && original[0] === original[0].toLocaleUpperCase() && original[0] !== original[0].toLocaleLowerCase()
    ? replacement.charAt(0).toLocaleUpperCase() + replacement.slice(1)
    : replacement;

/** Пропозиція вигадки: рік → рік ± 2…7, інакше ім'я → інше ім'я з пулу, інакше відповідь → відповідь іншого запису того самого виду; null — нічого підмінити. */
export function fictionOf(
  item: GroupItem,
  pool: readonly string[],
  items: readonly GroupItem[],
  rng: Rng,
): { text: string; from: string; to: string } | null {
  const text = squeeze(item.text);
  const swap = (word: string, to: (found: string) => string): { text: string; from: string; to: string } | null => {
    const found = text.match(wordPattern(word));
    if (found === null) return null;
    const from = found[0];
    const next = to(from);
    return { text: text.replace(wordPattern(word), next), from, to: next };
  };
  if (item.year !== null) {
    const shift = 2 + Math.floor(rng() * 6);
    const sign = rng() < 0.5 ? -1 : 1;
    let year = item.year + sign * shift;
    if (year < YEAR_MIN || year > YEAR_MAX) year = item.year - sign * shift;
    const swapped = swap(String(item.year), () => String(year));
    if (swapped !== null) return swapped;
  }
  const names = aboutNames(item);
  const others = wrongNames(names, pool);
  if (others.length > 0) {
    for (const name of names) {
      const other = pick(others, rng);
      const swapped = swap(name, (found) => likeCase(found, other));
      if (swapped !== null) return swapped;
    }
  }
  if (item.answer !== null) {
    const truth = answerKey(item.answer);
    const answers = unique(
      items.filter((one) => one.id !== item.id && one.kind === item.kind && one.answer !== null).map((one) => one.answer!),
    ).filter((answer) => answerKey(answer) !== truth);
    if (answers.length > 0) {
      const other = pick(answers, rng);
      const swapped = swap(item.answer, (found) => likeCase(found, other));
      if (swapped !== null) return swapped;
    }
  }
  return null;
}

export interface DraftContext {
  pool: readonly string[];
  /** Усі видимі записи групи (запасні вигадки блефу, підміна відповіді). */
  items: readonly GroupItem[];
  rng: Rng;
  /** Поточний рік (шкала «Коли це було?»); тест передає 2026. */
  year: number;
  /** Лише для truth: false — вигадка з цим текстом (уже перевірено, що він інший). */
  truth?: { correct: true } | { correct: false; text: string };
}

/** Текст запитання до LIMITS.questionText і нагадування, якщо обрізано. */
function questionText(text: string, notes: DraftNote[]): string {
  const clipped = clip(text, LIMITS.questionText);
  if (clipped.clipped) notes.push({ key: 'groupNoteClipped', vars: { max: LIMITS.questionText } });
  return clipped.text;
}

/** Шкала шириною SCALE_YEARS з роком у випадковому місці (SCALE_EDGE…SCALE_YEARS − SCALE_EDGE від лівого краю). */
function yearScale(year: number, now: number, rng: Rng): { min: number; max: number } {
  const offset = SCALE_EDGE + Math.floor(rng() * (SCALE_YEARS - 2 * SCALE_EDGE + 1));
  let min = year - offset;
  if (year <= now && min + SCALE_YEARS > now) min = now - SCALE_YEARS;
  if (min < YEAR_MIN) min = YEAR_MIN;
  return { min, max: min + SCALE_YEARS };
}

/** Запасні вигадки блефу: короткі відповіді інших записів (спершу того самого виду), без повторів і без правди. */
function spareLies(item: GroupItem, items: readonly GroupItem[], truth: string): string[] {
  const others = items.filter((one) => one.id !== item.id && one.answer !== null && one.answer.length <= LIMITS.bluffLie);
  const ordered = [...others.filter((one) => one.kind === item.kind), ...others.filter((one) => one.kind !== item.kind)];
  return unique(ordered.map((one) => one.answer!))
    .filter((answer) => answerKey(answer) !== answerKey(truth))
    .slice(0, LIMITS.minBluffSpares);
}

/** Чернетка з запису; викликати лише коли templateIssue === null. */
export function draftFrom(template: GroupTemplate, item: GroupItem, context: DraftContext): GroupDraft {
  const notes: DraftNote[] = [];
  const base = { ...newQuestion(TEMPLATE_TYPE[template]), imageUrl: item.photo, timeLimit: LIMITS.defaultTime, points: LIMITS.defaultPoints };
  const body = squeeze(item.text);
  const names = aboutNames(item);
  const photoNote = () => {
    if (item.photo !== null) notes.push({ key: 'groupNotePhoto' });
  };
  switch (template) {
    case 'who': {
      const blanked = blankOut(body, names);
      if (!blanked.hit) notes.push({ key: 'groupNoteBlankName' });
      photoNote();
      const text = questionText(t('groupTplText_who', { text: blanked.text }), notes);
      const correct = namesText(names);
      const rest = shuffle(wrongNames(names, context.pool), context.rng);
      const wrong: string[] = [];
      for (let i = 0; i + names.length <= rest.length && wrong.length < WRONG_OPTIONS; i += names.length) {
        const option = namesText(rest.slice(i, i + names.length));
        if (option.length <= LIMITS.optionText && answerKey(option) !== answerKey(correct)) wrong.push(option);
      }
      const options = shuffle([correct, ...wrong], context.rng).map((value) => ({ id: newId(), text: value }));
      const correctId = options.find((option) => option.text === correct)!.id;
      return { question: { ...base, type: 'single', text, options, correctId } as Question, notes };
    }
    case 'truth': {
      const truth = context.truth ?? { correct: true };
      const shown = truth.correct ? body : squeeze(truth.text);
      if (!truth.correct) notes.push({ key: 'groupNoteFiction' });
      const text = questionText(t('groupTplText_truth', { text: shown }), notes);
      return { question: { ...base, type: 'boolean', text, correct: truth.correct } as Question, notes };
    }
    case 'when': {
      const year = item.year!;
      const blanked = blankOut(body, [String(year)]);
      if (!blanked.hit) notes.push({ key: 'groupNoteBlankAnswer' });
      const text = questionText(t('groupTplText_when', { text: blanked.text }), notes);
      const { min, max } = yearScale(year, context.year, context.rng);
      return {
        question: { ...base, type: 'slider', text, min, max, step: 1, correct: year, tolerance: 0, zeroBeyond: SCALE_EDGE } as Question,
        notes,
      };
    }
    case 'whoami': {
      let hit = false;
      const sentences = body
        .split(/(?<=[.!?…])\s+/u)
        .filter((sentence) => sentence.trim() !== '')
        .slice(0, LIMITS.maxClues)
        .reverse()
        .map((sentence) => {
          const blanked = blankOut(sentence, names);
          hit ||= blanked.hit;
          return clip(blanked.text, LIMITS.clueText).text;
        });
      if (!hit) notes.push({ key: 'groupNoteBlankName' });
      if (names.length > 1) notes.push({ key: 'groupNoteManyAbout' });
      photoNote();
      const missing = Math.max(0, LIMITS.minClues - sentences.length);
      if (missing > 0) notes.push({ key: 'groupNoteClues', vars: { min: LIMITS.minClues } });
      // Дописати треба найважчі підказки — вони перші; речення запису лишаються ближче до відповіді.
      const clues = [...Array.from({ length: missing }, () => ''), ...sentences];
      const timeLimit = Math.max(LIMITS.defaultTime, (clues.length - 1) * LIMITS.defaultClueSeconds + LIMITS.clueTailSeconds);
      return {
        question: {
          ...base,
          video: null,
          type: 'clues',
          text: t('groupTplText_whoami'),
          clues,
          accepted: [names[0]!],
          interval: LIMITS.defaultClueSeconds,
          timeLimit,
        } as Question,
        notes,
      };
    }
    case 'open': {
      const answer = item.answer!;
      const blanked = blankOut(body, [answer]);
      if (!blanked.hit) notes.push({ key: 'groupNoteBlankAnswer' });
      const text = questionText(blanked.text, notes);
      return { question: { ...base, type: 'text', text, accepted: [answer] } as Question, notes };
    }
    case 'bluff': {
      const answer = item.answer!;
      const blanked = blankOut(body, [answer]);
      if (!blanked.hit) notes.push({ key: 'groupNoteBlankAnswer' });
      const text = questionText(blanked.text, notes);
      const found = spareLies(item, context.items, answer);
      if (found.length < LIMITS.minBluffSpares) notes.push({ key: 'groupNoteLies', vars: { min: LIMITS.minBluffSpares } });
      const lies = [...found, ...Array.from({ length: LIMITS.minBluffSpares - found.length }, () => '')];
      return {
        question: {
          ...base,
          video: null,
          type: 'bluff',
          text,
          accepted: [answer],
          lies,
          timeLimit: LIMITS.defaultBluffTime,
          choiceTime: LIMITS.defaultChoiceTime,
        } as Question,
        notes,
      };
    }
  }
}

/** «Змішано» — шаблон по черзі для кожного запису; один шаблон — він або truth, якщо бракує полів. */
export function pickTemplates(items: readonly GroupItem[], choice: GroupTemplate | 'mixed', pool: readonly string[]): GroupTemplate[] {
  if (choice !== 'mixed') return items.map((item) => (templateIssue(choice, item, pool) === null ? choice : 'truth'));
  let next = 0;
  return items.map((item) => {
    for (let step = 0; step < GROUP_TEMPLATES.length; step++) {
      const at = (next + step) % GROUP_TEMPLATES.length;
      const template = GROUP_TEMPLATES[at]!;
      if (templateIssue(template, item, pool) === null) {
        next = (at + 1) % GROUP_TEMPLATES.length;
        return template;
      }
    }
    return 'truth';
  });
}

/** «Вікторина з групи»: нова вікторина з одним класичним раундом; так/ні чергуються з «ні» першим, де є fictionOf. */
export function buildGroupQuiz(
  group: Pick<GroupDetail, 'name' | 'members'>,
  picked: readonly GroupItem[],
  all: readonly GroupItem[],
  choice: GroupTemplate | 'mixed',
  rng: Rng,
  year: number,
): { quiz: Quiz; drafts: { questionId: string; itemId: string; notes: DraftNote[] }[] } {
  const pool = namePool(group, all);
  const templates = pickTemplates(picked, choice, pool);
  let wantNo = true;
  const made = picked.map((item, index) => {
    const template = templates[index]!;
    const context: DraftContext = { pool, items: all, rng, year };
    if (template === 'truth') {
      const fiction = wantNo ? fictionOf(item, pool, all, rng) : null;
      context.truth = fiction === null ? { correct: true } : { correct: false, text: fiction.text };
      if (fiction !== null || !wantNo) wantNo = !wantNo;
    }
    return { item, draft: draftFrom(template, item, context) };
  });
  const blank = newQuiz();
  const quiz: Quiz = {
    ...blank,
    title: t('groupQuizName', { name: group.name }).slice(0, 120),
    rounds: [{ ...newClassicRound(), title: group.name.slice(0, LIMITS.roundTitle), questions: made.map(({ draft }) => draft.question) }],
  };
  return { quiz, drafts: made.map(({ item, draft }) => ({ questionId: draft.question.id, itemId: item.id, notes: draft.notes })) };
}
