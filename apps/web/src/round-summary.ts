import type { RoundBrief } from '@quiz/shared';
import { t } from './i18n';

function modifiers(brief: RoundBrief, lead: string[]): string {
  const parts = [...lead];
  if (brief.penalty) parts.push(t('summaryPenalty'));
  if (brief.streak !== null) {
    const { length, bonus } = brief.streak;
    parts.push(t(bonus.kind === 'percent' ? 'summaryStreakPercent' : 'summaryStreakFixed', { length, value: bonus.value }));
  }
  if (brief.multiplier > 1) parts.push(t('summaryMultiplier', { value: brief.multiplier }));
  return parts.join(' · ');
}

/** 2–4 рядки простою мовою: як цей раунд рахує бали. */
export function roundSummary(brief: RoundBrief): string[] {
  const lines: string[] = [];
  if (brief.type === 'final') {
    lines.push(t('summaryFinal'), t('summaryFinalScore'));
    return lines;
  }
  if (brief.type === 'classic') {
    lines.push(t('summaryClassic'));
    if (brief.speedBonus) lines.push(t('summarySpeed'));
    lines.push(modifiers(brief, []));
  } else if (brief.type === 'blitz') {
    const window = brief.answerWindow === null ? t('summaryBlitzNoWindow') : t('summaryBlitzWindow', { count: brief.answerWindow });
    lines.push(t('summaryBlitz'), t('summaryBlitzHow', { window }));
    const attempts = brief.attempts === null ? t('summaryAttemptsUnlimited') : t('summaryAttempts', { count: brief.attempts });
    lines.push(modifiers(brief, [attempts]));
  } else {
    lines.push(t('summaryBoard'));
    const phone = brief.answerModes.includes('phone');
    const voice = brief.answerModes.includes('voice');
    if (phone && voice) lines.push(t('summaryBoardMixed'));
    else if (phone) lines.push(t('summaryBoardPhone'));
    else if (voice) lines.push(t('summaryBoardVoice'));
    if (brief.blitzCells) lines.push(t('summaryBoardBlitz'));
    const lead: string[] = [];
    if (brief.marks) lead.push(t('summaryMarks'));
    if (brief.penaltyAll) lead.push(t('summaryPenaltyAll'));
    lines.push(modifiers(brief, lead));
  }
  return lines.filter((line) => line !== '');
}
