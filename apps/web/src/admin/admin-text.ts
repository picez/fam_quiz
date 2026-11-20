import { BOT_PLAN_REASONS, type AdminLogEntry, type Question, type RemovalEffect } from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { KYIV_ZONE, timeText } from '../calendar/calendar-time';
import { formatDay, questionName } from '../format';
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

/** Причина збою плану бота словами; невідомий код (новіший сервер) — загальний текст. */
export function botPlanReasonText(reason: string | null): string {
  return reason !== null && (BOT_PLAN_REASONS as readonly string[]).includes(reason) ? t(`adminBotPlanReason_${reason}` as TextKey) : t('err_unknown');
}

/** Мить у Києві для розкладу бота: «20 листопада 2026, 19:00 (Київ)»; погана дата — порожньо. */
export function kyivWhenText(iso: string): string {
  if (Number.isNaN(Date.parse(iso))) return '';
  return t('adminBotPlanKyiv', { when: `${formatDay(iso)}, ${timeText(iso, KYIV_ZONE)}` });
}

/** Рядок журналу; для блокування з причиною — «. Причина: …»; для збою розкладу бота — причина словами. */
export function logLine(entry: AdminLogEntry): string {
  const when = entry.details.when === undefined ? '' : kyivWhenText(entry.details.when);
  const planReason = entry.kind === 'bot_plan_fail' ? botPlanReasonText(entry.details.reason ?? null) : '';
  const line = t(`adminLog_${entry.kind}` as TextKey, { admin: nickText(entry.admin), target: nickText(entry.target), title: entry.details.title ?? '', text: entry.details.text ?? '', code: entry.details.code ?? '', when, reason: planReason });
  const reason = entry.kind === 'ban' ? entry.details.reason : null;
  if (entry.kind === 'nickname_reset' && entry.details.text) return t('adminLogWas', { line, text: entry.details.text });
  return reason ? `${line}. ${t('adminReasonShown', { reason })}` : line;
}

/** Скільки триває гра: до години — хвилини (щонайменше 1; «щойно відкрито» каже сам AdminLive), далі години й хвилини. */
export function durationText(ms: number): string {
  const minutes = Math.max(1, Math.floor(Math.max(0, ms) / 60_000));
  if (minutes < 60) return t('adminLiveSpanMinutes', { count: minutes });
  return t('adminLiveSpanHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** Розмір у мегабайтах з одним знаком після коми (МБ = 1024 · 1024 байтів); менше 0,1 МБ — «< 0,1 МБ», не число — «—». */
export function bytesText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return t('adminMegabytes', { value: '0' });
  const megabytes = bytes / 1_048_576;
  if (megabytes < 0.1) return t('adminMegabytes', { value: `< ${decimalText(0.1, 1)}` });
  return t('adminMegabytes', { value: decimalText(megabytes, 1) });
}

/** Час роботи сервера: повні доби й години; першу годину — хвилини (свіжий сервер не «0 д 0 год»). */
export function uptimeText(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 3_600) return t('adminLiveSpanMinutes', { count: Math.floor(total / 60) });
  return t('adminHealthUptimeValue', { days: Math.floor(total / 86_400), hours: Math.floor((total % 86_400) / 3_600) });
}

/** Текстові рядки запитання для перегляду: текст (у «Вгадай слово» — «Вгадай слово: СЛОВО», 61), далі варіанти, прийнятні відповіді, пари, слова. */
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
  return [questionName(question), ...extra.filter((line) => line !== '')];
}
