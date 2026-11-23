import { allowedBuffs, allowedDebuffs, type Quiz } from '@quiz/shared';
import { t } from '../i18n';

/** Підсумки згортаних карток «Загального» (у `summary`). */
export function generalSummaries(quiz: Quiz): { powers: string; spares: string; duels: string } {
  const powers = allowedBuffs(quiz).length + allowedDebuffs(quiz).length;
  return {
    powers: powers > 0 ? t('summaryPowersOn', { count: powers }) : t('summaryOff'),
    spares: t('summarySpares', { count: quiz.spares?.length ?? 0 }),
    duels: quiz.duels ? t('summaryDuels', { count: quiz.duels.categories.length }) : t('summaryOff'),
  };
}
