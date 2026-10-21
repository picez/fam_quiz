import type { Answer, CellMark, Choice, LobbyPlayer, PublicQuestion, Question, Round, RoundInfo } from '@quiz/shared';
import { t } from './i18n';

/** Назва раунду для показу: порожню (за замовчуванням) замінює «Раунд N», а в бліці й полі — «Бліц» та «Ігрове поле». */
export const roundLabel = (title: string, index: number, type?: Round['type']): string => {
  if (title.trim() !== '') return title;
  if (type === 'blitz') return t('blitzLabel');
  return type === 'board' ? t('boardLabel') : t('roundN', { index: index + 1 });
};

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

const yesNo = (value: boolean) => t(value ? 'yes' : 'no');

export interface PairText {
  left: string;
  right: string;
}

/** Варіанти запитання для пошуку назв за id; для match — ліві й праві. */
export function choicesOf(question: Question | null): Choice[] {
  if (question === null) return [];
  if (question.type === 'single' || question.type === 'multi') return question.options;
  if (question.type === 'match') return question.pairs.flatMap((pair) => [pair.left, pair.right]);
  return question.type === 'order' ? question.items : [];
}

/** Усі показані варіанти: choices і right. */
export function shownChoices(question: PublicQuestion): Choice[] {
  return [...question.choices, ...question.right];
}

/** Зв’язки відповіді словами; невідомий id показується як є. */
export function pairTexts(links: { left: string; right: string }[], choices: Choice[]): PairText[] {
  const name = (id: string) => choices.find((choice) => choice.id === id)?.text ?? id;
  return links.map((link) => ({ left: name(link.left), right: name(link.right) }));
}

/** Правильні пари словами; для інших типів []. */
export function correctPairs(question: Question): PairText[] {
  return question.type === 'match' ? question.pairs.map((pair) => ({ left: pair.left.text, right: pair.right.text })) : [];
}

const pairsLine = (pairs: PairText[]) => pairs.map((pair) => `${pair.left} — ${pair.right}`).join('; ');

/** Клас заголовка запитання: довгий текст набирається дрібніше, щоб варіанти лишались на екрані. */
export function questionClass(text: string): string {
  if (text.length > 220) return 'question is-xlong';
  return text.length > 120 ? 'question is-long' : 'question';
}

/**
 * Правильна відповідь словами, для розкриття та пульта.
 * presented — варіанти в порядку показу: літери мають збігатися з тим, що бачать гравці.
 */
export function correctText(question: Question, presented?: { id: string }[]): string {
  switch (question.type) {
    case 'single':
    case 'multi': {
      const correct = question.type === 'single' ? [question.correctId] : question.correctIds;
      const shown = presented === undefined ? question.options.map((option) => option.id) : presented.map((c) => c.id);
      return shown
        .map((id, index) => ({ id, letter: LETTERS[index] }))
        .filter(({ id }) => correct.includes(id))
        .map(({ id, letter }) => `${letter}. ${question.options.find((option) => option.id === id)?.text ?? id}`)
        .join(', ');
    }
    case 'boolean':
      return yesNo(question.correct);
    case 'text':
      return question.accepted[0];
    case 'numeric':
      return question.tolerance > 0 ? `${question.correct} (± ${question.tolerance})` : String(question.correct);
    case 'order':
      return question.items.map((item) => item.text).join(' → ');
    case 'match':
      return pairsLine(correctPairs(question));
  }
}

/** Відповідь гравця словами. */
export function answerText(answer: Answer | null, question: Question | null): string {
  if (answer === null) return '—';
  const choices = choicesOf(question);
  const name = (id: string) => choices.find((choice) => choice.id === id)?.text ?? id;
  switch (answer.type) {
    case 'single':
      return name(answer.optionId);
    case 'multi':
      return answer.optionIds.map(name).join(', ');
    case 'boolean':
      return yesNo(answer.value);
    case 'text':
      return answer.value;
    case 'numeric':
      return String(answer.value);
    case 'order':
      return answer.itemIds.map(name).join(' → ');
    case 'match':
      return pairsLine(pairTexts(answer.links, choices));
  }
}

const dateFormat = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Дата й час гри словами; порожній рядок, якщо значення не є датою. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

/** Число зі справжнім мінусом «−», а не дефісом: рахунок може бути від’ємним. */
export function num(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

/** Бали запитання зі знаком: «+750», «−1000». */
export function signed(value: number): string {
  return value > 0 ? `+${value}` : num(value);
}

/** Номер запитання в раунді; коли раундів кілька, поруч назва раунду. */
export function questionLabel(round: RoundInfo | null, index: number, total: number): string {
  const base = t('questionOf', { index: index + 1, total });
  return round !== null && round.total > 1 ? `${base}, ${t('roundN', { index: round.index + 1 })}` : base;
}

/** Серії гравців за id; показуються біля імені від двох правильних відповідей підряд. */
export function streaksOf(players: LobbyPlayer[]): Record<string, number> {
  return Object.fromEntries(players.map((player) => [player.id, player.streak]));
}

/** Позначка клітинки поля: «×2», «×3»; для клітинки без позначки порожньо. */
export function markText(mark: CellMark): string {
  return mark === 'x2' ? '×2' : mark === 'x3' ? '×3' : '';
}

/** Відповідь словами за показаними варіантами: назви беруться з запитання, яке бачить гравець. */
export function pickedText(answer: Answer, choices: Choice[]): string {
  const name = (id: string) => choices.find((choice) => choice.id === id)?.text ?? id;
  switch (answer.type) {
    case 'single':
      return name(answer.optionId);
    case 'multi':
      return answer.optionIds.map(name).join(', ');
    case 'order':
      return answer.itemIds.map(name).join(' → ');
    case 'match':
      return pairsLine(pairTexts(answer.links, choices));
    default:
      return answerText(answer, null);
  }
}
