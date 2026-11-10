import type { AdminLogEntry, Question, RemovalEffect } from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { nickText } from '../nick';

/** Текст підтвердження видалення запитання; null — кнопка неактивна (останнє, замкнене чи вже немає). */
export function questionConfirm(effect: RemovalEffect, roundTitle: string): string | null {
  switch (effect) {
    case 'question':
      return t('adminDeleteQuestionConfirm');
    case 'category':
      return t('adminDeleteCategoryConfirm');
    case 'round':
      return t('adminDeleteRoundConfirm', { title: roundTitle === '' ? t('adminThisRound') : roundTitle });
    default:
      return null;
  }
}

/** Рядок журналу; для блокування з причиною — «. Причина: …». */
export function logLine(entry: AdminLogEntry): string {
  const line = t(`adminLog_${entry.kind}` as TextKey, { admin: nickText(entry.admin), target: nickText(entry.target), title: entry.details.title ?? '' });
  const reason = entry.kind === 'ban' ? entry.details.reason : null;
  return reason ? `${line}. ${t('adminReasonShown', { reason })}` : line;
}

/** Текстові рядки запитання для перегляду: текст, далі варіанти, прийнятні відповіді, пари, слова. */
export function questionLines(question: Question): string[] {
  const extra = ((): string[] => {
    switch (question.type) {
      case 'single':
      case 'multi':
      case 'poll':
        return question.options.map((option) => option.text);
      case 'text':
        return question.accepted;
      case 'order':
        return question.items.map((item) => item.text);
      case 'match':
        return question.pairs.map((pair) => `${pair.left.text} — ${pair.right.text}`);
      case 'chain':
        return question.words;
      case 'wordladder':
        return question.path;
      case 'sort':
        return [...question.categories.map((c) => c.text), ...question.words.map((w) => w.text)];
      case 'clues':
        return [...question.clues, ...question.accepted];
      case 'wall':
        return question.groups.flatMap((group) => [group.name, ...group.tiles.map((tile) => tile.text)]);
      case 'survey':
        return question.rows.map((row) => row.text);
      case 'bluff':
        return [...question.accepted, ...question.lies];
      case 'timedlist':
        return question.items.flatMap((item) => [item.text, ...item.accepted]);
      case 'letterwords':
        return question.set.kind === 'fixed' ? [question.set.letters] : [];
      default:
        return [];
    }
  })();
  return [question.text, ...extra.filter((line) => line !== '')];
}
