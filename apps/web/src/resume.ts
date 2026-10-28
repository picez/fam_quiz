import { answerKey, RESUME_POINTS_MAX, type ResumeLobby, type ResumeOption, type ResumeSetup } from '@quiz/shared';
import { roundLabel } from './format';
import { t } from './i18n';

/** Стан панелі «Продовжити попередню гру» (12r): розгорнута, стартовий раунд, текст поля кожного учасника (id → текст; немає — «0»). */
export interface ResumeDraft {
  open: boolean;
  roundIndex: number;
  points: Record<string, string>;
}

export const emptyDraft = (): ResumeDraft => ({ open: false, roundIndex: 0, points: {} });

/** Звичайні, нерозривні й вузькі пробіли всередині числа. */
const SPACES = /[\s   ]/g;

/** Текст поля → ціле в межах ±RESUME_POINTS_MAX; порожньо — 0; пробіли геть, «−» = «-»; інакше null. */
export function parsePoints(text: string): number | null {
  const clean = text.replace(SPACES, '').replace(/−/g, '-');
  if (clean === '') return 0;
  if (!/^-?\d+$/.test(clean)) return null;
  const value = Number(clean);
  return Math.abs(value) <= RESUME_POINTS_MAX ? value : null;
}

/** Раунд у межах раундів вікторини. */
const clampRound = (info: ResumeLobby, index: number): number => Math.max(0, Math.min(index, info.rounds.length - 1));

/**
 * Дані host:start: згорнута панель або раунд 1 і всі нулі → undefined (звичайний старт);
 * хибне поле учасника з info → 'invalid'; інакше { resume } з ненульовими балами учасників info і раундом у межах info.rounds.
 */
export function resumePayload(draft: ResumeDraft, info: ResumeLobby): { resume: ResumeSetup } | undefined | 'invalid' {
  if (!draft.open) return undefined;
  const points: Record<string, number> = {};
  for (const { id } of info.participants) {
    const value = parsePoints(draft.points[id] ?? '0');
    if (value === null) return 'invalid';
    if (value !== 0) points[id] = value;
  }
  const roundIndex = clampRound(info, draft.roundIndex);
  if (roundIndex === 0 && Object.keys(points).length === 0) return undefined;
  return { resume: { roundIndex, points } };
}

/** Заповнює з гри: раунд (обмежений раундами info), бали за answerKey(nickname); unmatched — нікнейми учасників info без пари (у них «0»). */
export function fillFromGame(draft: ResumeDraft, info: ResumeLobby, option: ResumeOption): { draft: ResumeDraft; unmatched: string[] } {
  const scores = new Map<string, number>();
  for (const row of option.scores) {
    const key = answerKey(row.nickname);
    if (!scores.has(key)) scores.set(key, row.score);
  }
  const points: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const participant of info.participants) {
    const score = scores.get(answerKey(participant.nickname));
    if (score === undefined) unmatched.push(participant.nickname);
    points[participant.id] = String(score ?? 0);
  }
  return { draft: { ...draft, roundIndex: clampRound(info, option.roundIndex), points }, unmatched };
}

/** «Раунд 3 · Гори»; порожня назва — roundLabel («Раунд 2», «Раунд 4 · Бліц»). */
export function resumeRoundText(info: ResumeLobby, index: number): string {
  const round = info.rounds[index];
  const number = t('roundN', { index: index + 1 });
  const label = round === undefined ? number : roundLabel(round.title, index, round.type);
  return label === number ? number : t('resumeRoundOption', { n: index + 1, title: label });
}
