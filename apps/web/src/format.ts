import type { Answer, Question } from '@quiz/shared';
import { t } from './i18n';

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

const yesNo = (value: boolean) => t(value ? 'yes' : 'no');

function choicesOf(question: Question | null): { id: string; text: string }[] {
  if (question === null) return [];
  if (question.type === 'single' || question.type === 'multi') return question.options;
  return question.type === 'order' ? question.items : [];
}

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
  }
}

/** Відповідь гравця словами. */
export function answerText(answer: Answer, question: Question | null): string {
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
  }
}
