import type { Answer, Question } from '@quiz/shared';
import { t } from './i18n';

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

const yesNo = (value: boolean) => t(value ? 'yes' : 'no');

function choicesOf(question: Question | null): { id: string; text: string }[] {
  if (question === null) return [];
  if (question.type === 'single' || question.type === 'multi') return question.options;
  return question.type === 'order' ? question.items : [];
}

/** Правильна відповідь словами, для розкриття та пульта. */
export function correctText(question: Question): string {
  switch (question.type) {
    case 'single':
    case 'multi': {
      const ids = question.type === 'single' ? [question.correctId] : question.correctIds;
      return question.options
        .map((option, index) => ({ option, letter: LETTERS[index] }))
        .filter(({ option }) => ids.includes(option.id))
        .map(({ option, letter }) => `${letter}. ${option.text}`)
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
