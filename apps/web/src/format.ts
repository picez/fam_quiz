import type { Answer, LobbyPlayer, Question, Round, RoundInfo } from '@quiz/shared';
import { t } from './i18n';

/** Назва раунду для показу: порожню (за замовчуванням) замінює «Раунд N», а в бліці — «Бліц». */
export const roundLabel = (title: string, index: number, type?: Round['type']): string => {
  if (title.trim() !== '') return title;
  return type === 'blitz' ? t('blitzLabel') : t('roundN', { index: index + 1 });
};

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
