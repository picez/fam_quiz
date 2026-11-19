import type { AdminLogEntry, Question, RemovalEffect } from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { decimalText } from '../locales/grammar';
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
  const line = t(`adminLog_${entry.kind}` as TextKey, { admin: nickText(entry.admin), target: nickText(entry.target), title: entry.details.title ?? '', text: entry.details.text ?? '', code: entry.details.code ?? '' });
  const reason = entry.kind === 'ban' ? entry.details.reason : null;
  if (entry.kind === 'nickname_reset' && entry.details.text) return t('adminLogWas', { line, text: entry.details.text });
  return reason ? `${line}. ${t('adminReasonShown', { reason })}` : line;
}

/** Скільки триває гра: до хвилини — «щойно», до години — хвилини, далі години й хвилини. */
export function durationText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return t('adminLiveJustNow');
  if (minutes < 60) return t('adminLiveSpanMinutes', { count: minutes });
  return t('adminLiveSpanHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** Розмір у мегабайтах з одним знаком після коми (МБ = 1024 · 1024 байтів). */
export function bytesText(bytes: number): string {
  return t('adminMegabytes', { value: decimalText(bytes / 1_048_576, 1) });
}

/** Час роботи сервера: повні доби й години. */
export function uptimeText(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return t('adminHealthUptimeValue', { days: Math.floor(total / 86_400), hours: Math.floor((total % 86_400) / 3_600) });
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
      case 'drawing':
        return question.accepted;
      case 'order':
        return question.items.map((item) => item.text);
      case 'match':
        return question.pairs.map((pair) => `${pair.left.text} — ${pair.right.text}`);
      case 'chain':
        return question.words;
      case 'wordladder':
        return question.path;
      case 'wordle':
        return [question.word];
      case 'sort':
        return [...question.categories.map((c) => c.text), ...question.words.map((w) => w.text)];
      case 'clues':
        return [...question.clues, ...question.accepted];
      case 'melody':
      case 'videoclip':
        return question.accepted;
      case 'wall':
        return question.groups.flatMap((group) => [group.name, ...group.tiles.map((tile) => tile.text)]);
      case 'survey':
        return question.rows.map((row) => row.text);
      case 'bluff':
        return [...question.accepted, ...question.lies];
      case 'spy':
        return [...question.accepted, ...(question.spyHint ? [question.spyHint] : []), ...(question.spyWord ? [question.spyWord] : [])];
      case 'timedlist':
        return question.items.flatMap((item) => [item.text, ...item.accepted]);
      case 'moreless':
        return question.pairs.flatMap((pair) => [pair.prompt, pair.a.text, pair.a.value, pair.b.text, pair.b.value]);
      case 'letterwords':
        return question.set.kind === 'fixed' ? [question.set.letters] : [];
      case 'crossword':
        return [...question.entries.flatMap((entry) => [entry.answer, entry.clue]), question.key ?? ''];
      default:
        return [];
    }
  })();
  return [question.text, ...extra.filter((line) => line !== '')];
}
